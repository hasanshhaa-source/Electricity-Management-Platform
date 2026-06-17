/**
 * Analytics service: all aggregation for the admin dashboard.
 * No DB views — aggregation happens in JS over Supabase query results.
 * All functions use the server-side Supabase client (auth + RLS enforced).
 */
import { createClient } from '@/lib/supabase/server';

// ─── Filter type ──────────────────────────────────────────────────────────────

export interface DashboardFilters {
  buildingId?:  string;
  periodYear?:  number;
  periodMonth?: number;
  billStatus?:  string;
}

// ─── Output types ─────────────────────────────────────────────────────────────

export interface DashboardSummary {
  currency:            string;
  totalCompanyCost:    number;
  totalTenantBills:    number;
  totalCollected:      number;
  totalOutstanding:    number;
  overdueCount:        number;
  totalConsumption:    number;
  avgCostPerKwh:       number;
}

export interface BuildingStatsRow {
  id:                 string;
  name:               string;
  city:               string;
  totalFlats:         number;
  occupiedFlats:      number;
  monthlyCost:        number;
  monthlyConsumption: number;
  collected:          number;
  collectionRate:     number; // 0–100
}

export interface BillStatusPoint {
  status: string;
  label:  string;
  count:  number;
  amount: number;
}

export interface MonthlyTrendPoint {
  key:         string;  // "2025-01"
  label:       string;  // "Jan 2025"
  consumption: number;
  cost:        number;
  collected:   number;
  outstanding: number;
}

export interface TopConsumingFlat {
  flatNumber:  string;
  building:    string;
  tenant:      string;
  consumption: number;
  totalDue:    number;
}

export interface RecurringOverdueRow {
  flatNumber:   string;
  building:     string;
  tenant:       string;
  overdueCount: number;
  totalOverdue: number;
}

export interface AnomalyRow {
  flatNumber:    string;
  building:      string;
  tenant:        string;
  current:       number;
  previous:      number;
  changePercent: number;
}

export interface DashboardAlert {
  severity: 'error' | 'warning' | 'info';
  title:    string;
  message:  string;
  count:    number;
}

export interface MissingReadingsRow   { building: string; cycle: string }
export interface PendingIssuanceRow   { building: string; cycle: string; billCount: number }

export interface DashboardData {
  period:           { year: number; month: number };
  summary:          DashboardSummary;
  buildingStats:    BuildingStatsRow[];
  billDistribution: BillStatusPoint[];
  monthlyTrend:     MonthlyTrendPoint[];
  topConsuming:     TopConsumingFlat[];
  recurringOverdue: RecurringOverdueRow[];
  anomalies:        AnomalyRow[];
  alerts:           DashboardAlert[];
  missingReadings:  MissingReadingsRow[];
  pendingIssuance:  PendingIssuanceRow[];
}

// ─── Helpers ──────────────────────────────────────────────────────────────────

const MONTH_SHORT = ['Jan','Feb','Mar','Apr','May','Jun','Jul','Aug','Sep','Oct','Nov','Dec'];

function getLast12Months(): Array<{ year: number; month: number }> {
  const result: Array<{ year: number; month: number }> = [];
  const now = new Date();
  for (let i = 11; i >= 0; i--) {
    const d = new Date(now.getFullYear(), now.getMonth() - i, 1);
    result.push({ year: d.getFullYear(), month: d.getMonth() + 1 });
  }
  return result;
}

function round2(n: number) { return Math.round(n * 100) / 100; }

// ─── Main function ────────────────────────────────────────────────────────────

