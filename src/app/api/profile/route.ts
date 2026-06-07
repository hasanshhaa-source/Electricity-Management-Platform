import { NextRequest, NextResponse } from 'next/server';
import { requireTenant } from '@/services/auth/authService';
import { createClient } from '@/lib/supabase/server';
import { z } from 'zod';
import { successResponse, errorResponse } from '@/lib/utils/api';

const profileSchema = z.object({
  full_name:   z.string().min(2, 'Name must be at least 2 characters').max(100),
  phone:       z.string().max(20).optional().nullable(),
  national_id: z.string().max(50).optional().nullable(),
});

export async function PUT(req: NextRequest) {
  let user;
  try { user = await requireTenant(); } catch {
    return NextResponse.json(errorResponse('Forbidden'), { status: 403 });
  }

  const body   = await req.json().catch(() => ({}));
  const parsed = profileSchema.safeParse(body);
  if (!parsed.success) {
    return NextResponse.json(
      errorResponse(parsed.error.issues[0]?.message ?? 'Invalid input'),
      { status: 422 },
    );
  }

  const supabase = await createClient();
  const { data, error } = await supabase
    .from('users')
    .update({
      full_name:   parsed.data.full_name,
      phone:       parsed.data.phone   ?? null,
      national_id: parsed.data.national_id ?? null,
    })
    .eq('id', user.id)
    .select('id, full_name, phone, national_id, email')
    .single();

  if (error) return NextResponse.json(errorResponse(error.message), { status: 500 });
  return NextResponse.json(successResponse(data));
}
