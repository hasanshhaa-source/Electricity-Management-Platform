'use client';

import { useState } from 'react';
import { useRouter } from 'next/navigation';
import { useForm } from 'react-hook-form';
import { zodResolver } from '@hookform/resolvers/zod';
import { companyBillSchema, type CompanyBillInput, type CompanyBillInputRaw } from '@/lib/validation/billing';
import { calcBillSummary } from '@/lib/utils/billing';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { FormField } from '@/components/ui/form-field';
import { Textarea } from '@/components/ui/textarea';
import { Badge } from '@/components/ui/badge';
import { Alert, AlertDescription } from '@/components/ui/alert';
import { Dialog, DialogContent, DialogHeader, DialogTitle } from '@/components/ui/dialog';
import { ConfirmDialog } from '@/components/ui/confirm-dialog';
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from '@/components/ui/table';
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from '@/components/ui/select';
import { Plus, Pencil, Trash2, Receipt, Zap, TrendingUp, Hash, Paperclip, Link2 } from 'lucide-react';
import type { ElectricityCompanyBill, CycleStatus } from '@/types';
import type { BillLink } from '@/services/billing/companyBillService';

interface MeterOption { id: string; meter_number: string }
interface FlatOption { id: string; flat_number: string }

interface CompanyBillsSectionProps {
  cycleId:      string;
  buildingId:   string;
  periodYear:   number;
  periodMonth:  number;
  currency:     string;
  cycleStatus:  CycleStatus;
  initialBills: ElectricityCompanyBill[];
  meters:       MeterOption[];
  flats:        FlatOption[];
  initialLinks: BillLink[];
}

const MONTH_NAMES = [
  'January','February','March','April','May','June',
  'July','August','September','October','November','December',
];

function fmt(n: number, decimals = 2) {
  return n.toLocaleString('en', { minimumFractionDigits: decimals, maximumFractionDigits: decimals });
}

