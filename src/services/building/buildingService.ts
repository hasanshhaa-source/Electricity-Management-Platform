import { createClient } from '@/lib/supabase/server';
import type { Building, Flat, ApiResponse } from '@/types';
import type { BuildingInput, FlatInput } from '@/lib/validation/building';

// ─── Buildings ────────────────────────────────────────────────

export async function getBuildings(): Promise<ApiResponse<Building[]>> {
  const supabase = await createClient();
  const { data, error } = await supabase
    .from('buildings')
    .select('*')
    .is('deleted_at', null)
    .order('name');
  if (error) return { data: null, error: error.message };
  return { data, error: null };
}

export async function getBuildingById(id: string): Promise<ApiResponse<Building>> {
  const supabase = await createClient();
  const { data, error } = await supabase
    .from('buildings')
    .select('*')
    .eq('id', id)
    .is('deleted_at', null)
    .single();
  if (error) return { data: null, error: error.message };
  return { data, error: null };
}

export async function createBuilding(
  input: BuildingInput,
  createdBy: string
): Promise<ApiResponse<Building>> {
  const supabase = await createClient();
  const { data, error } = await supabase
    .from('buildings')
    .insert({ ...input, created_by: createdBy })
    .select()
    .single();
  if (error) return { data: null, error: error.message };
  return { data, error: null };
}

export async function updateBuilding(
  id: string,
  input: Partial<BuildingInput>
): Promise<ApiResponse<Building>> {
  const supabase = await createClient();
  const { data, error } = await supabase
    .from('buildings')
    .update(input)
    .eq('id', id)
    .is('deleted_at', null)
    .select()
    .single();
  if (error) return { data: null, error: error.message };
  return { data, error: null };
}

export async function toggleBuildingActive(
  id: string,
  isActive: boolean
): Promise<ApiResponse<Building>> {
  const supabase = await createClient();
  const { data, error } = await supabase
    .from('buildings')
    .update({ is_active: isActive })
    .eq('id', id)
    .is('deleted_at', null)
    .select()
    .single();
  if (error) return { data: null, error: error.message };
  return { data, error: null };
}

export async function deleteBuilding(id: string): Promise<ApiResponse<null>> {
  const supabase = await createClient();
  // Block if active tenancies exist
  const { data: flatRows } = await supabase.from('flats').select('id').eq('building_id', id).is('deleted_at', null);
  const flatIds = (flatRows ?? []).map((f: any) => f.id);
  let count = 0;
  if (flatIds.length > 0) {
    const { count: c } = await supabase
      .from('tenancies')
      .select('*', { count: 'exact', head: true })
      .eq('status', 'active')
      .in('flat_id', flatIds);
    count = c ?? 0;
  }
  if (count > 0) {
    return { data: null, error: 'Cannot delete a building with active tenants' };
  }
  const { error } = await supabase
    .from('buildings')
    .update({ deleted_at: new Date().toISOString(), is_active: false })
    .eq('id', id);
  if (error) return { data: null, error: error.message };
  return { data: null, error: null };
}

// ─── Flats ────────────────────────────────────────────────────

export async function getFlatsByBuilding(
  buildingId: string,
  includeInactive = false
): Promise<ApiResponse<Flat[]>> {
  const supabase = await createClient();
  let q = supabase
    .from('flats')
    .select('*')
    .eq('building_id', buildingId)
    .is('deleted_at', null)
    .order('floor', { nullsFirst: true })
    .order('flat_number');
  if (!includeInactive) q = q.eq('is_active', true);
  const { data, error } = await q;
  if (error) return { data: null, error: error.message };
  return { data, error: null };
}

export async function getAvailableFlatsByBuilding(buildingId: string): Promise<ApiResponse<Flat[]>> {
  const supabase = await createClient();
  const { data, error } = await supabase
    .from('flats')
    .select('*')
    .eq('building_id', buildingId)
    .eq('status', 'available')
    .is('deleted_at', null)
    .eq('is_active', true)
    .order('floor', { nullsFirst: true })
    .order('flat_number');
  if (error) return { data: null, error: error.message };
  return { data, error: null };
}

export async function getFlatById(id: string): Promise<ApiResponse<Flat>> {
  const supabase = await createClient();
  const { data, error } = await supabase
    .from('flats')
    .select('*, building:buildings(*)')
    .eq('id', id)
    .is('deleted_at', null)
    .single();
  if (error) return { data: null, error: error.message };
  return { data, error: null };
}

export async function getAllFlatsWithTenants(): Promise<ApiResponse<Flat[]>> {
  const supabase = await createClient();
  const { data, error } = await supabase
    .from('flats')
    .select(`
      *,
      building:buildings(id, name, city),
      active_tenancy:tenancies!inner(
        id, status, start_date,
        user:users!user_id(id, full_name, email, phone)
      )
    `)
    .is('deleted_at', null)
    .eq('is_active', true)
    .eq('tenancies.status', 'active')
    .order('flat_number');

  // Also get flats without tenancies
  const { data: allFlats, error: allError } = await supabase
    .from('flats')
    .select(`
      *,
      building:buildings(id, name, city)
    `)
    .is('deleted_at', null)
    .eq('is_active', true)
    .order('flat_number');

  if (allError) return { data: null, error: allError.message };
  return { data: allFlats, error: null };
}

export async function createFlat(input: FlatInput): Promise<ApiResponse<Flat>> {
  const supabase = await createClient();
  const { data, error } = await supabase
    .from('flats')
    .insert(input)
    .select()
    .single();
  if (error) return { data: null, error: error.message };
  return { data, error: null };
}

export async function updateFlat(
  id: string,
  input: Partial<FlatInput & { status: string }>
): Promise<ApiResponse<Flat>> {
  const supabase = await createClient();
  const { data, error } = await supabase
    .from('flats')
    .update(input)
    .eq('id', id)
    .is('deleted_at', null)
    .select()
    .single();
  if (error) return { data: null, error: error.message };
  return { data, error: null };
}

export async function deleteFlat(id: string): Promise<ApiResponse<null>> {
  const supabase = await createClient();
  const { data: activeTenancy } = await supabase
    .from('tenancies')
    .select('id')
    .eq('flat_id', id)
    .eq('status', 'active')
    .single();
  if (activeTenancy) {
    return { data: null, error: 'Cannot delete a flat with an active tenant' };
  }
  const { error } = await supabase
    .from('flats')
    .update({ deleted_at: new Date().toISOString(), is_active: false })
    .eq('id', id);
  if (error) return { data: null, error: error.message };
  return { data: null, error: null };
}
