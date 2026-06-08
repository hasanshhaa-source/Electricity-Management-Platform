import { NextRequest, NextResponse } from 'next/server';
import { z } from 'zod';
import { requireAdmin } from '@/services/auth/authService';
import { logAudit } from '@/services/audit/auditService';
import { successResponse, errorResponse } from '@/lib/utils/api';
import { createClient } from '@/lib/supabase/server';

type Params = { params: Promise<{ id: string }> };

const adjustSchema = z.object({
  manual_adjustment_amount: z.number(),
  manual_adjustment_note:   z.string().min(1, 'A note is required for manual adjustments').max(500),
});

export async function GET(_req: NextRequest, { params }: Params) {
  try { await requireAdmin(); } catch { return NextResponse.json(errorResponse('Forbidden'), { status: 403 }); }

  const { id } = await params;
  const supabase = await createClient();
  const { data, error } = await supabase
    .from('flat_bills')
    .select(`
      *,
      flat:flats(flat_number, building:buildings(name, currency)),
      billing_cycle:billing_cycles(period_year, period_month)
    `)
    .eq('id', id)
    .eq('is_current_version', true)
    .single();

  if (error || !data) return NextResponse.json(errorResponse('Bill not found'), { status: 404 });
  return NextResponse.json(successResponse(data));
}

export async function PATCH(req: NextRequest, { params }: Params) {
  let admin;
  try { admin = await requireAdmin(); } catch { return NextResponse.json(errorResponse('Forbidden'), { status: 403 }); }

  const { id } = await params;
  const supabase = await createClient();

  const { data: bill, error: fetchErr } = await supabase
    .from('flat_bills')
    .select('*')
    .eq('id', id)
    .eq('is_current_version', true)
    .single();

  if (fetchErr || !bill) return NextResponse.json(errorResponse('Bill not found'), { status: 404 });

  if (!['draft', 'unpaid', 'partial'].includes(bill.status)) {
    return NextResponse.json(
      errorResponse('Manual adjustments can only be applied to draft, unpaid, or partially paid bills'),
      { status: 422 },
    );
  }

  const body   = await req.json().catch(() => ({}));
  const parsed = adjustSchema.safeParse(body);
  if (!parsed.success) {
    return NextResponse.json(errorResponse(parsed.error.issues[0]?.message ?? 'Invalid input'), { status: 422 });
  }

  const { manual_adjustment_amount, manual_adjustment_note } = parsed.data;

  // Negative adjustments (credits) allowed but require explicit note
  // Recalculate total_due with the new manual adjustment
  const baseDue  = Number(bill.current_charges) + Number(bill.previous_balance) + Number(bill.difference_adjustment ?? 0);
  const newTotal = Math.max(0, baseDue + manual_adjustment_amount);

  const { data: updated, error: updateErr } = await supabase
    .from('flat_bills')
    .update({
      manual_adjustment_amount,
      manual_adjustment_note,
      manual_adjustment_by: admin.id,
      manual_adjustment_at: new Date().toISOString(),
      total_due:            newTotal,
      updated_at:           new Date().toISOString(),
    })
    .eq('id', id)
    .select()
    .single();

  if (updateErr) return NextResponse.json(errorResponse(updateErr.message), { status: 500 });

  await logAudit({
    entity_type: 'flat_bills',
    entity_id:   id,
    action:      'BILL_MANUAL_ADJUSTMENT',
    actor_id:    admin.id,
    actor_role:  'admin',
    old_data:    { total_due: bill.total_due, manual_adjustment_amount: bill.manual_adjustment_amount },
    new_data:    { total_due: newTotal, manual_adjustment_amount, manual_adjustment_note },
  });

  return NextResponse.json(successResponse(updated));
}
