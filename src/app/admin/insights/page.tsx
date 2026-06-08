import { requireAdmin } from '@/services/auth/authService';
import { getInsightData } from '@/services/insights/insightService';
import { createClient } from '@/lib/supabase/server';
import { PageHeader } from '@/components/shared/page-header';
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card';
import { Badge } from '@/components/ui/badge';
import { Alert, AlertDescription, AlertTitle } from '@/components/ui/alert';
import { InsightsTrendChart } from './trend-chart';
import {
  TrendingUp, AlertTriangle, Clock, Zap, DollarSign, BarChart3,
} from 'lucide-react';

interface PageProps {
  searchParams: Promise<{ building_id?: string }>;
}

async function getBuildings() {
  const supabase = await createClient();
  const { data } = await supabase.from('buildings').select('id, name')
    .eq('is_active', true).is('deleted_at', null).order('name');
  return data ?? [];
}

function fmt(n: number, currency: string) {
  return `${currency} ${n.toLocaleString('en', { minimumFractionDigits: 2 })}`;
}
function fmtKwh(n: number) { return `${n.toLocaleString('en', { maximumFractionDigits: 1 })} kWh`; }

const MONTH_SHORT = ['Jan','Feb','Mar','Apr','May','Jun','Jul','Aug','Sep','Oct','Nov','Dec'];

