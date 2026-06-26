'use client';

import { useState } from 'react';
import { useRouter } from 'next/navigation';
import { Button } from '@/components/ui/button';
import { Textarea } from '@/components/ui/textarea';
import { Alert, AlertDescription, AlertTitle } from '@/components/ui/alert';
import { Dialog, DialogContent, DialogHeader, DialogTitle } from '@/components/ui/dialog';
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from '@/components/ui/table';
import {
  FunctionSquare, Loader2, CheckCircle2, AlertTriangle, X, Grid3x3, Ban,
} from 'lucide-react';
import type { FlatBillPreview } from '@/services/billing/billingCalculationService';
import type { ElectricityCompanyBill, CycleStatus } from '@/types';

type ColumnKey =
  | 'consumption' | 'rate_per_unit' | 'base_bill' | 'adjustment'
  | 'previous_balance' | 'lump_sum' | 'total_due';

const COLUMNS: { key: ColumnKey; label: string; decimals: number }[] = [
  { key: 'consumption',      label: 'Consumption (kWh)', decimals: 3 },
  { key: 'rate_per_unit',    label: 'Rate / Unit',        decimals: 4 },
  { key: 'base_bill',        label: 'Base Bill',          decimals: 2 },
  { key: 'adjustment',       label: 'Adjustment',         decimals: 2 },
  { key: 'previous_balance', label: 'Prev. Balance',      decimals: 2 },
  { key: 'lump_sum',         label: 'Lump Sum',           decimals: 2 },
  { key: 'total_due',        label: 'Total Due',          decimals: 2 },
];

function cellValue(bill: FlatBillPreview, key: ColumnKey): number {
  switch (key) {
    case 'consumption':      return bill.consumption;
    case 'rate_per_unit':    return bill.ratePerUnit;
    case 'base_bill':        return bill.baseBill;
    case 'adjustment':       return bill.differenceAdjustment;
    case 'previous_balance': return bill.previousBalance;
    case 'lump_sum':         return bill.lumpSumCharges;
    case 'total_due':        return bill.totalDue;
  }
}

function fmt(n: number, d: number) {
  return n.toLocaleString('en', { minimumFractionDigits: d, maximumFractionDigits: d });
}

export interface ActiveFormulaInfo {
  formulaText: string;
  scope:       'persistent' | 'one-off';
}

interface FormulaGridProps {
  cycleId:      string;
  buildingId:   string;
  currency:     string;
  cycleStatus:  CycleStatus;
  flatBills:    FlatBillPreview[];
  companyBills: ElectricityCompanyBill[];
  /** flatId -> column -> info about the currently active formula on that cell, if any. */
  activeFormulas: Record<string, Partial<Record<ColumnKey, ActiveFormulaInfo>>>;
}

