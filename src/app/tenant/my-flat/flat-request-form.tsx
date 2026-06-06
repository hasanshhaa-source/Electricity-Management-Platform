'use client';

import { useState, useEffect } from 'react';
import { useRouter } from 'next/navigation';
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card';
import { Button } from '@/components/ui/button';
import { FormField } from '@/components/ui/form-field';
import { Alert, AlertDescription } from '@/components/ui/alert';
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from '@/components/ui/select';
import type { Building, Flat } from '@/types';
import { createClient } from '@/lib/supabase/client';

interface FlatRequestFormProps {
  buildings: Pick<Building, 'id' | 'name' | 'city'>[];
}

export function FlatRequestForm({ buildings }: FlatRequestFormProps) {
  const router = useRouter();
  const [selectedBuilding, setSelectedBuilding] = useState('');
  const [selectedFlat, setSelectedFlat] = useState('');
  const [flats, setFlats] = useState<Flat[]>([]);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState('');

  useEffect(() => {
    if (!selectedBuilding) {
      setFlats([]);
      setSelectedFlat('');
      return;
    }
    const supabase = createClient();
    supabase
      .from('flats')
      .select('id, flat_number, floor, area_sqm')
      .eq('building_id', selectedBuilding)
      .eq('status', 'available')
      .is('deleted_at', null)
      .eq('is_active', true)
      .order('floor')
      .order('flat_number')
      .then(({ data }) => setFlats((data as Flat[]) ?? []));
  }, [selectedBuilding]);

  async function handleSubmit(e: React.FormEvent) {
    e.preventDefault();
    if (!selectedFlat) { setError('Please select a flat'); return; }
    setLoading(true);
    setError('');

    const res = await fetch('/api/tenancies', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ flat_id: selectedFlat }),
    });
    const json = await res.json();

    if (!res.ok || json.error) {
      setError(json.error ?? 'Failed to submit request');
      setLoading(false);
      return;
    }

    router.refresh();
  }

  return (
    <Card>
      <CardHeader>
        <CardTitle>Request a Flat</CardTitle>
      </CardHeader>
      <CardContent>
        <form onSubmit={handleSubmit} className="space-y-4 max-w-md">
          {error && (
            <Alert variant="destructive">
              <AlertDescription>{error}</AlertDescription>
            </Alert>
          )}

          <FormField label="Select Building" htmlFor="building" required>
            <Select value={selectedBuilding} onValueChange={setSelectedBuilding}>
              <SelectTrigger id="building">
                <SelectValue placeholder="Choose a building" />
              </SelectTrigger>
              <SelectContent>
                {buildings.map((b) => (
                  <SelectItem key={b.id} value={b.id}>
                    {b.name} — {b.city}
                  </SelectItem>
                ))}
              </SelectContent>
            </Select>
          </FormField>

          {selectedBuilding && (
            <FormField label="Available Flat" htmlFor="flat" required>
              <Select
                value={selectedFlat}
                onValueChange={setSelectedFlat}
                disabled={flats.length === 0}
              >
                <SelectTrigger id="flat">
                  <SelectValue
                    placeholder={flats.length === 0 ? 'No available flats' : 'Choose a flat'}
                  />
                </SelectTrigger>
                <SelectContent>
                  {flats.map((f) => (
                    <SelectItem key={f.id} value={f.id}>
                      Flat {f.flat_number}
                      {f.floor != null ? ` — Floor ${f.floor}` : ''}
                      {f.area_sqm ? ` (${f.area_sqm} m²)` : ''}
                    </SelectItem>
                  ))}
                </SelectContent>
              </Select>
            </FormField>
          )}

          <Button type="submit" disabled={!selectedFlat} loading={loading}>
            Submit Request
          </Button>
        </form>
      </CardContent>
    </Card>
  );
}
