import Link from 'next/link';
import { requireAdmin } from '@/services/auth/authService';
import { getAllMeters } from '@/services/meter/meterService';
import { PageHeader } from '@/components/shared/page-header';
import { MeterTypeBadge } from '@/components/shared/meter-type-badge';
import { EmptyState } from '@/components/shared/empty-state';
import { Button } from '@/components/ui/button';
import { Badge } from '@/components/ui/badge';
import { Card, CardContent } from '@/components/ui/card';
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from '@/components/ui/table';
import { Zap, Plus } from 'lucide-react';

export default async function MetersPage() {
  await requireAdmin();
  const { data: meters } = await getAllMeters();

  return (
    <div className="space-y-6">
      <PageHeader
        title="Meters"
        description="Electricity meters across all buildings"
        action={
          <Button asChild>
            <Link href="/admin/meters/new"><Plus className="h-4 w-4" />Add Meter</Link>
          </Button>
        }
      />

      {!meters || meters.length === 0 ? (
        <EmptyState
          icon={<Zap className="h-8 w-8" />}
          title="No meters yet"
          description="Add electricity meters to track usage across your buildings"
          action={<Button asChild><Link href="/admin/meters/new">Add Meter</Link></Button>}
        />
      ) : (
        <Card>
          <CardContent className="p-0">
            <Table>
              <TableHeader>
                <TableRow>
                  <TableHead>Meter Number</TableHead>
                  <TableHead>Building</TableHead>
                  <TableHead>Type</TableHead>
                  <TableHead>Unit</TableHead>
                  <TableHead>Description</TableHead>
                  <TableHead>Status</TableHead>
                  <TableHead className="text-right">Actions</TableHead>
                </TableRow>
              </TableHeader>
              <TableBody>
                {meters.map((meter) => (
                  <TableRow key={meter.id}>
                    <TableCell className="font-medium">{meter.meter_number}</TableCell>
                    <TableCell>
                      <div>
                        <p className="text-sm font-medium">{meter.building.name}</p>
                        <p className="text-xs text-gray-500">{meter.building.city}</p>
                      </div>
                    </TableCell>
                    <TableCell><MeterTypeBadge type={meter.meter_type} /></TableCell>
                    <TableCell className="text-sm text-gray-600">{meter.unit}</TableCell>
                    <TableCell className="text-sm text-gray-500 max-w-[200px] truncate">{meter.description ?? '—'}</TableCell>
                    <TableCell>
                      <Badge variant={meter.is_active ? 'success' : 'secondary'}>
                        {meter.is_active ? 'Active' : 'Inactive'}
                      </Badge>
                    </TableCell>
                    <TableCell className="text-right space-x-2">
                      {meter.meter_type === 'shared' && (
                        <Button asChild variant="outline" size="sm">
                          <Link href={`/admin/meters/${meter.id}?tab=allocations`}>Allocations</Link>
                        </Button>
                      )}
                      <Button asChild variant="outline" size="sm">
                        <Link href={`/admin/meters/${meter.id}`}>Manage</Link>
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
