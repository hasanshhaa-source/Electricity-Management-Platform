/**
 * Service-role Supabase client — no cookie dependency.
 * Use in cron jobs, background tasks, and notification dispatch
 * where there is no HTTP request context.
 *
 * NEVER expose this to the browser.
 */
import { createClient } from '@supabase/supabase-js';

export function createAdminClient() {
  return createClient(
    process.env.NEXT_PUBLIC_SUPABASE_URL!,
    process.env.SUPABASE_SERVICE_ROLE_KEY!,
    { auth: { autoRefreshToken: false, persistSession: false } },
  );
}
