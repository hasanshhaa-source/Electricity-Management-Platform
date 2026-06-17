import { NextRequest, NextResponse } from 'next/server';
import { requireAdmin } from '@/services/auth/authService';
import { recordPayment, getPaymentsForBill } from '@/services/billing/paymentService';
import { paymentSchema } from '@/lib/validation/billing';
import { logAudit } from '@/services/audit/auditService';
import { successResponse, errorResponse } from '@/lib/utils/api';
import { createClient } from '@/lib/supabase/server';
import { notifyPaymentConfirmed } from '@/services/notification/notificationService';
import { getNotificationSettings } from '@/services/notification/notificationSettings';
import { getSystemSettings } from '@/services/settings/systemSettingsService';

export async function GET(req: NextRequest) {
  try { await requireAdmin(); } catch { return NextResponse.json(errorResponse('Forbidden'), { status: 403 }); }

  const billId = req.nextUrl.searchParams.get('bill_id');
  if (!billId) return NextResponse.json(errorResponse('bill_id is required'), { status: 400 });

  const result = await getPaymentsForBill(billId);
  if (result.error) return NextResponse.json(errorResponse(result.error), { status: 400 });
  return NextResponse.json(successResponse(result.data));
}

export async function POST(req: NextRequest) {
  let admin;
  try { admin = await requireAdmin(); } catch { return NextResponse.json(errorResponse('Forbidden'), { status: 403 }); }

  const body   = await req.json().catch(() => ({}));
  const parsed = paymentSchema.safeParse(body);
  if (!parsed.success) {
    return NextResponse.json(
      errorResponse(parsed.error.issues[0]?.message ?? 'Invalid input'),
      { status: 422 },
    );
  }

  const sysSettings = await getSystemSettings();

  // Enforce payment reference requirement
  if (sysSettings.require_payment_reference && !parsed.data.reference_no?.trim()) {
    return NextResponse.json(errorResponse('Payment reference number is required'), { status: 422 });
  }

  // Enforce allowed payment methods
  if (!sysSettings.allowed_payment_methods.includes(parsed.data.payment_method)) {
    return NextResponse.json(errorResponse(`Payment method '${parsed.data.payment_method}' is not allowed`), { status: 422 });
  }

  // Enforce partial payment restriction
  if (!sysSettings.allow_partial_payments) {
    const supabase = await createClient();
    const { data: bill } = await supabase
      .from('flat_bills')
      .select('outstanding_balance')
      .eq('id', parsed.data.bill_id)
      .single();
    if (bill && Math.abs(parsed.data.amount - Number(bill.outstanding_balance)) > 0.01) {
      return NextResponse.json(
        errorResponse(`Partial payments are not allowed. Full outstanding amount is ${bill.outstanding_balance}`),
        { status: 422 },
      );
    }
  }

  const result = await recordPayment(parsed.data, admin.id);
  if (result.error) return NextResponse.json(errorResponse(result.error), { status: 400 });

  await logAudit({
    entity_type: 'payments',
    entity_id:   result.data!.payment.id as any,
    action:      'PAYMENT_RECORD',
    actor_id:    admin.id,
    actor_role:  'admin',
    new_data: {
      bill_id:        parsed.data.bill_id,
      amount:         parsed.data.amount,
      payment_method: parsed.data.payment_method,
    },
  });

  // Fire payment_confirmed email (non-blocking)
  sendPaymentConfirmation(parsed.data.bill_id, parsed.data.amount).catch(err =>
    console.error('[notify] payment_confirmed background error:', err),
  );

  return NextResponse.json(successResponse(result.data), { status: 201 });
}

async function sendPaymentConfirmation(billId: string, amount: number) {
  const settings = await getNotificationSettings();
  if (!settings.payment_confirmed_enabled) return;

  const supabase = await createClient();

  const { data: bill } = await supabase
    .from('flat_bills')
    .select(`
      id, outstanding_balance,
      billing_cycle:billing_cycles(period_year, period_month,
        building:buildings(name, currency)),
      tenancy:tenancies(user:users!user_id(id, email, full_name)),
      flat:flats(flat_number)
    `)
    .eq('id', billId)
    .single();

  if (!bill) return;

  const user     = (bill as any).tenancy?.user;
  const cycle    = (bill as any).billing_cycle;
  const flat     = (bill as any).flat;
  const building = cycle?.building;

  if (!user?.email || !cycle || !flat) return;

  await notifyPaymentConfirmed({
    userId:       user.id,
    tenantEmail:  user.email,
    tenantName:   user.full_name,
    flatNumber:   flat.flat_number,
    buildingName: building?.name ?? '—',
    periodYear:   cycle.period_year,
    periodMonth:  cycle.period_month,
    amount,
    outstanding:  Number(bill.outstanding_balance),
    currency:     building?.currency ?? 'SAR',
    billId:       bill.id,
  });
}
