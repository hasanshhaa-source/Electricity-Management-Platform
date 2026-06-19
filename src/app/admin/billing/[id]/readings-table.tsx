'use client';

import { useState, useEffect } from 'react';
import { useRouter } from 'next/navigation';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Badge } from '@/components/ui/badge';
import { Alert, AlertDescription } from '@/components/ui/alert';
import { CheckCircle2, AlertTriangle, Minus, Loader2, Save, ChevronRight } from 'lucide-react';
import type { MeterReadingRow } from '@/services/billing/readingService';
import type { CycleStatus } from '@/types';

interface RowState {
  currentValue:   string;
  readingDate:    string;
  notes:          string;
  overrideReason: string;
  readingType:    'actual' | 'estimated' | 'opening';
  existingId:     string | null;
  status:         'idle' | 'dirty' | 'saving' | 'saved' | 'error';
  error:          string | null;
}

interface ReadingsTableProps {
  cycleId:      string;
  buildingId:   string;
  periodYear:   number;
  periodMonth:  number;
  cycleStatus:  CycleStatus;
  rows:         MeterReadingRow[];
}

const MONTH_NAMES = ['Jan', 'Feb', 'Mar', 'Apr', 'May', 'Jun', 'Jul', 'Aug', 'Sep', 'Oct', 'Nov', 'Dec'];

function formatPeriod(year: number, month: number) {
  return `${MONTH_NAMES[month - 1]} ${year}`;
}

