'use client';

import { useState } from 'react';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { CheckCircle2, AlertTriangle, Loader2 } from 'lucide-react';
import type { MeterReadingRow } from '@/services/billing/readingService';

interface RowState {
  currentValue:   string;
  readingDate:    string;
  notes:          string;
  overrideReason: string;
  status:         'idle' | 'dirty' | 'saving' | 'saved' | 'error';
  error:          string | null;
}

interface FieldReadingsFormProps {
  token:        string;
  cycleId:      string;
  periodYear:   number;
  periodMonth:  number;
  rows:         MeterReadingRow[];
}

export function FieldReadingsForm({ token, cycleId, periodYear, periodMonth, rows }: FieldReadingsFormProps) {
  const today = new Date().toISOString().split('T')[0];

  const [rowStates, setRowStates] = useState<Record<string, RowState>>(() => {
    const init: Record<string, RowState> = {};
    for (const row of rows) {
      init[row.meterId] = {
        currentValue:   row.currentReading ? String(row.currentReading.value) : '',
        readingDate:    row.currentReading?.date ?? today,
        notes:          row.currentReading?.notes ?? '',
        overrideReason: row.currentReading?.overrideReason ?? '',
        status:         row.currentReading ? 'saved' : 'idle',
        error:          null,
      };
    }
    return init;
  });

  function setField(meterId: string, field: keyof RowState, value: string) {
    setRowStates((prev) => ({
      ...prev,
      [meterId]: { ...prev[meterId], [field]: value, status: 'dirty', error: null },
    }));
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
      setRowStates((prev) => ({ ...prev, [meterId]: { ...prev[meterId], error: 'Reading is lower than last month — add a short note explaining why', status: 'error' } }));
      return;
    }

    setRowStates((prev) => ({ ...prev, [meterId]: { ...prev[meterId], status: 'saving', error: null } }));

    try {
      const res = await fetch(`/api/field/readings/${token}`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          meter_id:             meterId,
          cycle_id:             cycleId,
          reading_value:        curr,
          reading_date:         state.readingDate,
          billing_period_year:  periodYear,
          billing_period_month: periodMonth,
          reading_type:         'actual',
          override_reason:      state.overrideReason || null,
          notes:                state.notes || null,
        }),
      });
      const json = await res.json();

      if (!res.ok || json.error) {
        setRowStates((prev) => ({ ...prev, [meterId]: { ...prev[meterId], status: 'error', error: json.error ?? 'Save failed' } }));
      } else {
        setRowStates((prev) => ({ ...prev, [meterId]: { ...prev[meterId], status: 'saved', error: null } }));
      }
    } catch {
      setRowStates((prev) => ({ ...prev, [meterId]: { ...prev[meterId], status: 'error', error: 'Network error — check your connection and try again' } }));
    }
  }

  const savedCount = rows.filter((r) => rowStates[r.meterId]?.status === 'saved').length;

  return (
    <div className="space-y-4">
      <p className="text-sm text-gray-600">{savedCount} of {rows.length} meters recorded</p>

      <div className="space-y-3">
        {rows.map((row) => {
          const state = rowStates[row.meterId];
          const needsOv = needsOverride(row.meterId);

          return (
            <div key={row.meterId} className="rounded-lg border border-gray-200 bg-white p-4 space-y-3">
              <div className="flex items-center justify-between">
                <div>
                  <p className="font-semibold text-gray-900">Meter {row.meterNumber}</p>
                  <p className="text-xs text-gray-500">{row.linkedFlats} · {row.meterType}</p>
                </div>
                {state.status === 'saved'  && <CheckCircle2 className="h-5 w-5 text-green-500" />}
                {state.status === 'error'  && <AlertTriangle className="h-5 w-5 text-red-500" />}
              </div>

              {row.previousReading && (
                <p className="text-xs text-gray-400">
                  Previous reading: <span className="font-mono">{row.previousReading.value.toLocaleString()}</span> {row.unit}
                </p>
              )}

              <div className="grid grid-cols-2 gap-3">
                <div>
                  <label className="text-xs text-gray-500">Current reading</label>
                  <Input
                    type="number"
                    step="0.001"
                    min="0"
                    placeholder="0.000"
                    value={state.currentValue}
                    onChange={(e) => setField(row.meterId, 'currentValue', e.target.value)}
                    className={['font-mono mt-1', state.status === 'error' ? 'border-red-400' : ''].join(' ')}
                  />
                </div>
                <div>
                  <label className="text-xs text-gray-500">Date</label>
                  <Input
                    type="date"
                    value={state.readingDate}
                    onChange={(e) => setField(row.meterId, 'readingDate', e.target.value)}
                    className="mt-1"
                  />
                </div>
              </div>

              {needsOv && (
                <div>
                  <label className="text-xs text-amber-700">Lower than last month — explain why</label>
                  <Input
                    type="text"
                    placeholder="e.g. Meter replaced"
                    value={state.overrideReason}
                    onChange={(e) => setField(row.meterId, 'overrideReason', e.target.value)}
                    className="mt-1 border-amber-300 focus-visible:ring-amber-400"
                  />
                </div>
              )}

              {state.error && <p className="text-xs text-red-600">{state.error}</p>}

              <Button
                size="sm"
                className="w-full"
                disabled={!state.currentValue || state.status === 'saving'}
                onClick={() => saveRow(row.meterId)}
              >
                {state.status === 'saving' ? <Loader2 className="h-4 w-4 animate-spin" /> : null}
                {state.status === 'saved' ? 'Saved — Update' : 'Save Reading'}
              </Button>
            </div>
          );
        })}

        {rows.length === 0 && (
          <p className="text-center text-sm text-gray-400 py-10">No active meters found for this building.</p>
        )}
      </div>
    </div>
  );
}
