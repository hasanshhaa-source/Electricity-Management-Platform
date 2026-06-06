import { NextRequest, NextResponse } from 'next/server';
import { getCurrentUser } from '@/services/auth/authService';
import { createClient } from '@/lib/supabase/server';
import { successResponse, errorResponse } from '@/lib/utils/api';
import { z } from 'zod';

const schema = z.object({
  flat_id: z.string().uuid(),
  type: z.enum(['complaint', 'recommendation', 'query']),
  subject: z.string().min(3).max(100),
  description: z.string().min(10).max(1000),
});

export async function POST(request: NextRequest) {
  const user = await getCurrentUser();
  if (!user) return NextResponse.json(errorResponse('Unauthorized'), { status: 401 });
  if (user.role !== 'tenant') return NextResponse.json(errorResponse('Forbidden'), { status: 403 });

  const body = await request.json();
  const parsed = schema.safeParse(body);
  if (!parsed.success) {
    return NextResponse.json(errorResponse(parsed.error.issues[0].message), { status: 400 });
  }

  const supabase = await createClient();

  // Verify this flat belongs to the requesting tenant
  const { data: tenancy } = await supabase
    .from('tenancies')
    .select('id')
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
      flat_id: parsed.data.flat_id,
      submitted_by: user.id,
      type: parsed.data.type,
      subject: parsed.data.subject,
      description: parsed.data.description,
    })
    .select()
    .single();

  if (error) return NextResponse.json(errorResponse(error.message), { status: 500 });
  return NextResponse.json(successResponse(data), { status: 201 });
}
