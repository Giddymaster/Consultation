import type { FastifyInstance } from 'fastify';
import { createHash } from 'node:crypto';
import { prisma } from '../../lib/prisma.js';
import { logger } from '../../lib/logger.js';
import { AUDIT_ACTIONS, recordAudit } from '../../services/audit.service.js';
import {
  verifyWebhookSignature,
  type PaystackTransaction,
  type PaystackWebhookEvent,
} from '../../services/payments/paystack.client.js';
import { settlePayment } from '../../services/payments/payment.service.js';
import { onPaymentSettled } from '../../services/fulfilment.service.js';

/**
 * Paystack webhook receiver.
 *
 * Paystack signs the **raw request body** with HMAC-SHA512. Re-serialising a
 * parsed object to verify would fail on key order or number formatting, so the
 * application's JSON parser (in app.ts) preserves the original bytes on
 * `request.rawBody` and this route verifies against those.
 *
 * Replay safety comes from the `webhook_events(provider, eventId)` unique
 * constraint: a duplicate delivery loses the insert race and returns 200
 * without doing any work, which is what Paystack's retry schedule requires.
 */

declare module 'fastify' {
  interface FastifyRequest {
    rawBody?: Buffer;
  }
}

/**
 * Paystack does not send an event id header, so the identity of a delivery is
 * derived from its content: event type plus the transaction reference and id.
 * Two genuine events never share all three; a retry of one always does.
 */
function deriveEventId(event: PaystackWebhookEvent, rawBody: Buffer): string {
  const reference = event.data?.reference;
  const id = event.data?.id;
  if (reference && id) return `${event.event}:${reference}:${id}`;
  if (reference) return `${event.event}:${reference}`;
  return `${event.event}:${createHash('sha256').update(rawBody).digest('hex').slice(0, 32)}`;
}

export async function paystackWebhookRoutes(app: FastifyInstance): Promise<void> {
  app.post(
    '/paystack',
    {
      config: { rateLimit: false },
      schema: {
        tags: ['Webhooks'],
        summary: 'Paystack event receiver',
        description:
          'Verifies the x-paystack-signature HMAC-SHA512 over the raw body, records the delivery for replay protection, then settles the payment. Always returns 200 for an authentic event so Paystack stops retrying.',
      },
    },
    async (request, reply) => {
      const signature = request.headers['x-paystack-signature'];
      const rawBody = request.rawBody;

      if (!rawBody || !verifyWebhookSignature(rawBody, typeof signature === 'string' ? signature : undefined)) {
        logger.warn({ ip: request.ip }, 'Rejected Paystack webhook with an invalid signature');
        await recordAudit({
          action: AUDIT_ACTIONS.WEBHOOK_REJECTED,
          entity: 'Webhook',
          metadata: { provider: 'paystack', reason: 'invalid_signature' },
          context: { ip: request.ip, userAgent: request.headers['user-agent'] ?? null },
        });
        // 401, not 200: an unsigned request is not an event we accept.
        return reply.status(401).send({ status: false, message: 'Invalid signature' });
      }

      const event = request.body as PaystackWebhookEvent | undefined;
      if (!event?.event) {
        return reply.status(400).send({ status: false, message: 'Malformed event' });
      }

      const eventId = deriveEventId(event, rawBody);

      // Claim the delivery. A duplicate hits the unique constraint and exits
      // here, before any money is touched.
      try {
        await prisma.webhookEvent.create({
          data: {
            provider: 'paystack',
            eventId,
            eventType: event.event,
            payload: event as never,
            status: 'RECEIVED',
          },
        });
      } catch (error) {
        if (typeof error === 'object' && error !== null && (error as { code?: string }).code === 'P2002') {
          logger.info({ eventId, eventType: event.event }, 'Ignoring duplicate Paystack webhook delivery');
          return reply.status(200).send({ status: true, message: 'Already processed' });
        }
        throw error;
      }

      await recordAudit({
        action: AUDIT_ACTIONS.WEBHOOK_RECEIVED,
        entity: 'Webhook',
        entityId: eventId,
        metadata: { provider: 'paystack', eventType: event.event },
        context: { ip: request.ip, userAgent: request.headers['user-agent'] ?? null },
      });

      // Respond before fulfilment. Paystack asks for a prompt 200, and meeting
      // creation plus calendar and email work can take seconds.
      void reply.status(200).send({ status: true, message: 'Received' });

      try {
        await handleEvent(event, eventId);
        await prisma.webhookEvent.updateMany({
          where: { provider: 'paystack', eventId },
          data: { status: 'PROCESSED', processedAt: new Date() },
        });
      } catch (error) {
        const message = error instanceof Error ? error.message : String(error);
        logger.error({ err: error, eventId, eventType: event.event }, 'Paystack webhook processing failed');
        await prisma.webhookEvent.updateMany({
          where: { provider: 'paystack', eventId },
          data: { status: 'FAILED', error: message.slice(0, 2000), processedAt: new Date() },
        });
      }

      return reply;
    },
  );
}

async function handleEvent(event: PaystackWebhookEvent, eventId: string): Promise<void> {
  switch (event.event) {
    case 'charge.success': {
      const result = await settlePayment(event.data as PaystackTransaction);
      // Side effects run only on the first settlement, so a replay that somehow
      // got past the dedupe still cannot send a second confirmation email.
      if (result.firstSettlement) await onPaymentSettled(result);
      break;
    }

    case 'refund.processed':
    case 'refund.failed': {
      const reference = event.data?.reference;
      if (!reference) break;
      await prisma.refund.updateMany({
        where: { payment: { reference } },
        data: {
          status: event.event === 'refund.processed' ? 'COMPLETED' : 'FAILED',
          processedAt: new Date(),
        },
      });
      break;
    }

    default:
      logger.debug({ eventType: event.event, eventId }, 'Paystack event acknowledged but not acted on');
  }
}
