import { createClient } from '@/lib/supabase/server';
import { requireAdmin } from '@/services/auth/authService';
import { PageHeader } from '@/components/shared/page-header';
import { StatCard } from '@/components/ui/stat-card';
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card';
import { TenancyStatusBadge } from '@/components/shared/status-badge';
import { Building2, DoorOpen, Users, ClipboardList } from 'lucide-react';
import Link from 'next/link';
import { Button } from '@/components/ui/button';

async function getDashboardStats() {
  const supabase = await createClient();

  const [
    { count: buildings },
    { count: flats },
    { count: tenants },
    { count: pendingRequests },
    { data: recentRequests },
  ] = await Promise.all([
    supabase.from('buildings').select('*', { count: 'exact', head: true }).is('deleted_at', null).eq('is_active', true),
    supabase.from('flats').select('*', { count: 'exact', head: true }).is('deleted_at', null).eq('is_active', true),
    supabase.from('users').select('*', { count: 'exact', head: true }).eq('role', 'tenant').eq('is_active', true),
    supabase.from('tenancies').select('*', { count: 'exact', head: true }).eq('status', 'pending'),
    supabase.from('tenancies')
      .select(`
        id, status, created_at,
        user:users(full_name, email),
        flat:flats(flat_number, building:buildings(name))
      `)
      .order('created_at', { ascending: false })
      .limit(5),
  ]);

  return {
    buildings: buildings ?? 0,
    flats: flats ?? 0,
    tenants: tenants ?? 0,
    pendingRequests: pendingRequests ?? 0,
    recentRequests: recentRequests ?? [],
  };
}

export default async function AdminDashboardPage() {
  await requireAdmin();
  const stats = await getDashboardStats();

  return (
    <div className="space-y-6">
      <PageHeader
        title="Dashboard"
        description="Overview of your buildings and tenants"
      />

      <div className="grid grid-cols-1 gap-4 sm:grid-cols-2 lg:grid-cols-4">
        <StatCard
          title="Buildings"
          value={stats.buildings}
          icon={<Building2 className="h-5 w-5" />}
          description="Active buildings"
        />
        <StatCard
          title="Total Flats"
          value={stats.flats}
          icon={<DoorOpen className="h-5 w-5" />}
          description="Across all buildings"
        />
        <StatCard
          title="Active Tenants"
          value={stats.tenants}
          icon={<Users className="h-5 w-5" />}
          description="Registered tenant accounts"
        />
        <StatCard
          title="Pending Requests"
          value={stats.pendingRequests}
          icon={<ClipboardList className="h-5 w-5" />}
          description="Tenancy requests awaiting review"
        />
      </div>

      <Card>
        <CardHeader className="flex flex-row items-center justify-between">
          <CardTitle>Recent Tenancy Requests</CardTitle>
          <Button asChild variant="outline" size="sm">
            <Link href="/admin/tenancy-requests">View all</Link>
          </Button>
        </CardHeader>
        <CardContent>
          {stats.recentRequests.length === 0 ? (
            <p className="py-4 text-center text-sm text-gray-500">No pending requests</p>
          ) : (
            <div className="space-y-3">
              {stats.recentRequests.map((req: any) => (
                <div
                  key={req.id}
                  className="flex items-center justify-between rounded-lg border border-gray-100 p-3"
                >
                  <div>
                    <p className="text-sm font-medium text-gray-900">
                      {req.user?.full_name ?? 'Unknown'}
                    </p>
                    <p className="text-xs text-gray-500">
                      {req.flat?.building?.name} — Flat {req.flat?.flat_number}
                    </p>
                    <p className="text-xs text-gray-400">
                      {new Date(req.created_at).toLocaleDateString()}
                    </p>
                  </div>
                  <TenancyStatusBadge status={req.status} />
                </div>
              ))}
            </div>
          )}
        </CardContent>
      </Card>
    </div>
  );
}
