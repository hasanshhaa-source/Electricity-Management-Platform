const MONTH_NAMES = ['January','February','March','April','May','June',
                     'July','August','September','October','November','December'];

function periodLabel(year: number, month: number) {
  return `${MONTH_NAMES[month - 1]} ${year}`;
}

function fmt(amount: number, currency: string) {
  return `${currency} ${amount.toLocaleString('en', { minimumFractionDigits: 2 })}`;
}

// ── Shared layout ─────────────────────────────────────────────────────────────

function layout(title: string, body: string, appUrl?: string) {
  const url = appUrl ?? process.env.NEXT_PUBLIC_APP_URL ?? 'http://localhost:3000';
  return `<!DOCTYPE html>
<html lang="en">
<head>
  <meta charset="UTF-8" />
  <meta name="viewport" content="width=device-width, initial-scale=1.0" />
  <title>${title}</title>
</head>
<body style="margin:0;padding:0;background:#f4f4f5;font-family:Arial,Helvetica,sans-serif;">
  <table width="100%" cellpadding="0" cellspacing="0" style="background:#f4f4f5;padding:32px 0;">
    <tr><td align="center">
      <table width="600" cellpadding="0" cellspacing="0" style="background:#ffffff;border-radius:8px;overflow:hidden;border:1px solid #e4e4e7;">
        <!-- Header -->
        <tr>
          <td style="background:#16a34a;padding:20px 32px;">
            <span style="color:#ffffff;font-size:18px;font-weight:bold;">⚡ ElectroManage</span>
          </td>
        </tr>
        <!-- Body -->
        <tr>
          <td style="padding:32px;">
            <h2 style="margin:0 0 16px;font-size:20px;color:#111827;">${title}</h2>
            ${body}
          </td>
        </tr>
        <!-- Footer -->
        <tr>
          <td style="background:#f9fafb;padding:16px 32px;border-top:1px solid #e4e4e7;">
            <p style="margin:0;font-size:12px;color:#9ca3af;">
              This is an automated message from ElectroManage.
              <a href="${url}" style="color:#6b7280;">Visit portal</a>
            </p>
          </td>
        </tr>
      </table>
    </td></tr>
  </table>
</body>
</html>`;
}

function row(label: string, value: string) {
  return `<tr>
    <td style="padding:6px 0;font-size:14px;color:#6b7280;width:160px;">${label}</td>
    <td style="padding:6px 0;font-size:14px;color:#111827;font-weight:600;">${value}</td>
  </tr>`;
}

// ── Templates ─────────────────────────────────────────────────────────────────

export function billIssuedTemplate(params: {
  tenantName:   string;
  flatNumber:   string;
  buildingName: string;
  periodYear:   number;
  periodMonth:  number;
  totalDue:     number;
  dueDate:      string;
  currency:     string;
}) {
  const period = periodLabel(params.periodYear, params.periodMonth);
  const subject = `Your electricity bill for ${period} — ${fmt(params.totalDue, params.currency)} due`;

  const body = `
    <p style="font-size:14px;color:#374151;">Hi ${params.tenantName},</p>
    <p style="font-size:14px;color:#374151;">Your electricity bill for <strong>${period}</strong> has been generated.</p>
    <table cellpadding="0" cellspacing="0" style="margin:16px 0;width:100%;">
      ${row('Building', params.buildingName)}
      ${row('Flat', `Flat ${params.flatNumber}`)}
      ${row('Period', period)}
      ${row('Total Due', fmt(params.totalDue, params.currency))}
      ${row('Due Date', new Date(params.dueDate).toLocaleDateString('en-GB', { day: '2-digit', month: 'long', year: 'numeric' }))}
    </table>
    <p style="font-size:14px;color:#374151;">Please log in to your portal to view the full breakdown and make a payment.</p>`;

  const text = `Hi ${params.tenantName},\n\nYour electricity bill for ${period} has been generated.\nTotal Due: ${fmt(params.totalDue, params.currency)}\nDue Date: ${params.dueDate}\n\nPlease log in to your portal to view the breakdown.`;

  return { subject, html: layout(subject, body), text };
}

