/**
 * DB orchestration layer for billing calculation.
 * Gathers inputs → calls pure engine → persists results.
 */
import { createClient } from '@/lib/supabase/server';
import type { ApiResponse, FlatBill } from '@/types';
import {
  runBillingCalculation,
  type CalculationInput,
  type CalculationResult,
  type DiffDistributionMethod,
  type FlatFormula,
  type BillGroupInput,
} from './calculationEngine';
import { getActiveFormulasForCycle } from './formulaService';
import { getBillLinksForCycle, findUnlinkedBills } from './companyBillService';

// ─── Types returned to the UI ─────────────────────────────────────────────────

export interface FlatBillPreview {
  id:                   string | null;  // null = not yet persisted
  flatId:               string;
  flatNumber:           string;
  tenancyId:            string;
  tenantName:           string;
  consumption:          number;
  ratePerUnit:          number;
  baseBill:             number;
  differenceAdjustment: number;
  previousBalance:      number;
  lumpSumCharges:       number;
  totalDue:             number;
  status:               string;
  version:              number;
  calculationLog:       Record<string, unknown>;
  excludedFromResidual: boolean;
  formulaApplied:       string | null;
}

// ─── Gather inputs from DB ────────────────────────────────────────────────────

async function gatherCalculationInputs(
  buildingId: string,
  cycleId: string,
  periodYear: number,
  periodMonth: number,
  diffMethod: DiffDistributionMethod,
  dueDate: string,
): Promise<CalculationInput> {
  const supabase = await createClient();

  // 1. Active meters for building
  const { data: meters } = await supabase
    .from('meters')
    .select('id, meter_number')
    .eq('building_id', buildingId)
    .eq('is_active', true)
    .is('deleted_at', null);

  const meterIds = (meters ?? []).map((m: any) => m.id);
  const meterNumbers: Record<string, string> = {};
  for (const m of meters ?? []) meterNumbers[m.id] = m.meter_number;

  // 2. Active flat_meter_assignments
  const { data: assignments } = await supabase
    .from('flat_meter_assignments')
    .select('meter_id, flat_id, share_percent')
    .in('meter_id', meterIds)
    .is('effective_to', null);

  // 3. Current period readings
  const { data: currentReadings } = await supabase
    .from('meter_readings')
    .select('meter_id, reading_value, billing_period_year, billing_period_month')
    .in('meter_id', meterIds)
    .eq('billing_period_year', periodYear)
    .eq('billing_period_month', periodMonth);

  // 4. Previous period readings (for opening values)
  const prevYear  = periodMonth === 1 ? periodYear - 1 : periodYear;
  const prevMonth = periodMonth === 1 ? 12 : periodMonth - 1;

  const { data: prevReadings } = await supabase
    .from('meter_readings')
    .select('meter_id, reading_value')
    .in('meter_id', meterIds)
    .eq('billing_period_year', prevYear)
    .eq('billing_period_month', prevMonth);

  const prevMap = new Map((prevReadings ?? []).map((r: any) => [r.meter_id, r.reading_value]));

  const readings: CalculationInput['readings'] = (currentReadings ?? []).map((r: any) => ({
    meterId:       r.meter_id,
    previousValue: prevMap.get(r.meter_id) ?? null,
    currentValue:  Number(r.reading_value),
  }));

  // 5. Active tenancies for building
  const flatIds = [...new Set((assignments ?? []).map((a: any) => a.flat_id))];

  let activeTenancies: CalculationInput['activeTenancies'] = [];
  if (flatIds.length > 0) {
    const { data: tenancies } = await supabase
      .from('tenancies')
      .select('id, flat_id')
      .in('flat_id', flatIds)
      .eq('status', 'active');
    activeTenancies = (tenancies ?? []).map((t: any) => ({
      flatId:    t.flat_id,
      tenancyId: t.id,
    }));
  }

  // 6. Previous unpaid balances (from most recent is_current_version bill per flat in a prior cycle)
  const previousBalances: Record<string, number> = {};
  if (activeTenancies.length > 0) {
    // Find the most recent prior billing cycle for this building
    const { data: prevCycle } = await supabase
      .from('billing_cycles')
      .select('id')
      .eq('building_id', buildingId)
      .or(
        `period_year.lt.${periodYear},and(period_year.eq.${periodYear},period_month.lt.${periodMonth})`,
      )
      .order('period_year',  { ascending: false })
      .order('period_month', { ascending: false })
      .limit(1)
      .maybeSingle();

    if (prevCycle) {
      const activeFlatIds = activeTenancies.map((t) => t.flatId);
      const { data: prevBills } = await supabase
        .from('flat_bills')
        .select('flat_id, outstanding_balance')
        .eq('billing_cycle_id', prevCycle.id)
        .eq('is_current_version', true)
        .in('flat_id', activeFlatIds)
        .gt('outstanding_balance', 0);

      for (const bill of prevBills ?? []) {
        previousBalances[bill.flat_id] = Number(bill.outstanding_balance);
      }
    }
  }

  // 7. Company bills for this period — and how each is linked (meters vs. a flat lump sum)
  const { data: companyBills } = await supabase
    .from('electricity_company_bills')
    .select('id, bill_number, total_amount, total_units')
    .eq('building_id', buildingId)
    .eq('period_year',  periodYear)
    .eq('period_month', periodMonth);

  const bills = companyBills ?? [];

  // Pre-formula defaults snapshot for BILL('billNumber').field lookups in formulas.
  const billDefaults: Record<string, { total_amount: number; total_units: number; rate: number }> = {};
  for (const b of bills) {
    const totalAmount = Number(b.total_amount);
    const totalUnits  = Number(b.total_units ?? 0);
    billDefaults[b.bill_number] = {
      total_amount: totalAmount,
      total_units:  totalUnits,
      rate:         totalUnits > 0 ? totalAmount / totalUnits : 0,
    };
  }
  const links = await getBillLinksForCycle(buildingId, periodYear, periodMonth);
  const linkedById = new Map(links.map((l) => [l.billId, l]));
  const anyLinked   = links.some((l) => l.meterIds.length > 0 || l.flatId);

  let totalBuildingCost        = 0;
  let totalBuildingConsumption = 0;
  let billGroups: BillGroupInput[] | undefined;
  let lumpSumCharges: Record<string, number> | undefined;

  if (anyLinked) {
    // Strict mode: every bill for this cycle must be linked once a building opts in.
    const unlinked = findUnlinkedBills(bills, links);
    if (unlinked.length > 0) {
      throw new Error(`The following bills are not linked to any meter or flat: ${unlinked.join(', ')}. Link every bill before calculating.`);
    }

    billGroups     = [];
    lumpSumCharges = {};
    for (const bill of bills) {
      const link = linkedById.get(bill.id);
      const cost = Number(bill.total_amount);
      if (link?.flatId) {
        lumpSumCharges[link.flatId] = (lumpSumCharges[link.flatId] ?? 0) + cost;
      } else {
        billGroups.push({
          groupKey:         bill.id,
          totalCost:        cost,
          totalConsumption: Number(bill.total_units ?? 0),
          meterIds:         link?.meterIds ?? [],
        });
        totalBuildingCost        += cost;
        totalBuildingConsumption += Number(bill.total_units ?? 0);
      }
    }
  } else {
    // Legacy mode: pool every bill into one building-wide rate.
    totalBuildingCost        = bills.reduce((s: number, b: any) => s + Number(b.total_amount),  0);
    totalBuildingConsumption = bills.reduce((s: number, b: any) => s + Number(b.total_units ?? 0), 0);
  }

  // 8. Custom formulas active for this cycle (cycle-specific takes priority over persistent)
  const formulas: Map<string, FlatFormula[]> = await getActiveFormulasForCycle(buildingId, cycleId);

  // 9. Flat numbers (used to resolve ALLOCATE('flatNumber') targets in formulas)
  const { data: allFlats } = await supabase.from('flats').select('id, flat_number').eq('building_id', buildingId);
  const flatNumbers: Record<string, string> = {};
  for (const f of allFlats ?? []) flatNumbers[f.id] = f.flat_number;

  // 10. Flats currently excluded from the residual distribution (carried over from the prior calculation, if any)
  const excludedFromResidual = new Set<string>();
  const { data: existingBills } = await supabase
    .from('flat_bills')
    .select('flat_id, excluded_from_residual')
    .eq('billing_cycle_id', cycleId)
    .eq('is_current_version', true);
  for (const b of existingBills ?? []) {
    if (b.excluded_from_residual) excludedFromResidual.add(b.flat_id);
  }

  return {
    readings,
    assignments: (assignments ?? []).map((a: any) => ({
      meterId:      a.meter_id,
      flatId:       a.flat_id,
      sharePercent: Number(a.share_percent),
    })),
    activeTenancies,
    totalBuildingCost,
    totalBuildingConsumption,
    previousBalances,
    diffMethod,
    dueDate,
    periodYear,
    periodMonth,
    formulas,
    flatNumbers,
    excludedFromResidual,
    billGroups,
    lumpSumCharges,
    meterNumbers,
    billDefaults,
  };
}

