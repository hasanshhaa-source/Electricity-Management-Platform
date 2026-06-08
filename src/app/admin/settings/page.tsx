import { requireAdmin } from '@/services/auth/authService';
import { getSystemSettings } from '@/services/settings/systemSettingsService';
import { getNotificationSettings } from '@/services/notification/notificationSettings';
import { PageHeader } from '@/components/shared/page-header';
import { SettingsTabs } from './settings-tabs';

export default async function SettingsPage() {
  await requireAdmin();

  const [systemSettings, notificationSettings] = await Promise.all([
    getSystemSettings(),
    getNotificationSettings(),
  ]);

  return (
    <div className="space-y-6">
      <PageHeader
        title="Settings"
        description="Configure system-wide behaviour without code changes"
      />
      <div className="rounded-xl border border-gray-200 bg-white p-6">
        <SettingsTabs
          systemSettings={systemSettings}
          notificationSettings={notificationSettings}
        />
      </div>
    </div>
  );
}