export function paymentConfirmedTemplate(params: {
  tenantName:   string;
  flatNumber:   string;
  buildingName: string;
  periodYear:   number;
  periodMonth:  number;
  amount:       number;
  outstanding:  number;
  currency:     string;
}) {
  const period  = periodLabel(params.periodYear, params.periodMonth);
  const subject = `Payment of ${fmt(params.amount, params.currency)} received — ${period}`;

  const body = `
    <p style="font-size:14px;color:#374151;">Hi ${params.tenantName},</p>
    <p style="font-size:14px;color:#374151;">We've received your payment for the <strong>${period}</strong> bill.</p>
    <table cellpadding="0" cellspacing="0" style="margin:16px 0;width:100%;">
      ${row('Building', params.buildingName)}
      ${row('Flat', `Flat ${params.flatNumber}`)}
      ${row('Amount Received', fmt(params.amount, params.currency))}
      ${row('Outstanding', fmt(params.outstanding, params.currency))}
    </table>
    ${params.outstanding <= 0
      ? '<p style="font-size:14px;color:#16a34a;font-weight:600;">✓ Your account is fully settled for this period.</p>'
      : `<p style="font-size:14px;color:#d97706;">Remaining balance of ${fmt(params.outstanding, params.currency)} is still outstanding.</p>`}`;

  const text = `Hi ${params.tenantName},\n\nPayment of ${fmt(params.amount, params.currency)} received for ${period}.\nOutstanding: ${fmt(params.outstanding, params.currency)}`;

  return { subject, html: layout(subject, body), text };
}

export function overdueReminderTemplate(params: {
  tenantName:   string;
  flatNumber:   string;
  buildingName: string;
  periodYear:   number;
  periodMonth:  number;
  outstanding:  number;
  dueDate:      string;
  currency:     string;
}) {
  const period  = periodLabel(params.periodYear, params.periodMonth);
  const subject = `Overdue: ${fmt(params.outstanding, params.currency)} unpaid — ${period}`;

  const body = `
    <p style="font-size:14px;color:#374151;">Hi ${params.tenantName},</p>
    <p style="font-size:14px;color:#dc2626;">Your electricity bill for <strong>${period}</strong> is <strong>overdue</strong>.</p>
    <table cellpadding="0" cellspacing="0" style="margin:16px 0;width:100%;">
      ${row('Building', params.buildingName)}
      ${row('Flat', `Flat ${params.flatNumber}`)}
      ${row('Period', period)}
      ${row('Outstanding', fmt(params.outstanding, params.currency))}
      ${row('Due Date', new Date(params.dueDate).toLocaleDateString('en-GB', { day: '2-digit', month: 'long', year: 'numeric' }))}
    </table>
    <p style="font-size:14px;color:#374151;">Please settle this amount as soon as possible to avoid further action.</p>`;

  const text = `Hi ${params.tenantName},\n\nYour ${period} bill is overdue. Outstanding: ${fmt(params.outstanding, params.currency)}.`;

  return { subject, html: layout(subject, body), text };
}

export function paymentReminderTemplate(params: {
  tenantName:   string;
  flatNumber:   string;
  buildingName: string;
  periodYear:   number;
  periodMonth:  number;
  totalDue:     number;
  dueDate:      string;
  currency:     string;
  daysUntilDue: number;
}) {
  const period  = periodLabel(params.periodYear, params.periodMonth);
  const subject = `Reminder: ${fmt(params.totalDue, params.currency)} due in ${params.daysUntilDue} day${params.daysUntilDue !== 1 ? 's' : ''} — ${period}`;

  const body = `
    <p style="font-size:14px;color:#374151;">Hi ${params.tenantName},</p>
    <p style="font-size:14px;color:#374151;">This is a friendly reminder that your <strong>${period}</strong> electricity bill is due in <strong>${params.daysUntilDue} day${params.daysUntilDue !== 1 ? 's' : ''}</strong>.</p>
    <table cellpadding="0" cellspacing="0" style="margin:16px 0;width:100%;">
      ${row('Building', params.buildingName)}
      ${row('Flat', `Flat ${params.flatNumber}`)}
      ${row('Total Due', fmt(params.totalDue, params.currency))}
      ${row('Due Date', new Date(params.dueDate).toLocaleDateString('en-GB', { day: '2-digit', month: 'long', year: 'numeric' }))}
    </table>
    <p style="font-size:14px;color:#374151;">Log in to your portal to pay now.</p>`;

  const text = `Hi ${params.tenantName},\n\nReminder: Your ${period} bill of ${fmt(params.totalDue, params.currency)} is due in ${params.daysUntilDue} days (${params.dueDate}).`;

  return { subject, html: layout(subject, body), text };
}

