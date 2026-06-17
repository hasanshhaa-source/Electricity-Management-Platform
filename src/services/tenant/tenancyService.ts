import { createClient } from '@/lib/supabase/server';
import type { Tenancy, TenancyWithDetails, ApiResponse } from '@/types';
import type {
  TenancyRequestInput,
  TenancyApproveInput,
  TenancyRejectInput,
} from '@/lib/validation/tenancy';

export async function requestTenancy(
  input: TenancyRequestInput,
  userId: string
): Promise<ApiResponse<Tenancy>> {
  const supabase = await createClient();

  // Check for existing active or pending tenancy for this user
  const { data: existing } = await supabase
    .from('tenancies')
    .select('id, status')
    .eq('user_id', userId)
    .in('status', ['pending', 'active'])
    .single();

  if (existing) {
    return {
      data: null,
      error:
        existing.status === 'active'
          ? 'You already have an active tenancy'
          : 'You already have a pending tenancy request',
    };
  }

  // Check flat is available
  const { data: flat } = await supabase
    .from('flats')
    .select('id, status')
    .eq('id', input.flat_id)
    .is('deleted_at', null)
    .single();

  if (!flat) return { data: null, error: 'Flat not found' };
  if (flat.status !== 'available') {
    return { data: null, error: 'This flat is not available' };
  }

  const { data, error } = await supabase
    .from('tenancies')
    .insert({ flat_id: input.flat_id, user_id: userId, status: 'pending' })
    .select()
    .single();

  if (error) return { data: null, error: error.message };
  return { data, error: null };
}

export async function approveTenancy(
  input: TenancyApproveInput,
  adminId: string
): Promise<ApiResponse<Tenancy>> {
  const supabase = await createClient();

  const { data: tenancy } = await supabase
    .from('tenancies')
    .select('*, flat:flats(id, status)')
    .eq('id', input.tenancy_id)
    .single();

  if (!tenancy) return { data: null, error: 'Tenancy request not found' };
  if (tenancy.status !== 'pending') {
    return { data: null, error: 'Only pending requests can be approved' };
  }

  // Update flat status to occupied
  await supabase
    .from('flats')
    .update({ status: 'occupied' })
    .eq('id', tenancy.flat_id);

  const { data, error } = await supabase
    .from('tenancies')
    .update({
      status: 'active',
      start_date: input.start_date,
      notes: input.notes ?? null,
      approved_by: adminId,
      approved_at: new Date().toISOString(),
    })
    .eq('id', input.tenancy_id)
    .select()
    .single();

  if (error) return { data: null, error: error.message };
  return { data, error: null };
}

export async function rejectTenancy(
  input: TenancyRejectInput,
  adminId: string
): Promise<ApiResponse<Tenancy>> {
  const supabase = await createClient();

  const { data: tenancy } = await supabase
    .from('tenancies')
    .select('id, status')
    .eq('id', input.tenancy_id)
    .single();

  if (!tenancy) return { data: null, error: 'Tenancy request not found' };
  if (tenancy.status !== 'pending') {
    return { data: null, error: 'Only pending requests can be rejected' };
  }

  const { data, error } = await supabase
    .from('tenancies')
    .update({
      status: 'rejected',
      notes: input.notes,
      rejected_by: adminId,
      rejected_at: new Date().toISOString(),
    })
    .eq('id', input.tenancy_id)
    .select()
    .single();

  if (error) return { data: null, error: error.message };
  return { data, error: null };
}

export async function endTenancy(
  tenancyId: string,
  adminId: string,
  endDate: string,
  notes?: string
): Promise<ApiResponse<Tenancy>> {
  const supabase = await createClient();

  const { data: tenancy } = await supabase
    .from('tenancies')
    .select('id, flat_id, status')
    .eq('id', tenancyId)
    .single();

  if (!tenancy) return { data: null, error: 'Tenancy not found' };
  if (tenancy.status !== 'active') {
    return { data: null, error: 'Only active tenancies can be ended' };
  }

  // Free the flat
  await supabase
    .from('flats')
    .update({ status: 'available' })
    .eq('id', tenancy.flat_id);

  const { data, error } = await supabase
    .from('tenancies')
    .update({ status: 'ended', end_date: endDate, notes: notes ?? null })
    .eq('id', tenancyId)
    .select()
    .single();

  if (error) return { data: null, error: error.message };
  return { data, error: null };
}

export async function getAllTenancies(options?: {
  status?: string;
  buildingId?: string;
}): Promise<ApiResponse<TenancyWithDetails[]>> {
  const supabase = await createClient();

  let query = supabase
    .from('tenancies')
    .select(`
      *,
      user:users!user_id(id, email, full_name, phone),
      flat:flats(
        id, flat_number, floor, status,
        building:buildings(id, name, city)
      )
    `)
    .order('created_at', { ascending: false });

  if (options?.status) {
    query = query.eq('status', options.status);
  }

  if (options?.buildingId) {
    query = query.eq('flat.building_id', options.buildingId);
  }

  const { data, error } = await query;
  if (error) return { data: null, error: error.message };
  return { data: data as TenancyWithDetails[], error: null };
}

export async function getTenancyByUser(userId: string): Promise<ApiResponse<TenancyWithDetails | null>> {
  const supabase = await createClient();

  const { data, error } = await supabase
    .from('tenancies')
    .select(`
      *,
      flat:flats(
        id, flat_number, floor, status,
        building:buildings(id, name, address, city)
      )
    `)
    .eq('user_id', userId)
    .in('status', ['active', 'pending'])
    .order('created_at', { ascending: false })
    .limit(1)
    .maybeSingle();

  if (error) return { data: null, error: error.message };
  return { data: data as TenancyWithDetails | null, error: null };
}

export async function reassignTenancy(
  tenancyId: string,
  newFlatId: string,
  adminId: string
): Promise<ApiResponse<Tenancy>> {
  const supabase = await createClient();

  const { data: tenancy } = await supabase
    .from('tenancies')
    .select('id, flat_id, user_id, status')
    .eq('id', tenancyId)
    .single();

  if (!tenancy) return { data: null, error: 'Tenancy not found' };
  if (tenancy.status !== 'active') {
    return { data: null, error: 'Only active tenancies can be reassigned' };
  }

  const { data: newFlat } = await supabase
    .from('flats')
    .select('id, status')
    .eq('id', newFlatId)
    .is('deleted_at', null)
    .single();

  if (!newFlat) return { data: null, error: 'Target flat not found' };
  if (newFlat.status !== 'available') {
    return { data: null, error: 'Target flat is not available' };
  }

  // Free old flat
  await supabase
    .from('flats')
    .update({ status: 'available' })
    .eq('id', tenancy.flat_id);

  // Occupy new flat
  await supabase
    .from('flats')
    .update({ status: 'occupied' })
    .eq('id', newFlatId);

  const { data, error } = await supabase
    .from('tenancies')
    .update({ flat_id: newFlatId })
    .eq('id', tenancyId)
    .select()
    .single();

  if (error) return { data: null, error: error.message };
  return { data, error: null };
}
