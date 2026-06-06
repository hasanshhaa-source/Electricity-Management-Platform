'use client';

import { useState } from 'react';
import { useRouter } from 'next/navigation';
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card';
import { Button } from '@/components/ui/button';
import { Alert, AlertDescription } from '@/components/ui/alert';
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from '@/components/ui/select';
import type { FlatStatus } from '@/types';

const STATUS_OPTIONS: { value: FlatStatus; label: string; description: string }[] = [
  { value: 'available',   label: 'Available',    description: 'Flat is ready to be assigned to a tenant' },
  { value: 'occupied',    label: 'Occupied',     description: 'Flat has an active tenant (set automatically)' },
  { value: 'maintenance', label: 'Maintenance',  description: 'Flat is temporarily unavailable for assignment' },
  { value: 'inactive',    label: 'Inactive',     description: 'Flat is permanently deactivated' },
];

interface FlatStatusControlProps {
  flatId: string;
  currentStatus: FlatStatus;
}

export function FlatStatusControl({ flatId, currentStatus }: FlatStatusControlProps) {
  const router = useRouter();
  const [status, setStatus] = useState<FlatStatus>(currentStatus);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState('');
  const [saved, setSaved] = useState(false);

  async function handleSave() {
    if (status === currentStatus) return;
    setLoading(true);
    setError('');
    const res = await fetch(`/api/flats/${flatId}`, {
      method: 'PATCH',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ status }),
    });
    const json = await res.json();
    if (!res.ok || json.error) { setError(json.error ?? 'Failed to update status'); setLoading(false); return; }
    setSaved(true);
    setLoading(false);
    router.refresh();
    setTimeout(() => setSaved(false), 2000);
  }

  const selected = STATUS_OPTIONS.find((o) => o.value === status);

  return (
    <Card>
      <CardHeader><CardTitle>Flat Status</CardTitle></CardHeader>
      <CardContent className="space-y-4">
        {error && <Alert variant="destructive"><AlertDescription>{error}</AlertDescription></Alert>}
        {saved && <Alert variant="success"><AlertDescription>Status updated successfully</AlertDescription></Alert>}

        <Select value={status} onValueChange={(v) => { setStatus(v as FlatStatus); setSaved(false); }}>
          <SelectTrigger>
            <SelectValue />
          </SelectTrigger>
          <SelectContent>
            {STATUS_OPTIONS.map((o) => (
              <SelectItem key={o.value} value={o.value}>{o.label}</SelectItem>
            ))}
          </SelectContent>
        </Select>

        {selected && (
          <p className="text-sm text-gray-500">{selected.description}</p>
        )}

        <Button
          onClick={handleSave}
          disabled={status === currentStatus}
          loading={loading}
          size="sm"
        >
          Update Status
        </Button>
      </CardContent>
    </Card>
  );
}
