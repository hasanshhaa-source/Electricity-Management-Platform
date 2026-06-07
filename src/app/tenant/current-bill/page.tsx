import { requireTenant } from '@/services/auth/authService';
import { getTenancyByUser } from '@/services/tenant/tenancyService';
import { getTenantBillsWithPayments } from '@/services/billing/paymentService';
import { createClient } from '@/lib/supabase/server';
import { PageHeader } from '@/components/shared/page-header';
import { BillStatusBadge } from '@/components/shared/status-badge';
import { EmptyState } from '@/components/shared/empty-state';
import { Alert, AlertDescription, AlertTitle } from '@/components/ui/alert';
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card';
import { FileText, AlertTriangle, Zap, CheckCircle2 } from 'lucide-react';

const MONTH_NAMES = [
  'January', 'February', 'March', 'April', 'May', 'June',
  'July', 'August', 'September', 'October', 'November', 'December',
];

const METHOD_LABELS: Record<string, string> = {
  cash: 'Cash', bank_transfer: 'Bank Transfer',
  stc_pay: 'STC Pay', online: 'Online', other: 'Other',
};

function fmt(n: number, d = 2) {
  return n.toLocaleString('en', { minimumFractionDigits: d, maximumFractionDigits: d });
}

async function getCurrency(buildingId: string) {
  const supabase = await createClient();
  const { data } = await supabase.from('buildings').select('currency').eq('id', buildingId).single();
  return data?.currency ?? 'SAR';
}

