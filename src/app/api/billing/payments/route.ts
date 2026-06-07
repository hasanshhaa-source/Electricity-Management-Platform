import { NextRequest, NextResponse } from 'next/server';
import { requireAdmin } from '@/services/auth/authService';
import { recordPayment, getPaymentsForBill } from '@/services/billing/paymentService';
import { paymentSchema } from '@/lib/validation/billing';
import { logAudit } from '@/services/audit/auditService';
import { successResponse, errorResponse } from '@/lib/utils/api';

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

  return NextResponse.json(successResponse(result.data), { status: 201 });
}
