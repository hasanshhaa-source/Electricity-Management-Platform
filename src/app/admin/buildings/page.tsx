import Link from 'next/link';
import { requireAdmin } from '@/services/auth/authService';
import { createClient } from '@/lib/supabase/server';
import { PageHeader } from '@/components/shared/page-header';
import { Button } from '@/components/ui/button';
import { Card, CardContent } from '@/components/ui/card';
import { Badge } from '@/components/ui/badge';
import { EmptyState } from '@/components/shared/empty-state';
import { Building2, MapPin, Plus, Zap, DoorOpen, Users } from 'lucide-react';

async function getBuildingsWithStats() {
  const supabase = await createClient();
  const { data } = await supabase
    .from('buildings')
    .select('*')
    .is('deleted_at', null)
    .order('name');

  if (!data) return [];

  return Promise.all(
    data.map(async (b) => {
      const [
        { count: totalFlats },
        { count: occupiedFlats },
        { count: meters },
        { count: pendingRequests },
      ] = await Promise.all([
        supabase.from('flats').select('*', { count: 'exact', head: true }).eq('building_id', b.id).is('deleted_at', null).eq('is_active', true),
        supabase.from('flats').select('*', { count: 'exact', head: true }).eq('building_id', b.id).eq('status', 'occupied'),
        supabase.from('meters').select('*', { count: 'exact', head: true }).eq('building_id', b.id).is('deleted_at', null),
        supabase.from('flats').select('id').eq('building_id', b.id).is('deleted_at', null).then(async ({ data: flatRows }) => {
          const ids = (flatRows ?? []).map((f: any) => f.id);
          if (ids.length === 0) return { count: 0 };
          return supabase.from('tenancies').select('id', { count: 'exact', head: true }).eq('status', 'pending').in('flat_id', ids);
        }),
      ]);
      return { ...b, totalFlats: totalFlats ?? 0, occupiedFlats: occupiedFlats ?? 0, meters: meters ?? 0, pendingRequests: pendingRequests ?? 0 };
    })
  );
}

export default async function BuildingsPage() {
  await requireAdmin();
  const buildings = await getBuildingsWithStats();

  return (
    <div className="space-y-6">
      <PageHeader
        title="Buildings"
        description="Manage all buildings and their properties"
        action={
          <Button asChild>
            <Link href="/admin/buildings/new"><Plus className="h-4 w-4" />Add Building</Link>
          </Button>
        }
      />

      {buildings.length === 0 ? (
        <EmptyState
          icon={<Building2 className="h-8 w-8" />}
          title="No buildings yet"
          description="Add your first building to get started"
          action={<Button asChild><Link href="/admin/buildings/new">Add Building</Link></Button>}
        />
      ) : (
        <div className="grid grid-cols-1 gap-4 sm:grid-cols-2 xl:grid-cols-3">
          {buildings.map((b) => (
            <Card key={b.id} className="hover:shadow-md transition-shadow">
              <CardContent className="p-6 space-y-4">
                <div className="flex items-start justify-between">
                  <div className="flex h-10 w-10 items-center justify-center rounded-lg bg-blue-50">
                    <Building2 className="h-5 w-5 text-blue-600" />
                  </div>
                  <div className="flex items-center gap-2">
                    {b.pendingRequests > 0 && (
                      <Badge variant="warning">{b.pendingRequests} pending</Badge>
                    )}
                    <Badge variant={b.is_active ? 'success' : 'secondary'}>
                      {b.is_active ? 'Active' : 'Inactive'}
                    </Badge>
                  </div>
                </div>

                <div>
                  <h3 className="font-semibold text-gray-900">{b.name}</h3>
                  <div className="mt-1 flex items-center gap-1 text-sm text-gray-500">
                    <MapPin className="h-3.5 w-3.5" />{b.city}, {b.country}
                  </div>
                  <p className="mt-0.5 text-xs text-gray-400 truncate">{b.address}</p>
                </div>

                <div className="grid grid-cols-3 gap-2 rounded-lg bg-gray-50 p-3">
                  <div className="text-center">
                    <div className="flex items-center justify-center gap-1">
                      <DoorOpen className="h-3.5 w-3.5 text-gray-400" />
                      <p className="text-base font-bold text-gray-900">{b.totalFlats}</p>
                    </div>
                    <p className="text-xs text-gray-500">Flats</p>
                  </div>
                  <div className="text-center">
                    <div className="flex items-center justify-center gap-1">
                      <Users className="h-3.5 w-3.5 text-gray-400" />
                      <p className="text-base font-bold text-blue-600">{b.occupiedFlats}</p>
                    </div>
                    <p className="text-xs text-gray-500">Occupied</p>
                  </div>
                  <div className="text-center">
                    <div className="flex items-center justify-center gap-1">
                      <Zap className="h-3.5 w-3.5 text-gray-400" />
                      <p className="text-base font-bold text-gray-900">{b.meters}</p>
                    </div>
                    <p className="text-xs text-gray-500">Meters</p>
                  </div>
                </div>

                <div className="text-xs text-gray-400">
                  Billing on day {b.billing_day} · {b.currency}
                </div>

                <div className="flex gap-2">
                  <Button asChild variant="default" size="sm" className="flex-1">
                    <Link href={`/admin/buildings/${b.id}`}>Manage</Link>
                  </Button>
                  <Button asChild variant="outline" size="sm" className="flex-1">
                    <Link href={`/admin/buildings/${b.id}/flats`}>Flats</Link>
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