// ─── Persist draft bills ──────────────────────────────────────────────────────

async function persistDraftBills(
  cycleId: string,
  calcResult: CalculationResult,
  adminId: string,
  dueDate: string,
): Promise<FlatBill[]> {
  const supabase = await createClient();
  const now      = new Date().toISOString();

  // Determine next version number
  const { data: existingBills } = await supabase
    .from('flat_bills')
    .select('version')
    .eq('billing_cycle_id', cycleId)
    .order('version', { ascending: false })
    .limit(1);

  const nextVersion = existingBills && existingBills.length > 0
    ? (existingBills[0].version as number) + 1
    : 1;

  // Mark previous versions as superseded
  await supabase
    .from('flat_bills')
    .update({ is_current_version: false })
    .eq('billing_cycle_id', cycleId)
    .eq('is_current_version', true);

  // Get flat numbers for the log
  const flatIds = calcResult.flatBills.map((b) => b.flatId);
  const { data: flats } = await supabase
    .from('flats')
    .select('id, flat_number')
    .in('id', flatIds);
  const flatNumberMap = new Map((flats ?? []).map((f: any) => [f.id, f.flat_number]));

  const cleanRows = calcResult.flatBills.map((bill) => ({
    billing_cycle_id:      cycleId,
    flat_id:               bill.flatId,
    tenancy_id:            bill.tenancyId,
    version:               nextVersion,
    is_current_version:    true,
    opening_reading:       bill.openingReading,
    closing_reading:       bill.closingReading,
    units_consumed:        bill.consumption,
    share_percent:         bill.sharePercent,
    billed_units:          bill.consumption,
    rate_per_unit:         bill.ratePerUnit,
    fixed_charge:          bill.lumpSumCharges,
    current_charges:       bill.baseBill,
    difference_adjustment: bill.differenceAdjustment,
    previous_balance:      bill.previousBalance,
    total_due:             bill.totalDue,
    amount_paid:           0,
    status:                'draft',
    due_date:              dueDate,
    excluded_from_residual: bill.excludedFromResidual,
    calculation_log:       {
      ...bill.calculationLog,
      calculatedAt:   now,
      calculatedBy:   adminId,
      flatNumber:     flatNumberMap.get(bill.flatId) ?? bill.flatId,
      formulaApplied: bill.formulaApplied,
      formulaError:   bill.formulaError,
    },
    calculated_by:  adminId,
    calculated_at:  now,
  }));

  const { data, error } = await supabase
    .from('flat_bills')
    .insert(cleanRows)
    .select();

  if (error) throw new Error(error.message);
  return data as FlatBill[];
}

