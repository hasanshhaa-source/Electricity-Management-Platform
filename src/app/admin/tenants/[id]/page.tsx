import { notFound } from 'next/navigation';
import Link from 'next/link';
import { requireAdmin } from '@/services/auth/authService';
import { getTenantById } from '@/services/tenant/tenantService';
import { createClient } from '@/lib/supabase/server';
import { PageHeader } from '@/components/shared/page-header';
import { TenancyStatusBadge } from '@/components/shared/status-badge';
import { TenantForm } from '@/components/admin/tenant-form';
import { Badge } from '@/components/ui/badge';
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card';
import { ChevronLeft } from 'lucide-react';
import { TenantActions } from './tenant-actions';

type Props = { params: Promise<{ id: string }> };

async function getTenancyHistory(userId: string) {
  const supabase = await createClient();
  const { data } = await supabase
    .from('tenancies')
    .select(`
      id, status, start_date, end_date, notes,
      flat:flats(flat_number, floor, building:buildings(name, city))
    `)
    .eq('user_id', userId)
    .order('created_at', { ascending: false });
  return data ?? [];
}

export default async function TenantDetailPage({ params }: Props) {
  const admin = await requireAdmin();
  const { id } = await params;

  const result = await getTenantById(id);
  if (result.error || !result.data) notFound();
  const tenant = result.data;
  const tenancyHistory = await getTenancyHistory(id);
  const activeTenancy = (tenancyHistory as any[]).find((t) => t.status === 'active');

  return (
    <div className="space-y-6">
      <div>
        <Link href="/admin/tenants" className="inline-flex items-center gap-1 text-sm text-gray-500 hover:text-gray-700 mb-2">
          <ChevronLeft className="h-4 w-4" />Tenants
        </Link>
        <PageHeader
          title={tenant.full_name}
          description={tenant.email}
          action={
            <Badge variant={tenant.is_active ? 'success' : 'destructive'}>
              {tenant.is_active ? 'Active' : 'Inactive'}
            </Badge>
          }
        />
      </div>

      <div className="grid grid-cols-1 gap-6 lg:grid-cols-3">
        {/* Edit form */}
        <div className="lg:col-span-2">
          <TenantForm tenant={tenant} />
        </div>

        {/* Flat assignment */}
        <div className="space-y-4">
          <Card>
            <CardHeader><CardTitle>Current Flat</CardTitle></CardHeader>
            <CardContent className="space-y-3">
              {activeTenancy ? (
                <>
                  <div className="rounded-lg bg-gray-50 p-3 space-y-2">
                    <p className="font-medium text-gray-900">{(activeTenancy.flat as any)?.building?.name}</p>
                    <p className="text-sm text-gray-600">
                      Flat {(activeTenancy.flat as any)?.flat_number}
                      {(activeTenancy.flat as any)?.floor != null ? ` — Floor ${(activeTenancy.flat as any).floor}` : ''}
                    </p>
                    <p className="text-sm text-gray-500">
                      Since {activeTenancy.start_date ? new Date(activeTenancy.start_date).toLocaleDateString() : 'N/A'}
                    </p>
                    <TenancyStatusBadge status={activeTenancy.status} />
                  </div>
                </>
              ) : (
                <p className="text-sm text-gray-500">No active flat assignment.</p>
              )}
              <TenantActions
                userId={id}
                userName={tenant.full_name}
                activeTenancyId={activeTenancy?.id}
              />
            </CardContent>
          </Card>
        </div>
      </div>

      {/* Tenancy History */}
      <Card>
        <CardHeader><CardTitle>Tenancy History</CardTitle></CardHeader>
        <CardContent>
          {tenancyHistory.length === 0 ? (
            <p className="text-sm text-gray-500">No tenancy history.</p>
          ) : (
            <div className="space-y-3">
              {(tenancyHistory as any[]).map((t) => (
                <div key={t.id} className="flex items-start justify-between rounded-lg border border-gray-100 p-3">
                  <div>
                    <p className="font-medium text-gray-900">
                      {t.flat?.building?.name} — Flat {t.flat?.flat_number}
                    </p>
                    <p className="text-xs text-gray-500">
                      {t.start_date ? new Date(t.start_date).toLocaleDateString() : 'N/A'}
                      {t.end_date ? ` → ${new Date(t.end_date).toLocaleDateString()}` : ' → Present'}
                    </p>
                    {t.notes && <p className="text-xs text-gray-400 mt-0.5">{t.notes}</p>}
                  </div>
                  <TenancyStatusBadge status={t.status} />
                </div>
              ))}
            </div>
          )}
        </CardContent>
      </Card>
    </div>
  );
}
