import { createClient } from '@/lib/supabase/server';
import type { ApiResponse, Payment } from '@/types';
import type { PaymentInput } from '@/lib/validation/billing';

// ─── Row shapes returned to UI ────────────────────────────────────────────────

export interface PaymentWithRecorder extends Payment {
  recorder_name: string;
}

export interface AdminBillRow {
  id:                   string;
  flatId:               string;
  flatNumber:           string;
  buildingId:           string;
  buildingName:         string;
  tenancyId:            string;
  tenantName:           string;
  tenantEmail:          string;
  periodYear:           number;
  periodMonth:          number;
  billedUnits:          number;
  currentCharges:       number;
  differenceAdjustment: number;
  previousBalance:      number;
  totalDue:             number;
  amountPaid:           number;
  outstandingBalance:   number;
  dueDate:              string;
  status:               string;
  version:              number;
}

export interface BillFilters {
  buildingId?:   string;
  periodYear?:   number;
  periodMonth?:  number;
  status?:       string;
  search?:       string;
}

// ─── Record a payment ─────────────────────────────────────────────────────────

export async function recordPayment(
  input: PaymentInput,
  adminId: string,
): Promise<ApiResponse<{ bill: Record<string, unknown>; payment: Payment }>> {
  const supabase = await createClient();

  const { data: bill, error: billError } = await supabase
    .from('flat_bills')
    .select('id, total_due, amount_paid, status')
    .eq('id', input.bill_id)
    .eq('is_current_version', true)
    .single();

  if (billError || !bill) return { data: null, error: 'Bill not found' };

  if (bill.status === 'paid')
    return { data: null, error: 'Bill is already fully paid' };
  if (bill.status === 'waived' || bill.status === 'cancelled')
    return { data: null, error: 'Cannot record payment on a waived or cancelled bill' };

  const currentPaid = Number(bill.amount_paid);
  const totalDue    = Number(bill.total_due);
  const outstanding = totalDue - currentPaid;

  if (input.amount > outstanding + 0.01) {
    return {
      data: null,
      error: `Payment of ${input.amount.toFixed(2)} exceeds outstanding balance of ${outstanding.toFixed(2)}`,
    };
  }

  const newAmountPaid = currentPaid + input.amount;
  const newStatus     = newAmountPaid >= totalDue - 0.01 ? 'paid' : 'partial';

  // Insert payment record
  const { data: payment, error: payError } = await supabase
    .from('payments')
    .insert({
      bill_id:        input.bill_id,
      amount:         input.amount,
      payment_method: input.payment_method,
      reference_no:   input.reference_no ?? null,
      paid_at:        `${input.payment_date}T12:00:00Z`,
      recorded_by:    adminId,
      notes:          input.notes ?? null,
      image_url:      input.image_url ?? null,
    })
    .select()
    .single();

  if (payError) return { data: null, error: payError.message };

  // Update bill amount_paid and status
  const updateData: Record<string, unknown> = {
    amount_paid: newAmountPaid,
    status:      newStatus,
  };
  if (newStatus === 'paid') updateData.paid_at = new Date().toISOString();

  const { data: updatedBill, error: updateError } = await supabase
    .from('flat_bills')
    .update(updateData)
    .eq('id', input.bill_id)
    .select()
    .single();

  if (updateError) return { data: null, error: updateError.message };

  return { data: { bill: updatedBill as any, payment: payment as Payment }, error: null };
}

// ─── List payments for a bill ─────────────────────────────────────────────────

export async function getPaymentsForBill(
  billId: string,
): Promise<ApiResponse<PaymentWithRecorder[]>> {
  const supabase = await createClient();

  const { data, error } = await supabase
    .from('payments')
    .select('*, recorder:users!recorded_by(full_name)')
    .eq('bill_id', billId)
    .eq('is_reversed', false)
    .order('paid_at', { ascending: false });

  if (error) return { data: null, error: error.message };

  const payments: PaymentWithRecorder[] = (data ?? []).map((p: any) => ({
    ...p,
    recorder_name: p.recorder?.full_name ?? 'Unknown',
  }));

  return { data: payments, error: null };
}

// ─── Reverse a payment ────────────────────────────────────────────────────────

