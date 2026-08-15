'use client';

import { useState, useEffect, useCallback } from 'react';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Textarea } from '@/components/ui/textarea';
import { Alert, AlertDescription, AlertTitle } from '@/components/ui/alert';
import { Badge } from '@/components/ui/badge';
import { Dialog, DialogContent, DialogHeader, DialogTitle } from '@/components/ui/dialog';
import {
  Table, TableBody, TableCell, TableHead, TableHeader, TableRow,
} from '@/components/ui/table';
import {
  FunctionSquare, Loader2, CheckCircle2, AlertTriangle, Plus,
  RefreshCw, Lock, Edit2, Calculator, SendHorizonal, ChevronDown, ChevronRight, Trash2,
} from 'lucide-react';
import type { CycleStatus } from '@/types';

// ─── Types ────────────────────────────────────────────────────────────────────

interface SheetCell {
  id:             string;
  cell_name:      string;
  formula_text:   string | null;
  literal_value:  number | null;
  computed_value: number | null;
  is_input:       boolean;
  display_order:  number | null;
}

interface SheetRow {
  id:           string;
  published_at: string | null;
}

interface CompanyBill {
  bill_number:  string;
  total_amount: number;
  total_units:  number;
}

interface SheetData {
  sheet:        SheetRow;
  cells:        SheetCell[];
  results:      Record<string, number>;
  errors:       Record<string, string>;
  companyBills: CompanyBill[];
}

interface SpreadsheetEditorProps {
  cycleId:              string;
  currency:             string;
  cycleStatus:          CycleStatus;
  initialCompanyBills?: CompanyBill[];
}

// ─── Cell-name helpers ────────────────────────────────────────────────────────

type CellGroup = 'bill' | 'flat' | 'pool' | 'owner' | 'other';

function getGroup(cellName: string): CellGroup {
  if (cellName.startsWith('bill:'))  return 'bill';
  if (cellName.startsWith('flat:'))  return 'flat';
  if (cellName.startsWith('pool:'))  return 'pool';
  if (cellName.startsWith('owner:')) return 'owner';
  return 'other';
}

function getFlatNumber(cellName: string): string | null {
  const m = /^flat:([^:]+):/.exec(cellName);
  return m ? m[1] : null;
}

function getBillNumber(cellName: string): string | null {
  const m = /^bill:([^:]+):/.exec(cellName);
  return m ? m[1] : null;
}

function fmt(n: number | null | undefined): string {
  if (n === null || n === undefined) return '—';
  return n.toLocaleString('en', { maximumFractionDigits: 4 });
}

function isOutputCell(cellName: string): boolean {
  return /^flat:[^:]+:final_bill$/.test(cellName) || /^flat:[^:]+:consumption$/.test(cellName);
}

// ─── Component ────────────────────────────────────────────────────────────────

