import { createClient } from '@/lib/supabase/server';
import type { BillingCycle, ApiResponse, CycleStatus } from '@/types';
import type { CycleInput } from '@/lib/validation/billing';

export interface CycleWithBuilding extends BillingCycle {
  building: { id: string; name: string; city: string; currency: string };
}

export async function getCycles(buildingId?: string): Promise<ApiResponse<CycleWithBuilding[]>> {
  const supabase = await createClient();
  let query = supabase
    .from('billing_cycles')
    .select('*, building:buildings(id, name, city, currency)')
    .order('period_year', { ascending: false })
    .order('period_month', { ascending: false });

  if (buildingId) query = query.eq('building_id', buildingId);

  const { data, error } = await query;
  if (error) return { data: null, error: error.message };
  return { data: data as CycleWithBuilding[], error: null };
}

export async function getCycleById(id: string): Promise<ApiResponse<CycleWithBuilding>> {
  const supabase = await createClient();
  const { data, error } = await supabase
    .from('billing_cycles')
    .select('*, building:buildings(id, name, city, currency, billing_day)')
    .eq('id', id)
    .single();
  if (error) return { data: null, error: error.message };
  return { data: data as CycleWithBuilding, error: null };
}

export async function createCycle(input: CycleInput, adminId: string): Promise<ApiResponse<BillingCycle>> {
  const supabase = await createClient();

  // Enforce uniqueness (DB has a UNIQUE constraint too, but give a friendly error)
  const { count } = await supabase
    .from('billing_cycles')
    .select('id', { count: 'exact', head: true })
    .eq('building_id', input.building_id)
    .eq('period_year', input.period_year)
    .eq('period_month', input.period_month);

  if (count && count > 0) {
    const monthName = new Date(input.period_year, input.period_month - 1).toLocaleString('en', { month: 'long' });
    return { data: null, error: `A billing cycle for ${monthName} ${input.period_year} already exists for this building` };
  }

  const { data, error } = await supabase
    .from('billing_cycles')
    .insert({
      building_id:  input.building_id,
      period_year:  input.period_year,
      period_month: input.period_month,
      status:       'draft',
      notes:        input.notes ?? null,
    })
    .select()
    .single();

  if (error) return { data: null, error: error.message };
  return { data, error: null };
}

export async function updateCycleStatus(
  id: string,
  status: CycleStatus,
  adminId: string,
  notes?: string | null,
): Promise<ApiResponse<BillingCycle>> {
  const supabase = await createClient();

  const extra: Record<string, unknown> = {};
  if (status === 'issued')   { extra.finalized_at = new Date().toISOString(); extra.finalized_by = adminId; }
  if (status === 'closed')   { extra.closed_at = new Date().toISOString();   extra.closed_by = adminId; }

  const { data, error } = await supabase
    .from('billing_cycles')
    .update({ status, notes: notes ?? undefined, ...extra })
    .eq('id', id)
    .select()
    .single();

  if (error) return { data: null, error: error.message };
  return { data, error: null };
}

export async function getCycleReadingStats(
  cycleId: string,
): Promise<{ totalMeters: number; readingsEntered: number }> {
  const supabase = await createClient();

  const { data: cycle } = await supabase
    .from('billing_cycles')
    .select('building_id, period_year, period_month')
    .eq('id', cycleId)
    .single();

  if (!cycle) return { totalMeters: 0, readingsEntered: 0 };

  const [{ count: totalMeters }, { count: readingsEntered }] = await Promise.all([
    supabase.from('meters').select('id', { count: 'exact', head: true })
      .eq('building_id', cycle.building_id)
      .eq('is_active', true)
      .is('deleted_at', null),
    supabase.from('meter_readings').select('id', { count: 'exact', head: true })
      .eq('cycle_id', cycleId),
  ]);

  return { totalMeters: totalMeters ?? 0, readingsEntered: readingsEntered ?? 0 };
}
