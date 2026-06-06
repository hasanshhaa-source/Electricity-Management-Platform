'use client';

import { useForm } from 'react-hook-form';
import { zodResolver } from '@hookform/resolvers/zod';
import { useState } from 'react';
import { useRouter } from 'next/navigation';
import { flatSchema, type FlatInput, type FlatInputRaw } from '@/lib/validation/building';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { FormField } from '@/components/ui/form-field';
import { Textarea } from '@/components/ui/textarea';
import { Alert, AlertDescription } from '@/components/ui/alert';
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card';
import type { Flat, Building } from '@/types';

interface FlatFormProps {
  building: Pick<Building, 'id' | 'name'>;
  flat?: Flat;
  onSuccess?: (flat: Flat) => void;
}

export function FlatForm({ building, flat, onSuccess }: FlatFormProps) {
  const router = useRouter();
  const [serverError, setServerError] = useState('');
  const [loading, setLoading] = useState(false);
  const isEdit = !!flat;

  const {
    register,
    handleSubmit,
    formState: { errors },
  } = useForm<FlatInputRaw, unknown, FlatInput>({
    resolver: zodResolver(flatSchema),
    defaultValues: flat
      ? {
          building_id: flat.building_id,
          flat_number: flat.flat_number,
          floor: flat.floor ?? undefined,
          area_sqm: flat.area_sqm ?? undefined,
          description: flat.description ?? '',
          notes: flat.notes ?? '',
        }
      : { building_id: building.id },
  });

  async function onSubmit(data: FlatInput) {
    setLoading(true);
    setServerError('');

    const url = isEdit ? `/api/flats/${flat.id}` : '/api/flats';
    const method = isEdit ? 'PUT' : 'POST';

    const res = await fetch(url, {
      method,
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify(data),
    });
    const json = await res.json();

    if (!res.ok || json.error) {
      setServerError(json.error ?? 'Failed to save flat');
      setLoading(false);
      return;
    }

    if (onSuccess) {
      onSuccess(json.data);
    } else {
      router.back();
      router.refresh();
    }
    setLoading(false);
  }

  return (
    <Card className="max-w-xl">
      <CardHeader>
        <CardTitle>
          {isEdit ? `Edit Flat ${flat.flat_number}` : `New Flat — ${building.name}`}
        </CardTitle>
      </CardHeader>
      <CardContent>
        <form onSubmit={handleSubmit(onSubmit)} className="space-y-4">
          {serverError && (
            <Alert variant="destructive">
              <AlertDescription>{serverError}</AlertDescription>
            </Alert>
          )}

          <input type="hidden" {...register('building_id')} />

          <FormField label="Flat Number" htmlFor="flat_number" error={errors.flat_number?.message} required>
            <Input id="flat_number" placeholder="101" error={errors.flat_number?.message} {...register('flat_number')} />
          </FormField>

          <div className="grid grid-cols-2 gap-4">
            <FormField label="Floor" htmlFor="floor" error={errors.floor?.message}>
              <Input
                id="floor"
                type="number"
                min={0}
                placeholder="1"
                error={errors.floor?.message}
                {...register('floor', { valueAsNumber: true })}
              />
            </FormField>
            <FormField label="Area (m²)" htmlFor="area_sqm" error={errors.area_sqm?.message}>
              <Input
                id="area_sqm"
                type="number"
                step="0.01"
                min={0}
                placeholder="85.00"
                error={errors.area_sqm?.message}
                {...register('area_sqm', { valueAsNumber: true })}
              />
            </FormField>
          </div>

          <FormField label="Description" htmlFor="description" error={errors.description?.message}>
            <Textarea
              id="description"
              placeholder="2 bedrooms, 1 bathroom, balcony..."
              rows={2}
              {...register('description')}
            />
          </FormField>

          <FormField label="Notes (admin only)" htmlFor="notes" error={errors.notes?.message}>
            <Textarea
              id="notes"
              placeholder="Internal admin notes about this flat..."
              rows={2}
              {...register('notes')}
            />
          </FormField>

          <div className="flex gap-3 pt-2">
            <Button type="submit" loading={loading}>
              {loading ? 'Saving…' : isEdit ? 'Save Changes' : 'Create Flat'}
            </Button>
            <Button type="button" variant="outline" onClick={() => router.back()}>
              Cancel
            </Button>
          </div>
        </form>
      </CardContent>
    </Card>
  );
}