export function FormulaGrid({
  cycleId, buildingId, currency, cycleStatus, flatBills, companyBills, activeFormulas,
}: FormulaGridProps) {
  const router = useRouter();
  const isLocked = cycleStatus === 'issued' || cycleStatus === 'closed';

  const [editing, setEditing] = useState<{ bill: FlatBillPreview; column: ColumnKey } | null>(null);

  const companyBillsTotal = companyBills.reduce((s, b) => s + Number(b.total_amount), 0);
  const flatBillsTotal    = flatBills.reduce((s, b) => s + b.totalDue, 0);
  const delta             = round2(companyBillsTotal - flatBillsTotal);
  const inBalance         = Math.abs(delta) <= 0.01;

  function round2(n: number) { return Math.round((n + Number.EPSILON) * 100) / 100; }

  return (
    <div className="space-y-4">
      {/* Safety-net discrepancy banner — always visible, informational only */}
      {companyBills.length > 0 || flatBills.length > 0 ? (
        inBalance ? (
          <Alert variant="success">
            <CheckCircle2 className="h-4 w-4" />
            <AlertDescription>
              Company bills ({fmt(companyBillsTotal, 2)} {currency}) match flat bills total ({fmt(flatBillsTotal, 2)} {currency}).
            </AlertDescription>
          </Alert>
        ) : (
          <Alert variant="warning">
            <AlertTriangle className="h-4 w-4" />
            <AlertTitle>Totals don't match</AlertTitle>
            <AlertDescription>
              Company bills total <strong>{fmt(companyBillsTotal, 2)} {currency}</strong>, but flat bills sum to{' '}
              <strong>{fmt(flatBillsTotal, 2)} {currency}</strong> — a difference of{' '}
              <strong>{delta >= 0 ? '+' : ''}{fmt(delta, 2)} {currency}</strong>. This is informational only — nothing has
              been auto-corrected. Review formulas/adjustments for this cycle.
            </AlertDescription>
          </Alert>
        )
      ) : null}

      {flatBills.length === 0 ? (
        <div className="rounded-lg border border-dashed border-gray-200 py-12 text-center">
          <Grid3x3 className="h-8 w-8 text-gray-300 mx-auto mb-2" />
          <p className="text-sm text-gray-500">Run a calculation first to populate the spreadsheet grid.</p>
        </div>
      ) : (
        <div className="overflow-x-auto rounded-lg border border-gray-200">
          <Table>
            <TableHeader>
              <TableRow>
                <TableHead>Flat</TableHead>
                {COLUMNS.map((c) => <TableHead key={c.key} className="text-right">{c.label}</TableHead>)}
              </TableRow>
            </TableHeader>
            <TableBody>
              {flatBills.map((bill) => (
                <TableRow key={bill.flatId}>
                  <TableCell className="font-medium">Flat {bill.flatNumber}</TableCell>
                  {COLUMNS.map((col) => {
                    const info = activeFormulas[bill.flatId]?.[col.key];
                    return (
                      <TableCell
                        key={col.key}
                        className={[
                          'text-right font-mono cursor-pointer transition-colors',
                          info ? 'bg-blue-50 border-l-2 border-blue-400 hover:bg-blue-100' : 'hover:bg-gray-50',
                          isLocked ? 'cursor-default' : '',
                        ].join(' ')}
                        title={info ? `Formula: ${info.formulaText} (${info.scope})` : 'Click to set a formula'}
                        onClick={() => { if (!isLocked) setEditing({ bill, column: col.key }); }}
                      >
                        <span className="inline-flex items-center gap-1 justify-end">
                          {info && <FunctionSquare className="h-3 w-3 text-blue-500" />}
                          {fmt(cellValue(bill, col.key), col.decimals)}
                        </span>
                      </TableCell>
                    );
                  })}
                </TableRow>
              ))}
            </TableBody>
          </Table>
        </div>
      )}

      {editing && (
        <CellFormulaEditor
          cycleId={cycleId}
          buildingId={buildingId}
          bill={editing.bill}
          column={editing.column}
          initial={activeFormulas[editing.bill.flatId]?.[editing.column] ?? null}
          onClose={() => setEditing(null)}
          onSaved={() => { setEditing(null); router.refresh(); }}
        />
      )}
    </div>
  );
}

interface CellFormulaEditorProps {
  cycleId:    string;
  buildingId: string;
  bill:       FlatBillPreview;
  column:     ColumnKey;
  initial:    ActiveFormulaInfo | null;
  onClose:    () => void;
  onSaved:    () => void;
}

