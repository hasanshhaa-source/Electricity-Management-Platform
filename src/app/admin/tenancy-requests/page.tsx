import { requireAdmin } from '@/services/auth/authService';
import { getAllTenancies } from '@/services/tenant/tenancyService';
import { PageHeader } from '@/components/shared/page-header';
import { TenancyStatusBadge } from '@/components/shared/status-badge';
import { EmptyState } from '@/components/shared/empty-state';
import {
  Table, TableBody, TableCell, TableHead, TableHeader, TableRow,
} from '@/components/ui/table';
import { Card, CardContent } from '@/components/ui/card';
import { TenancyActions } from './tenancy-actions';
import { ClipboardList } from 'lucide-react';

export default async function TenancyRequestsPage() {
  const admin = await requireAdmin();
  const { data: tenancies, error } = await getAllTenancies();

  return (
    <div className="space-y-6">
      <PageHeader
        title="Tenancy Requests"
        description="Review and manage flat assignment requests from tenants"
      />

      {error ? (
        <p className="text-sm text-red-600">Failed to load tenancies: {error}</p>
      ) : !tenancies || tenancies.length === 0 ? (
        <EmptyState
          icon={<ClipboardList className="h-8 w-8" />}
          title="No tenancy requests"
          description="Requests will appear here when tenants sign up and select a flat"
        />
      ) : (
        <Card>
          <CardContent className="p-0">
            <Table>
              <TableHeader>
                <TableRow>
                  <TableHead>Tenant</TableHead>
                  <TableHead>Building</TableHead>
                  <TableHead>Flat</TableHead>
                  <TableHead>Status</TableHead>
                  <TableHead>Requested</TableHead>
                  <TableHead>Actions</TableHead>
                </TableRow>
              </TableHeader>
              <TableBody>
                {tenancies.map((t) => (
                  <TableRow key={t.id}>
                    <TableCell>
                      <div>
                        <p className="font-medium text-gray-900">{t.user?.full_name}</p>
                        <p className="text-xs text-gray-500">{t.user?.email}</p>
                      </div>
                    </TableCell>
                    <TableCell className="text-gray-700">
                      {(t.flat as any)?.building?.name ?? '—'}
                    </TableCell>
                    <TableCell className="font-medium">
                      Flat {t.flat?.flat_number}
                      {t.flat?.floor != null ? ` (Floor ${t.flat.floor})` : ''}
                    </TableCell>
                    <TableCell>
                      <TenancyStatusBadge status={t.status} />
                    </TableCell>
                    <TableCell className="text-sm text-gray-500">
                      {new Date(t.created_at).toLocaleDateString()}
                    </TableCell>
                    <TableCell>
                      <TenancyActions tenancy={t} adminId={admin.id} />
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
