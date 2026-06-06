'use client';

import { useForm } from 'react-hook-form';
import { zodResolver } from '@hookform/resolvers/zod';
import { useState } from 'react';
import { useRouter } from 'next/navigation';
import { buildingSchema, type BuildingInput, type BuildingInputRaw } from '@/lib/validation/building';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { FormField } from '@/components/ui/form-field';
import { Alert, AlertDescription } from '@/components/ui/alert';
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card';
import type { Building } from '@/types';

interface BuildingFormProps {
  building?: Building;
  onSuccess?: (building: Building) => void;
}

const CURRENCIES = ['SAR', 'AED', 'KWD', 'BHD', 'QAR', 'OMR', 'USD', 'EUR', 'GBP'];

export function BuildingForm({ building, onSuccess }: BuildingFormProps) {
  const router = useRouter();
  const [serverError, setServerError] = useState('');
  const [loading, setLoading] = useState(false);
  const isEdit = !!building;

  const {
    register,
    handleSubmit,
    formState: { errors },
  } = useForm<BuildingInputRaw, unknown, BuildingInput>({
    resolver: zodResolver(buildingSchema),
    defaultValues: building
      ? {
          name: building.name,
          address: building.address,
          city: building.city,
          country: building.country,
          billing_day: building.billing_day,
          currency: building.currency,
        }
      : {
          country: 'Saudi Arabia',
          billing_day: 1,
          currency: 'SAR',
        },
  });

  async function onSubmit(data: BuildingInput) {
    setLoading(true);
    setServerError('');

    const url = isEdit ? `/api/buildings/${building.id}` : '/api/buildings';
    const method = isEdit ? 'PUT' : 'POST';

    const res = await fetch(url, {
      method,
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify(data),
    });
    const json = await res.json();

    if (!res.ok || json.error) {
      setServerError(json.error ?? 'Failed to save building');
      setLoading(false);
      return;
    }

    if (onSuccess) {
      onSuccess(json.data);
    } else {
      router.push(`/admin/buildings/${json.data.id}`);
      router.refresh();
    }
    setLoading(false);
  }

  return (
    <Card className="max-w-2xl">
      <CardHeader>
        <CardTitle>{isEdit ? 'Edit Building' : 'New Building'}</CardTitle>
      </CardHeader>
      <CardContent>
        <form onSubmit={handleSubmit(onSubmit)} className="space-y-4">
          {serverError && (
            <Alert variant="destructive">
              <AlertDescription>{serverError}</AlertDescription>
            </Alert>
          )}

          <FormField label="Building Name" htmlFor="name" error={errors.name?.message} required>
            <Input id="name" placeholder="Al-Noor Residence" error={errors.name?.message} {...register('name')} />
          </FormField>

          <FormField label="Address" htmlFor="address" error={errors.address?.message} required>
            <Input id="address" placeholder="King Fahd Road, Al-Olaya District" error={errors.address?.message} {...register('address')} />
          </FormField>

          <div className="grid grid-cols-2 gap-4">
            <FormField label="City" htmlFor="city" error={errors.city?.message} required>
              <Input id="city" placeholder="Riyadh" error={errors.city?.message} {...register('city')} />
            </FormField>
            <FormField label="Country" htmlFor="country" error={errors.country?.message} required>
              <Input id="country" placeholder="Saudi Arabia" error={errors.country?.message} {...register('country')} />
            </FormField>
          </div>

          <div className="grid grid-cols-2 gap-4">
            <FormField
              label="Billing Day"
              htmlFor="billing_day"
              error={errors.billing_day?.message}
              description="Day of month bills are generated (1–28)"
              required
            >
              <Input
                id="billing_day"
                type="number"
                min={1}
                max={28}
                error={errors.billing_day?.message}
                {...register('billing_day', { valueAsNumber: true })}
              />
            </FormField>
            <FormField label="Currency" htmlFor="currency" error={errors.currency?.message} required>
              <select
                id="currency"
                className="flex h-10 w-full rounded-md border border-gray-300 bg-white px-3 py-2 text-sm focus:outline-none focus:ring-2 focus:ring-blue-600"
                {...register('currency')}
              >
                {CURRENCIES.map((c) => (
                  <option key={c} value={c}>{c}</option>
                ))}
              </select>
            </FormField>
          </div>

          <div className="flex gap-3 pt-2">
            <Button type="submit" loading={loading}>
              {loading ? 'Saving…' : isEdit ? 'Save Changes' : 'Create Building'}
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