export function SpreadsheetEditor({ cycleId, currency, cycleStatus, initialCompanyBills = [] }: SpreadsheetEditorProps) {
  const [data, setData]         = useState<SheetData | null>(null);
  const [loading, setLoading]   = useState(true);
  const [error, setError]       = useState('');
  const [editing, setEditing]   = useState<SheetCell | null>(null);
  const [addingToGroup, setAddingToGroup] = useState<string | null>(null); // prefix hint
  const [publishing, setPublishing]     = useState(false);
  const [publishError, setPublishError] = useState('');
  const [calculating, setCalculating]   = useState(false);
  const [calcError, setCalcError]       = useState('');
  const [issuing, setIssuing]           = useState(false);
  const [issueError, setIssueError]     = useState('');
  const [calcCount, setCalcCount]       = useState<number | null>(null);

  const load = useCallback(async () => {
    setLoading(true);
    setError('');
    try {
      const res  = await fetch(`/api/billing/sheet/${cycleId}`);
      const json = await res.json();
      if (!res.ok || json.error) { setError(json.error ?? 'Failed to load sheet'); return; }
      setData(json.data);
    } catch {
      setError('Network error loading sheet');
    } finally {
      setLoading(false);
    }
  }, [cycleId]);

  useEffect(() => { load(); }, [load]);

  async function calculateBills() {
    setCalculating(true);
    setCalcError('');
    setCalcCount(null);
    try {
      const res  = await fetch(`/api/billing/sheet/${cycleId}/calculate`, { method: 'POST' });
      const json = await res.json();
      if (!res.ok || json.error) { setCalcError(json.error ?? 'Calculation failed'); return; }
      setCalcCount(json.data?.count ?? 0);
    } catch {
      setCalcError('Network error');
    } finally {
      setCalculating(false);
    }
  }

  async function issueBills() {
    if (!confirm('Issue all draft bills? Tenants will be able to see them. This cannot be undone.')) return;
    setIssuing(true);
    setIssueError('');
    try {
      const res  = await fetch(`/api/billing/cycles/${cycleId}/issue`, { method: 'POST' });
      const json = await res.json();
      if (!res.ok || json.error) { setIssueError(json.error ?? 'Issue failed'); return; }
      await load();
    } catch {
      setIssueError('Network error');
    } finally {
      setIssuing(false);
    }
  }

  async function publish() {
    setPublishing(true);
    setPublishError('');
    try {
      const res  = await fetch(`/api/billing/sheet/${cycleId}/publish`, { method: 'POST' });
      const json = await res.json();
      if (!res.ok || json.error) { setPublishError(json.error ?? 'Failed to publish'); return; }
      await load();
    } catch {
      setPublishError('Network error');
    } finally {
      setPublishing(false);
    }
  }

  const isLocked     = cycleStatus === 'issued' || cycleStatus === 'closed';
  const isPublished  = !!data?.sheet.published_at;

  // ── Safety-net banner — compare bill:*:cost totals vs flat:*:final_bill totals ──
  let companyTotal = 0;
  let flatTotal    = 0;
  if (data) {
    for (const [name, val] of Object.entries(data.results)) {
      if (/^bill:[^:]+:cost$/.test(name))        companyTotal += val;
      if (/^flat:[^:]+:final_bill$/.test(name))  flatTotal    += val;
    }
  }
  const delta     = Math.round((companyTotal - flatTotal) * 100) / 100;
  const inBalance = data && Math.abs(delta) <= 0.01;
  const hasOutput = flatTotal > 0 || companyTotal > 0;

  // ── Group cells ──────────────────────────────────────────────────────────────
  const cells = data?.cells ?? [];

  // Group by prefix key: bill:N, flat:N, pool, owner, other
  const groupKeys: string[] = [];
  const groups: Record<string, SheetCell[]> = {};
  for (const c of cells) {
    let key: string;
    const g = getGroup(c.cell_name);
    if (g === 'flat')  key = `flat:${getFlatNumber(c.cell_name)}`;
    else if (g === 'bill') key = `bill:${getBillNumber(c.cell_name)}`;
    else key = g;
    if (!groups[key]) { groups[key] = []; groupKeys.push(key); }
    groups[key].push(c);
  }
  // Deduplicate groupKeys while preserving order
  const seenKeys = new Set<string>();
  const orderedGroupKeys = groupKeys.filter((k) => { if (seenKeys.has(k)) return false; seenKeys.add(k); return true; });
  // Sort: bill groups first, then flat groups (numeric), then pool, owner, other
  orderedGroupKeys.sort((a, b) => {
    const orderOf = (k: string) => {
      if (k.startsWith('bill:')) return 0;
      if (k.startsWith('flat:')) return 1;
      if (k === 'pool')  return 2;
      if (k === 'owner') return 3;
      return 4;
    };
    const oa = orderOf(a), ob = orderOf(b);
    if (oa !== ob) return oa - ob;
    // For bill/flat groups, sort numerically on the number part
    const na = parseInt(a.split(':')[1] ?? '0', 10);
    const nb = parseInt(b.split(':')[1] ?? '0', 10);
    return na - nb || a.localeCompare(b);
  });

  function groupLabel(key: string): string {
    if (key.startsWith('bill:')) return `Company Bill ${key.slice(5)}`;
    if (key.startsWith('flat:')) return `Flat ${key.slice(5)}`;
    if (key === 'pool')  return 'Pool (shared)';
    if (key === 'owner') return 'Owner';
    return 'Custom';
  }

  if (loading) {
    return (
      <div className="flex items-center justify-center py-16 text-gray-400">
        <Loader2 className="h-6 w-6 animate-spin mr-2" /> Loading sheet…
      </div>
    );
  }

  if (error) {
    return (
      <Alert variant="destructive">
        <AlertDescription>{error}</AlertDescription>
      </Alert>
    );
  }

  return (
    <div className="space-y-4">

      {/* Header actions */}
      <div className="flex items-center justify-between gap-2 flex-wrap">
        <div className="flex items-center gap-2">
          {isPublished && (
            <Badge variant="success" className="flex items-center gap-1">
              <Lock className="h-3 w-3" /> Published {new Date(data!.sheet.published_at!).toLocaleDateString()}
            </Badge>
          )}
          {!isPublished && cells.length > 0 && (
            <span className="text-xs text-gray-500">
              Edit formulas and values below, then publish to lock in the final results.
            </span>
          )}
        </div>
        <div className="flex items-center gap-2">
          <Button variant="outline" size="sm" onClick={load} disabled={loading}>
            <RefreshCw className="h-4 w-4 mr-1" /> Recalculate
          </Button>
          {!isPublished && !isLocked && (
            <Button size="sm" onClick={publish} disabled={publishing || cells.length === 0}>
              {publishing ? <Loader2 className="h-4 w-4 animate-spin mr-1" /> : <Lock className="h-4 w-4 mr-1" />}
              Publish
            </Button>
          )}
        </div>
      </div>

      {publishError && (
        <Alert variant="destructive"><AlertDescription>{publishError}</AlertDescription></Alert>
      )}

      {/* Calculate from sheet + Issue Bills — shown after publishing */}
      {isPublished && !isLocked && (
        <div className="rounded-lg border border-gray-200 bg-gray-50 p-4 space-y-3">
          <p className="text-sm font-medium text-gray-700">Generate &amp; Issue Bills</p>
          <p className="text-xs text-gray-500">
            Step 1: Calculate creates draft bills from the published sheet outputs.
            Step 2: Issue makes them visible to tenants.
          </p>
          <div className="flex items-center gap-2 flex-wrap">
            <Button size="sm" onClick={calculateBills} disabled={calculating || issuing}>
              {calculating ? <Loader2 className="h-4 w-4 animate-spin mr-1" /> : <Calculator className="h-4 w-4 mr-1" />}
              Calculate Bills from Sheet
            </Button>
            <Button size="sm" variant="outline" onClick={issueBills} disabled={issuing || calculating || calcCount === null}>
              {issuing ? <Loader2 className="h-4 w-4 animate-spin mr-1" /> : <SendHorizonal className="h-4 w-4 mr-1" />}
              Issue Bills
            </Button>
            {calcCount !== null && (
              <span className="text-xs text-green-600 flex items-center gap-1">
                <CheckCircle2 className="h-3.5 w-3.5" /> {calcCount} draft bill{calcCount !== 1 ? 's' : ''} created — ready to issue.
              </span>
            )}
          </div>
          {calcError  && <Alert variant="destructive"><AlertDescription>{calcError}</AlertDescription></Alert>}
          {issueError && <Alert variant="destructive"><AlertDescription>{issueError}</AlertDescription></Alert>}
        </div>
      )}

      {/* Safety-net discrepancy banner */}
      {hasOutput && (
        inBalance ? (
          <Alert variant="success">
            <CheckCircle2 className="h-4 w-4" />
            <AlertDescription>
              Company bills total ({fmt(companyTotal)} {currency}) matches flat final bills ({fmt(flatTotal)} {currency}).
            </AlertDescription>
          </Alert>
        ) : (
          <Alert variant="warning">
            <AlertTriangle className="h-4 w-4" />
            <AlertTitle>Totals don't match</AlertTitle>
            <AlertDescription>
              Company bills: <strong>{fmt(companyTotal)} {currency}</strong> — flat final bills sum to{' '}
              <strong>{fmt(flatTotal)} {currency}</strong> — difference:{' '}
              <strong>{delta >= 0 ? '+' : ''}{fmt(delta)} {currency}</strong>.
              Informational only — nothing auto-corrected. Adjust formulas and recalculate.
            </AlertDescription>
          </Alert>
        )
      )}

      {/* Per-cell error summary */}
      {data && Object.keys(data.errors).length > 0 && (
        <Alert variant="destructive">
          <AlertTitle>Formula errors</AlertTitle>
          <AlertDescription>
            <ul className="mt-1 space-y-0.5 text-xs">
              {Object.entries(data.errors).map(([name, msg]) => (
                <li key={name}><code className="font-mono">{name}</code>: {msg}</li>
              ))}
            </ul>
          </AlertDescription>
        </Alert>
      )}

      {cells.length === 0 ? (
        <div className="rounded-lg border border-dashed border-gray-200 py-12 text-center text-sm text-gray-400">
          No cells yet — the sheet will auto-populate from readings and bills on next load.
        </div>
      ) : (
        <div className="space-y-6">
          {orderedGroupKeys.map((groupKey) => (
            <GroupTable
              key={groupKey}
              groupKey={groupKey}
              label={groupLabel(groupKey)}
              cells={groups[groupKey]}
              results={data!.results}
              errors={data!.errors}
              isLocked={isLocked || isPublished}
              onEdit={(c) => setEditing(c)}
              onAddCell={() => setAddingToGroup(groupKey + ':')}
              onDelete={async (cellName) => {
                if (!confirm(`Delete cell "${cellName}"? This cannot be undone.`)) return;
                const res  = await fetch(`/api/billing/sheet/${cycleId}/cell`, { method: 'DELETE', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify({ cellName }) });
                const json = await res.json();
                if (res.ok && json.data) {
                  setData((prev) => prev ? { ...prev, cells: json.data.cells, results: json.data.results, errors: json.data.errors } : prev);
                }
              }}
            />
          ))}

          {/* Add new group / custom cell */}
          {!isLocked && !isPublished && (
            <div className="flex justify-center">
              <Button variant="outline" size="sm" onClick={() => setAddingToGroup('')}>
                <Plus className="h-4 w-4 mr-1" /> Add custom cell
              </Button>
            </div>
          )}
        </div>
      )}

      {/* Cell editor dialog */}
      {editing !== null && (
        <CellEditDialog
          cycleId={cycleId}
          cell={editing}
          allCells={cells}
          results={data?.results ?? {}}
          companyBills={data?.companyBills?.length ? data.companyBills : initialCompanyBills}
          onClose={() => setEditing(null)}
          onSaved={(patch) => {
            setEditing(null);
            if (patch.cells && patch.results && patch.errors !== undefined) {
              setData((prev) => prev ? { ...prev, cells: patch.cells!, results: patch.results!, errors: patch.errors! } : prev);
            } else {
              load();
            }
          }}
        />
      )}

      {/* New cell dialog */}
      {addingToGroup !== null && (
        <NewCellDialog
          cycleId={cycleId}
          prefixHint={addingToGroup}
          allCells={cells}
          results={data?.results ?? {}}
          companyBills={data?.companyBills?.length ? data.companyBills : initialCompanyBills}
          onClose={() => setAddingToGroup(null)}
          onSaved={(patch) => {
            setAddingToGroup(null);
            if (patch.cells && patch.results && patch.errors !== undefined) {
              setData((prev) => prev ? { ...prev, cells: patch.cells!, results: patch.results!, errors: patch.errors! } : prev);
            } else {
              load();
            }
          }}
        />
      )}
    </div>
  );
}

