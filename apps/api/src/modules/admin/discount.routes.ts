import type { FastifyInstance } from 'fastify';
import { z } from 'zod';
import { idSchema, upsertDiscountSchema, updateDiscountSchema } from '@meridian/types';
import { prisma } from '../../lib/prisma.js';
import { badRequest, notFound } from '../../lib/errors.js';
import { created as createdReply, ok, paginated, toSkipTake } from '../../lib/http.js';
import { requireUser } from '../../plugins/auth.js';
import { AUDIT_ACTIONS, auditFromRequest } from '../../services/audit.service.js';
import { normaliseCode, quoteDiscount } from '../../services/discount.service.js';

/**
 * Discount codes: administration, and the one endpoint a client may call.
 *
 * The client-facing route quotes a code against a basket and returns what it
 * would be worth. It is a *preview*: nothing is reserved, and checkout re-runs
 * the same validation against the authoritative prices. A client that skips the
 * preview and posts a code straight to checkout gets the same answer.
 */

function toDto(discount: {
  id: string;
  code: string;
  description: string | null;
  type: string;
  value: number;
  currency: string | null;
  appliesTo: string;
  serviceIds: string[];
  productIds: string[];
  minSubtotal: number;
  maxDiscount: number;
  maxRedemptions: number | null;
  redeemedCount: number;
  perClientLimit: number | null;
  startsAt: Date | null;
  endsAt: Date | null;
  isActive: boolean;
  createdAt: Date;
}) {
  const now = new Date();
  const expired = Boolean(discount.endsAt && discount.endsAt < now);
  const scheduled = Boolean(discount.startsAt && discount.startsAt > now);
  const exhausted =
    discount.maxRedemptions !== null && discount.redeemedCount >= discount.maxRedemptions;

  return {
    id: discount.id,
    code: discount.code,
    description: discount.description,
    type: discount.type,
    value: discount.value,
    currency: discount.currency,
    appliesTo: discount.appliesTo,
    serviceIds: discount.serviceIds,
    productIds: discount.productIds,
    minSubtotal: discount.minSubtotal,
    maxDiscount: discount.maxDiscount,
    maxRedemptions: discount.maxRedemptions,
    redeemedCount: discount.redeemedCount,
    perClientLimit: discount.perClientLimit,
    startsAt: discount.startsAt?.toISOString() ?? null,
    endsAt: discount.endsAt?.toISOString() ?? null,
    isActive: discount.isActive,
    createdAt: discount.createdAt.toISOString(),
    /** One derived word for the list, so the UI does not re-derive the rules. */
    state: !discount.isActive
      ? 'WITHDRAWN'
      : expired
        ? 'EXPIRED'
        : scheduled
          ? 'SCHEDULED'
          : exhausted
            ? 'EXHAUSTED'
            : 'ACTIVE',
  };
}

