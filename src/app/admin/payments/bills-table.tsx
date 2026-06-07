'use client';

import { useState } from 'react';
import { useRouter } from 'next/navigation';
import { Input } from '@/components/ui/input';
import { Button } from '@/components/ui/button';
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from '@/components/ui/select';
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from '@/components/ui/table';
import { Badge } from '@/components/ui/badge';
import { BillStatusBadge } from '@/components/shared/status-badge';
import { RecordPaymentDialog } from './record-payment-dialog';
import { CreditCard, Search, X } from 'lucide-react';
import type { AdminBillRow } from '@/services/billing/paymentService';

const MONTH_NAMES = [
  'Jan', 'Feb', 'Mar', 'Apr', 'May', 'Jun',
  'Jul', 'Aug', 'Sep', 'Oct', 'Nov', 'Dec',
];

const STATUS_OPTIONS = [
  { value: '',        label: 'All Statuses' },
  { value: 'unpaid',  label: 'Unpaid' },
  { value: 'partial', label: 'Partial' },
  { value: 'overdue', label: 'Overdue' },
  { value: 'paid',    label: 'Paid' },
  { value: 'waived',  label: 'Waived' },
];

const CURRENT_YEAR = new Date().getFullYear();
const YEARS  = Array.from({ length: 5 }, (_, i) => CURRENT_YEAR - 2 + i);

function fmt(n: number) {
  return n.toLocaleString('en', { minimumFractionDigits: 2, maximumFractionDigits: 2 });
}

interface Filters {
  buildingId:   string;
  periodYear?:  number;
  periodMonth?: number;
  status:       string;
  search:       string;
}

interface Props {
  bills:     AdminBillRow[];
  buildings: { id: string; name: string }[];
  filters:   Filters;
}

