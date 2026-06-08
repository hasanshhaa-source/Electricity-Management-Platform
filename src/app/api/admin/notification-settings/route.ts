import { NextRequest, NextResponse } from 'next/server';
import { requireAdmin } from '@/services/auth/authService';
import { getNotificationSettings, updateNotificationSettings } from '@/services/notification/notificationSettings';
import { successResponse, errorResponse } from '@/lib/utils/api';
import { z } from 'zod';

const settingsSchema = z.object({
  admin_email:               z.string().email().optional().nullable(),
  sender_name:               z.string().min(1).max(100).optional(),
  sender_email:              z.string().email().optional().nullable(),
  overdue_reminders_enabled: z.boolean().optional(),
  reminder_frequency_days:   z.number().int().min(1).max(30).optional(),
  bill_issued_enabled:       z.boolean().optional(),
  payment_confirmed_enabled: z.boolean().optional(),
  complaint_notify_enabled:  z.boolean().optional(),
});

export async function GET() {
  try { await requireAdmin(); } catch { return NextResponse.json(errorResponse('Forbidden'), { status: 403 }); }

  const settings = await getNotificationSettings();
  return NextResponse.json(successResponse(settings));
}

export async function PUT(req: NextRequest) {
  try { await requireAdmin(); } catch { return NextResponse.json(errorResponse('Forbidden'), { status: 403 }); }

  const body   = await req.json().catch(() => ({}));
  const parsed = settingsSchema.safeParse(body);
  if (!parsed.success) {
    return NextResponse.json(errorResponse(parsed.error.issues[0]?.message ?? 'Invalid input'), { status: 422 });
  }

  const current = await getNotificationSettings();
  if (!current.id) return NextResponse.json(errorResponse('Settings not initialized'), { status: 500 });

  const result = await updateNotificationSettings(current.id, parsed.data);
  if (result.error) return NextResponse.json(errorResponse(result.error), { status: 500 });

  const updated = await getNotificationSettings();
  return NextResponse.json(successResponse(updated));
}
