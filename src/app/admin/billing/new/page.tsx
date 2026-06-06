'use client';

import { useState } from 'react';
import { useRouter } from 'next/navigation';
import Link from 'next/link';
import { useForm } from 'react-hook-form';
import { zodResolver } from '@hookform/resolvers/zod';
import { cycleSchema, type CycleInput, type CycleInputRaw } from '@/lib/validation/billing';
import { Button } from '@/components/ui/button';
import { FormField } from '@/components/ui/form-field';
import { Textarea } from '@/components/ui/textarea';
import { Alert, AlertDescription } from '@/components/ui/alert';
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card';
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from '@/components/ui/select';
import { ChevronLeft } from 'lucide-react';
import { useEffect } from 'react';

const MONTHS = [
  { value: '1', label: 'January' }, { value: '2', label: 'February' },
  { value: '3', label: 'March' },   { value: '4', label: 'April' },
  { value: '5', label: 'May' },     { value: '6', label: 'June' },
  { value: '7', label: 'July' },    { value: '8', label: 'August' },
  { value: '9', label: 'September' },{ value: '10', label: 'October' },
  { value: '11', label: 'November' },{ value: '12', label: 'December' },
];

const currentYear = new Date().getFullYear();
const YEARS = Array.from({ length: 5 }, (_, i) => String(currentYear - 1 + i));

interface Building { id: string; name: string; city: string }

export default function NewBillingCyclePage() {
  const router = useRouter();
  const [buildings, setBuildings] = useState<Building[]>([]);
  const [serverError, setServerError] = useState('');
  const [loading, setLoading] = useState(false);

  const now = new Date();
  const {
    register,
    handleSubmit,
    setValue,
    watch,
    formState: { errors },
  } = useForm<CycleInputRaw, unknown, CycleInput>({
    resolver: zodResolver(cycleSchema),
    defaultValues: {
      period_year:  String(now.getFullYear()),
      period_month: String(now.getMonth() + 1),
    },
  });

  const selectedBuilding = watch('building_id');
  const selectedYear     = watch('period_year');
  const selectedMonth    = watch('period_month');

  useEffect(() => {
    fetch('/api/buildings')
      .then((r) => r.json())
      .then((j) => setBuildings(j.data ?? []));
  }, []);

  async function onSubmit(data: CycleInput) {
    setLoading(true);
    setServerError('');
    const res  = await fetch('/api/billing/cycles', { method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify(data) });
    const json = await res.json();
    if (!res.ok || json.error) { setServerError(json.error ?? 'Failed to create cycle'); setLoading(false); return; }
    router.push(`/admin/billing/${json.data.id}`);
  }

  return (
    <div className="space-y-6">
      <div>
        <Link href="/admin/billing" className="inline-flex items-center gap-1 text-sm text-gray-500 hover:text-gray-700 mb-2">
          <ChevronLeft className="h-4 w-4" />Billing Cycles
        </Link>
        <h1 className="text-2xl font-bold text-gray-900">New Billing Cycle</h1>
        <p className="text-sm text-gray-500 mt-1">Create a monthly billing cycle to collect meter readings</p>
      </div>

      <Card className="max-w-lg">
        <CardHeader><CardTitle>Cycle Details</CardTitle></CardHeader>
        <CardContent>
          <form onSubmit={handleSubmit(onSubmit)} className="space-y-4">
            {serverError && <Alert variant="destructive"><AlertDescription>{serverError}</AlertDescription></Alert>}

            <FormField label="Building" htmlFor="building_id" error={errors.building_id?.message} required>
              <Select value={selectedBuilding} onValueChange={(v) => setValue('building_id', v)}>
                <SelectTrigger id="building_id">
                  <SelectValue placeholder="Select building…" />
                </SelectTrigger>
                <SelectContent>
                  {buildings.map((b) => (
                    <SelectItem key={b.id} value={b.id}>{b.name} — {b.city}</SelectItem>
                  ))}
                </SelectContent>
              </Select>
            </FormField>

            <div className="grid grid-cols-2 gap-4">
              <FormField label="Month" htmlFor="period_month" error={errors.period_month?.message} required>
                <Select value={String(selectedMonth)} onValueChange={(v) => setValue('period_month', v)}>
                  <SelectTrigger id="period_month"><SelectValue /></SelectTrigger>
                  <SelectContent>
                    {MONTHS.map((m) => <SelectItem key={m.value} value={m.value}>{m.label}</SelectItem>)}
                  </SelectContent>
                </Select>
              </FormField>

              <FormField label="Year" htmlFor="period_year" error={errors.period_year?.message} required>
                <Select value={String(selectedYear)} onValueChange={(v) => setValue('period_year', v)}>
                  <SelectTrigger id="period_year"><SelectValue /></SelectTrigger>
                  <SelectContent>
                    {YEARS.map((y) => <SelectItem key={y} value={y}>{y}</SelectItem>)}
                  </SelectContent>
                </Select>
              </FormField>
            </div>

            <FormField label="Notes" htmlFor="notes" error={errors.notes?.message}>
              <Textarea id="notes" rows={2} placeholder="Optional notes for this cycle…" {...register('notes')} />
            </FormField>

            <div className="flex gap-3 pt-2">
              <Button type="submit" loading={loading}>Create Cycle</Button>
              <Button type="button" variant="outline" onClick={() => router.back()}>Cancel</Button>
            </div>
          </form>
        </CardContent>
      </Card>
    </div>
  );
}
