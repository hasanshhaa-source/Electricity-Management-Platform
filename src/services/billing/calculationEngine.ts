/**
 * Pure billing calculation engine.
 * No database calls, no side effects. All functions are independently testable.
 *
 * Formula:
 *   flat_bill = flat_consumption × (total_building_cost / total_building_consumption)
 *   + difference_adjustment + previous_unpaid_balance
 */

// ─── Input / Output types ─────────────────────────────────────────────────────

export type DiffDistributionMethod = 'proportional' | 'equal';

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

/**
 * Step 5 — Distribute the difference (total building cost − sum of base bills) across flats.
 *
 * Uses penny-perfect distribution: the last flat absorbs any residual from rounding,
 * so the sum of adjustments always equals the input difference exactly.
 */
export function distributeDifference(
  difference: number,
  flatConsumptions: Map<string, { totalConsumption: number; contributions: MeterContribution[] }>,
  activeFlatIds: string[],
  method: DiffDistributionMethod,
): Map<string, number> {
  const adjustments = new Map<string, number>();
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
    return distributeDifference(difference, flatConsumptions, activeFlatIds, 'equal');
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
  const baseBills = calcBaseBills(flatConsumptions, activeTenancies, costPerUnit);

  // Step 5: sum and difference
  let sumOfBaseBills = 0;
  for (const v of baseBills.values()) sumOfBaseBills = round(sumOfBaseBills + v, 2);
  const difference = round(totalBuildingCost - sumOfBaseBills, 2);

  // Step 6: distribute difference
  const activeFlatIds = activeTenancies.map((t) => t.flatId);
  const adjustments = distributeDifference(difference, flatConsumptions, activeFlatIds, diffMethod);

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