export default async function InsightsPage({ searchParams }: PageProps) {
  await requireAdmin();
  const p          = await searchParams;
  const [buildings, data] = await Promise.all([
    getBuildings(),
    getInsightData(p.building_id),
  ]);

  const { flatProfiles, anomalies, latePaymentRisk, yearlyTrend,
          totalBillsIssued, totalCollected, totalOutstanding, currency } = data;

  const highAnomalies = anomalies.filter(a => a.severity === 'high');

  return (
    <div className="space-y-6">
      <div className="flex flex-col gap-3 sm:flex-row sm:items-center sm:justify-between">
        <PageHeader title="Historical Insights" description="Consumption patterns, anomalies, and payment behavior" />
        {/* Building filter */}
        <form method="GET" className="flex items-center gap-2">
          <select name="building_id" defaultValue={p.building_id ?? ''}
            className="rounded-md border border-gray-300 bg-white px-3 py-1.5 text-sm"
            onChange={(e) => { const url = new URL(window.location.href); if (e.target.value) url.searchParams.set('building_id', e.target.value); else url.searchParams.delete('building_id'); window.location.href = url.toString(); }}>
            <option value="">All Buildings</option>
            {buildings.map(b => <option key={b.id} value={b.id}>{b.name}</option>)}
          </select>
        </form>
      </div>

      {/* Anomaly alerts */}
      {highAnomalies.length > 0 && (
        <Alert variant="warning">
          <AlertTriangle className="h-4 w-4" />
          <AlertTitle>High Consumption Anomalies Detected</AlertTitle>
          <AlertDescription>
            {highAnomalies.length} flat{highAnomalies.length > 1 ? 's have' : ' has'} consumption ≥50% higher than the previous month.
          </AlertDescription>
        </Alert>
      )}

      {/* Summary cards */}
      <div className="grid grid-cols-2 gap-4 sm:grid-cols-3">
        <Card><CardContent className="pt-5">
          <p className="text-xs text-gray-500">Bills Issued (historical)</p>
          <p className="mt-1 text-2xl font-bold text-gray-900">{totalBillsIssued.toLocaleString()}</p>
          <BarChart3 className="mt-1 h-4 w-4 text-gray-300" />
        </CardContent></Card>
        <Card><CardContent className="pt-5">
          <p className="text-xs text-gray-500">Total Collected</p>
          <p className="mt-1 text-2xl font-bold text-green-700">{fmt(totalCollected, currency)}</p>
          <DollarSign className="mt-1 h-4 w-4 text-green-300" />
        </CardContent></Card>
        <Card><CardContent className="pt-5">
          <p className="text-xs text-gray-500">Total Outstanding</p>
          <p className={`mt-1 text-2xl font-bold ${totalOutstanding > 0 ? 'text-red-600' : 'text-gray-900'}`}>
            {fmt(totalOutstanding, currency)}
          </p>
          <AlertTriangle className={`mt-1 h-4 w-4 ${totalOutstanding > 0 ? 'text-red-300' : 'text-gray-200'}`} />
        </CardContent></Card>
      </div>

      {/* Yearly trend chart */}
      <Card>
        <CardHeader>
          <CardTitle className="flex items-center gap-2 text-sm">
            <TrendingUp className="h-4 w-4 text-indigo-500" />
            12-Month Cost &amp; Consumption Trend
          </CardTitle>
        </CardHeader>
        <CardContent>
          <InsightsTrendChart data={yearlyTrend} currency={currency} />
        </CardContent>
      </Card>

      {/* Three-column insights */}
      <div className="grid grid-cols-1 gap-6 lg:grid-cols-3">

        {/* Consumption anomalies */}
        <Card>
          <CardHeader>
            <CardTitle className="flex items-center gap-2 text-sm">
              <AlertTriangle className="h-4 w-4 text-orange-500" />
              Consumption Anomalies
              <span className="ml-auto text-xs font-normal text-gray-400">≥30% increase</span>
            </CardTitle>
          </CardHeader>
          <CardContent className="p-0">
            {anomalies.length === 0 ? (
              <p className="px-4 py-6 text-center text-sm text-gray-400">No anomalies detected</p>
            ) : (
              <div className="divide-y divide-gray-50">
                {anomalies.slice(0, 10).map((a, i) => (
                  <div key={i} className="flex items-center justify-between px-4 py-2.5">
                    <div className="min-w-0">
                      <p className="text-sm font-medium text-gray-900 truncate">Flat {a.flatNumber} — {a.buildingName}</p>
                      <p className="text-xs text-gray-500 truncate">
                        {MONTH_SHORT[a.periodMonth - 1]} {a.periodYear} · {a.tenantName}
                      </p>
                    </div>
                    <div className="ml-2 shrink-0 text-right">
                      <Badge variant={a.severity === 'high' ? 'destructive' : 'warning'} className="text-xs">
                        +{a.changePercent}%
                      </Badge>
                      <p className="text-xs text-gray-400 mt-0.5">{fmtKwh(a.previous)} → {fmtKwh(a.current)}</p>
                    </div>
                  </div>
                ))}
              </div>
            )}
          </CardContent>
        </Card>

        {/* Late payment risk */}
        <Card>
          <CardHeader>
            <CardTitle className="flex items-center gap-2 text-sm">
              <Clock className="h-4 w-4 text-red-500" />
              Late Payment Risk
            </CardTitle>
          </CardHeader>
          <CardContent className="p-0">
            {latePaymentRisk.length === 0 ? (
              <p className="px-4 py-6 text-center text-sm text-gray-400">No late payment history</p>
            ) : (
              <div className="divide-y divide-gray-50">
                {latePaymentRisk.slice(0, 10).map((r, i) => (
                  <div key={i} className="flex items-center justify-between px-4 py-2.5">
                    <div className="min-w-0">
                      <p className="text-sm font-medium text-gray-900 truncate">Flat {r.flatNumber} — {r.buildingName}</p>
                      <p className="text-xs text-gray-500 truncate">{r.tenantName}</p>
                    </div>
                    <div className="ml-2 shrink-0 text-right">
                      <span className={`text-sm font-bold ${r.lateRate >= 50 ? 'text-red-600' : 'text-orange-500'}`}>
                        {r.lateRate.toFixed(0)}%
                      </span>
                      <p className="text-xs text-gray-400">{r.overdueBills}/{r.totalBills} bills</p>
                    </div>
                  </div>
                ))}
              </div>
            )}
          </CardContent>
        </Card>

        {/* Top avg consuming flats */}
        <Card>
          <CardHeader>
            <CardTitle className="flex items-center gap-2 text-sm">
              <Zap className="h-4 w-4 text-yellow-500" />
              Avg Monthly Consumption
            </CardTitle>
          </CardHeader>
          <CardContent className="p-0">
            {flatProfiles.length === 0 ? (
              <p className="px-4 py-6 text-center text-sm text-gray-400">No data</p>
            ) : (
              <div className="divide-y divide-gray-50">
                {flatProfiles.slice(0, 10).map((f, i) => (
                  <div key={i} className="flex items-center justify-between px-4 py-2.5">
                    <div className="min-w-0">
                      <p className="text-sm font-medium text-gray-900 truncate">Flat {f.flatNumber} — {f.buildingName}</p>
                      <p className="text-xs text-gray-500 truncate">{f.tenantName}</p>
                    </div>
                    <div className="ml-2 shrink-0 text-right">
                      <span className="text-sm font-medium text-gray-900">{fmtKwh(f.avgMonthlyConsumption)}</span>
                      <p className="text-xs text-gray-400">{fmt(f.avgMonthlyBill, currency)}/mo avg</p>
                    </div>
                  </div>
                ))}
              </div>
            )}
          </CardContent>
        </Card>
      </div>

      {/* Full flat profiles table */}
      <Card>
        <CardHeader>
          <CardTitle className="text-sm">Flat Performance Summary</CardTitle>
        </CardHeader>
        <CardContent className="p-0">
          <div className="overflow-x-auto">
            <table className="w-full text-sm">
              <thead className="border-b border-gray-100 bg-gray-50">
                <tr>
                  {['Flat','Building','Tenant','Bills','Avg Consumption','Avg Bill','Max','Min','Total Paid'].map(h => (
                    <th key={h} className="px-4 py-2.5 text-left font-medium text-gray-500 whitespace-nowrap text-xs">{h}</th>
                  ))}
                </tr>
              </thead>
              <tbody className="divide-y divide-gray-50">
                {flatProfiles.length === 0 ? (
                  <tr><td colSpan={9} className="py-8 text-center text-gray-400">No bills yet</td></tr>
                ) : flatProfiles.map((f, i) => (
                  <tr key={i} className="hover:bg-gray-50">
                    <td className="px-4 py-2.5 font-medium text-gray-900">Flat {f.flatNumber}</td>
                    <td className="px-4 py-2.5 text-gray-600">{f.buildingName}</td>
                    <td className="px-4 py-2.5 text-gray-700">{f.tenantName}</td>
                    <td className="px-4 py-2.5 text-gray-500">{f.billCount}</td>
                    <td className="px-4 py-2.5 font-mono">{fmtKwh(f.avgMonthlyConsumption)}</td>
                    <td className="px-4 py-2.5 font-mono">{fmt(f.avgMonthlyBill, currency)}</td>
                    <td className="px-4 py-2.5 font-mono text-orange-600">{fmtKwh(f.maxConsumption)}</td>
                    <td className="px-4 py-2.5 font-mono text-green-600">{fmtKwh(f.minConsumption)}</td>
                    <td className="px-4 py-2.5 font-mono text-green-700">{fmt(f.totalPaid, currency)}</td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        </CardContent>
      </Card>
    </div>
  );
}
