/**
 * Insight service — historical patterns, anomalies, and performance metrics.
 * Complements analyticsService (which focuses on a single period).
 * This service operates across multiple periods for trend analysis.
 */
import { createClient } from '@/lib/supabase/server';

// ── Types ─────────────────────────────────────────────────────────────────────

export interface FlatConsumptionProfile {
  flatId:               string;
  flatNumber:           string;
  buildingName:         string;
  tenantName:           string;
  billCount:            number;
  avgMonthlyConsumption: number;
  avgMonthlyBill:       number;
  maxConsumption:       number;
  minConsumption:       number;
  totalPaid:            number;
}

export interface AnomalyFlag {
  flatNumber:    string;
  buildingName:  string;
  tenantName:    string;
  periodYear:    number;
  periodMonth:   number;
  current:       number;
  previous:      number;
  changePercent: number;
  severity:      'high' | 'medium'; // ≥50%=high, 30–50%=medium
}

export interface LatePaymentProfile {
  flatNumber:   string;
  buildingName: string;
  tenantName:   string;
  totalBills:   number;
  overdueBills: number;
  lateRate:     number; // 0–100
}

export interface YearlyTrendPoint {
  key:         string; // "2025-01"
  label:       string; // "Jan 25"
  consumption: number;
  cost:        number;
  collected:   number;
  outstanding: number;
  billCount:   number;
}

export interface InsightData {
  flatProfiles:       FlatConsumptionProfile[];
  anomalies:          AnomalyFlag[];
  latePaymentRisk:    LatePaymentProfile[];
  yearlyTrend:        YearlyTrendPoint[];
  totalBillsIssued:   number;
  totalCollected:     number;
  totalOutstanding:   number;
  currency:           string;
}

// ── Helpers ───────────────────────────────────────────────────────────────────

const MONTH_SHORT = ['Jan','Feb','Mar','Apr','May','Jun','Jul','Aug','Sep','Oct','Nov','Dec'];

function round2(n: number) { return Math.round(n * 100) / 100; }

function getLast12Months() {
  const result: Array<{ year: number; month: number }> = [];
  const now = new Date();
  for (let i = 11; i >= 0; i--) {
    const d = new Date(now.getFullYear(), now.getMonth() - i, 1);
    result.push({ year: d.getFullYear(), month: d.getMonth() + 1 });
  }
  return result;
}

// ── Main function ─────────────────────────────────────────────────────────────

