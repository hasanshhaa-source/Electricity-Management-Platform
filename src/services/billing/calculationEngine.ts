/**
 * Pure billing calculation engine.
 * No database calls, no side effects. All functions are independently testable.
 *
 * Formula:
 *   flat_bill = flat_consumption × (total_building_cost / total_building_consumption)
 *   + difference_adjustment + previous_unpaid_balance
 */

import { runFormula, FormulaError } from '@/lib/billing/formulaEngine';

// ─── Input / Output types ─────────────────────────────────────────────────────

export type DiffDistributionMethod = 'proportional' | 'equal';

export interface FlatFormula {
  flatId:      string;
  formulaText: string;
}

export interface ReadingInput {
  meterId:       string;
  previousValue: number | null;  // null = first reading, consumption treated as 0
  currentValue:  number;
}

export interface MeterAssignment {
  meterId:      string;
  flatId:       string;
  sharePercent: number;  // 0–100
}

export interface ActiveTenancy {
  flatId:    string;
  tenancyId: string;
}

export interface CalculationInput {
  readings:                  ReadingInput[];
  assignments:               MeterAssignment[];
  activeTenancies:           ActiveTenancy[];
  totalBuildingCost:         number;   // sum of company bills amounts
  totalBuildingConsumption:  number;   // sum of company bills consumption (kWh)
  previousBalances:          Record<string, number>;  // flatId → unpaid from last cycle
  diffMethod:                DiffDistributionMethod;
  dueDate:                   string;   // YYYY-MM-DD
  periodYear:                number;
  periodMonth:               number;
  /** Active custom formulas keyed by flatId — optional, defaults to no overrides. */
  formulas?:                 Map<string, FlatFormula>;
  /** flatId → flatNumber, used to resolve ALLOCATE('flatNumber') targets in formulas. */
  flatNumbers?:              Record<string, string>;
  /** Flats excluded from the difference/residual distribution step. */
  excludedFromResidual?:     Set<string>;
}

export interface MeterContribution {
  meterId:          string;
  openingReading:   number | null;
  closingReading:   number;
  meterConsumption: number;
  sharePercent:     number;
  flatContribution: number;  // meterConsumption × sharePercent / 100
}

export interface FlatBillResult {
  flatId:               string;
  tenancyId:            string;
  consumption:          number;    // total allocated kWh for this flat
  openingReading:       number | null;  // from primary meter (first assignment)
  closingReading:       number | null;
  sharePercent:         number;         // from primary meter assignment
  ratePerUnit:          number;         // cost_per_kWh
  baseBill:             number;         // consumption × ratePerUnit
  differenceAdjustment: number;
  previousBalance:      number;
  totalDue:             number;         // baseBill + adjustment + previousBalance
  contributions:        MeterContribution[];
  calculationLog:       FlatBillCalcLog;
  excludedFromResidual: boolean;
  formulaApplied:       string | null;  // formula text, if one was used for this flat
  formulaError:         string | null;  // set if the formula failed and the default was used instead
}

export interface FlatBillCalcLog {
  totalBuildingCost:        number;
  totalBuildingConsumption: number;
  costPerUnit:              number;
  sumOfBaseBills:           number;
  difference:               number;
  diffMethod:               DiffDistributionMethod;
  meterContributions:       MeterContribution[];
  explanation:              string;
}

export interface CalculationSummary {
  totalBuildingCost:        number;
  totalBuildingConsumption: number;
  costPerUnit:              number;
  sumOfBaseBills:           number;
  difference:               number;
  totalCalculatedDue:       number;
  flatsCalculated:          number;
  flatsWithZeroConsumption: number;
}

export interface CalculationResult {
  flatBills: FlatBillResult[];
  summary:   CalculationSummary;
  warnings:  string[];
}

// ─── Step functions ───────────────────────────────────────────────────────────

/** Round to given decimal places using banker's rounding equivalent. */
export function round(value: number, decimals = 2): number {
  const factor = 10 ** decimals;
  return Math.round((value + Number.EPSILON) * factor) / factor;
}

/**
 * Step 1 — Calculate consumption per meter.
 * Returns a map of meterId → { consumption, openingReading, closingReading }.
 */
export function calcMeterConsumptions(
  readings: ReadingInput[],
): Map<string, { consumption: number; opening: number | null; closing: number }> {
  const map = new Map<string, { consumption: number; opening: number | null; closing: number }>();
  for (const r of readings) {
    const consumption =
      r.previousValue !== null
        ? round(Math.max(0, r.currentValue - r.previousValue), 3)
        : 0;
    map.set(r.meterId, { consumption, opening: r.previousValue, closing: r.currentValue });
  }
  return map;
}

