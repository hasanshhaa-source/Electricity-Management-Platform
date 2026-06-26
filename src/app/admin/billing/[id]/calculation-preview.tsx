'use client';

import { useState } from 'react';
import { useRouter } from 'next/navigation';
import { Button } from '@/components/ui/button';
import { Badge } from '@/components/ui/badge';
import { Alert, AlertDescription } from '@/components/ui/alert';
import { Card, CardContent } from '@/components/ui/card';
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from '@/components/ui/select';
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from '@/components/ui/table';
import {
  Calculator, CheckCircle2, AlertTriangle, Loader2,
  SendHorizonal, RefreshCw, ChevronDown, ChevronRight, Download, FunctionSquare,
} from 'lucide-react';
import { BillStatusBadge } from '@/components/shared/status-badge';
import { FormulaEditor } from '@/components/billing/formula-editor';
import type { FlatBillPreview } from '@/services/billing/billingCalculationService';
import type { CycleStatus, BillStatus } from '@/types';

interface CalculationSummary {
  totalBuildingCost:        number;
  totalBuildingConsumption: number;
  costPerUnit:              number;
  sumOfBaseBills:           number;
  difference:               number;
  totalCalculatedDue:       number;
  flatsCalculated:          number;
  flatsWithZeroConsumption: number;
}

interface CalculationPreviewProps {
  cycleId:      string;
  currency:     string;
  cycleStatus:  CycleStatus;
  initialBills: FlatBillPreview[];
}

function fmt(n: number, d = 2) {
  return n.toLocaleString('en', { minimumFractionDigits: d, maximumFractionDigits: d });
}

