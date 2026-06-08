import { requireAdmin } from '@/services/auth/authService';
import { getDashboardData } from '@/services/analytics/analyticsService';
import { createClient } from '@/lib/supabase/server';
import { PageHeader } from '@/components/shared/page-header';
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card';
import { Badge } from '@/components/ui/badge';
import { Alert, AlertDescription, AlertTitle } from '@/components/ui/alert';
import { DashboardFilters } from './dashboard-filters';
import { BillStatusChart } from './bill-status-chart';
import { MonthlyTrendChart } from './monthly-trend-chart';
import {
  Zap, DollarSign, TrendingUp, AlertTriangle, Users, Activity,
  Building2, BarChart3, AlertCircle, Info,
} from 'lucide-react';

interface PageProps {
  searchParams: Promise<{
    building_id?: string;
    year?:        string;
    month?:       string;
    status?:      string;
  }>;
}

async function getBuildings() {
  const supabase = await createClient();
  const { data } = await supabase.from('buildings').select('id, name').eq('is_active', true).is('deleted_at', null).order('name');
  return data ?? [];
}

function fmt(n: number, currency: string, decimals = 2) {
  return `${currency} ${n.toLocaleString('en', { minimumFractionDigits: decimals, maximumFractionDigits: decimals })}`;
}

function fmtKwh(n: number) {
  return `${n.toLocaleString('en', { minimumFractionDigits: 0, maximumFractionDigits: 0 })} kWh`;
}

const MONTH_NAMES = ['Jan','Feb','Mar','Apr','May','Jun','Jul','Aug','Sep','Oct','Nov','Dec'];

