export interface SendPayload {
  to:       string;   // recipient address / phone
  subject?: string;   // email only
  html?:    string;   // email only
  text?:    string;   // plain-text fallback / WhatsApp body
}

export interface SendResult {
  success:    boolean;
  messageId?: string;
  error?:     string;
}

export interface INotificationProvider {
  readonly channel: string;
  send(payload: SendPayload): Promise<SendResult>;
}
