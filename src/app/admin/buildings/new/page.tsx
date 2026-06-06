import { requireAdmin } from '@/services/auth/authService';
import { PageHeader } from '@/components/shared/page-header';
import { BuildingForm } from '@/components/admin/building-form';

export default async function NewBuildingPage() {
  await requireAdmin();
  return (
    <div className="space-y-6">
      <PageHeader title="Add Building" description="Create a new building in the system" />
      <BuildingForm />
    </div>
  );
}
