'use client';

import { useState } from 'react';
import { useRouter } from 'next/navigation';
import type { SystemSettings } from '@/services/settings/systemSettingsService';

const CURRENCIES = ['SAR', 'USD', 'EUR', 'AED', 'KWD', 'BHD', 'QAR', 'OMR'];

const TIMEZONES = [
  'Asia/Riyadh',
  'Asia/Dubai',
  'Asia/Kuwait',
  'Asia/Bahrain',
  'Asia/Qatar',
  'Asia/Muscat',
  'Asia/Baghdad',
  'Africa/Cairo',
  'Europe/London',
  'UTC',
];

export function SystemSettingsForm({ settings }: { settings: SystemSettings }) {
  const router = useRouter();
  const [currency, setCurrency]   = useState(settings.default_currency);
  const [timezone, setTimezone]   = useState(settings.timezone);
  const [language, setLanguage]   = useState(settings.default_language);
  const [saving, setSaving]       = useState(false);
  const [saved, setSaved]         = useState(false);

  async function handleSave() {
    setSaving(true);
    setSaved(false);
    const res = await fetch('/api/admin/system-settings', {
      method: 'PUT',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({
        default_currency: currency,
        timezone,
        default_language: language,
      }),
    });
    setSaving(false);
    if (res.ok) { setSaved(true); router.refresh(); }
  }

  return (
    <div className="space-y-5">
      <div>
        <label className="block text-sm font-medium text-gray-700 mb-1">Default currency</label>
        <select value={currency} onChange={e => setCurrency(e.target.value)}
          className="w-full rounded-md border border-gray-300 px-3 py-2 text-sm focus:outline-none focus:ring-2 focus:ring-blue-500">
          {CURRENCIES.map(c => (
            <option key={c} value={c}>{c}</option>
          ))}
        </select>
        <p className="mt-1 text-xs text-gray-500">Used as fallback when a building has no currency set.</p>
      </div>

      <div>
        <label className="block text-sm font-medium text-gray-700 mb-1">Timezone</label>
        <select value={timezone} onChange={e => setTimezone(e.target.value)}
          className="w-full rounded-md border border-gray-300 px-3 py-2 text-sm focus:outline-none focus:ring-2 focus:ring-blue-500">
          {TIMEZONES.map(tz => (
            <option key={tz} value={tz}>{tz}</option>
          ))}
        </select>
      </div>

      <div>
        <label className="block text-sm font-medium text-gray-700 mb-1">Default language</label>
        <select value={language} onChange={e => setLanguage(e.target.value)}
          className="w-full rounded-md border border-gray-300 px-3 py-2 text-sm focus:outline-none focus:ring-2 focus:ring-blue-500">
          <option value="en">English</option>
          <option value="ar">Arabic (عربي)</option>
        </select>
        <p className="mt-1 text-xs text-gray-500">Full Arabic UI localisation is coming in a future release.</p>
      </div>

      <div className="flex items-center gap-3 pt-2">
        <button onClick={handleSave} disabled={saving}
          className="rounded-md bg-blue-600 px-4 py-2 text-sm font-medium text-white hover:bg-blue-700 disabled:opacity-50">
          {saving ? 'Saving…' : 'Save system settings'}
        </button>
        {saved && <span className="text-sm text-green-600">Saved successfully</span>}
      </div>
    </div>
  );
}
