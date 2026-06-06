import { NextRequest, NextResponse } from 'next/server';
import { requireAdmin } from '@/services/auth/authService';
import { getAllTenants, createTenantByAdmin } from '@/services/tenant/tenantService';
import { createTenantSchema } from '@/lib/validation/tenant';
import { logAudit } from '@/services/audit/auditService';
import { successResponse, errorResponse } from '@/lib/utils/api';

export async function GET() {
  try { await requireAdmin(); } catch { return NextResponse.json(errorResponse('Forbidden'), { status: 403 }); }
  const result = await getAllTenants();
  if (result.error) return NextResponse.json(errorResponse(result.error), { status: 500 });
  return NextResponse.json(successResponse(result.data));
}

export async function POST(req: NextRequest) {
  let admin;
  try { admin = await requireAdmin(); } catch { return NextResponse.json(errorResponse('Forbidden'), { status: 403 }); }
  const body = await req.json();
  const parsed = createTenantSchema.safeParse(body);
  if (!parsed.success) return NextResponse.json(errorResponse(parsed.error.issues[0].message), { status: 400 });

  const result = await createTenantByAdmin(parsed.data);
  if (result.error) return NextResponse.json(errorResponse(result.error), { status: 400 });

  await logAudit({ entity_type: 'users', entity_id: result.data!.id, action: 'INSERT', actor_id: admin.id, actor_role: 'admin', new_data: { email: result.data!.email, role: 'tenant' } });
  return NextResponse.json(successResponse(result.data), { status: 201 });
}
