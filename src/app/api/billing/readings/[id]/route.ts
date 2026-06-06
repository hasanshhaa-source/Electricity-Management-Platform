import { NextRequest, NextResponse } from 'next/server';
import { requireAdmin } from '@/services/auth/authService';
import { upsertReading, deleteReading } from '@/services/billing/readingService';
import { meterReadingSchema } from '@/lib/validation/billing';
import { logAudit } from '@/services/audit/auditService';
import { createClient } from '@/lib/supabase/server';
import { successResponse, errorResponse } from '@/lib/utils/api';

type Params = { params: Promise<{ id: string }> };

export async function PUT(req: NextRequest, { params }: Params) {
  let admin;
  try { admin = await requireAdmin(); } catch { return NextResponse.json(errorResponse('Forbidden'), { status: 403 }); }

  const { id } = await params;
  const supabase = await createClient();
  const { data: existing } = await supabase.from('meter_readings').select('*').eq('id', id).maybeSingle();
  if (!existing) return NextResponse.json(errorResponse('Reading not found'), { status: 404 });

  const body = await req.json();
  const parsed = meterReadingSchema.safeParse(body);
  if (!parsed.success) return NextResponse.json(errorResponse(parsed.error.issues[0].message), { status: 400 });

  const result = await upsertReading(parsed.data, admin.id);
  if (result.error) return NextResponse.json(errorResponse(result.error), { status: 400 });

  await logAudit({
    entity_type: 'meter_readings',
    entity_id:   id,
    action:      'READING_UPDATED',
    actor_id:    admin.id,
    actor_role:  'admin',
    old_data:    existing as any,
    new_data:    parsed.data as any,
  });
  return NextResponse.json(successResponse(result.data));
}

export async function DELETE(_req: NextRequest, { params }: Params) {
  let admin;
  try { admin = await requireAdmin(); } catch { return NextResponse.json(errorResponse('Forbidden'), { status: 403 }); }

  const { id } = await params;
  const supabase = await createClient();
  const { data: existing } = await supabase.from('meter_readings').select('*').eq('id', id).maybeSingle();
  if (!existing) return NextResponse.json(errorResponse('Reading not found'), { status: 404 });

  const result = await deleteReading(id);
  if (result.error) return NextResponse.json(errorResponse(result.error), { status: 400 });

  await logAudit({ entity_type: 'meter_readings', entity_id: id, action: 'READING_DELETED', actor_id: admin.id, actor_role: 'admin', old_data: existing as any });
  return NextResponse.json(successResponse(null));
}
