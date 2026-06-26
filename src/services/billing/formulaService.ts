import { createClient } from '@/lib/supabase/server';
import { runFormula, FormulaError } from '@/lib/billing/formulaEngine';
import type { ApiResponse } from '@/types';
import type { FlatBillFormulaInput } from '@/lib/validation/billing';
import type { FlatFormula, FormulaTarget } from './calculationEngine';

export interface FlatBillFormula {
  id:             string;
  flatId:         string;
  meterId:        string | null;
  cycleId:        string | null;
  formulaText:    string;
  formulaTarget:  FormulaTarget;
  isActive:       boolean;
  createdAt:      string;
}

/** Dry-runs a formula against a representative dummy context to catch syntax/logic errors before saving. */
export function validateFormulaSyntax(formulaText: string): { valid: boolean; error: string | null } {
  try {
    runFormula(formulaText, {
      variables: {
        consumption: 100, previous_reading: 1000, current_reading: 1100,
        rate_per_unit: 0.5, base_bill: 50, previous_balance: 0,
        total_building_cost: 1000, total_building_consumption: 2000,
      },
      otherFlats: { consumption: [80, 120], base_bill: [40, 60] },
      resolveTarget: () => 'dummy-flat-id',
    });
    return { valid: true, error: null };
  } catch (err) {
    return { valid: false, error: err instanceof FormulaError ? err.message : 'Invalid formula' };
  }
}

export async function upsertFlatBillFormula(
  input: FlatBillFormulaInput,
  adminId: string,
): Promise<ApiResponse<FlatBillFormula>> {
  const check = validateFormulaSyntax(input.formula_text);
  if (!check.valid) return { data: null, error: `Formula error: ${check.error}` };

  const supabase = await createClient();

  // One active formula per (flat, cycle-or-persistent, formula_target) — replace
  // if it already exists. A flat may have several simultaneously-active formulas
  // as long as each targets a different column (enforced by the partial unique
  // indexes added in migration 016).
  const existingQuery = supabase
    .from('flat_bill_formulas')
    .select('id')
    .eq('flat_id', input.flat_id)
    .eq('formula_target', input.formula_target)
    .eq('is_active', true);

  const { data: existing } = input.cycle_id
    ? await existingQuery.eq('cycle_id', input.cycle_id).maybeSingle()
    : await existingQuery.is('cycle_id', null).maybeSingle();

  const row = {
    flat_id:        input.flat_id,
    meter_id:       input.meter_id ?? null,
    cycle_id:       input.cycle_id ?? null,
    formula_text:   input.formula_text,
    formula_target: input.formula_target,
    is_active:      true,
    created_by:     adminId,
    updated_at:     new Date().toISOString(),
  };

  const { data, error } = existing
    ? await supabase.from('flat_bill_formulas').update(row).eq('id', existing.id).select().single()
    : await supabase.from('flat_bill_formulas').insert(row).select().single();

  if (error) return { data: null, error: error.message };

  return {
    data: {
      id:            data.id,
      flatId:        data.flat_id,
      meterId:       data.meter_id,
      cycleId:       data.cycle_id,
      formulaText:   data.formula_text,
      formulaTarget: data.formula_target,
      isActive:      data.is_active,
      createdAt:     data.created_at,
    },
    error: null,
  };
}

export async function deleteFlatBillFormula(id: string): Promise<ApiResponse<null>> {
  const supabase = await createClient();
  const { error } = await supabase.from('flat_bill_formulas').update({ is_active: false }).eq('id', id);
  if (error) return { data: null, error: error.message };
  return { data: null, error: null };
}

/**
 * Resolves the active formula set for a calculation run: for a given
 * (flat, formula_target) pair, a cycle-specific formula takes priority over a
 * persistent (cycle_id = NULL) one. A flat may end up with multiple formulas
 * in its list, one per distinct target.
 */
export async function getActiveFormulasForCycle(
  buildingId: string,
  cycleId: string,
): Promise<Map<string, FlatFormula[]>> {
  const supabase = await createClient();

  const { data: flats } = await supabase.from('flats').select('id').eq('building_id', buildingId);
  const flatIds = (flats ?? []).map((f: any) => f.id);
  if (flatIds.length === 0) return new Map();

  const { data: rows } = await supabase
    .from('flat_bill_formulas')
    .select('flat_id, cycle_id, formula_text, formula_target')
    .in('flat_id', flatIds)
    .eq('is_active', true)
    .or(`cycle_id.eq.${cycleId},cycle_id.is.null`);

  // Resolve one winning formula per (flat_id, formula_target): persistent first,
  // then let cycle-specific rows override the same key.
  const byKey = new Map<string, FlatFormula>();
  const keyOf = (flatId: string, target: string) => `${flatId}::${target}`;

  for (const r of (rows ?? []).filter((r: any) => r.cycle_id === null)) {
    byKey.set(keyOf(r.flat_id, r.formula_target), { flatId: r.flat_id, formulaText: r.formula_text, target: r.formula_target });
  }
  for (const r of (rows ?? []).filter((r: any) => r.cycle_id === cycleId)) {
    byKey.set(keyOf(r.flat_id, r.formula_target), { flatId: r.flat_id, formulaText: r.formula_text, target: r.formula_target });
  }

  const result = new Map<string, FlatFormula[]>();
  for (const formula of byKey.values()) {
    const list = result.get(formula.flatId) ?? [];
    list.push(formula);
    result.set(formula.flatId, list);
  }
  return result;
}

export async function getFormulasForBuilding(buildingId: string, cycleId: string): Promise<ApiResponse<FlatBillFormula[]>> {
  const supabase = await createClient();
  const { data: flats } = await supabase.from('flats').select('id').eq('building_id', buildingId);
  const flatIds = (flats ?? []).map((f: any) => f.id);
  if (flatIds.length === 0) return { data: [], error: null };

  const { data, error } = await supabase
    .from('flat_bill_formulas')
    .select('id, flat_id, meter_id, cycle_id, formula_text, formula_target, is_active, created_at')
    .in('flat_id', flatIds)
    .eq('is_active', true)
    .or(`cycle_id.eq.${cycleId},cycle_id.is.null`);

  if (error) return { data: null, error: error.message };

  return {
    data: (data ?? []).map((d: any) => ({
      id: d.id, flatId: d.flat_id, meterId: d.meter_id, cycleId: d.cycle_id,
      formulaText: d.formula_text, formulaTarget: d.formula_target, isActive: d.is_active, createdAt: d.created_at,
    })),
    error: null,
  };
}
