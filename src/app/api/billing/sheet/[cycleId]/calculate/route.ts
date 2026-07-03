import { NextRequest, NextResponse } from 'next/server';
import { requireAdmin } from '@/services/auth/authService';
import { calculateFromSheet } from '@/services/billing/sheetService';
import { logAudit } from '@/services/audit/auditService';

type Params = { params: Promise<{ cycleId: string }> };

export async function POST(_req: NextRequest, { params }: Params) {
  let admin;
  try { admin = await requireAdmin(); } catch { return NextResponse.json({ error: 'Forbidden' }, { status: 403 }); }

  const { cycleId } = await params;
  const result = await calculateFromSheet(cycleId, admin.id);
  if (result.error) return NextResponse.json({ error: result.error }, { status: 400 });

  await logAudit({
    entity_type: 'billing_cycles',
    entity_id:   cycleId,
    action:      'BILLS_CALCULATED_FROM_SHEET',
    actor_id:    admin.id,
    actor_role:  'admin',
    new_data:    { bills_generated: result.data!.count, source: 'sheet' },
  });

  return NextResponse.json({ data: result.data });
}
