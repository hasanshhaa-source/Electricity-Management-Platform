/**
 * Archive service — queries ALL bill versions (including superseded ones).
 * Bills are never hard-deleted; corrections produce new versions via
 * is_current_version / version columns.
 */
import { createClient } from '@/lib/supabase/server';
import type { BillStatus } from '@/types';

export interface ArchiveBillRow {
  id:                   string;
  version:              number;
  is_current_version:   boolean;
  status:               BillStatus;
  period_year:          number;
  period_month:         number;
  billed_units:         number;
  rate_per_unit:        number;
  current_charges:      number;
  difference_adjustment: number;
  previous_balance:     number;
  total_due:            number;
  amount_paid:          number;
  outstanding_balance:  number;
  due_date:             string;
  paid_at:              string | null;
  calculated_at:        string | null;
  flat: {
    id:          string;
    flat_number: string;
    building: {
      id:   string;
      name: string;
      city: string;
    };
  };
  tenancy: {
    user: {
      id:        string;
      full_name: string;
      email:     string;
    };
  } | null;
}

export interface ArchiveFilters {
  buildingId?:  string;
  flatSearch?:  string;
  tenantSearch?: string;
  year?:        number;
  month?:       number;
  status?:      string;
  allVersions?: boolean; // true = include superseded versions
}

const ARCHIVE_SELECT = `
  id, version, is_current_version, status,
  period_year, period_month,
  billed_units, rate_per_unit, current_charges,
  difference_adjustment, previous_balance,
  total_due, amount_paid, outstanding_balance,
  due_date, paid_at, calculated_at,
  flat:flats(
    id, flat_number,
    building:buildings(id, name, city)
  ),
  tenancy:tenancies(
    user:users!user_id(id, full_name, email)
  )
`;

export async function getArchiveBills(filters: ArchiveFilters = {}): Promise<ArchiveBillRow[]> {
  const supabase = await createClient();

  let query = supabase
    .from('flat_bills')
    .select(ARCHIVE_SELECT)
    .order('period_year',  { ascending: false })
    .order('period_month', { ascending: false })
    .order('version',      { ascending: false });

  // Only superseded versions if allVersions requested
  if (!filters.allVersions) {
    query = query.eq('is_current_version', true);
  }

  if (filters.year)   query = query.eq('period_year',  filters.year);
  if (filters.month)  query = query.eq('period_month', filters.month);
  if (filters.status) query = query.eq('status', filters.status);

  const { data } = await query.limit(500);
  let rows = (data ?? []) as unknown as ArchiveBillRow[];

  // In-JS filters for nested fields
  if (filters.buildingId) {
    rows = rows.filter(r => r.flat?.building?.id === filters.buildingId);
  }
  if (filters.flatSearch) {
    const q = filters.flatSearch.toLowerCase();
    rows = rows.filter(r => r.flat?.flat_number?.toLowerCase().includes(q));
  }
  if (filters.tenantSearch) {
    const q = filters.tenantSearch.toLowerCase();
    rows = rows.filter(r =>
      r.tenancy?.user?.full_name?.toLowerCase().includes(q) ||
      r.tenancy?.user?.email?.toLowerCase().includes(q),
    );
  }

  return rows;
}

// ── CSV export helper ──────────────────────────────────────────────────────────

const MONTH_SHORT = ['Jan','Feb','Mar','Apr','May','Jun','Jul','Aug','Sep','Oct','Nov','Dec'];

function escapeCSV(v: unknown): string {
  const s = v == null ? '' : String(v);
  return s.includes(',') || s.includes('"') || s.includes('\n')
    ? `"${s.replace(/"/g, '""')}"`
    : s;
}

export function billsToCSV(rows: ArchiveBillRow[]): string {
  const headers = [
    'Period', 'Building', 'Flat', 'Tenant', 'Tenant Email',
    'Consumption (kWh)', 'Rate/kWh', 'Current Charges', 'Adjustment',
    'Previous Balance', 'Total Due', 'Amount Paid', 'Outstanding',
    'Due Date', 'Paid At', 'Status', 'Version', 'Current?',
  ];

  const lines: string[] = [headers.map(escapeCSV).join(',')];

  for (const r of rows) {
    const period = `${MONTH_SHORT[(r.period_month ?? 1) - 1]} ${r.period_year}`;
    lines.push([
      period,
      r.flat?.building?.name ?? '',
      r.flat?.flat_number ?? '',
      r.tenancy?.user?.full_name ?? '',
      r.tenancy?.user?.email ?? '',
      r.billed_units,
      r.rate_per_unit,
      r.current_charges,
      r.difference_adjustment,
      r.previous_balance,
      r.total_due,
      r.amount_paid,
      r.outstanding_balance,
      r.due_date ?? '',
      r.paid_at ?? '',
      r.status,
      r.version,
      r.is_current_version ? 'Yes' : 'No',
    ].map(escapeCSV).join(','));
  }

  return lines.join('\r\n');
}
