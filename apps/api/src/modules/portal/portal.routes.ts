import type { FastifyInstance } from 'fastify';
import { z } from 'zod';
import { idSchema, queryBooleanSchema } from '@meridian/types';
import { prisma } from '../../lib/prisma.js';
import { noContent, ok, paginated, toSkipTake } from '../../lib/http.js';
import { requireUser } from '../../plugins/auth.js';
import { markAllRead, markRead, unreadCount } from '../../services/notification.service.js';
import { env } from '../../config/env.js';
import { toBookingSummary, toReviewDto } from '../serializers.js';
import { brandAssetUrls } from '../admin/branding.routes.js';

/**
 * Portal aggregates, notifications, public settings and search.
 *
 * The dashboard endpoints exist so a portal page is one request rather than
 * six — the client should not have to orchestrate a fan-out to render a screen.
 */

export async function portalRoutes(app: FastifyInstance): Promise<void> {
  /* ---------------------------------------------------------------------- */
  /* Client portal                                                          */
  /* ---------------------------------------------------------------------- */

  app.get(
    '/portal/dashboard',
    {
      preHandler: [app.authenticate],
      schema: { tags: ['Portal'], summary: 'Client dashboard summary', security: [{ bearerAuth: [] }] },
    },
    async (request, reply) => {
      const user = requireUser(request);

      const profile = await prisma.clientProfile.findUnique({
        where: { userId: user.id },
        select: { id: true },
      });

      // A user with no client profile has an empty portal, not an error.
      //
      // Every field of the normal response appears here, including the empty
      // arrays. Omitting `upcoming` and `outstandingBookings` left the browser
      // reading `.length` of undefined, so a consultant or administrator opening
      // /portal got a blank page rather than an empty one.
      if (!profile) {
        return ok(reply, {
          nextSession: null,
          upcoming: [],
          upcomingCount: 0,
          totalSessions: 0,
          outstandingBalance: 0,
          outstandingBookings: [],
          currency: env.BUSINESS_CURRENCY,
          recentPurchases: [],
          unreadNotifications: await unreadCount(user.id),
          pendingReviews: [],
        });
      }

      const bookingInclude = {
        service: { select: { id: true, name: true, slug: true } },
        consultant: {
          select: {
            id: true, slug: true, title: true,
            user: { select: { firstName: true, lastName: true, avatarUrl: true } },
          },
        },
        client: { select: { id: true, user: { select: { firstName: true, lastName: true, email: true } } } },
      } as const;

      const [upcoming, totalSessions, outstandingRows, orders, notifications, reviewable] = await Promise.all([
        prisma.booking.findMany({
          where: {
            clientId: profile.id,
            status: { in: ['CONFIRMED', 'RESCHEDULED', 'IN_PROGRESS'] },
            startAt: { gte: new Date() },
          },
          include: bookingInclude,
          orderBy: { startAt: 'asc' },
          take: 5,
        }),
        prisma.booking.count({ where: { clientId: profile.id, status: 'COMPLETED' } }),
        prisma.booking.findMany({
          where: {
            clientId: profile.id,
            status: { in: ['CONFIRMED', 'RESCHEDULED', 'IN_PROGRESS'] },
            paymentStatus: { in: ['PARTIALLY_PAID', 'UNPAID'] },
          },
          select: { id: true, reference: true, total: true, amountPaid: true, currency: true, startAt: true },
        }),
        prisma.order.findMany({
          where: { userId: user.id, status: { in: ['PAID', 'FULFILLED', 'SHIPPED'] } },
          select: { id: true, reference: true, total: true, currency: true, paidAt: true, _count: { select: { items: true } } },
          orderBy: { createdAt: 'desc' },
          take: 4,
        }),
        unreadCount(user.id),
        prisma.booking.findMany({
          where: { clientId: profile.id, status: 'COMPLETED', review: null },
          select: {
            id: true, reference: true,
            service: { select: { name: true } },
            consultant: { select: { user: { select: { firstName: true, lastName: true } } } },
          },
          orderBy: { startAt: 'desc' },
          take: 3,
        }),
      ]);

      return ok(reply, {
        nextSession: upcoming[0] ? toBookingSummary(upcoming[0]) : null,
        upcoming: upcoming.map(toBookingSummary),
        upcomingCount: upcoming.length,
        totalSessions,
        outstandingBalance: outstandingRows.reduce((sum, b) => sum + (b.total - b.amountPaid), 0),
        outstandingBookings: outstandingRows.map((booking) => ({
          id: booking.id,
          reference: booking.reference,
          balance: booking.total - booking.amountPaid,
          currency: booking.currency,
          startAt: booking.startAt.toISOString(),
        })),
        currency: env.BUSINESS_CURRENCY,
        recentPurchases: orders.map((order) => ({
          id: order.id,
          reference: order.reference,
          total: order.total,
          currency: order.currency,
          itemCount: order._count.items,
          paidAt: order.paidAt?.toISOString() ?? null,
        })),
        unreadNotifications: notifications,
        pendingReviews: reviewable.map((booking) => ({
          bookingId: booking.id,
          reference: booking.reference,
          serviceName: booking.service.name,
          consultantName: `${booking.consultant.user.firstName} ${booking.consultant.user.lastName}`,
        })),
      });
    },
  );

  app.get(
    '/portal/invoices',
    {
      preHandler: [app.authenticate],
      schema: { tags: ['Portal'], summary: 'Your invoices', security: [{ bearerAuth: [] }] },
    },
    async (request, reply) => {
      const user = requireUser(request);

      const invoices = await prisma.invoice.findMany({
        where: { userId: user.id },
        orderBy: { createdAt: 'desc' },
        include: { booking: { select: { reference: true, service: { select: { name: true } } } } },
      });

      return ok(
        reply,
        invoices.map((invoice) => ({
          id: invoice.id,
          number: invoice.number,
          status: invoice.status,
          currency: invoice.currency,
          subtotal: invoice.subtotal,
          tax: invoice.tax,
          discount: invoice.discount,
          total: invoice.total,
          amountPaid: invoice.amountPaid,
          balance: invoice.total - invoice.amountPaid,
          issuedAt: invoice.issuedAt?.toISOString() ?? null,
          dueAt: invoice.dueAt?.toISOString() ?? null,
          bookingId: invoice.bookingId,
          orderId: invoice.orderId,
          bookingReference: invoice.booking?.reference ?? null,
          serviceName: invoice.booking?.service.name ?? null,
          lines: invoice.lines,
        })),
      );
    },
  );

  app.get(
    '/portal/reviews',
    {
      preHandler: [app.authenticate],
      schema: {
        tags: ['Portal'],
        summary: 'Reviews you have written',
        description:
          'Scoped to the caller by userId. Unlike the public list this includes PENDING and REJECTED reviews, because an author is entitled to see what became of their own submission.',
        security: [{ bearerAuth: [] }],
      },
    },
    async (request, reply) => {
      const user = requireUser(request);
      const query = z
        .object({
          page: z.coerce.number().int().min(1).default(1),
          pageSize: z.coerce.number().int().min(1).max(50).default(20),
        })
        .parse(request.query);
      const { skip, take } = toSkipTake(query.page, query.pageSize);

      const where = { userId: user.id };

      const [reviews, total] = await Promise.all([
        prisma.review.findMany({
          where,
          include: {
            user: { select: { firstName: true, lastName: true } },
            service: { select: { name: true } },
            consultant: { include: { user: { select: { firstName: true, lastName: true } } } },
          },
          orderBy: { createdAt: 'desc' },
          skip,
          take,
        }),
        prisma.review.count({ where }),
      ]);

      return ok(
        reply,
        paginated(
          reviews.map((review) => ({
            // `toReviewDto` anonymises the author for public consumption. Here the
            // author is the caller, so the real name is restored — but only their own.
            ...toReviewDto(review),
            authorName: `${review.user?.firstName ?? ''} ${review.user?.lastName ?? ''}`.trim(),
            isAnonymous: review.isAnonymous,
            bookingId: review.bookingId,
            moderationNote: review.status === 'REJECTED' ? review.moderationNote : null,
            moderatedAt: review.moderatedAt?.toISOString() ?? null,
          })),
          total,
          query.page,
          query.pageSize,
        ),
      );
    },
  );

  /* ---------------------------------------------------------------------- */
  /* Notifications                                                          */
  /* ---------------------------------------------------------------------- */

  app.get(
    '/notifications',
    {
      preHandler: [app.authenticate],
      schema: { tags: ['Portal'], summary: 'Your notifications', security: [{ bearerAuth: [] }] },
    },
    async (request, reply) => {
      const user = requireUser(request);
      const query = z
        .object({
          unreadOnly: queryBooleanSchema.default(false),
          limit: z.coerce.number().int().min(1).max(100).default(30),
        })
        .parse(request.query);

      const notifications = await prisma.notification.findMany({
        where: { userId: user.id, ...(query.unreadOnly ? { readAt: null } : {}) },
        orderBy: { createdAt: 'desc' },
        take: query.limit,
      });

      return ok(reply, {
        items: notifications.map((notification) => ({
          id: notification.id,
          type: notification.type,
          title: notification.title,
          body: notification.body,
          href: notification.href,
          readAt: notification.readAt?.toISOString() ?? null,
          createdAt: notification.createdAt.toISOString(),
        })),
        unreadCount: await unreadCount(user.id),
      });
    },
  );

  app.post(
    '/notifications/:id/read',
    {
      preHandler: [app.authenticate],
      schema: { tags: ['Portal'], summary: 'Mark one notification read', security: [{ bearerAuth: [] }] },
    },
    async (request, reply) => {
      const user = requireUser(request);
      const { id } = z.object({ id: idSchema }).parse(request.params);
      await markRead(user.id, id);
      return noContent(reply);
    },
  );

  app.post(
    '/notifications/read-all',
    {
      preHandler: [app.authenticate],
      schema: { tags: ['Portal'], summary: 'Mark all notifications read', security: [{ bearerAuth: [] }] },
    },
    async (request, reply) => {
      const user = requireUser(request);
      return ok(reply, { marked: await markAllRead(user.id) });
    },
  );

  /* ---------------------------------------------------------------------- */
  /* Public settings and search                                             */
  /* ---------------------------------------------------------------------- */

  app.get(
    '/settings/public',
    {
      schema: {
        tags: ['System'],
        summary: 'Settings safe to expose to the browser',
        description:
          'Only rows flagged isPublic are returned. The Paystack *public* key is included here; the secret key never leaves the server.',
      },
    },
    async (_request, reply) => {
      const [settings, brand] = await Promise.all([
        prisma.setting.findMany({ where: { isPublic: true } }),
        brandAssetUrls(),
      ]);

      return ok(reply, {
        ...Object.fromEntries(settings.map((setting) => [setting.key, setting.value])),
        // The image URLs are derived rather than stored: the settings rows hold
        // storage keys, which are an internal detail and stay private.
        ...brand,
        'payments.publicKey': env.PAYSTACK_PUBLIC_KEY ?? null,
        'payments.enabled': Boolean(env.PAYSTACK_SECRET_KEY && env.PAYSTACK_PUBLIC_KEY),
        'business.timezone': env.BUSINESS_TIMEZONE,
        'business.currency': env.BUSINESS_CURRENCY,
      });
    },
  );

  app.get(
    '/search',
    {
      config: { rateLimit: { max: 60, timeWindow: '1 minute' } },
      schema: { tags: ['System'], summary: 'Search services, consultants, articles and products' },
    },
    async (request, reply) => {
      const { q } = z.object({ q: z.string().trim().min(2).max(120) }).parse(request.query);
      const contains = { contains: q, mode: 'insensitive' as const };

      const [services, consultants, articles, products] = await Promise.all([
        prisma.service.findMany({
          where: { status: 'PUBLISHED', OR: [{ name: contains }, { shortDescription: contains }] },
          select: { id: true, name: true, slug: true, shortDescription: true },
          take: 5,
        }),
        prisma.consultantProfile.findMany({
          where: {
            isPublished: true,
            OR: [
              { title: contains },
              { user: { firstName: contains } },
              { user: { lastName: contains } },
              { specialties: { has: q } },
            ],
          },
          select: {
            id: true, slug: true, title: true,
            user: { select: { firstName: true, lastName: true, avatarUrl: true } },
          },
          take: 5,
        }),
        prisma.article.findMany({
          where: {
            status: 'PUBLISHED',
            publishedAt: { lte: new Date() },
            OR: [{ title: contains }, { excerpt: contains }],
          },
          select: { id: true, title: true, slug: true, excerpt: true, isJournal: true },
          take: 5,
        }),
        prisma.product.findMany({
          where: { status: 'PUBLISHED', OR: [{ name: contains }, { author: contains }] },
          select: { id: true, name: true, slug: true, coverImageUrl: true, type: true },
          take: 5,
        }),
      ]);

      return ok(reply, {
        services: services.map((s) => ({
          id: s.id,
          name: s.name,
          slug: s.slug,
          description: s.shortDescription,
        })),
        consultants: consultants.map((c) => ({
          id: c.id,
          fullName: `${c.user.firstName} ${c.user.lastName}`,
          slug: c.slug,
          title: c.title,
          avatarUrl: c.user.avatarUrl,
        })),
        articles,
        products,
      });
    },
  );

  /* ---------------------------------------------------------------------- */
  /* Contact                                                                */
  /* ---------------------------------------------------------------------- */

  app.post(
    '/contact',
    {
      config: { rateLimit: { max: 5, timeWindow: '30 minutes' } },
      schema: { tags: ['System'], summary: 'Submit a contact enquiry' },
    },
    async (request, reply) => {
      const input = z
        .object({
          name: z.string().trim().min(2).max(160),
          email: z.email().max(254),
          phone: z.string().trim().max(32).optional(),
          company: z.string().trim().max(160).optional(),
          subject: z.string().trim().min(3).max(200),
          message: z.string().trim().min(10).max(5000),
        })
        .parse(request.body);

      const message = await prisma.contactMessage.create({
        data: {
          name: input.name,
          email: input.email,
          phone: input.phone ?? null,
          company: input.company ?? null,
          subject: input.subject,
          message: input.message,
        },
        select: { id: true },
      });

      return ok(reply, { id: message.id, received: true });
    },
  );

  app.get(
    '/contact-messages',
    {
      preHandler: [app.requirePermissions('clients.read')],
      schema: { tags: ['Admin'], summary: 'Contact enquiries', security: [{ bearerAuth: [] }] },
    },
    async (request, reply) => {
      const query = z
        .object({ status: z.string().trim().max(32).optional(), limit: z.coerce.number().int().min(1).max(100).default(50) })
        .parse(request.query);

      const messages = await prisma.contactMessage.findMany({
        where: query.status ? { status: query.status } : {},
        orderBy: { createdAt: 'desc' },
        take: query.limit,
      });

      return ok(
        reply,
        messages.map((message) => ({
          id: message.id,
          name: message.name,
          email: message.email,
          phone: message.phone,
          company: message.company,
          subject: message.subject,
          message: message.message,
          status: message.status,
          createdAt: message.createdAt.toISOString(),
        })),
      );
    },
  );

  /* ---------------------------------------------------------------------- */
  /* SEO                                                                    */
  /* ---------------------------------------------------------------------- */

  app.get(
    '/sitemap-data',
    {
      schema: {
        tags: ['System'],
        summary: 'Published URLs for sitemap generation',
        description: 'Consumed by the web build to emit sitemap.xml at deploy time.',
      },
    },
    async (_request, reply) => {
      const [services, consultants, articles, products] = await Promise.all([
        prisma.service.findMany({ where: { status: 'PUBLISHED' }, select: { slug: true, updatedAt: true } }),
        prisma.consultantProfile.findMany({ where: { isPublished: true }, select: { slug: true, updatedAt: true } }),
        prisma.article.findMany({
          where: { status: 'PUBLISHED', publishedAt: { lte: new Date() } },
          select: { slug: true, updatedAt: true, isJournal: true },
        }),
        prisma.product.findMany({ where: { status: 'PUBLISHED' }, select: { slug: true, updatedAt: true } }),
      ]);

      return ok(reply, {
        services: services.map((s) => ({ path: `/services/${s.slug}`, lastModified: s.updatedAt.toISOString() })),
        consultants: consultants.map((c) => ({ path: `/consultants/${c.slug}`, lastModified: c.updatedAt.toISOString() })),
        articles: articles.map((a) => ({
          path: a.isJournal ? `/journal/${a.slug}` : `/articles/${a.slug}`,
          lastModified: a.updatedAt.toISOString(),
        })),
        products: products.map((p) => ({ path: `/shop/${p.slug}`, lastModified: p.updatedAt.toISOString() })),
      });
    },
  );
}
