import type { EmailTemplate } from '@meridian/types';
import { prisma } from '../../lib/prisma.js';
import { logger } from '../../lib/logger.js';
import { getEmailProvider } from './providers.js';
import { renderEmail, renderPlainText, type LayoutOptions } from './layout.js';

/**
 * Sending an email always writes an EmailLog row — before the attempt, so a
 * crash mid-send still leaves a trace, and again after with the outcome. Admin
 * → Emails reads those rows, which is how a failed delivery becomes visible
 * rather than vanishing into a log file.
 */

export interface SendEmailInput {
  to: string;
  subject: string;
  template: EmailTemplate;
  layout: LayoutOptions;
  relatedEntity?: string;
  relatedEntityId?: string;
  replyTo?: string;
}

export interface SendEmailResult {
  logId: string;
  sent: boolean;
  messageId?: string;
  error?: string;
}

export async function sendEmail(input: SendEmailInput): Promise<SendEmailResult> {
  const provider = getEmailProvider();

  const log = await prisma.emailLog.create({
    data: {
      recipient: input.to,
      template: input.template,
      subject: input.subject,
      status: 'QUEUED',
      provider: provider.name,
      relatedEntity: input.relatedEntity ?? null,
      relatedEntityId: input.relatedEntityId ?? null,
      attempts: 1,
    },
    select: { id: true },
  });

  if (!provider.isConfigured) {
    const message = `Email provider "${provider.name}" is not configured`;
    await prisma.emailLog.update({
      where: { id: log.id },
      data: { status: 'FAILED', error: message },
    });
    logger.warn({ template: input.template, to: input.to }, message);
    return { logId: log.id, sent: false, error: message };
  }

  try {
    const result = await provider.send({
      to: input.to,
      subject: input.subject,
      html: renderEmail(input.layout),
      text: renderPlainText(input.layout),
      replyTo: input.replyTo,
    });

    await prisma.emailLog.update({
      where: { id: log.id },
      data: {
        status: 'SENT',
        providerMessageId: result.messageId,
        sentAt: new Date(),
      },
    });

    return { logId: log.id, sent: true, messageId: result.messageId };
  } catch (error) {
    const message = error instanceof Error ? error.message : 'Unknown email failure';
    await prisma.emailLog.update({
      where: { id: log.id },
      data: { status: 'FAILED', error: message.slice(0, 2000) },
    });
    logger.error({ err: error, template: input.template, to: input.to }, 'Email delivery failed');
    return { logId: log.id, sent: false, error: message };
  }
}

/**
 * Re-attempts a previously failed send. Called from the retry job and from the
 * "Retry" action in Admin → Emails.
 */
export async function retryEmail(logId: string, layout: LayoutOptions): Promise<SendEmailResult> {
  const log = await prisma.emailLog.findUnique({ where: { id: logId } });
  if (!log) return { logId, sent: false, error: 'Email log not found' };

  const provider = getEmailProvider();
  try {
    const result = await provider.send({
      to: log.recipient,
      subject: log.subject,
      html: renderEmail(layout),
      text: renderPlainText(layout),
    });
    await prisma.emailLog.update({
      where: { id: logId },
      data: {
        status: 'SENT',
        providerMessageId: result.messageId,
        sentAt: new Date(),
        attempts: { increment: 1 },
        error: null,
      },
    });
    return { logId, sent: true, messageId: result.messageId };
  } catch (error) {
    const message = error instanceof Error ? error.message : 'Unknown email failure';
    await prisma.emailLog.update({
      where: { id: logId },
      data: { status: 'FAILED', error: message.slice(0, 2000), attempts: { increment: 1 } },
    });
    return { logId, sent: false, error: message };
  }
}

export { renderEmail, renderPlainText } from './layout.js';
export type { LayoutOptions, DetailRow, EmailAction } from './layout.js';
