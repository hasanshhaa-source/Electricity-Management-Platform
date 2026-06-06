import { NextRequest, NextResponse } from 'next/server';
import { requireAdmin } from '@/services/auth/authService';
import { upsertReading } from '@/services/billing/readingService';
import { meterReadingSchema } from '@/lib/validation/billing';
import { logAudit } from '@/services/audit/auditService';
import { successResponse, errorResponse } from '@/lib/utils/api';

export async function POST(req: NextRequest) {
  let admin;
  try { admin = await requireAdmin(); } catch { return NextResponse.json(errorResponse('Forbidden'), { status: 403 }); }

  const body = await req.json();
  const parsed = meterReadingSchema.safeParse(body);
  if (!parsed.success) return NextResponse.json(errorResponse(parsed.error.issues[0].message), { status: 400 });

  const result = await upsertReading(parsed.data, admin.id);
  if (result.error) return NextResponse.json(errorResponse(result.error), { status: 400 });

  await logAudit({
    entity_type: 'meter_readings',
    entity_id:   result.data!.id,
    action:      'READING_SAVED',
    actor_id:    admin.id,
    actor_role:  'admin',
    new_data:    parsed.data as any,
  });
  return NextResponse.json(successResponse(result.data), { status: 201 });
}
