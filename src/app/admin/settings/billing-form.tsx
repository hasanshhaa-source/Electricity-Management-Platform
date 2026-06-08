'use client';

import { useState } from 'react';
import { useRouter } from 'next/navigation';
import { z } from 'zod';
import { useForm } from 'react-hook-form';
import { zodResolver } from '@hookform/resolvers/zod';
import type { SystemSettings } from '@/services/settings/systemSettingsService';

const schema = z.object({
  default_diff_method:   z.enum(['proportional', 'equal', 'manual']),
  default_due_date_days: z.coerce.number().int().min(1).max(60),
  decimal_places:        z.coerce.number().refine(v => v === 2 || v === 4) as z.ZodType<2 | 4>,
  allow_manual_override: z.boolean(),
});

type FormInput  = z.input<typeof schema>;
type FormOutput = z.infer<typeof schema>;

export function BillingSettingsForm({ settings }: { settings: SystemSettings }) {
  const router = useRouter();
  const [saving, setSaving] = useState(false);
  const [saved, setSaved]   = useState(false);

  const { register, handleSubmit, formState: { errors } } = useForm<FormInput, unknown, FormOutput>({
    resolver: zodResolver(schema),
    defaultValues: {
      default_diff_method:   settings.default_diff_method,
      default_due_date_days: settings.default_due_date_days,
      decimal_places:        settings.decimal_places as unknown as string,
      allow_manual_override: settings.allow_manual_override,
    },
  });

  async function onSubmit(data: FormOutput) {
    setSaving(true);
    setSaved(false);
    const res = await fetch('/api/admin/system-settings', {
      method: 'PUT',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify(data),
    });
    setSaving(false);
    if (res.ok) { setSaved(true); router.refresh(); }
  }

  return (
    <form onSubmit={handleSubmit(onSubmit)} className="space-y-5">
      <div>
        <label className="block text-sm font-medium text-gray-700 mb-1">
          Difference distribution method
        </label>
        <select {...register('default_diff_method')}
          className="w-full rounded-md border border-gray-300 px-3 py-2 text-sm focus:outline-none focus:ring-2 focus:ring-blue-500">
          <option value="proportional">Proportional (by meter reading)</option>
          <option value="equal">Equal split</option>
          <option value="manual">Manual</option>
        </select>
        <p className="mt-1 text-xs text-gray-500">How building-level cost differences are distributed across flats.</p>
      </div>

      <div>
        <label className="block text-sm font-medium text-gray-700 mb-1">
          Default due date (days after bill issue)
        </label>
        <input type="number" min={1} max={60} {...register('default_due_date_days')}
          className="w-full rounded-md border border-gray-300 px-3 py-2 text-sm focus:outline-none focus:ring-2 focus:ring-blue-500" />
        {errors.default_due_date_days && (
          <p className="mt-1 text-xs text-red-500">{errors.default_due_date_days.message}</p>
        )}
      </div>

      <div>
        <label className="block text-sm font-medium text-gray-700 mb-1">Decimal places</label>
        <select {...register('decimal_places')}
          className="w-full rounded-md border border-gray-300 px-3 py-2 text-sm focus:outline-none focus:ring-2 focus:ring-blue-500">
          <option value="2">2 decimal places</option>
          <option value="4">4 decimal places (higher precision)</option>
        </select>
      </div>

      <div className="flex items-center gap-3">
        <input type="checkbox" id="allow_manual_override" {...register('allow_manual_override')}
          className="h-4 w-4 rounded border-gray-300 text-blue-600 focus:ring-blue-500" />
        <label htmlFor="allow_manual_override" className="text-sm text-gray-700">
          Allow admin to manually override calculated bill amounts
        </label>
      </div>

      <div className="flex items-center gap-3 pt-2">
        <button type="submit" disabled={saving}
          className="rounded-md bg-blue-600 px-4 py-2 text-sm font-medium text-white hover:bg-blue-700 disabled:opacity-50">
          {saving ? 'Saving…' : 'Save billing settings'}
        </button>
        {saved && <span className="text-sm text-green-600">Saved successfully</span>}
      </div>
    </form>
  );
}