/**
 * Step 2 — Distribute meter consumption to flats based on share percentages.
 * Returns a map of flatId → { totalConsumption, contributions[] }.
 */
export function calcFlatConsumptions(
  meterConsumptions: Map<string, { consumption: number; opening: number | null; closing: number }>,
  assignments: MeterAssignment[],
): Map<string, { totalConsumption: number; contributions: MeterContribution[] }> {
  const flatMap = new Map<string, { totalConsumption: number; contributions: MeterContribution[] }>();

  for (const a of assignments) {
    const mc = meterConsumptions.get(a.meterId);
    const flatContribution = mc
      ? round((mc.consumption * a.sharePercent) / 100, 3)
      : 0;

    const existing = flatMap.get(a.flatId) ?? { totalConsumption: 0, contributions: [] };
    existing.totalConsumption = round(existing.totalConsumption + flatContribution, 3);
    existing.contributions.push({
      meterId:          a.meterId,
      openingReading:   mc?.opening ?? null,
      closingReading:   mc?.closing ?? 0,
      meterConsumption: mc?.consumption ?? 0,
      sharePercent:     a.sharePercent,
      flatContribution,
    });
    flatMap.set(a.flatId, existing);
  }

  return flatMap;
}

/**
 * Step 3 — Calculate cost per unit.
 * Returns 0 if totalConsumption is 0 to avoid division by zero.
 */
export function calcCostPerUnit(totalCost: number, totalConsumption: number): number {
  if (totalConsumption <= 0) return 0;
  return round(totalCost / totalConsumption, 6);
}

/**
 * Step 4 — Calculate base bill per flat (before difference adjustment).
 */
export function calcBaseBills(
  flatConsumptions: Map<string, { totalConsumption: number; contributions: MeterContribution[] }>,
  activeTenancies: ActiveTenancy[],
  costPerUnit: number,
): Map<string, number> {
  const bills = new Map<string, number>();
  for (const t of activeTenancies) {
    const cons = flatConsumptions.get(t.flatId)?.totalConsumption ?? 0;
    bills.set(t.flatId, round(cons * costPerUnit, 2));
  }
  return bills;
}

export interface FormulaApplicationResult {
  baseBills:      Map<string, number>;
  appliedFormula: Map<string, string>;   // flatId → formula text that was successfully applied
  formulaErrors:  Map<string, string>;   // flatId → error message, if its formula failed
}

/**
 * Step 4b — Apply any active custom formulas, overriding the default base bill
 * for the flats they're attached to. A formula may also redirect amounts to
 * other flats via ALLOCATE(amount, 'flatNumber'). If a formula throws, that
 * flat silently falls back to its default base bill and the error is recorded.
 */
export function applyFormulas(
  baseBillsIn:       Map<string, number>,
  flatConsumptions:  Map<string, { totalConsumption: number; contributions: MeterContribution[] }>,
  activeTenancies:   ActiveTenancy[],
  costPerUnit:       number,
  previousBalances:  Record<string, number>,
  totalBuildingCost: number,
  totalBuildingConsumption: number,
  formulas:          Map<string, FlatFormula>,
  flatNumbers:       Record<string, string>,
): FormulaApplicationResult {
  const baseBills      = new Map(baseBillsIn);
  const appliedFormula = new Map<string, string>();
  const formulaErrors  = new Map<string, string>();

  if (formulas.size === 0) return { baseBills, appliedFormula, formulaErrors };

  const flatNumberToId = new Map(Object.entries(flatNumbers).map(([id, num]) => [num, id]));

  for (const tenancy of activeTenancies) {
    const formula = formulas.get(tenancy.flatId);
    if (!formula) continue;

    const otherFlats: Record<string, number[]> = { consumption: [], base_bill: [] };
    for (const other of activeTenancies) {
      if (other.flatId === tenancy.flatId) continue;
      otherFlats.consumption.push(flatConsumptions.get(other.flatId)?.totalConsumption ?? 0);
      otherFlats.base_bill.push(baseBillsIn.get(other.flatId) ?? 0);
    }

    const consumption = flatConsumptions.get(tenancy.flatId)?.totalConsumption ?? 0;
    const primary      = flatConsumptions.get(tenancy.flatId)?.contributions[0];

    try {
      const { value, allocations } = runFormula(formula.formulaText, {
        variables: {
          consumption,
          previous_reading:        primary?.openingReading ?? 0,
          current_reading:         primary?.closingReading ?? 0,
          rate_per_unit:           costPerUnit,
          base_bill:               baseBillsIn.get(tenancy.flatId) ?? 0,
          previous_balance:        previousBalances[tenancy.flatId] ?? 0,
          total_building_cost:     totalBuildingCost,
          total_building_consumption: totalBuildingConsumption,
        },
        otherFlats,
        resolveTarget: (flatNumber) => {
          const id = flatNumberToId.get(flatNumber);
          if (!id) throw new FormulaError(`Unknown flat number '${flatNumber}'`);
          return id;
        },
      });

      baseBills.set(tenancy.flatId, round(value, 2));
      for (const alloc of allocations) {
        baseBills.set(alloc.target, round((baseBills.get(alloc.target) ?? 0) + alloc.amount, 2));
      }
      appliedFormula.set(tenancy.flatId, formula.formulaText);
    } catch (err) {
      formulaErrors.set(tenancy.flatId, (err as Error).message);
    }
  }

  return { baseBills, appliedFormula, formulaErrors };
}

