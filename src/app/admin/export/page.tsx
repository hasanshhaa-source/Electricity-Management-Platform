import { requireAdmin } from '@/services/auth/authService';
import { PageHeader } from '@/components/shared/page-header';
import { ExportPanel } from './export-panel';

export default async function ExportPage() {
  await requireAdmin();
  return (
    <div className="space-y-6">
      <PageHeader
        title="Export Data"
        description="Download platform data as CSV for reporting, backup, or external analysis"
      />
      <ExportPanel />
    </div>
  );
}
