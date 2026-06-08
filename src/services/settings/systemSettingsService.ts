import { createAdminClient } from '@/lib/supabase/admin';

export interface SystemSettings {
  id: string;
  default_currency: string;
  timezone: string;
  default_language: string;
  default_diff_method: 'proportional' | 'equal' | 'manual';
  default_due_date_days: number;
  decimal_places: 2 | 4;
  allow_manual_override: boolean;
  allow_self_registration: boolean;
  require_admin_approval: boolean;
  allowed_payment_methods: string[];
  require_payment_reference: boolean;
  allow_partial_payments: boolean;
  updated_at: string;
}

export async function getSystemSettings(): Promise<SystemSettings> {
  const supabase = createAdminClient();
  const { data, error } = await supabase
    .from('system_settings')
    .select('*')
    .single();

  if (error || !data) {
    // Return defaults if table is empty (shouldn't happen after migration)
    return {
      id: '',
      default_currency: 'SAR',
      timezone: 'Asia/Riyadh',
      default_language: 'en',
      default_diff_method: 'proportional',
      default_due_date_days: 14,
      decimal_places: 2,
      allow_manual_override: true,
      allow_self_registration: true,
      require_admin_approval: true,
      allowed_payment_methods: ['cash', 'bank_transfer', 'stc_pay', 'online', 'other'],
      require_payment_reference: false,
      allow_partial_payments: true,
      updated_at: new Date().toISOString(),
    };
  }
  return data as SystemSettings;
}

export async function updateSystemSettings(
  id: string,
  updates: Partial<Omit<SystemSettings, 'id' | 'updated_at'>>,
): Promise<{ data: SystemSettings | null; error: string | null }> {
  const supabase = createAdminClient();
  const { data, error } = await supabase
    .from('system_settings')
    .update({ ...updates, updated_at: new Date().toISOString() })
    .eq('id', id)
    .select('*')
    .single();

  if (error) return { data: null, error: error.message };
  return { data: data as SystemSettings, error: null };
}