export async function reversePayment(
  paymentId: string,
  adminId: string,
): Promise<ApiResponse<{ success: boolean }>> {
  const supabase = await createClient();

  const { data: payment, error: payError } = await supabase
    .from('payments')
    .select('id, bill_id, amount, is_reversed')
    .eq('id', paymentId)
    .single();

  if (payError || !payment) return { data: null, error: 'Payment not found' };
  if (payment.is_reversed) return { data: null, error: 'Payment is already reversed' };

  await supabase
    .from('payments')
    .update({
      is_reversed: true,
      reversed_at: new Date().toISOString(),
      reversed_by: adminId,
    })
    .eq('id', paymentId);

  // Recalculate amount_paid from remaining active payments
  const { data: remaining } = await supabase
    .from('payments')
    .select('amount')
    .eq('bill_id', payment.bill_id)
    .eq('is_reversed', false);

  const newAmountPaid = (remaining ?? []).reduce((s: number, p: any) => s + Number(p.amount), 0);

  const { data: bill } = await supabase
    .from('flat_bills')
    .select('total_due')
    .eq('id', payment.bill_id)
    .single();

  const totalDue = Number(bill?.total_due ?? 0);
  const newStatus =
    newAmountPaid <= 0                ? 'unpaid'
    : newAmountPaid >= totalDue - 0.01 ? 'paid'
    : 'partial';

  await supabase
    .from('flat_bills')
    .update({
      amount_paid: newAmountPaid,
      status:      newStatus,
      paid_at:     newStatus === 'paid' ? new Date().toISOString() : null,
    })
    .eq('id', payment.bill_id);

  return { data: { success: true }, error: null };
}

// ─── Admin bills list with filters ───────────────────────────────────────────

export async function getBillsAdmin(
  filters: BillFilters = {},
): Promise<ApiResponse<AdminBillRow[]>> {
  const supabase = await createClient();

  // Resolve flat IDs for building filter
  let flatIds: string[] | undefined;
  if (filters.buildingId) {
    const { data: flats } = await supabase
      .from('flats')
      .select('id')
      .eq('building_id', filters.buildingId)
      .is('deleted_at', null);
    flatIds = (flats ?? []).map((f: any) => f.id as string);
    if (flatIds.length === 0) return { data: [], error: null };
  }

  // Resolve cycle IDs for period filter
  let cycleIds: string[] | undefined;
  if (filters.periodYear && filters.periodMonth) {
    let q = supabase
      .from('billing_cycles')
      .select('id')
      .eq('period_year',  filters.periodYear)
      .eq('period_month', filters.periodMonth);
    if (filters.buildingId) q = q.eq('building_id', filters.buildingId);
    const { data: cycles } = await q;
    cycleIds = (cycles ?? []).map((c: any) => c.id as string);
    if (cycleIds.length === 0) return { data: [], error: null };
  }

  let query = supabase
    .from('flat_bills')
    .select(`
      id, flat_id, tenancy_id, billing_cycle_id, version, status,
      billed_units, current_charges, difference_adjustment,
      previous_balance, total_due, amount_paid, outstanding_balance, due_date,
      flat:flats(flat_number, building:buildings(id, name)),
      tenancy:tenancies(user:users(full_name, email)),
      billing_cycle:billing_cycles(period_year, period_month)
    `)
    .eq('is_current_version', true)
    .in('status', ['unpaid', 'partial', 'paid', 'overdue', 'waived'])
    .order('due_date', { ascending: false })
    .limit(500);

  if (flatIds  !== undefined) query = query.in('flat_id',         flatIds);
  if (cycleIds !== undefined) query = query.in('billing_cycle_id', cycleIds);
  if (filters.status)         query = query.eq('status',           filters.status);

  const { data, error } = await query;
  if (error) return { data: null, error: error.message };

  let rows: AdminBillRow[] = (data ?? []).map((b: any) => ({
    id:                   b.id,
    flatId:               b.flat_id,
    flatNumber:           b.flat?.flat_number       ?? '',
    buildingId:           b.flat?.building?.id      ?? '',
    buildingName:         b.flat?.building?.name    ?? '',
    tenancyId:            b.tenancy_id,
    tenantName:           b.tenancy?.user?.full_name ?? 'Unknown',
    tenantEmail:          b.tenancy?.user?.email     ?? '',
    periodYear:           b.billing_cycle?.period_year  ?? 0,
    periodMonth:          b.billing_cycle?.period_month ?? 0,
    billedUnits:          Number(b.billed_units),
    currentCharges:       Number(b.current_charges),
    differenceAdjustment: Number(b.difference_adjustment ?? 0),
    previousBalance:      Number(b.previous_balance),
    totalDue:             Number(b.total_due),
    amountPaid:           Number(b.amount_paid),
    outstandingBalance:   Number(b.outstanding_balance),
    dueDate:              b.due_date,
    status:               b.status,
    version:              b.version,
  }));

  if (filters.search) {
    const s = filters.search.toLowerCase();
    rows = rows.filter(
      (r) => r.tenantName.toLowerCase().includes(s) || r.flatNumber.toLowerCase().includes(s),
    );
  }

  return { data: rows, error: null };
}

