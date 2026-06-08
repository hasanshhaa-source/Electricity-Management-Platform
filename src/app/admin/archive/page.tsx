import { requireAdmin } from '@/services/auth/authService';
import { getArchiveBills } from '@/services/archive/archiveService';
import { createClient } from '@/lib/supabase/server';
import { PageHeader } from '@/components/shared/page-header';
import { Card, CardContent } from '@/components/ui/card';
import { Badge } from '@/components/ui/badge';
import { BillStatusBadge } from '@/components/shared/status-badge';
import { ArchiveFilters } from './archive-filters';

const MONTH_SHORT = ['Jan','Feb','Mar','Apr','May','Jun','Jul','Aug','Sep','Oct','Nov','Dec'];

interface PageProps {
  searchParams: Promise<{
    building_id?: string;
    year?:        string;
    month?:       string;
    status?:      string;
    flat?:        string;
    tenant?:      string;
    all_versions?: string;
  }>;
}

async function getBuildings() {
  const supabase = await createClient();
  const { data } = await supabase
    .from('buildings').select('id, name')
    .eq('is_active', true).is('deleted_at', null).order('name');
  return data ?? [];
}

function fmt(n: number) { return n.toLocaleString('en', { minimumFractionDigits: 2, maximumFractionDigits: 2 }); }
function fmtKwh(n: number) { return n.toLocaleString('en', { minimumFractionDigits: 1, maximumFractionDigits: 1 }); }

export default async function ArchivePage({ searchParams }: PageProps) {
  await requireAdmin();
  const p = await searchParams;

  const [buildings, rows] = await Promise.all([
    getBuildings(),
    getArchiveBills({
      buildingId:   p.building_id,
      flatSearch:   p.flat,
      tenantSearch: p.tenant,
      year:         p.year   ? Number(p.year)  : undefined,
      month:        p.month  ? Number(p.month) : undefined,
      status:       p.status,
      allVersions:  p.all_versions === '1',
    }),
  ]);

  // Summary totals for visible rows
  const totalDue   = rows.reduce((s, r) => s + Number(r.total_due),           0);
  const totalPaid  = rows.reduce((s, r) => s + Number(r.amount_paid),          0);
  const totalKwh   = rows.reduce((s, r) => s + Number(r.billed_units),         0);
  const outstanding = rows.reduce((s, r) => s + Number(r.outstanding_balance), 0);

  return (
    <div className="space-y-6">
      <PageHeader
        title="Bill Archive"
        description="Full historical record of all issued bills. Bills are never deleted; corrections create new versions."
      />

      {/* Totals row */}
      <div className="grid grid-cols-2 gap-3 sm:grid-cols-4">
        {[
          { label: 'Bills',       value: rows.length.toLocaleString() },
          { label: 'Consumption', value: `${fmtKwh(totalKwh)} kWh` },
          { label: 'Total Billed', value: fmt(totalDue) },
          { label: 'Outstanding',  value: fmt(outstanding), red: outstanding > 0 },
        ].map(s => (
          <div key={s.label} className="rounded-lg border border-gray-200 bg-white px-4 py-3">
            <p className="text-xs text-gray-500">{s.label}</p>
            <p className={`mt-0.5 text-lg font-bold ${s.red ? 'text-red-600' : 'text-gray-900'}`}>{s.value}</p>
          </div>
        ))}
      </div>

      <Card>
        <CardContent className="pt-5 space-y-4">
          <ArchiveFilters
            buildings={buildings}
            selectedBuilding={p.building_id ?? ''}
            selectedYear={p.year ?? ''}
            selectedMonth={p.month ?? ''}
            selectedStatus={p.status ?? ''}
            selectedFlat={p.flat ?? ''}
            selectedTenant={p.tenant ?? ''}
            totalRows={rows.length}
          />

          <div className="overflow-x-auto rounded-lg border border-gray-200">
            <table className="w-full text-sm">
              <thead className="border-b border-gray-100 bg-gray-50">
                <tr>
                  {['Period','Building','Flat','Tenant','Consumption','Total Due','Paid','Outstanding','Due Date','Status','Ver'].map(h => (
                    <th key={h} className="px-3 py-2.5 text-left font-medium text-gray-500 whitespace-nowrap text-xs">{h}</th>
                  ))}
                </tr>
              </thead>
              <tbody className="divide-y divide-gray-50">
                {rows.length === 0 ? (
                  <tr><td colSpan={11} className="py-10 text-center text-gray-400">No bills found matching filters</td></tr>
                ) : rows.map(r => (
                  <tr key={r.id} className={`hover:bg-gray-50 ${!r.is_current_version ? 'opacity-50' : ''}`}>
                    <td className="px-3 py-2.5 font-medium text-gray-900 whitespace-nowrap">
                      {MONTH_SHORT[(r.period_month ?? 1) - 1]} {r.period_year}
                    </td>
                    <td className="px-3 py-2.5 text-gray-700">{r.flat?.building?.name}</td>
                    <td className="px-3 py-2.5 text-gray-900">Flat {r.flat?.flat_number}</td>
                    <td className="px-3 py-2.5">
                      <p className="font-medium text-gray-900 truncate max-w-[120px]">{r.tenancy?.user?.full_name ?? '—'}</p>
                    </td>
                    <td className="px-3 py-2.5 font-mono text-right">{fmtKwh(Number(r.billed_units))}</td>
                    <td className="px-3 py-2.5 font-mono text-right">{fmt(Number(r.total_due))}</td>
                    <td className="px-3 py-2.5 font-mono text-right text-green-700">{fmt(Number(r.amount_paid))}</td>
                    <td className={`px-3 py-2.5 font-mono text-right ${Number(r.outstanding_balance) > 0 ? 'text-red-600' : 'text-gray-400'}`}>
                      {fmt(Number(r.outstanding_balance))}
                    </td>
                    <td className="px-3 py-2.5 text-gray-500 text-xs whitespace-nowrap">
                      {r.due_date ? new Date(r.due_date).toLocaleDateString() : '—'}
                    </td>
                    <td className="px-3 py-2.5">
                      <BillStatusBadge status={r.status} />
                    </td>
                    <td className="px-3 py-2.5 text-center">
                      {!r.is_current_version
                        ? <Badge variant="secondary" className="text-xs">v{r.version}</Badge>
                        : <span className="text-xs text-gray-400">v{r.version}</span>}
                    </td>
                  </tr>
                ))}
              </tbody>
              {rows.length > 0 && (
                <tfoot className="border-t border-gray-200 bg-gray-50">
                  <tr>
                    <td colSpan={4} className="px-3 py-2 text-xs font-semibold text-gray-600">Totals</td>
                    <td className="px-3 py-2 font-mono text-right text-xs font-semibold">{fmtKwh(totalKwh)}</td>
                    <td className="px-3 py-2 font-mono text-right text-xs font-semibold">{fmt(totalDue)}</td>
                    <td className="px-3 py-2 font-mono text-right text-xs font-semibold text-green-700">{fmt(totalPaid)}</td>
                    <td className={`px-3 py-2 font-mono text-right text-xs font-semibold ${outstanding > 0 ? 'text-red-600' : 'text-gray-400'}`}>{fmt(outstanding)}</td>
                    <td colSpan={3} />
                  </tr>
                </tfoot>
              )}
            </table>
          </div>
        </CardContent>
      </Card>
    </div>
  );
}
