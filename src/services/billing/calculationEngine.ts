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
  /** What the formula's result replaces. Defaults to 'base_bill' (the whole bill amount)
   *  for backward compatibility. 'consumption' overrides only the consumption value,
   *  letting the normal rate/difference math run on top of it. */
  target?:     'base_bill' | 'consumption';
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
  /**
   * When present and non-empty, switches to per-bill-group calculation: each group
   * represents one or more company bills linked to a specific set of meters, with its
   * own rate and its own difference/residual reconciliation — instead of one
   * building-wide pool. Meters not covered by any group contribute no consumption.
   * Omit (or pass empty) to use the original single-pool behavior unchanged.
   */
  billGroups?:               BillGroupInput[];
  /**
   * flatId → fixed amount from company bills billed directly to that flat (e.g. the
   * owner absorbing a vacant flat's cost) — added straight to totalDue, bypassing
   * consumption math and the difference/residual distribution entirely.
   */
  lumpSumCharges?:           Record<string, number>;
  /** meterId → meterNumber, used to resolve METER('meterNumber').field lookups in formulas. */
  meterNumbers?:             Record<string, string>;
  /**
   * Pre-formula default values for each company bill, keyed by its natural bill_number,
   * used to resolve BILL('billNumber').field lookups in formulas. Built once by the
   * caller from the same company-bill data used to derive totalBuildingCost/billGroups —
   * this module does no DB access, so it never fetches bill data itself.
   */
  billDefaults?:             Record<string, { total_amount: number; total_units: number; rate: number }>;
}

export interface BillGroupInput {
  /** Identifier for this group — typically the company bill id, used only for logging. */
  groupKey:         string;
  totalCost:        number;
  totalConsumption: number;
  /** Meters whose consumption is pooled against this group's cost. */
  meterIds:         string[];
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
  lumpSumCharges:       number;         // fixed amount billed directly to this flat, outside consumption math
  totalDue:             number;         // baseBill + adjustment + previousBalance + lumpSumCharges
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
  /** Present only in grouped (bill-linked) mode — the bill group(s) this flat draws from. */
  billGroups?:              { groupKey: string; cost: number; consumption: number; rate: number }[];
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
  baseBills:           Map<string, number>;
  appliedFormula:      Map<string, string>;   // flatId → formula text that was successfully applied
  formulaErrors:       Map<string, string>;   // flatId → error message, if its formula failed
  consumptionOverrides: Map<string, number>;  // flatId → new consumption, for 'consumption'-target formulas
}

/**
 * Step 4b — Apply any active custom formulas, overriding the default base bill
 * (or, for 'consumption'-target formulas, just the consumption value) for the
 * flats they're attached to. A base_bill-target formula may also redirect
 * amounts to other flats via ALLOCATE(amount, 'flatNumber'); ALLOCATE isn't
 * permitted in consumption-target formulas since its argument is a money
 * amount, not a consumption delta. If a formula throws, that flat silently
 * falls back to its default base bill and the error is recorded.
 */
