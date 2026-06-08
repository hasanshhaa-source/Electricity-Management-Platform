/**
 * Notification service — provider-agnostic dispatch layer.
 *
 * Flow:
 *   1. Insert a 'pending' notification log row
 *   2. Render template
 *   3. Send via the appropriate provider
 *   4. Update status to 'sent' or 'failed'
 *
 * WhatsApp-ready: swap/add a provider in `getProvider()` without changing callers.
 */
import { createAdminClient } from '@/lib/supabase/admin';
import type { NotificationChannel, NotificationType } from '@/types';
import { EmailProvider } from './providers/emailProvider';
import { WhatsAppProvider } from './providers/whatsappProvider';
import type { INotificationProvider } from './providers/INotificationProvider';
import {
  billIssuedTemplate,
  paymentConfirmedTemplate,
  overdueReminderTemplate,
  paymentReminderTemplate,
  complaintSubmittedTemplate,
} from './notificationTemplates';

// ── Provider registry ─────────────────────────────────────────────────────────

const PROVIDERS: Record<string, INotificationProvider> = {
  email:    new EmailProvider(),
  whatsapp: new WhatsAppProvider(),
};

function getProvider(channel: NotificationChannel): INotificationProvider | null {
  return PROVIDERS[channel] ?? null;
}

// ── Core dispatch ─────────────────────────────────────────────────────────────

export interface DispatchParams {
  userId:    string;
  type:      NotificationType;
  channel:   NotificationChannel;
  title:     string;
  body?:     string;
  billId?:   string;
  tenancyId?: string;
  payload?:  Record<string, unknown>;
  // Delivery-specific fields for email
  recipientEmail?: string;
  emailSubject?:   string;
  emailHtml?:      string;
  emailText?:      string;
}

export async function dispatchNotification(params: DispatchParams): Promise<void> {
  const supabase = createAdminClient();

  // 1. Insert pending log
  const { data: notif, error: insertErr } = await supabase
    .from('notifications')
    .insert({
      user_id:   params.userId,
      type:      params.type,
      channel:   params.channel,
      status:    'pending',
      title:     params.title,
      body:      params.body ?? null,
      bill_id:   params.billId    ?? null,
      tenancy_id: params.tenancyId ?? null,
      payload:   params.payload   ?? null,
    })
    .select('id')
    .single();

  if (insertErr || !notif) {
    console.error('[notify] Failed to insert notification log:', insertErr?.message);
    return;
  }

  const notifId = notif.id;

  // 2. Skip if channel is in_app (DB record is the delivery)
  if (params.channel === 'in_app') {
    await supabase
      .from('notifications')
      .update({ status: 'sent', sent_at: new Date().toISOString() })
      .eq('id', notifId);
    return;
  }

  // 3. Get provider
  const provider = getProvider(params.channel);
  if (!provider) {
    await supabase
      .from('notifications')
      .update({ status: 'skipped', error_message: `No provider for channel: ${params.channel}` })
      .eq('id', notifId);
    return;
  }

  // 4. Send
  if (!params.recipientEmail) {
    await supabase
      .from('notifications')
      .update({ status: 'skipped', error_message: 'No recipient address' })
      .eq('id', notifId);
    return;
  }

  const result = await provider.send({
    to:      params.recipientEmail,
    subject: params.emailSubject,
    html:    params.emailHtml,
    text:    params.emailText,
  });

  // 5. Update log
  await supabase
    .from('notifications')
    .update(result.success
      ? { status: 'sent',   sent_at: new Date().toISOString() }
      : { status: 'failed', error_message: result.error ?? 'Unknown error' })
    .eq('id', notifId);
}

// ── High-level helpers called by API routes ───────────────────────────────────

export async function notifyBillIssued(params: {
  userId:       string;
  tenantEmail:  string;
  tenantName:   string;
  flatNumber:   string;
  buildingName: string;
  periodYear:   number;
  periodMonth:  number;
  totalDue:     number;
  dueDate:      string;
  currency:     string;
  billId:       string;
}): Promise<void> {
  const tpl = billIssuedTemplate(params);
  await dispatchNotification({
    userId:         params.userId,
    type:           'bill_generated',
    channel:        'email',
    title:          tpl.subject,
    body:           `Bill for ${params.periodMonth}/${params.periodYear} — ${params.currency} ${params.totalDue}`,
    billId:         params.billId,
    recipientEmail: params.tenantEmail,
    emailSubject:   tpl.subject,
    emailHtml:      tpl.html,
    emailText:      tpl.text,
  });
}

export async function notifyPaymentConfirmed(params: {
  userId:       string;
  tenantEmail:  string;
  tenantName:   string;
  flatNumber:   string;
  buildingName: string;
  periodYear:   number;
  periodMonth:  number;
  amount:       number;
  outstanding:  number;
  currency:     string;
  billId:       string;
}): Promise<void> {
  const tpl = paymentConfirmedTemplate(params);
  await dispatchNotification({
    userId:         params.userId,
    type:           'payment_confirmed',
    channel:        'email',
    title:          tpl.subject,
    body:           `Payment ${params.currency} ${params.amount} received`,
    billId:         params.billId,
    recipientEmail: params.tenantEmail,
    emailSubject:   tpl.subject,
    emailHtml:      tpl.html,
    emailText:      tpl.text,
  });
}

export async function notifyOverdue(params: {
  userId:       string;
  tenantEmail:  string;
  tenantName:   string;
  flatNumber:   string;
  buildingName: string;
  periodYear:   number;
  periodMonth:  number;
  outstanding:  number;
  dueDate:      string;
  currency:     string;
  billId:       string;
}): Promise<void> {
  const tpl = overdueReminderTemplate(params);
  await dispatchNotification({
    userId:         params.userId,
    type:           'overdue',
    channel:        'email',
    title:          tpl.subject,
    body:           `Outstanding ${params.currency} ${params.outstanding}`,
    billId:         params.billId,
    recipientEmail: params.tenantEmail,
    emailSubject:   tpl.subject,
    emailHtml:      tpl.html,
    emailText:      tpl.text,
  });
}

export async function notifyPaymentReminder(params: {
  userId:       string;
  tenantEmail:  string;
  tenantName:   string;
  flatNumber:   string;
  buildingName: string;
  periodYear:   number;
  periodMonth:  number;
  totalDue:     number;
  dueDate:      string;
  currency:     string;
  daysUntilDue: number;
  billId:       string;
}): Promise<void> {
  const tpl = paymentReminderTemplate(params);
  await dispatchNotification({
    userId:         params.userId,
    type:           'payment_reminder',
    channel:        'email',
    title:          tpl.subject,
    body:           `Bill due in ${params.daysUntilDue} days`,
    billId:         params.billId,
    recipientEmail: params.tenantEmail,
    emailSubject:   tpl.subject,
    emailHtml:      tpl.html,
    emailText:      tpl.text,
  });
}

export async function notifyComplaintSubmitted(params: {
  adminUserId:  string;
  adminEmail:   string;
  adminName:    string;
  tenantName:   string;
  flatNumber:   string;
  buildingName: string;
  type:         string;
  subject:      string;
  description:  string;
}): Promise<void> {
  const tpl = complaintSubmittedTemplate(params);
  await dispatchNotification({
    userId:         params.adminUserId,
    type:           'complaint_submitted',
    channel:        'email',
    title:          tpl.subject,
    body:           `From ${params.tenantName} — Flat ${params.flatNumber}`,
    recipientEmail: params.adminEmail,
    emailSubject:   tpl.subject,
    emailHtml:      tpl.html,
    emailText:      tpl.text,
  });
}
