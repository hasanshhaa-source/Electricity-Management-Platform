/**
 * DB orchestration layer for the spreadsheet-style billing sheet.
 * Persists cycle_sheets / sheet_cells / sheet_cell_formulas.
 * Calls the pure sheetEngine.ts for evaluation — no computation logic here.
 */
import { createClient } from '@/lib/supabase/server';
import type { ApiResponse } from '@/types';
import { evaluateSheet, lit, formula as fml, type Sheet } from '@/lib/billing/sheetEngine';

// ─── Types ────────────────────────────────────────────────────────────────────

export interface SheetCellRow {
  id:             string;
  cell_name:      string;
  formula_text:   string | null;
  literal_value:  number | null;
  computed_value: number | null;
  is_input:       boolean;
  display_order:  number | null;
}

export interface CycleSheetRow {
  id:           string;
  cycle_id:     string;
  published_at: string | null;
  created_at:   string;
  updated_at:   string;
}

// ─── Helpers ──────────────────────────────────────────────────────────────────

function prevPeriod(year: number, month: number): { year: number; month: number } {
  return month === 1 ? { year: year - 1, month: 12 } : { year, month: month - 1 };
}

/** Build the Sheet object that sheetEngine.evaluateSheet() expects, from DB rows. */
function buildSheet(cells: SheetCellRow[]): Sheet {
  const sheet: Sheet = {};
  for (const c of cells) {
    if (c.formula_text) {
      sheet[c.cell_name] = fml(c.formula_text);
    } else if (c.literal_value !== null) {
      sheet[c.cell_name] = lit(Number(c.literal_value));
    }
    // cells with neither are placeholders — skip (engine will report unknown-ref if referenced)
  }
  return sheet;
}

// ─── Public API ───────────────────────────────────────────────────────────────

/**
 * Finds or creates the cycle_sheets row for this cycle.
 * Returns the sheet metadata + all sheet_cells rows (unsorted, sorted by display_order
 * can be done client-side).
 */
export async function getOrCreateCycleSheet(
  cycleId: string,
): Promise<ApiResponse<{ sheet: CycleSheetRow; cells: SheetCellRow[] }>> {
  const supabase = await createClient();

  // Upsert the sheet row (noop if already exists)
  const { error: upsertErr } = await supabase
    .from('cycle_sheets')
    .upsert({ cycle_id: cycleId }, { onConflict: 'cycle_id', ignoreDuplicates: true });
  if (upsertErr) return { data: null, error: upsertErr.message };

  const { data: sheet, error: sheetErr } = await supabase
    .from('cycle_sheets')
    .select('*')
    .eq('cycle_id', cycleId)
    .single();
  if (sheetErr || !sheet) return { data: null, error: sheetErr?.message ?? 'Sheet not found' };

  const { data: cells, error: cellsErr } = await supabase
    .from('sheet_cells')
    .select('id, cell_name, formula_text, literal_value, computed_value, is_input, display_order')
    .eq('sheet_id', sheet.id)
    .order('display_order', { ascending: true, nullsFirst: false });
  if (cellsErr) return { data: null, error: cellsErr.message };

  return { data: { sheet, cells: cells ?? [] }, error: null };
}

/**
 * Auto-populates a fresh sheet with raw input cells derived from meter readings,
 * company bills, and the building's saved formula template. No-ops if any cells
 * already exist for this sheet (never clobbers existing admin edits).
 */
