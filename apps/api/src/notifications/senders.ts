import { createTransport, type Transporter } from 'nodemailer';

export interface EmailMessage {
  to: string;
  subject: string;
  text: string;
  html: string;
}

export interface EmailSender {
  send(message: EmailMessage): Promise<void>;
}

/** SMS / WhatsApp. Disabled unless an adapter is configured (FR-5.8). */
export interface MessageSender {
  send(message: { toPhone: string; text: string }): Promise<void>;
}

type Log = (msg: string, meta?: Record<string, unknown>) => void;

/** Masks an email or phone for logs (no full PII in logs, §9.1). */
export function maskContact(value: string): string {
  if (value.includes('@')) {
    const [user = '', domain = ''] = value.split('@');
    return `${user.slice(0, 1)}***@${domain}`;
  }
  return `${value.slice(0, 4)}*****${value.slice(-2)}`;
}

/** Dev default: logs that an email would be sent, without its contents. */
export class ConsoleEmailSender implements EmailSender {
  readonly sent: EmailMessage[] = [];
  constructor(private readonly log: Log = () => {}) {}
  async send(message: EmailMessage) {
    this.sent.push(message);
    this.log('email (console sender)', { to: maskContact(message.to), subject: message.subject });
  }
}

export class SmtpEmailSender implements EmailSender {
  private readonly transport: Transporter;
  constructor(
    smtpUrl: string,
    private readonly from: string,
  ) {
    this.transport = createTransport(smtpUrl);
  }
  async send(message: EmailMessage) {
    await this.transport.sendMail({ from: this.from, ...message });
  }
}

/**
 * Generic hook for an SMS/WhatsApp provider: POSTs `{ to, text }` to a URL with a bearer token.
 * Plug a provider in behind such a URL without changing Microstore.
 */
export class WebhookMessageSender implements MessageSender {
  constructor(
    private readonly url: string,
    private readonly token: string,
    private readonly fetchImpl: typeof fetch = globalThis.fetch.bind(globalThis),
  ) {}
  async send({ toPhone, text }: { toPhone: string; text: string }) {
    const res = await this.fetchImpl(this.url, {
      method: 'POST',
      headers: { 'content-type': 'application/json', authorization: `Bearer ${this.token}` },
      body: JSON.stringify({ to: toPhone, text }),
      signal: AbortSignal.timeout(5_000),
    });
    if (!res.ok) throw new Error(`Message hook responded ${res.status}`);
  }
}