export async function getInsightData(buildingId?: string): Promise<InsightData> {
  const supabase = await createClient();

  // ── Base data ───────────────────────────────────────────────────────────────

  const [
    { data: buildings },
    { data: flats },
    { data: tenancies },
    { data: recentCycles },
  ] = await Promise.all([
    supabase.from('buildings').select('id, name, currency').eq('is_active', true).is('deleted_at', null),
    supabase.from('flats').select('id, flat_number, building_id').eq('is_active', true).is('deleted_at', null),
    supabase.from('tenancies').select('id, flat_id, user:users(full_name, email)').eq('status', 'active'),
    supabase.from('billing_cycles')
      .select('id, period_year, period_month, building_id')
      .gte('period_year', new Date().getFullYear() - 2)
      .order('period_year').order('period_month'),
  ]);

  const currency    = buildingId
    ? (buildings ?? []).find(b => b.id === buildingId)?.currency ?? 'SAR'
    : ((buildings ?? [])[0]?.currency ?? 'SAR');

  const flatMap     = new Map((flats ?? []).map(f => [f.id, f]));
  const buildingMap = new Map((buildings ?? []).map(b => [b.id, b]));
  const tenancyByFlat = new Map((tenancies ?? []).map((t: any) => [t.flat_id, t]));

  // Filter cycles by building if needed
  const filteredCycles = (recentCycles ?? []).filter(
    c => !buildingId || c.building_id === buildingId,
  );
  const cycleMap     = new Map(filteredCycles.map(c => [c.id, c]));
  const cycleIds     = filteredCycles.map(c => c.id);

  // ── Fetch all current-version issued bills for these cycles ────────────────

  const { data: billsRaw } = cycleIds.length > 0
    ? await supabase
        .from('flat_bills')
        .select('id, flat_id, billing_cycle_id, status, billed_units, total_due, amount_paid, outstanding_balance, due_date, paid_at')
        .eq('is_current_version', true)
        .not('status', 'in', '(draft,cancelled)')
        .in('billing_cycle_id', cycleIds)
    : { data: [] };

  const bills = (billsRaw ?? []) as any[];

  // ── 1. Flat consumption profiles ───────────────────────────────────────────

  const profileMap = new Map<string, {
    flatId: string; consumption: number[]; bills: number[]; paid: number;
  }>();

  for (const bill of bills) {
    if (!profileMap.has(bill.flat_id)) {
      profileMap.set(bill.flat_id, { flatId: bill.flat_id, consumption: [], bills: [], paid: 0 });
    }
    const p = profileMap.get(bill.flat_id)!;
    p.consumption.push(Number(bill.billed_units));
    p.bills.push(Number(bill.total_due));
    p.paid += Number(bill.amount_paid);
  }

  const flatProfiles: FlatConsumptionProfile[] = [...profileMap.values()]
    .filter(p => p.consumption.length > 0)
    .map(p => {
      const flat     = flatMap.get(p.flatId);
      const building = flat ? buildingMap.get(flat.building_id) : null;
      const tenancy  = tenancyByFlat.get(p.flatId) as any;
      const avg = (arr: number[]) => arr.reduce((s, v) => s + v, 0) / arr.length;
      return {
        flatId:               p.flatId,
        flatNumber:           flat?.flat_number ?? p.flatId,
        buildingName:         building?.name    ?? '—',
        tenantName:           tenancy?.user?.full_name ?? 'Vacant',
        billCount:            p.consumption.length,
        avgMonthlyConsumption: round2(avg(p.consumption)),
        avgMonthlyBill:        round2(avg(p.bills)),
        maxConsumption:        round2(Math.max(...p.consumption)),
        minConsumption:        round2(Math.min(...p.consumption)),
        totalPaid:             round2(p.paid),
      };
    })
    .sort((a, b) => b.avgMonthlyConsumption - a.avgMonthlyConsumption);

  // ── 2. Consumption anomalies (≥30% increase vs previous period) ────────────

  // Group bills by flat + cycle period
  const billByFlatCycle = new Map<string, { year: number; month: number; units: number }>();
  for (const bill of bills) {
    const cycle = cycleMap.get(bill.billing_cycle_id);
    if (!cycle) continue;
    const key = `${bill.flat_id}|${cycle.period_year}|${cycle.period_month}`;
    billByFlatCycle.set(key, {
      year: cycle.period_year, month: cycle.period_month,
      units: Number(bill.billed_units),
    });
  }

  const anomalies: AnomalyFlag[] = [];
  for (const [key, curr] of billByFlatCycle) {
    const flatId   = key.split('|')[0];
    const prevYear  = curr.month === 1 ? curr.year - 1 : curr.year;
    const prevMonth = curr.month === 1 ? 12 : curr.month - 1;
    const prevKey   = `${flatId}|${prevYear}|${prevMonth}`;
    const prev      = billByFlatCycle.get(prevKey);
    if (!prev || prev.units <= 0) continue;

    const change = ((curr.units - prev.units) / prev.units) * 100;
    if (change < 30) continue;

    const flat     = flatMap.get(flatId);
    const building = flat ? buildingMap.get(flat.building_id) : null;
    const tenancy  = tenancyByFlat.get(flatId) as any;

    anomalies.push({
      flatNumber:    flat?.flat_number ?? flatId,
      buildingName:  building?.name    ?? '—',
      tenantName:    tenancy?.user?.full_name ?? 'Vacant',
      periodYear:    curr.year,
      periodMonth:   curr.month,
      current:       round2(curr.units),
      previous:      round2(prev.units),
      changePercent: Math.round(change),
      severity:      change >= 50 ? 'high' : 'medium',
    });
  }
  anomalies.sort((a, b) => b.changePercent - a.changePercent);

  // ── 3. Late payment / overdue risk ────────────────────────────────────────

  const lateMap = new Map<string, { total: number; overdue: number }>();
  for (const bill of bills) {
    if (!lateMap.has(bill.flat_id)) lateMap.set(bill.flat_id, { total: 0, overdue: 0 });
    const e = lateMap.get(bill.flat_id)!;
    e.total++;
    // Overdue = bill is marked overdue OR paid_at > due_date
    const isOverdue = bill.status === 'overdue' ||
      (bill.paid_at && bill.due_date && bill.paid_at > bill.due_date);
    if (isOverdue) e.overdue++;
  }

  const latePaymentRisk: LatePaymentProfile[] = [...lateMap.entries()]
    .filter(([, v]) => v.overdue > 0)
    .map(([flatId, v]) => {
      const flat     = flatMap.get(flatId);
      const building = flat ? buildingMap.get(flat.building_id) : null;
      const tenancy  = tenancyByFlat.get(flatId) as any;
      return {
        flatNumber:   flat?.flat_number ?? flatId,
        buildingName: building?.name    ?? '—',
        tenantName:   tenancy?.user?.full_name ?? 'Vacant',
        totalBills:   v.total,
        overdueBills: v.overdue,
        lateRate:     round2((v.overdue / v.total) * 100),
      };
    })
    .sort((a, b) => b.lateRate - a.lateRate);

  // ── 4. Yearly trend (last 12 months) ──────────────────────────────────────

  const last12 = getLast12Months();
  const trendMap = new Map(last12.map(m => [
    `${m.year}-${m.month}`,
    { year: m.year, month: m.month, consumption: 0, cost: 0, collected: 0, outstanding: 0, count: 0 },
  ]));

  for (const bill of bills) {
    const cycle = cycleMap.get(bill.billing_cycle_id);
    if (!cycle) continue;
    const key = `${cycle.period_year}-${cycle.period_month}`;
    if (!trendMap.has(key)) continue;
    const t = trendMap.get(key)!;
    t.consumption += Number(bill.billed_units);
    t.cost        += Number(bill.total_due);
    t.collected   += Number(bill.amount_paid);
    t.outstanding += Number(bill.outstanding_balance);
    t.count++;
  }

  const yearlyTrend: YearlyTrendPoint[] = [...trendMap.values()]
    .sort((a, b) => a.year * 100 + a.month - (b.year * 100 + b.month))
    .map(t => ({
      key:         `${t.year}-${String(t.month).padStart(2,'0')}`,
      label:       `${MONTH_SHORT[t.month - 1]} ${String(t.year).slice(2)}`,
      consumption: round2(t.consumption),
      cost:        round2(t.cost),
      collected:   round2(t.collected),
      outstanding: round2(t.outstanding),
      billCount:   t.count,
    }));

  // ── Totals ─────────────────────────────────────────────────────────────────

  const totalCollected    = round2(bills.reduce((s, b) => s + Number(b.amount_paid),          0));
  const totalOutstanding  = round2(bills.reduce((s, b) => s + Number(b.outstanding_balance),  0));

  return {
    flatProfiles,
    anomalies,
    latePaymentRisk,
    yearlyTrend,
    totalBillsIssued:  bills.length,
    totalCollected,
    totalOutstanding,
    currency,
  };
}