export async function autoPopulateSheet(
  cycleId:     string,
  buildingId:  string,
  periodYear:  number,
  periodMonth: number,
): Promise<ApiResponse<null>> {
  const supabase = await createClient();

  // Resolve sheet id
  const { data: sheetRow, error: sheetErr } = await supabase
    .from('cycle_sheets')
    .select('id')
    .eq('cycle_id', cycleId)
    .single();
  if (sheetErr || !sheetRow) return { data: null, error: sheetErr?.message ?? 'Sheet not found' };
  const sheetId = sheetRow.id;

  // No-op guard: if any cells exist, don't overwrite
  const { count } = await supabase
    .from('sheet_cells')
    .select('id', { count: 'exact', head: true })
    .eq('sheet_id', sheetId);
  if ((count ?? 0) > 0) return { data: null, error: null };

  // ── Fetch raw data ─────────────────────────────────────────────────────────

  const { year: prevYear, month: prevMonth } = prevPeriod(periodYear, periodMonth);

  const [
    { data: meters },
    { data: assignments },
    { data: currentReadings },
    { data: prevReadings },
    { data: bills },
    { data: flats },
    { data: tenancies },
  ] = await Promise.all([
    supabase.from('meters').select('id, meter_number').eq('building_id', buildingId).eq('is_active', true).is('deleted_at', null),
    supabase.from('flat_meter_assignments').select('meter_id, flat_id, share_percent').is('effective_to', null),
    supabase.from('meter_readings').select('meter_id, reading_value').in('meter_id', [] as string[]).eq('billing_period_year', periodYear).eq('billing_period_month', periodMonth),
    supabase.from('meter_readings').select('meter_id, reading_value').in('meter_id', [] as string[]).eq('billing_period_year', prevYear).eq('billing_period_month', prevMonth),
    supabase.from('electricity_company_bills').select('id, bill_number, total_amount, total_units').eq('building_id', buildingId).eq('period_year', periodYear).eq('period_month', periodMonth).is('deleted_at', null),
    supabase.from('flats').select('id, flat_number').eq('building_id', buildingId).is('deleted_at', null),
    supabase.from('tenancies').select('flat_id').eq('status', 'active'),
  ]);

  const meterIds = (meters ?? []).map((m: any) => m.id);

  // Re-fetch readings with proper meter id filter
  const [{ data: currR }, { data: prevR }] = await Promise.all([
    supabase.from('meter_readings').select('meter_id, reading_value').in('meter_id', meterIds).eq('billing_period_year', periodYear).eq('billing_period_month', periodMonth),
    supabase.from('meter_readings').select('meter_id, reading_value').in('meter_id', meterIds).eq('billing_period_year', prevYear).eq('billing_period_month', prevMonth),
  ]);

  // Fallback: for meters missing an exact prior-month reading, find most recent historical
  const prevMap = new Map((prevR ?? []).map((r: any) => [r.meter_id, Number(r.reading_value)]));
  const missingMeterIds = meterIds.filter((id) => !prevMap.has(id));
  if (missingMeterIds.length > 0) {
    const { data: historical } = await supabase
      .from('meter_readings')
      .select('meter_id, reading_value, billing_period_year, billing_period_month')
      .in('meter_id', missingMeterIds)
      .or(`billing_period_year.lt.${periodYear},and(billing_period_year.eq.${periodYear},billing_period_month.lt.${periodMonth})`)
      .order('billing_period_year', { ascending: false })
      .order('billing_period_month', { ascending: false });
    const seen = new Set<string>();
    for (const r of historical ?? []) {
      if (!seen.has(r.meter_id)) { prevMap.set(r.meter_id, Number(r.reading_value)); seen.add(r.meter_id); }
    }
  }

  const currMap = new Map((currR ?? []).map((r: any) => [r.meter_id, Number(r.reading_value)]));
  const activeFlatIds = new Set((tenancies ?? []).map((t: any) => t.flat_id));

  // ── Build per-flat consumption from assignments ────────────────────────────

  // flat_id → { consumption, prevReading, currReading }
  const flatConsumption = new Map<string, { consumption: number; prev: number | null; curr: number | null }>();
  for (const asgn of assignments ?? []) {
    const curr = currMap.get(asgn.meter_id);
    if (curr === undefined) continue; // no reading this cycle — skip meter
    const prev = prevMap.get(asgn.meter_id) ?? null;
    const delta = prev !== null ? Math.max(0, curr - prev) : 0;
    const share = Number(asgn.share_percent) / 100;
    const existing = flatConsumption.get(asgn.flat_id);
    if (existing) {
      existing.consumption += delta * share;
    } else {
      flatConsumption.set(asgn.flat_id, { consumption: delta * share, prev, curr });
    }
  }

  // ── Build input cells ──────────────────────────────────────────────────────

  const flatNumberById = new Map((flats ?? []).map((f: any) => [f.id, String(f.flat_number)]));
  const inputCells: Omit<SheetCellRow, 'id'>[] = [];
  let displayOrder = 0;

  for (const [flatId, data] of flatConsumption) {
    const flatNum = flatNumberById.get(flatId);
    if (!flatNum) continue;
    const isVacant = !activeFlatIds.has(flatId) ? 1 : 0;
    inputCells.push({ cell_name: `flat:${flatNum}:consumption`, formula_text: null, literal_value: Math.round(data.consumption * 1000) / 1000, computed_value: null, is_input: true, display_order: displayOrder++ });
    if (data.prev !== null) inputCells.push({ cell_name: `flat:${flatNum}:previous_reading`, formula_text: null, literal_value: data.prev, computed_value: null, is_input: true, display_order: displayOrder++ });
    if (data.curr !== null) inputCells.push({ cell_name: `flat:${flatNum}:current_reading`,  formula_text: null, literal_value: data.curr, computed_value: null, is_input: true, display_order: displayOrder++ });
    inputCells.push({ cell_name: `flat:${flatNum}:vacant`,       formula_text: null, literal_value: isVacant, computed_value: null, is_input: true, display_order: displayOrder++ });
    inputCells.push({ cell_name: `flat:${flatNum}:meter_error`,  formula_text: null, literal_value: 0,        computed_value: null, is_input: true, display_order: displayOrder++ });
  }

  for (const bill of bills ?? []) {
    const num = bill.bill_number;
    inputCells.push({ cell_name: `bill:${num}:cost`,        formula_text: null, literal_value: Number(bill.total_amount), computed_value: null, is_input: true, display_order: displayOrder++ });
    inputCells.push({ cell_name: `bill:${num}:consumption`, formula_text: null, literal_value: Number(bill.total_units),  computed_value: null, is_input: true, display_order: displayOrder++ });
  }

  // ── Fetch building formula template and insert formula cells ─────────────

  const { data: templateRows } = await supabase
    .from('sheet_cell_formulas')
    .select('cell_name, formula_text')
    .eq('building_id', buildingId);

  const templateCells: Omit<SheetCellRow, 'id'>[] = (templateRows ?? []).map((r: any) => ({
    cell_name:     r.cell_name,
    formula_text:  r.formula_text,
    literal_value: null,
    computed_value: null,
    is_input:      false,
    display_order: displayOrder++,
  }));

  // If no template exists yet, insert minimal placeholder pool formulas
  if (templateCells.length === 0 && (bills ?? []).length > 0) {
    const billNums = (bills ?? []).map((b: any) => b.bill_number);
    const poolCostFormula   = billNums.map((n: string) => `bill:${n}:cost`).join(' + ');
    const poolConsuFormula  = billNums.map((n: string) => `bill:${n}:consumption`).join(' + ');
    templateCells.push(
      { cell_name: 'pool:total_cost',        formula_text: poolCostFormula,  literal_value: null, computed_value: null, is_input: false, display_order: displayOrder++ },
      { cell_name: 'pool:total_consumption', formula_text: poolConsuFormula, literal_value: null, computed_value: null, is_input: false, display_order: displayOrder++ },
      { cell_name: 'pool:rate',              formula_text: 'pool:total_cost / pool:total_consumption', literal_value: null, computed_value: null, is_input: false, display_order: displayOrder++ },
    );
    for (const [flatId] of flatConsumption) {
      const flatNum = flatNumberById.get(flatId);
      if (!flatNum) continue;
      templateCells.push(
        { cell_name: `flat:${flatNum}:bill`,       formula_text: `flat:${flatNum}:consumption * pool:rate`, literal_value: null, computed_value: null, is_input: false, display_order: displayOrder++ },
        { cell_name: `flat:${flatNum}:final_bill`, formula_text: `flat:${flatNum}:bill`,                    literal_value: null, computed_value: null, is_input: false, display_order: displayOrder++ },
      );
    }
  }

  // ── Persist all cells ──────────────────────────────────────────────────────

  const allCells = [...inputCells, ...templateCells].map((c) => ({ ...c, sheet_id: sheetId }));
  if (allCells.length > 0) {
    const { error: insertErr } = await supabase
      .from('sheet_cells')
      .insert(allCells)
      .select('id');
    if (insertErr) return { data: null, error: insertErr.message };
  }

  return { data: null, error: null };
}

