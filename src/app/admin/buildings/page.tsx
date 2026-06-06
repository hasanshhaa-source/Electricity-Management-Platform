import Link from 'next/link';
import { requireAdmin } from '@/services/auth/authService';
import { getBuildings } from '@/services/building/buildingService';
import { PageHeader } from '@/components/shared/page-header';
import { Button } from '@/components/ui/button';
import { Card, CardContent } from '@/components/ui/card';
import { Badge } from '@/components/ui/badge';
import { EmptyState } from '@/components/shared/empty-state';
import { Building2, MapPin, Plus } from 'lucide-react';
import { createClient } from '@/lib/supabase/server';

async function getBuildingsWithStats() {
  const supabase = await createClient();
  const { data: buildings } = await supabase
    .from('buildings')
    .select(`
      *,
      flats(count),
      flats!inner(count)
    `)
    .is('deleted_at', null)
    .eq('is_active', true)
    .order('name');

  // Simpler query: buildings + flat counts
  const { data } = await supabase
    .from('buildings')
    .select('*')
    .is('deleted_at', null)
    .eq('is_active', true)
    .order('name');

  if (!data) return [];

  const withCounts = await Promise.all(
    data.map(async (b) => {
      const { count: totalFlats } = await supabase
        .from('flats')
        .select('*', { count: 'exact', head: true })
        .eq('building_id', b.id)
        .is('deleted_at', null);

      const { count: occupiedFlats } = await supabase
        .from('flats')
        .select('*', { count: 'exact', head: true })
        .eq('building_id', b.id)
        .eq('status', 'occupied')
        .is('deleted_at', null);

      return { ...b, totalFlats: totalFlats ?? 0, occupiedFlats: occupiedFlats ?? 0 };
    })
  );

  return withCounts;
}

export default async function BuildingsPage() {
  await requireAdmin();
  const buildings = await getBuildingsWithStats();

  return (
    <div className="space-y-6">
      <PageHeader
        title="Buildings"
        description="Manage all buildings in the system"
        action={
          <Button asChild>
            <Link href="/admin/buildings/new">
              <Plus className="h-4 w-4" />
              Add Building
            </Link>
          </Button>
        }
      />

      {buildings.length === 0 ? (
        <EmptyState
          icon={<Building2 className="h-8 w-8" />}
          title="No buildings yet"
          description="Add your first building to get started"
          action={
            <Button asChild>
              <Link href="/admin/buildings/new">Add Building</Link>
            </Button>
          }
        />
      ) : (
        <div className="grid grid-cols-1 gap-4 sm:grid-cols-2 xl:grid-cols-3">
          {buildings.map((building) => (
            <Card key={building.id} className="hover:shadow-md transition-shadow">
              <CardContent className="p-6">
                <div className="flex items-start justify-between gap-4">
                  <div className="flex h-10 w-10 flex-shrink-0 items-center justify-center rounded-lg bg-blue-50">
                    <Building2 className="h-5 w-5 text-blue-600" />
                  </div>
                  <Badge variant={building.is_active ? 'success' : 'secondary'}>
                    {building.is_active ? 'Active' : 'Inactive'}
                  </Badge>
                </div>

                <h3 className="mt-4 text-base font-semibold text-gray-900">{building.name}</h3>
                <div className="mt-1 flex items-center gap-1 text-sm text-gray-500">
                  <MapPin className="h-3.5 w-3.5" />
                  {building.city}, {building.country}
                </div>

                <div className="mt-4 grid grid-cols-2 gap-3 rounded-lg bg-gray-50 p-3">
                  <div className="text-center">
                    <p className="text-lg font-bold text-gray-900">{building.totalFlats}</p>
                    <p className="text-xs text-gray-500">Total Flats</p>
                  </div>
                  <div className="text-center">
                    <p className="text-lg font-bold text-blue-600">{building.occupiedFlats}</p>
                    <p className="text-xs text-gray-500">Occupied</p>
                  </div>
                </div>

                <div className="mt-4 flex gap-2">
                  <Button asChild variant="outline" size="sm" className="flex-1">
                    <Link href={`/admin/buildings/${building.id}`}>View</Link>
                  </Button>
                  <Button asChild variant="outline" size="sm" className="flex-1">
                    <Link href={`/admin/buildings/${building.id}/flats`}>Flats</Link>
                  </Button>
                </div>
              </CardContent>
            </Card>
          ))}
        </div>
      )}
    </div>
  );
}
