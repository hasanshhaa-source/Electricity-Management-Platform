import { NextRequest, NextResponse } from 'next/server';
import { requireAdmin } from '@/services/auth/authService';
import { adminAssignFlat } from '@/services/tenant/tenantService';
import { assignFlatSchema } from '@/lib/validation/tenant';
import { logAudit } from '@/services/audit/auditService';
import { successResponse, errorResponse } from '@/lib/utils/api';

export async function POST(req: NextRequest) {
  let admin;
  try { admin = await requireAdmin(); } catch { return NextResponse.json(errorResponse('Forbidden'), { status: 403 }); }
  const body = await req.json();
  const parsed = assignFlatSchema.safeParse(body);
  if (!parsed.success) return NextResponse.json(errorResponse(parsed.error.issues[0].message), { status: 400 });

  const result = await adminAssignFlat(parsed.data, admin.id);
  if (result.error) return NextResponse.json(errorResponse(result.error), { status: 400 });

  await logAudit({
    entity_type: 'tenancies',
    action: 'TENANCY_APPROVE',
    actor_id: admin.id,
    actor_role: 'admin',
    new_data: { user_id: parsed.data.user_id, flat_id: parsed.data.flat_id, start_date: parsed.data.start_date },
  });
  return NextResponse.json(successResponse(result.data), { status: 201 });
}
