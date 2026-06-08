/**
 * WhatsApp notification provider — placeholder for future implementation.
 *
 * To activate, install the Twilio SDK (or equivalent) and implement `send`:
 *   npm install twilio
 * Then configure: TWILIO_ACCOUNT_SID, TWILIO_AUTH_TOKEN, TWILIO_WHATSAPP_FROM
 */
import type { INotificationProvider, SendPayload, SendResult } from './INotificationProvider';

export class WhatsAppProvider implements INotificationProvider {
  readonly channel = 'whatsapp';

  async send(_payload: SendPayload): Promise<SendResult> {
    // TODO: Implement via Twilio / Meta Cloud API
    return { success: false, error: 'WhatsApp provider not yet configured' };
  }
}