// ─── GroupTable ───────────────────────────────────────────────────────────────

interface GroupTableProps {
  groupKey: string;
  label:    string;
  cells:    SheetCell[];
  results:  Record<string, number>;
  errors:   Record<string, string>;
  isLocked: boolean;
  onEdit:   (c: SheetCell) => void;
  onAddCell: () => void;
  onDelete: (cellName: string) => void;
}

function GroupTable({ groupKey, label, cells, results, errors, isLocked, onEdit, onAddCell, onDelete }: GroupTableProps) {
  const sortedCells = [...cells].sort((a, b) =>
    (a.display_order ?? 9999) - (b.display_order ?? 9999) || a.cell_name.localeCompare(b.cell_name),
  );

  return (
    <div>
      <div className="flex items-center justify-between mb-1.5">
        <h3 className="text-sm font-semibold text-gray-700">{label}</h3>
        {!isLocked && (
          <Button variant="ghost" size="sm" className="h-6 text-xs text-gray-400 hover:text-gray-600" onClick={onAddCell}>
            <Plus className="h-3 w-3 mr-0.5" /> Add cell
          </Button>
        )}
      </div>
      <div className="rounded-lg border border-gray-200 overflow-hidden">
        <Table>
          <TableHeader>
            <TableRow className="bg-gray-50">
              <TableHead className="text-xs font-medium w-1/3">Cell</TableHead>
              <TableHead className="text-xs font-medium">Formula / Value</TableHead>
              <TableHead className="text-xs font-medium text-right w-36">Result</TableHead>
              {!isLocked && <TableHead className="w-10" />}
            </TableRow>
          </TableHeader>
          <TableBody>
            {sortedCells.map((c) => {
              const computed = results[c.cell_name];
              const err      = errors[c.cell_name];
              const isOutput = isOutputCell(c.cell_name);
              return (
                <TableRow
                  key={c.cell_name}
                  className={isOutput ? 'bg-green-50/40' : c.is_input ? '' : 'bg-blue-50/20'}
                >
                  <TableCell className="font-mono text-xs text-gray-600 py-2">
                    {c.cell_name.replace(/^[^:]+:[^:]+:/, '')}
                    {isOutput && <span className="ml-1.5 text-green-600 text-[10px] font-sans">output</span>}
                    {c.is_input && !isOutput && <span className="ml-1.5 text-gray-400 text-[10px] font-sans">raw</span>}
                  </TableCell>
                  <TableCell className="text-xs py-2">
                    {c.formula_text ? (
                      <code className="text-blue-700 bg-blue-50 rounded px-1.5 py-0.5 text-[11px] break-all">
                        {c.formula_text}
                      </code>
                    ) : (
                      <span className="text-gray-500">{c.literal_value !== null ? String(c.literal_value) : '—'}</span>
                    )}
                  </TableCell>
                  <TableCell className="text-right font-mono text-xs py-2">
                    {err ? (
                      <span className="text-red-500 text-[11px]" title={err}>Error</span>
                    ) : (
                      <span className={isOutput ? 'font-semibold text-green-700' : ''}>
                        {fmt(computed)}
                      </span>
                    )}
                  </TableCell>
                  {!isLocked && (
                    <TableCell className="py-2 text-right">
                      <div className="flex items-center justify-end gap-1">
                        <Button variant="ghost" size="sm" className="h-6 w-6 p-0" onClick={() => onEdit(c)}>
                          <Edit2 className="h-3 w-3 text-gray-400" />
                        </Button>
                        <Button variant="ghost" size="sm" className="h-6 w-6 p-0 hover:text-red-500" onClick={() => onDelete(c.cell_name)}>
                          <Trash2 className="h-3 w-3 text-gray-300 hover:text-red-500" />
                        </Button>
                      </div>
                    </TableCell>
                  )}
                </TableRow>
              );
            })}
          </TableBody>
        </Table>
      </div>
    </div>
  );
}

