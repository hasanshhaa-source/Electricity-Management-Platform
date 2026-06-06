'use client';

import { useState, useEffect } from 'react';
import { useRouter } from 'next/navigation';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Alert, AlertDescription } from '@/components/ui/alert';
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card';
import { Badge } from '@/components/ui/badge';
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from '@/components/ui/select';
import { Plus, Trash2, AlertTriangle, CheckCircle2 } from 'lucide-react';
import { createClient } from '@/lib/supabase/client';
import type { Flat } from '@/types';

interface AllocationRow {
  flat_id: string;
  share_percent: number;
  effective_from: string;
}

interface AllocationEditorProps {
  meterId: string;
  buildingId: string;
  meterNumber: string;
  initialAllocations?: { flat_id: string; share_percent: number; flat: { flat_number: string; floor: number | null } }[];
}

export function AllocationEditor({
  meterId,
  buildingId,
  meterNumber,
  initialAllocations = [],
}: AllocationEditorProps) {
  const router = useRouter();
  const today = new Date().toISOString().split('T')[0];
  const [rows, setRows] = useState<AllocationRow[]>(
    initialAllocations.length > 0
      ? initialAllocations.map((a) => ({ flat_id: a.flat_id, share_percent: a.share_percent, effective_from: today }))
      : [{ flat_id: '', share_percent: 50, effective_from: today }]
  );
  const [buildingFlats, setBuildingFlats] = useState<Flat[]>([]);
  const [loading, setLoading] = useState(false);
  const [serverError, setServerError] = useState('');
  const [success, setSuccess] = useState(false);

  const total = rows.reduce((s, r) => s + (Number(r.share_percent) || 0), 0);
  const isValid = Math.abs(total - 100) <= 0.01 && rows.every((r) => r.flat_id);
  const hasDuplicates = new Set(rows.map((r) => r.flat_id).filter(Boolean)).size !== rows.filter((r) => r.flat_id).length;

  useEffect(() => {
    const supabase = createClient();
    supabase.from('flats').select('id, flat_number, floor').eq('building_id', buildingId)
      .is('deleted_at', null).eq('is_active', true).order('flat_number')
      .then(({ data }) => setBuildingFlats(data as Flat[] ?? []));
  }, [buildingId]);

  function addRow() {
    setRows((prev) => [...prev, { flat_id: '', share_percent: 0, effective_from: today }]);
  }

  function removeRow(index: number) {
    setRows((prev) => prev.filter((_, i) => i !== index));
  }

  function updateRow(index: number, field: keyof AllocationRow, value: string | number) {
    setRows((prev) => prev.map((r, i) => i === index ? { ...r, [field]: value } : r));
  }

  function distributeEvenly() {
    const pct = +(100 / rows.length).toFixed(2);
    const adjusted = rows.map((r, i) => ({
      ...r,
      share_percent: i === rows.length - 1 ? +(100 - pct * (rows.length - 1)).toFixed(2) : pct,
    }));
    setRows(adjusted);
  }

  async function handleSave() {
    if (!isValid || hasDuplicates) return;
    setLoading(true);
    setServerError('');
    setSuccess(false);

    const res = await fetch(`/api/meters/${meterId}/allocations`, {
      method: 'PUT',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ allocations: rows }),
    });
    const json = await res.json();

    if (!res.ok || json.error) {
      setServerError(json.error ?? 'Failed to save allocations');
      setLoading(false);
      return;
    }

    setSuccess(true);
    setLoading(false);
    router.refresh();
  }

  const getFlatLabel = (flat: Flat) =>
    `Flat ${flat.flat_number}${flat.floor != null ? ` (Floor ${flat.floor})` : ''}`;

  return (
    <Card>
      <CardHeader>
        <div className="flex items-center justify-between">
          <CardTitle>Shared Allocation — Meter {meterNumber}</CardTitle>
          <Badge variant={Math.abs(total - 100) <= 0.01 ? 'success' : 'destructive'}>
            Total: {total.toFixed(2)}%
          </Badge>
        </div>
      </CardHeader>
      <CardContent className="space-y-4">
        {serverError && <Alert variant="destructive"><AlertDescription>{serverError}</AlertDescription></Alert>}
        {success && (
          <Alert variant="success">
            <CheckCircle2 className="h-4 w-4" />
            <AlertDescription>Allocations saved successfully</AlertDescription>
          </Alert>
        )}
        {hasDuplicates && (
          <Alert variant="warning">
            <AlertTriangle className="h-4 w-4" />
            <AlertDescription>Each flat can only appear once in the allocation</AlertDescription>
          </Alert>
        )}

        <div className="space-y-3">
          {rows.map((row, index) => (
            <div key={index} className="flex items-center gap-3">
              <div className="flex-1">
                <Select value={row.flat_id} onValueChange={(v) => updateRow(index, 'flat_id', v)}>
                  <SelectTrigger>
                    <SelectValue placeholder="Select flat" />
                  </SelectTrigger>
                  <SelectContent>
                    {buildingFlats.map((f) => (
                      <SelectItem key={f.id} value={f.id}>{getFlatLabel(f)}</SelectItem>
                    ))}
                  </SelectContent>
                </Select>
              </div>

              <div className="flex items-center gap-2 w-32">
                <Input
                  type="number"
                  min={0.01}
                  max={100}
                  step={0.01}
                  value={row.share_percent}
                  onChange={(e) => updateRow(index, 'share_percent', parseFloat(e.target.value) || 0)}
                  className="text-right"
                />
                <span className="text-sm text-gray-500 w-4">%</span>
              </div>

              <button
                type="button"
                onClick={() => removeRow(index)}
                disabled={rows.length <= 1}
                className="p-1.5 text-gray-400 hover:text-red-500 disabled:opacity-30 disabled:cursor-not-allowed"
              >
                <Trash2 className="h-4 w-4" />
              </button>
            </div>
          ))}
        </div>

        {/* Total bar */}
        <div className="rounded-lg bg-gray-50 p-3">
          <div className="flex items-center justify-between text-sm">
            <span className="text-gray-500">Total allocation</span>
            <span className={`font-semibold ${Math.abs(total - 100) <= 0.01 ? 'text-green-600' : 'text-red-600'}`}>
              {total.toFixed(2)}% {Math.abs(total - 100) <= 0.01 ? '✓' : `(needs ${(100 - total).toFixed(2)}% more)`}
            </span>
          </div>
          <div className="mt-2 h-2 w-full rounded-full bg-gray-200 overflow-hidden">
            <div
              className={`h-full rounded-full transition-all ${Math.abs(total - 100) <= 0.01 ? 'bg-green-500' : total > 100 ? 'bg-red-500' : 'bg-blue-500'}`}
              style={{ width: `${Math.min(total, 100)}%` }}
            />
          </div>
        </div>

        <div className="flex gap-2">
          <Button type="button" variant="outline" size="sm" onClick={addRow}>
            <Plus className="h-4 w-4" /> Add Flat
          </Button>
          <Button type="button" variant="secondary" size="sm" onClick={distributeEvenly}>
            Distribute Evenly
          </Button>
        </div>

        <div className="flex gap-3 pt-2 border-t border-gray-100">
          <Button
            type="button"
            onClick={handleSave}
            disabled={!isValid || hasDuplicates}
            loading={loading}
          >
            Save Allocations
          </Button>
          <p className="text-xs text-gray-400 self-center">
            Existing allocations will be closed and new ones created from today.
          </p>
        </div>
      </CardContent>
    </Card>
  );
}
