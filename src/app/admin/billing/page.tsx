import Link from 'next/link';
import { requireAdmin } from '@/services/auth/authService';
import { getCycles } from '@/services/billing/cycleService';
import { getBuildings } from '@/services/building/buildingService';
import { PageHeader } from '@/components/shared/page-header';
import { CycleStatusBadge } from '@/components/shared/status-badge';
import { EmptyState } from '@/components/shared/empty-state';
import { Button } from '@/components/ui/button';
import { Card, CardContent } from '@/components/ui/card';
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from '@/components/ui/table';
import { Receipt, Plus } from 'lucide-react';

const MONTH_NAMES = [
  'January', 'February', 'March', 'April', 'May', 'June',
  'July', 'August', 'September', 'October', 'November', 'December',
];

type Props = { searchParams: Promise<{ building?: string }> };

export default async function BillingPage({ searchParams }: Props) {
  await requireAdmin();
  const { building: buildingFilter } = await searchParams;

  const [cyclesResult, buildingsResult] = await Promise.all([
    getCycles(buildingFilter || undefined),
    getBuildings(),
  ]);
  const cycles   = cyclesResult.data   ?? [];
  const buildings = buildingsResult.data ?? [];

  return (
    <div className="space-y-6">
      <PageHeader
        title="Billing Cycles"
        description="Manage monthly billing cycles and meter readings"
        action={
          <Button asChild>
            <Link href="/admin/billing/new"><Plus className="h-4 w-4" />New Cycle</Link>
          </Button>
        }
      />

      {/* Building filter */}
      {buildings.length > 1 && (
        <div className="flex items-center gap-2 flex-wrap">
          <span className="text-sm text-gray-500">Filter:</span>
          <Link
            href="/admin/billing"
            className={`rounded-full px-3 py-1 text-xs font-medium transition-colors ${!buildingFilter ? 'bg-gray-900 text-white' : 'bg-gray-100 text-gray-700 hover:bg-gray-200'}`}
          >
            All buildings
          </Link>
          {buildings.map((b) => (
            <Link
              key={b.id}
              href={`/admin/billing?building=${b.id}`}
              className={`rounded-full px-3 py-1 text-xs font-medium transition-colors ${buildingFilter === b.id ? 'bg-gray-900 text-white' : 'bg-gray-100 text-gray-700 hover:bg-gray-200'}`}
            >
              {b.name}
            </Link>
          ))}
        </div>
      )}

      {cycles.length === 0 ? (
        <EmptyState
          icon={<Receipt className="h-8 w-8" />}
          title="No billing cycles yet"
          description="Create a billing cycle to start collecting meter readings"
          action={<Button asChild><Link href="/admin/billing/new">New Cycle</Link></Button>}
        />
      ) : (
        <Card>
          <CardContent className="p-0">
            <Table>
              <TableHeader>
                <TableRow>
                  <TableHead>Building</TableHead>
                  <TableHead>Period</TableHead>
                  <TableHead>Status</TableHead>
                  <TableHead>Notes</TableHead>
                  <TableHead>Created</TableHead>
                  <TableHead className="text-right">Actions</TableHead>
                </TableRow>
              </TableHeader>
              <TableBody>
                {cycles.map((cycle) => (
                  <TableRow key={cycle.id}>
                    <TableCell className="font-medium">{(cycle.building as any)?.name}</TableCell>
                    <TableCell>
                      {MONTH_NAMES[cycle.period_month - 1]} {cycle.period_year}
                    </TableCell>
                    <TableCell><CycleStatusBadge status={cycle.status} /></TableCell>
                    <TableCell className="text-sm text-gray-500 max-w-[200px] truncate">
                      {cycle.notes ?? '—'}
                    </TableCell>
                    <TableCell className="text-sm text-gray-500">
                      {new Date(cycle.created_at).toLocaleDateString()}
                    </TableCell>
                    <TableCell className="text-right">
                      <Button asChild variant="outline" size="sm">
                        <Link href={`/admin/billing/${cycle.id}`}>
                          {cycle.status === 'draft' || cycle.status === 'readings_collected' ? 'Enter Readings' : 'View'}
                        </Link>
                      </Button>
                    </TableCell>
                  </TableRow>
                ))}
              </TableBody>
            </Table>
          </CardContent>
        </Card>
      )}
    </div>
  );
}
