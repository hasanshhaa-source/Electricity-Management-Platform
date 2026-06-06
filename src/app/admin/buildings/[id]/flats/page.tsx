import { notFound } from 'next/navigation';
import Link from 'next/link';
import { requireAdmin } from '@/services/auth/authService';
import { getBuildingById, getFlatsByBuilding } from '@/services/building/buildingService';
import { createClient } from '@/lib/supabase/server';
import { PageHeader } from '@/components/shared/page-header';
import { FlatStatusBadge } from '@/components/shared/status-badge';
import { Button } from '@/components/ui/button';
import { Card, CardContent } from '@/components/ui/card';
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from '@/components/ui/table';
import { ChevronLeft } from 'lucide-react';
import { FlatsToolbar } from './flats-toolbar';

type Props = { params: Promise<{ id: string }> };

async function getFlatsWithTenants(buildingId: string) {
  const supabase = await createClient();
  const { data } = await supabase
    .from('flats')
    .select(`
      *,
      tenancies(
        id, status, start_date,
        user:users(id, full_name, email)
      )
    `)
    .eq('building_id', buildingId)
    .is('deleted_at', null)
    .order('floor', { nullsFirst: true })
    .order('flat_number');
  return data ?? [];
}

export default async function BuildingFlatsPage({ params }: Props) {
  await requireAdmin();
  const { id } = await params;

  const buildingResult = await getBuildingById(id);
  if (buildingResult.error || !buildingResult.data) notFound();
  const building = buildingResult.data;
  const flats = await getFlatsWithTenants(id);

  return (
    <div className="space-y-6">
      <div>
        <Link href={`/admin/buildings/${id}`} className="inline-flex items-center gap-1 text-sm text-gray-500 hover:text-gray-700 mb-2">
          <ChevronLeft className="h-4 w-4" />{building.name}
        </Link>
        <PageHeader
          title="Flats Management"
          description={`${flats.length} flats in ${building.name}`}
        />
      </div>

      <FlatsToolbar buildingId={id} buildingName={building.name} />

      <Card>
        <CardContent className="p-0">
          <Table>
            <TableHeader>
              <TableRow>
                <TableHead>Flat No.</TableHead>
                <TableHead>Floor</TableHead>
                <TableHead>Area</TableHead>
                <TableHead>Status</TableHead>
                <TableHead>Current Tenant</TableHead>
                <TableHead>Move-in Date</TableHead>
                <TableHead>Notes</TableHead>
                <TableHead className="text-right">Actions</TableHead>
              </TableRow>
            </TableHeader>
            <TableBody>
              {flats.map((flat: any) => {
                const activeTenancy = flat.tenancies?.find((t: any) => t.status === 'active');
                return (
                  <TableRow key={flat.id}>
                    <TableCell className="font-semibold">{flat.flat_number}</TableCell>
                    <TableCell>{flat.floor != null ? `Floor ${flat.floor}` : '—'}</TableCell>
                    <TableCell>{flat.area_sqm != null ? `${flat.area_sqm} m²` : '—'}</TableCell>
                    <TableCell><FlatStatusBadge status={flat.status} /></TableCell>
                    <TableCell>
                      {activeTenancy ? (
                        <div>
                          <p className="text-sm font-medium text-gray-900">{activeTenancy.user?.full_name}</p>
                          <p className="text-xs text-gray-500">{activeTenancy.user?.email}</p>
                        </div>
                      ) : <span className="text-xs text-gray-400">—</span>}
                    </TableCell>
                    <TableCell className="text-sm text-gray-500">
                      {activeTenancy?.start_date ? new Date(activeTenancy.start_date).toLocaleDateString() : '—'}
                    </TableCell>
                    <TableCell className="text-xs text-gray-500 max-w-[140px] truncate">{flat.notes ?? '—'}</TableCell>
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
    </div>
  );
}
