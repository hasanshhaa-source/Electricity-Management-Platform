import { requireTenant } from '@/services/auth/authService';
import { getTenancyByUser } from '@/services/tenant/tenancyService';
import { createClient } from '@/lib/supabase/server';
import { getTenantBillsWithPayments } from '@/services/billing/paymentService';
import { PageHeader } from '@/components/shared/page-header';
import { EmptyState } from '@/components/shared/empty-state';
import { Alert, AlertDescription, AlertTitle } from '@/components/ui/alert';
import { BillStatusBadge } from '@/components/shared/status-badge';
import { FileText, AlertTriangle, CheckCircle2, TrendingUp, TrendingDown } from 'lucide-react';
import { BillCard } from './bill-card';

const MONTH_NAMES = [
  'January', 'February', 'March', 'April', 'May', 'June',
  'July', 'August', 'September', 'October', 'November', 'December',
];

function fmt(n: number, d = 2) {
  return n.toLocaleString('en', { minimumFractionDigits: d, maximumFractionDigits: d });
}

async function getBuildingCurrency(buildingId: string): Promise<string> {
  const supabase = await createClient();
  const { data } = await supabase.from('buildings').select('currency').eq('id', buildingId).single();
  return data?.currency ?? 'SAR';
}

export default async function MyBillsPage() {
  const user = await requireTenant();
  const { data: tenancy } = await getTenancyByUser(user.id);

  if (!tenancy || tenancy.status !== 'active') {
    return (
      <div className="space-y-6">
        <PageHeader title="Bill History" description="Your electricity bills" />
        <Alert variant="warning">
          <AlertTriangle className="h-4 w-4" />
          <AlertTitle>No active tenancy</AlertTitle>
          <AlertDescription>You need an approved flat assignment to view bills.</AlertDescription>
        </Alert>
      </div>
    );
  }

  const [bills, currency] = await Promise.all([
    getTenantBillsWithPayments(tenancy.flat_id),
    getBuildingCurrency((tenancy.flat as any)?.building_id ?? (tenancy.flat as any)?.building?.id ?? ''),
  ]);

  const outstandingBills = bills.filter((b) => ['unpaid', 'partial', 'overdue'].includes(b.status));
  const settledBills     = bills.filter((b) => ['paid', 'waived'].includes(b.status));

  const totalOutstanding = outstandingBills.reduce((s, b) => s + b.outstandingBalance, 0);
  const hasOverdue       = outstandingBills.some((b) => b.status === 'overdue');

  // Trend: last 6 bills (most recent first from service)
  const trendBills = bills.slice(0, 6);

  return (
    <div className="space-y-6">
      <PageHeader
        title="Bill History"
        description={`Electricity bills for Flat ${tenancy.flat?.flat_number}`}
      />

      {bills.length === 0 ? (
        <EmptyState
          icon={<FileText className="h-8 w-8" />}
          title="No bills yet"
          description="Bills will appear here once your admin generates them for the billing period"
        />
      ) : (
        <>
          {/* Outstanding summary */}
          {totalOutstanding > 0 && (
            <div className={`rounded-lg border p-4 ${hasOverdue ? 'border-red-200 bg-red-50' : 'border-amber-100 bg-amber-50'}`}>
              <div className="flex items-start gap-3">
                <AlertTriangle className={`h-5 w-5 mt-0.5 flex-shrink-0 ${hasOverdue ? 'text-red-500' : 'text-amber-500'}`} />
                <div>
                  <p className={`font-semibold ${hasOverdue ? 'text-red-700' : 'text-amber-700'}`}>
                    Outstanding Balance: {currency} {fmt(totalOutstanding)}
                  </p>
                  <p className={`text-sm mt-0.5 ${hasOverdue ? 'text-red-600' : 'text-amber-600'}`}>
                    {hasOverdue
                      ? 'You have overdue bills. Please contact your building admin to arrange payment.'
                      : 'Please arrange payment before the due date to avoid overdue charges.'}
                  </p>
                </div>
              </div>
            </div>
          )}

          {totalOutstanding === 0 && bills.length > 0 && (
            <div className="flex items-center gap-2 rounded-lg border border-green-200 bg-green-50 px-4 py-3 text-sm text-green-700">
              <CheckCircle2 className="h-4 w-4 flex-shrink-0" />
              All bills are paid. Great work keeping your account up to date!
            </div>
          )}

          {/* Trend table */}
          {trendBills.length >= 2 && (
            <section>
              <h2 className="text-sm font-semibold text-gray-700 uppercase tracking-wide mb-3">
                Consumption &amp; Amount Trend
              </h2>
              <div className="overflow-x-auto rounded-lg border border-gray-200 bg-white">
                <table className="w-full text-sm">
                  <thead className="bg-gray-50 text-xs text-gray-500">
                    <tr>
                      <th className="text-left px-4 py-2.5 font-medium">Period</th>
                      <th className="text-right px-4 py-2.5 font-medium">Consumption (kWh)</th>
                      <th className="text-right px-4 py-2.5 font-medium">vs Prior</th>
                      <th className="text-right px-4 py-2.5 font-medium">Total Due ({currency})</th>
                      <th className="text-right px-4 py-2.5 font-medium">vs Prior</th>
                      <th className="px-4 py-2.5 font-medium">Status</th>
                    </tr>
                  </thead>
                  <tbody className="divide-y divide-gray-50">
                    {trendBills.map((bill, idx) => {
                      const prev = trendBills[idx + 1];
                      const kwdDiff   = prev ? bill.billedUnits - prev.billedUnits : null;
                      const amtDiff   = prev ? bill.totalDue    - prev.totalDue    : null;
                      const kwdPct    = prev && prev.billedUnits > 0 ? (kwdDiff! / prev.billedUnits) * 100 : null;
                      const amtPct    = prev && prev.totalDue    > 0 ? (amtDiff!  / prev.totalDue)  * 100 : null;

                      return (
                        <tr key={bill.id} className="hover:bg-gray-50">
                          <td className="px-4 py-2.5 font-medium text-gray-900">
                            {MONTH_NAMES[bill.periodMonth - 1]} {bill.periodYear}
                          </td>
                          <td className="px-4 py-2.5 text-right font-mono">
                            {fmt(bill.billedUnits, 1)}
                          </td>
                          <td className="px-4 py-2.5 text-right">
                            {kwdPct !== null ? (
                              <span className={`inline-flex items-center gap-0.5 text-xs font-medium ${kwdPct > 0 ? 'text-red-500' : kwdPct < 0 ? 'text-green-600' : 'text-gray-400'}`}>
                                {kwdPct > 0 ? <TrendingUp className="h-3 w-3" /> : kwdPct < 0 ? <TrendingDown className="h-3 w-3" /> : null}
                                {kwdPct !== 0 ? `${kwdPct > 0 ? '+' : ''}${kwdPct.toFixed(1)}%` : '—'}
                              </span>
                            ) : <span className="text-xs text-gray-300">—</span>}
                          </td>
                          <td className="px-4 py-2.5 text-right font-mono">
                            {fmt(bill.totalDue)}
                          </td>
                          <td className="px-4 py-2.5 text-right">
                            {amtPct !== null ? (
                              <span className={`inline-flex items-center gap-0.5 text-xs font-medium ${amtPct > 0 ? 'text-red-500' : amtPct < 0 ? 'text-green-600' : 'text-gray-400'}`}>
                                {amtPct > 0 ? <TrendingUp className="h-3 w-3" /> : amtPct < 0 ? <TrendingDown className="h-3 w-3" /> : null}
                                {amtPct !== 0 ? `${amtPct > 0 ? '+' : ''}${amtPct.toFixed(1)}%` : '—'}
                              </span>
                            ) : <span className="text-xs text-gray-300">—</span>}
                          </td>
                          <td className="px-4 py-2.5">
                            <BillStatusBadge status={bill.status as any} />
                          </td>
                        </tr>
                      );
                    })}
                  </tbody>
                </table>
              </div>
            </section>
          )}

          {/* Outstanding bills */}
          {outstandingBills.length > 0 && (
            <section className="space-y-3">
              <h2 className="text-sm font-semibold text-gray-700 uppercase tracking-wide">
                Outstanding Bills ({outstandingBills.length})
              </h2>
              {outstandingBills.map((bill) => (
                <BillCard key={bill.id} bill={bill} currency={currency} />
              ))}
            </section>
          )}

          {/* Settled bills */}
          {settledBills.length > 0 && (
            <section className="space-y-3">
              <h2 className="text-sm font-semibold text-gray-500 uppercase tracking-wide">
                Payment History ({settledBills.length})
              </h2>
              {settledBills.map((bill) => (
                <BillCard key={bill.id} bill={bill} currency={currency} />
              ))}
            </section>
          )}
        </>
      )}
    </div>
  );
}
