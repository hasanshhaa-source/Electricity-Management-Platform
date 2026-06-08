import { NextRequest, NextResponse } from 'next/server';
import { createAdminClient } from '@/lib/supabase/server';
import { successResponse, errorResponse } from '@/lib/utils/api';
import { z } from 'zod';
import { getSystemSettings } from '@/services/settings/systemSettingsService';

const schema = z.object({
  auth_id: z.string().uuid(),
  email: z.string().email(),
  full_name: z.string().min(2).max(100),
  phone: z.string().optional().nullable(),
});

export async function POST(request: NextRequest) {
  const body = await request.json();
  const parsed = schema.safeParse(body);

  if (!parsed.success) {
    return NextResponse.json(errorResponse(parsed.error.issues[0].message), { status: 400 });
  }

  const sysSettings = await getSystemSettings();
  if (!sysSettings.allow_self_registration) {
    return NextResponse.json(
      errorResponse('Self-registration is currently disabled. Please contact the administrator.'),
      { status: 403 },
    );
  }

  const supabase = await createAdminClient();

  // Check email not already used
  const { data: existing } = await supabase
    .from('users')
    .select('id')
    .eq('email', parsed.data.email)
    .single();

  if (existing) {
    return NextResponse.json(errorResponse('Email already registered'), { status: 409 });
  }

  const { data, error } = await supabase
    .from('users')
    .insert({
      auth_id: parsed.data.auth_id,
      email: parsed.data.email,
      full_name: parsed.data.full_name,
      phone: parsed.data.phone ?? null,
      role: 'tenant',
    })
    .select('id, email, full_name, role')
    .single();

  if (error) {
    return NextResponse.json(errorResponse(error.message), { status: 500 });
  }

  return NextResponse.json(successResponse(data), { status: 201 });
}
