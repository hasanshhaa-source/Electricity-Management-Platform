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
  RefreshCw, Lock, Edit2, Trash2,
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

interface SheetData {
  sheet:   SheetRow;
  cells:   SheetCell[];
  results: Record<string, number>;
  errors:  Record<string, string>;
}

interface SpreadsheetEditorProps {
  cycleId:     string;
  currency:    string;
  cycleStatus: CycleStatus;
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

export function SpreadsheetEditor({ cycleId, currency, cycleStatus }: SpreadsheetEditorProps) {
  const [data, setData]         = useState<SheetData | null>(null);
  const [loading, setLoading]   = useState(true);
  const [error, setError]       = useState('');
  const [editing, setEditing]   = useState<SheetCell | null>(null);
  const [addingToGroup, setAddingToGroup] = useState<string | null>(null); // prefix hint
  const [publishing, setPublishing] = useState(false);
  const [publishError, setPublishError] = useState('');

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
          onClose={() => setEditing(null)}
          onSaved={async () => { setEditing(null); await load(); }}
        />
      )}

      {/* New cell dialog */}
      {addingToGroup !== null && (
        <NewCellDialog
          cycleId={cycleId}
          prefixHint={addingToGroup}
          onClose={() => setAddingToGroup(null)}
          onSaved={async () => { setAddingToGroup(null); await load(); }}
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
}

function GroupTable({ groupKey, label, cells, results, errors, isLocked, onEdit, onAddCell }: GroupTableProps) {
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
                      <Button variant="ghost" size="sm" className="h-6 w-6 p-0" onClick={() => onEdit(c)}>
                        <Edit2 className="h-3 w-3 text-gray-400" />
                      </Button>
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

// ─── CellEditDialog ───────────────────────────────────────────────────────────

interface CellEditDialogProps {
  cycleId:  string;
  cell:     SheetCell;
  onClose:  () => void;
  onSaved:  () => void;
}

function CellEditDialog({ cycleId, cell, onClose, onSaved }: CellEditDialogProps) {
  const isFormula   = !!cell.formula_text;
  const [mode, setMode]   = useState<'formula' | 'literal'>(isFormula ? 'formula' : 'literal');
  const [text, setText]   = useState(cell.formula_text ?? '');
  const [value, setValue] = useState(cell.literal_value !== null ? String(cell.literal_value) : '');
  const [saving, setSaving] = useState(false);
  const [error, setError]   = useState('');

  async function save() {
    setSaving(true);
    setError('');
    try {
      const body: Record<string, unknown> = { cellName: cell.cell_name };
      if (mode === 'formula') {
        body.formulaText = text.trim();
        body.literalValue = null;
      } else {
        body.formulaText  = null;
        body.literalValue = parseFloat(value);
        if (isNaN(body.literalValue as number)) { setError('Enter a valid number'); setSaving(false); return; }
      }
      const res  = await fetch(`/api/billing/sheet/${cycleId}`, { method: 'PATCH', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify(body) });
      const json = await res.json();
      if (!res.ok || json.error) { setError(json.error ?? 'Failed to save'); return; }
      onSaved();
    } catch {
      setError('Network error');
    } finally {
      setSaving(false);
    }
  }

  return (
    <Dialog open onOpenChange={(open) => { if (!open) onClose(); }}>
      <DialogContent className="max-w-lg">
        <DialogHeader>
          <DialogTitle className="flex items-center gap-2 text-sm font-mono">
            <FunctionSquare className="h-4 w-4" /> {cell.cell_name}
          </DialogTitle>
        </DialogHeader>
        <div className="space-y-4">
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
              <p className="text-xs text-gray-500">
                Reference other cells by their full name (e.g. <code>flat:23:bill</code>,
                <code>pool:rate</code>). Use arithmetic, IF(), AVG_OTHER_FLATS(),
                SUM_NONVACANT_FLATS(), COUNT_NONVACANT_FLATS() and other sheet functions.
              </p>
              <Textarea
                value={text}
                onChange={(e) => setText(e.target.value)}
                placeholder="e.g. flat:23:dedicated_consumption * (bill:1:cost / bill:1:consumption)"
                rows={4}
                className="font-mono text-sm"
                autoFocus
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
  cycleId:    string;
  prefixHint: string;
  onClose:    () => void;
  onSaved:    () => void;
}

function NewCellDialog({ cycleId, prefixHint, onClose, onSaved }: NewCellDialogProps) {
  const [name, setName]   = useState(prefixHint);
  const [mode, setMode]   = useState<'formula' | 'literal'>('formula');
  const [text, setText]   = useState('');
  const [value, setValue] = useState('');
  const [saving, setSaving] = useState(false);
  const [error, setError]   = useState('');

  async function save() {
    if (!name.trim()) { setError('Cell name is required'); return; }
    setSaving(true);
    setError('');
    try {
      const body: Record<string, unknown> = { cellName: name.trim() };
      if (mode === 'formula') {
        body.formulaText  = text.trim();
        body.literalValue = null;
      } else {
        body.formulaText  = null;
        body.literalValue = parseFloat(value);
        if (isNaN(body.literalValue as number)) { setError('Enter a valid number'); setSaving(false); return; }
      }
      const res  = await fetch(`/api/billing/sheet/${cycleId}`, { method: 'PATCH', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify(body) });
      const json = await res.json();
      if (!res.ok || json.error) { setError(json.error ?? 'Failed to create cell'); return; }
      onSaved();
    } catch {
      setError('Network error');
    } finally {
      setSaving(false);
    }
  }

  return (
    <Dialog open onOpenChange={(open) => { if (!open) onClose(); }}>
      <DialogContent className="max-w-lg">
        <DialogHeader>
          <DialogTitle className="flex items-center gap-2">
            <Plus className="h-4 w-4" /> Add Cell
          </DialogTitle>
        </DialogHeader>
        <div className="space-y-4">
          <div>
            <label className="text-xs font-medium text-gray-600 mb-1 block">Cell name</label>
            <Input
              value={name}
              onChange={(e) => setName(e.target.value)}
              placeholder="e.g. bill:1:remaining_cost or pool:discrepancy"
              className="font-mono text-sm"
              autoFocus
            />
            <p className="text-xs text-gray-400 mt-1">
              Use colon-delimited names: <code>flat:N:field</code>, <code>bill:N:field</code>, <code>pool:field</code>, <code>owner:field</code>.
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
            <Textarea
              value={text}
              onChange={(e) => setText(e.target.value)}
              placeholder="e.g. bill:1:cost - flat:23:bill"
              rows={3}
              className="font-mono text-sm"
            />
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
