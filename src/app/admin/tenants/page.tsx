import Link from 'next/link';
import { requireAdmin } from '@/services/auth/authService';
import { getAllTenants } from '@/services/tenant/tenantService';
import { PageHeader } from '@/components/shared/page-header';
import { TenancyStatusBadge } from '@/components/shared/status-badge';
import { EmptyState } from '@/components/shared/empty-state';
import { Button } from '@/components/ui/button';
import { Badge } from '@/components/ui/badge';
import { Card, CardContent } from '@/components/ui/card';
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from '@/components/ui/table';
import { Users, Plus } from 'lucide-react';

export default async function TenantsPage() {
  await requireAdmin();
  const { data: tenants } = await getAllTenants();

  return (
    <div className="space-y-6">
      <PageHeader
        title="Tenants"
        description="All registered tenant accounts"
        action={
          <Button asChild>
            <Link href="/admin/tenants/new"><Plus className="h-4 w-4" />Add Tenant</Link>
          </Button>
        }
      />

      {!tenants || tenants.length === 0 ? (
        <EmptyState
          icon={<Users className="h-8 w-8" />}
          title="No tenants yet"
          description="Add tenants manually or they can register themselves"
          action={<Button asChild><Link href="/admin/tenants/new">Add Tenant</Link></Button>}
        />
      ) : (
        <Card>
          <CardContent className="p-0">
            <Table>
              <TableHeader>
                <TableRow>
                  <TableHead>Name</TableHead>
                  <TableHead>Email</TableHead>
                  <TableHead>Mobile</TableHead>
                  <TableHead>National ID</TableHead>
                  <TableHead>Building / Flat</TableHead>
                  <TableHead>Move-in</TableHead>
                  <TableHead>Tenancy</TableHead>
                  <TableHead>Account</TableHead>
                  <TableHead className="text-right">Actions</TableHead>
                </TableRow>
              </TableHeader>
              <TableBody>
                {tenants.map((tenant) => {
                  const t = tenant.active_tenancy as any;
                  return (
                    <TableRow key={tenant.id}>
                      <TableCell className="font-medium">{tenant.full_name}</TableCell>
                      <TableCell className="text-sm text-gray-600">{tenant.email}</TableCell>
                      <TableCell className="text-sm text-gray-600">{tenant.phone ?? '—'}</TableCell>
                      <TableCell className="text-sm text-gray-600">{tenant.national_id ?? '—'}</TableCell>
                      <TableCell>
                        {t ? (
                          <div>
                            <p className="text-sm font-medium">{(t.flat as any)?.building?.name}</p>
                            <p className="text-xs text-gray-500">Flat {(t.flat as any)?.flat_number}</p>
                          </div>
                        ) : <span className="text-xs text-gray-400">Unassigned</span>}
                      </TableCell>
                      <TableCell className="text-sm text-gray-500">
                        {t?.start_date ? new Date(t.start_date).toLocaleDateString() : '—'}
                      </TableCell>
                      <TableCell>
                        {t ? <TenancyStatusBadge status={t.status} /> : <Badge variant="secondary">None</Badge>}
                      </TableCell>
                      <TableCell>
                        <Badge variant={tenant.is_active ? 'success' : 'destructive'}>
                          {tenant.is_active ? 'Active' : 'Inactive'}
                        </Badge>
                      </TableCell>
                      <TableCell className="text-right">
                        <Button asChild variant="outline" size="sm">
                          <Link href={`/admin/tenants/${tenant.id}`}>Manage</Link>
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
