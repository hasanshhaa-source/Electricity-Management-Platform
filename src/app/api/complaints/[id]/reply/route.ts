import { NextRequest, NextResponse } from 'next/server';
import { requireAdmin } from '@/services/auth/authService';
import { getComplaint, updateComplaint } from '@/services/complaints/complaintService';
import { notifyComplaintReply } from '@/services/notification/notificationService';
import { successResponse, errorResponse } from '@/lib/utils/api';
import { logAudit } from '@/services/audit/auditService';
import { z } from 'zod';

type Params = { params: Promise<{ id: string }> };

const replySchema = z.object({
  reply:      z.string().min(1, 'Reply cannot be empty').max(2000),
  new_status: z.enum(['open','reviewed','in_progress','resolved','closed']),
});

export async function POST(req: NextRequest, { params }: Params) {
  let admin;
  try { admin = await requireAdmin(); } catch { return NextResponse.json(errorResponse('Forbidden'), { status: 403 }); }

  const { id } = await params;
  const body   = await req.json().catch(() => ({}));
  const parsed = replySchema.safeParse(body);
  if (!parsed.success) {
    return NextResponse.json(errorResponse(parsed.error.issues[0]?.message ?? 'Invalid input'), { status: 422 });
  }

  const complaint = await getComplaint(id);
  if (!complaint) return NextResponse.json(errorResponse('Not found'), { status: 404 });

  // Persist reply + status change
  const now = new Date().toISOString();
  const result = await updateComplaint(
    id,
    {
      status:          parsed.data.new_status,
      admin_reply:     parsed.data.reply,
      replied_at:      now,
      replied_by:      admin.id,
      resolution_note: parsed.data.reply,  // also populate resolution_note so tenant sees it
    },
    admin.id,
  );

  if (result.error) return NextResponse.json(errorResponse(result.error), { status: 400 });

  await logAudit({
    entity_type: 'complaints',
    entity_id:   id,
    action:      'COMPLAINT_REPLY',
    actor_id:    admin.id,
    actor_role:  'admin',
    new_data:    { status: parsed.data.new_status },
  });

  // Send email to tenant (non-blocking)
  const tenantEmail = complaint.submitter?.email;
  if (tenantEmail) {
    notifyComplaintReply({
      userId:       complaint.submitter.id,
      tenantEmail,
      tenantName:   complaint.submitter.full_name,
      flatNumber:   complaint.flat.flat_number,
      buildingName: complaint.flat.building.name,
      subject:      complaint.subject,
      reply:        parsed.data.reply,
      newStatus:    parsed.data.new_status,
    }).catch(err => console.error('[notify] complaint reply error:', err));
  }

  return NextResponse.json(successResponse(result.data));
}
