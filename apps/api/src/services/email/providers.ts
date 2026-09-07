import nodemailer, { type Transporter } from 'nodemailer';
import { env } from '../../config/env.js';
import { logger } from '../../lib/logger.js';

/**
 * Email transport abstraction. Callers never know which provider is configured;
 * they hand over a rendered message and get back a provider message id.
 *
 * The console provider is the development default. It writes a one-line summary
 * to the log — it never pretends a message reached an inbox.
 */

export interface OutboundMessage {
  to: string;
  subject: string;
  html: string;
  text: string;
  replyTo?: string;
}

export interface DeliveryResult {
  messageId: string;
  provider: string;
}

export interface EmailProvider {
  readonly name: string;
  readonly isConfigured: boolean;
  send(message: OutboundMessage): Promise<DeliveryResult>;
}

class ConsoleEmailProvider implements EmailProvider {
  readonly name = 'console';
  readonly isConfigured = true;

  async send(message: OutboundMessage): Promise<DeliveryResult> {
    const messageId = `console-${Date.now()}-${Math.random().toString(36).slice(2, 10)}`;
    logger.info(
      { to: message.to, subject: message.subject, messageId },
      'Email rendered (console provider — nothing was actually sent)',
    );
    return { messageId, provider: this.name };
  }
}

class SmtpEmailProvider implements EmailProvider {
  readonly name = 'smtp';
  readonly isConfigured: boolean;
  private transporter: Transporter | null = null;

  constructor() {
    this.isConfigured = Boolean(env.SMTP_HOST);
  }

  private getTransporter(): Transporter {
    if (!this.transporter) {
      this.transporter = nodemailer.createTransport({
        host: env.SMTP_HOST,
        port: env.SMTP_PORT,
        secure: env.SMTP_SECURE,
        auth: env.SMTP_USER ? { user: env.SMTP_USER, pass: env.SMTP_PASSWORD } : undefined,
      });
    }
    return this.transporter;
  }

  async send(message: OutboundMessage): Promise<DeliveryResult> {
    const info = await this.getTransporter().sendMail({
      from: env.EMAIL_FROM,
      to: message.to,
      subject: message.subject,
      html: message.html,
      text: message.text,
      replyTo: message.replyTo ?? env.SUPPORT_EMAIL,
    });
    return { messageId: info.messageId, provider: this.name };
  }
}

/**
 * Resend's REST API, called directly rather than through their SDK to keep the
 * dependency surface small — it is a single POST.
 */
class ResendEmailProvider implements EmailProvider {
  readonly name = 'resend';
  readonly isConfigured: boolean;

  constructor() {
    this.isConfigured = Boolean(env.EMAIL_API_KEY);
  }

  async send(message: OutboundMessage): Promise<DeliveryResult> {
    const response = await fetch('https://api.resend.com/emails', {
      method: 'POST',
      headers: {
        Authorization: `Bearer ${env.EMAIL_API_KEY}`,
        'Content-Type': 'application/json',
      },
      body: JSON.stringify({
        from: env.EMAIL_FROM,
        to: [message.to],
        subject: message.subject,
        html: message.html,
        text: message.text,
        reply_to: message.replyTo ?? env.SUPPORT_EMAIL,
      }),
    });

    if (!response.ok) {
      const detail = await response.text();
      throw new Error(`Resend rejected the message (${response.status}): ${detail.slice(0, 300)}`);
    }

    const body = (await response.json()) as { id?: string };
    return { messageId: body.id ?? 'unknown', provider: this.name };
  }
}

let cached: EmailProvider | null = null;

export function getEmailProvider(): EmailProvider {
  if (cached) return cached;

  // MOCK_EMAIL forces the console provider regardless of credentials. env.ts
  // refuses to boot with it enabled in production.
  if (env.MOCK_EMAIL) {
    cached = new ConsoleEmailProvider();
    return cached;
  }

  switch (env.EMAIL_PROVIDER) {
    case 'smtp':
      cached = new SmtpEmailProvider();
      break;
    case 'resend':
      cached = new ResendEmailProvider();
      break;
    default:
      cached = new ConsoleEmailProvider();
  }
  return cached;
}

/** Test seam: lets the suite swap in a recording provider. */
export function __setEmailProvider(provider: EmailProvider | null): void {
  cached = provider;
}
