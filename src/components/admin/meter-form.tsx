'use client';

import { useForm } from 'react-hook-form';
import { zodResolver } from '@hookform/resolvers/zod';
import { useState } from 'react';
import { useRouter } from 'next/navigation';
import { meterSchema, type MeterInput, type MeterInputRaw } from '@/lib/validation/meter';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { FormField } from '@/components/ui/form-field';
import { Textarea } from '@/components/ui/textarea';
import { Alert, AlertDescription } from '@/components/ui/alert';
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card';
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from '@/components/ui/select';
import type { Meter, Building } from '@/types';

interface MeterFormProps {
  building: Pick<Building, 'id' | 'name'>;
  meter?: Meter;
  onSuccess?: (meter: Meter) => void;
}

export function MeterForm({ building, meter, onSuccess }: MeterFormProps) {
  const router = useRouter();
  const [serverError, setServerError] = useState('');
  const [loading, setLoading] = useState(false);
  const isEdit = !!meter;

  const {
    register,
    handleSubmit,
    setValue,
    watch,
    formState: { errors },
  } = useForm<MeterInputRaw, unknown, MeterInput>({
    resolver: zodResolver(meterSchema),
    defaultValues: meter
      ? {
          building_id: meter.building_id,
          meter_number: meter.meter_number,
          meter_type: meter.meter_type,
          description: meter.description ?? '',
          unit: meter.unit,
        }
      : { building_id: building.id, meter_type: 'individual', unit: 'kWh' },
  });

  const meterType = watch('meter_type');

  async function onSubmit(data: MeterInput) {
    setLoading(true);
    setServerError('');

    const url = isEdit ? `/api/meters/${meter.id}` : '/api/meters';
    const method = isEdit ? 'PUT' : 'POST';

    const res = await fetch(url, {
      method,
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify(data),
    });
    const json = await res.json();

    if (!res.ok || json.error) {
      setServerError(json.error ?? 'Failed to save meter');
      setLoading(false);
      return;
    }

    if (onSuccess) {
      onSuccess(json.data);
    } else {
      router.push(`/admin/meters/${json.data.id}`);
      router.refresh();
    }
    setLoading(false);
  }

  return (
    <Card className="max-w-xl">
      <CardHeader>
        <CardTitle>{isEdit ? `Edit Meter ${meter.meter_number}` : `New Meter — ${building.name}`}</CardTitle>
      </CardHeader>
      <CardContent>
        <form onSubmit={handleSubmit(onSubmit)} className="space-y-4">
          {serverError && (
            <Alert variant="destructive">
              <AlertDescription>{serverError}</AlertDescription>
            </Alert>
          )}

          <input type="hidden" {...register('building_id')} />

          <div className="grid grid-cols-2 gap-4">
            <FormField label="Meter Number" htmlFor="meter_number" error={errors.meter_number?.message} required>
              <Input id="meter_number" placeholder="NR-101" error={errors.meter_number?.message} {...register('meter_number')} />
            </FormField>
            <FormField label="Unit" htmlFor="unit" error={errors.unit?.message} required>
              <Input id="unit" placeholder="kWh" error={errors.unit?.message} {...register('unit')} />
            </FormField>
          </div>

          <FormField label="Meter Type" htmlFor="meter_type" required>
            <Select
              value={meterType}
              onValueChange={(v) => setValue('meter_type', v as 'individual' | 'shared')}
              disabled={isEdit}
            >
              <SelectTrigger id="meter_type">
                <SelectValue />
              </SelectTrigger>
              <SelectContent>
                <SelectItem value="individual">Individual — linked to one flat</SelectItem>
                <SelectItem value="shared">Shared — split across multiple flats</SelectItem>
              </SelectContent>
            </Select>
            {isEdit && (
              <p className="text-xs text-amber-600">Meter type cannot be changed after creation</p>
            )}
          </FormField>

          <FormField label="Description" htmlFor="description" error={errors.description?.message}>
            <Textarea id="description" placeholder="Ground floor shared meter for flats 101–104..." rows={2} {...register('description')} />
          </FormField>

          <div className="flex gap-3 pt-2">
            <Button type="submit" loading={loading}>
              {loading ? 'Saving…' : isEdit ? 'Save Changes' : 'Create Meter'}
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
