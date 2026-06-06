import { NextRequest, NextResponse } from 'next/server';
import { requireAdmin } from '@/services/auth/authService';
import { getBuildings, createBuilding } from '@/services/building/buildingService';
import { buildingSchema } from '@/lib/validation/building';
import { logAudit } from '@/services/audit/auditService';
import { successResponse, errorResponse } from '@/lib/utils/api';

export async function GET() {
  let admin;
  try {
    admin = await requireAdmin();
  } catch {
    return NextResponse.json(errorResponse('Forbidden'), { status: 403 });
  }

  const result = await getBuildings();
  if (result.error) return NextResponse.json(errorResponse(result.error), { status: 500 });
  return NextResponse.json(successResponse(result.data));
}

export async function POST(request: NextRequest) {
  let admin;
  try {
    admin = await requireAdmin();
  } catch {
    return NextResponse.json(errorResponse('Forbidden'), { status: 403 });
  }

  const body = await request.json();
  const parsed = buildingSchema.safeParse(body);
  if (!parsed.success) {
    return NextResponse.json(errorResponse(parsed.error.issues[0].message), { status: 400 });
  }

  const result = await createBuilding(parsed.data, admin.id);
  if (result.error) return NextResponse.json(errorResponse(result.error), { status: 500 });

  await logAudit({
    entity_type: 'buildings',
    entity_id: result.data!.id,
    action: 'INSERT',
    actor_id: admin.id,
    actor_role: 'admin',
    new_data: result.data as unknown as Record<string, unknown>,
  });

  return NextResponse.json(successResponse(result.data), { status: 201 });
}