/**
 * Admin edits a single cell — sets a formula (clears literal) or a literal override
 * (clears formula). Resets computed_value so the next evaluate picks it up.
 */
export async function upsertCell(
  sheetId:     string,
  cellName:    string,
  update: {
    formulaText?:  string | null;
    literalValue?: number | null;
    displayOrder?: number;
  },
): Promise<ApiResponse<null>> {
  const supabase = await createClient();

  const isFormula  = update.formulaText != null && update.formulaText.trim() !== '';
  const payload: Record<string, unknown> = {
    sheet_id:       sheetId,
    cell_name:      cellName,
    computed_value: null,
    updated_at:     new Date().toISOString(),
  };

  if (isFormula) {
    payload.formula_text  = update.formulaText;
    payload.literal_value = null;
    payload.is_input      = false;
  } else {
    payload.formula_text  = null;
    payload.literal_value = update.literalValue ?? null;
    payload.is_input      = true;
  }
  if (update.displayOrder !== undefined) payload.display_order = update.displayOrder;

  const { error } = await supabase
    .from('sheet_cells')
    .upsert(payload, { onConflict: 'sheet_id,cell_name' });
  if (error) return { data: null, error: error.message };

  return { data: null, error: null };
}

/**
 * Evaluates every cell in the sheet, stores computed_value back into sheet_cells,
 * and returns the full results map plus any per-cell errors.
 */