// ─── Public API ───────────────────────────────────────────────────────────────

export interface CalculateForCycleResult {
  bills:    FlatBillPreview[];
  summary:  CalculationResult['summary'];
  warnings: string[];
}

export async function calculateForCycle(
  cycleId: string,
  adminId: string,
  diffMethod: DiffDistributionMethod = 'proportional',
): Promise<ApiResponse<CalculateForCycleResult>> {
  const supabase = await createClient();

  const { data: cycle } = await supabase
    .from('billing_cycles')
    .select('building_id, period_year, period_month, building:buildings(billing_day)')
    .eq('id', cycleId)
    .single();

  if (!cycle) return { data: null, error: 'Billing cycle not found' };

  // Determine due date: billing_day of following month
  const billingDay = (cycle.building as any)?.billing_day ?? 15;
  const dueMonth   = cycle.period_month === 12 ? 1 : cycle.period_month + 1;
  const dueYear    = cycle.period_month === 12 ? cycle.period_year + 1 : cycle.period_year;
  const dueDate    = `${dueYear}-${String(dueMonth).padStart(2, '0')}-${String(billingDay).padStart(2, '0')}`;

  let inputs: CalculationInput;
  try {
    inputs = await gatherCalculationInputs(
      cycle.building_id,
      cycleId,
      cycle.period_year,
      cycle.period_month,
      diffMethod,
      dueDate,
    );
  } catch (err) {
    return { data: null, error: (err as Error).message };
  }

  const hasLumpSums = Object.keys(inputs.lumpSumCharges ?? {}).length > 0;
  if (inputs.totalBuildingCost <= 0 && !hasLumpSums) {
    return { data: null, error: 'No company bills found for this cycle. Please add electricity company bills before calculating.' };
  }

  const calcResult = runBillingCalculation(inputs);

  if (calcResult.flatBills.length === 0) {
    return { data: null, error: 'No active tenancies found for this building. Cannot generate bills.' };
  }

  // Persist bills and enrich with flat/tenant info for preview
  let persistedBills: FlatBill[];
  try {
    persistedBills = await persistDraftBills(cycleId, calcResult, adminId, dueDate);
  } catch (err) {
    return { data: null, error: (err as Error).message };
  }

  // Enrich preview with flat and tenant names
  const flatIds    = calcResult.flatBills.map((b) => b.flatId);
  const tenancyIds = calcResult.flatBills.map((b) => b.tenancyId);

  const [{ data: flats }, { data: tenancies }] = await Promise.all([
    supabase.from('flats').select('id, flat_number').in('id', flatIds),
    supabase.from('tenancies').select('id, user:users!user_id(full_name)').in('id', tenancyIds),
  ]);

  const flatMap    = new Map((flats ?? []).map((f: any) => [f.id, f.flat_number]));
  const tenantMap  = new Map((tenancies ?? []).map((t: any) => [t.id, (t.user as any)?.full_name ?? 'Unknown']));
  const persistedMap = new Map(persistedBills.map((b) => [b.flat_id, b]));

  const bills: FlatBillPreview[] = calcResult.flatBills.map((bill) => {
    const persisted = persistedMap.get(bill.flatId);
    return {
      id:                   persisted?.id ?? null,
      flatId:               bill.flatId,
      flatNumber:           flatMap.get(bill.flatId) ?? bill.flatId,
      tenancyId:            bill.tenancyId,
      tenantName:           tenantMap.get(bill.tenancyId) ?? 'Unknown',
      consumption:          bill.consumption,
      ratePerUnit:          bill.ratePerUnit,
      baseBill:             bill.baseBill,
      differenceAdjustment: bill.differenceAdjustment,
      previousBalance:      bill.previousBalance,
      lumpSumCharges:       bill.lumpSumCharges,
      totalDue:             bill.totalDue,
      status:               'draft',
      version:              persisted?.version ?? 1,
      calculationLog:       bill.calculationLog as any,
      excludedFromResidual: bill.excludedFromResidual,
      formulaApplied:       bill.formulaApplied,
    };
  });

  return { data: { bills, summary: calcResult.summary, warnings: calcResult.warnings }, error: null };
}

