import { NextRequest, NextResponse } from 'next/server';
import { getCurrentUser, requireAdmin } from '@/services/auth/authService';
import { createClient } from '@/lib/supabase/server';
import { successResponse, errorResponse } from '@/lib/utils/api';
import { z } from 'zod';
import { getComplaints } from '@/services/complaints/complaintService';

// ── GET — admin list with filters ──────────────────────────────────────────────

export async function GET(req: NextRequest) {
  try { await requireAdmin(); } catch { return NextResponse.json(errorResponse('Forbidden'), { status: 403 }); }

  const p = req.nextUrl.searchParams;
  const rows = await getComplaints({
    buildingId: p.get('building_id') ?? undefined,
    type:       p.get('type')        ?? undefined,
    status:     p.get('status')      ?? undefined,
    search:     p.get('search')      ?? undefined,
  });

  return NextResponse.json(successResponse(rows));
}

import { notifyComplaintSubmitted } from '@/services/notification/notificationService';
import { getNotificationSettings } from '@/services/notification/notificationSettings';

const schema = z.object({
  flat_id:        z.string().uuid(),
  type:           z.enum(['complaint', 'recommendation', 'query', 'maintenance_request', 'other']),
  subject:        z.string().min(3).max(100),
  description:    z.string().min(10).max(1000),
  attachment_url: z.string().url().optional().nullable(),
});

const TYPE_LABEL: Record<string, string> = {
  complaint:           'Complaint',
  recommendation:      'Recommendation',
  query:               'Query',
  maintenance_request: 'Maintenance Request',
  other:               'Submission',
};

export async function POST(request: NextRequest) {
  const user = await getCurrentUser();
  if (!user) return NextResponse.json(errorResponse('Unauthorized'), { status: 401 });
  if (user.role !== 'tenant') return NextResponse.json(errorResponse('Forbidden'), { status: 403 });

  const body   = await request.json();
  const parsed = schema.safeParse(body);
  if (!parsed.success) {
    return NextResponse.json(errorResponse(parsed.error.issues[0].message), { status: 400 });
  }

  const supabase = await createClient();

  // Verify flat belongs to this tenant
  const { data: tenancy } = await supabase
    .from('tenancies')
    .select('id, flat:flats(flat_number, building:buildings(name))')
    .eq('user_id', user.id)
    .eq('flat_id', parsed.data.flat_id)
    .eq('status', 'active')
    .single();

  if (!tenancy) {
    return NextResponse.json(errorResponse('You are not assigned to this flat'), { status: 403 });
  }

  const { data, error } = await supabase
    .from('complaints')
    .insert({
      flat_id:        parsed.data.flat_id,
      submitted_by:   user.id,
      type:           parsed.data.type,
      subject:        parsed.data.subject,
      description:    parsed.data.description,
      attachment_url: parsed.data.attachment_url ?? null,
    })
    .select()
    .single();

  if (error) return NextResponse.json(errorResponse(error.message), { status: 500 });

  // Notify all active admins (in-app + email)
  const { data: admins } = await supabase
    .from('users')
    .select('id, email, full_name')
    .eq('role', 'admin')
    .eq('is_active', true)
    .is('deleted_at', null);

  const typeLabel  = TYPE_LABEL[parsed.data.type] ?? 'Submission';
  const flatNumber = (tenancy.flat as any)?.flat_number ?? '';
  const buildingName = (tenancy.flat as any)?.building?.name ?? '';

  if (admins && admins.length > 0) {
    // In-app notifications (batch insert)
    await supabase.from('notifications').insert(
      admins.map((admin: any) => ({
        user_id:  admin.id,
        type:     'complaint_submitted',
        channel:  'in_app',
        status:   'sent',
        sent_at:  new Date().toISOString(),
        title:    `New ${typeLabel}: ${parsed.data.subject}`,
        body:     `Flat ${flatNumber} — ${parsed.data.description.slice(0, 200)}${parsed.data.description.length > 200 ? '…' : ''}`,
      })),
    );

    // Email notifications (non-blocking)
    sendComplaintEmails({
      admins,
      tenantName:  user.full_name,
      flatNumber,
      buildingName,
      type:        typeLabel,
      subject:     parsed.data.subject,
      description: parsed.data.description,
    }).catch(err => console.error('[notify] complaint email error:', err));
  }

  return NextResponse.json(successResponse(data), { status: 201 });
}

async function sendComplaintEmails(params: {
  admins:      Array<{ id: string; email: string; full_name: string }>;
  tenantName:  string;
  flatNumber:  string;
  buildingName: string;
  type:        string;
  subject:     string;
  description: string;
}) {
  const settings = await getNotificationSettings();
  if (!settings.complaint_notify_enabled) return;

  // Use configured admin_email if set, otherwise email all admins
  const targets = settings.admin_email
    ? params.admins.filter(a => a.email === settings.admin_email)
    : params.admins;

  for (const admin of targets) {
    await notifyComplaintSubmitted({
      adminUserId:  admin.id,
      adminEmail:   admin.email,
      adminName:    admin.full_name,
      tenantName:   params.tenantName,
      flatNumber:   params.flatNumber,
      buildingName: params.buildingName,
      type:         params.type,
      subject:      params.subject,
      description:  params.description,
    });
  }
}
