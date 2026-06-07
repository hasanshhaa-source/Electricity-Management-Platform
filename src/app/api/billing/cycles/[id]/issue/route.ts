import { NextRequest, NextResponse } from 'next/server';
import { requireAdmin } from '@/services/auth/authService';
import { issueBillsForCycle } from '@/services/billing/billingCalculationService';
import { logAudit } from '@/services/audit/auditService';
import { successResponse, errorResponse } from '@/lib/utils/api';

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

  return NextResponse.json(successResponse(result.data));
}
