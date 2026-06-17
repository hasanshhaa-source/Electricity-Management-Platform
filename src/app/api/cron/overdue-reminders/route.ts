/**
 * Daily cron job — sends overdue email reminders.
 *
 * Trigger via a scheduler (e.g. Vercel Cron, GitHub Actions, cURL):
 *   POST /api/cron/overdue-reminders
 *   Authorization: Bearer <CRON_SECRET>
 *
 * Duplicate prevention: a reminder is only sent if no overdue/payment_reminder
 * notification for this bill was sent within `reminder_frequency_days` days.
 */
import { NextRequest, NextResponse } from 'next/server';
import { createAdminClient } from '@/lib/supabase/admin';
import { notifyOverdue } from '@/services/notification/notificationService';
import { getNotificationSettings } from '@/services/notification/notificationSettings';
import { createClient } from '@/lib/supabase/server';

function authError() {
  return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });
}

export async function POST(req: NextRequest) {
  // Verify CRON_SECRET
  const secret = process.env.CRON_SECRET;
  if (secret) {
    const auth = req.headers.get('authorization') ?? '';
    if (auth !== `Bearer ${secret}`) return authError();
  }

  const settings = await getNotificationSettings();

  if (!settings.overdue_reminders_enabled) {
    return NextResponse.json({ skipped: true, reason: 'overdue reminders disabled' });
  }

  const supabase = createAdminClient();
  const today    = new Date().toISOString().split('T')[0];

  // Find all overdue/unpaid/partial bills past due date
  const { data: bills, error: billsErr } = await supabase
    .from('flat_bills')
    .select(`
      id, flat_id, tenancy_id, total_due, outstanding_balance, due_date,
      billing_cycle:billing_cycles(period_year, period_month),
      tenancy:tenancies(
        user:users!user_id(id, email, full_name)
      )
    `)
    .in('status', ['overdue', 'unpaid', 'partial'])
    .lt('due_date', today)
    .eq('is_current_version', true)
    .gt('outstanding_balance', 0);

  if (billsErr) {
    console.error('[cron/overdue] Query error:', billsErr.message);
    return NextResponse.json({ error: billsErr.message }, { status: 500 });
  }

  const overdueBills = bills ?? [];
  if (overdueBills.length === 0) {
    return NextResponse.json({ sent: 0, skipped: 0, reason: 'no overdue bills' });
  }

  // Get flat → building info
  const flatIds = [...new Set(overdueBills.map((b: any) => b.flat_id))];
  const { data: flats } = await supabase
    .from('flats')
    .select('id, flat_number, building:buildings(name, currency)')
    .in('id', flatIds);

  const flatMap = new Map((flats ?? []).map((f: any) => [f.id, f]));

  // Check last overdue reminder per bill (de-duplicate)
  const billIds = overdueBills.map((b: any) => b.id);
  const cutoff  = new Date(Date.now() - settings.reminder_frequency_days * 86400 * 1000).toISOString();

  const { data: recentNotifs } = await supabase
    .from('notifications')
    .select('bill_id, sent_at')
    .in('bill_id', billIds)
    .in('type', ['overdue', 'payment_reminder'])
    .eq('status', 'sent')
    .gte('sent_at', cutoff);

  const recentlySentBillIds = new Set((recentNotifs ?? []).map((n: any) => n.bill_id));

  let sent = 0;
  let skipped = 0;

  for (const bill of overdueBills) {
    if (recentlySentBillIds.has(bill.id)) { skipped++; continue; }

    const tenancy  = (bill as any).tenancy;
    const user     = tenancy?.user;
    const cycle    = (bill as any).billing_cycle;
    const flat     = flatMap.get(bill.flat_id);
    const building = (flat as any)?.building;

    if (!user?.email || !cycle || !flat) { skipped++; continue; }

    await notifyOverdue({
      userId:       user.id,
      tenantEmail:  user.email,
      tenantName:   user.full_name,
      flatNumber:   (flat as any).flat_number,
      buildingName: building?.name ?? '—',
      periodYear:   cycle.period_year,
      periodMonth:  cycle.period_month,
      outstanding:  Number(bill.outstanding_balance),
      dueDate:      bill.due_date,
      currency:     building?.currency ?? 'SAR',
      billId:       bill.id,
    });

    sent++;
  }

  return NextResponse.json({ sent, skipped });
}