// ─── FormulaReferencePanel ────────────────────────────────────────────────────

interface FormulaReferencePanelProps {
  allCells:     SheetCell[];
  results:      Record<string, number>;
  companyBills: CompanyBill[];
  onInsert:     (name: string) => void;
  excludeCell?: string;
}

const AGGREGATE_FUNCTIONS = [
  { fn: "AVG_OTHER_FLATS('consumption', 16, '4b', '10a')", desc: "Average consumption excluding listed flats. Use quotes for letter suffixes e.g. '4b'" },
  { fn: "SUM_OTHER_FLATS('consumption', 16, '4b', '10a')", desc: "Sum of consumption excluding listed flats. Use quotes for letter suffixes e.g. '4b'" },
  { fn: "AVG_NONVACANT_FLATS('final_bill')", desc: "Average final bill among non-vacant flats" },
  { fn: "SUM_NONVACANT_FLATS('final_bill')", desc: "Sum of final bills among non-vacant flats" },
  { fn: "COUNT_NONVACANT_FLATS()", desc: "Number of non-vacant flats" },
];

function FormulaReferencePanel({ allCells, results, companyBills, onInsert, excludeCell }: FormulaReferencePanelProps) {
  const [open, setOpen] = useState(true);
  const [fnOpen, setFnOpen] = useState(false);

  // Build virtual bill + pool cells from companyBills (always shown regardless of sheet state)
  const billCellNames = companyBills.flatMap((b) => [
    `bill:${b.bill_number}:cost`,
    `bill:${b.bill_number}:consumption`,
  ]);
  const poolCellNames = companyBills.length > 0 ? ['pool:total_cost', 'pool:total_consumption'] : [];
  const virtualNames = new Set([...billCellNames, ...poolCellNames]);

  // Merge sheet cells with virtual bill/pool cells (virtual ones shown even if not yet in sheet)
  const allCellNames = new Set(allCells.map((c) => c.cell_name));
  const virtualExtras: { cell_name: string; value?: number }[] = [];
  for (const name of virtualNames) {
    if (!allCellNames.has(name)) {
      const b = companyBills.find((b) => name === `bill:${b.bill_number}:cost` || name === `bill:${b.bill_number}:consumption`);
      const value = b
        ? name.endsWith(':cost') ? b.total_amount : b.total_units
        : undefined;
      virtualExtras.push({ cell_name: name, value });
    }
  }

  const grouped: Record<string, { cell_name: string; value?: number }[]> = {};
  const addToGroup = (cellName: string, value?: number) => {
    if (cellName === excludeCell) return;
    const g = getGroup(cellName);
    let key: string;
    if (g === 'flat')      key = `flat:${getFlatNumber(cellName)}`;
    else if (g === 'bill') key = `bill:${getBillNumber(cellName)}`;
    else                   key = g;
    if (!grouped[key]) grouped[key] = [];
    grouped[key].push({ cell_name: cellName, value });
  };

  for (const c of allCells) addToGroup(c.cell_name, results[c.cell_name]);
  for (const v of virtualExtras) addToGroup(v.cell_name, v.value);

  const groupOrder = (k: string) => {
    if (k.startsWith('bill:')) return 0;
    if (k === 'pool')  return 1;
    if (k.startsWith('flat:')) return 2;
    if (k === 'owner') return 3;
    return 4;
  };

  const sortedGroups = Object.keys(grouped).sort((a, b) => {
    const d = groupOrder(a) - groupOrder(b);
    if (d !== 0) return d;
    return a.localeCompare(b);
  });

  function groupLabel(key: string) {
    if (key.startsWith('bill:')) return `Company Bill — ${key.slice(5)}`;
    if (key === 'pool')  return 'Pool Totals';
    if (key.startsWith('flat:')) return `Flat ${key.slice(5)}`;
    if (key === 'owner') return 'Owner';
    return 'Custom';
  }

  return (
    <div className="rounded-lg border border-gray-200 text-xs">
      {/* Cell reference section */}
      <button
        type="button"
        className="w-full flex items-center justify-between px-3 py-2 text-left font-medium text-gray-600 hover:bg-gray-50"
        onClick={() => setOpen((v) => !v)}
      >
        <span>📋 Available cells — click to insert</span>
        {open ? <ChevronDown className="h-3.5 w-3.5" /> : <ChevronRight className="h-3.5 w-3.5" />}
      </button>

      {open && (
        <div className="border-t border-gray-100 max-h-64 overflow-y-auto divide-y divide-gray-50">
          {sortedGroups.map((groupKey) => (
            <div key={groupKey} className="px-3 py-1.5">
              <p className="text-[10px] font-semibold text-gray-400 uppercase tracking-wide mb-1">{groupLabel(groupKey)}</p>
              <div className="flex flex-wrap gap-1">
                {grouped[groupKey].map((c) => (
                  <button
                    key={c.cell_name}
                    type="button"
                    title={c.value !== undefined ? `= ${fmt(c.value)}` : 'no value yet'}
                    className="inline-flex items-center gap-1 bg-blue-50 hover:bg-blue-100 text-blue-700 rounded px-1.5 py-0.5 font-mono text-[11px] border border-blue-100"
                    onClick={() => onInsert(c.cell_name)}
                  >
                    {c.cell_name}
                    {c.value !== undefined && (
                      <span className="text-blue-400 font-sans text-[10px]">= {fmt(c.value)}</span>
                    )}
                  </button>
                ))}
              </div>
            </div>
          ))}
        </div>
      )}

      {/* Aggregate functions section */}
      <button
        type="button"
        className="w-full flex items-center justify-between px-3 py-2 text-left font-medium text-gray-600 hover:bg-gray-50 border-t border-gray-100"
        onClick={() => setFnOpen((v) => !v)}
      >
        <span>ƒ Aggregate functions — click to insert</span>
        {fnOpen ? <ChevronDown className="h-3.5 w-3.5" /> : <ChevronRight className="h-3.5 w-3.5" />}
      </button>

      {fnOpen && (
        <div className="border-t border-gray-100 divide-y divide-gray-50">
          {AGGREGATE_FUNCTIONS.map(({ fn, desc }) => (
            <button
              key={fn}
              type="button"
              className="w-full text-left px-3 py-2 hover:bg-gray-50 flex flex-col gap-0.5"
              onClick={() => onInsert(fn)}
            >
              <code className="font-mono text-[11px] text-blue-700">{fn}</code>
              <span className="text-gray-500 text-[11px]">{desc}</span>
            </button>
          ))}
        </div>
      )}
    </div>
  );
}