export function ReadingsTable({ cycleId, periodYear, periodMonth, cycleStatus, rows }: ReadingsTableProps) {
  const router = useRouter();
  const today = new Date().toISOString().split('T')[0];
  const isLocked = cycleStatus !== 'draft' && cycleStatus !== 'readings_collected';

  const [rowStates, setRowStates] = useState<Record<string, RowState>>(() => {
    const init: Record<string, RowState> = {};
    for (const row of rows) {
      const cr = row.currentReading;
      init[row.meterId] = {
        currentValue:   cr ? String(cr.value) : '',
        readingDate:    cr?.date ?? today,
        notes:          cr?.notes ?? '',
        overrideReason: cr?.overrideReason ?? '',
        readingType:    (cr?.readingType as any) ?? 'actual',
        existingId:     cr?.id ?? null,
        status:         cr ? 'saved' : 'idle',
        error:          null,
      };
    }
    return init;
  });

  const [advancingStatus, setAdvancingStatus] = useState(false);
  const [statusError, setStatusError] = useState('');

  function setField(meterId: string, field: keyof RowState, value: string) {
    setRowStates((prev) => ({
      ...prev,
      [meterId]: { ...prev[meterId], [field]: value, status: 'dirty', error: null },
    }));
  }

  function consumption(meterId: string): number | null {
    const row = rows.find((r) => r.meterId === meterId);
    const state = rowStates[meterId];
    const curr = parseFloat(state?.currentValue ?? '');
    if (isNaN(curr) || row?.previousReading == null) return null;
    return Math.round((curr - row.previousReading.value) * 1000) / 1000;
  }

  function needsOverride(meterId: string): boolean {
    const row = rows.find((r) => r.meterId === meterId);
    const state = rowStates[meterId];
    const curr = parseFloat(state?.currentValue ?? '');
    if (isNaN(curr) || !row?.previousReading) return false;
    return curr < row.previousReading.value;
  }

  async function saveRow(meterId: string) {
    const state = rowStates[meterId];
    const curr = parseFloat(state.currentValue);
    if (isNaN(curr)) {
      setRowStates((prev) => ({ ...prev, [meterId]: { ...prev[meterId], error: 'Enter a valid reading value', status: 'error' } }));
      return;
    }
    if (needsOverride(meterId) && !state.overrideReason.trim()) {
      setRowStates((prev) => ({ ...prev, [meterId]: { ...prev[meterId], error: 'Override reason is required when current reading is lower than previous', status: 'error' } }));
      return;
    }

    setRowStates((prev) => ({ ...prev, [meterId]: { ...prev[meterId], status: 'saving', error: null } }));

    try {
      const res = await fetch('/api/billing/readings', {
        method:  'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          meter_id:             meterId,
          cycle_id:             cycleId,
          reading_value:        curr,
          reading_date:         state.readingDate,
          billing_period_year:  periodYear,
          billing_period_month: periodMonth,
          reading_type:         state.readingType,
          override_reason:      state.overrideReason || null,
          notes:                state.notes || null,
        }),
      });
      const json = await res.json();

      if (!res.ok || json.error) {
        setRowStates((prev) => ({ ...prev, [meterId]: { ...prev[meterId], status: 'error', error: json.error ?? 'Save failed' } }));
      } else {
        setRowStates((prev) => ({
          ...prev,
          [meterId]: { ...prev[meterId], status: 'saved', error: null, existingId: json.data?.id ?? prev[meterId].existingId },
        }));
      }
    } catch {
      setRowStates((prev) => ({ ...prev, [meterId]: { ...prev[meterId], status: 'error', error: 'Network error' } }));
    }
  }

  async function saveAll() {
    const dirty = rows.filter((r) => rowStates[r.meterId]?.status === 'dirty' || (rowStates[r.meterId]?.status === 'idle' && rowStates[r.meterId]?.currentValue));
    for (const row of dirty) {
      await saveRow(row.meterId);
    }
  }

  async function advanceStatus(newStatus: CycleStatus) {
    setAdvancingStatus(true);
    setStatusError('');
    try {
      const res = await fetch(`/api/billing/cycles/${cycleId}`, {
        method:  'PATCH',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ status: newStatus }),
      });
      const json = await res.json();
      if (!res.ok || json.error) {
        setStatusError(json.error ?? 'Failed to update status');
      } else {
        router.refresh();
      }
    } catch {
      setStatusError('Network error');
    } finally {
      setAdvancingStatus(false);
    }
  }

  const savedCount = rows.filter((r) => rowStates[r.meterId]?.status === 'saved').length;
  const totalCount = rows.length;
  const allSaved   = savedCount === totalCount && totalCount > 0;
  const progress   = totalCount > 0 ? Math.round((savedCount / totalCount) * 100) : 0;
  const hasDirty   = rows.some((r) => rowStates[r.meterId]?.status === 'dirty');
  const isSaving   = rows.some((r) => rowStates[r.meterId]?.status === 'saving');

  useEffect(() => {
    if (!hasDirty) return;
    function handleBeforeUnload(e: BeforeUnloadEvent) {
      e.preventDefault();
      e.returnValue = '';
    }
    window.addEventListener('beforeunload', handleBeforeUnload);
    return () => window.removeEventListener('beforeunload', handleBeforeUnload);
  }, [hasDirty]);

  const NEXT_STATUS: Partial<Record<CycleStatus, CycleStatus>> = {
    draft:              'readings_collected',
    readings_collected: 'bills_imported',
    bills_imported:     'calculated',
    calculated:         'issued',
    issued:             'closed',
  };
  const nextStatus = NEXT_STATUS[cycleStatus];

  return (
    <div className="space-y-4">
      {/* Progress bar */}
      <div className="space-y-1.5">
        <div className="flex items-center justify-between text-sm">
          <span className="text-gray-600">
            {savedCount} of {totalCount} meter{totalCount !== 1 ? 's' : ''} recorded
          </span>
          <span className="font-medium text-gray-900">{progress}%</span>
        </div>
        <div className="h-2 rounded-full bg-gray-100 overflow-hidden">
          <div
            className="h-full rounded-full bg-blue-500 transition-all duration-300"
            style={{ width: `${progress}%` }}
          />
        </div>
      </div>

      {statusError && (
        <Alert variant="destructive">
          <AlertDescription>{statusError}</AlertDescription>
        </Alert>
      )}

      {/* Action bar */}
      {!isLocked && (
        <div className="flex items-center gap-3 flex-wrap">
          <Button
            size="sm"
            variant="outline"
            disabled={!hasDirty || isSaving}
            onClick={saveAll}
          >
            {isSaving ? <Loader2 className="h-4 w-4 animate-spin" /> : <Save className="h-4 w-4" />}
            Save All Changes
          </Button>
          {nextStatus && (
            <Button
              size="sm"
              disabled={advancingStatus || (!allSaved && nextStatus === 'readings_collected')}
              onClick={() => advanceStatus(nextStatus)}
              title={!allSaved && nextStatus === 'readings_collected' ? 'All meters must have readings' : undefined}
            >
              {advancingStatus ? <Loader2 className="h-4 w-4 animate-spin" /> : <ChevronRight className="h-4 w-4" />}
              Mark as {nextStatus.replace(/_/g, ' ').replace(/\b\w/g, (c) => c.toUpperCase())}
            </Button>
          )}
        </div>
      )}

      {/* Table */}
      <div className="overflow-x-auto rounded-lg border border-gray-200">
        <table className="min-w-full divide-y divide-gray-200 text-sm">
          <thead className="bg-gray-50">
            <tr>
              <th className="px-4 py-3 text-left font-medium text-gray-600 whitespace-nowrap">Meter</th>
              <th className="px-4 py-3 text-left font-medium text-gray-600 whitespace-nowrap">Linked Flat(s)</th>
              <th className="px-4 py-3 text-right font-medium text-gray-600 whitespace-nowrap">Prev Reading</th>
              <th className="px-4 py-3 text-right font-medium text-gray-600 whitespace-nowrap">Current Reading</th>
              <th className="px-4 py-3 text-right font-medium text-gray-600 whitespace-nowrap">Consumption</th>
              <th className="px-4 py-3 text-left font-medium text-gray-600 whitespace-nowrap">Date</th>
              <th className="px-4 py-3 text-left font-medium text-gray-600 whitespace-nowrap">Notes</th>
              <th className="px-4 py-3 text-center font-medium text-gray-600 whitespace-nowrap">Status</th>
              {!isLocked && <th className="px-4 py-3" />}
            </tr>
          </thead>
          <tbody className="divide-y divide-gray-100 bg-white">
            {rows.map((row) => {
              const state   = rowStates[row.meterId];
              const cons    = consumption(row.meterId);
              const needsOv = needsOverride(row.meterId);
              const isNew   = !state.existingId && state.status !== 'saved';

              return (
                <>
                  <tr key={row.meterId} className={state.status === 'error' ? 'bg-red-50' : undefined}>
                    {/* Meter */}
                    <td className="px-4 py-3 whitespace-nowrap">
                      <p className="font-medium text-gray-900">{row.meterNumber}</p>
                      <p className="text-xs text-gray-400 capitalize">{row.meterType}</p>
                    </td>

                    {/* Linked flats */}
                    <td className="px-4 py-3 text-gray-600">{row.linkedFlats}</td>

                    {/* Previous reading */}
                    <td className="px-4 py-3 text-right">
                      {row.previousReading ? (
                        <div>
                          <p className="font-mono font-medium text-gray-900">
                            {row.previousReading.value.toLocaleString()}
                          </p>
                          <p className="text-xs text-gray-400">
                            {formatPeriod(row.previousReading.year, row.previousReading.month)}
                          </p>
                        </div>
                      ) : (
                        <span className="text-gray-400 text-xs">No prior reading</span>
                      )}
                    </td>

                    {/* Current reading input */}
                    <td className="px-4 py-3">
                      <Input
                        type="number"
                        step="0.001"
                        min="0"
                        placeholder="0.000"
                        disabled={isLocked}
                        value={state.currentValue}
                        onChange={(e) => setField(row.meterId, 'currentValue', e.target.value)}
                        className={[
                          'w-32 text-right font-mono',
                          needsOv ? 'border-amber-400 focus-visible:ring-amber-400' : '',
                          state.status === 'error' ? 'border-red-400' : '',
                        ].join(' ')}
                      />
                    </td>

                    {/* Consumption */}
                    <td className="px-4 py-3 text-right">
                      {cons !== null ? (
                        <span className={['font-mono font-medium', cons < 0 ? 'text-red-600' : 'text-gray-900'].join(' ')}>
                          {cons >= 0 ? '+' : ''}{cons.toLocaleString()} {row.unit}
                        </span>
                      ) : (
                        <span className="text-gray-300">—</span>
                      )}
                    </td>

                    {/* Reading date */}
                    <td className="px-4 py-3">
                      <Input
                        type="date"
                        disabled={isLocked}
                        value={state.readingDate}
                        onChange={(e) => setField(row.meterId, 'readingDate', e.target.value)}
                        className="w-36 text-sm"
                      />
                    </td>

                    {/* Notes */}
                    <td className="px-4 py-3">
                      <Input
                        type="text"
                        placeholder="Optional"
                        disabled={isLocked}
                        value={state.notes}
                        onChange={(e) => setField(row.meterId, 'notes', e.target.value)}
                        className="w-40 text-sm"
                      />
                    </td>

                    {/* Status icon */}
                    <td className="px-4 py-3 text-center">
                      {state.status === 'saving' && <Loader2 className="h-4 w-4 animate-spin text-blue-500 mx-auto" />}
                      {state.status === 'saved'  && <CheckCircle2 className="h-4 w-4 text-green-500 mx-auto" />}
                      {state.status === 'error'  && <AlertTriangle className="h-4 w-4 text-red-500 mx-auto" />}
                      {(state.status === 'idle' || state.status === 'dirty') && (
                        state.currentValue
                          ? <Badge variant="warning" className="text-xs">Unsaved</Badge>
                          : <Minus className="h-4 w-4 text-gray-300 mx-auto" />
                      )}
                    </td>

                    {/* Save button */}
                    {!isLocked && (
                      <td className="px-4 py-3 text-right">
                        <Button
                          size="sm"
                          variant="outline"
                          disabled={!state.currentValue || state.status === 'saving'}
                          onClick={() => saveRow(row.meterId)}
                        >
                          {state.status === 'saving' ? <Loader2 className="h-3 w-3 animate-spin" /> : 'Save'}
                        </Button>
                      </td>
                    )}
                  </tr>

                  {/* Override reason row */}
                  {!isLocked && needsOv && (
                    <tr key={`${row.meterId}-override`} className="bg-amber-50">
                      <td colSpan={isLocked ? 7 : 8} className="px-4 py-2">
                        <div className="flex items-center gap-2">
                          <AlertTriangle className="h-4 w-4 text-amber-500 flex-shrink-0" />
                          <span className="text-xs text-amber-700 font-medium">
                            Current reading is lower than previous — override reason required:
                          </span>
                          <Input
                            type="text"
                            placeholder="e.g. Meter replaced, reading reset to zero"
                            value={state.overrideReason}
                            onChange={(e) => setField(row.meterId, 'overrideReason', e.target.value)}
                            className="flex-1 text-sm border-amber-300 focus-visible:ring-amber-400"
                          />
                        </div>
                      </td>
                      {!isLocked && <td />}
                    </tr>
                  )}

                  {/* Error row */}
                  {state.error && (
                    <tr key={`${row.meterId}-err`} className="bg-red-50">
                      <td colSpan={isLocked ? 7 : 9} className="px-4 py-1.5">
                        <p className="text-xs text-red-600">{state.error}</p>
                      </td>
                    </tr>
                  )}
                </>
              );
            })}

            {rows.length === 0 && (
              <tr>
                <td colSpan={isLocked ? 7 : 9} className="px-4 py-12 text-center text-gray-400 text-sm">
                  No active meters found for this building.
                </td>
              </tr>
            )}
          </tbody>
        </table>
      </div>

      {isLocked && (
        <p className="text-sm text-gray-500">
          Readings are locked for editing in the <strong>{cycleStatus.replace(/_/g, ' ')}</strong> status.
        </p>
      )}
    </div>
  );
}