export function CalculationPreview({
  cycleId, currency, cycleStatus, initialBills,
}: CalculationPreviewProps) {
  const router = useRouter();

  const [bills, setBills]           = useState<FlatBillPreview[]>(initialBills);
  const [summary, setSummary]       = useState<CalculationSummary | null>(null);
  const [warnings, setWarnings]     = useState<string[]>([]);
  const [diffMethod, setDiffMethod] = useState<'proportional' | 'equal'>('proportional');
  const [calculating, setCalculating] = useState(false);
  const [issuing, setIssuing]       = useState(false);
  const [error, setError]           = useState('');
  const [expandedRow, setExpandedRow] = useState<string | null>(null);
  const [formulaBill, setFormulaBill] = useState<FlatBillPreview | null>(null);
  const [togglingExclusion, setTogglingExclusion] = useState<string | null>(null);

  const isIssued = cycleStatus === 'issued' || cycleStatus === 'closed';
  const hasBills = bills.length > 0;
  const hasDraft = bills.some((b) => b.status === 'draft');

  async function calculate() {
    setCalculating(true);
    setError('');
    try {
      const res  = await fetch(`/api/billing/cycles/${cycleId}/calculate`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body:   JSON.stringify({ diff_method: diffMethod }),
      });
      const json = await res.json();
      if (!res.ok || json.error) { setError(json.error ?? 'Calculation failed'); return; }
      setBills(json.data.bills);
      setSummary(json.data.summary);
      setWarnings(json.data.warnings ?? []);
      router.refresh();
    } finally {
      setCalculating(false);
    }
  }

  async function issue() {
    if (!confirm('Issue all draft bills? Tenants will be able to see them. This cannot be undone.')) return;
    setIssuing(true);
    setError('');
    try {
      const res  = await fetch(`/api/billing/cycles/${cycleId}/issue`, { method: 'POST' });
      const json = await res.json();
      if (!res.ok || json.error) { setError(json.error ?? 'Issue failed'); return; }
      router.refresh();
    } finally {
      setIssuing(false);
    }
  }

  async function toggleExclusion(bill: FlatBillPreview) {
    if (!bill.id) return;
    setTogglingExclusion(bill.flatId);
    try {
      const res = await fetch(`/api/billing/bills/${bill.id}/residual-exclusion`, {
        method: 'PATCH',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ excluded: !bill.excludedFromResidual }),
      });
      const json = await res.json();
      if (res.ok && !json.error) {
        setBills((prev) => prev.map((b) => b.flatId === bill.flatId ? { ...b, excludedFromResidual: !b.excludedFromResidual } : b));
      }
    } finally {
      setTogglingExclusion(null);
    }
  }

  const displaySummary = summary ?? (hasBills ? deriveSummary(bills) : null);

  return (
    <div className="space-y-5">
      {/* Controls */}
      {!isIssued && (
        <div className="flex items-center gap-3 flex-wrap">
          <div className="flex items-center gap-2">
            <span className="text-sm text-gray-500">Difference distribution:</span>
            <Select value={diffMethod} onValueChange={(v) => setDiffMethod(v as any)}>
              <SelectTrigger className="w-44 h-8 text-sm">
                <SelectValue />
              </SelectTrigger>
              <SelectContent>
                <SelectItem value="proportional">Proportional (fair)</SelectItem>
                <SelectItem value="equal">Equal split</SelectItem>
              </SelectContent>
            </Select>
          </div>

          <Button size="sm" onClick={calculate} disabled={calculating}>
            {calculating
              ? <><Loader2 className="h-4 w-4 animate-spin" />Calculating…</>
              : hasBills
              ? <><RefreshCw className="h-4 w-4" />Recalculate</>
              : <><Calculator className="h-4 w-4" />Calculate Bills</>
            }
          </Button>

          {hasDraft && (
            <Button size="sm" onClick={issue} disabled={issuing}>
              {issuing
                ? <><Loader2 className="h-4 w-4 animate-spin" />Issuing…</>
                : <><SendHorizonal className="h-4 w-4" />Issue Bills</>
              }
            </Button>
          )}
        </div>
      )}

      {error && <Alert variant="destructive"><AlertDescription>{error}</AlertDescription></Alert>}

      {warnings.length > 0 && (
        <Alert>
          <AlertTriangle className="h-4 w-4" />
          <AlertDescription>
            <ul className="list-disc list-inside space-y-0.5">
              {warnings.map((w, i) => <li key={i} className="text-sm">{w}</li>)}
            </ul>
          </AlertDescription>
        </Alert>
      )}

      {/* Summary */}
      {displaySummary && (
        <div className="grid grid-cols-2 gap-3 sm:grid-cols-4">
          <SummaryCard label={`Total Building Cost (${currency})`}  value={fmt(displaySummary.totalBuildingCost)} />
          <SummaryCard label="Total Consumption (kWh)"              value={fmt(displaySummary.totalBuildingConsumption, 0)} />
          <SummaryCard label={`Rate (${currency}/kWh)`}             value={fmt(displaySummary.costPerUnit, 4)} />
          <SummaryCard
            label="Difference"
            value={`${displaySummary.difference >= 0 ? '+' : ''}${fmt(displaySummary.difference)}`}
            highlight={Math.abs(displaySummary.difference) > 0.01}
          />
        </div>
      )}

      {/* Bills table */}
      {hasBills ? (
        <div className="overflow-x-auto rounded-lg border border-gray-200">
          <Table>
            <TableHeader>
              <TableRow>
                <TableHead className="w-8" />
                <TableHead>Flat</TableHead>
                <TableHead>Tenant</TableHead>
                <TableHead className="text-right">Consumption (kWh)</TableHead>
                <TableHead className="text-right">Rate</TableHead>
                <TableHead className="text-right">Base Bill</TableHead>
                <TableHead className="text-right">Adj.</TableHead>
                <TableHead className="text-right">Prev. Balance</TableHead>
                <TableHead className="text-right font-semibold">Total Due</TableHead>
                <TableHead>Status</TableHead>
                {!isIssued && <TableHead>Custom Calc</TableHead>}
              </TableRow>
            </TableHeader>
            <TableBody>
              {bills.map((bill) => (
                <>
                  <TableRow
                    key={bill.flatId}
                    className="cursor-pointer hover:bg-gray-50"
                    onClick={() => setExpandedRow(expandedRow === bill.flatId ? null : bill.flatId)}
                  >
                    <TableCell>
                      {expandedRow === bill.flatId
                        ? <ChevronDown className="h-3.5 w-3.5 text-gray-400" />
                        : <ChevronRight className="h-3.5 w-3.5 text-gray-400" />}
                    </TableCell>
                    <TableCell className="font-medium">Flat {bill.flatNumber}</TableCell>
                    <TableCell className="text-sm text-gray-700">{bill.tenantName}</TableCell>
                    <TableCell className="text-right font-mono">{fmt(bill.consumption, 3)}</TableCell>
                    <TableCell className="text-right font-mono text-sm">{fmt(bill.ratePerUnit, 4)}</TableCell>
                    <TableCell className="text-right font-mono">{fmt(bill.baseBill)}</TableCell>
                    <TableCell className={`text-right font-mono text-sm ${bill.differenceAdjustment > 0 ? 'text-amber-600' : bill.differenceAdjustment < 0 ? 'text-green-600' : 'text-gray-400'}`}>
                      {bill.differenceAdjustment !== 0
                        ? `${bill.differenceAdjustment > 0 ? '+' : ''}${fmt(bill.differenceAdjustment)}`
                        : '—'}
                    </TableCell>
                    <TableCell className={`text-right font-mono text-sm ${bill.previousBalance > 0 ? 'text-red-600' : 'text-gray-400'}`}>
                      {bill.previousBalance > 0 ? `+${fmt(bill.previousBalance)}` : '—'}
                    </TableCell>
                    <TableCell className="text-right font-mono font-semibold">{fmt(bill.totalDue)}</TableCell>
                    <TableCell>
                      <div className="flex items-center gap-2">
                        <BillStatusBadge status={bill.status as BillStatus} />
                        {bill.id && bill.status !== 'draft' && (
                          <a
                            href={`/api/bills/${bill.id}/pdf`}
                            target="_blank"
                            rel="noopener noreferrer"
                            onClick={(e) => e.stopPropagation()}
                            className="p-1 rounded text-gray-400 hover:text-blue-600 hover:bg-blue-50 transition-colors"
                            title="Download PDF"
                          >
                            <Download className="h-3.5 w-3.5" />
                          </a>
                        )}
                      </div>
                    </TableCell>
                    {!isIssued && (
                      <TableCell onClick={(e) => e.stopPropagation()}>
                        <div className="flex items-center gap-2">
                          <Button
                            size="sm"
                            variant="outline"
                            className={bill.formulaApplied ? 'text-blue-600 border-blue-300' : ''}
                            onClick={() => setFormulaBill(bill)}
                            title={bill.formulaApplied ?? 'Add a custom formula'}
                          >
                            <FunctionSquare className="h-3.5 w-3.5" />
                            {bill.formulaApplied ? 'Formula set' : 'Formula'}
                          </Button>
                          <label className="flex items-center gap-1 text-xs text-gray-500" title="Exclude this flat from the rounding-residual distribution">
                            <input
                              type="checkbox"
                              checked={bill.excludedFromResidual}
                              disabled={togglingExclusion === bill.flatId}
                              onChange={() => toggleExclusion(bill)}
                            />
                            Exclude residual
                          </label>
                        </div>
                      </TableCell>
                    )}
                  </TableRow>

                  {expandedRow === bill.flatId && (
                    <TableRow key={`${bill.flatId}-detail`} className="bg-gray-50">
                      <TableCell colSpan={isIssued ? 10 : 11} className="py-3 px-6">
                        <pre className="text-xs text-gray-600 whitespace-pre-wrap font-mono leading-relaxed">
                          {(bill.calculationLog as any)?.explanation ?? 'No explanation available'}
                        </pre>
                        {bill.lumpSumCharges > 0 && (
                          <p className="text-xs text-purple-600 mt-2">Lump-sum charge: +{fmt(bill.lumpSumCharges)} {currency}</p>
                        )}
                        {((bill.calculationLog as any)?.billGroups as { groupKey: string; cost: number; consumption: number; rate: number }[] | undefined)?.length ? (
                          <div className="mt-2 text-xs text-gray-600">
                            <p className="font-medium text-gray-500">Priced against {((bill.calculationLog as any).billGroups as any[]).length} bill(s):</p>
                            <ul className="list-disc list-inside">
                              {((bill.calculationLog as any).billGroups as { groupKey: string; cost: number; consumption: number; rate: number }[]).map((g) => (
                                <li key={g.groupKey}>Bill {g.groupKey}: rate {fmt(g.rate, 4)} {currency}/kWh (cost {fmt(g.cost)}, consumption {fmt(g.consumption, 0)} kWh)</li>
                              ))}
                            </ul>
                          </div>
                        ) : null}
                        {bill.formulaApplied && (
                          <p className="text-xs text-blue-600 mt-2">Custom formula applied: <code>{bill.formulaApplied}</code></p>
                        )}
                        {bill.version > 1 && (
                          <p className="text-xs text-amber-600 mt-2">Version {bill.version} — recalculated</p>
                        )}
                      </TableCell>
                    </TableRow>
                  )}
                </>
              ))}

              {/* Totals row */}
              <TableRow className="bg-gray-50 font-semibold border-t-2">
                <TableCell colSpan={2} />
                <TableCell className="text-sm text-gray-600">Totals ({bills.length} flats)</TableCell>
                <TableCell className="text-right font-mono">
                  {fmt(bills.reduce((s, b) => s + b.consumption, 0), 3)}
                </TableCell>
                <TableCell />
                <TableCell className="text-right font-mono">
                  {fmt(bills.reduce((s, b) => s + b.baseBill, 0))}
                </TableCell>
                <TableCell className="text-right font-mono">
                  {fmt(bills.reduce((s, b) => s + b.differenceAdjustment, 0))}
                </TableCell>
                <TableCell className="text-right font-mono">
                  {fmt(bills.reduce((s, b) => s + b.previousBalance, 0))}
                </TableCell>
                <TableCell className="text-right font-mono font-bold">
                  {fmt(bills.reduce((s, b) => s + b.totalDue, 0))}
                </TableCell>
                <TableCell />
                {!isIssued && <TableCell />}
              </TableRow>
            </TableBody>
          </Table>
        </div>
      ) : (
        <div className="rounded-lg border border-dashed border-gray-200 py-16 text-center">
          <Calculator className="h-10 w-10 text-gray-300 mx-auto mb-3" />
          <p className="text-sm font-medium text-gray-600">No bills calculated yet</p>
          <p className="text-xs text-gray-400 mt-1">
            Add company bills and meter readings first, then run the calculation.
          </p>
        </div>
      )}

      {isIssued && (
        <p className="text-sm text-gray-500 flex items-center gap-1.5">
          <CheckCircle2 className="h-4 w-4 text-green-500" />
          Bills have been issued and are visible to tenants.
        </p>
      )}

      {formulaBill && (
        <FormulaEditor
          open={!!formulaBill}
          onOpenChange={(open) => { if (!open) setFormulaBill(null); }}
          flatId={formulaBill.flatId}
          flatNumber={formulaBill.flatNumber}
          cycleId={cycleId}
          initialFormula={formulaBill.formulaApplied ?? ''}
          initialScope="persistent"
          onSaved={() => setFormulaBill(null)}
        />
      )}
    </div>
  );
}