// ─── Shared formula save helper ───────────────────────────────────────────────

interface PatchResult {
  error: string | null;
  cells?: SheetCell[];
  results?: Record<string, number>;
  errors?: Record<string, string>;
}

async function patchCell(cycleId: string, cellName: string, mode: 'formula' | 'literal', text: string, value: string): Promise<PatchResult> {
  const body: Record<string, unknown> = { cellName };
  if (mode === 'formula') {
    body.formulaText  = text.trim();
    body.literalValue = null;
  } else {
    body.formulaText  = null;
    body.literalValue = parseFloat(value);
    if (isNaN(body.literalValue as number)) return { error: 'Enter a valid number' };
  }
  const res  = await fetch(`/api/billing/sheet/${cycleId}`, { method: 'PATCH', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify(body) });
  const json = await res.json();
  if (!res.ok || json.error) return { error: json.error ?? 'Failed to save' };
  return { error: null, cells: json.data?.cells, results: json.data?.results, errors: json.data?.errors };
}

// ─── CellEditDialog ───────────────────────────────────────────────────────────

interface CellEditDialogProps {
  cycleId:     string;
  cell:        SheetCell;
  allCells:    SheetCell[];
  results:     Record<string, number>;
  companyBills: CompanyBill[];
  onClose:     () => void;
  onSaved:     (patch: PatchResult) => void;
}

