import { redirect } from 'next/navigation';
import { requireAdmin } from '@/services/auth/authService';
import { AdminSidebar } from '@/components/admin/admin-sidebar';
import { AdminHeader } from '@/components/admin/admin-header';
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
    <div className="flex h-screen overflow-hidden bg-gray-50">
      <div className="hidden lg:flex lg:flex-shrink-0">
        <AdminSidebar pendingCount={pendingCount} />
      </div>

      <div className="flex flex-1 flex-col overflow-hidden">
        <AdminHeader user={user} />
        <main className="flex-1 overflow-y-auto p-6">
          {children}
        </main>
      </div>
    </div>
  );
}
