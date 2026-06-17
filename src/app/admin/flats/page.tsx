import Link from 'next/link';
import { requireAdmin } from '@/services/auth/authService';
import { createClient } from '@/lib/supabase/server';
import { PageHeader } from '@/components/shared/page-header';
import { FlatStatusBadge } from '@/components/shared/status-badge';
import { EmptyState } from '@/components/shared/empty-state';
import { Card, CardContent } from '@/components/ui/card';
import { Button } from '@/components/ui/button';
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from '@/components/ui/table';
import { DoorOpen } from 'lucide-react';

async function getAllFlats() {
  const supabase = await createClient();
  const { data } = await supabase
    .from('flats')
    .select(`
      *,
      building:buildings(id, name, city),
      tenancies(id, status, user:users!user_id(full_name, email))
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
      <PageHeader title="All Flats" description="View and manage flats across all buildings" />

      {flats.length === 0 ? (
        <EmptyState
          icon={<DoorOpen className="h-8 w-8" />}
          title="No flats found"
          description="Add buildings first, then add flats to them"
          action={<Button asChild><Link href="/admin/buildings">Go to Buildings</Link></Button>}
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
                  <TableHead className="text-right">Actions</TableHead>
                </TableRow>
              </TableHeader>
              <TableBody>
                {flats.map((flat: any) => {
                  const activeTenancy = flat.tenancies?.find((t: any) => t.status === 'active');
                  return (
                    <TableRow key={flat.id}>
                      <TableCell className="font-semibold">{flat.flat_number}</TableCell>
                      <TableCell>
                        <Link href={`/admin/buildings/${flat.building_id}`} className="font-medium text-blue-600 hover:underline">
                          {flat.building?.name}
                        </Link>
                        <p className="text-xs text-gray-500">{flat.building?.city}</p>
                      </TableCell>
                      <TableCell>{flat.floor != null ? `Floor ${flat.floor}` : '—'}</TableCell>
                      <TableCell>{flat.area_sqm != null ? `${flat.area_sqm} m²` : '—'}</TableCell>
                      <TableCell><FlatStatusBadge status={flat.status} /></TableCell>
                      <TableCell>
                        {activeTenancy ? (
                          <div>
                            <p className="text-sm font-medium">{activeTenancy.user?.full_name}</p>
                            <p className="text-xs text-gray-500">{activeTenancy.user?.email}</p>
                          </div>
                        ) : <span className="text-xs text-gray-400">—</span>}
                      </TableCell>
                      <TableCell className="text-right">
                        <Button asChild variant="outline" size="sm">
                          <Link href={`/admin/flats/${flat.id}`}>Edit</Link>
                        </Button>
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
