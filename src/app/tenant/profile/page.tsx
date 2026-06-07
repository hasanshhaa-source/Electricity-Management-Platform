import { requireTenant } from '@/services/auth/authService';
import { getTenancyByUser } from '@/services/tenant/tenancyService';
import { createClient } from '@/lib/supabase/server';
import { PageHeader } from '@/components/shared/page-header';
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card';
import { Badge } from '@/components/ui/badge';
import { ProfileForm } from './profile-form';
import { Building2, DoorOpen } from 'lucide-react';

async function getFullUserProfile(userId: string) {
  const supabase = await createClient();
  const { data } = await supabase
    .from('users')
    .select('id, full_name, email, phone, national_id, role, is_active, created_at')
    .eq('id', userId)
    .single();
  return data;
}

export default async function ProfilePage() {
  const user = await requireTenant();

  const [profile, tenancyResult] = await Promise.all([
    getFullUserProfile(user.id),
    getTenancyByUser(user.id),
  ]);

  const tenancy = tenancyResult.data;
  const flat    = tenancy?.flat as any;
  const building = flat?.building as any;

  const initials = user.full_name
    .split(' ')
    .map((n: string) => n[0])
    .join('')
    .toUpperCase()
    .slice(0, 2);

  return (
    <div className="space-y-6">
      <PageHeader title="My Profile" description="Your account information and contact details" />

      <div className="grid grid-cols-1 gap-5 lg:grid-cols-3">
        {/* Left: avatar + role */}
        <div className="space-y-5">
          <Card>
            <CardContent className="pt-6 flex flex-col items-center text-center gap-3">
              <div className="flex h-20 w-20 items-center justify-center rounded-full bg-green-100 text-3xl font-bold text-green-700">
                {initials}
              </div>
              <div>
                <p className="text-lg font-semibold text-gray-900">{user.full_name}</p>
                <p className="text-sm text-gray-500">{user.email}</p>
              </div>
              <Badge variant="secondary">Tenant</Badge>
              <p className="text-xs text-gray-400">
                Member since {new Date(profile?.created_at ?? '').toLocaleDateString('en-GB', { month: 'long', year: 'numeric' })}
              </p>
            </CardContent>
          </Card>

          {/* Account info */}
          <Card>
            <CardHeader>
              <CardTitle className="text-sm">Account</CardTitle>
            </CardHeader>
            <CardContent className="space-y-2 text-sm">
              <div className="flex justify-between">
                <span className="text-gray-500">Email</span>
                <span className="font-medium text-gray-900 truncate max-w-[160px]" title={user.email}>{user.email}</span>
              </div>
              <div className="flex justify-between">
                <span className="text-gray-500">Status</span>
                <Badge variant={user.is_active ? 'success' : 'destructive'} className="text-xs">
                  {user.is_active ? 'Active' : 'Inactive'}
                </Badge>
              </div>
            </CardContent>
          </Card>
        </div>

        {/* Right: editable info + flat details */}
        <div className="lg:col-span-2 space-y-5">
          {/* Editable profile */}
          <Card>
            <CardHeader>
              <CardTitle>Personal Information</CardTitle>
            </CardHeader>
            <CardContent>
              <ProfileForm
                initialValues={{
                  full_name:   profile?.full_name   ?? user.full_name,
                  phone:       profile?.phone        ?? null,
                  national_id: profile?.national_id  ?? null,
                }}
              />
            </CardContent>
          </Card>

          {/* Flat & building info */}
          {tenancy && (
            <Card>
              <CardHeader>
                <CardTitle className="flex items-center gap-2">
                  <Building2 className="h-4 w-4 text-gray-400" />Building &amp; Flat
                </CardTitle>
              </CardHeader>
              <CardContent className="space-y-3 text-sm">
                {building && (
                  <>
                    <div className="flex justify-between">
                      <span className="text-gray-500">Building</span>
                      <span className="font-medium text-gray-900">{building.name}</span>
                    </div>
                    <div className="flex justify-between">
                      <span className="text-gray-500">Address</span>
                      <span className="font-medium text-gray-900 text-right max-w-[200px]">
                        {building.address}, {building.city}
                      </span>
                    </div>
                  </>
                )}
                {flat && (
                  <>
                    <div className="flex justify-between">
                      <span className="text-gray-500">Flat Number</span>
                      <span className="font-medium text-gray-900 flex items-center gap-1">
                        <DoorOpen className="h-3.5 w-3.5 text-gray-400" />
                        Flat {flat.flat_number}
                      </span>
                    </div>
                    {flat.floor != null && (
                      <div className="flex justify-between">
                        <span className="text-gray-500">Floor</span>
                        <span className="font-medium text-gray-900">Floor {flat.floor}</span>
                      </div>
                    )}
                    {flat.area_sqm && (
                      <div className="flex justify-between">
                        <span className="text-gray-500">Area</span>
                        <span className="font-medium text-gray-900">{flat.area_sqm} m²</span>
                      </div>
                    )}
                  </>
                )}
                {tenancy.start_date && (
                  <div className="flex justify-between">
                    <span className="text-gray-500">Tenancy Start</span>
                    <span className="font-medium text-gray-900">
                      {new Date(tenancy.start_date).toLocaleDateString('en-GB', { day: '2-digit', month: 'long', year: 'numeric' })}
                    </span>
                  </div>
                )}
              </CardContent>
            </Card>
          )}
        </div>
      </div>
    </div>
  );
}
