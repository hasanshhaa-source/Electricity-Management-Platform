'use client';

import { useState } from 'react';
import { ChevronDown, ChevronRight, Receipt, CheckCircle2, Clock } from 'lucide-react';
import { BillStatusBadge } from '@/components/shared/status-badge';
import type { TenantBillWithPayments } from '@/services/billing/paymentService';

const MONTH_NAMES = [
  'January', 'February', 'March', 'April', 'May', 'June',
  'July', 'August', 'September', 'October', 'November', 'December',
];

const METHOD_LABELS: Record<string, string> = {
  cash:          'Cash',
  bank_transfer: 'Bank Transfer',
  stc_pay:       'STC Pay',
  online:        'Online',
  other:         'Other',
};

function fmt(n: number, d = 2) {
  return n.toLocaleString('en', { minimumFractionDigits: d, maximumFractionDigits: d });
}

export function BillCard({ bill, currency }: { bill: TenantBillWithPayments; currency: string }) {
  const [expanded, setExpanded] = useState(false);

  const period = `${MONTH_NAMES[bill.periodMonth - 1]} ${bill.periodYear}`;
  const isOverdue = bill.status === 'overdue';
  const isPaid    = bill.status === 'paid' || bill.status === 'waived';

  return (
    <div className={`rounded-lg border ${isOverdue ? 'border-red-200 bg-red-50' : 'border-gray-200 bg-white'}`}>
      {/* Header row */}
      <button
        type="button"
        className="w-full text-left px-5 py-4 flex items-center gap-3"
        onClick={() => setExpanded(!expanded)}
      >
        {expanded
          ? <ChevronDown className="h-4 w-4 text-gray-400 flex-shrink-0" />
          : <ChevronRight className="h-4 w-4 text-gray-400 flex-shrink-0" />}

        <div className="flex-1 flex flex-wrap items-center gap-x-6 gap-y-1">
          <span className="font-semibold text-gray-900 min-w-[120px]">{period}</span>
          <BillStatusBadge status={bill.status as any} />

          <div className="flex gap-4 ml-auto text-sm">
            <div className="text-right">
              <p className="text-xs text-gray-500">Total Due</p>
              <p className="font-semibold">{currency} {fmt(bill.totalDue)}</p>
            </div>
            {bill.amountPaid > 0 && (
              <div className="text-right">
                <p className="text-xs text-gray-500">Paid</p>
                <p className="font-semibold text-green-600">{currency} {fmt(bill.amountPaid)}</p>
              </div>
            )}
            {bill.outstandingBalance > 0 && (
              <div className="text-right">
                <p className="text-xs text-gray-500">Outstanding</p>
                <p className={`font-bold ${isOverdue ? 'text-red-600' : 'text-amber-600'}`}>
                  {currency} {fmt(bill.outstandingBalance)}
                </p>
              </div>
            )}
            <div className="text-right">
              <p className="text-xs text-gray-500">Due Date</p>
              <p className={`text-sm ${isOverdue ? 'text-red-600 font-semibold' : 'text-gray-700'}`}>
                {new Date(bill.dueDate).toLocaleDateString('en-GB', { day: '2-digit', month: 'short', year: 'numeric' })}
              </p>
            </div>
          </div>
        </div>
      </button>

      {/* Expanded detail */}
      {expanded && (
        <div className="border-t border-gray-100 px-5 py-4 space-y-5">
          {/* Bill breakdown */}
          <div>
            <p className="text-xs font-semibold text-gray-500 uppercase tracking-wide mb-2">Bill Breakdown</p>
            <div className="rounded-lg border border-gray-100 overflow-hidden">
              <table className="w-full text-sm">
                <tbody className="divide-y divide-gray-50">
                  <BillBreakRow
                    label={`Electricity Consumption (${fmt(bill.billedUnits, 3)} kWh × ${currency} ${fmt(bill.ratePerUnit, 4)})`}
                    value={fmt(bill.currentCharges)}
                    currency={currency}
                  />
                  {bill.differenceAdjustment !== 0 && (
                    <BillBreakRow
                      label="Building Difference Adjustment"
                      value={`${bill.differenceAdjustment > 0 ? '+' : ''}${fmt(bill.differenceAdjustment)}`}
                      currency={currency}
                      muted={bill.differenceAdjustment < 0}
                    />
                  )}
                  {bill.previousBalance > 0 && (
                    <BillBreakRow
                      label="Previous Unpaid Balance"
                      value={`+${fmt(bill.previousBalance)}`}
                      currency={currency}
                      warn
                    />
                  )}
                  <BillBreakRow
                    label="Total Due"
                    value={fmt(bill.totalDue)}
                    currency={currency}
                    bold
                  />
                  {bill.amountPaid > 0 && (
                    <BillBreakRow
                      label="Amount Paid"
                      value={`−${fmt(bill.amountPaid)}`}
                      currency={currency}
                      green
                    />
                  )}
                  {bill.outstandingBalance > 0 && (
                    <BillBreakRow
                      label="Outstanding Balance"
                      value={fmt(bill.outstandingBalance)}
                      currency={currency}
                      bold
                      warn
                    />
                  )}
                </tbody>
              </table>
            </div>
          </div>

          {/* Payment history */}
          <div>
            <p className="text-xs font-semibold text-gray-500 uppercase tracking-wide mb-2">
              Payment History
            </p>
            {bill.payments.length === 0 ? (
              <p className="text-sm text-gray-400 italic">No payments recorded yet.</p>
            ) : (
              <div className="rounded-lg border border-gray-100 overflow-hidden">
                <table className="w-full text-sm">
                  <thead className="bg-gray-50 text-xs text-gray-500">
                    <tr>
                      <th className="text-left px-4 py-2 font-medium">Date</th>
                      <th className="text-left px-4 py-2 font-medium">Method</th>
                      <th className="text-left px-4 py-2 font-medium">Reference</th>
                      <th className="text-right px-4 py-2 font-medium">Amount</th>
                    </tr>
                  </thead>
                  <tbody className="divide-y divide-gray-50">
                    {bill.payments.map((p) => (
                      <tr key={p.id} className="hover:bg-gray-50">
                        <td className="px-4 py-2 text-gray-700">
                          {new Date(p.paidAt).toLocaleDateString('en-GB', { day: '2-digit', month: 'short', year: 'numeric' })}
                        </td>
                        <td className="px-4 py-2">
                          <span className="inline-flex items-center gap-1">
                            <CheckCircle2 className="h-3.5 w-3.5 text-green-500" />
                            {METHOD_LABELS[p.paymentMethod] ?? p.paymentMethod}
                          </span>
                        </td>
                        <td className="px-4 py-2 text-gray-500 font-mono text-xs">
                          {p.referenceNo ?? '—'}
                        </td>
                        <td className="px-4 py-2 text-right font-semibold text-green-600 font-mono">
                          {currency} {fmt(p.amount)}
                        </td>
                      </tr>
                    ))}
                  </tbody>
                </table>
              </div>
            )}
          </div>

          {isPaid && (
            <div className="flex items-center gap-1.5 text-sm text-green-600">
              <CheckCircle2 className="h-4 w-4" />
              {bill.status === 'waived' ? 'Bill waived by admin' : `Paid in full`}
              {bill.paidAt && ` on ${new Date(bill.paidAt).toLocaleDateString('en-GB', { day: '2-digit', month: 'short', year: 'numeric' })}`}
            </div>
          )}
        </div>
      )}
    </div>
  );
}

function BillBreakRow({
  label, value, currency, bold, green, warn, muted,
}: {
  label: string; value: string; currency: string;
  bold?: boolean; green?: boolean; warn?: boolean; muted?: boolean;
}) {
  return (
    <tr className={bold ? 'bg-gray-50 font-semibold border-t' : ''}>
      <td className={`px-4 py-2.5 ${muted ? 'text-green-700' : warn ? 'text-amber-700' : 'text-gray-700'}`}>
        {label}
      </td>
      <td className={`px-4 py-2.5 text-right font-mono ${green ? 'text-green-600' : warn ? 'text-amber-600' : bold ? 'text-gray-900' : 'text-gray-700'}`}>
        {bold ? `${currency} ` : ''}{value}
      </td>
    </tr>
  );
}