// ── Tenant-specific insights ───────────────────────────────────────────────────

export interface TenantInsightData {
  avgMonthlyConsumption: number;
  avgMonthlyBill:        number;
  onTimeRate:            number; // % of bills paid before due date
  totalPaid:             number;
  totalBills:            number;
  yearlyTrend:           YearlyTrendPoint[];
  currency:              string;
}

export async function getTenantInsights(flatId: string): Promise<TenantInsightData> {
  const supabase = await createClient();

  const { data: flat }      = await supabase.from('flats').select('building_id').eq('id', flatId).single();
  const { data: building }  = flat
    ? await supabase.from('buildings').select('currency').eq('id', flat.building_id).single()
    : { data: null };
  const currency            = building?.currency ?? 'SAR';

  const { data: billsRaw } = await supabase
    .from('flat_bills')
    .select('billed_units, total_due, amount_paid, outstanding_balance, due_date, paid_at, status, billing_cycle:billing_cycles(period_year, period_month)')
    .eq('flat_id', flatId)
    .eq('is_current_version', true)
    .not('status', 'in', '(draft,cancelled)')
    .order('created_at', { ascending: false });

  const bills = (billsRaw ?? []) as any[];

  if (bills.length === 0) {
    return {
      avgMonthlyConsumption: 0, avgMonthlyBill: 0,
      onTimeRate: 100, totalPaid: 0, totalBills: 0,
      yearlyTrend: [], currency,
    };
  }

  const totalKwh   = bills.reduce((s: number, b: any) => s + Number(b.billed_units), 0);
  const totalDue   = bills.reduce((s: number, b: any) => s + Number(b.total_due),    0);
  const totalPaid  = bills.reduce((s: number, b: any) => s + Number(b.amount_paid),  0);
  const n          = bills.length;

  const onTimeBills = bills.filter((b: any) =>
    b.status === 'paid' && b.paid_at && b.due_date && b.paid_at <= b.due_date,
  ).length;
  const paidBills   = bills.filter((b: any) => b.status === 'paid').length;
  const onTimeRate  = paidBills > 0 ? round2((onTimeBills / paidBills) * 100) : 100;

  // Last 12 months trend
  const last12 = getLast12Months();
  const trendMap = new Map(last12.map(m => [
    `${m.year}-${m.month}`,
    { year: m.year, month: m.month, consumption: 0, cost: 0, collected: 0, outstanding: 0, count: 0 },
  ]));

  for (const bill of bills) {
    const cycle = bill.billing_cycle;
    if (!cycle) continue;
    const key = `${cycle.period_year}-${cycle.period_month}`;
    if (!trendMap.has(key)) continue;
    const t = trendMap.get(key)!;
    t.consumption += Number(bill.billed_units);
    t.cost        += Number(bill.total_due);
    t.collected   += Number(bill.amount_paid);
    t.outstanding += Number(bill.outstanding_balance);
    t.count++;
  }

  const yearlyTrend: YearlyTrendPoint[] = [...trendMap.values()]
    .sort((a, b) => a.year * 100 + a.month - (b.year * 100 + b.month))
    .map(t => ({
      key:         `${t.year}-${String(t.month).padStart(2,'0')}`,
      label:       `${MONTH_SHORT[t.month - 1]} ${String(t.year).slice(2)}`,
      consumption: round2(t.consumption),
      cost:        round2(t.cost),
      collected:   round2(t.collected),
      outstanding: round2(t.outstanding),
      billCount:   t.count,
    }));

  return {
    avgMonthlyConsumption: round2(totalKwh  / n),
    avgMonthlyBill:        round2(totalDue  / n),
    onTimeRate,
    totalPaid:             round2(totalPaid),
    totalBills:            n,
    yearlyTrend,
    currency,
  };
}
