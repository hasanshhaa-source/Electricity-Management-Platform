import { createClient } from '@/lib/supabase/server';
import type { MeterReading, ApiResponse } from '@/types';
import type { MeterReadingInput } from '@/lib/validation/billing';

// Loosely typed so either the cookie-bound server client or the
// service-role admin client (used by the no-login field reading link) can be passed in.
type SupabaseLike = ReturnType<typeof createClient> extends Promise<infer T> ? T : never;

export interface MeterReadingRow {
  meterId:     string;
  meterNumber: string;
  meterType:   string;
  unit:        string;
  linkedFlats: string; // e.g. "Flat 101" or "Flats 101, 102"
  previousReading: {
    value: number;
    date:  string;
    year:  number;
    month: number;
  } | null;
  currentReading: {
    id:             string;
    value:          number;
    date:           string;
    notes:          string | null;
    overrideReason: string | null;
    readingType:    string;
  } | null;
}

/** Returns the immediately preceding period (month - 1, wrapping year). */
function prevPeriod(year: number, month: number): { year: number; month: number } {
  return month === 1
    ? { year: year - 1, month: 12 }
    : { year, month: month - 1 };
}

/**
 * Returns all active meters for a building enriched with:
 * - previous period reading
 * - current period reading (if any)
 * - linked flat numbers
 */
export async function getReadingRowsForCycle(
  buildingId: string,
  periodYear: number,
  periodMonth: number,
  cycleId: string,
  client?: SupabaseLike,
): Promise<ApiResponse<MeterReadingRow[]>> {
  const supabase = client ?? (await createClient());

  // 1. Meters for building
  const { data: meters, error: metersErr } = await supabase
    .from('meters')
    .select('id, meter_number, meter_type, unit')
    .eq('building_id', buildingId)
    .eq('is_active', true)
    .is('deleted_at', null)
    .order('meter_number');

  if (metersErr) return { data: null, error: metersErr.message };
  if (!meters || meters.length === 0) return { data: [], error: null };

  const meterIds = meters.map((m) => m.id);
  const { year: prevYear, month: prevMonth } = prevPeriod(periodYear, periodMonth);

  // 2. Active flat_meter_assignments for these meters
  const { data: assignments } = await supabase
    .from('flat_meter_assignments')
    .select('meter_id, flat:flats(flat_number)')
    .in('meter_id', meterIds)
    .is('effective_to', null);

  // 3. Previous readings (from the month before)
  const { data: prevReadings } = await supabase
    .from('meter_readings')
    .select('meter_id, reading_value, reading_date, billing_period_year, billing_period_month')
    .in('meter_id', meterIds)
    .eq('billing_period_year', prevYear)
    .eq('billing_period_month', prevMonth);

  // Fallback: if no reading from immediately prior month, find most recent reading before this period
  const missingMeterIds = meterIds.filter(
    (id) => !prevReadings?.some((r) => r.meter_id === id),
  );
  let fallbackReadings: typeof prevReadings = [];
  if (missingMeterIds.length > 0) {
    // Fetch all historical readings for missing meters before this period, take latest per meter
    const { data: historical } = await supabase
      .from('meter_readings')
      .select('meter_id, reading_value, reading_date, billing_period_year, billing_period_month')
      .in('meter_id', missingMeterIds)
      .or(
        `billing_period_year.lt.${periodYear},and(billing_period_year.eq.${periodYear},billing_period_month.lt.${periodMonth})`,
      )
      .order('billing_period_year', { ascending: false })
      .order('billing_period_month', { ascending: false });

    // Keep only the most recent per meter
    const seen = new Set<string>();
    fallbackReadings = (historical ?? []).filter((r) => {
      if (seen.has(r.meter_id)) return false;
      seen.add(r.meter_id);
      return true;
    });
  }

  const allPrevReadings = [...(prevReadings ?? []), ...fallbackReadings];

  // 4. Current readings for this cycle
  const { data: currentReadings } = await supabase
    .from('meter_readings')
    .select('id, meter_id, reading_value, reading_date, notes, override_reason, reading_type')
    .in('meter_id', meterIds)
    .eq('billing_period_year', periodYear)
    .eq('billing_period_month', periodMonth);

  // 5. Build index maps
  const prevMap  = new Map((allPrevReadings ?? []).map((r) => [r.meter_id, r]));
  const currMap  = new Map((currentReadings ?? []).map((r) => [r.meter_id, r]));
  const flatMap  = new Map<string, string[]>();
  for (const a of assignments ?? []) {
    const flatNum = (a.flat as any)?.flat_number;
    if (!flatNum) continue;
    if (!flatMap.has(a.meter_id)) flatMap.set(a.meter_id, []);
    flatMap.get(a.meter_id)!.push(flatNum);
  }

  const rows: MeterReadingRow[] = meters.map((m) => {
    const flats  = (flatMap.get(m.id) ?? []).sort();
    const linked = flats.length === 0
      ? '—'
      : flats.length === 1
      ? `Flat ${flats[0]}`
      : `Flats ${flats.join(', ')}`;

    const prev = prevMap.get(m.id);
    const curr = currMap.get(m.id);

    return {
      meterId:     m.id,
      meterNumber: m.meter_number,
      meterType:   m.meter_type,
      unit:        m.unit,
      linkedFlats: linked,
      previousReading: prev
        ? { value: prev.reading_value, date: prev.reading_date, year: prev.billing_period_year, month: prev.billing_period_month }
        : null,
      currentReading: curr
        ? { id: curr.id, value: curr.reading_value, date: curr.reading_date, notes: curr.notes, overrideReason: curr.override_reason, readingType: curr.reading_type }
        : null,
    };
  });

  return { data: rows, error: null };
}

