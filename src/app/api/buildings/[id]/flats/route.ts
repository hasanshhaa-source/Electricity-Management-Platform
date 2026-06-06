import { NextRequest, NextResponse } from 'next/server';
import { requireAdmin } from '@/services/auth/authService';
import { getFlatsByBuilding, createFlat } from '@/services/building/buildingService';
import { flatSchema } from '@/lib/validation/building';
import { logAudit } from '@/services/audit/auditService';
import { successResponse, errorResponse } from '@/lib/utils/api';

type Params = { params: Promise<{ id: string }> };

export async function GET(_req: NextRequest, { params }: Params) {
  try { await requireAdmin(); } catch { return NextResponse.json(errorResponse('Forbidden'), { status: 403 }); }
  const { id } = await params;
  const result = await getFlatsByBuilding(id, true);
  if (result.error) return NextResponse.json(errorResponse(result.error), { status: 500 });
  return NextResponse.json(successResponse(result.data));
}

export async function POST(req: NextRequest, { params }: Params) {
  let admin;
  try { admin = await requireAdmin(); } catch { return NextResponse.json(errorResponse('Forbidden'), { status: 403 }); }
  const { id } = await params;
  const body = await req.json();
  const parsed = flatSchema.safeParse({ ...body, building_id: id });
  if (!parsed.success) return NextResponse.json(errorResponse(parsed.error.issues[0].message), { status: 400 });

  const result = await createFlat(parsed.data);
  if (result.error) return NextResponse.json(errorResponse(result.error), { status: 400 });

  await logAudit({ entity_type: 'flats', entity_id: result.data!.id, action: 'INSERT', actor_id: admin.id, actor_role: 'admin', new_data: result.data as any });
  return NextResponse.json(successResponse(result.data), { status: 201 });
}
