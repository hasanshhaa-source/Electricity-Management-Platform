import { NextRequest, NextResponse } from 'next/server';
import { requireAdmin } from '@/services/auth/authService';
import { getMeterById, updateMeter, deleteMeter, changeMeterType } from '@/services/meter/meterService';
import { meterSchema } from '@/lib/validation/meter';
import { logAudit } from '@/services/audit/auditService';
import { successResponse, errorResponse } from '@/lib/utils/api';

type Params = { params: Promise<{ id: string }> };

export async function GET(_req: NextRequest, { params }: Params) {
  try { await requireAdmin(); } catch { return NextResponse.json(errorResponse('Forbidden'), { status: 403 }); }
  const { id } = await params;
  const result = await getMeterById(id);
  if (result.error) return NextResponse.json(errorResponse(result.error), { status: 404 });
  return NextResponse.json(successResponse(result.data));
}

export async function PUT(req: NextRequest, { params }: Params) {
  let admin;
  try { admin = await requireAdmin(); } catch { return NextResponse.json(errorResponse('Forbidden'), { status: 403 }); }
  const { id } = await params;
  const body = await req.json();
  const parsed = meterSchema.partial().safeParse(body);
  if (!parsed.success) return NextResponse.json(errorResponse(parsed.error.issues[0].message), { status: 400 });

  // A meter_type change requires closing out existing flat assignments, so it's
  // routed through changeMeterType rather than the generic field update.
  const { meter_type, ...rest } = parsed.data;

  if (meter_type) {
    const typeResult = await changeMeterType(id, meter_type);
    if (typeResult.error) return NextResponse.json(errorResponse(typeResult.error), { status: 400 });
    await logAudit({ entity_type: 'meters', entity_id: id, action: 'UPDATE', actor_id: admin.id, actor_role: 'admin', new_data: { meter_type } as any });
  }

  const result = Object.keys(rest).length > 0
    ? await updateMeter(id, rest)
    : await getMeterById(id);
  if (result.error) return NextResponse.json(errorResponse(result.error), { status: 400 });

  if (Object.keys(rest).length > 0) {
    await logAudit({ entity_type: 'meters', entity_id: id, action: 'UPDATE', actor_id: admin.id, actor_role: 'admin', new_data: result.data as any });
  }
  return NextResponse.json(successResponse(result.data));
}

export async function DELETE(_req: NextRequest, { params }: Params) {
  let admin;
  try { admin = await requireAdmin(); } catch { return NextResponse.json(errorResponse('Forbidden'), { status: 403 }); }
  const { id } = await params;
  const result = await deleteMeter(id);
  if (result.error) return NextResponse.json(errorResponse(result.error), { status: 400 });
  await logAudit({ entity_type: 'meters', entity_id: id, action: 'SOFT_DELETE', actor_id: admin.id, actor_role: 'admin' });
  return NextResponse.json(successResponse(null));
}