export async function getBillsForCycle(cycleId: string): Promise<ApiResponse<FlatBillPreview[]>> {
  const supabase = await createClient();
  const { data, error } = await supabase
    .from('flat_bills')
    .select(`
      id, flat_id, tenancy_id, version, status,
      units_consumed, rate_per_unit, current_charges, fixed_charge,
      difference_adjustment, previous_balance, total_due, calculation_log,
      excluded_from_residual,
      flat:flats(flat_number),
      tenancy:tenancies(user:users!user_id(full_name))
    `)
    .eq('billing_cycle_id', cycleId)
    .eq('is_current_version', true)
    .order('flat_id');

  if (error) return { data: null, error: error.message };

  const bills: FlatBillPreview[] = (data ?? []).map((b: any) => ({
    id:                   b.id,
    flatId:               b.flat_id,
    flatNumber:           b.flat?.flat_number ?? b.flat_id,
    tenancyId:            b.tenancy_id,
    tenantName:           b.tenancy?.user?.full_name ?? 'Unknown',
    consumption:          Number(b.units_consumed),
    ratePerUnit:          Number(b.rate_per_unit),
    baseBill:             Number(b.current_charges),
    differenceAdjustment: Number(b.difference_adjustment ?? 0),
    previousBalance:      Number(b.previous_balance),
    lumpSumCharges:       Number(b.fixed_charge ?? 0),
    totalDue:             Number(b.total_due),
    status:               b.status,
    version:              b.version,
    calculationLog:       b.calculation_log ?? {},
    excludedFromResidual: b.excluded_from_residual ?? false,
    formulaApplied:       (b.calculation_log as any)?.formulaApplied ?? null,
  }));

  return { data: bills, error: null };
}

/** Toggles whether a flat is excluded from the residual/difference distribution. Takes effect on the next (re)calculation. */
export async function setBillResidualExclusion(billId: string, excluded: boolean): Promise<ApiResponse<null>> {
  const supabase = await createClient();
  const { error } = await supabase
    .from('flat_bills')
    .update({ excluded_from_residual: excluded })
    .eq('id', billId)
    .eq('is_current_version', true);

  if (error) return { data: null, error: error.message };
  return { data: null, error: null };
}

export async function issueBillsForCycle(
  cycleId: string,
  adminId: string,
): Promise<ApiResponse<{ count: number }>> {
  const supabase = await createClient();

  // Ensure there are draft bills to issue
  const { count } = await supabase
    .from('flat_bills')
    .select('id', { count: 'exact', head: true })
    .eq('billing_cycle_id', cycleId)
    .eq('is_current_version', true)
    .eq('status', 'draft');

  if (!count || count === 0) {
    return { data: null, error: 'No draft bills to issue. Run calculation first.' };
  }

  // Promote bills from draft → unpaid
  const { error: billError } = await supabase
    .from('flat_bills')
    .update({ status: 'unpaid' })
    .eq('billing_cycle_id', cycleId)
    .eq('is_current_version', true)
    .eq('status', 'draft');

  if (billError) return { data: null, error: billError.message };

  // Advance cycle status → issued
  await supabase
    .from('billing_cycles')
    .update({
      status:       'issued',
      finalized_at: new Date().toISOString(),
      finalized_by: adminId,
    })
    .eq('id', cycleId);

  return { data: { count }, error: null };
}
