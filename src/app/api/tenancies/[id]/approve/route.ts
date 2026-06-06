import { NextRequest, NextResponse } from 'next/server';
import { requireAdmin } from '@/services/auth/authService';
import { approveTenancy } from '@/services/tenant/tenancyService';
import { tenancyApproveSchema } from '@/lib/validation/tenancy';
import { logAudit } from '@/services/audit/auditService';
import { successResponse, errorResponse } from '@/lib/utils/api';

export async function POST(
  request: NextRequest,
  { params }: { params: Promise<{ id: string }> }
) {
  let admin;
  try {
    admin = await requireAdmin();
  } catch {
    return NextResponse.json(errorResponse('Forbidden'), { status: 403 });
  }

  const { id } = await params;
  const body = await request.json();
  const parsed = tenancyApproveSchema.safeParse({ ...body, tenancy_id: id });

  if (!parsed.success) {
    return NextResponse.json(errorResponse(parsed.error.issues[0].message), { status: 400 });
  }

  const result = await approveTenancy(parsed.data, admin.id);
  if (result.error) return NextResponse.json(errorResponse(result.error), { status: 400 });

  await logAudit({
    entity_type: 'tenancies',
    entity_id: id,
    action: 'TENANCY_APPROVE',
    actor_id: admin.id,
    actor_role: 'admin',
    new_data: result.data as unknown as Record<string, unknown>,
  });

  return NextResponse.json(successResponse(result.data));
}
