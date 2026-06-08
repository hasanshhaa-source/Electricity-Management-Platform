import { NextResponse } from 'next/server';
import { requireAuth } from '@/services/auth/authService';
import { createClient } from '@/lib/supabase/server';
import { generateBillHtml } from '@/lib/pdf/billHtml';
import { getSystemSettings } from '@/services/settings/systemSettingsService';
import type { BillHtmlData } from '@/lib/pdf/billHtml';

export async function GET(
  _req: Request,
  { params }: { params: Promise<{ id: string }> },
) {
  const { id } = await params;

  const user = await requireAuth();
  if (!user) {
    return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });
  }

  const supabase = await createClient();

  const { data: bill, error } = await supabase
    .from('flat_bills')
    .select(`
      id, status, total_due, amount_paid, outstanding_balance,
      current_charges, difference_adjustment, previous_balance,
      manual_adjustment_amount,
      opening_reading, closing_reading, units_consumed, share_percent,
      billed_units, rate_per_unit, due_date, paid_at, issue_date,
      billing_cycle:billing_cycles(period_year, period_month),
      flat:flats(
        flat_number,
        building:buildings(name, address)
      ),
      tenancy:tenancies(
        user:users(full_name, email)
      )
    `)
    .eq('id', id)
    .eq('is_current_version', true)
    .single();

  if (error || !bill) {
    return NextResponse.json({ error: 'Bill not found' }, { status: 404 });
  }

  // Tenants can only access their own bills
  if (user.role === 'tenant') {
    const { data: tenancy } = await supabase
      .from('tenancies')
      .select('flat_id')
      .eq('user_id', user.id)
      .eq('status', 'active')
      .maybeSingle();

    const b = bill as any;
    if (!tenancy || tenancy.flat_id !== b.flat_id) {
      return NextResponse.json({ error: 'Forbidden' }, { status: 403 });
    }
  }

  const settings = await getSystemSettings();

  const { data: payments } = await supabase
    .from('payments')
    .select('amount')
    .eq('bill_id', id)
    .eq('is_reversed', false);

  const amountPaid = (payments ?? []).reduce((s: number, p: any) => s + Number(p.amount), 0);

  const b = bill as any;
  const cycle  = b.billing_cycle as any;
  const flat   = b.flat as any;
  const bldg   = flat?.building as any;
  const tenant = (b.tenancy as any)?.user as any;

  const htmlData: BillHtmlData = {
    billId:          b.id,
    buildingName:    bldg?.name    ?? '',
    buildingAddress: bldg?.address ?? '',
    flatNumber:      flat?.flat_number ?? '',
    tenantName:      tenant?.full_name ?? '',
    tenantEmail:     tenant?.email     ?? '',
    periodYear:      cycle?.period_year  ?? 0,
    periodMonth:     cycle?.period_month ?? 0,
    issueDate:       b.issue_date ?? new Date().toISOString().slice(0, 10),
    dueDate:         b.due_date,
    currency:        settings.default_currency ?? 'SAR',
    openingReading:  b.opening_reading != null ? Number(b.opening_reading) : null,
    closingReading:  b.closing_reading != null ? Number(b.closing_reading) : null,
    unitsConsumed:   Number(b.units_consumed),
    sharePercent:    Number(b.share_percent ?? 100),
    billedUnits:     Number(b.billed_units),
    ratePerUnit:     Number(b.rate_per_unit),
    currentCharges:  Number(b.current_charges),
    differenceAdj:   Number(b.difference_adjustment ?? 0),
    manualAdj:       Number(b.manual_adjustment_amount ?? 0),
    previousBalance: Number(b.previous_balance),
    totalDue:        Number(b.total_due),
    amountPaid,
    outstanding:     Math.max(0, Number(b.total_due) - amountPaid),
    status:          b.status,
    locale:          (settings.default_language as 'en' | 'ar' | undefined) === 'ar' ? 'ar' : 'en',
  };

  const html = generateBillHtml(htmlData);

  return new NextResponse(html, {
    headers: {
      'Content-Type': 'text/html; charset=utf-8',
      'Cache-Control': 'private, no-store',
    },
  });
}