function CellEditDialog({ cycleId, cell, allCells, results, companyBills, onClose, onSaved }: CellEditDialogProps) {
  const isFormula = !!cell.formula_text;
  const [mode, setMode]   = useState<'formula' | 'literal'>(isFormula ? 'formula' : 'literal');
  const [text, setText]   = useState(cell.formula_text ?? '');
  const [value, setValue] = useState(cell.literal_value !== null ? String(cell.literal_value) : '');
  const [saving, setSaving] = useState(false);
  const [error, setError]   = useState('');

  function insertRef(name: string) {
    setText((t) => t ? `${t} ${name}` : name);
  }

  async function save() {
    setSaving(true);
    setError('');
    try {
      const result = await patchCell(cycleId, cell.cell_name, mode, text, value);
      if (result.error) { setError(result.error); return; }
      onSaved(result);
    } catch {
      setError('Network error');
    } finally {
      setSaving(false);
    }
  }

  return (
    <Dialog open onOpenChange={(open) => { if (!open) onClose(); }}>
      <DialogContent className="max-w-xl">
        <DialogHeader>
          <DialogTitle className="flex items-center gap-2 text-sm font-mono">
            <FunctionSquare className="h-4 w-4" /> {cell.cell_name}
          </DialogTitle>
        </DialogHeader>
        <div className="space-y-3">
          <div className="flex items-center gap-4 text-sm">
            <label className="flex items-center gap-1.5 cursor-pointer">
              <input type="radio" checked={mode === 'formula'} onChange={() => setMode('formula')} />
              Formula
            </label>
            <label className="flex items-center gap-1.5 cursor-pointer">
              <input type="radio" checked={mode === 'literal'} onChange={() => setMode('literal')} />
              Fixed value
            </label>
          </div>

          {mode === 'formula' ? (
            <>
              <Textarea
                value={text}
                onChange={(e) => setText(e.target.value)}
                placeholder="e.g. flat:23:consumption * (bill:1:cost / bill:1:consumption)"
                rows={3}
                className="font-mono text-sm"
                autoFocus
              />
              <FormulaReferencePanel
                allCells={allCells}
                results={results}
                companyBills={companyBills}
                onInsert={insertRef}
                excludeCell={cell.cell_name}
              />
            </>
          ) : (
            <Input
              type="number"
              value={value}
              onChange={(e) => setValue(e.target.value)}
              placeholder="0"
              autoFocus
            />
          )}

          {error && <Alert variant="destructive"><AlertDescription>{error}</AlertDescription></Alert>}

          <div className="flex justify-end gap-2">
            <Button variant="outline" size="sm" onClick={onClose}>Cancel</Button>
            <Button size="sm" disabled={saving || (mode === 'formula' && !text.trim()) || (mode === 'literal' && !value.trim())} onClick={save}>
              {saving ? <Loader2 className="h-4 w-4 animate-spin mr-1" /> : null}
              Save & Recalculate
            </Button>
          </div>
        </div>
      </DialogContent>
    </Dialog>
  );
}