export async function evaluateCycleSheet(
  sheetId: string,
): Promise<ApiResponse<{ results: Record<string, number>; errors: Record<string, string> }>> {
  const supabase = await createClient();

  const { data: cellRows, error: fetchErr } = await supabase
    .from('sheet_cells')
    .select('id, cell_name, formula_text, literal_value, computed_value, is_input, display_order')
    .eq('sheet_id', sheetId);
  if (fetchErr || !cellRows) return { data: null, error: fetchErr?.message ?? 'Failed to fetch cells' };

  const sheet = buildSheet(cellRows);
  const results: Record<string, number> = {};
  const errors:  Record<string, string> = {};

  // Evaluate each cell independently so one error doesn't block all others
  for (const name of Object.keys(sheet)) {
    try {
      const { values } = evaluateSheet({ [name]: sheet[name], ...sheet });
      // evaluateSheet resolves transitive deps, so results contains more than just `name`
      // — merge all resolved values (safe: idempotent for already-resolved cells)
      for (const [k, v] of Object.entries(values)) results[k] = v;
    } catch (e: any) {
      errors[name] = e.message ?? 'Unknown error';
    }
  }

  // Full evaluation pass to ensure all cells are resolved together (handles cross-deps)
  try {
    const { values } = evaluateSheet(sheet);
    for (const [k, v] of Object.entries(values)) results[k] = v;
  } catch {
    // Partial results already collected above — proceed
  }

  // Persist computed_value back to DB
  const updates = cellRows
    .filter((c) => results[c.cell_name] !== undefined)
    .map((c) => ({ id: c.id, computed_value: results[c.cell_name], updated_at: new Date().toISOString() }));

  for (const upd of updates) {
    await supabase.from('sheet_cells').update({ computed_value: upd.computed_value, updated_at: upd.updated_at }).eq('id', upd.id);
  }

  return { data: { results, errors }, error: null };
}