export default async function CurrentBillPage() {
  const user = await requireTenant();
  const { data: tenancy } = await getTenancyByUser(user.id);

  if (!tenancy || tenancy.status !== 'active') {
    return (
      <div className="space-y-6">
        <PageHeader title="Current Bill" description="Your latest electricity bill" />
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
    getCurrency((tenancy.flat as any)?.building_id ?? (tenancy.flat as any)?.building?.id ?? ''),
  ]);

  // Current bill = most recent unpaid/partial/overdue; fall back to most recent overall
  const bill = bills.find((b) => ['unpaid', 'partial', 'overdue'].includes(b.status)) ?? bills[0] ?? null;

  const flatNumber    = tenancy.flat?.flat_number ?? '—';
  const buildingName  = (tenancy.flat as any)?.building?.name ?? '—';

  return (
    <div className="space-y-6">
      <PageHeader
        title="Current Bill"
        description={`Flat ${flatNumber} — ${buildingName}`}
        action={bill ? <BillStatusBadge status={bill.status as any} /> : undefined}
      />

      {!bill ? (
        <EmptyState
          icon={<FileText className="h-8 w-8" />}
          title="No bills yet"
          description="Bills appear here once your admin generates them for your billing period."
        />
      ) : (
        <div className="space-y-5 max-w-2xl">
          {/* Bill header */}
          <Card>
            <CardHeader>
              <CardTitle>
                {MONTH_NAMES[bill.periodMonth - 1]} {bill.periodYear} — Electricity Bill
              </CardTitle>
            </CardHeader>
            <CardContent className="space-y-4">
              {/* Key figures */}
              <div className="grid grid-cols-3 gap-4">
                <div className="rounded-lg bg-gray-50 p-3 text-center">
                  <p className="text-xs text-gray-500">Total Due</p>
                  <p className="text-xl font-bold text-gray-900 mt-1">{currency} {fmt(bill.totalDue)}</p>
                </div>
                <div className="rounded-lg bg-green-50 p-3 text-center">
                  <p className="text-xs text-gray-500">Paid</p>
                  <p className="text-xl font-bold text-green-700 mt-1">{currency} {fmt(bill.amountPaid)}</p>
                </div>
                <div className={`rounded-lg p-3 text-center ${bill.outstandingBalance > 0 ? 'bg-red-50' : 'bg-green-50'}`}>
                  <p className="text-xs text-gray-500">Outstanding</p>
                  <p className={`text-xl font-bold mt-1 ${bill.outstandingBalance > 0 ? 'text-red-600' : 'text-green-600'}`}>
                    {currency} {fmt(bill.outstandingBalance)}
                  </p>
                </div>
              </div>

              <div className="flex justify-between text-sm border-t pt-3">
                <span className="text-gray-500">Due Date</span>
                <span className={`font-medium ${bill.status === 'overdue' ? 'text-red-600' : 'text-gray-900'}`}>
                  {new Date(bill.dueDate).toLocaleDateString('en-GB', { day: '2-digit', month: 'long', year: 'numeric' })}
                </span>
              </div>
            </CardContent>
          </Card>

          {/* Meter & consumption */}
          <Card>
            <CardHeader>
              <CardTitle className="text-base flex items-center gap-2">
                <Zap className="h-4 w-4 text-amber-500" /> Meter Readings &amp; Consumption
              </CardTitle>
            </CardHeader>
            <CardContent>
              <div className="space-y-3">
                <Row label="Flat Number" value={`Flat ${flatNumber}`} />
                <Row label="Billing Month" value={`${MONTH_NAMES[bill.periodMonth - 1]} ${bill.periodYear}`} />

                {bill.openingReading != null && (
                  <Row label="Opening Reading" value={`${fmt(bill.openingReading, 3)} kWh`} />
                )}
                {bill.closingReading != null && (
                  <Row label="Closing Reading" value={`${fmt(bill.closingReading, 3)} kWh`} />
                )}

                <Row label="Meter Consumption" value={`${fmt(bill.unitsConsumed, 3)} kWh`} />

                {bill.sharePercent < 100 && (
                  <Row label="Your Share" value={`${fmt(bill.sharePercent, 1)}%`} note="Shared meter" />
                )}

                <Row
                  label="Billed Units"
                  value={`${fmt(bill.billedUnits, 3)} kWh`}
                  bold
                />
              </div>
            </CardContent>
          </Card>

          {/* Bill calculation breakdown */}
          <Card>
            <CardHeader>
              <CardTitle className="text-base">Bill Calculation</CardTitle>
            </CardHeader>
            <CardContent>
              <div className="space-y-3">
                <Row
                  label="Rate per kWh"
                  value={`${currency} ${fmt(bill.ratePerUnit, 4)}`}
                />
                <Row
                  label={`Base Bill (${fmt(bill.billedUnits, 3)} kWh × ${currency} ${fmt(bill.ratePerUnit, 4)})`}
                  value={`${currency} ${fmt(bill.currentCharges)}`}
                />
                {bill.differenceAdjustment !== 0 && (
                  <Row
                    label="Building Cost Adjustment"
                    value={`${bill.differenceAdjustment > 0 ? '+' : ''}${currency} ${fmt(bill.differenceAdjustment)}`}
                    note="Difference between company bill and sum of flat bills"
                    warn={bill.differenceAdjustment > 0}
                  />
                )}
                {bill.previousBalance > 0 && (
                  <Row
                    label="Previous Unpaid Balance"
                    value={`+${currency} ${fmt(bill.previousBalance)}`}
                    note="Carried over from last period"
                    warn
                  />
                )}
                <Row
                  label="Total Amount Due"
                  value={`${currency} ${fmt(bill.totalDue)}`}
                  bold
                  separator
                />
                {bill.amountPaid > 0 && (
                  <Row
                    label="Amount Paid"
                    value={`−${currency} ${fmt(bill.amountPaid)}`}
                    green
                  />
                )}
                {bill.outstandingBalance > 0 && (
                  <Row
                    label="Outstanding Balance"
                    value={`${currency} ${fmt(bill.outstandingBalance)}`}
                    bold
                    warn
                  />
                )}
              </div>
            </CardContent>
          </Card>

          {/* Payment history */}
          <Card>
            <CardHeader>
              <CardTitle className="text-base">Payment History</CardTitle>
            </CardHeader>
            <CardContent>
              {bill.payments.length === 0 ? (
                <p className="text-sm text-gray-400 italic">No payments recorded for this bill.</p>
              ) : (
                <div className="rounded-lg border border-gray-100 overflow-hidden">
                  <table className="w-full text-sm">
                    <thead className="bg-gray-50 text-xs text-gray-500">
                      <tr>
                        <th className="text-left px-4 py-2.5 font-medium">Date</th>
                        <th className="text-left px-4 py-2.5 font-medium">Method</th>
                        <th className="text-left px-4 py-2.5 font-medium">Reference</th>
                        <th className="text-right px-4 py-2.5 font-medium">Amount</th>
                      </tr>
                    </thead>
                    <tbody className="divide-y divide-gray-50">
                      {bill.payments.map((p) => (
                        <tr key={p.id} className="hover:bg-gray-50">
                          <td className="px-4 py-2.5 text-gray-700">
                            {new Date(p.paidAt).toLocaleDateString('en-GB', { day: '2-digit', month: 'short', year: 'numeric' })}
                          </td>
                          <td className="px-4 py-2.5">
                            <span className="inline-flex items-center gap-1">
                              <CheckCircle2 className="h-3.5 w-3.5 text-green-500" />
                              {METHOD_LABELS[p.paymentMethod] ?? p.paymentMethod}
                            </span>
                          </td>
                          <td className="px-4 py-2.5 text-gray-500 font-mono text-xs">
                            {p.referenceNo ?? '—'}
                          </td>
                          <td className="px-4 py-2.5 text-right font-semibold text-green-600 font-mono">
                            {currency} {fmt(p.amount)}
                          </td>
                        </tr>
                      ))}
                    </tbody>
                  </table>
                </div>
              )}
            </CardContent>
          </Card>

          {/* Paid notice */}
          {(bill.status === 'paid' || bill.status === 'waived') && (
            <div className="flex items-center gap-2 rounded-lg border border-green-200 bg-green-50 px-4 py-3 text-sm text-green-700">
              <CheckCircle2 className="h-4 w-4 flex-shrink-0" />
              {bill.status === 'waived'
                ? 'This bill has been waived by your admin.'
                : `Bill fully paid on ${bill.paidAt ? new Date(bill.paidAt).toLocaleDateString('en-GB', { day: '2-digit', month: 'long', year: 'numeric' }) : '—'}.`}
            </div>
          )}
        </div>
      )}
    </div>
  );
}

function Row({
  label, value, note, bold, separator, green, warn,
}: {
  label: string; value: string; note?: string;
  bold?: boolean; separator?: boolean; green?: boolean; warn?: boolean;
}) {
  return (
    <div className={`flex justify-between items-start text-sm ${separator ? 'border-t border-gray-100 pt-3 mt-1' : ''}`}>
      <div>
        <span className={`${bold ? 'font-semibold text-gray-900' : 'text-gray-600'}`}>{label}</span>
        {note && <p className="text-xs text-gray-400">{note}</p>}
      </div>
      <span className={`font-mono ${bold ? 'font-bold text-gray-900' : green ? 'text-green-600' : warn ? 'text-amber-600' : 'text-gray-700'}`}>
        {value}
      </span>
    </div>
  );
}
