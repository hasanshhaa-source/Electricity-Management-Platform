import { NextRequest, NextResponse } from 'next/server';
import { requireAdmin } from '@/services/auth/authService';
import { createAdminClient } from '@/lib/supabase/admin';
import { logAudit } from '@/services/audit/auditService';

function escapeCSV(v: unknown): string {
  if (v === null || v === undefined) return '';
  const s = String(v);
  if (s.includes(',') || s.includes('"') || s.includes('\n')) {
    return `"${s.replace(/"/g, '""')}"`;
  }
  return s;
}

function toCSV(headers: string[], rows: Record<string, unknown>[]): string {
  const head = headers.map(escapeCSV).join(',');
  const body = rows.map(r => headers.map(h => escapeCSV(r[h])).join(',')).join('\n');
  return `${head}\n${body}`;
}

export async function GET(req: NextRequest) {
  let admin;
  try { admin = await requireAdmin(); } catch { return new NextResponse('Forbidden', { status: 403 }); }

  const type = req.nextUrl.searchParams.get('type') ?? 'bills';
  const supabase = createAdminClient();
  const date = new Date().toISOString().slice(0, 10);

  await logAudit({
    entity_type: 'export',
    entity_id:   admin.id,
    action:      'DATA_EXPORT',
    actor_id:    admin.id,
    actor_role:  'admin',
    new_data:    { export_type: type, exported_at: new Date().toISOString() },
  });

  if (type === 'payments') {
    const { data, error } = await supabase
      .from('payments')
      .select(`
        id, payment_date, amount, payment_method, reference_no, notes,
        bill:flat_bills(
          id,
          flat:flats(flat_number, building:buildings(name)),
          billing_cycle:billing_cycles(period_year, period_month),
          tenancy:tenancies(user:users!user_id(full_name, email))
        )
      `)
      .order('payment_date', { ascending: false });

    if (error) return new NextResponse(error.message, { status: 500 });

    const rows = (data ?? []).map((p: any) => ({
      payment_id:     p.id,
      payment_date:   p.payment_date,
      amount:         p.amount,
      payment_method: p.payment_method,
      reference_no:   p.reference_no ?? '',
      building:       p.bill?.flat?.building?.name ?? '',
      flat:           p.bill?.flat?.flat_number ?? '',
      tenant_name:    p.bill?.tenancy?.user?.full_name ?? '',
      tenant_email:   p.bill?.tenancy?.user?.email ?? '',
      period_year:    p.bill?.billing_cycle?.period_year ?? '',
      period_month:   p.bill?.billing_cycle?.period_month ?? '',
      notes:          p.notes ?? '',
    }));

    const csv = toCSV([
      'payment_id','payment_date','amount','payment_method','reference_no',
      'building','flat','tenant_name','tenant_email','period_year','period_month','notes',
    ], rows);

    return new NextResponse(csv, {
      headers: {
        'Content-Type':        'text/csv; charset=utf-8',
        'Content-Disposition': `attachment; filename="payments-${date}.csv"`,
      },
    });
  }

  if (type === 'tenants') {
    const { data, error } = await supabase
      .from('users')
      .select(`
        id, email, full_name, phone, is_active, created_at,
        tenancies!tenancies_user_id_fkey(status, started_at, ended_at,
          flat:flats(flat_number, building:buildings(name)))
      `)
      .eq('role', 'tenant')
      .is('deleted_at', null)
      .order('full_name');

    if (error) return new NextResponse(error.message, { status: 500 });

    const rows = (data ?? []).flatMap((u: any) => {
      const tenancies = u.tenancies ?? [];
      if (tenancies.length === 0) {
        return [{
          user_id: u.id, email: u.email, full_name: u.full_name,
          phone: u.phone ?? '', is_active: u.is_active,
          tenancy_status: '', building: '', flat: '',
          started_at: '', ended_at: '', created_at: u.created_at,
        }];
      }
      return tenancies.map((t: any) => ({
        user_id:        u.id,
        email:          u.email,
        full_name:      u.full_name,
        phone:          u.phone ?? '',
        is_active:      u.is_active,
        tenancy_status: t.status,
        building:       t.flat?.building?.name ?? '',
        flat:           t.flat?.flat_number ?? '',
        started_at:     t.started_at ?? '',
        ended_at:       t.ended_at ?? '',
        created_at:     u.created_at,
      }));
    });

    const csv = toCSV([
      'user_id','email','full_name','phone','is_active',
      'tenancy_status','building','flat','started_at','ended_at','created_at',
    ], rows);

    return new NextResponse(csv, {
      headers: {
        'Content-Type':        'text/csv; charset=utf-8',
        'Content-Disposition': `attachment; filename="tenants-${date}.csv"`,
      },
    });
  }

  if (type === 'readings') {
    const { data, error } = await supabase
      .from('meter_readings')
      .select(`
        id, billing_period_year, billing_period_month, reading_date,
        reading_value, reading_type, notes, override_reason, created_at,
        meter:meters(meter_number, meter_type, unit, building:buildings(name))
      `)
      .order('billing_period_year', { ascending: false })
      .order('billing_period_month', { ascending: false });

    if (error) return new NextResponse(error.message, { status: 500 });

    const rows = (data ?? []).map((r: any) => ({
      reading_id:    r.id,
      building:      r.meter?.building?.name ?? '',
      meter_number:  r.meter?.meter_number ?? '',
      meter_type:    r.meter?.meter_type ?? '',
      unit:          r.meter?.unit ?? '',
      period_year:   r.billing_period_year,
      period_month:  r.billing_period_month,
      reading_date:  r.reading_date,
      reading_value: r.reading_value,
      reading_type:  r.reading_type,
      notes:         r.notes ?? '',
      override_reason: r.override_reason ?? '',
      created_at:    r.created_at,
    }));

    const csv = toCSV([
      'reading_id','building','meter_number','meter_type','unit',
      'period_year','period_month','reading_date','reading_value','reading_type',
      'notes','override_reason','created_at',
    ], rows);

    return new NextResponse(csv, {
      headers: {
        'Content-Type':        'text/csv; charset=utf-8',
        'Content-Disposition': `attachment; filename="readings-${date}.csv"`,
      },
    });
  }

  // Default: bills (same as archive export but simpler shape)
  const { data, error } = await supabase
    .from('flat_bills')
    .select(`
      id, status, due_date, billed_units, current_charges, total_due,
      amount_paid, outstanding_balance, manual_adjustment_amount,
      billing_cycle:billing_cycles(period_year, period_month),
      flat:flats(flat_number, building:buildings(name, currency)),
      tenancy:tenancies(user:users!user_id(full_name, email))
    `)
    .eq('is_current_version', true)
    .order('due_date', { ascending: false });

  if (error) return new NextResponse(error.message, { status: 500 });

  const rows = (data ?? []).map((b: any) => ({
    bill_id:            b.id,
    building:           b.flat?.building?.name ?? '',
    currency:           b.flat?.building?.currency ?? '',
    flat:               b.flat?.flat_number ?? '',
    tenant_name:        b.tenancy?.user?.full_name ?? '',
    tenant_email:       b.tenancy?.user?.email ?? '',
    period_year:        b.billing_cycle?.period_year ?? '',
    period_month:       b.billing_cycle?.period_month ?? '',
    due_date:           b.due_date,
    status:             b.status,
    billed_units:       b.billed_units,
    current_charges:    b.current_charges,
    total_due:          b.total_due,
    amount_paid:        b.amount_paid,
    outstanding:        b.outstanding_balance,
    manual_adjustment:  b.manual_adjustment_amount ?? 0,
  }));

  const csv = toCSV([
    'bill_id','building','currency','flat','tenant_name','tenant_email',
    'period_year','period_month','due_date','status','billed_units',
    'current_charges','total_due','amount_paid','outstanding','manual_adjustment',
  ], rows);

  return new NextResponse(csv, {
    headers: {
      'Content-Type':        'text/csv; charset=utf-8',
      'Content-Disposition': `attachment; filename="bills-${date}.csv"`,
    },
  });
}