// ─── Mark overdue bills ───────────────────────────────────────────────────────

export async function markOverdueBills(buildingId?: string): Promise<void> {
  const supabase = await createClient();
  const today    = new Date().toISOString().split('T')[0];

  let flatIds: string[] | undefined;
  if (buildingId) {
    const { data: flats } = await supabase
      .from('flats').select('id').eq('building_id', buildingId).is('deleted_at', null);
    flatIds = (flats ?? []).map((f: any) => f.id as string);
    if (flatIds.length === 0) return;
  }

  let q = supabase
    .from('flat_bills')
    .update({ status: 'overdue' })
    .lt('due_date', today)
    .in('status', ['unpaid', 'partial'])
    .eq('is_current_version', true);

  if (flatIds !== undefined && flatIds.length > 0) q = q.in('flat_id', flatIds);

  await q;
}

// ─── Tenant: bills with payments ─────────────────────────────────────────────

export interface TenantBillWithPayments {
  id:                   string;
  status:               string;
  periodYear:           number;
  periodMonth:          number;
  openingReading:       number | null;
  closingReading:       number | null;
  unitsConsumed:        number;
  sharePercent:         number;
  billedUnits:          number;
  ratePerUnit:          number;
  currentCharges:       number;
  differenceAdjustment: number;
  previousBalance:      number;
  totalDue:             number;
  amountPaid:           number;
  outstandingBalance:   number;
  dueDate:              string;
  paidAt:               string | null;
  calculationLog:       Record<string, unknown>;
  payments:             Array<{
    id:            string;
    amount:        number;
    paymentMethod: string;
    referenceNo:   string | null;
    paidAt:        string;
    notes:         string | null;
  }>;
}

export async function getTenantBillsWithPayments(
  flatId: string,
): Promise<TenantBillWithPayments[]> {
  const supabase = await createClient();

  const { data: bills } = await supabase
    .from('flat_bills')
    .select(`
      id, status, total_due, amount_paid, outstanding_balance,
      current_charges, difference_adjustment, previous_balance,
      opening_reading, closing_reading, units_consumed, share_percent,
      billed_units, rate_per_unit, due_date, paid_at, calculation_log,
      billing_cycle:billing_cycles(period_year, period_month)
    `)
    .eq('flat_id', flatId)
    .eq('is_current_version', true)
    .not('status', 'eq', 'draft')
    .order('created_at', { ascending: false });

  if (!bills || bills.length === 0) return [];

  const billIds = bills.map((b: any) => b.id as string);

  const { data: payments } = await supabase
    .from('payments')
    .select('id, bill_id, amount, payment_method, reference_no, paid_at, notes')
    .in('bill_id', billIds)
    .eq('is_reversed', false)
    .order('paid_at', { ascending: false });

  const paymentsByBill = new Map<string, any[]>();
  for (const p of payments ?? []) {
    if (!paymentsByBill.has(p.bill_id)) paymentsByBill.set(p.bill_id, []);
    paymentsByBill.get(p.bill_id)!.push(p);
  }

  return bills.map((b: any) => ({
    id:                   b.id,
    status:               b.status,
    periodYear:           b.billing_cycle?.period_year  ?? 0,
    periodMonth:          b.billing_cycle?.period_month ?? 0,
    openingReading:       b.opening_reading != null ? Number(b.opening_reading) : null,
    closingReading:       b.closing_reading != null ? Number(b.closing_reading) : null,
    unitsConsumed:        Number(b.units_consumed),
    sharePercent:         Number(b.share_percent ?? 100),
    billedUnits:          Number(b.billed_units),
    ratePerUnit:          Number(b.rate_per_unit),
    currentCharges:       Number(b.current_charges),
    differenceAdjustment: Number(b.difference_adjustment ?? 0),
    previousBalance:      Number(b.previous_balance),
    totalDue:             Number(b.total_due),
    amountPaid:           Number(b.amount_paid),
    outstandingBalance:   Number(b.outstanding_balance),
    dueDate:              b.due_date,
    paidAt:               b.paid_at,
    calculationLog:       b.calculation_log ?? {},
    payments:             (paymentsByBill.get(b.id) ?? []).map((p: any) => ({
      id:            p.id,
      amount:        Number(p.amount),
      paymentMethod: p.payment_method,
      referenceNo:   p.reference_no,
      paidAt:        p.paid_at,
      notes:         p.notes,
    })),
  }));
}