function SummaryCard({ label, value, highlight }: { label: string; value: string; highlight?: boolean }) {
  return (
    <div className="rounded-lg border border-gray-100 bg-white p-4 space-y-1">
      <p className="text-xs text-gray-500">{label}</p>
      <p className={`text-lg font-bold tabular-nums ${highlight ? 'text-amber-600' : 'text-gray-900'}`}>{value}</p>
    </div>
  );
}

function deriveSummary(bills: FlatBillPreview[]): CalculationSummary {
  const totalBuildingCost = bills.reduce((s, b) => s + b.baseBill + b.differenceAdjustment, 0);
  const totalConsumption  = bills.reduce((s, b) => s + b.consumption, 0);
  const sumOfBase         = bills.reduce((s, b) => s + b.baseBill, 0);
  const costPerUnit       = totalConsumption > 0 ? totalBuildingCost / totalConsumption : 0;
  return {
    totalBuildingCost,
    totalBuildingConsumption: totalConsumption,
    costPerUnit,
    sumOfBaseBills:           sumOfBase,
    difference:               bills.reduce((s, b) => s + b.differenceAdjustment, 0),
    totalCalculatedDue:       bills.reduce((s, b) => s + b.totalDue, 0),
    flatsCalculated:          bills.length,
    flatsWithZeroConsumption: bills.filter((b) => b.consumption === 0).length,
  };
}
