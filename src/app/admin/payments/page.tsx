import { requireAdmin } from '@/services/auth/authService';
import { PageHeader } from '@/components/shared/page-header';
import { Card, CardContent } from '@/components/ui/card';
import { Construction } from 'lucide-react';

export default async function Page() {
  await requireAdmin();
  return (
    <div className="space-y-6">
      <PageHeader title="Module" description="Coming soon" />
      <Card>
        <CardContent className="flex flex-col items-center justify-center py-16 gap-3">
          <Construction className="h-10 w-10 text-amber-500" />
          <p className="text-base font-semibold text-gray-700">Coming in Sprint 2</p>
          <p className="text-sm text-gray-500">This module will be built in the next sprint.</p>
        </CardContent>
      </Card>
    </div>
  );
}
