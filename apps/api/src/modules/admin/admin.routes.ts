import type { FastifyInstance } from 'fastify';
import { z } from 'zod';
import {
  idSchema,
  ROLE_VALUES,
  updateAvailabilitySchema,
  updateServiceSchema,
  upsertServiceSchema,
} from '@meridian/types';
import { prisma } from '../../lib/prisma.js';
import { badRequest, forbidden, notFound } from '../../lib/errors.js';
import { created, noContent, ok, paginated, toSkipTake } from '../../lib/http.js';
import { requireUser } from '../../plugins/auth.js';
import { getAnalytics, getDashboard, resolveRange } from '../../services/analytics.service.js';
import { AUDIT_ACTIONS, auditFromRequest } from '../../services/audit.service.js';
import { integrationsConfigured } from '../../config/env.js';
import { providerStatuses } from '../../services/video/index.js';
import { ensureMeeting } from '../../services/fulfilment.service.js';
import { syncBusyPeriods } from '../../services/calendar/calendar.service.js';

/**
 * Administrative operations.
 *
 * Everything here sits behind a named permission rather than a role check, so
 * the capability set of ADMIN or FINANCE_MANAGER can be re-shaped in the
 * database without editing route code.
 */

const rangeQuerySchema = z.object({
  preset: z.enum(['7d', '30d', '90d', '12m', 'custom']).default('30d'),
  from: z.iso.datetime().optional(),
  to: z.iso.datetime().optional(),
});

