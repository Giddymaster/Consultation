import type { FastifyInstance } from 'fastify';
import { z } from 'zod';
import { idSchema } from '@meridian/types';
import { prisma } from '../../lib/prisma.js';
import { badRequest, forbidden, notFound } from '../../lib/errors.js';
import { ok, paginated, toSkipTake } from '../../lib/http.js';
import { requireUser } from '../../plugins/auth.js';
import { notify, unreadCount } from '../../services/notification.service.js';
import { enqueue } from '../../services/jobs/worker.js';
import { env } from '../../config/env.js';
import { toBookingSummary, toReviewDto } from '../serializers.js';

/**
 * The consultant workspace.
 *
 * Every route here scopes on `user.consultantProfileId` — the id attached to the
 * session — rather than on a permission or on anything the caller sends. That is
 * why a consultant holds `clients.read.own` and not `clients.read`: the broad
 * form is what the admin list is gated on, and it returns every client on the
 * platform, while a consultant is only entitled to the people they have
 * actually worked with.
 *
 * Private consultation notes are never part of any payload in this module; they
 * are served only by the session routes, which do their own participant check.
 */

export async function consultantRoutes(app: FastifyInstance): Promise<void> {
  /** Resolves the caller's consultant profile, or refuses. */
  const requireConsultantId = (request: Parameters<typeof requireUser>[0]): string => {
    const user = requireUser(request);
    if (!user.consultantProfileId) throw forbidden('This area is for consultants.');
    return user.consultantProfileId;
  };

  /* ---------------------------------------------------------------------- */
  /* Consultant portal                                                      */
  /* ---------------------------------------------------------------------- */

  app.get(
    '/consultant/dashboard',
    {
      preHandler: [app.authenticate],
      schema: { tags: ['Consultant Portal'], summary: 'Consultant dashboard summary', security: [{ bearerAuth: [] }] },
    },
    async (request, reply) => {
      const user = requireUser(request);
      if (!user.consultantProfileId) {
        throw forbidden('This area is for consultants.');
      }
      const consultantId = user.consultantProfileId;

      const startOfToday = new Date();
      startOfToday.setHours(0, 0, 0, 0);
      const endOfToday = new Date(startOfToday.getTime() + 86_400_000);
      const monthStart = new Date(new Date().getFullYear(), new Date().getMonth(), 1);

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

      const [today, upcoming, completedCount, revenue, clients, pendingBalances, profile] = await Promise.all([
        prisma.booking.findMany({
          where: {
            consultantId,
            startAt: { gte: startOfToday, lt: endOfToday },
            status: { in: ['CONFIRMED', 'RESCHEDULED', 'IN_PROGRESS'] },
          },
          include: bookingInclude,
          orderBy: { startAt: 'asc' },
        }),
        prisma.booking.findMany({
          where: {
            consultantId,
            startAt: { gte: endOfToday },
            status: { in: ['CONFIRMED', 'RESCHEDULED'] },
          },
          include: bookingInclude,
          orderBy: { startAt: 'asc' },
          take: 8,
        }),
        prisma.booking.count({ where: { consultantId, status: 'COMPLETED' } }),
        prisma.payment.aggregate({
          where: {
            status: 'PAID',
            paidAt: { gte: monthStart },
            booking: { consultantId },
          },
          _sum: { amount: true, refundedAmount: true },
        }),
        prisma.booking
          .findMany({ where: { consultantId }, select: { clientId: true }, distinct: ['clientId'] })
          .then((rows) => rows.length),
        prisma.booking.findMany({
          where: {
            consultantId,
            status: { in: ['CONFIRMED', 'RESCHEDULED'] },
            paymentStatus: { in: ['PARTIALLY_PAID', 'UNPAID'] },
          },
          select: { id: true, reference: true, total: true, amountPaid: true, currency: true },
        }),
        prisma.consultantProfile.findUnique({
          where: { id: consultantId },
          select: { averageRating: true, reviewCount: true, isAcceptingBookings: true },
        }),
      ]);

      return ok(reply, {
        today: today.map(toBookingSummary),
        upcoming: upcoming.map(toBookingSummary),
        completedSessions: completedCount,
        revenueThisMonth: (revenue._sum.amount ?? 0) - (revenue._sum.refundedAmount ?? 0),
        currency: env.BUSINESS_CURRENCY,
        clientCount: clients,
        pendingBalance: pendingBalances.reduce((sum, b) => sum + (b.total - b.amountPaid), 0),
        pendingBalanceCount: pendingBalances.length,
        averageRating: profile?.averageRating ?? null,
        reviewCount: profile?.reviewCount ?? 0,
        isAcceptingBookings: profile?.isAcceptingBookings ?? false,
        unreadNotifications: await unreadCount(user.id),
      });
    },
  );

  app.patch(
    '/consultant/booking-status',
    {
      preHandler: [app.authenticate],
      schema: { tags: ['Consultant Portal'], summary: 'Pause or resume accepting bookings', security: [{ bearerAuth: [] }] },
    },
    async (request, reply) => {
      const user = requireUser(request);
      if (!user.consultantProfileId) throw forbidden('This area is for consultants.');

      const { isAcceptingBookings } = z
        .object({ isAcceptingBookings: z.boolean() })
        .parse(request.body);

      await prisma.consultantProfile.update({
        where: { id: user.consultantProfileId },
        data: { isAcceptingBookings },
      });

      return ok(reply, { isAcceptingBookings });
    },
  );


  /* ---------------------------------------------------------------------- */
  /* Clients                                                                */
  /* ---------------------------------------------------------------------- */

  app.get(
    '/consultant/clients',
    {
      preHandler: [app.authenticate],
      schema: {
        tags: ['Consultant Portal'],
        summary: 'Clients you have worked with',
        description:
          'Scoped to clients who hold at least one booking with the caller. Contains no consultation notes.',
        security: [{ bearerAuth: [] }],
      },
    },
    async (request, reply) => {
      const consultantId = requireConsultantId(request);

      const query = z
        .object({
          page: z.coerce.number().int().min(1).default(1),
          pageSize: z.coerce.number().int().min(1).max(50).default(20),
          search: z.string().trim().max(120).optional(),
        })
        .parse(request.query);
      const { skip, take } = toSkipTake(query.page, query.pageSize);

      const search = query.search;
      const where = {
        bookings: { some: { consultantId } },
        ...(search
          ? {
              OR: [
                { clientCode: { contains: search.toUpperCase() } },
                { user: { firstName: { contains: search, mode: 'insensitive' as const } } },
                { user: { lastName: { contains: search, mode: 'insensitive' as const } } },
                { user: { email: { contains: search, mode: 'insensitive' as const } } },
                { user: { company: { contains: search, mode: 'insensitive' as const } } },
              ],
            }
          : {}),
      };

      const [clients, total] = await Promise.all([
        prisma.clientProfile.findMany({
          where,
          select: {
            id: true,
            clientCode: true,
            industry: true,
            city: true,
            user: {
              select: {
                firstName: true, lastName: true, email: true, phone: true,
                company: true, jobTitle: true, avatarUrl: true,
              },
            },
            // Filtered to this consultant, so the count on screen matches what
            // the consultant can actually open.
            _count: { select: { bookings: { where: { consultantId } } } },
          },
          orderBy: { createdAt: 'desc' },
          skip,
          take,
        }),
        prisma.clientProfile.count({ where }),
      ]);

      // Last and next appointment per client — two grouped queries rather than
      // one per row, so the page cost does not grow with the page size.
      const clientIds = clients.map((client) => client.id);
      const now = new Date();
      const [lastSeen, nextUp] = await Promise.all([
        clientIds.length
          ? prisma.booking.groupBy({
              by: ['clientId'],
              where: { consultantId, clientId: { in: clientIds }, startAt: { lt: now } },
              _max: { startAt: true },
            })
          : [],
        clientIds.length
          ? prisma.booking.groupBy({
              by: ['clientId'],
              where: {
                consultantId,
                clientId: { in: clientIds },
                startAt: { gte: now },
                status: { in: ['CONFIRMED', 'RESCHEDULED'] },
              },
              _min: { startAt: true },
            })
          : [],
      ]);

      const lastByClient = new Map(lastSeen.map((row) => [row.clientId, row._max?.startAt ?? null]));
      const nextByClient = new Map(nextUp.map((row) => [row.clientId, row._min?.startAt ?? null]));

      return ok(
        reply,
        paginated(
          clients.map((client) => ({
            id: client.id,
            clientCode: client.clientCode,
            fullName: `${client.user.firstName} ${client.user.lastName}`,
            email: client.user.email,
            phone: client.user.phone,
            company: client.user.company,
            jobTitle: client.user.jobTitle,
            avatarUrl: client.user.avatarUrl,
            industry: client.industry,
            city: client.city,
            sessionCount: client._count.bookings,
            lastSessionAt: lastByClient.get(client.id)?.toISOString() ?? null,
            nextSessionAt: nextByClient.get(client.id)?.toISOString() ?? null,
          })),
          total,
          query.page,
          query.pageSize,
        ),
      );
    },
  );

  /**
   * One client, limited to the history they share with this consultant.
   *
   * A client the consultant has never seen returns 404 rather than 403: an
   * existence-revealing refusal would turn this route into a directory of every
   * client on the platform.
   */
  app.get(
    '/consultant/clients/:id',
    {
      preHandler: [app.authenticate],
      schema: {
        tags: ['Consultant Portal'],
        summary: 'One client and your shared history',
        security: [{ bearerAuth: [] }],
      },
    },
    async (request, reply) => {
      const consultantId = requireConsultantId(request);
      const { id } = z.object({ id: idSchema }).parse(request.params);

      const client = await prisma.clientProfile.findFirst({
        where: { id, bookings: { some: { consultantId } } },
        select: {
          id: true,
          clientCode: true,
          industry: true,
          city: true,
          country: true,
          companySize: true,
          createdAt: true,
          user: {
            select: {
              firstName: true, lastName: true, email: true, phone: true,
              company: true, jobTitle: true, avatarUrl: true, timezone: true,
            },
          },
        },
      });

      if (!client) throw notFound('Client');

      const bookings = await prisma.booking.findMany({
        where: { consultantId, clientId: id },
        include: {
          service: { select: { id: true, name: true, slug: true } },
          consultant: {
            select: {
              id: true, slug: true, title: true,
              user: { select: { firstName: true, lastName: true, avatarUrl: true } },
            },
          },
          client: { select: { id: true, user: { select: { firstName: true, lastName: true, email: true } } } },
          session: { select: { id: true, status: true } },
        },
        orderBy: { startAt: 'desc' },
        take: 50,
      });

      const spend = await prisma.payment.aggregate({
        where: { status: 'PAID', booking: { consultantId, clientId: id } },
        _sum: { amount: true, refundedAmount: true },
      });

      return ok(reply, {
        id: client.id,
        clientCode: client.clientCode,
        fullName: `${client.user.firstName} ${client.user.lastName}`,
        email: client.user.email,
        phone: client.user.phone,
        company: client.user.company,
        jobTitle: client.user.jobTitle,
        avatarUrl: client.user.avatarUrl,
        timezone: client.user.timezone,
        industry: client.industry,
        city: client.city,
        country: client.country,
        companySize: client.companySize,
        clientSince: client.createdAt.toISOString(),
        sessionCount: bookings.length,
        // What this consultant earned from this client, not the client's
        // lifetime value across the firm.
        totalPaid: (spend._sum.amount ?? 0) - (spend._sum.refundedAmount ?? 0),
        currency: env.BUSINESS_CURRENCY,
        bookings: bookings.map((booking) => ({
          ...toBookingSummary(booking),
          sessionId: booking.session?.id ?? null,
        })),
      });
    },
  );

  /**
   * Nudge a client about an unpaid balance.
   *
   * This does not take a payment and does not change payment status — it queues
   * the same BALANCE_REMINDER job the scheduler uses, so the email is sent by a
   * handler that re-reads the booking and declines if the balance was settled in
   * the meantime. The dedupe key is per booking per day, which makes a
   * double-click a no-op and stops a client being chased repeatedly.
   */
  app.post(
    '/consultant/bookings/:id/request-payment',
    {
      preHandler: [app.authenticate],
      schema: {
        tags: ['Consultant Portal'],
        summary: 'Ask a client to settle an outstanding balance',
        description:
          'Queues a balance reminder. Sends nothing if the balance is already clear, and at most once per booking per day.',
        security: [{ bearerAuth: [] }],
      },
    },
    async (request, reply) => {
      const consultantId = requireConsultantId(request);
      const { id } = z.object({ id: idSchema }).parse(request.params);

      const booking = await prisma.booking.findFirst({
        where: { id, consultantId },
        select: {
          id: true,
          reference: true,
          status: true,
          total: true,
          amountPaid: true,
          currency: true,
          service: { select: { name: true } },
          client: { select: { userId: true } },
        },
      });

      if (!booking) throw notFound('Booking');

      const balance = booking.total - booking.amountPaid;
      if (balance <= 0) throw badRequest('This booking has no outstanding balance.');
      if (!['CONFIRMED', 'RESCHEDULED'].includes(booking.status)) {
        throw badRequest('Only a confirmed booking can be chased for payment.');
      }

      const today = new Date().toISOString().slice(0, 10);
      const queued = await enqueue({
        type: 'BALANCE_REMINDER',
        runAt: new Date(),
        payload: { bookingId: booking.id },
        dedupeKey: `balance-request:${booking.id}:${today}`,
      });

      if (queued) {
        await notify({
          userId: booking.client.userId,
          type: 'BALANCE_DUE',
          title: 'A balance is outstanding',
          body: `${booking.service.name} (${booking.reference}) has an unpaid balance.`,
          href: `/portal/bookings/${booking.id}`,
          metadata: { bookingId: booking.id, balance },
        });
      }

      // `queued: false` means a reminder already went out today. That is a
      // successful outcome, not an error — the client has been asked.
      return ok(reply, { queued, balance, currency: booking.currency });
    },
  );

  /* ---------------------------------------------------------------------- */
  /* Calendar                                                               */
  /* ---------------------------------------------------------------------- */

  app.get(
    '/consultant/calendar',
    {
      preHandler: [app.authenticate],
      schema: {
        tags: ['Consultant Portal'],
        summary: 'Your bookings within a date range',
        description: 'Returns a flat list; the client groups it by day. Capped at a 92-day window.',
        security: [{ bearerAuth: [] }],
      },
    },
    async (request, reply) => {
      const consultantId = requireConsultantId(request);

      const query = z.object({ from: z.iso.datetime(), to: z.iso.datetime() }).parse(request.query);
      const from = new Date(query.from);
      const to = new Date(query.to);

      // Generous for a month view; an unbounded range would let one request
      // scan the whole booking table.
      if (to.getTime() - from.getTime() > 92 * 86_400_000) {
        throw badRequest('Calendar ranges are limited to 92 days.');
      }

      const [bookings, blackouts, profile] = await Promise.all([
        prisma.booking.findMany({
          where: { consultantId, startAt: { gte: from, lte: to } },
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
            client: { select: { user: { select: { firstName: true, lastName: true } } } },
            session: { select: { id: true } },
          },
          orderBy: { startAt: 'asc' },
        }),
        prisma.availabilityBlackout.findMany({
          where: { consultantId, endAt: { gte: from }, startAt: { lte: to } },
          select: { id: true, startAt: true, endAt: true, reason: true },
          orderBy: { startAt: 'asc' },
        }),
        prisma.consultantProfile.findUnique({
          where: { id: consultantId },
          select: { timezone: true },
        }),
      ]);

      return ok(reply, {
        // The consultant's own zone, so the diary reads as their working day
        // rather than the browser's guess at where they are sitting.
        timezone: profile?.timezone ?? env.BUSINESS_TIMEZONE,
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
          clientName: `${booking.client.user.firstName} ${booking.client.user.lastName}`,
          sessionId: booking.session?.id ?? null,
        })),
        blackouts: blackouts.map((blackout) => ({
          id: blackout.id,
          startAt: blackout.startAt.toISOString(),
          endAt: blackout.endAt.toISOString(),
          reason: blackout.reason,
        })),
      });
    },
  );

  /* ---------------------------------------------------------------------- */
  /* Reviews and profile                                                    */
  /* ---------------------------------------------------------------------- */

  app.get(
    '/consultant/reviews',
    {
      preHandler: [app.authenticate],
      schema: {
        tags: ['Consultant Portal'],
        summary: 'Reviews written about you',
        description:
          'Includes reviews still awaiting moderation so a consultant is not surprised by one appearing later. Rejected reviews are not shown.',
        security: [{ bearerAuth: [] }],
      },
    },
    async (request, reply) => {
      const consultantId = requireConsultantId(request);

      const query = z
        .object({
          page: z.coerce.number().int().min(1).default(1),
          pageSize: z.coerce.number().int().min(1).max(50).default(20),
        })
        .parse(request.query);
      const { skip, take } = toSkipTake(query.page, query.pageSize);

      const where = { consultantId, status: { in: ['APPROVED' as const, 'PENDING' as const] } };

      const [reviews, total, profile, spread] = await Promise.all([
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
        prisma.consultantProfile.findUnique({
          where: { id: consultantId },
          select: { averageRating: true, reviewCount: true },
        }),
        prisma.review.groupBy({
          by: ['rating'],
          where: { consultantId, status: 'APPROVED' },
          _count: { rating: true },
        }),
      ]);

      return ok(reply, {
        // `toReviewDto` keeps anonymity intact: a consultant does not get to
        // unmask an author the public list would have hidden.
        ...paginated(reviews.map(toReviewDto), total, query.page, query.pageSize),
        averageRating: profile?.averageRating ?? null,
        reviewCount: profile?.reviewCount ?? 0,
        distribution: [5, 4, 3, 2, 1].map((rating) => ({
          rating,
          count: spread.find((row) => row.rating === rating)?._count.rating ?? 0,
        })),
      });
    },
  );

  /**
   * Self-service edits to the consultant's own public profile.
   *
   * Deliberately narrower than the admin route: `slug`, `isPublished`,
   * `sortOrder` and the linked services stay under admin control, because those
   * decide whether and where a consultant appears in the catalogue. Letting a
   * consultant publish themselves would make the review step decorative.
   */
  app.patch(
    '/consultant/profile',
    {
      preHandler: [app.authenticate],
      schema: {
        tags: ['Consultant Portal'],
        summary: 'Update your own consultant profile',
        security: [{ bearerAuth: [] }],
      },
    },
    async (request, reply) => {
      const consultantId = requireConsultantId(request);

      const input = z
        .object({
          title: z.string().trim().min(2).max(160).optional(),
          biography: z.string().trim().max(5000).optional(),
          specialties: z.array(z.string().trim().min(1).max(80)).max(20).optional(),
          qualifications: z.array(z.string().trim().min(1).max(160)).max(20).optional(),
          languages: z.array(z.string().trim().min(1).max(60)).max(15).optional(),
          yearsExperience: z.number().int().min(0).max(80).optional(),
          linkedinUrl: z.url().max(2048).nullable().optional(),
          websiteUrl: z.url().max(2048).nullable().optional(),
        })
        .parse(request.body);

      const profile = await prisma.consultantProfile.update({
        where: { id: consultantId },
        data: input,
        select: {
          id: true, slug: true, title: true, biography: true, specialties: true,
          qualifications: true, languages: true, yearsExperience: true,
          linkedinUrl: true, websiteUrl: true, isPublished: true, isAcceptingBookings: true,
          timezone: true, slotIntervalMinutes: true,
        },
      });

      return ok(reply, profile);
    },
  );

  app.get(
    '/consultant/profile',
    {
      preHandler: [app.authenticate],
      schema: {
        tags: ['Consultant Portal'],
        summary: 'Your own consultant profile',
        security: [{ bearerAuth: [] }],
      },
    },
    async (request, reply) => {
      const consultantId = requireConsultantId(request);

      const profile = await prisma.consultantProfile.findUnique({
        where: { id: consultantId },
        select: {
          id: true, slug: true, title: true, biography: true, specialties: true,
          qualifications: true, languages: true, yearsExperience: true,
          linkedinUrl: true, websiteUrl: true, isPublished: true, isAcceptingBookings: true,
          timezone: true, slotIntervalMinutes: true,
          services: { select: { service: { select: { id: true, name: true, slug: true } } } },
        },
      });

      if (!profile) throw notFound('Consultant profile');

      return ok(reply, {
        ...profile,
        services: profile.services.map((link) => link.service),
      });
    },
  );
}