/**
 * Step 5 — Distribute the difference (total building cost − sum of base bills) across flats.
 *
 * Uses penny-perfect distribution: the last flat absorbs any residual from rounding,
 * so the sum of adjustments always equals the input difference exactly.
 */
export function distributeDifference(
  difference: number,
  flatConsumptions: Map<string, { totalConsumption: number; contributions: MeterContribution[] }>,
  allFlatIds: string[],
  method: DiffDistributionMethod,
  excludedFlatIds: Set<string> = new Set(),
): Map<string, number> {
  const adjustments = new Map<string, number>();
  for (const fid of excludedFlatIds) {
    if (allFlatIds.includes(fid)) adjustments.set(fid, 0);
  }

  const activeFlatIds = allFlatIds.filter((fid) => !excludedFlatIds.has(fid));
  if (activeFlatIds.length === 0) return adjustments;

  const diff2 = round(difference, 2);

  if (method === 'equal') {
    let allocated = 0;
    for (let i = 0; i < activeFlatIds.length; i++) {
      const fid = activeFlatIds[i];
      const isLast = i === activeFlatIds.length - 1;
      const adj = isLast ? round(diff2 - allocated, 2) : round(diff2 / activeFlatIds.length, 2);
      adjustments.set(fid, adj);
      allocated = round(allocated + adj, 2);
    }
    return adjustments;
  }

  // proportional (default)
  const totalConsumption = activeFlatIds.reduce(
    (s, fid) => s + (flatConsumptions.get(fid)?.totalConsumption ?? 0),
    0,
  );

  if (totalConsumption <= 0) {
    // Fall back to equal distribution when all consumptions are 0
    return distributeDifference(difference, flatConsumptions, allFlatIds, 'equal', excludedFlatIds);
  }

  let allocated = 0;
  for (let i = 0; i < activeFlatIds.length; i++) {
    const fid = activeFlatIds[i];
    const isLast = i === activeFlatIds.length - 1;
    const cons = flatConsumptions.get(fid)?.totalConsumption ?? 0;
    const adj = isLast
      ? round(diff2 - allocated, 2)
      : round((diff2 * cons) / totalConsumption, 2);
    adjustments.set(fid, adj);
    allocated = round(allocated + adj, 2);
  }

  return adjustments;
}

// ─── Main entry point ─────────────────────────────────────────────────────────

/**
 * Run the complete billing calculation for a building/period.
 *
 * Deterministic — same inputs always produce the same output.
 */