export async function getDashboardData(filters: DashboardFilters): Promise<DashboardData> {
  const supabase = await createClient();
  const now   = new Date();
  const year  = filters.periodYear  ?? now.getFullYear();
  const month = filters.periodMonth ?? (now.getMonth() + 1);

  // ── Step 1: Load base reference data in parallel ──────────────────────────
  const [
    { data: buildings },
    { data: allFlats },
    { data: activeTenancies },
    { data: companyBills },
    { data: periodCycles },
    { data: allRecentCycles },
    { data: meterAssignments },
    { data: problemCycles },
  ] = await Promise.all([
    supabase.from('buildings').select('id, name, city, currency').eq('is_active', true).is('deleted_at', null),
    supabase.from('flats').select('id, building_id, flat_number, status').eq('is_active', true).is('deleted_at', null),
    supabase.from('tenancies').select('id, flat_id, user:users!user_id(full_name)').eq('status', 'active'),
    supabase.from('electricity_company_bills').select('building_id, total_amount, total_units').eq('period_year', year).eq('period_month', month),
    supabase.from('billing_cycles').select('id, building_id, status').eq('period_year', year).eq('period_month', month),
    supabase.from('billing_cycles').select('id, period_year, period_month, building_id, status').gte('period_year', now.getFullYear() - 2).order('period_year').order('period_month'),
    supabase.from('flat_meter_assignments').select('meter_id, share_percent').is('effective_to', null),
    supabase.from('billing_cycles')
      .select('id, building_id, period_year, period_month, status, building:buildings(name)')
      .in('status', ['draft', 'readings_collected', 'calculated'])
      .order('period_year', { ascending: false })
      .order('period_month', { ascending: false })
      .limit(40),
  ]);

  // ── Step 2: Determine cycle IDs for queries ───────────────────────────────

  // Period cycles (selected month), optionally filtered by building
  const filteredPeriodCycleIds = (periodCycles ?? [])
    .filter(c => !filters.buildingId || c.building_id === filters.buildingId)
    .map(c => c.id);

  // Last 12 months for trend
  const last12Months = getLast12Months();
  const last12Set    = new Set(last12Months.map(m => `${m.year}-${m.month}`));
  const allCycleMap  = new Map((allRecentCycles ?? []).map(c => [c.id, c]));
  const trend12CycleIds = (allRecentCycles ?? [])
    .filter(c => last12Set.has(`${c.period_year}-${c.period_month}`))
    .filter(c => !filters.buildingId || c.building_id === filters.buildingId)
    .map(c => c.id);

  // Previous period (for anomaly detection)
  const prevYear  = month === 1 ? year - 1 : year;
  const prevMonth = month === 1 ? 12 : month - 1;
  const prevCycleIds = (allRecentCycles ?? [])
    .filter(c => c.period_year === prevYear && c.period_month === prevMonth)
    .filter(c => !filters.buildingId || c.building_id === filters.buildingId)
    .map(c => c.id);

  // ── Step 3: Fetch bill data in parallel ───────────────────────────────────

  const safe_in = (ids: string[]) => ids.length > 0 ? ids : ['__none__'];

  const [periodBillsRaw, trendBillsRaw, prevBillsRaw, allOverdueRaw] = await Promise.all([
    // Current-period bills
    filteredPeriodCycleIds.length > 0
      ? supabase.from('flat_bills')
          .select('id, flat_id, billing_cycle_id, total_due, amount_paid, outstanding_balance, billed_units, status, tenancy_id')
          .eq('is_current_version', true)
          .in('billing_cycle_id', filteredPeriodCycleIds)
          .not('status', 'in', '(draft,cancelled)')
          .then(r => (filters.billStatus
            ? (r.data ?? []).filter((b: any) => b.status === filters.billStatus)
            : r.data ?? []))
      : Promise.resolve([] as any[]),

    // Trend bills (last 12 months)
    trend12CycleIds.length > 0
      ? supabase.from('flat_bills')
          .select('billing_cycle_id, flat_id, total_due, amount_paid, billed_units, status')
          .eq('is_current_version', true)
          .in('billing_cycle_id', trend12CycleIds)
          .not('status', 'in', '(draft,cancelled)')
          .then(r => r.data ?? [])
      : Promise.resolve([] as any[]),

    // Previous period bills (for anomaly detection)
    prevCycleIds.length > 0
      ? supabase.from('flat_bills')
          .select('flat_id, billed_units')
          .eq('is_current_version', true)
          .in('billing_cycle_id', prevCycleIds)
          .not('status', 'in', '(draft,cancelled)')
          .then(r => r.data ?? [])
      : Promise.resolve([] as any[]),

    // All-time overdue bills (for recurring overdue analysis)
    supabase.from('flat_bills')
      .select('flat_id, outstanding_balance, billing_cycle_id')
      .eq('status', 'overdue')
      .eq('is_current_version', true)
      .then(r => r.data ?? []),
  ]);

  const periodBills: any[] = periodBillsRaw;
  const trendBills:  any[] = trendBillsRaw;
  const prevBills:   any[] = prevBillsRaw;
  const allOverdue:  any[] = allOverdueRaw;

  // ── Step 4: Build lookup maps ─────────────────────────────────────────────

  const flatMap       = new Map((allFlats ?? []).map(f => [f.id, f]));
  const buildingMap   = new Map((buildings ?? []).map(b => [b.id, b]));
  const tenancyByFlat = new Map((activeTenancies ?? []).map((t: any) => [t.flat_id, t]));

  // ── Step 5: Summary cards ─────────────────────────────────────────────────

  const filteredCompanyBills = (companyBills ?? []).filter(
    cb => !filters.buildingId || cb.building_id === filters.buildingId,
  );
  const totalCompanyCost    = filteredCompanyBills.reduce((s, b) => s + Number(b.total_amount), 0);
  const totalTenantBills    = periodBills.reduce((s, b) => s + Number(b.total_due), 0);
  const totalCollected      = periodBills.reduce((s, b) => s + Number(b.amount_paid), 0);
  const totalOutstanding    = periodBills.reduce((s, b) => s + Number(b.outstanding_balance), 0);
  const overdueCount        = periodBills.filter(b => b.status === 'overdue').length;
  const totalConsumption    = periodBills.reduce((s, b) => s + Number(b.billed_units), 0);
  const avgCostPerKwh       = totalConsumption > 0 ? totalTenantBills / totalConsumption : 0;
  const currency            = filters.buildingId
    ? (buildingMap.get(filters.buildingId)?.currency ?? 'SAR')
    : ((buildings ?? [])[0]?.currency ?? 'SAR');

  const summary: DashboardSummary = {
    currency, totalCompanyCost, totalTenantBills, totalCollected,
    totalOutstanding, overdueCount, totalConsumption, avgCostPerKwh,
  };

  // ── Step 6: Bill status distribution ──────────────────────────────────────

  const STATUS_LABELS: Record<string, string> = {
    paid: 'Paid', partial: 'Partial', unpaid: 'Unpaid', overdue: 'Overdue', waived: 'Waived',
  };
  const statusMap = new Map<string, { count: number; amount: number }>();
  for (const bill of periodBills) {
    const s = bill.status as string;
    if (!statusMap.has(s)) statusMap.set(s, { count: 0, amount: 0 });
    const e = statusMap.get(s)!;
    e.count++;
    e.amount += Number(bill.total_due);
  }
  const billDistribution: BillStatusPoint[] = [...statusMap.entries()].map(([status, v]) => ({
    status, label: STATUS_LABELS[status] ?? status, count: v.count, amount: v.amount,
  }));

  // ── Step 7: Building stats ────────────────────────────────────────────────

  // Aggregate period bills by building
  const billsByBuilding = new Map<string, { cost: number; collected: number; consumption: number }>();
  for (const bill of periodBills) {
    const flat = flatMap.get(bill.flat_id);
    if (!flat) continue;
    const bid = flat.building_id;
    if (!billsByBuilding.has(bid)) billsByBuilding.set(bid, { cost: 0, collected: 0, consumption: 0 });
    const b = billsByBuilding.get(bid)!;
    b.cost        += Number(bill.total_due);
    b.collected   += Number(bill.amount_paid);
    b.consumption += Number(bill.billed_units);
  }

  const targetBuildings = filters.buildingId
    ? (buildings ?? []).filter(b => b.id === filters.buildingId)
    : (buildings ?? []);

  const buildingStats: BuildingStatsRow[] = targetBuildings.map(b => {
    const bFlats    = (allFlats ?? []).filter(f => f.building_id === b.id);
    const occupied  = bFlats.filter(f => tenancyByFlat.has(f.id)).length;
    const totals    = billsByBuilding.get(b.id) ?? { cost: 0, collected: 0, consumption: 0 };
    const rate      = totals.cost > 0 ? (totals.collected / totals.cost) * 100 : 0;
    return {
      id: b.id, name: b.name, city: b.city,
      totalFlats:         bFlats.length,
      occupiedFlats:      occupied,
      monthlyCost:        round2(totals.cost),
      monthlyConsumption: round2(totals.consumption),
      collected:          round2(totals.collected),
      collectionRate:     round2(rate),
    };
  });

  // ── Step 8: Monthly trend ─────────────────────────────────────────────────

  const trendByPeriod = new Map<string, { year: number; month: number; cost: number; collected: number; consumption: number }>();
  for (const p of last12Months) {
    trendByPeriod.set(`${p.year}-${p.month}`, { year: p.year, month: p.month, cost: 0, collected: 0, consumption: 0 });
  }
  for (const bill of trendBills) {
    const cycle = allCycleMap.get(bill.billing_cycle_id);
    if (!cycle) continue;
    const key = `${cycle.period_year}-${cycle.period_month}`;
    if (!trendByPeriod.has(key)) continue;
    const t = trendByPeriod.get(key)!;
    t.cost        += Number(bill.total_due);
    t.collected   += Number(bill.amount_paid);
    t.consumption += Number(bill.billed_units);
  }
  const monthlyTrend: MonthlyTrendPoint[] = [...trendByPeriod.values()]
    .sort((a, b) => a.year * 100 + a.month - (b.year * 100 + b.month))
    .map(t => ({
      key:         `${t.year}-${String(t.month).padStart(2, '0')}`,
      label:       `${MONTH_SHORT[t.month - 1]} ${String(t.year).slice(2)}`,
      consumption: round2(t.consumption),
      cost:        round2(t.cost),
      collected:   round2(t.collected),
      outstanding: round2(t.cost - t.collected),
    }));

  // ── Step 9: Tenant insights ───────────────────────────────────────────────

  // Top consuming flats (current period)
  const topConsuming: TopConsumingFlat[] = [...periodBills]
    .sort((a, b) => Number(b.billed_units) - Number(a.billed_units))
    .slice(0, 8)
    .map(bill => {
      const flat     = flatMap.get(bill.flat_id);
      const tenancy  = tenancyByFlat.get(bill.flat_id);
      const building = flat ? buildingMap.get(flat.building_id) : null;
      return {
        flatNumber:  flat?.flat_number ?? bill.flat_id,
        building:    building?.name    ?? '—',
        tenant:      (tenancy?.user as any)?.full_name ?? 'Vacant',
        consumption: round2(Number(bill.billed_units)),
        totalDue:    round2(Number(bill.total_due)),
      };
    });

  // Recurring overdue flats (2+ periods)
  const overdueByFlat = new Map<string, { count: number; total: number }>();
  for (const bill of allOverdue) {
    if (!overdueByFlat.has(bill.flat_id)) overdueByFlat.set(bill.flat_id, { count: 0, total: 0 });
    const f = overdueByFlat.get(bill.flat_id)!;
    f.count++;
    f.total += Number(bill.outstanding_balance);
  }
  const recurringOverdue: RecurringOverdueRow[] = [...overdueByFlat.entries()]
    .filter(([_, v]) => v.count >= 2)
    .sort((a, b) => b[1].count - a[1].count)
    .slice(0, 8)
    .map(([flatId, v]) => {
      const flat     = flatMap.get(flatId);
      const tenancy  = tenancyByFlat.get(flatId);
      const building = flat ? buildingMap.get(flat.building_id) : null;
      return {
        flatNumber:   flat?.flat_number ?? flatId,
        building:     building?.name    ?? '—',
        tenant:       (tenancy?.user as any)?.full_name ?? 'Vacant',
        overdueCount: v.count,
        totalOverdue: round2(v.total),
      };
    });

  // Consumption anomalies (>50% increase vs previous period)
  const prevByFlat = new Map<string, number>(
    prevBills.map((b: any) => [b.flat_id, Number(b.billed_units)]),
  );
  const anomalies: AnomalyRow[] = periodBills
    .filter(bill => {
      const prev = prevByFlat.get(bill.flat_id) ?? 0;
      return prev > 0 && ((Number(bill.billed_units) - prev) / prev) > 0.50;
    })
    .map(bill => {
      const prev     = prevByFlat.get(bill.flat_id)!;
      const current  = Number(bill.billed_units);
      const flat     = flatMap.get(bill.flat_id);
      const tenancy  = tenancyByFlat.get(bill.flat_id);
      const building = flat ? buildingMap.get(flat.building_id) : null;
      return {
        flatNumber:    flat?.flat_number ?? bill.flat_id,
        building:      building?.name    ?? '—',
        tenant:        (tenancy?.user as any)?.full_name ?? 'Vacant',
        current:       round2(current),
        previous:      round2(prev),
        changePercent: Math.round(((current - prev) / prev) * 100),
      };
    })
    .sort((a, b) => b.changePercent - a.changePercent)
    .slice(0, 8);

  // ── Step 10: Pending actions ──────────────────────────────────────────────

  const missingReadings: MissingReadingsRow[] = (problemCycles ?? [])
    .filter(c => c.status === 'draft')
    .filter(c => !filters.buildingId || c.building_id === filters.buildingId)
    .slice(0, 10)
    .map(c => ({
      building: (c.building as any)?.name ?? '—',
      cycle:    `${MONTH_SHORT[c.period_month - 1]} ${c.period_year}`,
    }));

  const pendingIssuance: PendingIssuanceRow[] = (problemCycles ?? [])
    .filter(c => c.status === 'calculated')
    .filter(c => !filters.buildingId || c.building_id === filters.buildingId)
    .slice(0, 10)
    .map(c => ({
      building:  (c.building as any)?.name ?? '—',
      cycle:     `${MONTH_SHORT[c.period_month - 1]} ${c.period_year}`,
      billCount: 0, // enriched below if needed
    }));

  // ── Step 11: Alerts ───────────────────────────────────────────────────────

  // Allocation errors
  const allocationByMeter = new Map<string, number>();
  for (const a of meterAssignments ?? []) {
    allocationByMeter.set(a.meter_id, (allocationByMeter.get(a.meter_id) ?? 0) + Number(a.share_percent));
  }
  const badAllocCount = [...allocationByMeter.values()].filter(t => Math.abs(t - 100) > 0.5).length;

  const alerts: DashboardAlert[] = [];

  if (overdueCount > 0) {
    alerts.push({
      severity: 'error',
      title:    'Overdue Bills',
      message:  `${overdueCount} bill${overdueCount > 1 ? 's are' : ' is'} overdue with ${currency} ${round2(totalOutstanding).toLocaleString('en', { minimumFractionDigits: 2 })} outstanding.`,
      count:    overdueCount,
    });
  }

  const pendingIssueCount = (problemCycles ?? []).filter(c => c.status === 'calculated').length;
  if (pendingIssueCount > 0) {
    alerts.push({
      severity: 'warning',
      title:    'Bills Awaiting Issuance',
      message:  `${pendingIssueCount} billing cycle${pendingIssueCount > 1 ? 's have' : ' has'} calculated bills that haven't been issued to tenants yet.`,
      count:    pendingIssueCount,
    });
  }

  const readingsPendingCount = missingReadings.length;
  if (readingsPendingCount > 0) {
    alerts.push({
      severity: 'warning',
      title:    'Meter Readings Pending',
      message:  `${readingsPendingCount} billing cycle${readingsPendingCount > 1 ? 's are' : ' is'} still in draft — meter readings not yet collected.`,
      count:    readingsPendingCount,
    });
  }

  const noCompanyBillsCount = (problemCycles ?? [])
    .filter(c => c.status === 'readings_collected')
    .filter(c => !filters.buildingId || c.building_id === filters.buildingId).length;
  if (noCompanyBillsCount > 0) {
    alerts.push({
      severity: 'warning',
      title:    'Company Bills Not Entered',
      message:  `${noCompanyBillsCount} cycle${noCompanyBillsCount > 1 ? 's have' : ' has'} readings collected but electricity company bills not yet imported.`,
      count:    noCompanyBillsCount,
    });
  }

  if (badAllocCount > 0) {
    alerts.push({
      severity: 'error',
      title:    'Meter Allocation Error',
      message:  `${badAllocCount} meter${badAllocCount > 1 ? 's have' : ' has'} shared allocations that don't add up to 100%. This will cause incorrect billing.`,
      count:    badAllocCount,
    });
  }

  if (anomalies.length > 0) {
    alerts.push({
      severity: 'info',
      title:    'Consumption Anomalies',
      message:  `${anomalies.length} flat${anomalies.length > 1 ? 's have' : ' has'} consumption more than 50% higher than the previous period. Review the Insights section.`,
      count:    anomalies.length,
    });
  }

  // ─────────────────────────────────────────────────────────────────────────
  return {
    period:   { year, month },
    summary,
    buildingStats,
    billDistribution,
    monthlyTrend,
    topConsuming,
    recurringOverdue,
    anomalies,
    alerts,
    missingReadings,
    pendingIssuance,
  };
}
