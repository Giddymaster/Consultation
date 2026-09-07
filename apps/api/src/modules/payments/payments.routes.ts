import type { FastifyInstance } from 'fastify';
import { z } from 'zod';
import {
  idSchema,
  initializePaymentSchema,
  paymentListQuerySchema,
  refundSchema,
  verifyPaymentSchema,
} from '@meridian/types';
import { prisma } from '../../lib/prisma.js';
import { forbidden, notFound } from '../../lib/errors.js';
import { ok, paginated, toSkipTake } from '../../lib/http.js';
import { requireUser } from '../../plugins/auth.js';
import {
  initializePayment,
  refundPayment,
  verifyAndSettle,
} from '../../services/payments/payment.service.js';
import { onPaymentSettled } from '../../services/fulfilment.service.js';
import { sendRefundConfirmationEmail } from '../../services/email/messages.js';
import { toPaymentSummary } from '../serializers.js';

/**
 * Payment endpoints.
 *
 * `/verify` exists for the confirmation screen, which the browser reaches after
 * Paystack redirects. It does **not** trust that redirect: it calls Paystack
 * server-side and settles from the response. The webhook remains the primary
 * path; this is a convenience so a returning user sees the right state
 * immediately rather than waiting for the callback to arrive.
 */

export async function paymentRoutes(app: FastifyInstance): Promise<void> {
  app.post(
    '/initialize',
    {
      preHandler: [app.authenticate],
      config: { rateLimit: { max: 30, timeWindow: '10 minutes' } },
      schema: {
        tags: ['Payments'],
        summary: 'Start a Paystack checkout',
        description:
          'The amount is computed server-side from the booking or order. The request names what is being paid for, never how much.',
        security: [{ bearerAuth: [] }],
      },
    },
    async (request, reply) => {
      const user = requireUser(request);
      const input = initializePaymentSchema.parse(request.body);

      // Object-level check before we touch Paystack: a caller may only pay for
      // something that belongs to them, unless they hold payments.manage.
      if (input.bookingId) {
        const booking = await prisma.booking.findUnique({
          where: { id: input.bookingId },
          select: { client: { select: { userId: true } } },
        });
        if (!booking) throw notFound('Booking');
        if (booking.client.userId !== user.id && !user.permissions.includes('payments.manage')) {
          throw forbidden('You cannot pay for a booking that is not yours.');
        }
      }

      if (input.orderId) {
        const order = await prisma.order.findUnique({
          where: { id: input.orderId },
          select: { userId: true },
        });
        if (!order) throw notFound('Order');
        if (order.userId !== user.id && !user.permissions.includes('payments.manage')) {
          throw forbidden('You cannot pay for an order that is not yours.');
        }
      }

      const initialization = await initializePayment({
        purpose: input.purpose,
        bookingId: input.bookingId,
        orderId: input.orderId,
        userId: user.id,
        userEmail: user.email,
        callbackPath: input.callbackPath,
      });

      return ok(reply, initialization);
    },
  );

  app.post(
    '/verify',
    {
      preHandler: [app.authenticate],
      config: { rateLimit: { max: 40, timeWindow: '10 minutes' } },
      schema: {
        tags: ['Payments'],
        summary: 'Verify a transaction with Paystack and settle it',
        description:
          'Calls Paystack directly rather than believing the browser. Safe to call repeatedly: settlement is idempotent.',
        security: [{ bearerAuth: [] }],
      },
    },
    async (request, reply) => {
      const user = requireUser(request);
      const { reference } = verifyPaymentSchema.parse(request.body);

      const payment = await prisma.payment.findUnique({
        where: { reference },
        select: { userId: true },
      });
      if (!payment) throw notFound('Payment');
      if (payment.userId !== user.id && !user.permissions.includes('payments.read')) {
        throw forbidden('That payment does not belong to you.');
      }

      const result = await verifyAndSettle(reference);
      // Fulfilment runs only on the transition into paid, so a user refreshing
      // the confirmation page does not trigger a second confirmation email.
      if (result.firstSettlement) await onPaymentSettled(result);

      return ok(reply, {
        status: result.status,
        bookingId: result.bookingId ?? null,
        orderId: result.orderId ?? null,
      });
    },
  );

  app.get(
    '/',
    {
      preHandler: [app.authenticate],
      schema: { tags: ['Payments'], summary: 'List payments visible to the caller', security: [{ bearerAuth: [] }] },
    },
    async (request, reply) => {
      const user = requireUser(request);
      const query = paymentListQuerySchema.parse(request.query);
      const { skip, take } = toSkipTake(query.page, query.pageSize);

      const canSeeAll = user.permissions.includes('payments.read');

      const where = {
        // Without payments.read, the list is pinned to the caller's own rows.
        ...(canSeeAll ? {} : { userId: user.id }),
        ...(query.status ? { status: query.status } : {}),
        ...(query.purpose ? { purpose: query.purpose } : {}),
        ...(canSeeAll && query.consultantId
          ? { booking: { consultantId: query.consultantId } }
          : {}),
        ...(canSeeAll && query.serviceId ? { booking: { serviceId: query.serviceId } } : {}),
        ...(canSeeAll && query.clientId ? { booking: { clientId: query.clientId } } : {}),
        ...(query.from || query.to
          ? {
              createdAt: {
                ...(query.from ? { gte: new Date(query.from) } : {}),
                ...(query.to ? { lte: new Date(query.to) } : {}),
              },
            }
          : {}),
        ...(query.search
          ? {
              OR: [
                { reference: { contains: query.search, mode: 'insensitive' as const } },
                { customerEmail: { contains: query.search, mode: 'insensitive' as const } },
              ],
            }
          : {}),
      };

      const [payments, total, totals] = await Promise.all([
        prisma.payment.findMany({
          where,
          orderBy: { createdAt: 'desc' },
          skip,
          take,
          include: {
            booking: {
              select: {
                id: true,
                reference: true,
                service: { select: { name: true } },
                client: { select: { user: { select: { firstName: true, lastName: true, email: true } } } },
              },
            },
          },
        }),
        prisma.payment.count({ where }),
        prisma.payment.aggregate({
          where: { ...where, status: 'PAID' },
          _sum: { amount: true, refundedAmount: true, feeAmount: true },
        }),
      ]);

      return ok(reply, {
        ...paginated(
          payments.map((payment) => ({
            ...toPaymentSummary(payment),
            customerEmail: payment.customerEmail,
            booking: payment.booking
              ? {
                  id: payment.booking.id,
                  reference: payment.booking.reference,
                  serviceName: payment.booking.service.name,
                  clientName: `${payment.booking.client.user.firstName} ${payment.booking.client.user.lastName}`,
                }
              : null,
          })),
          total,
          query.page,
          query.pageSize,
        ),
        totals: {
          collected: totals._sum.amount ?? 0,
          refunded: totals._sum.refundedAmount ?? 0,
          fees: totals._sum.feeAmount ?? 0,
        },
      });
    },
  );

  app.get(
    '/:id',
    {
      preHandler: [app.authenticate],
      schema: { tags: ['Payments'], summary: 'Payment detail', security: [{ bearerAuth: [] }] },
    },
    async (request, reply) => {
      const user = requireUser(request);
      const { id } = z.object({ id: idSchema }).parse(request.params);

      const payment = await prisma.payment.findUnique({
        where: { id },
        include: { refunds: true, booking: { select: { id: true, reference: true } } },
      });
      if (!payment) throw notFound('Payment');

      if (payment.userId !== user.id && !user.permissions.includes('payments.read')) {
        throw notFound('Payment');
      }

      return ok(reply, {
        ...toPaymentSummary(payment),
        customerEmail: payment.customerEmail,
        cardLast4: payment.cardLast4,
        cardBrand: payment.cardBrand,
        feeAmount: payment.feeAmount,
        gatewayResponse: payment.gatewayResponse,
        booking: payment.booking,
        refunds: payment.refunds.map((refund) => ({
          id: refund.id,
          amount: refund.amount,
          status: refund.status,
          reason: refund.reason,
          createdAt: refund.createdAt.toISOString(),
          processedAt: refund.processedAt?.toISOString() ?? null,
        })),
      });
    },
  );

  app.post(
    '/refund',
    {
      preHandler: [app.requirePermissions('payments.refund')],
      schema: {
        tags: ['Payments'],
        summary: 'Refund a settled payment',
        description: 'Requires the payments.refund permission. Partial refunds are supported.',
        security: [{ bearerAuth: [] }],
      },
    },
    async (request, reply) => {
      const user = requireUser(request);
      const input = refundSchema.parse(request.body);

      const result = await refundPayment({
        paymentId: input.paymentId,
        amount: input.amount,
        reason: input.reason,
        merchantNote: input.merchantNote,
        actorId: user.id,
      });

      const payment = await prisma.payment.findUniqueOrThrow({
        where: { id: input.paymentId },
        select: {
          reference: true,
          currency: true,
          customerEmail: true,
          userId: true,
        },
      });

      const payer = payment.userId
        ? await prisma.user.findUnique({
            where: { id: payment.userId },
            select: { firstName: true },
          })
        : null;

      await sendRefundConfirmationEmail({
        to: payment.customerEmail,
        firstName: payer?.firstName ?? 'there',
        amount: result.amount,
        currency: payment.currency,
        reference: payment.reference,
        reason: input.reason,
        paymentId: input.paymentId,
      });

      return ok(reply, { refundId: result.refundId, amount: result.amount });
    },
  );
}