export function runBillingCalculation(input: CalculationInput): CalculationResult {
  const warnings: string[] = [];

  const {
    readings,
    assignments,
    activeTenancies,
    totalBuildingCost,
    totalBuildingConsumption,
    previousBalances,
    diffMethod,
    formulas             = new Map<string, FlatFormula>(),
    flatNumbers          = {},
    excludedFromResidual = new Set<string>(),
  } = input;

  if (activeTenancies.length === 0) {
    warnings.push('No active tenancies found — no bills will be generated.');
  }

  if (totalBuildingCost <= 0) {
    warnings.push('Total building cost is zero — bills will be zero.');
  }

  if (totalBuildingConsumption <= 0) {
    warnings.push('Total building consumption is zero — cost per unit cannot be calculated.');
  }

  // Validate readings
  const meterIds = new Set(assignments.map((a) => a.meterId));
  const readingMeterIds = new Set(readings.map((r) => r.meterId));
  for (const mid of meterIds) {
    if (!readingMeterIds.has(mid)) {
      warnings.push(`No reading found for meter ${mid} — consumption will be 0.`);
    }
  }

  // Step 1: meter consumptions
  const meterConsumptions = calcMeterConsumptions(readings);

  for (const [meterId, mc] of meterConsumptions) {
    if (mc.opening === null) {
      warnings.push(`Meter ${meterId} has no previous reading — consumption treated as 0.`);
    }
  }

  // Step 2: flat consumptions
  const flatConsumptions = calcFlatConsumptions(meterConsumptions, assignments);

  // Step 3: cost per unit
  const costPerUnit = calcCostPerUnit(totalBuildingCost, totalBuildingConsumption);

  // Step 4: base bills
  const defaultBaseBills = calcBaseBills(flatConsumptions, activeTenancies, costPerUnit);

  // Step 4b: apply any active custom formulas
  const { baseBills, appliedFormula, formulaErrors } = applyFormulas(
    defaultBaseBills, flatConsumptions, activeTenancies, costPerUnit,
    previousBalances, totalBuildingCost, totalBuildingConsumption,
    formulas, flatNumbers,
  );

  for (const [flatId, msg] of formulaErrors) {
    warnings.push(`Formula for flat ${flatNumbers[flatId] ?? flatId} failed (${msg}) — used default calculation instead.`);
  }

  // Step 5: sum and difference
  let sumOfBaseBills = 0;
  for (const v of baseBills.values()) sumOfBaseBills = round(sumOfBaseBills + v, 2);
  const difference = round(totalBuildingCost - sumOfBaseBills, 2);

  // Step 6: distribute difference
  const activeFlatIds = activeTenancies.map((t) => t.flatId);
  const adjustments = distributeDifference(difference, flatConsumptions, activeFlatIds, diffMethod, excludedFromResidual);

  // Step 7: assemble final bill results
  const flatBills: FlatBillResult[] = [];
  let totalCalculatedDue = 0;
  let flatsWithZeroConsumption = 0;

  for (const tenancy of activeTenancies) {
    const { flatId, tenancyId } = tenancy;
    const flatData     = flatConsumptions.get(flatId);
    const consumption  = round(flatData?.totalConsumption ?? 0, 3);
    const baseBill     = baseBills.get(flatId) ?? 0;
    const adjustment   = adjustments.get(flatId) ?? 0;
    const prevBalance  = round(previousBalances[flatId] ?? 0, 2);
    const totalDue     = round(baseBill + adjustment + prevBalance, 2);

    if (consumption === 0) flatsWithZeroConsumption++;

    const contributions = flatData?.contributions ?? [];
    const primary       = contributions[0];

    const explanation = buildExplanation({
      consumption, costPerUnit, baseBill, adjustment, prevBalance, totalDue,
      diffMethod, difference, totalBuildingCost, totalBuildingConsumption,
    });

    const calcLog: FlatBillCalcLog = {
      totalBuildingCost,
      totalBuildingConsumption,
      costPerUnit,
      sumOfBaseBills,
      difference,
      diffMethod,
      meterContributions: contributions,
      explanation,
    };

    flatBills.push({
      flatId,
      tenancyId,
      consumption,
      openingReading:       primary?.openingReading ?? null,
      closingReading:       primary?.closingReading ?? null,
      sharePercent:         primary?.sharePercent ?? 100,
      ratePerUnit:          costPerUnit,
      baseBill,
      differenceAdjustment: adjustment,
      previousBalance:      prevBalance,
      totalDue,
      contributions,
      calculationLog: calcLog,
      excludedFromResidual: excludedFromResidual.has(flatId),
      formulaApplied:       appliedFormula.get(flatId) ?? null,
      formulaError:         formulaErrors.get(flatId) ?? null,
    });

    totalCalculatedDue = round(totalCalculatedDue + totalDue, 2);
  }

  const summary: CalculationSummary = {
    totalBuildingCost,
    totalBuildingConsumption,
    costPerUnit,
    sumOfBaseBills,
    difference,
    totalCalculatedDue,
    flatsCalculated:          flatBills.length,
    flatsWithZeroConsumption,
  };

  return { flatBills, summary, warnings };
}

// ─── Internal helpers ─────────────────────────────────────────────────────────

function buildExplanation(params: {
  consumption: number;
  costPerUnit: number;
  baseBill: number;
  adjustment: number;
  prevBalance: number;
  totalDue: number;
  diffMethod: DiffDistributionMethod;
  difference: number;
  totalBuildingCost: number;
  totalBuildingConsumption: number;
}): string {
  const { consumption, costPerUnit, baseBill, adjustment, prevBalance, totalDue, diffMethod, difference } = params;
  const lines = [
    `Consumption: ${consumption} kWh`,
    `Rate: ${costPerUnit} per kWh`,
    `Base bill: ${consumption} × ${costPerUnit} = ${baseBill}`,
  ];
  if (adjustment !== 0) {
    lines.push(
      `Difference adjustment (${diffMethod}): ${adjustment >= 0 ? '+' : ''}${adjustment}`,
      `  Building total difference: ${difference}`,
    );
  }
  if (prevBalance > 0) {
    lines.push(`Previous unpaid balance: +${prevBalance}`);
  }
  lines.push(`Total due: ${totalDue}`);
  return lines.join('\n');
}
