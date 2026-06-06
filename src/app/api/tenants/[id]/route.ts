import { NextRequest, NextResponse } from 'next/server';
import { requireAdmin } from '@/services/auth/authService';
import { getTenantById, updateTenantProfile } from '@/services/tenant/tenantService';
import { tenantProfileSchema } from '@/lib/validation/tenant';
import { logAudit } from '@/services/audit/auditService';
import { successResponse, errorResponse } from '@/lib/utils/api';

type Params = { params: Promise<{ id: string }> };

export async function GET(_req: NextRequest, { params }: Params) {
  try { await requireAdmin(); } catch { return NextResponse.json(errorResponse('Forbidden'), { status: 403 }); }
  const { id } = await params;
  const result = await getTenantById(id);
  if (result.error) return NextResponse.json(errorResponse(result.error), { status: 404 });
  return NextResponse.json(successResponse(result.data));
}

export async function PUT(req: NextRequest, { params }: Params) {
  let admin;
  try { admin = await requireAdmin(); } catch { return NextResponse.json(errorResponse('Forbidden'), { status: 403 }); }
  const { id } = await params;
  const body = await req.json();
  const parsed = tenantProfileSchema.safeParse(body);
  if (!parsed.success) return NextResponse.json(errorResponse(parsed.error.issues[0].message), { status: 400 });

  const result = await updateTenantProfile(id, parsed.data);
  if (result.error) return NextResponse.json(errorResponse(result.error), { status: 400 });

  await logAudit({ entity_type: 'users', entity_id: id, action: 'UPDATE', actor_id: admin.id, actor_role: 'admin', new_data: parsed.data as any });
  return NextResponse.json(successResponse(result.data));
}
