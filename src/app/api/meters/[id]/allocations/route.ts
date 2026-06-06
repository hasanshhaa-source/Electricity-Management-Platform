import { NextRequest, NextResponse } from 'next/server';
import { requireAdmin } from '@/services/auth/authService';
import { getAllocationsForMeter, setMeterAllocations } from '@/services/meter/meterService';
import { allocationsSetSchema } from '@/lib/validation/meter';
import { logAudit } from '@/services/audit/auditService';
import { successResponse, errorResponse } from '@/lib/utils/api';

type Params = { params: Promise<{ id: string }> };

export async function GET(_req: NextRequest, { params }: Params) {
  try { await requireAdmin(); } catch { return NextResponse.json(errorResponse('Forbidden'), { status: 403 }); }
  const { id } = await params;
  const result = await getAllocationsForMeter(id);
  if (result.error) return NextResponse.json(errorResponse(result.error), { status: 500 });
  return NextResponse.json(successResponse(result.data));
}

export async function PUT(req: NextRequest, { params }: Params) {
  let admin;
  try { admin = await requireAdmin(); } catch { return NextResponse.json(errorResponse('Forbidden'), { status: 403 }); }
  const { id } = await params;
  const body = await req.json();
  const parsed = allocationsSetSchema.safeParse(body);
  if (!parsed.success) return NextResponse.json(errorResponse(parsed.error.issues[0].message), { status: 400 });

  const result = await setMeterAllocations(id, parsed.data);
  if (result.error) return NextResponse.json(errorResponse(result.error), { status: 400 });

  await logAudit({ entity_type: 'flat_meter_assignments', entity_id: id, action: 'UPDATE', actor_id: admin.id, actor_role: 'admin', new_data: { allocations: parsed.data.allocations } });
  return NextResponse.json(successResponse(result.data));
}
