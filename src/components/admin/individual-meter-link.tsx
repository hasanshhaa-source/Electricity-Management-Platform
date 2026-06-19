'use client';

import { useState, useEffect } from 'react';
import { useRouter } from 'next/navigation';
import { Button } from '@/components/ui/button';
import { Alert, AlertDescription } from '@/components/ui/alert';
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card';
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from '@/components/ui/select';
import { CheckCircle2 } from 'lucide-react';
import { createClient } from '@/lib/supabase/client';
import type { Flat } from '@/types';

interface IndividualMeterLinkProps {
  meterId: string;
  buildingId: string;
  meterNumber: string;
  currentFlatId?: string | null;
}

export function IndividualMeterLink({
  meterId,
  buildingId,
  meterNumber,
  currentFlatId = null,
}: IndividualMeterLinkProps) {
  const router = useRouter();
  const [flatId, setFlatId] = useState(currentFlatId ?? '');
  const [buildingFlats, setBuildingFlats] = useState<Flat[]>([]);
  const [loading, setLoading] = useState(false);
  const [serverError, setServerError] = useState('');
  const [success, setSuccess] = useState(false);

  useEffect(() => {
    const supabase = createClient();
    supabase.from('flats').select('id, flat_number, floor').eq('building_id', buildingId)
      .is('deleted_at', null).eq('is_active', true).order('flat_number')
      .then(({ data }) => setBuildingFlats(data as Flat[] ?? []));
  }, [buildingId]);

  async function handleSave() {
    if (!flatId) return;
    setLoading(true);
    setServerError('');
    setSuccess(false);

    const res = await fetch(`/api/meters/${meterId}/link-flat`, {
      method: 'PUT',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ flat_id: flatId }),
    });
    const json = await res.json();

    if (!res.ok || json.error) {
      setServerError(json.error ?? 'Failed to link flat');
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
        <CardTitle>Linked Flat — Meter {meterNumber}</CardTitle>
      </CardHeader>
      <CardContent className="space-y-4">
        {serverError && <Alert variant="destructive"><AlertDescription>{serverError}</AlertDescription></Alert>}
        {success && (
          <Alert variant="success">
            <CheckCircle2 className="h-4 w-4" />
            <AlertDescription>Flat linked successfully</AlertDescription>
          </Alert>
        )}

        <Select value={flatId} onValueChange={setFlatId}>
          <SelectTrigger>
            <SelectValue placeholder="Select flat" />
          </SelectTrigger>
          <SelectContent>
            {buildingFlats.map((f) => (
              <SelectItem key={f.id} value={f.id}>{getFlatLabel(f)}</SelectItem>
            ))}
          </SelectContent>
        </Select>

        <div className="flex gap-3 pt-2 border-t border-gray-100">
          <Button type="button" onClick={handleSave} disabled={!flatId} loading={loading}>
            {currentFlatId ? 'Change Linked Flat' : 'Link Flat'}
          </Button>
          <p className="text-xs text-gray-400 self-center">
            This meter is linked to 100% of one flat&apos;s consumption.
          </p>
        </div>
      </CardContent>
    </Card>
  );
}
