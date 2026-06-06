import { requireAdmin } from '@/services/auth/authService';
import { PageHeader } from '@/components/shared/page-header';
import { TenantForm } from '@/components/admin/tenant-form';

export default async function NewTenantPage() {
  await requireAdmin();
  return (
    <div className="space-y-6">
      <PageHeader title="Add Tenant" description="Create a new tenant account" />
      <TenantForm />
    </div>
  );
}
