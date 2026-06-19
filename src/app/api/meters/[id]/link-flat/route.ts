import { NextRequest, NextResponse } from 'next/server';
import { requireAdmin } from '@/services/auth/authService';
import { setIndividualMeterFlat } from '@/services/meter/meterService';
import { linkFlatSchema } from '@/lib/validation/meter';
import { logAudit } from '@/services/audit/auditService';
import { successResponse, errorResponse } from '@/lib/utils/api';

type Params = { params: Promise<{ id: string }> };

export async function PUT(req: NextRequest, { params }: Params) {
  let admin;
  try { admin = await requireAdmin(); } catch { return NextResponse.json(errorResponse('Forbidden'), { status: 403 }); }
  const { id } = await params;
  const body = await req.json();
  const parsed = linkFlatSchema.safeParse(body);
  if (!parsed.success) return NextResponse.json(errorResponse(parsed.error.issues[0].message), { status: 400 });

  const result = await setIndividualMeterFlat(id, parsed.data.flat_id);
  if (result.error) return NextResponse.json(errorResponse(result.error), { status: 400 });

  await logAudit({ entity_type: 'flat_meter_assignments', entity_id: id, action: 'UPDATE', actor_id: admin.id, actor_role: 'admin', new_data: { flat_id: parsed.data.flat_id } });
  return NextResponse.json(successResponse(result.data));
}
