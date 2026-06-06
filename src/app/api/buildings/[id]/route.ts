import { NextRequest, NextResponse } from 'next/server';
import { requireAdmin } from '@/services/auth/authService';
import { getBuildingById, updateBuilding, toggleBuildingActive, deleteBuilding } from '@/services/building/buildingService';
import { buildingSchema } from '@/lib/validation/building';
import { logAudit } from '@/services/audit/auditService';
import { successResponse, errorResponse } from '@/lib/utils/api';

type Params = { params: Promise<{ id: string }> };

export async function GET(_req: NextRequest, { params }: Params) {
  try { await requireAdmin(); } catch { return NextResponse.json(errorResponse('Forbidden'), { status: 403 }); }
  const { id } = await params;
  const result = await getBuildingById(id);
  if (result.error) return NextResponse.json(errorResponse(result.error), { status: 404 });
  return NextResponse.json(successResponse(result.data));
}

export async function PUT(req: NextRequest, { params }: Params) {
  let admin;
  try { admin = await requireAdmin(); } catch { return NextResponse.json(errorResponse('Forbidden'), { status: 403 }); }
  const { id } = await params;
  const body = await req.json();
  const parsed = buildingSchema.partial().safeParse(body);
  if (!parsed.success) return NextResponse.json(errorResponse(parsed.error.issues[0].message), { status: 400 });

  const old = await getBuildingById(id);
  const result = await updateBuilding(id, parsed.data);
  if (result.error) return NextResponse.json(errorResponse(result.error), { status: 400 });

  await logAudit({ entity_type: 'buildings', entity_id: id, action: 'UPDATE', actor_id: admin.id, actor_role: 'admin', old_data: old.data as any, new_data: result.data as any });
  return NextResponse.json(successResponse(result.data));
}

export async function PATCH(req: NextRequest, { params }: Params) {
  let admin;
  try { admin = await requireAdmin(); } catch { return NextResponse.json(errorResponse('Forbidden'), { status: 403 }); }
  const { id } = await params;
  const { is_active } = await req.json();
  const result = await toggleBuildingActive(id, Boolean(is_active));
  if (result.error) return NextResponse.json(errorResponse(result.error), { status: 400 });
  await logAudit({ entity_type: 'buildings', entity_id: id, action: 'UPDATE', actor_id: admin.id, actor_role: 'admin', new_data: { is_active } });
  return NextResponse.json(successResponse(result.data));
}

export async function DELETE(_req: NextRequest, { params }: Params) {
  let admin;
  try { admin = await requireAdmin(); } catch { return NextResponse.json(errorResponse('Forbidden'), { status: 403 }); }
  const { id } = await params;
  const result = await deleteBuilding(id);
  if (result.error) return NextResponse.json(errorResponse(result.error), { status: 400 });
  await logAudit({ entity_type: 'buildings', entity_id: id, action: 'SOFT_DELETE', actor_id: admin.id, actor_role: 'admin' });
  return NextResponse.json(successResponse(null));
}
