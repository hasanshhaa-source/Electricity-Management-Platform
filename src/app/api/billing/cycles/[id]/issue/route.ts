import { NextRequest, NextResponse } from 'next/server';
import { requireAdmin } from '@/services/auth/authService';
import { issueBillsForCycle } from '@/services/billing/billingCalculationService';
import { logAudit } from '@/services/audit/auditService';
import { successResponse, errorResponse } from '@/lib/utils/api';
import { createClient } from '@/lib/supabase/server';
import { notifyBillIssued } from '@/services/notification/notificationService';
import { getNotificationSettings } from '@/services/notification/notificationSettings';

type Params = { params: Promise<{ id: string }> };

export async function POST(_req: NextRequest, { params }: Params) {
  let admin;
  try { admin = await requireAdmin(); } catch { return NextResponse.json(errorResponse('Forbidden'), { status: 403 }); }

  const { id } = await params;
  const result = await issueBillsForCycle(id, admin.id);
  if (result.error) return NextResponse.json(errorResponse(result.error), { status: 400 });

  await logAudit({
    entity_type: 'billing_cycles',
    entity_id:   id,
    action:      'BILLS_ISSUED',
    actor_id:    admin.id,
    actor_role:  'admin',
    new_data:    { bills_issued: result.data!.count },
  });

  // Fire bill_generated email notifications (non-blocking)
  sendBillNotifications(id).catch(err =>
    console.error('[notify] bill_issued background error:', err),
  );

  return NextResponse.json(successResponse(result.data));
}

async function sendBillNotifications(cycleId: string) {
  const settings = await getNotificationSettings();
  if (!settings.bill_issued_enabled) return;

  const supabase = await createClient();

  const { data: bills } = await supabase
    .from('flat_bills')
    .select(`
      id, total_due, due_date,
      billing_cycle:billing_cycles(period_year, period_month,
        building:buildings(name, currency)),
      tenancy:tenancies(
        user:users!user_id(id, email, full_name)
      ),
      flat:flats(flat_number)
    `)
    .eq('billing_cycle_id', cycleId)
    .eq('status', 'unpaid')
    .eq('is_current_version', true);

  for (const bill of bills ?? []) {
    const user     = (bill as any).tenancy?.user;
    const cycle    = (bill as any).billing_cycle;
    const flat     = (bill as any).flat;
    const building = cycle?.building;

    if (!user?.email || !cycle || !flat) continue;

    await notifyBillIssued({
      userId:       user.id,
      tenantEmail:  user.email,
      tenantName:   user.full_name,
      flatNumber:   flat.flat_number,
      buildingName: building?.name ?? '—',
      periodYear:   cycle.period_year,
      periodMonth:  cycle.period_month,
      totalDue:     Number(bill.total_due),
      dueDate:      bill.due_date,
      currency:     building?.currency ?? 'SAR',
      billId:       bill.id,
    });
  }
}
