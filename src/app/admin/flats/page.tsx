import { requireAdmin } from '@/services/auth/authService';
import { createClient } from '@/lib/supabase/server';
import { PageHeader } from '@/components/shared/page-header';
import { FlatStatusBadge } from '@/components/shared/status-badge';
import { EmptyState } from '@/components/shared/empty-state';
import { Card, CardContent } from '@/components/ui/card';
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from '@/components/ui/table';
import { DoorOpen } from 'lucide-react';

async function getAllFlats() {
  const supabase = await createClient();
  const { data } = await supabase
    .from('flats')
    .select(`
      *,
      building:buildings(id, name, city),
      tenancies(
        id, status, user:users(full_name, email)
      )
    `)
    .is('deleted_at', null)
    .eq('is_active', true)
    .order('flat_number');
  return data ?? [];
}

export default async function FlatsPage() {
  await requireAdmin();
  const flats = await getAllFlats();

  return (
    <div className="space-y-6">
      <PageHeader
        title="All Flats"
        description="View and manage all flats across buildings"
      />

      {flats.length === 0 ? (
        <EmptyState
          icon={<DoorOpen className="h-8 w-8" />}
          title="No flats found"
          description="Add buildings first, then add flats to them"
        />
      ) : (
        <Card>
          <CardContent className="p-0">
            <Table>
              <TableHeader>
                <TableRow>
                  <TableHead>Flat No.</TableHead>
                  <TableHead>Building</TableHead>
                  <TableHead>Floor</TableHead>
                  <TableHead>Area</TableHead>
                  <TableHead>Status</TableHead>
                  <TableHead>Current Tenant</TableHead>
                </TableRow>
              </TableHeader>
              <TableBody>
                {flats.map((flat: any) => {
                  const activeTenancy = flat.tenancies?.find((t: any) => t.status === 'active');
                  return (
                    <TableRow key={flat.id}>
                      <TableCell className="font-semibold text-gray-900">
                        {flat.flat_number}
                      </TableCell>
                      <TableCell>
                        <div>
                          <p className="font-medium text-gray-900">{flat.building?.name}</p>
                          <p className="text-xs text-gray-500">{flat.building?.city}</p>
                        </div>
                      </TableCell>
                      <TableCell className="text-gray-600">
                        {flat.floor != null ? `Floor ${flat.floor}` : '—'}
                      </TableCell>
                      <TableCell className="text-gray-600">
                        {flat.area_sqm != null ? `${flat.area_sqm} m²` : '—'}
                      </TableCell>
                      <TableCell>
                        <FlatStatusBadge status={flat.status} />
                      </TableCell>
                      <TableCell>
                        {activeTenancy ? (
                          <div>
                            <p className="text-sm font-medium text-gray-900">
                              {activeTenancy.user?.full_name}
                            </p>
                            <p className="text-xs text-gray-500">
                              {activeTenancy.user?.email}
                            </p>
                          </div>
                        ) : (
                          <span className="text-xs text-gray-400">—</span>
                        )}
                      </TableCell>
                    </TableRow>
                  );
                })}
              </TableBody>
            </Table>
          </CardContent>
        </Card>
      )}
    </div>
  );
}
