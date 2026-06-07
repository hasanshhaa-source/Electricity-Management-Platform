import { NextRequest, NextResponse } from 'next/server';
import { requireAdmin } from '@/services/auth/authService';
import { reversePayment } from '@/services/billing/paymentService';
import { logAudit } from '@/services/audit/auditService';
import { successResponse, errorResponse } from '@/lib/utils/api';

type Params = { params: Promise<{ id: string }> };

export async function DELETE(_req: NextRequest, { params }: Params) {
  let admin;
  try { admin = await requireAdmin(); } catch { return NextResponse.json(errorResponse('Forbidden'), { status: 403 }); }

  const { id } = await params;
  const result = await reversePayment(id, admin.id);
  if (result.error) return NextResponse.json(errorResponse(result.error), { status: 400 });

  await logAudit({
    entity_type: 'payments',
    entity_id:   id as any,
    action:      'PAYMENT_REVERSE',
    actor_id:    admin.id,
    actor_role:  'admin',
  });

  return NextResponse.json(successResponse(result.data));
}
