import { NextRequest, NextResponse } from 'next/server';
import { z } from 'zod';
import { requireAdmin } from '@/services/auth/authService';
import { getSystemSettings, updateSystemSettings } from '@/services/settings/systemSettingsService';
import { successResponse, errorResponse } from '@/lib/utils/api';
import { logAudit } from '@/services/audit/auditService';

export async function GET() {
  try { await requireAdmin(); } catch { return NextResponse.json(errorResponse('Forbidden'), { status: 403 }); }
  const settings = await getSystemSettings();
  return NextResponse.json(successResponse(settings));
}

const schema = z.object({
  default_currency:          z.string().min(1).max(10).optional(),
  timezone:                  z.string().min(1).optional(),
  default_language:          z.enum(['en', 'ar']).optional(),
  default_diff_method:       z.enum(['proportional', 'equal', 'manual']).optional(),
  default_due_date_days:     z.number().int().min(1).max(60).optional(),
  decimal_places:            z.union([z.literal(2), z.literal(4)]).optional(),
  allow_manual_override:     z.boolean().optional(),
  allow_self_registration:   z.boolean().optional(),
  require_admin_approval:    z.boolean().optional(),
  allowed_payment_methods:   z.array(z.string()).min(1).optional(),
  require_payment_reference: z.boolean().optional(),
  allow_partial_payments:    z.boolean().optional(),
});

export async function PUT(req: NextRequest) {
  let admin;
  try { admin = await requireAdmin(); } catch { return NextResponse.json(errorResponse('Forbidden'), { status: 403 }); }

  const body   = await req.json().catch(() => ({}));
  const parsed = schema.safeParse(body);
  if (!parsed.success) {
    return NextResponse.json(errorResponse(parsed.error.issues[0]?.message ?? 'Invalid input'), { status: 422 });
  }

  const current = await getSystemSettings();
  const result  = await updateSystemSettings(current.id, parsed.data);
  if (result.error) return NextResponse.json(errorResponse(result.error), { status: 400 });

  await logAudit({
    entity_type: 'system_settings',
    entity_id:   current.id as any,
    action:      'SETTINGS_UPDATE',
    actor_id:    admin.id,
    actor_role:  'admin',
    new_data:    parsed.data,
  });

  return NextResponse.json(successResponse(result.data));
}
