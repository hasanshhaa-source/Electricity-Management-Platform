import { requireTenant } from '@/services/auth/authService';
import { getTenancyByUser } from '@/services/tenant/tenancyService';
import { createClient } from '@/lib/supabase/server';
import { getTenantBillsWithPayments } from '@/services/billing/paymentService';
import { PageHeader } from '@/components/shared/page-header';
import { EmptyState } from '@/components/shared/empty-state';
import { Alert, AlertDescription, AlertTitle } from '@/components/ui/alert';
import { FileText, AlertTriangle, CheckCircle2 } from 'lucide-react';
import { BillCard } from './bill-card';

async function getBuildingCurrency(buildingId: string): Promise<string> {
  const supabase = await createClient();
  const { data } = await supabase
    .from('buildings')
    .select('currency')
    .eq('id', buildingId)
    .single();
  return data?.currency ?? 'SAR';
}

export default async function MyBillsPage() {
  const user = await requireTenant();
  const { data: tenancy } = await getTenancyByUser(user.id);

  if (!tenancy || tenancy.status !== 'active') {
    return (
      <div className="space-y-6">
        <PageHeader title="My Bills" description="Your electricity bills" />
        <Alert variant="warning">
          <AlertTriangle className="h-4 w-4" />
          <AlertTitle>No active tenancy</AlertTitle>
          <AlertDescription>You need an approved flat assignment to view bills.</AlertDescription>
        </Alert>
      </div>
    );
  }

  const [bills, currency] = await Promise.all([
    getTenantBillsWithPayments(tenancy.flat_id),
    getBuildingCurrency((tenancy.flat as any)?.building_id ?? ''),
  ]);

  const outstandingBills = bills.filter(
    (b) => b.status === 'unpaid' || b.status === 'partial' || b.status === 'overdue',
  );
  const settledBills = bills.filter(
    (b) => b.status === 'paid' || b.status === 'waived',
  );

  const totalOutstanding = outstandingBills.reduce((s, b) => s + b.outstandingBalance, 0);
  const hasOverdue       = outstandingBills.some((b) => b.status === 'overdue');

  return (
    <div className="space-y-6">
      <PageHeader
        title="My Bills"
        description={`Electricity bills for Flat ${tenancy.flat?.flat_number}`}
      />

      {bills.length === 0 ? (
        <EmptyState
          icon={<FileText className="h-8 w-8" />}
          title="No bills yet"
          description="Bills will appear here once your admin generates them for the billing period"
        />
      ) : (
        <>
          {/* Outstanding summary */}
          {totalOutstanding > 0 && (
            <div className={`rounded-lg border p-4 ${hasOverdue ? 'border-red-200 bg-red-50' : 'border-amber-100 bg-amber-50'}`}>
              <div className="flex items-start gap-3">
                <AlertTriangle className={`h-5 w-5 mt-0.5 flex-shrink-0 ${hasOverdue ? 'text-red-500' : 'text-amber-500'}`} />
                <div>
                  <p className={`font-semibold ${hasOverdue ? 'text-red-700' : 'text-amber-700'}`}>
                    Outstanding Balance: {currency} {totalOutstanding.toLocaleString('en', { minimumFractionDigits: 2, maximumFractionDigits: 2 })}
                  </p>
                  {hasOverdue && (
                    <p className="text-sm text-red-600 mt-0.5">
                      You have overdue bills. Please contact your building admin to arrange payment.
                    </p>
                  )}
                  {!hasOverdue && (
                    <p className="text-sm text-amber-600 mt-0.5">
                      Please arrange payment before the due date to avoid overdue charges.
                    </p>
                  )}
                </div>
              </div>
            </div>
          )}

          {totalOutstanding === 0 && bills.length > 0 && (
            <div className="flex items-center gap-2 rounded-lg border border-green-200 bg-green-50 px-4 py-3 text-sm text-green-700">
              <CheckCircle2 className="h-4 w-4 flex-shrink-0" />
              All bills are paid. Great work keeping your account up to date!
            </div>
          )}

          {/* Outstanding bills */}
          {outstandingBills.length > 0 && (
            <section className="space-y-3">
              <h2 className="text-sm font-semibold text-gray-700 uppercase tracking-wide">
                Outstanding Bills ({outstandingBills.length})
              </h2>
              {outstandingBills.map((bill) => (
                <BillCard key={bill.id} bill={bill} currency={currency} />
              ))}
            </section>
          )}

          {/* Paid / settled bills */}
          {settledBills.length > 0 && (
            <section className="space-y-3">
              <h2 className="text-sm font-semibold text-gray-500 uppercase tracking-wide">
                Payment History ({settledBills.length})
              </h2>
              {settledBills.map((bill) => (
                <BillCard key={bill.id} bill={bill} currency={currency} />
              ))}
            </section>
          )}
        </>
      )}
    </div>
  );
}
