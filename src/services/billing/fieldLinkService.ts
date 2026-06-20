import { randomBytes } from 'crypto';
import { createClient } from '@/lib/supabase/server';
import { createAdminClient } from '@/lib/supabase/admin';
import { getReadingRowsForCycle, upsertReading, type MeterReadingRow } from '@/services/billing/readingService';
import type { ApiResponse } from '@/types';
import type { MeterReadingInput } from '@/lib/validation/billing';

export interface FieldCycleInfo {
  cycleId: string;
  buildingId: string;
  buildingName: string;
  periodYear: number;
  periodMonth: number;
  recordedBy: string;
  rows: MeterReadingRow[];
}

/** Admin-only: creates or rotates the field token for a cycle and enables it. */
export async function generateFieldToken(cycleId: string, adminId: string): Promise<ApiResponse<{ token: string }>> {
  const supabase = await createClient();
  const token = randomBytes(24).toString('hex');

  const { error } = await supabase
    .from('billing_cycles')
    .update({
      field_token: token,
      field_token_enabled: true,
      field_token_created_by: adminId,
      field_token_created_at: new Date().toISOString(),
    })
    .eq('id', cycleId);

  if (error) return { data: null, error: error.message };
  return { data: { token }, error: null };
}

/** Admin-only: disables the link without deleting the token (so it can be re-enabled later if needed). */
export async function revokeFieldToken(cycleId: string): Promise<ApiResponse<null>> {
  const supabase = await createClient();
  const { error } = await supabase
    .from('billing_cycles')
    .update({ field_token_enabled: false })
    .eq('id', cycleId);

  if (error) return { data: null, error: error.message };
  return { data: null, error: null };
}

/**
 * Public, no-login lookup. Always uses the service-role client since the
 * caller has no Supabase session — access control is entirely the random
 * token plus the field_token_enabled flag.
 */
export async function getCycleByFieldToken(token: string): Promise<ApiResponse<FieldCycleInfo>> {
  const supabase = createAdminClient();

  const { data: cycle, error } = await supabase
    .from('billing_cycles')
    .select('id, building_id, period_year, period_month, field_token_enabled, field_token_created_by, building:buildings(name)')
    .eq('field_token', token)
    .maybeSingle();

  if (error) return { data: null, error: error.message };
  if (!cycle || !cycle.field_token_enabled) {
    return { data: null, error: 'This link is invalid or has been disabled. Please ask the admin for a new one.' };
  }

  const rowsResult = await getReadingRowsForCycle(
    cycle.building_id,
    cycle.period_year,
    cycle.period_month,
    cycle.id,
    supabase as any,
  );
  if (rowsResult.error) return { data: null, error: rowsResult.error };

  return {
    data: {
      cycleId: cycle.id,
      buildingId: cycle.building_id,
      buildingName: (cycle.building as any)?.name ?? '',
      periodYear: cycle.period_year,
      periodMonth: cycle.period_month,
      recordedBy: cycle.field_token_created_by,
      rows: rowsResult.data ?? [],
    },
    error: null,
  };
}

/** Public submission — re-validates the token server-side before saving. */
export async function submitFieldReading(
  token: string,
  input: MeterReadingInput,
): Promise<ApiResponse<{ id: string }>> {
  const supabase = createAdminClient();

  const { data: cycle, error: cycleErr } = await supabase
    .from('billing_cycles')
    .select('id, field_token_enabled, field_token_created_by')
    .eq('field_token', token)
    .maybeSingle();

  if (cycleErr) return { data: null, error: cycleErr.message };
  if (!cycle || !cycle.field_token_enabled) {
    return { data: null, error: 'This link is invalid or has been disabled.' };
  }
  if (cycle.id !== input.cycle_id) {
    return { data: null, error: 'Reading does not belong to this cycle' };
  }

  const result = await upsertReading(input, cycle.field_token_created_by, supabase as any);
  if (result.error) return { data: null, error: result.error };
  return { data: { id: result.data!.id }, error: null };
}
