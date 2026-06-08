'use client';

import { useState } from 'react';
import { useRouter } from 'next/navigation';
import type { SystemSettings } from '@/services/settings/systemSettingsService';

export function RegistrationSettingsForm({ settings }: { settings: SystemSettings }) {
  const router = useRouter();
  const [selfReg, setSelfReg]   = useState(settings.allow_self_registration);
  const [approval, setApproval] = useState(settings.require_admin_approval);
  const [saving, setSaving]     = useState(false);
  const [saved, setSaved]       = useState(false);

  async function handleSave() {
    setSaving(true);
    setSaved(false);
    const res = await fetch('/api/admin/system-settings', {
      method: 'PUT',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({
        allow_self_registration: selfReg,
        require_admin_approval: approval,
      }),
    });
    setSaving(false);
    if (res.ok) { setSaved(true); router.refresh(); }
  }

  return (
    <div className="space-y-5">
      <div className="flex items-start gap-3">
        <input type="checkbox" id="allow_self_reg" checked={selfReg}
          onChange={e => setSelfReg(e.target.checked)}
          className="mt-0.5 h-4 w-4 rounded border-gray-300 text-blue-600 focus:ring-blue-500" />
        <div>
          <label htmlFor="allow_self_reg" className="block text-sm font-medium text-gray-700">
            Allow tenant self-registration
          </label>
          <p className="text-xs text-gray-500 mt-0.5">
            When disabled, only admins can create tenant accounts.
          </p>
        </div>
      </div>

      <div className="flex items-start gap-3">
        <input type="checkbox" id="require_approval" checked={approval}
          onChange={e => setApproval(e.target.checked)}
          className="mt-0.5 h-4 w-4 rounded border-gray-300 text-blue-600 focus:ring-blue-500" />
        <div>
          <label htmlFor="require_approval" className="block text-sm font-medium text-gray-700">
            Require admin approval for tenancy requests
          </label>
          <p className="text-xs text-gray-500 mt-0.5">
            When enabled, tenants must wait for an admin to approve their flat assignment.
          </p>
        </div>
      </div>

      <div className="flex items-center gap-3 pt-2">
        <button onClick={handleSave} disabled={saving}
          className="rounded-md bg-blue-600 px-4 py-2 text-sm font-medium text-white hover:bg-blue-700 disabled:opacity-50">
          {saving ? 'Saving…' : 'Save registration settings'}
        </button>
        {saved && <span className="text-sm text-green-600">Saved successfully</span>}
      </div>
    </div>
  );
}
