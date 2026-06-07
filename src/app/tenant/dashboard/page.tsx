import { requireTenant } from '@/services/auth/authService';
import { getTenancyByUser } from '@/services/tenant/tenancyService';
import { getTenantBillsWithPayments } from '@/services/billing/paymentService';
import { createClient } from '@/lib/supabase/server';
import { PageHeader } from '@/components/shared/page-header';
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card';
import { TenancyStatusBadge, BillStatusBadge } from '@/components/shared/status-badge';
import { Alert, AlertDescription, AlertTitle } from '@/components/ui/alert';
import { Button } from '@/components/ui/button';
import Link from 'next/link';
import {
  Building2, DoorOpen, FileText, MessageSquare, Clock,
  CheckCircle2, AlertTriangle, CreditCard, Zap, TrendingDown, TrendingUp,
} from 'lucide-react';

const MONTH_NAMES = [
  'Jan', 'Feb', 'Mar', 'Apr', 'May', 'Jun',
  'Jul', 'Aug', 'Sep', 'Oct', 'Nov', 'Dec',
];

function fmt(n: number, d = 2) {
  return n.toLocaleString('en', { minimumFractionDigits: d, maximumFractionDigits: d });
}

async function getBuildingCurrency(buildingId: string) {
  const supabase = await createClient();
  const { data } = await supabase.from('buildings').select('currency').eq('id', buildingId).single();
  return data?.currency ?? 'SAR';
}

