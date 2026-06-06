import { requireTenant } from '@/services/auth/authService';
import { getTenancyByUser } from '@/services/tenant/tenancyService';
import { createClient } from '@/lib/supabase/server';
import { PageHeader } from '@/components/shared/page-header';
import { BillStatusBadge } from '@/components/shared/status-badge';
import { EmptyState } from '@/components/shared/empty-state';
import { Card, CardContent } from '@/components/ui/card';
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from '@/components/ui/table';
import { Alert, AlertDescription, AlertTitle } from '@/components/ui/alert';
import { FileText, AlertTriangle } from 'lucide-react';

async function getTenantBills(flatId: string) {
  const supabase = await createClient();
  const { data } = await supabase
    .from('flat_bills')
    .select(`
      id, status, total_due, amount_paid, outstanding_balance,
      current_charges, previous_balance, due_date, paid_at,
      billed_units, rate_per_unit,
      billing_cycle:billing_cycles(period_year, period_month)
    `)
    .eq('flat_id', flatId)
    .eq('is_current_version', true)
    .order('created_at', { ascending: false });
  return data ?? [];
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
          <AlertDescription>
            You need an approved flat assignment to view bills.
          </AlertDescription>
        </Alert>
      </div>
    );
  }

  const bills = await getTenantBills(tenancy.flat_id);

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
        <Card>
          <CardContent className="p-0">
            <Table>
              <TableHeader>
                <TableRow>
                  <TableHead>Period</TableHead>
                  <TableHead>Units</TableHead>
                  <TableHead>Current Charges</TableHead>
                  <TableHead>Previous Balance</TableHead>
                  <TableHead>Total Due</TableHead>
                  <TableHead>Amount Paid</TableHead>
                  <TableHead>Outstanding</TableHead>
                  <TableHead>Due Date</TableHead>
                  <TableHead>Status</TableHead>
                </TableRow>
              </TableHeader>
              <TableBody>
                {bills.map((bill: any) => (
                  <TableRow key={bill.id}>
                    <TableCell className="font-medium text-gray-900">
                      {new Date(bill.billing_cycle.period_year, bill.billing_cycle.period_month - 1)
                        .toLocaleDateString('en-US', { month: 'long', year: 'numeric' })}
                    </TableCell>
                    <TableCell>{Number(bill.billed_units).toFixed(1)} kWh</TableCell>
                    <TableCell>{Number(bill.current_charges).toFixed(2)}</TableCell>
                    <TableCell className={bill.previous_balance > 0 ? 'text-red-600' : ''}>
                      {Number(bill.previous_balance).toFixed(2)}
                    </TableCell>
                    <TableCell className="font-semibold">
                      {Number(bill.total_due).toFixed(2)}
                    </TableCell>
                    <TableCell className="text-green-600">
                      {Number(bill.amount_paid).toFixed(2)}
                    </TableCell>
                    <TableCell className={bill.outstanding_balance > 0 ? 'font-semibold text-red-600' : 'text-green-600'}>
                      {Number(bill.outstanding_balance).toFixed(2)}
                    </TableCell>
                    <TableCell className="text-sm text-gray-500">
                      {new Date(bill.due_date).toLocaleDateString()}
                    </TableCell>
                    <TableCell>
                      <BillStatusBadge status={bill.status} />
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
