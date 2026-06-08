'use client';

import { useState } from 'react';
import { useRouter } from 'next/navigation';
import type { SystemSettings } from '@/services/settings/systemSettingsService';

const ALL_METHODS = [
  { value: 'cash',          label: 'Cash' },
  { value: 'bank_transfer', label: 'Bank Transfer' },
  { value: 'stc_pay',       label: 'STC Pay' },
  { value: 'online',        label: 'Online' },
  { value: 'other',         label: 'Other' },
];

export function PaymentSettingsForm({ settings }: { settings: SystemSettings }) {
  const router = useRouter();
  const [methods, setMethods]     = useState<string[]>(settings.allowed_payment_methods);
  const [requireRef, setRequireRef] = useState(settings.require_payment_reference);
  const [allowPartial, setAllowPartial] = useState(settings.allow_partial_payments);
  const [saving, setSaving]       = useState(false);
  const [saved, setSaved]         = useState(false);
  const [err, setErr]             = useState('');

  function toggleMethod(value: string) {
    setMethods(prev =>
      prev.includes(value) ? prev.filter(m => m !== value) : [...prev, value]
    );
  }

  async function handleSave() {
    if (methods.length === 0) { setErr('At least one payment method must be allowed.'); return; }
    setErr('');
    setSaving(true);
    setSaved(false);
    const res = await fetch('/api/admin/system-settings', {
      method: 'PUT',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({
        allowed_payment_methods:   methods,
        require_payment_reference: requireRef,
        allow_partial_payments:    allowPartial,
      }),
    });
    setSaving(false);
    if (res.ok) { setSaved(true); router.refresh(); }
  }

  return (
    <div className="space-y-5">
      <div>
        <p className="block text-sm font-medium text-gray-700 mb-2">Allowed payment methods</p>
        <div className="space-y-2">
          {ALL_METHODS.map(m => (
            <label key={m.value} className="flex items-center gap-2 cursor-pointer">
              <input type="checkbox" checked={methods.includes(m.value)}
                onChange={() => toggleMethod(m.value)}
                className="h-4 w-4 rounded border-gray-300 text-blue-600 focus:ring-blue-500" />
              <span className="text-sm text-gray-700">{m.label}</span>
            </label>
          ))}
        </div>
        {err && <p className="mt-1 text-xs text-red-500">{err}</p>}
      </div>

      <div className="flex items-start gap-3">
        <input type="checkbox" id="require_ref" checked={requireRef}
          onChange={e => setRequireRef(e.target.checked)}
          className="mt-0.5 h-4 w-4 rounded border-gray-300 text-blue-600 focus:ring-blue-500" />
        <div>
          <label htmlFor="require_ref" className="block text-sm font-medium text-gray-700">
            Require payment reference number
          </label>
          <p className="text-xs text-gray-500 mt-0.5">
            When enabled, a reference number must be provided when recording a payment.
          </p>
        </div>
      </div>

      <div className="flex items-start gap-3">
        <input type="checkbox" id="allow_partial" checked={allowPartial}
          onChange={e => setAllowPartial(e.target.checked)}
          className="mt-0.5 h-4 w-4 rounded border-gray-300 text-blue-600 focus:ring-blue-500" />
        <div>
          <label htmlFor="allow_partial" className="block text-sm font-medium text-gray-700">
            Allow partial payments
          </label>
          <p className="text-xs text-gray-500 mt-0.5">
            When disabled, payments must equal the full outstanding balance.
          </p>
        </div>
      </div>

      <div className="flex items-center gap-3 pt-2">
        <button onClick={handleSave} disabled={saving}
          className="rounded-md bg-blue-600 px-4 py-2 text-sm font-medium text-white hover:bg-blue-700 disabled:opacity-50">
          {saving ? 'Saving…' : 'Save payment settings'}
        </button>
        {saved && <span className="text-sm text-green-600">Saved successfully</span>}
      </div>
    </div>
  );
}
