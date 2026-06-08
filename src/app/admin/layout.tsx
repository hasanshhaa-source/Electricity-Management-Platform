import { redirect } from 'next/navigation';
import { requireAdmin } from '@/services/auth/authService';
import { AdminLayoutShell } from '@/components/admin/admin-layout-shell';
import { createClient } from '@/lib/supabase/server';

async function getPendingTenancyCount(): Promise<number> {
  const supabase = await createClient();
  const { count } = await supabase
    .from('tenancies')
    .select('*', { count: 'exact', head: true })
    .eq('status', 'pending');
  return count ?? 0;
}

export default async function AdminLayout({ children }: { children: React.ReactNode }) {
  let user;
  try {
    user = await requireAdmin();
  } catch {
    redirect('/login');
  }

  const pendingCount = await getPendingTenancyCount();

  return (
    <AdminLayoutShell user={user} pendingCount={pendingCount}>
      {children}
    </AdminLayoutShell>
  );
}
