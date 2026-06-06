import { redirect } from 'next/navigation';
import { requireTenant } from '@/services/auth/authService';
import { TenantSidebar } from '@/components/tenant/tenant-sidebar';
import { TenantHeader } from '@/components/tenant/tenant-header';

export default async function TenantLayout({ children }: { children: React.ReactNode }) {
  let user;
  try {
    user = await requireTenant();
  } catch {
    redirect('/login');
  }

  return (
    <div className="flex h-screen overflow-hidden bg-gray-50">
      <div className="hidden lg:flex lg:flex-shrink-0">
        <TenantSidebar />
      </div>

      <div className="flex flex-1 flex-col overflow-hidden">
        <TenantHeader user={user} />
        <main className="flex-1 overflow-y-auto p-6">
          {children}
        </main>
      </div>
    </div>
  );
}
