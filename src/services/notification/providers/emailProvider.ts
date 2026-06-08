import nodemailer from 'nodemailer';
import type { INotificationProvider, SendPayload, SendResult } from './INotificationProvider';

function createTransport() {
  const host = process.env.SMTP_HOST;
  const port = Number(process.env.SMTP_PORT ?? 587);
  const user = process.env.SMTP_USER;
  const pass = process.env.SMTP_PASS;

  if (!host || !user || !pass) {
    // Development fallback: Ethereal (logs to console, no real delivery)
    return nodemailer.createTransport({
      host:   'smtp.ethereal.email',
      port:   587,
      secure: false,
      auth:   { user: 'ethereal-preview', pass: 'preview-only' },
    });
  }

  return nodemailer.createTransport({
    host,
    port,
    secure: port === 465,
    auth: { user, pass },
  });
}

export class EmailProvider implements INotificationProvider {
  readonly channel = 'email';

  async send(payload: SendPayload): Promise<SendResult> {
    const from = `${process.env.SMTP_FROM_NAME ?? 'ElectroManage'} <${process.env.SMTP_FROM_EMAIL ?? process.env.SMTP_USER ?? 'noreply@electromanage.app'}>`;

    try {
      const transport = createTransport();
      const info = await transport.sendMail({
        from,
        to:      payload.to,
        subject: payload.subject ?? '(no subject)',
        html:    payload.html,
        text:    payload.text,
      });
      return { success: true, messageId: info.messageId };
    } catch (err: any) {
      return { success: false, error: err?.message ?? String(err) };
    }
  }
}
