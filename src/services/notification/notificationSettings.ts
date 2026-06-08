import { createClient } from '@/lib/supabase/server';

export interface NotificationSettings {
  id:                       string;
  admin_email:              string | null;
  sender_name:              string;
  sender_email:             string | null;
  overdue_reminders_enabled: boolean;
  reminder_frequency_days:  number;
  bill_issued_enabled:      boolean;
  payment_confirmed_enabled: boolean;
  complaint_notify_enabled: boolean;
}

export async function getNotificationSettings(): Promise<NotificationSettings> {
  const supabase = await createClient();
  const { data } = await supabase
    .from('notification_settings')
    .select('*')
    .limit(1)
    .single();

  if (!data) {
    // Return sensible defaults if the table row hasn't been seeded yet
    return {
      id:                        '',
      admin_email:               null,
      sender_name:               'ElectroManage',
      sender_email:              null,
      overdue_reminders_enabled: true,
      reminder_frequency_days:   3,
      bill_issued_enabled:       true,
      payment_confirmed_enabled: true,
      complaint_notify_enabled:  true,
    };
  }

  return data as NotificationSettings;
}

export async function updateNotificationSettings(
  id: string,
  updates: Partial<Omit<NotificationSettings, 'id'>>,
): Promise<{ error?: string }> {
  const supabase = await createClient();
  const { error } = await supabase
    .from('notification_settings')
    .update({ ...updates, updated_at: new Date().toISOString() })
    .eq('id', id);

  return { error: error?.message };
}
