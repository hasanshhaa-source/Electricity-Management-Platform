import { requireAdmin } from '@/services/auth/authService';
import { getBillsAdmin, markOverdueBills } from '@/services/billing/paymentService';
import { createClient } from '@/lib/supabase/server';
import { PageHeader } from '@/components/shared/page-header';
import { BillsTable } from './bills-table';

type Props = { searchParams: Promise<Record<string, string>> };

export default async function PaymentsPage({ searchParams }: Props) {
  await requireAdmin();

  const params = await searchParams;
  const buildingId  = params.building ?? '';
  const periodYear  = params.year   ? parseInt(params.year,  10) : undefined;
  const periodMonth = params.month  ? parseInt(params.month, 10) : undefined;
  const status      = params.status ?? '';
  const search      = params.search ?? '';

  // Auto-advance eligible unpaid/partial bills to overdue
  await markOverdueBills();

  const supabase = await createClient();
  const { data: buildings } = await supabase
    .from('buildings')
    .select('id, name')
    .eq('is_active', true)
    .is('deleted_at', null)
    .order('name');

  const result = await getBillsAdmin({
    buildingId:  buildingId  || undefined,
    periodYear,
    periodMonth,
    status:      status      || undefined,
    search:      search      || undefined,
  });

  return (
    <div className="space-y-6">
      <PageHeader
        title="Payments & Bills"
        description="Track outstanding balances, record tenant payments, and view overdue bills"
      />
      <BillsTable
        bills={result.data ?? []}
        buildings={buildings ?? []}
        filters={{ buildingId, periodYear, periodMonth, status, search }}
      />
    </div>
  );
}
