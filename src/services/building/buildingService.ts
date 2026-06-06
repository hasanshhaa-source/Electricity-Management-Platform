import { createClient } from '@/lib/supabase/server';
import { getErrorMessage } from '@/lib/utils/api';
import type { Building, Flat, ApiResponse } from '@/types';
import type { BuildingInput, FlatInput } from '@/lib/validation/building';

export async function getBuildings(): Promise<ApiResponse<Building[]>> {
  const supabase = await createClient();
  const { data, error } = await supabase
    .from('buildings')
    .select('*')
    .is('deleted_at', null)
    .eq('is_active', true)
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

export async function deleteBuilding(id: string): Promise<ApiResponse<null>> {
  const supabase = await createClient();
  const { error } = await supabase
    .from('buildings')
    .update({ deleted_at: new Date().toISOString(), is_active: false })
    .eq('id', id);

  if (error) return { data: null, error: error.message };
  return { data: null, error: null };
}

// ─── Flats ───────────────────────────────────────────────────

export async function getFlatsByBuilding(buildingId: string): Promise<ApiResponse<Flat[]>> {
  const supabase = await createClient();
  const { data, error } = await supabase
    .from('flats')
    .select('*')
    .eq('building_id', buildingId)
    .is('deleted_at', null)
    .eq('is_active', true)
    .order('floor')
    .order('flat_number');

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
    .order('floor')
    .order('flat_number');

  if (error) return { data: null, error: error.message };
  return { data, error: null };
}

export async function getFlatById(id: string): Promise<ApiResponse<Flat>> {
  const supabase = await createClient();
  const { data, error } = await supabase
    .from('flats')
    .select('*')
    .eq('id', id)
    .is('deleted_at', null)
    .single();

  if (error) return { data: null, error: error.message };
  return { data, error: null };
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
  input: Partial<FlatInput>
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

  // Check no active tenancy
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