/**
 * Returns the published billing outputs (per-flat consumption + final bill) for use
 * by payments, analytics, and any other downstream consumer. Only works if the sheet
 * has been published (published_at IS NOT NULL) and all required output cells have
 * computed_value set.
 */
export async function getPublishedOutputs(
  cycleId: string,
): Promise<ApiResponse<{ flatBills: Record<string, { consumption: number; finalBill: number }> }>> {
  const supabase = await createClient();

  const { data: sheetRow, error: sheetErr } = await supabase
    .from('cycle_sheets')
    .select('id, published_at')
    .eq('cycle_id', cycleId)
    .single();
  if (sheetErr || !sheetRow) return { data: null, error: 'No sheet found for this cycle' };
  if (!sheetRow.published_at)  return { data: null, error: 'Sheet has not been published yet' };

  const { data: cells, error: cellsErr } = await supabase
    .from('sheet_cells')
    .select('cell_name, computed_value')
    .eq('sheet_id', sheetRow.id);
  if (cellsErr || !cells) return { data: null, error: cellsErr?.message ?? 'Failed to fetch cells' };

  // Collect flat numbers from output cells
  const flatNums = new Set<string>();
  for (const c of cells) {
    const m = /^flat:([^:]+):final_bill$/.exec(c.cell_name);
    if (m) flatNums.add(m[1]);
  }

  // Map flat_number → flat_id via DB
  const { data: flats } = await supabase
    .from('flats')
    .select('id, flat_number')
    .in('flat_number', [...flatNums]);

  const flatIdByNumber = new Map((flats ?? []).map((f: any) => [String(f.flat_number), f.id as string]));
  const cellMap = new Map(cells.map((c) => [c.cell_name, c.computed_value]));
  const flatBills: Record<string, { consumption: number; finalBill: number }> = {};

  for (const flatNum of flatNums) {
    const flatId = flatIdByNumber.get(flatNum);
    if (!flatId) continue;
    const consumption = cellMap.get(`flat:${flatNum}:consumption`);
    const finalBill   = cellMap.get(`flat:${flatNum}:final_bill`);
    if (consumption === null || consumption === undefined || finalBill === null || finalBill === undefined) continue;
    flatBills[flatId] = { consumption: Number(consumption), finalBill: Number(finalBill) };
  }

  return { data: { flatBills }, error: null };
}

/** Publishes the sheet, locking in the final computed values for downstream consumers. */
export async function publishSheet(sheetId: string): Promise<ApiResponse<null>> {
  const supabase = await createClient();

  // Validate all output cells have computed values
  const { data: cells } = await supabase
    .from('sheet_cells')
    .select('cell_name, computed_value')
    .eq('sheet_id', sheetId)
    .or('cell_name.like.flat:%:final_bill,cell_name.like.flat:%:consumption');

  const missing = (cells ?? []).filter((c) => c.computed_value === null).map((c) => c.cell_name);
  if (missing.length > 0) return { data: null, error: `Cannot publish: missing computed values for: ${missing.join(', ')}` };

  const { error } = await supabase
    .from('cycle_sheets')
    .update({ published_at: new Date().toISOString(), updated_at: new Date().toISOString() })
    .eq('id', sheetId);
  if (error) return { data: null, error: error.message };

  return { data: null, error: null };
}

/** Saves a formula into the building-level template for carry-forward to future cycles. */
export async function saveFormulaTemplate(
  buildingId:  string,
  cellName:    string,
  formulaText: string,
): Promise<ApiResponse<null>> {
  const supabase = await createClient();
  const { error } = await supabase
    .from('sheet_cell_formulas')
    .upsert({ building_id: buildingId, cell_name: cellName, formula_text: formulaText, updated_at: new Date().toISOString() }, { onConflict: 'building_id,cell_name' });
  if (error) return { data: null, error: error.message };
  return { data: null, error: null };
}
