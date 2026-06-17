import { createClient } from '@/lib/supabase/server';
import { createAdminClient } from '@/lib/supabase/server';
import type { User, TenantWithTenancy, ApiResponse } from '@/types';
import type { TenantProfileInput, CreateTenantInput, AssignFlatInput } from '@/lib/validation/tenant';

export async function getAllTenants(): Promise<ApiResponse<TenantWithTenancy[]>> {
  const supabase = await createClient();
  const { data, error } = await supabase
    .from('users')
    .select(`
      *,
      active_tenancy:tenancies!tenancies_user_id_fkey(
        id, status, start_date, end_date, flat_id,
        flat:flats(
          id, flat_number, floor, status,
          building:buildings(id, name, city)
        )
      )
    `)
    .eq('role', 'tenant')
    .is('deleted_at', null)
    .order('full_name');

  if (error) return { data: null, error: error.message };

  // Surface the most relevant tenancy per user
  const mapped = (data ?? []).map((u: any) => {
    const tenancies: any[] = u.active_tenancy ?? [];
    const active = tenancies.find((t) => t.status === 'active');
    const pending = tenancies.find((t) => t.status === 'pending');
    return { ...u, active_tenancy: active ?? pending ?? null };
  });

  return { data: mapped as TenantWithTenancy[], error: null };
}

export async function getTenantById(id: string): Promise<ApiResponse<TenantWithTenancy>> {
  const supabase = await createClient();
  const { data, error } = await supabase
    .from('users')
    .select(`
      *,
      tenancies!tenancies_user_id_fkey(
        id, status, start_date, end_date, flat_id, notes, approved_at,
        flat:flats(
          id, flat_number, floor, status,
          building:buildings(id, name, city, address)
        )
      )
    `)
    .eq('id', id)
    .eq('role', 'tenant')
    .is('deleted_at', null)
    .single();

  if (error) return { data: null, error: error.message };

  const tenancies: any[] = (data as any).tenancies ?? [];
  const active_tenancy =
    tenancies.find((t) => t.status === 'active') ??
    tenancies.find((t) => t.status === 'pending') ??
    null;

  return { data: { ...data, active_tenancy } as TenantWithTenancy, error: null };
}

export async function updateTenantProfile(
  id: string,
  input: TenantProfileInput
): Promise<ApiResponse<User>> {
  const supabase = await createClient();
  const { data, error } = await supabase
    .from('users')
    .update({
      full_name: input.full_name,
      phone: input.phone ?? null,
      national_id: input.national_id ?? null,
      is_active: input.is_active,
    })
    .eq('id', id)
    .eq('role', 'tenant')
    .is('deleted_at', null)
    .select()
    .single();
  if (error) return { data: null, error: error.message };
  return { data, error: null };
}

export async function createTenantByAdmin(
  input: CreateTenantInput
): Promise<ApiResponse<User>> {
  // 1. Create auth account
  const adminSupabase = await createAdminClient();
  const { data: authData, error: authError } = await adminSupabase.auth.admin.createUser({
    email: input.email,
    password: input.password,
    email_confirm: true,
  });
  if (authError) return { data: null, error: authError.message };

  // 2. Create user profile
  const { data, error } = await adminSupabase
    .from('users')
    .insert({
      auth_id: authData.user.id,
      email: input.email,
      full_name: input.full_name,
      phone: input.phone ?? null,
      national_id: input.national_id ?? null,
      role: 'tenant',
      is_active: input.is_active ?? true,
    })
    .select()
    .single();

  if (error) {
    // Rollback auth user on profile failure
    await adminSupabase.auth.admin.deleteUser(authData.user.id);
    return { data: null, error: error.message };
  }

  return { data, error: null };
}

export async function deactivateTenant(id: string): Promise<ApiResponse<null>> {
  const supabase = await createClient();
  const { error } = await supabase
    .from('users')
    .update({ is_active: false })
    .eq('id', id)
    .eq('role', 'tenant');
  if (error) return { data: null, error: error.message };
  return { data: null, error: null };
}

export async function adminAssignFlat(
  input: AssignFlatInput,
  adminId: string
): Promise<ApiResponse<{ tenancy_id: string }>> {
  const supabase = await createClient();

  // Close any existing active/pending tenancy for this user
  const { data: existing } = await supabase
    .from('tenancies')
    .select('id, flat_id, status')
    .eq('user_id', input.user_id)
    .in('status', ['active', 'pending']);

  if (existing && existing.length > 0) {
    for (const t of existing) {
      // Free the flat if it was occupied
      if (t.status === 'active') {
        await supabase.from('flats').update({ status: 'available' }).eq('id', t.flat_id);
      }
      await supabase.from('tenancies').update({ status: 'ended', end_date: input.start_date }).eq('id', t.id);
    }
  }

  // Verify target flat is available
  const { data: flat } = await supabase
    .from('flats')
    .select('id, status')
    .eq('id', input.flat_id)
    .is('deleted_at', null)
    .single();

  if (!flat) return { data: null, error: 'Flat not found' };
  if (flat.status !== 'available') {
    return { data: null, error: 'Target flat is not available' };
  }

  // Create active tenancy directly (admin assignment = no approval needed)
  const { data, error } = await supabase
    .from('tenancies')
    .insert({
      flat_id: input.flat_id,
      user_id: input.user_id,
      status: 'active',
      start_date: input.start_date,
      notes: input.notes ?? null,
      approved_by: adminId,
      approved_at: new Date().toISOString(),
    })
    .select('id')
    .single();

  if (error) return { data: null, error: error.message };

  // Mark flat occupied
  await supabase.from('flats').update({ status: 'occupied' }).eq('id', input.flat_id);

  return { data: { tenancy_id: data.id }, error: null };
}