export function complaintSubmittedTemplate(params: {
  adminName:    string;
  tenantName:   string;
  flatNumber:   string;
  buildingName: string;
  type:         string;
  subject:      string;
  description:  string;
  appUrl?:      string;
}) {
  const emailSubject = `New ${params.type}: "${params.subject}" — Flat ${params.flatNumber}`;

  const body = `
    <p style="font-size:14px;color:#374151;">Hi ${params.adminName},</p>
    <p style="font-size:14px;color:#374151;">A new <strong>${params.type}</strong> has been submitted and requires your attention.</p>
    <table cellpadding="0" cellspacing="0" style="margin:16px 0;width:100%;">
      ${row('From', params.tenantName)}
      ${row('Building', params.buildingName)}
      ${row('Flat', `Flat ${params.flatNumber}`)}
      ${row('Type', params.type)}
      ${row('Subject', params.subject)}
    </table>
    <div style="background:#f9fafb;border-left:3px solid #d1d5db;padding:12px 16px;margin:16px 0;font-size:14px;color:#374151;">
      ${params.description.replace(/\n/g, '<br>')}
    </div>
    <p style="font-size:14px;color:#374151;">Log in to the admin portal to respond.</p>`;

  const text = `New ${params.type} from ${params.tenantName} (Flat ${params.flatNumber}, ${params.buildingName}):\n\nSubject: ${params.subject}\n\n${params.description}`;

  return { subject: emailSubject, html: layout(emailSubject, body, params.appUrl), text };
}

export function complaintReplyTemplate(params: {
  tenantName:   string;
  flatNumber:   string;
  buildingName: string;
  subject:      string;
  reply:        string;
  newStatus:    string;
}) {
  const emailSubject = `Re: ${params.subject} — Update from ElectroManage`;

  const statusLabel: Record<string, string> = {
    reviewed:    'Reviewed',
    in_progress: 'In Progress',
    resolved:    'Resolved',
    closed:      'Closed',
  };

  const body = `
    <p style="font-size:14px;color:#374151;">Hi ${params.tenantName},</p>
    <p style="font-size:14px;color:#374151;">We have an update regarding your submission: <strong>${params.subject}</strong>.</p>
    <table cellpadding="0" cellspacing="0" style="margin:16px 0;width:100%;">
      ${row('Building', params.buildingName)}
      ${row('Flat', `Flat ${params.flatNumber}`)}
      ${row('Status', statusLabel[params.newStatus] ?? params.newStatus)}
    </table>
    <div style="background:#f0fdf4;border-left:3px solid #16a34a;padding:12px 16px;margin:16px 0;font-size:14px;color:#166534;">
      <p style="margin:0 0 4px;font-weight:600;">Admin Response:</p>
      ${params.reply.replace(/\n/g, '<br>')}
    </div>
    <p style="font-size:14px;color:#374151;">Log in to your tenant portal to view the full details.</p>`;

  const text = `Hi ${params.tenantName},\n\nUpdate on "${params.subject}" — Status: ${statusLabel[params.newStatus] ?? params.newStatus}\n\nAdmin response:\n${params.reply}`;

  return { subject: emailSubject, html: layout(emailSubject, body), text };
}
