import { createClient } from '@/lib/supabase/server';
import { createAdminClient } from '@/lib/supabase/server';
import type { AuthUser } from '@/types';

export async function getCurrentUser(): Promise<AuthUser | null> {
  const supabase = await createClient();

  const { data: { user }, error } = await supabase.auth.getUser();
  if (error || !user) return null;

  const { data: profile } = await supabase
    .from('users')
    .select('id, auth_id, email, full_name, role, is_active')
    .eq('auth_id', user.id)
    .single();

  if (!profile || !profile.is_active) return null;

  return profile as AuthUser;
}

export async function requireAuth(): Promise<AuthUser> {
  const user = await getCurrentUser();
  if (!user) throw new Error('Unauthorized');
  return user;
}

export async function requireAdmin(): Promise<AuthUser> {
  const user = await requireAuth();
  if (user.role !== 'admin') throw new Error('Forbidden: admin access required');
  return user;
}

export async function requireTenant(): Promise<AuthUser> {
  const user = await requireAuth();
  if (user.role !== 'tenant') throw new Error('Forbidden: tenant access required');
  return user;
}

export async function createUserProfile(
  authId: string,
  email: string,
  fullName: string,
  phone?: string,
  role: 'admin' | 'tenant' = 'tenant'
): Promise<{ id: string } | null> {
  const supabase = await createAdminClient();

  const { data, error } = await supabase
    .from('users')
    .insert({
      auth_id: authId,
      email,
      full_name: fullName,
      phone: phone ?? null,
      role,
    })
    .select('id')
    .single();

  if (error) {
    console.error('Failed to create user profile:', error);
    return null;
  }

  return data;
}