export default async function AdminDashboardPage({ searchParams }: PageProps) {
  await requireAdmin();
  const params = await searchParams;

  const filters = {
    buildingId:  params.building_id || undefined,
    periodYear:  params.year   ? Number(params.year)  : undefined,
    periodMonth: params.month  ? Number(params.month) : undefined,
    billStatus:  params.status || undefined,
  };

  const [buildings, data] = await Promise.all([
    getBuildings(),
    getDashboardData(filters),
  ]);

  const { period, summary, buildingStats, billDistribution, monthlyTrend,
          topConsuming, recurringOverdue, anomalies, alerts,
          missingReadings, pendingIssuance } = data;

  const periodLabel = `${MONTH_NAMES[period.month - 1]} ${period.year}`;

  return (
    <div className="space-y-6">
      <div className="flex flex-col gap-4 sm:flex-row sm:items-center sm:justify-between">
        <PageHeader
          title="Analytics Dashboard"
          description={`Overview for ${periodLabel}`}
        />
        <DashboardFilters
          buildings={buildings}
          selectedBuilding={params.building_id ?? ''}
          selectedYear={params.year ?? ''}
          selectedMonth={params.month ?? ''}
          selectedStatus={params.status ?? ''}
        />
      </div>

      {/* ── Alerts ───────────────────────────────────────────────────── */}
      {alerts.length > 0 && (
        <div className="space-y-2">
          {alerts.map((alert, i) => (
            <Alert
              key={i}
              variant={alert.severity === 'error' ? 'destructive' : alert.severity === 'warning' ? 'warning' : 'default'}
            >
              {alert.severity === 'error'   ? <AlertCircle   className="h-4 w-4" /> :
               alert.severity === 'warning' ? <AlertTriangle className="h-4 w-4" /> :
                                              <Info          className="h-4 w-4" />}
              <AlertTitle>{alert.title}</AlertTitle>
              <AlertDescription>{alert.message}</AlertDescription>
            </Alert>
          ))}
        </div>
      )}

      {/* ── 7 Summary Cards ──────────────────────────────────────────── */}
      <div className="grid grid-cols-2 gap-4 sm:grid-cols-3 lg:grid-cols-4 xl:grid-cols-7">
        <Card>
          <CardContent className="pt-5">
            <div className="flex items-start justify-between">
              <div>
                <p className="text-xs font-medium text-gray-500">Company Cost</p>
                <p className="mt-1 text-lg font-bold text-gray-900 leading-tight">
                  {fmt(summary.totalCompanyCost, summary.currency)}
                </p>
              </div>
              <DollarSign className="h-4 w-4 text-gray-400 mt-0.5" />
            </div>
          </CardContent>
        </Card>

        <Card>
          <CardContent className="pt-5">
            <div className="flex items-start justify-between">
              <div>
                <p className="text-xs font-medium text-gray-500">Tenant Bills</p>
                <p className="mt-1 text-lg font-bold text-gray-900 leading-tight">
                  {fmt(summary.totalTenantBills, summary.currency)}
                </p>
              </div>
              <BarChart3 className="h-4 w-4 text-gray-400 mt-0.5" />
            </div>
          </CardContent>
        </Card>

        <Card>
          <CardContent className="pt-5">
            <div className="flex items-start justify-between">
              <div>
                <p className="text-xs font-medium text-gray-500">Collected</p>
                <p className="mt-1 text-lg font-bold text-green-700 leading-tight">
                  {fmt(summary.totalCollected, summary.currency)}
                </p>
              </div>
              <TrendingUp className="h-4 w-4 text-green-400 mt-0.5" />
            </div>
          </CardContent>
        </Card>

        <Card>
          <CardContent className="pt-5">
            <div className="flex items-start justify-between">
              <div>
                <p className="text-xs font-medium text-gray-500">Outstanding</p>
                <p className={`mt-1 text-lg font-bold leading-tight ${summary.totalOutstanding > 0 ? 'text-red-600' : 'text-gray-900'}`}>
                  {fmt(summary.totalOutstanding, summary.currency)}
                </p>
              </div>
              <AlertTriangle className={`h-4 w-4 mt-0.5 ${summary.totalOutstanding > 0 ? 'text-red-400' : 'text-gray-300'}`} />
            </div>
          </CardContent>
        </Card>

        <Card>
          <CardContent className="pt-5">
            <div className="flex items-start justify-between">
              <div>
                <p className="text-xs font-medium text-gray-500">Overdue</p>
                <p className={`mt-1 text-lg font-bold leading-tight ${summary.overdueCount > 0 ? 'text-red-600' : 'text-gray-900'}`}>
                  {summary.overdueCount}
                </p>
                <p className="text-xs text-gray-400">tenants</p>
              </div>
              <Users className={`h-4 w-4 mt-0.5 ${summary.overdueCount > 0 ? 'text-red-400' : 'text-gray-300'}`} />
            </div>
          </CardContent>
        </Card>

        <Card>
          <CardContent className="pt-5">
            <div className="flex items-start justify-between">
              <div>
                <p className="text-xs font-medium text-gray-500">Consumption</p>
                <p className="mt-1 text-lg font-bold text-gray-900 leading-tight">
                  {fmtKwh(summary.totalConsumption)}
                </p>
              </div>
              <Zap className="h-4 w-4 text-yellow-400 mt-0.5" />
            </div>
          </CardContent>
        </Card>

        <Card>
          <CardContent className="pt-5">
            <div className="flex items-start justify-between">
              <div>
                <p className="text-xs font-medium text-gray-500">Avg / kWh</p>
                <p className="mt-1 text-lg font-bold text-gray-900 leading-tight">
                  {fmt(summary.avgCostPerKwh, summary.currency, 4)}
                </p>
              </div>
              <Activity className="h-4 w-4 text-gray-400 mt-0.5" />
            </div>
          </CardContent>
        </Card>
      </div>

      {/* ── Charts row ───────────────────────────────────────────────── */}
      <div className="grid grid-cols-1 gap-6 lg:grid-cols-2">
        <Card>
          <CardHeader>
            <CardTitle className="text-sm">Bill Status Distribution</CardTitle>
          </CardHeader>
          <CardContent>
            <BillStatusChart data={billDistribution} currency={summary.currency} />
          </CardContent>
        </Card>

        <Card>
          <CardHeader>
            <CardTitle className="text-sm">Monthly Trend (12 months)</CardTitle>
          </CardHeader>
          <CardContent>
            <MonthlyTrendChart data={monthlyTrend} currency={summary.currency} />
          </CardContent>
        </Card>
      </div>

      {/* ── Building Stats Table ─────────────────────────────────────── */}
      <Card>
        <CardHeader>
          <CardTitle className="flex items-center gap-2">
            <Building2 className="h-4 w-4 text-gray-400" />
            Building Performance
          </CardTitle>
        </CardHeader>
        <CardContent className="p-0">
          <div className="overflow-x-auto">
            <table className="w-full text-sm">
              <thead className="border-b border-gray-100 bg-gray-50">
                <tr>
                  {['Building','City','Flats','Occupied','Vacant',
                    'Monthly Cost','Consumption','Collected','Collection Rate'].map(h => (
                    <th key={h} className="px-4 py-2.5 text-left font-medium text-gray-500 whitespace-nowrap">{h}</th>
                  ))}
                </tr>
              </thead>
              <tbody className="divide-y divide-gray-50">
                {buildingStats.length === 0 ? (
                  <tr>
                    <td colSpan={9} className="py-8 text-center text-gray-400">No buildings found</td>
                  </tr>
                ) : buildingStats.map(b => (
                  <tr key={b.id} className="hover:bg-gray-50">
                    <td className="px-4 py-3 font-medium text-gray-900">{b.name}</td>
                    <td className="px-4 py-3 text-gray-600">{b.city}</td>
                    <td className="px-4 py-3 text-gray-900">{b.totalFlats}</td>
                    <td className="px-4 py-3 text-gray-900">{b.occupiedFlats}</td>
                    <td className="px-4 py-3 text-gray-600">{b.totalFlats - b.occupiedFlats}</td>
                    <td className="px-4 py-3 text-gray-900">{fmt(b.monthlyCost, summary.currency)}</td>
                    <td className="px-4 py-3 text-gray-900">{fmtKwh(b.monthlyConsumption)}</td>
                    <td className="px-4 py-3 text-green-700 font-medium">{fmt(b.collected, summary.currency)}</td>
                    <td className="px-4 py-3">
                      <div className="flex items-center gap-2">
                        <div className="h-1.5 w-16 rounded-full bg-gray-200">
                          <div
                            className={`h-1.5 rounded-full ${b.collectionRate >= 80 ? 'bg-green-500' : b.collectionRate >= 50 ? 'bg-yellow-400' : 'bg-red-400'}`}
                            style={{ width: `${Math.min(b.collectionRate, 100)}%` }}
                          />
                        </div>
                        <span className={b.collectionRate >= 80 ? 'text-green-700' : b.collectionRate >= 50 ? 'text-yellow-700' : 'text-red-600'}>
                          {b.collectionRate.toFixed(1)}%
                        </span>
                      </div>
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        </CardContent>
      </Card>

      {/* ── Insights ─────────────────────────────────────────────────── */}
      <div className="grid grid-cols-1 gap-6 lg:grid-cols-3">
        {/* Top Consuming */}
        <Card>
          <CardHeader>
            <CardTitle className="flex items-center gap-2 text-sm">
              <Zap className="h-4 w-4 text-yellow-500" />
              Top Consuming Flats
            </CardTitle>
          </CardHeader>
          <CardContent className="p-0">
            {topConsuming.length === 0 ? (
              <p className="px-4 py-6 text-center text-sm text-gray-400">No data</p>
            ) : (
              <div className="divide-y divide-gray-50">
                {topConsuming.map((f, i) => (
                  <div key={i} className="flex items-center justify-between px-4 py-2.5">
                    <div className="min-w-0">
                      <p className="text-sm font-medium text-gray-900 truncate">Flat {f.flatNumber} — {f.building}</p>
                      <p className="text-xs text-gray-500 truncate">{f.tenant}</p>
                    </div>
                    <span className="ml-2 shrink-0 text-sm font-medium text-gray-900">{fmtKwh(f.consumption)}</span>
                  </div>
                ))}
              </div>
            )}
          </CardContent>
        </Card>

        {/* Recurring Overdue */}
        <Card>
          <CardHeader>
            <CardTitle className="flex items-center gap-2 text-sm">
              <AlertCircle className="h-4 w-4 text-red-500" />
              Recurring Overdue Flats
            </CardTitle>
          </CardHeader>
          <CardContent className="p-0">
            {recurringOverdue.length === 0 ? (
              <p className="px-4 py-6 text-center text-sm text-gray-400">No recurring overdue</p>
            ) : (
              <div className="divide-y divide-gray-50">
                {recurringOverdue.map((f, i) => (
                  <div key={i} className="flex items-center justify-between px-4 py-2.5">
                    <div className="min-w-0">
                      <p className="text-sm font-medium text-gray-900 truncate">Flat {f.flatNumber} — {f.building}</p>
                      <p className="text-xs text-gray-500 truncate">{f.tenant}</p>
                    </div>
                    <div className="ml-2 shrink-0 text-right">
                      <Badge variant="destructive" className="text-xs">{f.overdueCount}×</Badge>
                      <p className="text-xs text-gray-500 mt-0.5">{fmt(f.totalOverdue, summary.currency)}</p>
                    </div>
                  </div>
                ))}
              </div>
            )}
          </CardContent>
        </Card>

        {/* Consumption Anomalies */}
        <Card>
          <CardHeader>
            <CardTitle className="flex items-center gap-2 text-sm">
              <Activity className="h-4 w-4 text-indigo-500" />
              Consumption Anomalies
            </CardTitle>
          </CardHeader>
          <CardContent className="p-0">
            {anomalies.length === 0 ? (
              <p className="px-4 py-6 text-center text-sm text-gray-400">No anomalies detected</p>
            ) : (
              <div className="divide-y divide-gray-50">
                {anomalies.map((a, i) => (
                  <div key={i} className="flex items-center justify-between px-4 py-2.5">
                    <div className="min-w-0">
                      <p className="text-sm font-medium text-gray-900 truncate">Flat {a.flatNumber} — {a.building}</p>
                      <p className="text-xs text-gray-500 truncate">{a.tenant}</p>
                    </div>
                    <div className="ml-2 shrink-0 text-right">
                      <span className="text-sm font-bold text-orange-600">+{a.changePercent}%</span>
                      <p className="text-xs text-gray-400">{fmtKwh(a.previous)} → {fmtKwh(a.current)}</p>
                    </div>
                  </div>
                ))}
              </div>
            )}
          </CardContent>
        </Card>
      </div>

      {/* ── Pending Actions ───────────────────────────────────────────── */}
      {(missingReadings.length > 0 || pendingIssuance.length > 0) && (
        <div className="grid grid-cols-1 gap-6 lg:grid-cols-2">
          {missingReadings.length > 0 && (
            <Card>
              <CardHeader>
                <CardTitle className="text-sm text-amber-700">Missing Meter Readings</CardTitle>
              </CardHeader>
              <CardContent className="p-0">
                <div className="divide-y divide-gray-50">
                  {missingReadings.map((r, i) => (
                    <div key={i} className="flex items-center justify-between px-4 py-2.5">
                      <span className="text-sm text-gray-700">{r.building}</span>
                      <span className="text-sm text-gray-500">{r.cycle}</span>
                    </div>
                  ))}
                </div>
              </CardContent>
            </Card>
          )}

          {pendingIssuance.length > 0 && (
            <Card>
              <CardHeader>
                <CardTitle className="text-sm text-blue-700">Bills Pending Issuance</CardTitle>
              </CardHeader>
              <CardContent className="p-0">
                <div className="divide-y divide-gray-50">
                  {pendingIssuance.map((r, i) => (
                    <div key={i} className="flex items-center justify-between px-4 py-2.5">
                      <span className="text-sm text-gray-700">{r.building}</span>
                      <span className="text-sm text-gray-500">{r.cycle}</span>
                    </div>
                  ))}
                </div>
              </CardContent>
            </Card>
          )}
        </div>
      )}
    </div>
  );
}