// ─── NewCellDialog ────────────────────────────────────────────────────────────

interface NewCellDialogProps {
  cycleId:     string;
  prefixHint:  string;
  allCells:    SheetCell[];
  results:     Record<string, number>;
  companyBills: CompanyBill[];
  onClose:     () => void;
  onSaved:     (patch: PatchResult) => void;
}

function NewCellDialog({ cycleId, prefixHint, allCells, results, companyBills, onClose, onSaved }: NewCellDialogProps) {
  const [name, setName]   = useState(prefixHint);
  const [mode, setMode]   = useState<'formula' | 'literal'>('formula');
  const [text, setText]   = useState('');
  const [value, setValue] = useState('');
  const [saving, setSaving] = useState(false);
  const [error, setError]   = useState('');

  function insertRef(ref: string) {
    setText((t) => t ? `${t} ${ref}` : ref);
  }

  async function save() {
    if (!name.trim()) { setError('Cell name is required'); return; }
    setSaving(true);
    setError('');
    try {
      const result = await patchCell(cycleId, name.trim(), mode, text, value);
      if (result.error) { setError(result.error); return; }
      onSaved(result);
    } catch {
      setError('Network error');
    } finally {
      setSaving(false);
    }
  }

  return (
    <Dialog open onOpenChange={(open) => { if (!open) onClose(); }}>
      <DialogContent className="max-w-xl">
        <DialogHeader>
          <DialogTitle className="flex items-center gap-2">
            <Plus className="h-4 w-4" /> Add Cell
          </DialogTitle>
        </DialogHeader>
        <div className="space-y-3">
          <div>
            <label className="text-xs font-medium text-gray-600 mb-1 block">Cell name</label>
            <Input
              value={name}
              onChange={(e) => setName(e.target.value)}
              placeholder="e.g. bill:1:remaining_cost or pool:rate or flat:1A:final_bill"
              className="font-mono text-sm"
              autoFocus
            />
            <p className="text-xs text-gray-400 mt-1">
              Pattern: <code>flat:N:field</code> · <code>bill:N:field</code> · <code>pool:field</code> · <code>owner:field</code>
            </p>
          </div>

          <div className="flex items-center gap-4 text-sm">
            <label className="flex items-center gap-1.5 cursor-pointer">
              <input type="radio" checked={mode === 'formula'} onChange={() => setMode('formula')} />
              Formula
            </label>
            <label className="flex items-center gap-1.5 cursor-pointer">
              <input type="radio" checked={mode === 'literal'} onChange={() => setMode('literal')} />
              Fixed value
            </label>
          </div>

          {mode === 'formula' ? (
            <>
              <Textarea
                value={text}
                onChange={(e) => setText(e.target.value)}
                placeholder="e.g. flat:1A:consumption * pool:rate"
                rows={3}
                className="font-mono text-sm"
              />
              <FormulaReferencePanel
                allCells={allCells}
                results={results}
                companyBills={companyBills}
                onInsert={insertRef}
              />
            </>
          ) : (
            <Input
              type="number"
              value={value}
              onChange={(e) => setValue(e.target.value)}
              placeholder="0"
            />
          )}

          {error && <Alert variant="destructive"><AlertDescription>{error}</AlertDescription></Alert>}

          <div className="flex justify-end gap-2">
            <Button variant="outline" size="sm" onClick={onClose}>Cancel</Button>
            <Button size="sm" disabled={saving || !name.trim() || (mode === 'formula' && !text.trim()) || (mode === 'literal' && !value.trim())} onClick={save}>
              {saving ? <Loader2 className="h-4 w-4 animate-spin mr-1" /> : null}
              Add & Recalculate
            </Button>
          </div>
        </div>
      </DialogContent>
    </Dialog>
  );
}