export async function adminRoutes(app: FastifyInstance): Promise<void> {
  /* ---------------------------------------------------------------------- */
  /* Dashboard and analytics                                                */
  /* ---------------------------------------------------------------------- */

  app.get(
    '/dashboard',
    {
      preHandler: [app.requirePermissions('analytics.read')],
      schema: { tags: ['Analytics'], summary: 'Headline KPIs', security: [{ bearerAuth: [] }] },
    },
    async (request, reply) => {
      const query = rangeQuerySchema.parse(request.query);
      const range = resolveRange(query.preset, { from: query.from, to: query.to });
      return ok(reply, await getDashboard(range));
    },
  );

  app.get(
    '/analytics',
    {
      preHandler: [app.requirePermissions('analytics.read')],
      schema: { tags: ['Analytics'], summary: 'Full analytics payload with time series', security: [{ bearerAuth: [] }] },
    },
    async (request, reply) => {
      const query = rangeQuerySchema.parse(request.query);
      const range = resolveRange(query.preset, { from: query.from, to: query.to });
      return ok(reply, await getAnalytics(range));
    },
  );

  /* ---------------------------------------------------------------------- */
  /* Clients                                                                */
  /* ---------------------------------------------------------------------- */

  app.get(
    '/clients',
    {
      preHandler: [app.requirePermissions('clients.read')],
      schema: { tags: ['Admin'], summary: 'List clients', security: [{ bearerAuth: [] }] },
    },
    async (request, reply) => {
      const query = z
        .object({
          page: z.coerce.number().int().min(1).default(1),
          pageSize: z.coerce.number().int().min(1).max(100).default(25),
          search: z.string().trim().max(120).optional(),
        })
        .parse(request.query);
      const { skip, take } = toSkipTake(query.page, query.pageSize);

      const where = query.search
        ? {
            OR: [
              { clientCode: { contains: query.search.toUpperCase() } },
              { user: { email: { contains: query.search, mode: 'insensitive' as const } } },
              { user: { firstName: { contains: query.search, mode: 'insensitive' as const } } },
              { user: { lastName: { contains: query.search, mode: 'insensitive' as const } } },
              { user: { company: { contains: query.search, mode: 'insensitive' as const } } },
            ],
          }
        : {};

      const [clients, total] = await Promise.all([
        prisma.clientProfile.findMany({
          where,
          include: {
            user: {
              select: {
                id: true, firstName: true, lastName: true, email: true, phone: true,
                company: true, jobTitle: true, emailVerified: true, createdAt: true, lastLoginAt: true,
              },
            },
            _count: { select: { bookings: true } },
          },
          orderBy: { createdAt: 'desc' },
          skip,
          take,
        }),
        prisma.clientProfile.count({ where }),
      ]);

      return ok(
        reply,
        paginated(
          clients.map((client) => ({
            id: client.id,
            clientCode: client.clientCode,
            userId: client.user.id,
            fullName: `${client.user.firstName} ${client.user.lastName}`,
            email: client.user.email,
            phone: client.user.phone,
            company: client.user.company,
            jobTitle: client.user.jobTitle,
            industry: client.industry,
            city: client.city,
            emailVerified: client.user.emailVerified,
            bookingCount: client._count.bookings,
            createdAt: client.createdAt.toISOString(),
            lastLoginAt: client.user.lastLoginAt?.toISOString() ?? null,
          })),
          total,
          query.page,
          query.pageSize,
        ),
      );
    },
  );

  app.get(
    '/clients/:id',
    {
      preHandler: [app.requirePermissions('clients.read')],
      schema: {
        tags: ['Admin'],
        summary: 'Client profile with activity timeline',
        description:
          'Aggregates bookings, payments, invoices, reviews and purchases. Private consultant notes are never included, whatever the caller’s role.',
        security: [{ bearerAuth: [] }],
      },
    },
    async (request, reply) => {
      const { id } = z.object({ id: idSchema }).parse(request.params);

      const client = await prisma.clientProfile.findUnique({
        where: { id },
        include: {
          user: true,
          bookings: {
            include: {
              service: { select: { name: true, slug: true } },
              consultant: { select: { user: { select: { firstName: true, lastName: true } } } },
              payments: { select: { id: true, amount: true, status: true, paidAt: true, reference: true } },
            },
            orderBy: { startAt: 'desc' },
          },
        },
      });
      if (!client) throw notFound('Client');

      const [reviews, orders, invoices] = await Promise.all([
        prisma.review.findMany({
          where: { userId: client.userId },
          select: { id: true, rating: true, status: true, createdAt: true, service: { select: { name: true } } },
          orderBy: { createdAt: 'desc' },
        }),
        prisma.order.findMany({
          where: { userId: client.userId },
          select: { id: true, reference: true, total: true, currency: true, status: true, createdAt: true },
          orderBy: { createdAt: 'desc' },
        }),
        prisma.invoice.findMany({
          where: { userId: client.userId },
          select: { id: true, number: true, total: true, amountPaid: true, status: true, issuedAt: true },
          orderBy: { createdAt: 'desc' },
        }),
      ]);

      // Chronological activity, assembled from what actually happened rather
      // than a separate events table that could drift out of sync.
      const timeline = [
        {
          id: `registered-${client.userId}`,
          type: 'REGISTERED',
          title: 'Account created',
          description: null as string | null,
          occurredAt: client.user.createdAt.toISOString(),
          href: null as string | null,
        },
        ...(client.user.emailVerified
          ? [
              {
                id: `verified-${client.userId}`,
                type: 'EMAIL_VERIFIED',
                title: 'Email verified',
                description: null,
                occurredAt: client.user.createdAt.toISOString(),
                href: null,
              },
            ]
          : []),
        ...client.bookings.map((booking) => ({
          id: `booking-${booking.id}`,
          type: 'BOOKING',
          title: `Booked ${booking.service.name}`,
          description: `${booking.reference} · ${booking.status.replace(/_/g, ' ').toLowerCase()}`,
          occurredAt: booking.createdAt.toISOString(),
          href: `/admin/bookings/${booking.id}`,
        })),
        ...client.bookings.flatMap((booking) =>
          booking.payments
            .filter((payment) => payment.paidAt)
            .map((payment) => ({
              id: `payment-${payment.id}`,
              type: 'PAYMENT',
              title: 'Payment received',
              description: payment.reference,
              occurredAt: payment.paidAt!.toISOString(),
              href: `/admin/payments/${payment.id}`,
            })),
        ),
        ...reviews.map((review) => ({
          id: `review-${review.id}`,
          type: 'REVIEW',
          title: `Left a ${review.rating}-star review`,
          description: review.service.name,
          occurredAt: review.createdAt.toISOString(),
          href: '/admin/reviews',
        })),
        ...orders.map((order) => ({
          id: `order-${order.id}`,
          type: 'ORDER',
          title: 'Purchased resources',
          description: order.reference,
          occurredAt: order.createdAt.toISOString(),
          href: `/admin/orders/${order.id}`,
        })),
      ].sort((a, b) => b.occurredAt.localeCompare(a.occurredAt));

      const totalSpend = client.bookings.reduce((sum, b) => sum + b.amountPaid, 0);
      const outstanding = client.bookings
        .filter((b) => ['CONFIRMED', 'RESCHEDULED', 'IN_PROGRESS'].includes(b.status))
        .reduce((sum, b) => sum + (b.total - b.amountPaid), 0);

      return ok(reply, {
        id: client.id,
        clientCode: client.clientCode,
        fullName: `${client.user.firstName} ${client.user.lastName}`,
        email: client.user.email,
        phone: client.user.phone,
        company: client.user.company,
        jobTitle: client.user.jobTitle,
        industry: client.industry,
        companySize: client.companySize,
        city: client.city,
        country: client.country,
        source: client.source,
        internalNotes: client.internalNotes,
        emailVerified: client.user.emailVerified,
        createdAt: client.createdAt.toISOString(),
        stats: {
          bookings: client.bookings.length,
          completed: client.bookings.filter((b) => b.status === 'COMPLETED').length,
          cancelled: client.bookings.filter((b) => b.status === 'CANCELLED').length,
          totalSpend,
          outstanding,
        },
        bookings: client.bookings.map((booking) => ({
          id: booking.id,
          reference: booking.reference,
          serviceName: booking.service.name,
          consultantName: `${booking.consultant.user.firstName} ${booking.consultant.user.lastName}`,
          startAt: booking.startAt.toISOString(),
          status: booking.status,
          paymentStatus: booking.paymentStatus,
          total: booking.total,
          amountPaid: booking.amountPaid,
        })),
        reviews,
        orders,
        invoices,
        timeline,
      });
    },
  );

  app.patch(
    '/clients/:id',
    {
      preHandler: [app.requirePermissions('clients.update')],
      schema: { tags: ['Admin'], summary: 'Update client record', security: [{ bearerAuth: [] }] },
    },
    async (request, reply) => {
      const { id } = z.object({ id: idSchema }).parse(request.params);
      const input = z
        .object({
          industry: z.string().trim().max(120).nullable().optional(),
          companySize: z.string().trim().max(60).nullable().optional(),
          city: z.string().trim().max(120).nullable().optional(),
          country: z.string().trim().length(2).nullable().optional(),
          source: z.string().trim().max(80).nullable().optional(),
          internalNotes: z.string().trim().max(20000).nullable().optional(),
        })
        .parse(request.body);

      const client = await prisma.clientProfile.update({ where: { id }, data: input });
      await auditFromRequest(request, {
        action: 'clients.updated' as never,
        entity: 'ClientProfile',
        entityId: id,
      });
      return ok(reply, { id: client.id });
    },
  );

  /* ---------------------------------------------------------------------- */
  /* Services                                                               */
  /* ---------------------------------------------------------------------- */

  app.post(
    '/services',
    {
      preHandler: [app.requirePermissions('services.manage')],
      schema: { tags: ['Admin'], summary: 'Create a service', security: [{ bearerAuth: [] }] },
    },
    async (request, reply) => {
      const input = upsertServiceSchema.parse(request.body);

      const service = await prisma.service.create({
        data: {
          name: input.name,
          slug: input.slug,
          categoryId: input.categoryId,
          shortDescription: input.shortDescription,
          fullDescription: input.fullDescription,
          currency: input.currency,
          paymentModel: input.paymentModel,
          depositAmount: input.depositAmount ?? null,
          depositPercentBps: input.depositPercentBps ?? null,
          taxRateBps: input.taxRateBps,
          meetingProviders: input.meetingProviders,
          preparationNotes: input.preparationNotes ?? null,
          cancellationPolicy: input.cancellationPolicy ?? null,
          reschedulePolicy: input.reschedulePolicy ?? null,
          cancellationWindowHours: input.cancellationWindowHours,
          rescheduleWindowHours: input.rescheduleWindowHours,
          leadTimeHours: input.leadTimeHours,
          bookingHorizonDays: input.bookingHorizonDays,
          bufferBeforeMinutes: input.bufferBeforeMinutes,
          bufferAfterMinutes: input.bufferAfterMinutes,
          status: input.status,
          isFeatured: input.isFeatured,
          sortOrder: input.sortOrder,
          seoTitle: input.seoTitle ?? null,
          seoDescription: input.seoDescription ?? null,
          heroImageUrl: input.heroImageUrl ?? null,
          icon: input.icon ?? null,
          durations: {
            create: input.durations.map((d, index) => ({
              minutes: d.minutes,
              price: d.price,
              label: d.label ?? null,
              isDefault: d.isDefault,
              sortOrder: index,
            })),
          },
          consultants: { create: input.consultantIds.map((consultantId) => ({ consultantId })) },
        },
        select: { id: true, slug: true },
      });

      await auditFromRequest(request, {
        action: AUDIT_ACTIONS.CONTENT_CREATED,
        entity: 'Service',
        entityId: service.id,
        metadata: { slug: service.slug },
      });

      return created(reply, service);
    },
  );

  app.patch(
    '/services/:id',
    {
      preHandler: [app.requirePermissions('services.manage')],
      schema: { tags: ['Admin'], summary: 'Update a service and its pricing', security: [{ bearerAuth: [] }] },
    },
    async (request, reply) => {
      const { id } = z.object({ id: idSchema }).parse(request.params);
      // updateServiceSchema, not `.partial()` on the create schema: Zod refuses
      // to partial a schema carrying refinements, and the update rules differ.
      const input = updateServiceSchema.parse(request.body);

      await prisma.$transaction(async (tx) => {
        await tx.service.update({
          where: { id },
          data: {
            ...(input.name ? { name: input.name } : {}),
            ...(input.slug ? { slug: input.slug } : {}),
            ...(input.categoryId ? { categoryId: input.categoryId } : {}),
            ...(input.shortDescription ? { shortDescription: input.shortDescription } : {}),
            ...(input.fullDescription ? { fullDescription: input.fullDescription } : {}),
            ...(input.currency ? { currency: input.currency } : {}),
            ...(input.paymentModel ? { paymentModel: input.paymentModel } : {}),
            ...(input.depositAmount !== undefined ? { depositAmount: input.depositAmount ?? null } : {}),
            ...(input.depositPercentBps !== undefined ? { depositPercentBps: input.depositPercentBps ?? null } : {}),
            ...(input.taxRateBps !== undefined ? { taxRateBps: input.taxRateBps } : {}),
            ...(input.meetingProviders ? { meetingProviders: input.meetingProviders } : {}),
            ...(input.preparationNotes !== undefined ? { preparationNotes: input.preparationNotes ?? null } : {}),
            ...(input.cancellationPolicy !== undefined ? { cancellationPolicy: input.cancellationPolicy ?? null } : {}),
            ...(input.reschedulePolicy !== undefined ? { reschedulePolicy: input.reschedulePolicy ?? null } : {}),
            ...(input.cancellationWindowHours !== undefined ? { cancellationWindowHours: input.cancellationWindowHours } : {}),
            ...(input.rescheduleWindowHours !== undefined ? { rescheduleWindowHours: input.rescheduleWindowHours } : {}),
            ...(input.leadTimeHours !== undefined ? { leadTimeHours: input.leadTimeHours } : {}),
            ...(input.bookingHorizonDays !== undefined ? { bookingHorizonDays: input.bookingHorizonDays } : {}),
            ...(input.bufferBeforeMinutes !== undefined ? { bufferBeforeMinutes: input.bufferBeforeMinutes } : {}),
            ...(input.bufferAfterMinutes !== undefined ? { bufferAfterMinutes: input.bufferAfterMinutes } : {}),
            ...(input.status ? { status: input.status } : {}),
            ...(input.isFeatured !== undefined ? { isFeatured: input.isFeatured } : {}),
            ...(input.sortOrder !== undefined ? { sortOrder: input.sortOrder } : {}),
            ...(input.seoTitle !== undefined ? { seoTitle: input.seoTitle ?? null } : {}),
            ...(input.seoDescription !== undefined ? { seoDescription: input.seoDescription ?? null } : {}),
            ...(input.heroImageUrl !== undefined ? { heroImageUrl: input.heroImageUrl ?? null } : {}),
            ...(input.icon !== undefined ? { icon: input.icon ?? null } : {}),
          },
        });

        // Durations are replaced by upsert rather than delete-and-recreate:
        // existing bookings reference these rows for their historical price.
        if (input.durations) {
          const keep = input.durations.map((d) => d.minutes);
          await tx.serviceDuration.deleteMany({
            where: { serviceId: id, minutes: { notIn: keep } },
          });
          for (const [index, duration] of input.durations.entries()) {
            await tx.serviceDuration.upsert({
              where: { serviceId_minutes: { serviceId: id, minutes: duration.minutes } },
              create: {
                serviceId: id,
                minutes: duration.minutes,
                price: duration.price,
                label: duration.label ?? null,
                isDefault: duration.isDefault,
                sortOrder: index,
              },
              update: {
                price: duration.price,
                label: duration.label ?? null,
                isDefault: duration.isDefault,
                sortOrder: index,
              },
            });
          }
        }

        if (input.consultantIds) {
          await tx.serviceConsultant.deleteMany({ where: { serviceId: id } });
          await tx.serviceConsultant.createMany({
            data: input.consultantIds.map((consultantId) => ({ serviceId: id, consultantId })),
            skipDuplicates: true,
          });
        }
      });

      await auditFromRequest(request, {
        action: AUDIT_ACTIONS.CONTENT_UPDATED,
        entity: 'Service',
        entityId: id,
      });

      return ok(reply, { id });
    },
  );

  /* ---------------------------------------------------------------------- */
  /* Availability                                                           */
  /* ---------------------------------------------------------------------- */

  app.put(
    '/consultants/:id/availability',
    {
      preHandler: [app.authenticate],
      schema: { tags: ['Consultant Portal'], summary: 'Replace a consultant’s weekly availability', security: [{ bearerAuth: [] }] },
    },
    async (request, reply) => {
      const user = requireUser(request);
      const { id } = z.object({ id: idSchema }).parse(request.params);
      const input = updateAvailabilitySchema.parse(request.body);

      // A consultant may edit their own availability; anyone else needs the
      // broad availability.manage permission.
      const isOwnProfile = user.consultantProfileId === id;
      if (!isOwnProfile && !user.permissions.includes('availability.manage')) {
        throw forbidden('You can only change your own availability.');
      }

      await prisma.$transaction(async (tx) => {
        await tx.consultantProfile.update({
          where: { id },
          data: { timezone: input.timezone, slotIntervalMinutes: input.slotIntervalMinutes },
        });

        await tx.availabilityRule.deleteMany({ where: { consultantId: id } });
        if (input.rules.length > 0) {
          await tx.availabilityRule.createMany({
            data: input.rules.map((rule) => ({ consultantId: id, ...rule })),
          });
        }

        await tx.availabilityBlackout.deleteMany({ where: { consultantId: id } });
        if (input.blackouts.length > 0) {
          await tx.availabilityBlackout.createMany({
            data: input.blackouts.map((blackout) => ({
              consultantId: id,
              startAt: new Date(blackout.startAt),
              endAt: new Date(blackout.endAt),
              reason: blackout.reason ?? null,
            })),
          });
        }
      });

      await auditFromRequest(request, {
        action: 'availability.updated' as never,
        entity: 'ConsultantProfile',
        entityId: id,
        metadata: { rules: input.rules.length, blackouts: input.blackouts.length },
      });

      return ok(reply, { id, rules: input.rules.length, blackouts: input.blackouts.length });
    },
  );

  app.get(
    '/consultants/:id/availability',
    {
      preHandler: [app.authenticate],
      schema: { tags: ['Consultant Portal'], summary: 'Current availability configuration', security: [{ bearerAuth: [] }] },
    },
    async (request, reply) => {
      const user = requireUser(request);
      const { id } = z.object({ id: idSchema }).parse(request.params);

      if (user.consultantProfileId !== id && !user.permissions.includes('availability.manage')) {
        throw forbidden('You can only view your own availability.');
      }

      const consultant = await prisma.consultantProfile.findUnique({
        where: { id },
        include: {
          availabilityRules: { orderBy: [{ weekday: 'asc' }, { startTime: 'asc' }] },
          blackouts: { where: { endAt: { gte: new Date() } }, orderBy: { startAt: 'asc' } },
          calendarConnections: {
            select: {
              id: true, provider: true, accountEmail: true, syncEnabled: true,
              lastSyncedAt: true, lastError: true, calendarId: true,
            },
          },
        },
      });
      if (!consultant) throw notFound('Consultant');

      return ok(reply, {
        timezone: consultant.timezone,
        slotIntervalMinutes: consultant.slotIntervalMinutes,
        isAcceptingBookings: consultant.isAcceptingBookings,
        rules: consultant.availabilityRules.map((rule) => ({
          id: rule.id,
          weekday: rule.weekday,
          startTime: rule.startTime,
          endTime: rule.endTime,
          isActive: rule.isActive,
        })),
        blackouts: consultant.blackouts.map((blackout) => ({
          id: blackout.id,
          startAt: blackout.startAt.toISOString(),
          endAt: blackout.endAt.toISOString(),
          reason: blackout.reason,
        })),
        calendarConnections: consultant.calendarConnections.map((connection) => ({
          id: connection.id,
          provider: connection.provider,
          accountEmail: connection.accountEmail,
          syncEnabled: connection.syncEnabled,
          lastSyncedAt: connection.lastSyncedAt?.toISOString() ?? null,
          // A connection error is surfaced, not hidden behind a green tick.
          state: connection.lastError ? 'error' : 'connected',
          detail: connection.lastError,
        })),
      });
    },
  );

  app.post(
    '/consultants/:id/sync-calendar',
    {
      preHandler: [app.authenticate],
      schema: { tags: ['Integrations'], summary: 'Refresh mirrored calendar busy periods', security: [{ bearerAuth: [] }] },
    },
    async (request, reply) => {
      const user = requireUser(request);
      const { id } = z.object({ id: idSchema }).parse(request.params);

      if (user.consultantProfileId !== id && !user.permissions.includes('integrations.manage')) {
        throw forbidden('You can only sync your own calendar.');
      }

      const blocks = await syncBusyPeriods(id);
      return ok(reply, { busyBlocks: blocks });
    },
  );

  /* ---------------------------------------------------------------------- */
  /* Users and roles                                                        */
  /* ---------------------------------------------------------------------- */

  app.get(
    '/users',
    {
      preHandler: [app.requirePermissions('users.manage')],
      schema: { tags: ['Admin'], summary: 'List platform users', security: [{ bearerAuth: [] }] },
    },
    async (request, reply) => {
      const query = z
        .object({
          page: z.coerce.number().int().min(1).default(1),
          pageSize: z.coerce.number().int().min(1).max(100).default(25),
          role: z.enum(ROLE_VALUES).optional(),
          search: z.string().trim().max(120).optional(),
        })
        .parse(request.query);
      const { skip, take } = toSkipTake(query.page, query.pageSize);

      const where = {
        ...(query.role ? { roles: { some: { role: { name: query.role } } } } : {}),
        ...(query.search
          ? {
              OR: [
                { email: { contains: query.search, mode: 'insensitive' as const } },
                { firstName: { contains: query.search, mode: 'insensitive' as const } },
                { lastName: { contains: query.search, mode: 'insensitive' as const } },
              ],
            }
          : {}),
      };

      const [users, total] = await Promise.all([
        prisma.user.findMany({
          where,
          select: {
            id: true, email: true, firstName: true, lastName: true, isActive: true,
            emailVerified: true, createdAt: true, lastLoginAt: true,
            roles: { select: { role: { select: { name: true, label: true } } } },
          },
          orderBy: { createdAt: 'desc' },
          skip,
          take,
        }),
        prisma.user.count({ where }),
      ]);

      return ok(
        reply,
        paginated(
          users.map((user) => ({
            id: user.id,
            email: user.email,
            fullName: `${user.firstName} ${user.lastName}`,
            roles: user.roles.map((r) => r.role.name),
            isActive: user.isActive,
            emailVerified: user.emailVerified,
            createdAt: user.createdAt.toISOString(),
            lastLoginAt: user.lastLoginAt?.toISOString() ?? null,
          })),
          total,
          query.page,
          query.pageSize,
        ),
      );
    },
  );

  app.post(
    '/users/:id/roles',
    {
      preHandler: [app.requirePermissions('users.manage')],
      schema: { tags: ['Admin'], summary: 'Assign or revoke a role', security: [{ bearerAuth: [] }] },
    },
    async (request, reply) => {
      const actor = requireUser(request);
      const { id } = z.object({ id: idSchema }).parse(request.params);
      const input = z
        .object({ role: z.enum(ROLE_VALUES), action: z.enum(['grant', 'revoke']) })
        .parse(request.body);

      // Only a SUPER_ADMIN may mint another SUPER_ADMIN; otherwise any user
      // manager could escalate themselves to full control.
      if (input.role === 'SUPER_ADMIN' && !actor.roles.includes('SUPER_ADMIN')) {
        throw forbidden('Only a super administrator can grant that role.');
      }

      // Removing your own last administrative role would lock you out.
      if (id === actor.id && input.action === 'revoke') {
        throw badRequest('You cannot change your own roles.');
      }

      const role = await prisma.role.findUniqueOrThrow({ where: { name: input.role } });

      if (input.action === 'grant') {
        await prisma.userRole.upsert({
          where: { userId_roleId: { userId: id, roleId: role.id } },
          create: { userId: id, roleId: role.id, assignedBy: actor.id },
          update: {},
        });
      } else {
        await prisma.userRole.deleteMany({ where: { userId: id, roleId: role.id } });
      }

      await auditFromRequest(request, {
        action:
          input.action === 'grant' ? AUDIT_ACTIONS.USER_ROLE_ASSIGNED : AUDIT_ACTIONS.USER_ROLE_REVOKED,
        entity: 'User',
        entityId: id,
        metadata: { role: input.role },
      });

      return ok(reply, { userId: id, role: input.role, action: input.action });
    },
  );

  /* ---------------------------------------------------------------------- */
  /* Audit log                                                              */
  /* ---------------------------------------------------------------------- */

  app.get(
    '/audit-logs',
    {
      preHandler: [app.requirePermissions('audit.read')],
      schema: {
        tags: ['Admin'],
        summary: 'Inspect the audit trail',
        description: 'Append-only. There is no endpoint that edits or deletes an audit entry.',
        security: [{ bearerAuth: [] }],
      },
    },
    async (request, reply) => {
      const query = z
        .object({
          page: z.coerce.number().int().min(1).default(1),
          pageSize: z.coerce.number().int().min(1).max(100).default(50),
          action: z.string().trim().max(80).optional(),
          entity: z.string().trim().max(60).optional(),
          entityId: z.string().trim().max(64).optional(),
          actorId: idSchema.optional(),
          from: z.iso.datetime().optional(),
          to: z.iso.datetime().optional(),
        })
        .parse(request.query);
      const { skip, take } = toSkipTake(query.page, query.pageSize);

      const where = {
        ...(query.action ? { action: { contains: query.action } } : {}),
        ...(query.entity ? { entity: query.entity } : {}),
        ...(query.entityId ? { entityId: query.entityId } : {}),
        ...(query.actorId ? { actorId: query.actorId } : {}),
        ...(query.from || query.to
          ? {
              createdAt: {
                ...(query.from ? { gte: new Date(query.from) } : {}),
                ...(query.to ? { lte: new Date(query.to) } : {}),
              },
            }
          : {}),
      };

      const [logs, total] = await Promise.all([
        prisma.auditLog.findMany({
          where,
          include: { actor: { select: { id: true, firstName: true, lastName: true, email: true } } },
          orderBy: { createdAt: 'desc' },
          skip,
          take,
        }),
        prisma.auditLog.count({ where }),
      ]);

      return ok(
        reply,
        paginated(
          logs.map((log) => ({
            id: log.id,
            action: log.action,
            entity: log.entity,
            entityId: log.entityId,
            actor: log.actor
              ? {
                  id: log.actor.id,
                  fullName: `${log.actor.firstName} ${log.actor.lastName}`,
                  email: log.actor.email,
                }
              : null,
            ip: log.ip,
            userAgent: log.userAgent,
            metadata: log.metadata as Record<string, unknown> | null,
            createdAt: log.createdAt.toISOString(),
          })),
          total,
          query.page,
          query.pageSize,
        ),
      );
    },
  );

  /* ---------------------------------------------------------------------- */
  /* Email log                                                              */
  /* ---------------------------------------------------------------------- */

  app.get(
    '/email-logs',
    {
      preHandler: [app.requirePermissions('emails.read')],
      schema: { tags: ['Admin'], summary: 'Transactional email delivery log', security: [{ bearerAuth: [] }] },
    },
    async (request, reply) => {
      const query = z
        .object({
          page: z.coerce.number().int().min(1).default(1),
          pageSize: z.coerce.number().int().min(1).max(100).default(50),
          status: z.enum(['QUEUED', 'SENT', 'FAILED', 'SUPPRESSED']).optional(),
          template: z.string().trim().max(60).optional(),
          recipient: z.string().trim().max(254).optional(),
        })
        .parse(request.query);
      const { skip, take } = toSkipTake(query.page, query.pageSize);

      const where = {
        ...(query.status ? { status: query.status } : {}),
        ...(query.template ? { template: query.template } : {}),
        ...(query.recipient ? { recipient: { contains: query.recipient, mode: 'insensitive' as const } } : {}),
      };

      const [logs, total, failedCount] = await Promise.all([
        prisma.emailLog.findMany({ where, orderBy: { createdAt: 'desc' }, skip, take }),
        prisma.emailLog.count({ where }),
        prisma.emailLog.count({ where: { status: 'FAILED' } }),
      ]);

      return ok(reply, {
        ...paginated(
          logs.map((log) => ({
            id: log.id,
            recipient: log.recipient,
            template: log.template,
            subject: log.subject,
            status: log.status,
            provider: log.provider,
            providerMessageId: log.providerMessageId,
            error: log.error,
            attempts: log.attempts,
            relatedEntity: log.relatedEntity,
            relatedEntityId: log.relatedEntityId,
            sentAt: log.sentAt?.toISOString() ?? null,
            createdAt: log.createdAt.toISOString(),
          })),
          total,
          query.page,
          query.pageSize,
        ),
        failedCount,
      });
    },
  );

  /* ---------------------------------------------------------------------- */
  /* Integrations                                                           */
  /* ---------------------------------------------------------------------- */

  app.get(
    '/integrations',
    {
      preHandler: [app.requirePermissions('integrations.manage')],
      schema: {
        tags: ['Integrations'],
        summary: 'Connection state of every provider',
        description:
          'State is derived from whether credentials are actually present and working. A provider with no credentials reports not_connected — never a fabricated success.',
        security: [{ bearerAuth: [] }],
      },
    },
    async (_request, reply) => {
      const rows = await prisma.integration.findMany({ orderBy: { category: 'asc' } });
      const video = providerStatuses();

      const stateFor = (key: string): 'connected' | 'not_connected' | 'error' => {
        switch (key) {
          case 'paystack':
            return integrationsConfigured.paystack ? 'connected' : 'not_connected';
          case 'google_calendar':
          case 'google_meet':
            return integrationsConfigured.google ? 'connected' : 'not_connected';
          case 'microsoft_calendar':
          case 'microsoft_teams':
            return integrationsConfigured.microsoft ? 'connected' : 'not_connected';
          case 'zoom':
            return video.find((v) => v.provider === 'ZOOM')?.configured ? 'connected' : 'not_connected';
          case 'email':
            return integrationsConfigured.email ? 'connected' : 'not_connected';
          case 'storage':
            return integrationsConfigured.storage ? 'connected' : 'not_connected';
          default:
            return 'not_connected';
        }
      };

      const connectionCounts = await prisma.calendarConnection.groupBy({
        by: ['provider'],
        _count: { _all: true },
      });

      return ok(
        reply,
        rows.map((row) => {
          const state = row.lastError ? 'error' : stateFor(row.key);
          const linked = connectionCounts.find(
            (c) =>
              (row.key.startsWith('google') && c.provider === 'GOOGLE') ||
              (row.key.startsWith('microsoft') && c.provider === 'MICROSOFT'),
          );

          return {
            key: row.key,
            name: row.name,
            category: row.category,
            state,
            detail:
              state === 'not_connected'
                ? 'Credentials have not been configured for this provider.'
                : row.lastError,
            connectedAt: row.connectedAt?.toISOString() ?? null,
            accountLabel: row.accountLabel,
            linkedAccounts: linked?._count._all ?? 0,
          };
        }),
      );
    },
  );

  app.post(
    '/bookings/:id/retry-meeting',
    {
      preHandler: [app.requirePermissions('appointments.update')],
      schema: {
        tags: ['Integrations'],
        summary: 'Retry meeting creation for a paid booking',
        description: 'Idempotent: a booking that already has a meeting returns the existing link.',
        security: [{ bearerAuth: [] }],
      },
    },
    async (request, reply) => {
      const { id } = z.object({ id: idSchema }).parse(request.params);

      const booking = await prisma.booking.findUnique({
        where: { id },
        select: { paymentStatus: true },
      });
      if (!booking) throw notFound('Booking');

      // The meeting rule holds even for an admin retry: no payment, no link.
      if (booking.paymentStatus !== 'PAID' && booking.paymentStatus !== 'PARTIALLY_PAID') {
        throw badRequest('A meeting link is only created once payment is confirmed.');
      }

      const outcome = await ensureMeeting(id);
      await auditFromRequest(request, {
        action: outcome.ok ? AUDIT_ACTIONS.MEETING_CREATED : AUDIT_ACTIONS.MEETING_CREATION_FAILED,
        entity: 'Booking',
        entityId: id,
        metadata: { retried: true, ok: outcome.ok },
      });

      return ok(reply, { ok: outcome.ok, reason: outcome.reason });
    },
  );

  /* ---------------------------------------------------------------------- */
  /* Settings                                                               */
  /* ---------------------------------------------------------------------- */

  app.get(
    '/settings',
    {
      preHandler: [app.requirePermissions('settings.manage')],
      schema: { tags: ['Admin'], summary: 'All platform settings', security: [{ bearerAuth: [] }] },
    },
    async (_request, reply) => {
      const settings = await prisma.setting.findMany({ orderBy: { key: 'asc' } });
      return ok(
        reply,
        settings.map((setting) => ({
          key: setting.key,
          value: setting.value,
          description: setting.description,
          isPublic: setting.isPublic,
          updatedAt: setting.updatedAt.toISOString(),
        })),
      );
    },
  );

  app.put(
    '/settings/:key',
    {
      preHandler: [app.requirePermissions('settings.manage')],
      schema: { tags: ['Admin'], summary: 'Update a setting', security: [{ bearerAuth: [] }] },
    },
    async (request, reply) => {
      const user = requireUser(request);
      const { key } = z.object({ key: z.string().trim().min(1).max(80) }).parse(request.params);
      const { value } = z.object({ value: z.unknown() }).parse(request.body);

      const setting = await prisma.setting.update({
        where: { key },
        data: { value: value as never, updatedBy: user.id },
      });

      await auditFromRequest(request, {
        action: AUDIT_ACTIONS.SETTINGS_UPDATED,
        entity: 'Setting',
        entityId: key,
        metadata: { key },
      });

      return ok(reply, { key: setting.key, value: setting.value });
    },
  );

  app.delete(
    '/notifications',
    {
      preHandler: [app.authenticate],
      schema: { tags: ['Admin'], summary: 'Clear read notifications', security: [{ bearerAuth: [] }] },
    },
    async (request, reply) => {
      const user = requireUser(request);
      await prisma.notification.deleteMany({ where: { userId: user.id, readAt: { not: null } } });
      return noContent(reply);
    },
  );
}
