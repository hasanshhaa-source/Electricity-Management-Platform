import { NextRequest, NextResponse } from 'next/server';
import { requireAdmin } from '@/services/auth/authService';
import { getCycleById, updateCycleStatus } from '@/services/billing/cycleService';
import { getReadingRowsForCycle } from '@/services/billing/readingService';
import { cycleStatusSchema } from '@/lib/validation/billing';
import { logAudit } from '@/services/audit/auditService';
import { successResponse, errorResponse } from '@/lib/utils/api';

type Params = { params: Promise<{ id: string }> };

export async function GET(_req: NextRequest, { params }: Params) {
  let admin;
  try { admin = await requireAdmin(); } catch { return NextResponse.json(errorResponse('Forbidden'), { status: 403 }); }

  const { id } = await params;
  const result = await getCycleById(id);
  if (result.error || !result.data) return NextResponse.json(errorResponse('Cycle not found'), { status: 404 });
  return NextResponse.json(successResponse(result.data));
}

export async function PATCH(req: NextRequest, { params }: Params) {
  let admin;
  try { admin = await requireAdmin(); } catch { return NextResponse.json(errorResponse('Forbidden'), { status: 403 }); }

  const { id } = await params;
  const body = await req.json();
  const parsed = cycleStatusSchema.safeParse(body);
  if (!parsed.success) return NextResponse.json(errorResponse(parsed.error.issues[0].message), { status: 400 });

  const cycleResult = await getCycleById(id);
  if (!cycleResult.data) return NextResponse.json(errorResponse('Cycle not found'), { status: 404 });
  const cycle = cycleResult.data;

  // Warn if advancing to readings_collected with missing readings (but don't block)
  if (parsed.data.status === 'readings_collected') {
    const rows = await getReadingRowsForCycle(cycle.building_id, cycle.period_year, cycle.period_month, id);
    const missing = (rows.data ?? []).filter((r) => !r.currentReading).length;
    if (missing > 0) {
      // Include warning in response but proceed
    }
  }

  const result = await updateCycleStatus(id, parsed.data.status, admin.id, parsed.data.notes);
  if (result.error) return NextResponse.json(errorResponse(result.error), { status: 400 });

  await logAudit({ entity_type: 'billing_cycles', entity_id: id, action: 'CYCLE_STATUS_CHANGED', actor_id: admin.id, actor_role: 'admin', old_data: { status: cycle.status }, new_data: { status: parsed.data.status } });
  return NextResponse.json(successResponse(result.data));
}