export async function discountRoutes(app: FastifyInstance): Promise<void> {
  /* ---------------------------------------------------------------------- */
  /* Client-facing preview                                                  */
  /* ---------------------------------------------------------------------- */

  app.post(
    '/discounts/preview',
    {
      // Optional auth, because the booking flow accepts guests and a code that
      // checkout would honour must be previewable by the person using it. The
      // per-client limit simply cannot be checked without an account; it is
      // enforced at redemption, inside the transaction, which is where it counts.
      preHandler: [app.optionalAuth],
      config: { rateLimit: { max: 20, timeWindow: '1 minute' } },
      schema: {
        tags: ['Discounts'],
        summary: 'Check what a discount code is worth for a basket',
        description:
          'Preview only — nothing is reserved and no redemption is consumed. The amount is recalculated at checkout from the authoritative prices, so this response cannot be used to change what is charged. Rate limited, because an unlimited endpoint here is a code-guessing oracle.',
        security: [{ bearerAuth: [] }],
      },
    },
    async (request, reply) => {
      const userId = request.currentUser?.id ?? null;
      const input = z
        .object({
          code: z.string().trim().min(1).max(40),
          serviceId: idSchema.optional(),
          durationMinutes: z.coerce.number().int().min(5).max(600).optional(),
          productIds: z.array(idSchema).max(50).optional(),
        })
        .parse(request.body);

      // The subtotal is read from the catalogue, never taken from the request.
      if (input.serviceId) {
        const service = await prisma.service.findUnique({
          where: { id: input.serviceId },
          select: { id: true, status: true, currency: true, durations: { select: { minutes: true, price: true, isDefault: true } } },
        });
        if (!service || service.status !== 'PUBLISHED') throw notFound('Service');

        const duration =
          service.durations.find((d) => d.minutes === input.durationMinutes) ??
          service.durations.find((d) => d.isDefault) ??
          service.durations[0];
        if (!duration) throw badRequest('That service has no bookable duration.');

        const quote = await quoteDiscount({
          code: input.code,
          userId,
          currency: service.currency,
          subtotal: duration.price,
          scope: 'SERVICES',
          serviceId: service.id,
        });

        return ok(reply, { ...quote, subtotal: duration.price });
      }

      const productIds = input.productIds ?? [];
      if (productIds.length === 0) throw badRequest('Nothing to apply a code to.');

      const products = await prisma.product.findMany({
        where: { id: { in: productIds }, status: 'PUBLISHED' },
        select: { id: true, price: true, currency: true },
      });
      if (products.length === 0) throw badRequest('Nothing to apply a code to.');

      const subtotal = products.reduce((sum, product) => sum + product.price, 0);
      const quote = await quoteDiscount({
        code: input.code,
        userId,
        currency: products[0]!.currency,
        subtotal,
        scope: 'PRODUCTS',
        productIds: products.map((product) => product.id),
      });

      return ok(reply, { ...quote, subtotal });
    },
  );

  /* ---------------------------------------------------------------------- */
  /* Administration                                                         */
  /* ---------------------------------------------------------------------- */

  app.get(
    '/admin/discounts',
    {
      preHandler: [app.requirePermissions('discounts.read')],
      schema: { tags: ['Admin'], summary: 'List discount codes', security: [{ bearerAuth: [] }] },
    },
    async (request, reply) => {
      const query = z
        .object({
          page: z.coerce.number().int().min(1).default(1),
          pageSize: z.coerce.number().int().min(1).max(100).default(25),
          search: z.string().trim().max(60).optional(),
          activeOnly: z.enum(['true', 'false']).optional(),
        })
        .parse(request.query);
      const { skip, take } = toSkipTake(query.page, query.pageSize);

      const where = {
        ...(query.search ? { code: { contains: query.search.toUpperCase() } } : {}),
        ...(query.activeOnly === 'true' ? { isActive: true } : {}),
      };

      const [discounts, total, redeemed] = await Promise.all([
        prisma.discount.findMany({ where, orderBy: { createdAt: 'desc' }, skip, take }),
        prisma.discount.count({ where }),
        prisma.discountRedemption.aggregate({ _sum: { amount: true }, _count: true }),
      ]);

      return ok(reply, {
        ...paginated(discounts.map(toDto), total, query.page, query.pageSize),
        totals: {
          redemptions: redeemed._count,
          discounted: redeemed._sum.amount ?? 0,
        },
      });
    },
  );

  app.get(
    '/admin/discounts/:id',
    {
      preHandler: [app.requirePermissions('discounts.read')],
      schema: { tags: ['Admin'], summary: 'One discount code', security: [{ bearerAuth: [] }] },
    },
    async (request, reply) => {
      const { id } = z.object({ id: idSchema }).parse(request.params);
      const discount = await prisma.discount.findUnique({
        where: { id },
        include: {
          redemptions: {
            orderBy: { createdAt: 'desc' },
            take: 50,
            include: { user: { select: { firstName: true, lastName: true, email: true } } },
          },
        },
      });
      if (!discount) throw notFound('Discount');

      return ok(reply, {
        ...toDto(discount),
        redemptions: discount.redemptions.map((redemption) => ({
          id: redemption.id,
          amount: redemption.amount,
          currency: redemption.currency,
          bookingId: redemption.bookingId,
          orderId: redemption.orderId,
          clientName: redemption.user
            ? `${redemption.user.firstName} ${redemption.user.lastName}`
            : 'Removed account',
          createdAt: redemption.createdAt.toISOString(),
        })),
      });
    },
  );

  app.post(
    '/admin/discounts',
    {
      preHandler: [app.requirePermissions('discounts.manage')],
      schema: { tags: ['Admin'], summary: 'Create a discount code', security: [{ bearerAuth: [] }] },
    },
    async (request, reply) => {
      const user = requireUser(request);
      const input = upsertDiscountSchema.parse(request.body);
      const code = normaliseCode(input.code);

      const clash = await prisma.discount.findUnique({ where: { code }, select: { id: true } });
      if (clash) throw badRequest('A discount with that code already exists.');

      const discount = await prisma.discount.create({
        data: {
          code,
          description: input.description ?? null,
          type: input.type,
          value: input.value,
          currency: input.currency ?? null,
          appliesTo: input.appliesTo,
          serviceIds: input.serviceIds ?? [],
          productIds: input.productIds ?? [],
          minSubtotal: input.minSubtotal ?? 0,
          maxDiscount: input.maxDiscount ?? 0,
          maxRedemptions: input.maxRedemptions ?? null,
          perClientLimit: input.perClientLimit ?? null,
          startsAt: input.startsAt ? new Date(input.startsAt) : null,
          endsAt: input.endsAt ? new Date(input.endsAt) : null,
          isActive: input.isActive ?? true,
          createdBy: user.id,
        },
      });

      await auditFromRequest(request, {
        action: AUDIT_ACTIONS.DISCOUNT_CREATED,
        entity: 'Discount',
        entityId: discount.id,
        metadata: { code, type: input.type, value: input.value },
      });

      return createdReply(reply, toDto(discount));
    },
  );

  app.patch(
    '/admin/discounts/:id',
    {
      preHandler: [app.requirePermissions('discounts.manage')],
      schema: { tags: ['Admin'], summary: 'Update a discount code', security: [{ bearerAuth: [] }] },
    },
    async (request, reply) => {
      const { id } = z.object({ id: idSchema }).parse(request.params);
      const input = updateDiscountSchema.parse(request.body);

      const existing = await prisma.discount.findUnique({ where: { id } });
      if (!existing) throw notFound('Discount');

      // The code is the identity clients have already been given; changing it
      // would silently break every message that quoted it.
      const discount = await prisma.discount.update({
        where: { id },
        data: {
          description: input.description ?? undefined,
          type: input.type ?? undefined,
          value: input.value ?? undefined,
          currency: input.currency ?? undefined,
          appliesTo: input.appliesTo ?? undefined,
          serviceIds: input.serviceIds ?? undefined,
          productIds: input.productIds ?? undefined,
          minSubtotal: input.minSubtotal ?? undefined,
          maxDiscount: input.maxDiscount ?? undefined,
          maxRedemptions: input.maxRedemptions === undefined ? undefined : input.maxRedemptions,
          perClientLimit: input.perClientLimit === undefined ? undefined : input.perClientLimit,
          startsAt: input.startsAt === undefined ? undefined : input.startsAt ? new Date(input.startsAt) : null,
          endsAt: input.endsAt === undefined ? undefined : input.endsAt ? new Date(input.endsAt) : null,
          isActive: input.isActive ?? undefined,
        },
      });

      await auditFromRequest(request, {
        action: AUDIT_ACTIONS.DISCOUNT_UPDATED,
        entity: 'Discount',
        entityId: id,
        metadata: { code: existing.code, changes: Object.keys(input) },
      });

      return ok(reply, toDto(discount));
    },
  );

  app.delete(
    '/admin/discounts/:id',
    {
      preHandler: [app.requirePermissions('discounts.manage')],
      schema: {
        tags: ['Admin'],
        summary: 'Withdraw a discount code',
        description:
          'A code that has been redeemed is deactivated rather than deleted, because its redemptions are part of the financial record. An unused code is removed outright.',
        security: [{ bearerAuth: [] }],
      },
    },
    async (request, reply) => {
      const { id } = z.object({ id: idSchema }).parse(request.params);

      const existing = await prisma.discount.findUnique({
        where: { id },
        select: { id: true, code: true, redeemedCount: true },
      });
      if (!existing) throw notFound('Discount');

      if (existing.redeemedCount > 0) {
        await prisma.discount.update({ where: { id }, data: { isActive: false } });
      } else {
        await prisma.discount.delete({ where: { id } });
      }

      await auditFromRequest(request, {
        action: AUDIT_ACTIONS.DISCOUNT_WITHDRAWN,
        entity: 'Discount',
        entityId: id,
        metadata: {
          code: existing.code,
          outcome: existing.redeemedCount > 0 ? 'withdrawn' : 'deleted',
        },
      });

      return ok(reply, {
        deleted: existing.redeemedCount === 0,
        withdrawn: existing.redeemedCount > 0,
      });
    },
  );
}
