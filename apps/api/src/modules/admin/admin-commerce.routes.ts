import type { FastifyInstance } from 'fastify';
import { z } from 'zod';
import { idSchema, updateOrderSchema } from '@meridian/types';
import { prisma } from '../../lib/prisma.js';
import { badRequest, notFound } from '../../lib/errors.js';
import { ok, paginated, toSkipTake } from '../../lib/http.js';
import { AUDIT_ACTIONS, auditFromRequest } from '../../services/audit.service.js';
import { notify } from '../../services/notification.service.js';

/**
 * Order and invoice operations.
 *
 * Fulfilment is a small state machine of its own: an order can only move
 * forward from PAID, and it can never be marked fulfilled before payment has
 * actually settled. That check lives here rather than in the UI because the UI
 * is a convenience and this is the rule.
 */

const FULFILMENT_TRANSITIONS: Record<string, string[]> = {
  PENDING_PAYMENT: ['CANCELLED'],
  PAID: ['FULFILLED', 'CANCELLED'],
  FULFILLED: ['SHIPPED', 'CANCELLED'],
  SHIPPED: [],
  CANCELLED: [],
  REFUNDED: [],
};

export async function adminCommerceRoutes(app: FastifyInstance): Promise<void> {
  /* ---------------------------------------------------------------------- */
  /* Orders                                                                 */
  /* ---------------------------------------------------------------------- */

  app.get(
    '/orders',
    {
      preHandler: [app.requirePermissions('orders.read')],
      schema: { tags: ['Admin'], summary: 'List every order', security: [{ bearerAuth: [] }] },
    },
    async (request, reply) => {
      const query = z
        .object({
          page: z.coerce.number().int().min(1).default(1),
          pageSize: z.coerce.number().int().min(1).max(100).default(50),
          status: z.enum(['PENDING_PAYMENT', 'PAID', 'FULFILLED', 'SHIPPED', 'CANCELLED', 'REFUNDED']).optional(),
          search: z.string().trim().max(120).optional(),
        })
        .parse(request.query);

      const { skip, take } = toSkipTake(query.page, query.pageSize);

      const where = {
        ...(query.status ? { status: query.status } : {}),
        ...(query.search
          ? {
              OR: [
                { reference: { contains: query.search.toUpperCase() } },
                { user: { email: { contains: query.search, mode: 'insensitive' as const } } },
                { user: { lastName: { contains: query.search, mode: 'insensitive' as const } } },
              ],
            }
          : {}),
      };

      const [orders, total, totals] = await Promise.all([
        prisma.order.findMany({
          where,
          include: {
            user: { select: { id: true, firstName: true, lastName: true, email: true } },
            items: { include: { product: { select: { type: true, slug: true } } } },
          },
          orderBy: { createdAt: 'desc' },
          skip,
          take,
        }),
        prisma.order.count({ where }),
        prisma.order.aggregate({
          where: { status: { in: ['PAID', 'FULFILLED', 'SHIPPED'] } },
          _sum: { total: true },
          _count: { _all: true },
        }),
      ]);

      return ok(reply, {
        ...paginated(
          orders.map((order) => ({
            id: order.id,
            reference: order.reference,
            status: order.status,
            currency: order.currency,
            total: order.total,
            amountPaid: order.amountPaid,
            itemCount: order.items.reduce((sum, item) => sum + item.quantity, 0),
            // Only a physical order needs shipping; the list flags which do.
            requiresShipping: order.items.some((item) => item.product.type === 'PHYSICAL'),
            customer: {
              id: order.user.id,
              fullName: `${order.user.firstName} ${order.user.lastName}`,
              email: order.user.email,
            },
            createdAt: order.createdAt.toISOString(),
            paidAt: order.paidAt?.toISOString() ?? null,
          })),
          total,
          query.page,
          query.pageSize,
        ),
        totals: {
          revenue: totals._sum.total ?? 0,
          paidOrders: totals._count._all,
        },
      });
    },
  );

  app.get(
    '/orders/:id',
    {
      preHandler: [app.requirePermissions('orders.read')],
      schema: { tags: ['Admin'], summary: 'Order detail with items and payments', security: [{ bearerAuth: [] }] },
    },
    async (request, reply) => {
      const { id } = z.object({ id: idSchema }).parse(request.params);

      const order = await prisma.order.findUnique({
        where: { id },
        include: {
          user: { select: { id: true, firstName: true, lastName: true, email: true, phone: true } },
          items: {
            include: { product: { select: { slug: true, type: true, coverImageUrl: true } } },
          },
          payments: { orderBy: { createdAt: 'desc' } },
          invoice: true,
          entitlements: { select: { id: true, productId: true, downloadCount: true, lastDownloadAt: true } },
        },
      });
      if (!order) throw notFound('Order');

      return ok(reply, {
        id: order.id,
        reference: order.reference,
        status: order.status,
        currency: order.currency,
        subtotal: order.subtotal,
        tax: order.tax,
        shipping: order.shipping,
        total: order.total,
        amountPaid: order.amountPaid,
        notes: order.notes,
        shippingAddress: order.shippingAddress,
        createdAt: order.createdAt.toISOString(),
        paidAt: order.paidAt?.toISOString() ?? null,
        allowedTransitions: FULFILMENT_TRANSITIONS[order.status] ?? [],
        customer: {
          id: order.user.id,
          fullName: `${order.user.firstName} ${order.user.lastName}`,
          email: order.user.email,
          phone: order.user.phone,
        },
        items: order.items.map((item) => ({
          id: item.id,
          productId: item.productId,
          name: item.name,
          slug: item.product.slug,
          type: item.product.type,
          coverImageUrl: item.product.coverImageUrl,
          quantity: item.quantity,
          unitAmount: item.unitAmount,
          amount: item.amount,
          downloads:
            order.entitlements.find((entitlement) => entitlement.productId === item.productId)?.downloadCount ?? 0,
        })),
        payments: order.payments.map((payment) => ({
          id: payment.id,
          reference: payment.reference,
          amount: payment.amount,
          status: payment.status,
          channel: payment.channel,
          paidAt: payment.paidAt?.toISOString() ?? null,
        })),
        invoice: order.invoice
          ? { id: order.invoice.id, number: order.invoice.number, status: order.invoice.status }
          : null,
      });
    },
  );

  app.patch(
    '/orders/:id',
    {
      preHandler: [app.requirePermissions('orders.manage')],
      schema: {
        tags: ['Admin'],
        summary: 'Advance an order through fulfilment',
        description: 'Only the transitions listed on the order as allowedTransitions are accepted.',
        security: [{ bearerAuth: [] }],
      },
    },
    async (request, reply) => {
      const { id } = z.object({ id: idSchema }).parse(request.params);
      const input = updateOrderSchema.parse(request.body);

      const order = await prisma.order.findUnique({
        where: { id },
        select: {
          id: true,
          status: true,
          reference: true,
          userId: true,
          items: {
            select: {
              productId: true,
              quantity: true,
              product: { select: { type: true, stock: true } },
            },
          },
        },
      });
      if (!order) throw notFound('Order');

      const allowed = FULFILMENT_TRANSITIONS[order.status] ?? [];
      if (!allowed.includes(input.status)) {
        throw badRequest(
          `An order that is ${order.status.replace(/_/g, ' ').toLowerCase()} cannot move to ${input.status
            .replace(/_/g, ' ')
            .toLowerCase()}.`,
        );
      }

      await prisma.$transaction(async (tx) => {
        await tx.order.update({
          where: { id },
          data: {
            status: input.status,
            ...(input.note ? { notes: input.note } : {}),
          },
        });

        // Checkout decrements stock the moment an order is placed, so a
        // cancellation has to put it back. Without this, every abandoned
        // basket would permanently reduce inventory.
        if (input.status === 'CANCELLED') {
          for (const item of order.items) {
            if (item.product.type !== 'PHYSICAL' || item.product.stock === null) continue;
            await tx.product.update({
              where: { id: item.productId },
              data: { stock: { increment: item.quantity } },
            });
          }
        }
      });

      await auditFromRequest(request, {
        action: input.status === 'FULFILLED' ? AUDIT_ACTIONS.ORDER_FULFILLED : AUDIT_ACTIONS.ORDER_PAID,
        entity: 'Order',
        entityId: id,
        metadata: { from: order.status, to: input.status },
      });

      // Tell the customer their physical order is on its way.
      if (input.status === 'SHIPPED') {
        await notify({
          userId: order.userId,
          type: 'NEW_ORDER',
          title: 'Your order has shipped',
          body: `Order ${order.reference} is on its way.`,
          href: '/portal/resources',
        });
      }

      return ok(reply, { id, status: input.status });
    },
  );

  /* ---------------------------------------------------------------------- */
  /* Invoices                                                               */
  /* ---------------------------------------------------------------------- */

  app.get(
    '/invoices',
    {
      preHandler: [app.requirePermissions('invoices.read')],
      schema: { tags: ['Admin'], summary: 'List every invoice', security: [{ bearerAuth: [] }] },
    },
    async (request, reply) => {
      const query = z
        .object({
          page: z.coerce.number().int().min(1).default(1),
          pageSize: z.coerce.number().int().min(1).max(100).default(50),
          status: z.enum(['DRAFT', 'ISSUED', 'PAID', 'PARTIALLY_PAID', 'VOID', 'OVERDUE']).optional(),
          search: z.string().trim().max(120).optional(),
        })
        .parse(request.query);

      const { skip, take } = toSkipTake(query.page, query.pageSize);

      const where = {
        ...(query.status ? { status: query.status } : {}),
        ...(query.search ? { number: { contains: query.search.toUpperCase() } } : {}),
      };

      const [invoices, total, aggregate] = await Promise.all([
        prisma.invoice.findMany({
          where,
          include: {
            booking: {
              select: {
                reference: true,
                service: { select: { name: true } },
                client: { select: { user: { select: { firstName: true, lastName: true, email: true } } } },
              },
            },
            order: { select: { reference: true } },
          },
          orderBy: { createdAt: 'desc' },
          skip,
          take,
        }),
        prisma.invoice.count({ where }),
        prisma.invoice.aggregate({ where, _sum: { total: true, amountPaid: true } }),
      ]);

      return ok(reply, {
        ...paginated(
          invoices.map((invoice) => ({
            id: invoice.id,
            number: invoice.number,
            status: invoice.status,
            currency: invoice.currency,
            subtotal: invoice.subtotal,
            tax: invoice.tax,
            total: invoice.total,
            amountPaid: invoice.amountPaid,
            balance: invoice.total - invoice.amountPaid,
            issuedAt: invoice.issuedAt?.toISOString() ?? null,
            dueAt: invoice.dueAt?.toISOString() ?? null,
            paidAt: invoice.paidAt?.toISOString() ?? null,
            reference: invoice.booking?.reference ?? invoice.order?.reference ?? null,
            description: invoice.booking?.service.name ?? 'Resource purchase',
            customer: invoice.booking
              ? {
                  fullName: `${invoice.booking.client.user.firstName} ${invoice.booking.client.user.lastName}`,
                  email: invoice.booking.client.user.email,
                }
              : null,
            lines: invoice.lines,
          })),
          total,
          query.page,
          query.pageSize,
        ),
        totals: {
          invoiced: aggregate._sum.total ?? 0,
          collected: aggregate._sum.amountPaid ?? 0,
          outstanding: (aggregate._sum.total ?? 0) - (aggregate._sum.amountPaid ?? 0),
        },
      });
    },
  );

  /* ---------------------------------------------------------------------- */
  /* Calendar                                                               */
  /* ---------------------------------------------------------------------- */

  app.get(
    '/calendar',
    {
      preHandler: [app.requirePermissions('appointments.read')],
      schema: {
        tags: ['Admin'],
        summary: 'Bookings within a date range, for the calendar view',
        description: 'Returns a flat list; the client groups by day. Capped at a 92-day window.',
        security: [{ bearerAuth: [] }],
      },
    },
    async (request, reply) => {
      const query = z
        .object({
          from: z.iso.datetime(),
          to: z.iso.datetime(),
          consultantId: idSchema.optional(),
        })
        .parse(request.query);

      const from = new Date(query.from);
      const to = new Date(query.to);

      // A window this size is already generous for a month view; an unbounded
      // range would let one request scan the whole booking table.
      if (to.getTime() - from.getTime() > 92 * 86_400_000) {
        throw badRequest('Calendar ranges are limited to 92 days.');
      }

      const bookings = await prisma.booking.findMany({
        where: {
          startAt: { gte: from, lte: to },
          ...(query.consultantId ? { consultantId: query.consultantId } : {}),
        },
        select: {
          id: true,
          reference: true,
          status: true,
          paymentStatus: true,
          startAt: true,
          endAt: true,
          durationMinutes: true,
          timezone: true,
          meetingProvider: true,
          service: { select: { name: true } },
          consultant: {
            select: { id: true, user: { select: { firstName: true, lastName: true } } },
          },
          client: { select: { user: { select: { firstName: true, lastName: true } } } },
        },
        orderBy: { startAt: 'asc' },
      });

      const consultants = await prisma.consultantProfile.findMany({
        where: { isPublished: true },
        select: { id: true, user: { select: { firstName: true, lastName: true } } },
        orderBy: { sortOrder: 'asc' },
      });

      return ok(reply, {
        bookings: bookings.map((booking) => ({
          id: booking.id,
          reference: booking.reference,
          status: booking.status,
          paymentStatus: booking.paymentStatus,
          startAt: booking.startAt.toISOString(),
          endAt: booking.endAt.toISOString(),
          durationMinutes: booking.durationMinutes,
          timezone: booking.timezone,
          meetingProvider: booking.meetingProvider,
          serviceName: booking.service.name,
          consultantId: booking.consultant.id,
          consultantName: `${booking.consultant.user.firstName} ${booking.consultant.user.lastName}`,
          clientName: `${booking.client.user.firstName} ${booking.client.user.lastName}`,
        })),
        consultants: consultants.map((consultant) => ({
          id: consultant.id,
          fullName: `${consultant.user.firstName} ${consultant.user.lastName}`,
        })),
      });
    },
  );
}