/**
 * Upserts a single meter reading for a billing cycle.
 * Validates current >= previous unless override_reason provided.
 */
export async function upsertReading(
  input: MeterReadingInput,
  adminId: string,
  client?: SupabaseLike,
): Promise<ApiResponse<MeterReading>> {
  const supabase = client ?? (await createClient());

  // Retrieve previous reading to validate
  const { year: prevYear, month: prevMonth } = prevPeriod(input.billing_period_year, input.billing_period_month);
  const { data: prevReading } = await supabase
    .from('meter_readings')
    .select('reading_value')
    .eq('meter_id', input.meter_id)
    .eq('billing_period_year', prevYear)
    .eq('billing_period_month', prevMonth)
    .maybeSingle();

  if (prevReading && input.reading_value < prevReading.reading_value) {
    if (!input.override_reason?.trim()) {
      return {
        data: null,
        error: `Current reading (${input.reading_value}) is less than previous reading (${prevReading.reading_value}). Provide an override reason to proceed.`,
      };
    }
  }

  const payload = {
    meter_id:             input.meter_id,
    cycle_id:             input.cycle_id ?? null,
    reading_value:        input.reading_value,
    reading_date:         input.reading_date,
    billing_period_year:  input.billing_period_year,
    billing_period_month: input.billing_period_month,
    reading_type:         input.reading_type,
    override_reason:      input.override_reason ?? null,
    notes:                input.notes ?? null,
    recorded_by:          adminId,
  };

  // Upsert on the unique key (meter_id, period_year, period_month)
  const { data: existing } = await supabase
    .from('meter_readings')
    .select('id')
    .eq('meter_id', input.meter_id)
    .eq('billing_period_year', input.billing_period_year)
    .eq('billing_period_month', input.billing_period_month)
    .maybeSingle();

  let result;
  if (existing) {
    result = await supabase
      .from('meter_readings')
      .update(payload)
      .eq('id', existing.id)
      .select()
      .single();
  } else {
    result = await supabase
      .from('meter_readings')
      .insert(payload)
      .select()
      .single();
  }

  if (result.error) return { data: null, error: result.error.message };
  return { data: result.data, error: null };
}

export async function deleteReading(id: string): Promise<ApiResponse<null>> {
  const supabase = await createClient();
  const { error } = await supabase.from('meter_readings').delete().eq('id', id);
  if (error) return { data: null, error: error.message };
  return { data: null, error: null };
}
