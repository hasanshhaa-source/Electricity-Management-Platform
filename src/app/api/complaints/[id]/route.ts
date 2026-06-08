import { NextRequest, NextResponse } from 'next/server';
import { requireAdmin } from '@/services/auth/authService';
import { getComplaint, updateComplaint } from '@/services/complaints/complaintService';
import { successResponse, errorResponse } from '@/lib/utils/api';
import { logAudit } from '@/services/audit/auditService';
import { z } from 'zod';

type Params = { params: Promise<{ id: string }> };

const updateSchema = z.object({
  status:          z.enum(['open','reviewed','in_progress','resolved','closed']).optional(),
  resolution_note: z.string().max(2000).optional().nullable(),
  admin_notes:     z.string().max(2000).optional().nullable(),
});

export async function GET(_req: NextRequest, { params }: Params) {
  let admin;
  try { admin = await requireAdmin(); } catch { return NextResponse.json(errorResponse('Forbidden'), { status: 403 }); }

  const { id } = await params;
  const complaint = await getComplaint(id);
  if (!complaint) return NextResponse.json(errorResponse('Not found'), { status: 404 });

  return NextResponse.json(successResponse(complaint));
}

export async function PATCH(req: NextRequest, { params }: Params) {
  let admin;
  try { admin = await requireAdmin(); } catch { return NextResponse.json(errorResponse('Forbidden'), { status: 403 }); }

  const { id } = await params;
  const body   = await req.json().catch(() => ({}));
  const parsed = updateSchema.safeParse(body);
  if (!parsed.success) {
    return NextResponse.json(errorResponse(parsed.error.issues[0]?.message ?? 'Invalid input'), { status: 422 });
  }

  const result = await updateComplaint(id, parsed.data, admin.id);
  if (result.error) return NextResponse.json(errorResponse(result.error), { status: 400 });

  await logAudit({
    entity_type: 'complaints',
    entity_id:   id,
    action:      'COMPLAINT_UPDATE',
    actor_id:    admin.id,
    actor_role:  'admin',
    new_data:    parsed.data,
  });

  return NextResponse.json(successResponse(result.data));
}
