import { createClient } from '@/lib/supabase/server';
import type { Meter, FlatMeterAssignment, MeterWithAllocations, ApiResponse } from '@/types';
import type { MeterInput, AllocationsSetInput } from '@/lib/validation/meter';

export async function getMetersByBuilding(buildingId: string): Promise<ApiResponse<Meter[]>> {
  const supabase = await createClient();
  const { data, error } = await supabase
    .from('meters')
    .select('*')
    .eq('building_id', buildingId)
    .is('deleted_at', null)
    .order('meter_number');
  if (error) return { data: null, error: error.message };
  return { data, error: null };
}

export async function getAllMeters(): Promise<ApiResponse<(Meter & { building: { name: string; city: string } })[]>> {
  const supabase = await createClient();
  const { data, error } = await supabase
    .from('meters')
    .select('*, building:buildings(id, name, city)')
    .is('deleted_at', null)
    .order('meter_number');
  if (error) return { data: null, error: error.message };
  return { data: data as any, error: null };
}

export async function getMeterById(id: string): Promise<ApiResponse<MeterWithAllocations>> {
  const supabase = await createClient();
  const { data: meter, error } = await supabase
    .from('meters')
    .select('*, building:buildings(id, name, city)')
    .eq('id', id)
    .is('deleted_at', null)
    .single();
  if (error) return { data: null, error: error.message };

  const { data: allocations } = await supabase
    .from('flat_meter_assignments')
    .select('*, flat:flats(id, flat_number, floor)')
    .eq('meter_id', id)
    .is('effective_to', null)
    .order('share_percent', { ascending: false });

  return {
    data: { ...meter, allocations: allocations ?? [] } as MeterWithAllocations,
    error: null,
  };
}

export async function createMeter(input: MeterInput): Promise<ApiResponse<Meter>> {
  const supabase = await createClient();
  const { data, error } = await supabase
    .from('meters')
    .insert(input)
    .select()
    .single();
  if (error) return { data: null, error: error.message };
  return { data, error: null };
}

export async function updateMeter(
  id: string,
  input: Partial<MeterInput>
): Promise<ApiResponse<Meter>> {
  const supabase = await createClient();
  const { data, error } = await supabase
    .from('meters')
    .update(input)
    .eq('id', id)
    .is('deleted_at', null)
    .select()
    .single();
  if (error) return { data: null, error: error.message };
  return { data, error: null };
}

export async function deleteMeter(id: string): Promise<ApiResponse<null>> {
  const supabase = await createClient();
  const { error } = await supabase
    .from('meters')
    .update({ deleted_at: new Date().toISOString(), is_active: false })
    .eq('id', id);
  if (error) return { data: null, error: error.message };
  return { data: null, error: null };
}

// ─── Allocations ─────────────────────────────────────────────

export async function setMeterAllocations(
  meterId: string,
  input: AllocationsSetInput
): Promise<ApiResponse<FlatMeterAssignment[]>> {
  const supabase = await createClient();

  // Verify meter exists and is shared
  const { data: meter } = await supabase
    .from('meters')
    .select('id, meter_type')
    .eq('id', meterId)
    .is('deleted_at', null)
    .single();

  if (!meter) return { data: null, error: 'Meter not found' };
  if (meter.meter_type !== 'shared') {
    return { data: null, error: 'Only shared meters can have split allocations' };
  }

  // Validate total (defense in depth — DB trigger also checks)
  const total = input.allocations.reduce((s, a) => s + a.share_percent, 0);
  if (Math.abs(total - 100) > 0.01) {
    return { data: null, error: `Allocations must total 100% (got ${total.toFixed(2)}%)` };
  }

  const today = new Date().toISOString().split('T')[0];

  // Close all existing active allocations for this meter
  await supabase
    .from('flat_meter_assignments')
    .update({ effective_to: today })
    .eq('meter_id', meterId)
    .is('effective_to', null);

  // Insert new allocations
  const rows = input.allocations.map((a) => ({
    flat_id: a.flat_id,
    meter_id: meterId,
    share_percent: a.share_percent,
    effective_from: a.effective_from,
  }));

  const { data, error } = await supabase
    .from('flat_meter_assignments')
    .insert(rows)
    .select();

  if (error) return { data: null, error: error.message };
  return { data, error: null };
}

export async function setIndividualMeterFlat(
  meterId: string,
  flatId: string
): Promise<ApiResponse<FlatMeterAssignment>> {
  const supabase = await createClient();

  const { data: meter } = await supabase
    .from('meters')
    .select('id, meter_type, building_id')
    .eq('id', meterId)
    .is('deleted_at', null)
    .single();

  if (!meter) return { data: null, error: 'Meter not found' };
  if (meter.meter_type !== 'individual') {
    return { data: null, error: 'Use allocations endpoint for shared meters' };
  }

  // Verify flat belongs to same building
  const { data: flat } = await supabase
    .from('flats')
    .select('id, building_id')
    .eq('id', flatId)
    .is('deleted_at', null)
    .single();

  if (!flat) return { data: null, error: 'Flat not found' };
  if (flat.building_id !== meter.building_id) {
    return { data: null, error: 'Flat and meter must belong to the same building' };
  }

  const today = new Date().toISOString().split('T')[0];

  // Close existing allocation
  await supabase
    .from('flat_meter_assignments')
    .update({ effective_to: today })
    .eq('meter_id', meterId)
    .is('effective_to', null);

  const { data, error } = await supabase
    .from('flat_meter_assignments')
    .insert({ flat_id: flatId, meter_id: meterId, share_percent: 100, effective_from: today })
    .select()
    .single();

  if (error) return { data: null, error: error.message };
  return { data, error: null };
}

export async function getAllocationsForMeter(meterId: string): Promise<ApiResponse<(FlatMeterAssignment & { flat: { id: string; flat_number: string; floor: number | null } })[]>> {
  const supabase = await createClient();
  const { data, error } = await supabase
    .from('flat_meter_assignments')
    .select('*, flat:flats(id, flat_number, floor)')
    .eq('meter_id', meterId)
    .is('effective_to', null)
    .order('share_percent', { ascending: false });
  if (error) return { data: null, error: error.message };
  return { data: data as any, error: null };
}