export function BillsTable({ bills, buildings, filters }: Props) {
  const router = useRouter();

  const [local, setLocal] = useState({
    building: filters.buildingId,
    year:     filters.periodYear?.toString()  ?? '',
    month:    filters.periodMonth?.toString() ?? '',
    status:   filters.status,
    search:   filters.search,
  });

  const [selectedBill, setSelectedBill] = useState<AdminBillRow | null>(null);

  function applyFilters() {
    const p = new URLSearchParams();
    if (local.building) p.set('building', local.building);
    if (local.year)     p.set('year',     local.year);
    if (local.month)    p.set('month',    local.month);
    if (local.status)   p.set('status',   local.status);
    if (local.search)   p.set('search',   local.search);
    router.push(`/admin/payments?${p.toString()}`);
  }

  function resetFilters() {
    setLocal({ building: '', year: '', month: '', status: '', search: '' });
    router.push('/admin/payments');
  }

  const isFiltered = local.building || local.year || local.month || local.status || local.search;

  // Summary
  const totalDue         = bills.reduce((s, b) => s + b.totalDue, 0);
  const totalCollected   = bills.reduce((s, b) => s + b.amountPaid, 0);
  const totalOutstanding = bills.reduce((s, b) => s + b.outstandingBalance, 0);
  const overdueCount     = bills.filter((b) => b.status === 'overdue').length;

  return (
    <div className="space-y-5">
      {/* Filter bar */}
      <div className="flex flex-wrap items-end gap-3 rounded-lg border border-gray-100 bg-white p-4">
        <div className="space-y-1 min-w-[160px]">
          <p className="text-xs text-gray-500">Building</p>
          <Select value={local.building} onValueChange={(v) => setLocal((l) => ({ ...l, building: v === '__all__' ? '' : v }))}>
            <SelectTrigger className="h-8 text-sm">
              <SelectValue placeholder="All buildings" />
            </SelectTrigger>
            <SelectContent>
              <SelectItem value="__all__">All buildings</SelectItem>
              {buildings.map((b) => (
                <SelectItem key={b.id} value={b.id}>{b.name}</SelectItem>
              ))}
            </SelectContent>
          </Select>
        </div>

        <div className="space-y-1">
          <p className="text-xs text-gray-500">Year</p>
          <Select value={local.year} onValueChange={(v) => setLocal((l) => ({ ...l, year: v === '__all__' ? '' : v }))}>
            <SelectTrigger className="w-24 h-8 text-sm">
              <SelectValue placeholder="Year" />
            </SelectTrigger>
            <SelectContent>
              <SelectItem value="__all__">All</SelectItem>
              {YEARS.map((y) => <SelectItem key={y} value={String(y)}>{y}</SelectItem>)}
            </SelectContent>
          </Select>
        </div>

        <div className="space-y-1">
          <p className="text-xs text-gray-500">Month</p>
          <Select value={local.month} onValueChange={(v) => setLocal((l) => ({ ...l, month: v === '__all__' ? '' : v }))}>
            <SelectTrigger className="w-28 h-8 text-sm">
              <SelectValue placeholder="Month" />
            </SelectTrigger>
            <SelectContent>
              <SelectItem value="__all__">All</SelectItem>
              {MONTH_NAMES.map((m, i) => (
                <SelectItem key={i + 1} value={String(i + 1)}>{m}</SelectItem>
              ))}
            </SelectContent>
          </Select>
        </div>

        <div className="space-y-1">
          <p className="text-xs text-gray-500">Status</p>
          <Select value={local.status} onValueChange={(v) => setLocal((l) => ({ ...l, status: v === '__all__' ? '' : v }))}>
            <SelectTrigger className="w-32 h-8 text-sm">
              <SelectValue placeholder="All" />
            </SelectTrigger>
            <SelectContent>
              {STATUS_OPTIONS.map((o) => (
                <SelectItem key={o.value || '__all__'} value={o.value || '__all__'}>{o.label}</SelectItem>
              ))}
            </SelectContent>
          </Select>
        </div>

        <div className="space-y-1 flex-1 min-w-[160px]">
          <p className="text-xs text-gray-500">Search tenant / flat</p>
          <div className="relative">
            <Search className="absolute left-2 top-1/2 -translate-y-1/2 h-3.5 w-3.5 text-gray-400" />
            <Input
              className="h-8 text-sm pl-7"
              placeholder="Name or flat number…"
              value={local.search}
              onChange={(e) => setLocal((l) => ({ ...l, search: e.target.value }))}
              onKeyDown={(e) => e.key === 'Enter' && applyFilters()}
            />
          </div>
        </div>

        <div className="flex gap-2">
          <Button size="sm" onClick={applyFilters}>Apply</Button>
          {isFiltered && (
            <Button size="sm" variant="ghost" onClick={resetFilters}>
              <X className="h-3.5 w-3.5" />Reset
            </Button>
          )}
        </div>
      </div>

      {/* Summary cards */}
      <div className="grid grid-cols-2 gap-3 sm:grid-cols-4">
        <SummaryCard label="Total Bills"      value={String(bills.length)} />
        <SummaryCard label="Total Due"        value={fmt(totalDue)} />
        <SummaryCard label="Collected"        value={fmt(totalCollected)} green />
        <SummaryCard label="Outstanding"      value={fmt(totalOutstanding)} highlight={totalOutstanding > 0} />
      </div>

      {overdueCount > 0 && (
        <div className="flex items-center gap-2 rounded-lg border border-red-200 bg-red-50 px-4 py-2.5 text-sm text-red-700">
          <Badge variant="destructive">{overdueCount}</Badge>
          overdue bill{overdueCount !== 1 ? 's' : ''} — tenants should be contacted
        </div>
      )}

      {/* Table */}
      {bills.length === 0 ? (
        <div className="rounded-lg border border-dashed border-gray-200 py-16 text-center">
          <CreditCard className="h-10 w-10 text-gray-300 mx-auto mb-3" />
          <p className="text-sm font-medium text-gray-600">No bills found</p>
          <p className="text-xs text-gray-400 mt-1">Try adjusting the filters above.</p>
        </div>
      ) : (
        <div className="overflow-x-auto rounded-lg border border-gray-200">
          <Table>
            <TableHeader>
              <TableRow>
                <TableHead>Tenant</TableHead>
                <TableHead>Flat</TableHead>
                <TableHead>Building</TableHead>
                <TableHead>Period</TableHead>
                <TableHead className="text-right">Total Due</TableHead>
                <TableHead className="text-right">Paid</TableHead>
                <TableHead className="text-right font-semibold">Outstanding</TableHead>
                <TableHead>Due Date</TableHead>
                <TableHead>Status</TableHead>
                <TableHead className="w-32" />
              </TableRow>
            </TableHeader>
            <TableBody>
              {bills.map((bill) => {
                const isOverdue = bill.status === 'overdue';
                const rowCls    = isOverdue ? 'bg-red-50 hover:bg-red-100' : 'hover:bg-gray-50';
                const period    = `${MONTH_NAMES[bill.periodMonth - 1]} ${bill.periodYear}`;
                const canPay    = bill.status === 'unpaid' || bill.status === 'partial' || bill.status === 'overdue';

                return (
                  <TableRow key={bill.id} className={rowCls}>
                    <TableCell className="font-medium">{bill.tenantName}</TableCell>
                    <TableCell>Flat {bill.flatNumber}</TableCell>
                    <TableCell className="text-sm text-gray-600">{bill.buildingName}</TableCell>
                    <TableCell className="text-sm">{period}</TableCell>
                    <TableCell className="text-right font-mono">{fmt(bill.totalDue)}</TableCell>
                    <TableCell className="text-right font-mono text-green-700">{fmt(bill.amountPaid)}</TableCell>
                    <TableCell className={`text-right font-mono font-semibold ${bill.outstandingBalance > 0 ? 'text-red-600' : 'text-green-600'}`}>
                      {fmt(bill.outstandingBalance)}
                    </TableCell>
                    <TableCell className="text-sm text-gray-500">
                      {new Date(bill.dueDate).toLocaleDateString('en-GB', { day: '2-digit', month: 'short', year: 'numeric' })}
                    </TableCell>
                    <TableCell><BillStatusBadge status={bill.status as any} /></TableCell>
                    <TableCell>
                      {canPay && (
                        <Button
                          size="sm"
                          variant="outline"
                          className="h-7 text-xs"
                          onClick={() => setSelectedBill(bill)}
                        >
                          <CreditCard className="h-3.5 w-3.5" />Record
                        </Button>
                      )}
                    </TableCell>
                  </TableRow>
                );
              })}

              {/* Totals row */}
              <TableRow className="bg-gray-50 font-semibold border-t-2">
                <TableCell colSpan={4} className="text-sm text-gray-600">
                  Totals ({bills.length} bills)
                </TableCell>
                <TableCell className="text-right font-mono">{fmt(totalDue)}</TableCell>
                <TableCell className="text-right font-mono text-green-700">{fmt(totalCollected)}</TableCell>
                <TableCell className={`text-right font-mono font-bold ${totalOutstanding > 0 ? 'text-red-600' : 'text-green-600'}`}>
                  {fmt(totalOutstanding)}
                </TableCell>
                <TableCell colSpan={3} />
              </TableRow>
            </TableBody>
          </Table>
        </div>
      )}

      {selectedBill && (
        <RecordPaymentDialog
          bill={selectedBill}
          open={true}
          onClose={() => setSelectedBill(null)}
        />
      )}
    </div>
  );
}

function SummaryCard({
  label, value, highlight, green,
}: {
  label: string; value: string; highlight?: boolean; green?: boolean;
}) {
  return (
    <div className="rounded-lg border border-gray-100 bg-white p-4 space-y-1">
      <p className="text-xs text-gray-500">{label}</p>
      <p className={`text-lg font-bold tabular-nums ${highlight ? 'text-red-600' : green ? 'text-green-600' : 'text-gray-900'}`}>
        {value}
      </p>
    </div>
  );
}