function CellFormulaEditor({ cycleId, buildingId, bill, column, initial, onClose, onSaved }: CellFormulaEditorProps) {
  const [text, setText]   = useState(initial?.formulaText ?? '');
  const [scope, setScope] = useState<'persistent' | 'one-off'>(initial?.scope ?? 'persistent');
  const [saving, setSaving]     = useState(false);
  const [clearing, setClearing] = useState(false);
  const [checking, setChecking] = useState(false);
  const [excluding, setExcluding] = useState(false);
  const [error, setError]       = useState('');
  const [checkResult, setCheckResult] = useState<{ valid: boolean; error: string | null } | null>(null);

  const colMeta = COLUMNS.find((c) => c.key === column)!;
  const isAdjustmentColumn = column === 'adjustment';

  async function check() {
    setChecking(true);
    setCheckResult(null);
    try {
      const res = await fetch('/api/billing/formulas', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ formula_text: text }),
      });
      const json = await res.json();
      setCheckResult(json.data ?? { valid: false, error: json.error });
    } finally {
      setChecking(false);
    }
  }

  async function save() {
    setSaving(true);
    setError('');
    try {
      const res = await fetch('/api/billing/formulas', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          flat_id:        bill.flatId,
          cycle_id:       scope === 'one-off' ? cycleId : null,
          formula_text:   text,
          formula_target: column,
        }),
      });
      const json = await res.json();
      if (!res.ok || json.error) { setError(json.error ?? 'Failed to save formula'); return; }
      onSaved();
    } catch {
      setError('Network error');
    } finally {
      setSaving(false);
    }
  }

  async function toggleExclusion() {
    if (!bill.id) { setError('Calculate bills first before excluding this flat from the residual distribution.'); return; }
    setExcluding(true);
    setError('');
    try {
      const res = await fetch(`/api/billing/bills/${bill.id}/residual-exclusion`, {
        method: 'PATCH',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ excluded: !bill.excludedFromResidual }),
      });
      const json = await res.json();
      if (!res.ok || json.error) { setError(json.error ?? 'Failed to update exclusion'); return; }
      onSaved();
    } catch {
      setError('Network error');
    } finally {
      setExcluding(false);
    }
  }

  async function clear() {
    setClearing(true);
    setError('');
    try {
      const listRes = await fetch(
        `/api/billing/formulas?building_id=${encodeURIComponent(buildingId)}&cycle_id=${encodeURIComponent(cycleId)}`,
      );
      const listJson = await listRes.json();
      if (!listRes.ok || listJson.error) { setError(listJson.error ?? 'Failed to look up formula'); return; }

      const match = (listJson.data ?? []).find(
        (f: any) => f.flatId === bill.flatId && f.formulaTarget === column,
      );
      if (!match) { setError('No active formula found to clear.'); return; }

      const delRes = await fetch('/api/billing/formulas', {
        method: 'DELETE',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ id: match.id }),
      });
      const delJson = await delRes.json();
      if (!delRes.ok || delJson.error) { setError(delJson.error ?? 'Failed to clear formula'); return; }

      onSaved();
    } catch {
      setError('Network error');
    } finally {
      setClearing(false);
    }
  }

  return (
    <Dialog open onOpenChange={(open) => { if (!open) onClose(); }}>
      <DialogContent className="max-w-lg">
        <DialogHeader>
          <DialogTitle className="flex items-center gap-2">
            <FunctionSquare className="h-5 w-5" /> Flat {bill.flatNumber} — {colMeta.label}
          </DialogTitle>
        </DialogHeader>

        <div className="space-y-4">
          <p className="text-xs text-gray-500">
            This formula's result replaces the <strong>{colMeta.label}</strong> cell for this flat.
            {column === 'previous_balance' || column === 'lump_sum'
              ? ' The result still flows through the normal total-due calculation.'
              : column === 'adjustment'
              ? ' This flat is excluded from the normal residual distribution while this formula is active.'
              : column === 'total_due'
              ? ' This fully overrides the final amount due for this flat.'
              : ''}
            {' '}Use variables, arithmetic, AVG/SUM/MIN/MAX(field) across other flats, IF(cond, a, b), and
            FLAT()/METER()/BILL() lookups.
          </p>

          {isAdjustmentColumn && (
            <div className="flex items-center justify-between gap-2 rounded-md border border-gray-200 bg-gray-50 px-3 py-2">
              <div className="text-xs text-gray-600">
                <span className="font-medium text-gray-700">Exclude from residual distribution</span>
                <p className="text-gray-500">
                  Quick toggle — this flat gets none of the rounding/loss residual and its adjustment is
                  fixed at zero, without needing a formula.
                  {bill.excludedFromResidual && <span className="text-blue-600"> Currently excluded.</span>}
                </p>
              </div>
              <Button
                variant={bill.excludedFromResidual ? 'default' : 'outline'}
                size="sm"
                disabled={excluding}
                onClick={toggleExclusion}
                className="shrink-0"
              >
                {excluding ? <Loader2 className="h-4 w-4 animate-spin" /> : <Ban className="h-4 w-4" />}
                {bill.excludedFromResidual ? 'Excluded' : 'Exclude'}
              </Button>
            </div>
          )}

          <Textarea
            value={text}
            onChange={(e) => { setText(e.target.value); setCheckResult(null); }}
            placeholder="e.g. AVG(consumption) * rate_per_unit"
            rows={4}
            className="font-mono text-sm"
          />

          <div className="flex items-center gap-4 text-sm">
            <label className="flex items-center gap-1.5">
              <input type="radio" checked={scope === 'persistent'} onChange={() => setScope('persistent')} />
              Persistent (applies every future cycle)
            </label>
            <label className="flex items-center gap-1.5">
              <input type="radio" checked={scope === 'one-off'} onChange={() => setScope('one-off')} />
              This cycle only
            </label>
          </div>

          {checkResult && (
            checkResult.valid
              ? <Alert variant="success"><CheckCircle2 className="h-4 w-4" /><AlertDescription>Formula is valid.</AlertDescription></Alert>
              : <Alert variant="destructive"><AlertDescription>{checkResult.error}</AlertDescription></Alert>
          )}
          {error && <Alert variant="destructive"><AlertDescription>{error}</AlertDescription></Alert>}

          <div className="flex items-center justify-between gap-2">
            {initial && (
              <Button variant="outline" size="sm" disabled={clearing} onClick={clear} className="text-red-600 border-red-200 hover:border-red-300">
                {clearing ? <Loader2 className="h-4 w-4 animate-spin" /> : <X className="h-4 w-4" />}
                Clear formula
              </Button>
            )}
            <div className="flex items-center gap-2 ml-auto">
              <Button variant="outline" size="sm" disabled={checking || !text.trim()} onClick={check}>
                {checking ? <Loader2 className="h-4 w-4 animate-spin" /> : null}
                Check Formula
              </Button>
              <Button size="sm" disabled={saving || !text.trim()} onClick={save}>
                {saving ? <Loader2 className="h-4 w-4 animate-spin" /> : null}
                Save
              </Button>
            </div>
          </div>
        </div>
      </DialogContent>
    </Dialog>
  );
}