export function applyFormulas(
  baseBillsIn:       Map<string, number>,
  flatConsumptions:  Map<string, { totalConsumption: number; contributions: MeterContribution[] }>,
  activeTenancies:   ActiveTenancy[],
  ratePerUnitByFlat: Map<string, number>,
  previousBalances:  Record<string, number>,
  totalBuildingCost: number,
  totalBuildingConsumption: number,
  formulas:          Map<string, FlatFormula>,
  flatNumbers:       Record<string, string>,
  meterNumbers:      Record<string, string> = {},
  billDefaults:      Record<string, { total_amount: number; total_units: number; rate: number }> = {},
): FormulaApplicationResult {
  const baseBills           = new Map(baseBillsIn);
  const appliedFormula      = new Map<string, string>();
  const formulaErrors       = new Map<string, string>();
  const consumptionOverrides = new Map<string, number>();

  if (formulas.size === 0) return { baseBills, appliedFormula, formulaErrors, consumptionOverrides };

  const flatNumberToId = new Map(Object.entries(flatNumbers).map(([id, num]) => [num, id]));

  // ── Lookup snapshots for FLAT()/METER()/BILL() — built once, from the same
  // pre-formula defaults already in scope, read-only across all flats' evaluations.
  const flatDefaultsByNumber = new Map<string, { consumption: number; base_bill: number; previous_balance: number; rate_per_unit: number }>();
  for (const [flatId, flatNumber] of Object.entries(flatNumbers)) {
    flatDefaultsByNumber.set(flatNumber, {
      consumption:      flatConsumptions.get(flatId)?.totalConsumption ?? 0,
      base_bill:        baseBillsIn.get(flatId) ?? 0,
      previous_balance: previousBalances[flatId] ?? 0,
      rate_per_unit:    ratePerUnitByFlat.get(flatId) ?? 0,
    });
  }

  const meterDefaultsByNumber = new Map<string, { consumption: number }>();
  for (const flatId of flatConsumptions.keys()) {
    const contributions = flatConsumptions.get(flatId)?.contributions ?? [];
    for (const c of contributions) {
      const meterNumber = meterNumbers[c.meterId];
      if (!meterNumber) continue;
      const existing = meterDefaultsByNumber.get(meterNumber);
      meterDefaultsByNumber.set(meterNumber, { consumption: (existing?.consumption ?? 0) + c.meterConsumption });
    }
  }

  const lookupFlat = (flatNumber: string, field: string): number => {
    const data = flatDefaultsByNumber.get(flatNumber);
    if (!data) throw new FormulaError(`Unknown flat number '${flatNumber}'`);
    if (!(field in data)) throw new FormulaError(`Unknown field '${field}' for FLAT('${flatNumber}')`);
    return (data as Record<string, number>)[field];
  };

  const lookupMeter = (meterNumber: string, field: string): number => {
    const data = meterDefaultsByNumber.get(meterNumber);
    if (!data) throw new FormulaError(`Unknown meter number '${meterNumber}'`);
    if (!(field in data)) throw new FormulaError(`Unknown field '${field}' for METER('${meterNumber}')`);
    return (data as Record<string, number>)[field];
  };

  const lookupBill = (billNumber: string, field: string): number => {
    const data = billDefaults[billNumber];
    if (!data) throw new FormulaError(`Unknown bill number '${billNumber}'`);
    if (!(field in data)) throw new FormulaError(`Unknown field '${field}' for BILL('${billNumber}')`);
    return (data as Record<string, number>)[field];
  };

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
    const rate         = ratePerUnitByFlat.get(tenancy.flatId) ?? 0;
    const target        = formula.target ?? 'base_bill';

    try {
      const { value, allocations } = runFormula(formula.formulaText, {
        variables: {
          consumption,
          previous_reading:        primary?.openingReading ?? 0,
          current_reading:         primary?.closingReading ?? 0,
          rate_per_unit:           rate,
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
        lookupFlat,
        lookupMeter,
        lookupBill,
      });

      if (target === 'consumption') {
        if (allocations.length > 0) {
          throw new FormulaError(
            "ALLOCATE() cannot be used in a consumption-only formula — switch to 'Override entire bill amount' mode to redirect money.",
          );
        }
        const newConsumption = round(value, 3);
        consumptionOverrides.set(tenancy.flatId, newConsumption);
        baseBills.set(tenancy.flatId, round(newConsumption * rate, 2));
      } else {
        baseBills.set(tenancy.flatId, round(value, 2));
        for (const alloc of allocations) {
          baseBills.set(alloc.target, round((baseBills.get(alloc.target) ?? 0) + alloc.amount, 2));
        }
      }
      appliedFormula.set(tenancy.flatId, formula.formulaText);
    } catch (err) {
      formulaErrors.set(tenancy.flatId, (err as Error).message);
    }
  }

  return { baseBills, appliedFormula, formulaErrors, consumptionOverrides };
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
    billGroups           = [] as BillGroupInput[],
    lumpSumCharges       = {} as Record<string, number>,
    meterNumbers         = {} as Record<string, string>,
    billDefaults         = {} as Record<string, { total_amount: number; total_units: number; rate: number }>,
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

  // ── Pass 1: compute default cells ──────────────────────────────────────────
  // Everything in this pass is independent of formula results: consumption,
  // rate_per_unit, and base_bill (plus previous_balance/lump_sum, which are
  // pure pass-throughs from the input and don't need computation here). The
  // outputs of this pass are the "defaults" that applyFormulas() may override.

  // Step 1: meter consumptions
  const meterConsumptions = calcMeterConsumptions(readings);

  for (const [meterId, mc] of meterConsumptions) {
    if (mc.opening === null) {
      warnings.push(`Meter ${meterId} has no previous reading — consumption treated as 0.`);
    }
  }

  // Steps 2–4: either the single-pool model (default) or, when billGroups is supplied,
  // a per-bill-group model where each group reconciles independently against its own
  // company bill(s) instead of sharing one building-wide rounding/loss residual.
  let flatConsumptions:   Map<string, { totalConsumption: number; contributions: MeterContribution[] }>;
  let defaultBaseBills:   Map<string, number>;
  let ratePerUnitByFlat:  Map<string, number>;
  let groupAdjustments:   Map<string, number>;
  let groupLogsByFlat:    Map<string, { groupKey: string; cost: number; consumption: number; rate: number }[]> = new Map();
  let reconciledCost:        number;
  let reconciledConsumption: number;

  if (billGroups.length > 0) {
    flatConsumptions  = new Map();
    defaultBaseBills  = new Map();
    ratePerUnitByFlat = new Map();
    groupAdjustments  = new Map();

    const consAccum = new Map<string, number>();
    const costAccum = new Map<string, number>();
    const contribAccum = new Map<string, MeterContribution[]>();

    for (const group of billGroups) {
      const groupAssignments = assignments.filter((a) => group.meterIds.includes(a.meterId));
      const groupFlatConsumptions = calcFlatConsumptions(meterConsumptions, groupAssignments);
      const groupFlatIds = [...groupFlatConsumptions.keys()];
      const groupTenancies = activeTenancies.filter((t) => groupFlatConsumptions.has(t.flatId));
      const groupRate = calcCostPerUnit(group.totalCost, group.totalConsumption);
      const groupBaseBills = calcBaseBills(groupFlatConsumptions, groupTenancies, groupRate);

      let groupSum = 0;
      for (const v of groupBaseBills.values()) groupSum = round(groupSum + v, 2);
      const groupDifference = round(group.totalCost - groupSum, 2);
      const groupAdj = distributeDifference(groupDifference, groupFlatConsumptions, groupFlatIds, diffMethod, excludedFromResidual);

      for (const flatId of groupFlatIds) {
        const fc = groupFlatConsumptions.get(flatId)!;
        consAccum.set(flatId, round((consAccum.get(flatId) ?? 0) + fc.totalConsumption, 3));
        costAccum.set(flatId, round((costAccum.get(flatId) ?? 0) + (groupBaseBills.get(flatId) ?? 0), 2));
        contribAccum.set(flatId, [...(contribAccum.get(flatId) ?? []), ...fc.contributions]);
        groupAdjustments.set(flatId, round((groupAdjustments.get(flatId) ?? 0) + (groupAdj.get(flatId) ?? 0), 2));
        ratePerUnitByFlat.set(flatId, groupRate);

        const log = groupLogsByFlat.get(flatId) ?? [];
        log.push({ groupKey: group.groupKey, cost: group.totalCost, consumption: group.totalConsumption, rate: groupRate });
        groupLogsByFlat.set(flatId, log);
      }
    }

    for (const flatId of new Set([...consAccum.keys(), ...contribAccum.keys()])) {
      const consumption = consAccum.get(flatId) ?? 0;
      flatConsumptions.set(flatId, { totalConsumption: consumption, contributions: contribAccum.get(flatId) ?? [] });
      defaultBaseBills.set(flatId, costAccum.get(flatId) ?? 0);
      if (consumption > 0) {
        ratePerUnitByFlat.set(flatId, round((costAccum.get(flatId) ?? 0) / consumption, 6));
      }
    }

    reconciledCost        = billGroups.reduce((s, g) => s + g.totalCost, 0);
    reconciledConsumption = billGroups.reduce((s, g) => s + g.totalConsumption, 0);
  } else {
    flatConsumptions  = calcFlatConsumptions(meterConsumptions, assignments);
    const costPerUnit = calcCostPerUnit(totalBuildingCost, totalBuildingConsumption);
    defaultBaseBills  = calcBaseBills(flatConsumptions, activeTenancies, costPerUnit);
    ratePerUnitByFlat = new Map(activeTenancies.map((t) => [t.flatId, costPerUnit]));
    reconciledCost        = totalBuildingCost;
    reconciledConsumption = totalBuildingConsumption;
    groupAdjustments  = new Map(); // computed below via the single-pool path instead
  }

  // ── Pass 2: apply formulas ──────────────────────────────────────────────────
  // Custom per-flat formulas may override base_bill (and redirect amounts to
  // other flats via ALLOCATE) or override consumption directly. This is the
  // only step that can change the default cells computed in Pass 1.
  const { baseBills, appliedFormula, formulaErrors, consumptionOverrides } = applyFormulas(
    defaultBaseBills, flatConsumptions, activeTenancies, ratePerUnitByFlat,
    previousBalances, reconciledCost, reconciledConsumption,
    formulas, flatNumbers, meterNumbers, billDefaults,
  );

  for (const [flatId, msg] of formulaErrors) {
    warnings.push(`Formula for flat ${flatNumbers[flatId] ?? flatId} failed (${msg}) — used default calculation instead.`);
  }

  // Display-only: reflect any consumption overridden by a 'consumption'-target formula.
  for (const [flatId, newConsumption] of consumptionOverrides) {
    const existing = flatConsumptions.get(flatId) ?? { totalConsumption: 0, contributions: [] };
    flatConsumptions.set(flatId, { ...existing, totalConsumption: newConsumption });
  }

  // ── Pass 3: compute adjustment / total_due ──────────────────────────────────
  // sumOfBaseBills here is POST-formula (i.e. includes any ALLOCATE() redirects
  // and overridden base bills from Pass 2).
  //
  // Grouped mode reuses `groupAdjustments`, which was computed per-group back in
  // Pass 1 from each group's PRE-formula base bills — deliberately isolated from
  // formula leakage so one flat's formula can't shift another group's residual.
  // Legacy mode instead recomputes its adjustment here from the POST-formula sum,
  // so a single flat's formula CAN shift the residual distributed to the rest of
  // the (single, pooled) building — this asymmetry is intentional, not a bug.
  let sumOfBaseBills = 0;
  for (const v of baseBills.values()) sumOfBaseBills = round(sumOfBaseBills + v, 2);

  let difference: number;
  let adjustments: Map<string, number>;

  if (billGroups.length > 0) {
    difference  = round(reconciledCost - sumOfBaseBills, 2);
    adjustments = groupAdjustments;
  } else {
    difference = round(totalBuildingCost - sumOfBaseBills, 2);
    const activeFlatIds = activeTenancies.map((t) => t.flatId);
    adjustments = distributeDifference(difference, flatConsumptions, activeFlatIds, diffMethod, excludedFromResidual);
  }

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
    const lumpSum      = round(lumpSumCharges[flatId] ?? 0, 2);
    const ratePerUnit  = ratePerUnitByFlat.get(flatId) ?? 0;
    const totalDue     = round(baseBill + adjustment + prevBalance + lumpSum, 2);

    if (consumption === 0) flatsWithZeroConsumption++;

    const contributions = flatData?.contributions ?? [];
    const primary       = contributions[0];

    const explanation = buildExplanation({
      consumption, costPerUnit: ratePerUnit, baseBill, adjustment, prevBalance, lumpSum, totalDue,
      diffMethod, difference, totalBuildingCost: reconciledCost, totalBuildingConsumption: reconciledConsumption,
    });

    const calcLog: FlatBillCalcLog = {
      totalBuildingCost:        reconciledCost,
      totalBuildingConsumption: reconciledConsumption,
      costPerUnit:              ratePerUnit,
      sumOfBaseBills,
      difference,
      diffMethod,
      meterContributions: contributions,
      explanation,
      billGroups: groupLogsByFlat.get(flatId),
    };

    flatBills.push({
      flatId,
      tenancyId,
      consumption,
      openingReading:       primary?.openingReading ?? null,
      closingReading:       primary?.closingReading ?? null,
      sharePercent:         primary?.sharePercent ?? 100,
      ratePerUnit,
      baseBill,
      differenceAdjustment: adjustment,
      previousBalance:      prevBalance,
      lumpSumCharges:       lumpSum,
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
    totalBuildingCost:        reconciledCost,
    totalBuildingConsumption: reconciledConsumption,
    costPerUnit: calcCostPerUnit(reconciledCost, reconciledConsumption),
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
  lumpSum?: number;
  totalDue: number;
  diffMethod: DiffDistributionMethod;
  difference: number;
  totalBuildingCost: number;
  totalBuildingConsumption: number;
}): string {
  const { consumption, costPerUnit, baseBill, adjustment, prevBalance, lumpSum, totalDue, diffMethod, difference } = params;
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
  if (lumpSum) {
    lines.push(`Lump-sum charge: +${lumpSum}`);
  }
  lines.push(`Total due: ${totalDue}`);
  return lines.join('\n');
}
