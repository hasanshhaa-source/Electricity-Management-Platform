import { requireTenant } from '@/services/auth/authService';
import { getTenancyByUser } from '@/services/tenant/tenancyService';
import { createClient } from '@/lib/supabase/server';
import { PageHeader } from '@/components/shared/page-header';
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card';
import { TenancyStatusBadge } from '@/components/shared/status-badge';
import { Alert, AlertDescription, AlertTitle } from '@/components/ui/alert';
import { Button } from '@/components/ui/button';
import Link from 'next/link';
import { Building2, MapPin, Clock } from 'lucide-react';
import { FlatRequestForm } from './flat-request-form';

async function getBuildings() {
  const supabase = await createClient();
  const { data } = await supabase
    .from('buildings')
    .select('id, name, city')
    .eq('is_active', true)
    .is('deleted_at', null)
    .order('name');
  return data ?? [];
}

export default async function MyFlatPage() {
  const user = await requireTenant();
  const { data: tenancy } = await getTenancyByUser(user.id);
  const buildings = await getBuildings();

  return (
    <div className="space-y-6">
      <PageHeader
        title="My Flat"
        description="Your current flat assignment and tenancy details"
      />

      {!tenancy ? (
        <div className="space-y-4">
          <Alert variant="warning">
            <Clock className="h-4 w-4" />
            <AlertTitle>No flat assigned</AlertTitle>
            <AlertDescription>
              Request a flat by selecting your building and available unit below.
            </AlertDescription>
          </Alert>
          <FlatRequestForm buildings={buildings} />
        </div>
      ) : tenancy.status === 'pending' ? (
        <Card>
          <CardContent className="p-6">
            <div className="flex items-start gap-4">
              <div className="flex h-12 w-12 items-center justify-center rounded-full bg-amber-100">
                <Clock className="h-6 w-6 text-amber-600" />
              </div>
              <div className="flex-1">
                <div className="flex items-center justify-between">
                  <h3 className="font-semibold text-gray-900">Request Pending Approval</h3>
                  <TenancyStatusBadge status={tenancy.status} />
                </div>
                <p className="mt-2 text-sm text-gray-600">
                  Your request for <strong>Flat {tenancy.flat?.flat_number}</strong> at{' '}
                  <strong>{(tenancy.flat as any)?.building?.name}</strong> is being reviewed.
                  The admin will approve or reject your request shortly.
                </p>
                <p className="mt-1 text-xs text-gray-400">
                  Requested on {new Date(tenancy.created_at).toLocaleDateString()}
                </p>
              </div>
            </div>
          </CardContent>
        </Card>
      ) : tenancy.status === 'active' ? (
        <Card>
          <CardHeader>
            <CardTitle className="flex items-center gap-2">
              <Building2 className="h-5 w-5 text-blue-600" />
              Flat Details
            </CardTitle>
          </CardHeader>
          <CardContent>
            <div className="space-y-4">
              <div className="flex items-center gap-2 text-gray-600">
                <MapPin className="h-4 w-4 flex-shrink-0" />
                <span className="text-sm">
                  {(tenancy.flat as any)?.building?.address ?? (tenancy.flat as any)?.building?.city}
                </span>
              </div>
              <div className="grid grid-cols-2 gap-4 rounded-lg bg-gray-50 p-4">
                {[
                  { label: 'Building',    value: (tenancy.flat as any)?.building?.name },
                  { label: 'City',        value: (tenancy.flat as any)?.building?.city },
                  { label: 'Flat Number', value: tenancy.flat?.flat_number },
                  { label: 'Floor',       value: tenancy.flat?.floor != null ? `Floor ${tenancy.flat.floor}` : '—' },
                  { label: 'Area',        value: tenancy.flat?.area_sqm ? `${tenancy.flat.area_sqm} m²` : '—' },
                  { label: 'Start Date',  value: tenancy.start_date ? new Date(tenancy.start_date).toLocaleDateString() : '—' },
                ].map((item) => (
                  <div key={item.label}>
                    <p className="text-xs text-gray-500">{item.label}</p>
                    <p className="font-medium text-gray-900">{item.value}</p>
                  </div>
                ))}
              </div>
              <div className="flex items-center justify-between pt-2">
                <span className="text-sm text-gray-500">Tenancy Status</span>
                <TenancyStatusBadge status={tenancy.status} />
              </div>
            </div>
          </CardContent>
        </Card>
      ) : (
        <Alert variant="destructive">
          <AlertTitle>Tenancy Ended or Rejected</AlertTitle>
          <AlertDescription>
            Your tenancy is no longer active. Contact your admin for assistance.
          </AlertDescription>
        </Alert>
      )}
    </div>
  );
}
