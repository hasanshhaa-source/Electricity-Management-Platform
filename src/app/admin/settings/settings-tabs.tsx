'use client';

import { useState } from 'react';
import type { SystemSettings } from '@/services/settings/systemSettingsService';
import type { NotificationSettings } from '@/services/notification/notificationSettings';
import { BillingSettingsForm }      from './billing-form';
import { RegistrationSettingsForm } from './registration-form';
import { PaymentSettingsForm }      from './payment-form';
import { SystemSettingsForm }       from './system-form';
import { NotificationSettingsForm } from '@/app/admin/notifications/settings-form';

const TABS = [
  { id: 'billing',       label: 'Billing' },
  { id: 'notifications', label: 'Notifications' },
  { id: 'registration',  label: 'Registration' },
  { id: 'payments',      label: 'Payments' },
  { id: 'system',        label: 'System' },
] as const;

type TabId = typeof TABS[number]['id'];

interface Props {
  systemSettings:       SystemSettings;
  notificationSettings: NotificationSettings;
}

export function SettingsTabs({ systemSettings, notificationSettings }: Props) {
  const [active, setActive] = useState<TabId>('billing');

  return (
    <div>
      {/* Tab bar */}
      <div className="flex border-b border-gray-200 mb-6 overflow-x-auto">
        {TABS.map(tab => (
          <button
            key={tab.id}
            onClick={() => setActive(tab.id)}
            className={`shrink-0 px-4 py-2.5 text-sm font-medium border-b-2 transition-colors ${
              active === tab.id
                ? 'border-blue-600 text-blue-700'
                : 'border-transparent text-gray-500 hover:text-gray-700 hover:border-gray-300'
            }`}
          >
            {tab.label}
          </button>
        ))}
      </div>

      {/* Panels */}
      {active === 'billing' && (
        <div className="max-w-lg">
          <h2 className="text-sm font-semibold text-gray-700 uppercase tracking-wide mb-4">Billing settings</h2>
          <BillingSettingsForm settings={systemSettings} />
        </div>
      )}

      {active === 'notifications' && (
        <div className="max-w-lg">
          <h2 className="text-sm font-semibold text-gray-700 uppercase tracking-wide mb-4">Notification settings</h2>
          <NotificationSettingsForm settings={notificationSettings} />
        </div>
      )}

      {active === 'registration' && (
        <div className="max-w-lg">
          <h2 className="text-sm font-semibold text-gray-700 uppercase tracking-wide mb-4">Tenant registration settings</h2>
          <RegistrationSettingsForm settings={systemSettings} />
        </div>
      )}

      {active === 'payments' && (
        <div className="max-w-lg">
          <h2 className="text-sm font-semibold text-gray-700 uppercase tracking-wide mb-4">Payment settings</h2>
          <PaymentSettingsForm settings={systemSettings} />
        </div>
      )}

      {active === 'system' && (
        <div className="max-w-lg">
          <h2 className="text-sm font-semibold text-gray-700 uppercase tracking-wide mb-4">System settings</h2>
          <SystemSettingsForm settings={systemSettings} />
        </div>
      )}
    </div>
  );
}
