import { requireTenant } from '@/services/auth/authService';
import { getTenancyByUser } from '@/services/tenant/tenancyService';
import { PageHeader } from '@/components/shared/page-header';
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card';
import { TenancyStatusBadge } from '@/components/shared/status-badge';
import { Alert, AlertDescription, AlertTitle } from '@/components/ui/alert';
import { Button } from '@/components/ui/button';
import Link from 'next/link';
import { Building2, DoorOpen, FileText, MessageSquare, Clock, CheckCircle2 } from 'lucide-react';

export default async function TenantDashboardPage() {
  const user = await requireTenant();
  const { data: tenancy } = await getTenancyByUser(user.id);

  return (
    <div className="space-y-6">
      <PageHeader
        title={`Welcome, ${user.full_name.split(' ')[0]}`}
        description="Your electricity management overview"
      />

      {/* Tenancy Status Banner */}
      {!tenancy ? (
        <Alert variant="warning">
          <Clock className="h-4 w-4" />
          <AlertTitle>No flat assigned</AlertTitle>
          <AlertDescription className="flex items-center gap-4">
            <span>You haven&apos;t requested a flat yet.</span>
            <Button asChild size="sm" variant="warning">
              <Link href="/tenant/my-flat">Request a Flat</Link>
            </Button>
          </AlertDescription>
        </Alert>
      ) : tenancy.status === 'pending' ? (
        <Alert variant="warning">
          <Clock className="h-4 w-4" />
          <AlertTitle>Request pending approval</AlertTitle>
          <AlertDescription>
            Your request for Flat {tenancy.flat?.flat_number} at{' '}
            {(tenancy.flat as any)?.building?.name} is awaiting admin approval.
          </AlertDescription>
        </Alert>
      ) : tenancy.status === 'active' ? (
        <Alert variant="success">
          <CheckCircle2 className="h-4 w-4" />
          <AlertTitle>Tenancy active</AlertTitle>
          <AlertDescription>
            You are assigned to Flat {tenancy.flat?.flat_number} at{' '}
            {(tenancy.flat as any)?.building?.name}.
            {tenancy.start_date && ` Since ${new Date(tenancy.start_date).toLocaleDateString()}.`}
          </AlertDescription>
        </Alert>
      ) : null}

      {/* Quick Actions */}
      <div className="grid grid-cols-1 gap-4 sm:grid-cols-2 lg:grid-cols-4">
        {[
          {
            title: 'My Flat',
            description: 'View flat details and assignment',
            href: '/tenant/my-flat',
            icon: DoorOpen,
            color: 'bg-blue-50 text-blue-600',
          },
          {
            title: 'My Bills',
            description: 'View and track electricity bills',
            href: '/tenant/my-bills',
            icon: FileText,
            color: 'bg-green-50 text-green-600',
          },
          {
            title: 'Complaints',
            description: 'Submit or view your complaints',
            href: '/tenant/complaints',
            icon: MessageSquare,
            color: 'bg-amber-50 text-amber-600',
          },
          {
            title: 'Building Info',
            description: 'Learn about your building',
            href: '/tenant/my-flat',
            icon: Building2,
            color: 'bg-purple-50 text-purple-600',
          },
        ].map((action) => (
          <Link key={action.href + action.title} href={action.href}>
            <Card className="cursor-pointer hover:shadow-md transition-shadow h-full">
              <CardContent className="p-5">
                <div className={`flex h-10 w-10 items-center justify-center rounded-lg ${action.color}`}>
                  <action.icon className="h-5 w-5" />
                </div>
                <h3 className="mt-3 font-semibold text-gray-900">{action.title}</h3>
                <p className="mt-0.5 text-sm text-gray-500">{action.description}</p>
              </CardContent>
            </Card>
          </Link>
        ))}
      </div>

      {/* Flat Details Card */}
      {tenancy?.status === 'active' && (
        <div className="grid grid-cols-1 gap-4 lg:grid-cols-2">
          <Card>
            <CardHeader>
              <CardTitle>Your Flat</CardTitle>
            </CardHeader>
            <CardContent className="space-y-3">
              <div className="flex justify-between text-sm">
                <span className="text-gray-500">Building</span>
                <span className="font-medium text-gray-900">
                  {(tenancy.flat as any)?.building?.name}
                </span>
              </div>
              <div className="flex justify-between text-sm">
                <span className="text-gray-500">City</span>
                <span className="font-medium text-gray-900">
                  {(tenancy.flat as any)?.building?.city}
                </span>
              </div>
              <div className="flex justify-between text-sm">
                <span className="text-gray-500">Flat Number</span>
                <span className="font-medium text-gray-900">{tenancy.flat?.flat_number}</span>
              </div>
              {tenancy.flat?.floor != null && (
                <div className="flex justify-between text-sm">
                  <span className="text-gray-500">Floor</span>
                  <span className="font-medium text-gray-900">Floor {tenancy.flat.floor}</span>
                </div>
              )}
              <div className="flex justify-between text-sm">
                <span className="text-gray-500">Status</span>
                <TenancyStatusBadge status={tenancy.status} />
              </div>
              {tenancy.start_date && (
                <div className="flex justify-between text-sm">
                  <span className="text-gray-500">Since</span>
                  <span className="font-medium text-gray-900">
                    {new Date(tenancy.start_date).toLocaleDateString()}
                  </span>
                </div>
              )}
            </CardContent>
          </Card>
        </div>
      )}
    </div>
  );
}
