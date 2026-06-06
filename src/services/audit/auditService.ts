import { createAdminClient } from '@/lib/supabase/server';
import type { UserRole } from '@/types';

interface AuditEntry {
  entity_type: string;
  entity_id?: string;
  action: string;
  actor_id?: string;
  actor_role?: UserRole;
  old_data?: Record<string, unknown>;
  new_data?: Record<string, unknown>;
  ip_address?: string;
  metadata?: Record<string, unknown>;
}

export async function logAudit(entry: AuditEntry): Promise<void> {
  try {
    const supabase = await createAdminClient();
    await supabase.from('audit_logs').insert(entry);
  } catch (err) {
    // Audit failures should not break the main flow
    console.error('Audit log failed:', err);
  }
}