export function CompanyBillsSection({
  cycleId, buildingId, periodYear, periodMonth,
  currency, cycleStatus, initialBills, meters, flats, initialLinks,
}: CompanyBillsSectionProps) {
  const router = useRouter();
  const [bills, setBills]           = useState<ElectricityCompanyBill[]>(initialBills);
  const [links, setLinks]           = useState<BillLink[]>(initialLinks);
  const [dialogOpen, setDialogOpen] = useState(false);
  const [editBill, setEditBill]     = useState<ElectricityCompanyBill | null>(null);
  const [deleteTarget, setDeleteTarget] = useState<ElectricityCompanyBill | null>(null);
  const [deleting, setDeleting]     = useState(false);
  const [serverError, setServerError] = useState('');
  const [saving, setSaving]         = useState(false);

  const [linkTarget, setLinkTarget]   = useState<ElectricityCompanyBill | null>(null);
  const [linkFlatId, setLinkFlatId]   = useState<string | null>(null);
  const [linkMeterIds, setLinkMeterIds] = useState<string[]>([]);
  const [linkSaving, setLinkSaving]   = useState(false);
  const [linkError, setLinkError]     = useState('');

  const linkByBillId = new Map(links.map((l) => [l.billId, l]));

  function openLink(bill: ElectricityCompanyBill) {
    const existing = linkByBillId.get(bill.id);
    setLinkTarget(bill);
    setLinkFlatId(existing?.flatId ?? null);
    setLinkMeterIds(existing?.meterIds ?? []);
    setLinkError('');
  }

  async function saveLink() {
    if (!linkTarget) return;
    setLinkSaving(true);
    setLinkError('');

    const body = linkFlatId
      ? { flat_id: linkFlatId, meter_ids: [] }
      : { flat_id: null, meter_ids: linkMeterIds };

    const res  = await fetch(`/api/billing/company-bills/${linkTarget.id}/links`, {
      method: 'PUT',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify(body),
    });
    const json = await res.json();

    if (!res.ok || json.error) {
      setLinkError(json.error ?? 'Failed to save link');
      setLinkSaving(false);
      return;
    }

    setLinks((prev) => [
      ...prev.filter((l) => l.billId !== linkTarget.id),
      { billId: linkTarget.id, flatId: linkFlatId, meterIds: linkFlatId ? [] : linkMeterIds },
    ]);
    setLinkTarget(null);
    setLinkSaving(false);
    router.refresh();
  }

  function toggleMeter(meterId: string) {
    setLinkMeterIds((prev) => prev.includes(meterId) ? prev.filter((m) => m !== meterId) : [...prev, meterId]);
  }

  const isLocked = !['draft', 'readings_collected', 'bills_imported'].includes(cycleStatus);

  const today = new Date().toISOString().split('T')[0];

  const {
    register,
    handleSubmit,
    setValue,
    reset,
    formState: { errors },
  } = useForm<CompanyBillInputRaw, unknown, CompanyBillInput>({
    resolver: zodResolver(companyBillSchema),
  });

  function openAdd() {
    setEditBill(null);
    reset({
      building_id:  buildingId,
      cycle_id:     cycleId,
      period_year:  String(periodYear),
      period_month: String(periodMonth),
      bill_issue_date: today,
      due_date:     today,
    });
    setServerError('');
    setDialogOpen(true);
  }

  function openEdit(bill: ElectricityCompanyBill) {
    setEditBill(bill);
    reset({
      building_id:                buildingId,
      cycle_id:                   cycleId,
      period_year:                String(bill.period_year),
      period_month:               String(bill.period_month),
      bill_number:                bill.bill_number,
      electricity_account_number: bill.electricity_account_number ?? '',
      total_amount:               String(bill.total_amount),
      total_units:                String(bill.total_units ?? ''),
      bill_issue_date:            bill.bill_issue_date ?? today,
      due_date:                   bill.due_date,
      notes:                      bill.notes ?? '',
      image_url:                  bill.image_url ?? '',
    });
    setServerError('');
    setDialogOpen(true);
  }

  async function onSubmit(data: CompanyBillInput) {
    setSaving(true);
    setServerError('');

    const url    = editBill ? `/api/billing/company-bills/${editBill.id}` : '/api/billing/company-bills';
    const method = editBill ? 'PUT' : 'POST';

    const res  = await fetch(url, { method, headers: { 'Content-Type': 'application/json' }, body: JSON.stringify(data) });
    const json = await res.json();

    if (!res.ok || json.error) {
      setServerError(json.error ?? 'Failed to save bill');
      setSaving(false);
      return;
    }

    setBills((prev) =>
      editBill
        ? prev.map((b) => (b.id === editBill.id ? json.data : b))
        : [...prev, json.data],
    );
    setDialogOpen(false);
    setSaving(false);
    router.refresh();
  }

  async function confirmDelete() {
    if (!deleteTarget) return;
    setDeleting(true);
    const res = await fetch(`/api/billing/company-bills/${deleteTarget.id}`, { method: 'DELETE' });
    const json = await res.json();
    if (!res.ok || json.error) {
      setDeleting(false);
      return;
    }
    setBills((prev) => prev.filter((b) => b.id !== deleteTarget.id));
    setDeleteTarget(null);
    setDeleting(false);
    router.refresh();
  }

  const summary = calcBillSummary(bills);

  return (
    <div className="space-y-6">
      {/* Summary cards */}
      <div className="grid grid-cols-2 gap-3 sm:grid-cols-4">
        <SummaryCard icon={<Hash className="h-4 w-4" />} label="Bills" value={String(summary.count)} />
        <SummaryCard
          icon={<Receipt className="h-4 w-4" />}
          label={`Total Amount (${currency})`}
          value={summary.count > 0 ? fmt(summary.totalAmount) : '—'}
          highlight={summary.count > 0}
        />
        <SummaryCard
          icon={<Zap className="h-4 w-4" />}
          label="Total Consumption"
          value={summary.count > 0 ? `${fmt(summary.totalUnits, 0)} kWh` : '—'}
        />
        <SummaryCard
          icon={<TrendingUp className="h-4 w-4" />}
          label={`Avg Cost / kWh (${currency})`}
          value={summary.avgCostPerUnit !== null ? fmt(summary.avgCostPerUnit, 4) : '—'}
        />
      </div>

      {/* Action bar */}
      {!isLocked && (
        <div className="flex items-center justify-between">
          <p className="text-sm text-gray-500">
            {bills.length === 0
              ? 'No company bills added yet for this period'
              : `${bills.length} bill${bills.length !== 1 ? 's' : ''} · ${MONTH_NAMES[periodMonth - 1]} ${periodYear}`}
          </p>
          <Button size="sm" onClick={openAdd}>
            <Plus className="h-4 w-4" />Add Bill
          </Button>
        </div>
      )}

      {/* Bills table */}
      {bills.length > 0 && (
        <div className="overflow-x-auto rounded-lg border border-gray-200">
          <Table>
            <TableHeader>
              <TableRow>
                <TableHead>Bill Reference</TableHead>
                <TableHead>Account No.</TableHead>
                <TableHead className="text-right">Amount ({currency})</TableHead>
                <TableHead className="text-right">Consumption (kWh)</TableHead>
                <TableHead>Issue Date</TableHead>
                <TableHead>Due Date</TableHead>
                <TableHead>Attachment</TableHead>
                <TableHead>Notes</TableHead>
                <TableHead>Linked To</TableHead>
                {!isLocked && <TableHead className="text-right">Actions</TableHead>}
              </TableRow>
            </TableHeader>
            <TableBody>
              {bills.map((bill) => (
                <TableRow key={bill.id}>
                  <TableCell className="font-mono font-medium text-sm">{bill.bill_number}</TableCell>
                  <TableCell className="text-sm text-gray-600">{bill.electricity_account_number ?? '—'}</TableCell>
                  <TableCell className="text-right font-medium">{fmt(Number(bill.total_amount))}</TableCell>
                  <TableCell className="text-right">{bill.total_units != null ? fmt(Number(bill.total_units), 0) : '—'}</TableCell>
                  <TableCell className="text-sm text-gray-600">
                    {bill.bill_issue_date ? new Date(bill.bill_issue_date).toLocaleDateString() : '—'}
                  </TableCell>
                  <TableCell className="text-sm text-gray-600">
                    {new Date(bill.due_date).toLocaleDateString()}
                  </TableCell>
                  <TableCell>
                    {bill.image_url
                      ? <a href={bill.image_url} target="_blank" rel="noopener noreferrer" className="text-blue-600 hover:underline text-xs inline-flex items-center gap-1"><Paperclip className="h-3 w-3" />View</a>
                      : <span className="text-gray-300 text-xs">—</span>}
                  </TableCell>
                  <TableCell className="text-sm text-gray-500 max-w-[160px] truncate">{bill.notes ?? '—'}</TableCell>
                  <TableCell className="text-sm">
                    {(() => {
                      const link = linkByBillId.get(bill.id);
                      if (link?.flatId) {
                        const flat = flats.find((f) => f.id === link.flatId);
                        return <Badge variant="secondary">Flat {flat?.flat_number ?? link.flatId}</Badge>;
                      }
                      if (link?.meterIds.length) {
                        return <Badge variant="success">{link.meterIds.length} meter{link.meterIds.length !== 1 ? 's' : ''}</Badge>;
                      }
                      return <Badge variant="destructive">Unlinked</Badge>;
                    })()}
                  </TableCell>
                  {!isLocked && (
                    <TableCell className="text-right space-x-1">
                      <Button size="sm" variant="outline" onClick={() => openLink(bill)}>
                        <Link2 className="h-3 w-3" />
                      </Button>
                      <Button size="sm" variant="outline" onClick={() => openEdit(bill)}>
                        <Pencil className="h-3 w-3" />
                      </Button>
                      <Button size="sm" variant="outline" className="text-red-600 hover:text-red-700 border-red-200 hover:border-red-300" onClick={() => setDeleteTarget(bill)}>
                        <Trash2 className="h-3 w-3" />
                      </Button>
                    </TableCell>
                  )}
                </TableRow>
              ))}

              {/* Totals row */}
              {bills.length > 1 && (
                <TableRow className="bg-gray-50 font-semibold">
                  <TableCell colSpan={2} className="text-sm text-gray-600">Total ({bills.length} bills)</TableCell>
                  <TableCell className="text-right">{fmt(summary.totalAmount)}</TableCell>
                  <TableCell className="text-right">{fmt(summary.totalUnits, 0)}</TableCell>
                  <TableCell colSpan={isLocked ? 5 : 6} />
                </TableRow>
              )}
            </TableBody>
          </Table>
        </div>
      )}

      {bills.length === 0 && isLocked && (
        <p className="text-sm text-gray-400 text-center py-8">No company bills recorded for this cycle.</p>
      )}

      {/* Add / Edit dialog */}
      <Dialog open={dialogOpen} onOpenChange={setDialogOpen}>
        <DialogContent className="max-w-xl max-h-[90vh] overflow-y-auto">
          <DialogHeader>
            <DialogTitle>{editBill ? 'Edit Company Bill' : 'Add Company Bill'}</DialogTitle>
          </DialogHeader>
          <form onSubmit={handleSubmit(onSubmit)} className="space-y-4 pt-2">
            {serverError && (
              <Alert variant="destructive">
                <AlertDescription>{serverError}</AlertDescription>
              </Alert>
            )}

            {/* Hidden context fields */}
            <input type="hidden" {...register('building_id')} />
            <input type="hidden" {...register('cycle_id')} />
            <input type="hidden" {...register('period_year')} />
            <input type="hidden" {...register('period_month')} />

            <div className="grid grid-cols-2 gap-4">
              <FormField label="Bill Reference No." htmlFor="bill_number" error={errors.bill_number?.message} required>
                <Input id="bill_number" placeholder="e.g. INV-2026-0123" {...register('bill_number')} />
              </FormField>
              <FormField label="Electricity Account No." htmlFor="electricity_account_number" error={errors.electricity_account_number?.message}>
                <Input id="electricity_account_number" placeholder="e.g. 5012345678" {...register('electricity_account_number')} />
              </FormField>
            </div>

            <div className="grid grid-cols-2 gap-4">
              <FormField label={`Bill Amount (${currency})`} htmlFor="total_amount" error={errors.total_amount?.message} required>
                <Input id="total_amount" type="number" step="0.01" min="0.01" placeholder="0.00" {...register('total_amount')} />
              </FormField>
              <FormField label="Bill Consumption (kWh)" htmlFor="total_units" error={errors.total_units?.message} required>
                <Input id="total_units" type="number" step="0.001" min="0.001" placeholder="0.000" {...register('total_units')} />
              </FormField>
            </div>

            <div className="grid grid-cols-2 gap-4">
              <FormField label="Issue Date" htmlFor="bill_issue_date" error={errors.bill_issue_date?.message}>
                <Input id="bill_issue_date" type="date" {...register('bill_issue_date')} />
              </FormField>
              <FormField label="Due Date" htmlFor="due_date" error={errors.due_date?.message} required>
                <Input id="due_date" type="date" {...register('due_date')} />
              </FormField>
            </div>

            <FormField label="Notes" htmlFor="notes" error={errors.notes?.message}>
              <Textarea id="notes" rows={2} placeholder="Optional notes…" {...register('notes')} />
            </FormField>

            <div className="flex gap-3 pt-2">
              <Button type="submit" loading={saving}>
                {saving ? 'Saving…' : editBill ? 'Save Changes' : 'Add Bill'}
              </Button>
              <Button type="button" variant="outline" onClick={() => setDialogOpen(false)}>Cancel</Button>
            </div>
          </form>
        </DialogContent>
      </Dialog>

      {/* Delete confirm */}
      <ConfirmDialog
        open={!!deleteTarget}
        onOpenChange={(o) => { if (!o) setDeleteTarget(null); }}
        title="Delete Company Bill"
        description={`This will permanently delete bill reference "${deleteTarget?.bill_number}". This cannot be undone.`}
        confirmLabel="Delete"
        loading={deleting}
        onConfirm={confirmDelete}
      />

      {/* Link bill to meters/flat */}
      <Dialog open={!!linkTarget} onOpenChange={(o) => { if (!o) setLinkTarget(null); }}>
        <DialogContent className="max-w-md max-h-[80vh] overflow-y-auto">
          <DialogHeader>
            <DialogTitle>Link Bill {linkTarget?.bill_number}</DialogTitle>
          </DialogHeader>
          <div className="space-y-4 pt-2">
            {linkError && (
              <Alert variant="destructive">
                <AlertDescription>{linkError}</AlertDescription>
              </Alert>
            )}

            <FormField label="Bill to flat as lump sum (skips meter consumption)" htmlFor="link_flat">
              <Select
                value={linkFlatId ?? '__none__'}
                onValueChange={(v) => setLinkFlatId(v === '__none__' ? null : v)}
              >
                <SelectTrigger id="link_flat">
                  <SelectValue />
                </SelectTrigger>
                <SelectContent>
                  <SelectItem value="__none__">Not billed to a flat</SelectItem>
                  {flats.map((f) => (
                    <SelectItem key={f.id} value={f.id}>Flat {f.flat_number}</SelectItem>
                  ))}
                </SelectContent>
              </Select>
            </FormField>

            {!linkFlatId && (
              <div className="space-y-1.5">
                <p className="text-sm font-medium text-gray-700">Linked Meters</p>
                <p className="text-xs text-gray-500">Select every meter this bill's amount and consumption cover.</p>
                <div className="max-h-56 overflow-y-auto rounded-md border border-gray-200 divide-y">
                  {meters.length === 0 && (
                    <p className="text-sm text-gray-400 p-3">No meters in this building.</p>
                  )}
                  {meters.map((m) => (
                    <label key={m.id} className="flex items-center gap-2 px-3 py-2 text-sm cursor-pointer hover:bg-gray-50">
                      <input
                        type="checkbox"
                        checked={linkMeterIds.includes(m.id)}
                        onChange={() => toggleMeter(m.id)}
                      />
                      {m.meter_number}
                    </label>
                  ))}
                </div>
              </div>
            )}

            <div className="flex gap-3 pt-2">
              <Button type="button" loading={linkSaving} onClick={saveLink}>
                {linkSaving ? 'Saving…' : 'Save Link'}
              </Button>
              <Button type="button" variant="outline" onClick={() => setLinkTarget(null)}>Cancel</Button>
            </div>
          </div>
        </DialogContent>
      </Dialog>
    </div>
  );
}

function SummaryCard({ icon, label, value, highlight }: { icon: React.ReactNode; label: string; value: string; highlight?: boolean }) {
  return (
    <div className="rounded-lg border border-gray-100 bg-white p-4 space-y-1">
      <div className="flex items-center gap-1.5 text-gray-400">{icon}<span className="text-xs">{label}</span></div>
      <p className={`text-lg font-bold ${highlight ? 'text-blue-700' : 'text-gray-900'}`}>{value}</p>
    </div>
  );
}
