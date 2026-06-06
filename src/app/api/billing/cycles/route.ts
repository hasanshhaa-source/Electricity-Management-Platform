import { NextRequest, NextResponse } from 'next/server';
import { requireAdmin } from '@/services/auth/authService';
import { getCycles, createCycle } from '@/services/billing/cycleService';
import { cycleSchema } from '@/lib/validation/billing';
import { logAudit } from '@/services/audit/auditService';
import { successResponse, errorResponse } from '@/lib/utils/api';

export async function GET(req: NextRequest) {
  let admin;
  try { admin = await requireAdmin(); } catch { return NextResponse.json(errorResponse('Forbidden'), { status: 403 }); }

  const buildingId = req.nextUrl.searchParams.get('building_id') ?? undefined;
  const result = await getCycles(buildingId);
  if (result.error) return NextResponse.json(errorResponse(result.error), { status: 400 });
  return NextResponse.json(successResponse(result.data));
}

export async function POST(req: NextRequest) {
  let admin;
  try { admin = await requireAdmin(); } catch { return NextResponse.json(errorResponse('Forbidden'), { status: 403 }); }

  const body = await req.json();
  const parsed = cycleSchema.safeParse(body);
  if (!parsed.success) return NextResponse.json(errorResponse(parsed.error.issues[0].message), { status: 400 });

  const result = await createCycle(parsed.data, admin.id);
  if (result.error) return NextResponse.json(errorResponse(result.error), { status: 400 });

  await logAudit({ entity_type: 'billing_cycles', entity_id: result.data!.id, action: 'CYCLE_CREATED', actor_id: admin.id, actor_role: 'admin', new_data: parsed.data as any });
  return NextResponse.json(successResponse(result.data), { status: 201 });
}