export default async function TenantDashboardPage() {
  const user = await requireTenant();
  const { data: tenancy } = await getTenancyByUser(user.id);

  // Fetch billing data when tenant is active
  let bills: Awaited<ReturnType<typeof getTenantBillsWithPayments>> = [];
  let currency = 'SAR';

  if (tenancy?.status === 'active') {
    [bills, currency] = await Promise.all([
      getTenantBillsWithPayments(tenancy.flat_id),
      getBuildingCurrency((tenancy.flat as any)?.building_id ?? (tenancy.flat as any)?.building?.id ?? ''),
    ]);
  }

  const currentBill    = bills.find((b) => b.status !== 'paid' && b.status !== 'waived') ?? bills[0] ?? null;
  const prevBill       = bills.length >= 2 ? bills[1] : null;
  const totalOutstanding = bills.reduce((s, b) => s + b.outstandingBalance, 0);
  const lastPayment    = bills.flatMap((b) => b.payments).sort((a, b) =>
    new Date(b.paidAt).getTime() - new Date(a.paidAt).getTime()
  )[0] ?? null;

  const consumptionTrend = currentBill && prevBill && prevBill.billedUnits > 0
    ? ((currentBill.billedUnits - prevBill.billedUnits) / prevBill.billedUnits) * 100
    : null;

  return (
    <div className="space-y-6">
      <PageHeader
        title={`Welcome, ${user.full_name.split(' ')[0]}`}
        description="Your electricity management overview"
      />

      {/* Tenancy status banner */}
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
      ) : tenancy.status === 'active' && totalOutstanding > 0 ? (
        <Alert variant={bills.some(b => b.status === 'overdue') ? 'destructive' : 'warning'}>
          <AlertTriangle className="h-4 w-4" />
          <AlertTitle>Outstanding balance: {currency} {fmt(totalOutstanding)}</AlertTitle>
          <AlertDescription className="flex items-center gap-4">
            <span>Please settle your outstanding bills before the due date.</span>
            <Button asChild size="sm" variant="outline">
              <Link href="/tenant/my-bills">View Bills</Link>
            </Button>
          </AlertDescription>
        </Alert>
      ) : tenancy.status === 'active' ? (
        <Alert variant="success">
          <CheckCircle2 className="h-4 w-4" />
          <AlertTitle>All bills paid</AlertTitle>
          <AlertDescription>
            You are assigned to Flat {tenancy.flat?.flat_number} at{' '}
            {(tenancy.flat as any)?.building?.name}.
          </AlertDescription>
        </Alert>
      ) : null}

      {/* Billing stats — shown only when active tenancy with bills */}
      {tenancy?.status === 'active' && currentBill && (
        <div className="grid grid-cols-2 gap-4 lg:grid-cols-4">
          {/* Current bill */}
          <Link href="/tenant/current-bill" className="block">
            <div className="rounded-lg border border-gray-200 bg-white p-5 hover:shadow-sm transition-shadow h-full">
              <div className="flex items-center justify-between mb-3">
                <p className="text-xs font-medium text-gray-500 uppercase tracking-wide">Current Bill</p>
                <div className="flex h-9 w-9 items-center justify-center rounded-lg bg-blue-50">
                  <FileText className="h-4 w-4 text-blue-600" />
                </div>
              </div>
              <p className="text-2xl font-bold text-gray-900">{currency} {fmt(currentBill.totalDue)}</p>
              <p className="text-xs text-gray-500 mt-1">
                {MONTH_NAMES[currentBill.periodMonth - 1]} {currentBill.periodYear}
              </p>
              <div className="mt-2">
                <BillStatusBadge status={currentBill.status as any} />
              </div>
            </div>
          </Link>

          {/* Outstanding */}
          <div className="rounded-lg border border-gray-200 bg-white p-5 h-full">
            <div className="flex items-center justify-between mb-3">
              <p className="text-xs font-medium text-gray-500 uppercase tracking-wide">Outstanding</p>
              <div className={`flex h-9 w-9 items-center justify-center rounded-lg ${totalOutstanding > 0 ? 'bg-red-50' : 'bg-green-50'}`}>
                <CreditCard className={`h-4 w-4 ${totalOutstanding > 0 ? 'text-red-500' : 'text-green-600'}`} />
              </div>
            </div>
            <p className={`text-2xl font-bold ${totalOutstanding > 0 ? 'text-red-600' : 'text-green-600'}`}>
              {currency} {fmt(totalOutstanding)}
            </p>
            {currentBill.dueDate && (
              <p className="text-xs text-gray-500 mt-1">
                Due {new Date(currentBill.dueDate).toLocaleDateString('en-GB', { day: '2-digit', month: 'short', year: 'numeric' })}
              </p>
            )}
          </div>

          {/* Consumption */}
          <div className="rounded-lg border border-gray-200 bg-white p-5 h-full">
            <div className="flex items-center justify-between mb-3">
              <p className="text-xs font-medium text-gray-500 uppercase tracking-wide">Consumption</p>
              <div className="flex h-9 w-9 items-center justify-center rounded-lg bg-amber-50">
                <Zap className="h-4 w-4 text-amber-500" />
              </div>
            </div>
            <p className="text-2xl font-bold text-gray-900">{fmt(currentBill.billedUnits, 1)} <span className="text-base font-normal text-gray-500">kWh</span></p>
            {consumptionTrend !== null && (
              <p className={`text-xs font-medium mt-1 flex items-center gap-1 ${consumptionTrend > 0 ? 'text-red-500' : 'text-green-600'}`}>
                {consumptionTrend > 0
                  ? <TrendingUp className="h-3 w-3" />
                  : <TrendingDown className="h-3 w-3" />}
                {consumptionTrend > 0 ? '+' : ''}{consumptionTrend.toFixed(1)}% vs last month
              </p>
            )}
          </div>

          {/* Last payment */}
          <div className="rounded-lg border border-gray-200 bg-white p-5 h-full">
            <div className="flex items-center justify-between mb-3">
              <p className="text-xs font-medium text-gray-500 uppercase tracking-wide">Last Payment</p>
              <div className="flex h-9 w-9 items-center justify-center rounded-lg bg-green-50">
                <CheckCircle2 className="h-4 w-4 text-green-600" />
              </div>
            </div>
            {lastPayment ? (
              <>
                <p className="text-2xl font-bold text-green-600">{currency} {fmt(lastPayment.amount)}</p>
                <p className="text-xs text-gray-500 mt-1">
                  {new Date(lastPayment.paidAt).toLocaleDateString('en-GB', { day: '2-digit', month: 'short', year: 'numeric' })}
                </p>
              </>
            ) : (
              <p className="text-sm text-gray-400 mt-2">No payments yet</p>
            )}
          </div>
        </div>
      )}

      {/* No bills yet prompt */}
      {tenancy?.status === 'active' && bills.length === 0 && (
        <div className="rounded-lg border border-dashed border-gray-200 py-10 text-center">
          <FileText className="h-8 w-8 text-gray-300 mx-auto mb-2" />
          <p className="text-sm text-gray-500">No bills generated yet. Check back after the admin completes billing for your period.</p>
        </div>
      )}

      {/* Quick actions */}
      <div className="grid grid-cols-1 gap-4 sm:grid-cols-2 lg:grid-cols-4">
        {[
          { title: 'Current Bill', description: 'View your latest electricity bill', href: '/tenant/current-bill', icon: FileText, color: 'bg-blue-50 text-blue-600' },
          { title: 'My Flat', description: 'View flat and building details', href: '/tenant/my-flat', icon: DoorOpen, color: 'bg-indigo-50 text-indigo-600' },
          { title: 'Bill History', description: 'View all previous bills', href: '/tenant/my-bills', icon: CreditCard, color: 'bg-green-50 text-green-600' },
          { title: 'Complaints', description: 'Submit a complaint or request', href: '/tenant/complaints', icon: MessageSquare, color: 'bg-amber-50 text-amber-600' },
        ].map((action) => (
          <Link key={action.href} href={action.href}>
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

      {/* Flat & building details */}
      {tenancy?.status === 'active' && (
        <Card>
          <CardHeader>
            <CardTitle className="flex items-center gap-2">
              <Building2 className="h-4 w-4 text-gray-400" /> Your Flat
            </CardTitle>
          </CardHeader>
          <CardContent>
            <div className="grid grid-cols-2 gap-x-8 gap-y-3 text-sm sm:grid-cols-3">
              {[
                { label: 'Building',     value: (tenancy.flat as any)?.building?.name },
                { label: 'City',         value: (tenancy.flat as any)?.building?.city },
                { label: 'Flat Number',  value: `Flat ${tenancy.flat?.flat_number}` },
                { label: 'Floor',        value: tenancy.flat?.floor != null ? `Floor ${tenancy.flat.floor}` : null },
                { label: 'Status',       value: null, badge: <TenancyStatusBadge status={tenancy.status} /> },
                { label: 'Since',        value: tenancy.start_date ? new Date(tenancy.start_date).toLocaleDateString() : null },
              ].filter((r) => r.value !== undefined || r.badge).map((row) => (
                <div key={row.label}>
                  <p className="text-xs text-gray-500">{row.label}</p>
                  {row.badge ? row.badge : <p className="font-medium text-gray-900 mt-0.5">{row.value ?? '—'}</p>}
                </div>
              ))}
            </div>
          </CardContent>
        </Card>
      )}
    </div>
  );
}
