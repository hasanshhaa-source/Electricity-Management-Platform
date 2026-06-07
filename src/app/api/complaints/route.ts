import { NextRequest, NextResponse } from 'next/server';
import { getCurrentUser } from '@/services/auth/authService';
import { createClient } from '@/lib/supabase/server';
import { successResponse, errorResponse } from '@/lib/utils/api';
import { z } from 'zod';

const schema = z.object({
  flat_id:        z.string().uuid(),
  type:           z.enum(['complaint', 'recommendation', 'query', 'maintenance_request', 'other']),
  subject:        z.string().min(3).max(100),
  description:    z.string().min(10).max(1000),
  attachment_url: z.string().url().optional().nullable(),
});

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
    .select('id, flat:flats(flat_number)')
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

  // Notify all active admins in-app
  const { data: admins } = await supabase
    .from('users')
    .select('id')
    .eq('role', 'admin')
    .eq('is_active', true)
    .is('deleted_at', null);

  const typeLabel: Record<string, string> = {
    complaint:           'Complaint',
    recommendation:      'Recommendation',
    query:               'Query',
    maintenance_request: 'Maintenance Request',
    other:               'Submission',
  };

  const flatNumber = (tenancy.flat as any)?.flat_number ?? '';

  if (admins && admins.length > 0) {
    await supabase.from('notifications').insert(
      admins.map((admin: any) => ({
        user_id:  admin.id,
        type:     'complaint_submitted',
        channel:  'in_app',
        title:    `New ${typeLabel[parsed.data.type] ?? 'Submission'}: ${parsed.data.subject}`,
        body:     `Flat ${flatNumber} — ${parsed.data.description.slice(0, 200)}${parsed.data.description.length > 200 ? '…' : ''}`,
      })),
    );
  }

  return NextResponse.json(successResponse(data), { status: 201 });
}
