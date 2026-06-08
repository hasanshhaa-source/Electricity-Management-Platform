import { NextRequest, NextResponse } from 'next/server';
import { z } from 'zod';
import { requireAdmin } from '@/services/auth/authService';
import { calculateForCycle } from '@/services/billing/billingCalculationService';
import { logAudit } from '@/services/audit/auditService';
import { successResponse, errorResponse } from '@/lib/utils/api';
import { getSystemSettings } from '@/services/settings/systemSettingsService';

const schema = z.object({
  diff_method: z.enum(['proportional', 'equal', 'manual']).optional(),
});

type Params = { params: Promise<{ id: string }> };

export async function POST(req: NextRequest, { params }: Params) {
  let admin;
  try { admin = await requireAdmin(); } catch { return NextResponse.json(errorResponse('Forbidden'), { status: 403 }); }

  const { id } = await params;
  const body = await req.json().catch(() => ({}));
  const parsed = schema.safeParse(body);
  const sysSettings = await getSystemSettings();
  const rawMethod = (parsed.success && parsed.data.diff_method) ? parsed.data.diff_method : sysSettings.default_diff_method;
  // calculationEngine only supports proportional/equal; fall back to proportional for 'manual'
  const diffMethod = (rawMethod === 'equal' ? 'equal' : 'proportional') as 'proportional' | 'equal';

  const result = await calculateForCycle(id, admin.id, diffMethod);
  if (result.error) return NextResponse.json(errorResponse(result.error), { status: 400 });

  await logAudit({
    entity_type: 'billing_cycles',
    entity_id:   id,
    action:      'BILLS_CALCULATED',
    actor_id:    admin.id,
    actor_role:  'admin',
    new_data: {
      diff_method:     diffMethod,
      flats_calculated: result.data!.summary.flatsCalculated,
      total_due:        result.data!.summary.totalCalculatedDue,
    },
  });

  return NextResponse.json(successResponse(result.data));
}
