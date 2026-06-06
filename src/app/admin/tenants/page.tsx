import { requireAdmin } from '@/services/auth/authService';
import { createClient } from '@/lib/supabase/server';
import { PageHeader } from '@/components/shared/page-header';
import { TenancyStatusBadge } from '@/components/shared/status-badge';
import { EmptyState } from '@/components/shared/empty-state';
import { Card, CardContent } from '@/components/ui/card';
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from '@/components/ui/table';
import { Badge } from '@/components/ui/badge';
import { Users } from 'lucide-react';

async function getTenantsWithTenancy() {
  const supabase = await createClient();
  const { data } = await supabase
    .from('users')
    .select(`
      id, email, full_name, phone, is_active, created_at,
      tenancies(
        id, status, start_date,
        flat:flats(
          id, flat_number, floor,
          building:buildings(id, name)
        )
      )
    `)
    .eq('role', 'tenant')
    .is('deleted_at', null)
    .order('created_at', { ascending: false });

  return data ?? [];
}

export default async function TenantsPage() {
  await requireAdmin();
  const tenants = await getTenantsWithTenancy();

  return (
    <div className="space-y-6">
      <PageHeader
        title="Tenants"
        description="All registered tenant accounts"
      />

      {tenants.length === 0 ? (
        <EmptyState
          icon={<Users className="h-8 w-8" />}
          title="No tenants yet"
          description="Tenants will appear here after they register"
        />
      ) : (
        <Card>
          <CardContent className="p-0">
            <Table>
              <TableHeader>
                <TableRow>
                  <TableHead>Name</TableHead>
                  <TableHead>Email</TableHead>
                  <TableHead>Phone</TableHead>
                  <TableHead>Building / Flat</TableHead>
                  <TableHead>Tenancy Status</TableHead>
                  <TableHead>Account</TableHead>
                  <TableHead>Registered</TableHead>
                </TableRow>
              </TableHeader>
              <TableBody>
                {tenants.map((tenant: any) => {
                  const activeTenancy = tenant.tenancies?.find(
                    (t: any) => t.status === 'active'
                  ) ?? tenant.tenancies?.find(
                    (t: any) => t.status === 'pending'
                  ) ?? tenant.tenancies?.[0];

                  return (
                    <TableRow key={tenant.id}>
                      <TableCell className="font-medium text-gray-900">
                        {tenant.full_name}
                      </TableCell>
                      <TableCell className="text-gray-600">{tenant.email}</TableCell>
                      <TableCell className="text-gray-600">{tenant.phone ?? '—'}</TableCell>
                      <TableCell>
                        {activeTenancy ? (
                          <div>
                            <p className="text-sm font-medium text-gray-900">
                              {activeTenancy.flat?.building?.name}
                            </p>
                            <p className="text-xs text-gray-500">
                              Flat {activeTenancy.flat?.flat_number}
                              {activeTenancy.flat?.floor != null
                                ? ` — Floor ${activeTenancy.flat.floor}`
                                : ''}
                            </p>
                          </div>
                        ) : (
                          <span className="text-xs text-gray-400">No flat assigned</span>
                        )}
                      </TableCell>
                      <TableCell>
                        {activeTenancy ? (
                          <TenancyStatusBadge status={activeTenancy.status} />
                        ) : (
                          <Badge variant="secondary">None</Badge>
                        )}
                      </TableCell>
                      <TableCell>
                        <Badge variant={tenant.is_active ? 'success' : 'destructive'}>
                          {tenant.is_active ? 'Active' : 'Inactive'}
                        </Badge>
                      </TableCell>
                      <TableCell className="text-sm text-gray-500">
                        {new Date(tenant.created_at).toLocaleDateString()}
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
