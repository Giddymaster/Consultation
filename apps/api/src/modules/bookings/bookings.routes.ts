import type { FastifyInstance } from 'fastify';
import { z } from 'zod';
import {
  BOOKING_STATUS,
  cancelBookingSchema,
  createBookingSchema,
  bookingListQuerySchema,
  rescheduleBookingSchema,
  idSchema,
  type AuthenticatedUser,
} from '@meridian/types';
import { prisma } from '../../lib/prisma.js';
import { forbidden, notFound } from '../../lib/errors.js';
import { created, ok, paginated, toSkipTake } from '../../lib/http.js';
import { requireUser } from '../../plugins/auth.js';
import {
  cancelBooking,
  createBooking,
  rescheduleBooking,
} from '../../services/booking.service.js';
import { updateCalendarEvent, deleteCalendarEvent } from '../../services/calendar/calendar.service.js';
import { getVideoProvider } from '../../services/video/index.js';
import { AUDIT_ACTIONS, auditFromRequest } from '../../services/audit.service.js';
import { toBookingDetail, toBookingSummary } from '../serializers.js';
import {
  sendBookingCancelledEmail,
  sendBookingCreatedEmail,
  sendBookingRescheduledEmail,
} from '../../services/email/messages.js';
import { notify } from '../../services/notification.service.js';

/**
 * Booking endpoints.
 *
 * Object-level authorization is enforced by `assertCanAccessBooking` on every
 * single-booking route: holding `appointments.read` is not enough to read
 * *someone else's* booking, and a client's own bookings are scoped by their
 * client profile rather than by a query parameter they control.
 */

const BOOKING_INCLUDE = {
  service: {
    select: {
      id: true,
      name: true,
      slug: true,
      preparationNotes: true,
      cancellationPolicy: true,
      cancellationWindowHours: true,
      rescheduleWindowHours: true,
    },
  },
  consultant: {
    select: {
      id: true,
      slug: true,
      title: true,
      userId: true,
      user: { select: { firstName: true, lastName: true, avatarUrl: true, email: true } },
    },
  },
  client: {
    select: {
      id: true,
      userId: true,
      user: { select: { firstName: true, lastName: true, email: true } },
    },
  },
  videoMeeting: true,
  session: { select: { id: true } },
  review: { select: { id: true } },
  payments: { orderBy: { createdAt: 'desc' } },
} as const;

type BookingWithRelations = NonNullable<
  Awaited<ReturnType<typeof prisma.booking.findFirst<{ include: typeof BOOKING_INCLUDE }>>>
>;

/**
 * Decides whether `user` may see this booking at all.
 *
 * Three ways in, checked in order of specificity:
 *   • the client who owns it,
 *   • the consultant delivering it,
 *   • a staff member holding the broad `appointments.read` permission.
 *
 * Anything else is a 404, not a 403 — a stranger should not be able to confirm
 * that a booking id exists.
 */
function assertCanAccessBooking(
  booking: BookingWithRelations,
  user: AuthenticatedUser,
  options: { forWrite?: boolean } = {},
): { isOwner: boolean; isConsultant: boolean; isStaff: boolean } {
  const isOwner = booking.client.userId === user.id;
  const isConsultant = booking.consultant.userId === user.id;
  const isStaff = user.permissions.includes('appointments.read');

  if (!isOwner && !isConsultant && !isStaff) throw notFound('Booking');

  if (options.forWrite && !isOwner && !isConsultant && !user.permissions.includes('appointments.update')) {
    throw forbidden('You do not have permission to change this booking.');
  }

  return { isOwner, isConsultant, isStaff };
}

async function clientProfileFor(userId: string): Promise<string> {
  const profile = await prisma.clientProfile.findUnique({
    where: { userId },
    select: { id: true },
  });
  if (profile) return profile.id;

  // Staff and consultants can book on behalf of themselves without having been
  // registered as clients; create the profile lazily rather than refusing.
  const count = await prisma.clientProfile.count();
  const createdProfile = await prisma.clientProfile.create({
    data: { userId, clientCode: `CL-${String(count + 1).padStart(6, '0')}` },
    select: { id: true },
  });
  return createdProfile.id;
}

export async function bookingRoutes(app: FastifyInstance): Promise<void> {
  /* ---------------------------------------------------------------------- */
  /* Create                                                                 */
  /* ---------------------------------------------------------------------- */

  app.post(
    '/',
    {
      preHandler: [app.authenticate],
      config: { rateLimit: { max: 20, timeWindow: '10 minutes' } },
      schema: {
        tags: ['Bookings'],
        summary: 'Create a booking',
        description:
          'Validates the slot and inserts inside one Serializable transaction, so concurrent requests for the same time cannot both succeed. Pricing is recomputed server-side; the request body carries no monetary field.',
        security: [{ bearerAuth: [] }],
      },
    },
    async (request, reply) => {
      const user = requireUser(request);
      const input = createBookingSchema.parse(request.body);

      // A client may only ever book for themselves. Staff booking on behalf of
      // a client go through the admin route, which takes an explicit clientId.
      const clientId = await clientProfileFor(user.id);

      const result = await createBooking({ input, clientId, actorId: user.id });

      const booking = await prisma.booking.findUniqueOrThrow({
        where: { id: result.bookingId },
        include: BOOKING_INCLUDE,
      });

      await auditFromRequest(request, {
        action: AUDIT_ACTIONS.BOOKING_CREATED,
        entity: 'Booking',
        entityId: booking.id,
        metadata: { reference: booking.reference, total: booking.total, currency: booking.currency },
      });

      // A free booking has nothing to pay, so it is confirmed immediately and
      // the client is told so; a paid one gets a hold-and-pay email instead.
      if (result.requiresPayment) {
        await sendBookingCreatedEmail({
          to: booking.client.user.email,
          firstName: booking.client.user.firstName,
          reference: booking.reference,
          serviceName: booking.service.name,
          consultantName: `${booking.consultant.user.firstName} ${booking.consultant.user.lastName}`,
          startAt: booking.startAt,
          durationMinutes: booking.durationMinutes,
          timezone: booking.timezone,
          currency: booking.currency,
          total: booking.total,
          amountPaid: booking.amountPaid,
          balance: booking.total - booking.amountPaid,
          meetingProvider: booking.meetingProvider,
          bookingId: booking.id,
        });
      }

      return created(reply, {
        booking: toBookingDetail(booking),
        requiresPayment: result.requiresPayment,
      });
    },
  );

  /* ---------------------------------------------------------------------- */
  /* Read                                                                   */
  /* ---------------------------------------------------------------------- */

  app.get(
    '/',
    {
      preHandler: [app.authenticate],
      schema: { tags: ['Bookings'], summary: 'List bookings visible to the caller', security: [{ bearerAuth: [] }] },
    },
    async (request, reply) => {
      const user = requireUser(request);
      const query = bookingListQuerySchema.parse(request.query);
      const { skip, take } = toSkipTake(query.page, query.pageSize);

      // Scope is derived from who the caller is, never from a request field.
      // A client asking for `?clientId=<someone else>` still sees only their own.
      const scope = await resolveListScope(user, query.consultantId, query.clientId);

      const where = {
        ...scope,
        ...(query.status ? { status: query.status } : {}),
        ...(query.paymentStatus ? { paymentStatus: query.paymentStatus } : {}),
        ...(query.serviceId ? { serviceId: query.serviceId } : {}),
        ...(query.from || query.to
          ? {
              startAt: {
                ...(query.from ? { gte: new Date(query.from) } : {}),
                ...(query.to ? { lte: new Date(query.to) } : {}),
              },
            }
          : {}),
        ...(query.search
          ? {
              OR: [
                { reference: { contains: query.search.toUpperCase() } },
                { client: { user: { email: { contains: query.search, mode: 'insensitive' as const } } } },
                { client: { user: { lastName: { contains: query.search, mode: 'insensitive' as const } } } },
              ],
            }
          : {}),
      };

      const [bookings, total] = await Promise.all([
        prisma.booking.findMany({
          where,
          include: BOOKING_INCLUDE,
          orderBy: { [query.sort]: query.direction },
          skip,
          take,
        }),
        prisma.booking.count({ where }),
      ]);

      return ok(
        reply,
        paginated(bookings.map(toBookingSummary), total, query.page, query.pageSize),
      );
    },
  );

  app.get(
    '/:id',
    {
      preHandler: [app.authenticate],
      schema: { tags: ['Bookings'], summary: 'Booking detail', security: [{ bearerAuth: [] }] },
    },
    async (request, reply) => {
      const user = requireUser(request);
      const { id } = z.object({ id: idSchema }).parse(request.params);

      const booking = await prisma.booking.findUnique({ where: { id }, include: BOOKING_INCLUDE });
      if (!booking) throw notFound('Booking');
      assertCanAccessBooking(booking, user);

      return ok(reply, toBookingDetail(booking));
    },
  );

  app.get(
    '/by-reference/:reference',
    {
      preHandler: [app.authenticate],
      schema: { tags: ['Bookings'], summary: 'Look up a booking by its client-facing reference', security: [{ bearerAuth: [] }] },
    },
    async (request, reply) => {
      const user = requireUser(request);
      const { reference } = z
        .object({ reference: z.string().trim().min(4).max(24) })
        .parse(request.params);

      const booking = await prisma.booking.findUnique({
        where: { reference: reference.toUpperCase() },
        include: BOOKING_INCLUDE,
      });
      if (!booking) throw notFound('Booking');
      assertCanAccessBooking(booking, user);

      return ok(reply, toBookingDetail(booking));
    },
  );

  /* ---------------------------------------------------------------------- */
  /* Reschedule and cancel                                                  */
  /* ---------------------------------------------------------------------- */

  app.post(
    '/:id/reschedule',
    {
      preHandler: [app.authenticate],
      schema: { tags: ['Bookings'], summary: 'Move a booking to a new time', security: [{ bearerAuth: [] }] },
    },
    async (request, reply) => {
      const user = requireUser(request);
      const { id } = z.object({ id: idSchema }).parse(request.params);
      const input = rescheduleBookingSchema.parse(request.body);

      const existing = await prisma.booking.findUnique({ where: { id }, include: BOOKING_INCLUDE });
      if (!existing) throw notFound('Booking');
      const roles = assertCanAccessBooking(existing, user, { forWrite: true });

      // Staff and the delivering consultant may move a booking inside the
      // window a client would be refused; clients are held to the policy.
      const bypassWindow = roles.isStaff || roles.isConsultant;

      const { previousStartAt } = await rescheduleBooking({
        bookingId: id,
        startAt: new Date(input.startAt),
        timezone: input.timezone,
        consultantId: roles.isOwner && !roles.isStaff ? undefined : input.consultantId,
        reason: input.reason,
        actorId: user.id,
        bypassWindow,
      });

      const booking = await prisma.booking.findUniqueOrThrow({ where: { id }, include: BOOKING_INCLUDE });

      // Move the meeting and the calendar entry to match.
      if (booking.videoMeeting?.externalMeetingId && booking.videoMeeting.status === 'CREATED') {
        const provider = getVideoProvider(booking.meetingProvider);
        await provider
          ?.updateMeeting({
            externalMeetingId: booking.videoMeeting.externalMeetingId,
            startAt: booking.startAt,
            durationMinutes: booking.durationMinutes,
            timezone: booking.timezone,
          })
          .catch((error: unknown) => {
            request.log.warn({ err: error, bookingId: id }, 'Could not move the video meeting');
          });
      }
      await updateCalendarEvent(id).catch(() => undefined);

      await auditFromRequest(request, {
        action: AUDIT_ACTIONS.BOOKING_RESCHEDULED,
        entity: 'Booking',
        entityId: id,
        metadata: { from: previousStartAt.toISOString(), to: booking.startAt.toISOString() },
      });

      await sendBookingRescheduledEmail({
        to: booking.client.user.email,
        firstName: booking.client.user.firstName,
        reference: booking.reference,
        serviceName: booking.service.name,
        consultantName: `${booking.consultant.user.firstName} ${booking.consultant.user.lastName}`,
        startAt: booking.startAt,
        durationMinutes: booking.durationMinutes,
        timezone: booking.timezone,
        currency: booking.currency,
        total: booking.total,
        amountPaid: booking.amountPaid,
        balance: booking.total - booking.amountPaid,
        meetingProvider: booking.meetingProvider,
        bookingId: booking.id,
        previousStartAt,
        joinUrl: booking.videoMeeting?.status === 'CREATED' ? booking.videoMeeting.joinUrl : null,
      });

      await notify({
        userId: booking.consultant.userId,
        type: 'BOOKING_RESCHEDULED',
        title: 'Booking rescheduled',
        body: `${booking.reference} moved to a new time.`,
        href: `/consultant/sessions?booking=${booking.id}`,
      });

      return ok(reply, toBookingDetail(booking));
    },
  );

  app.post(
    '/:id/cancel',
    {
      preHandler: [app.authenticate],
      schema: { tags: ['Bookings'], summary: 'Cancel a booking', security: [{ bearerAuth: [] }] },
    },
    async (request, reply) => {
      const user = requireUser(request);
      const { id } = z.object({ id: idSchema }).parse(request.params);
      const input = cancelBookingSchema.parse(request.body ?? {});

      const existing = await prisma.booking.findUnique({ where: { id }, include: BOOKING_INCLUDE });
      if (!existing) throw notFound('Booking');
      const roles = assertCanAccessBooking(existing, user, { forWrite: true });

      await cancelBooking({
        bookingId: id,
        reason: input.reason,
        actorId: user.id,
        bypassWindow: roles.isStaff || roles.isConsultant,
      });

      // Withdraw the meeting and calendar entry so the slot is genuinely freed.
      if (existing.videoMeeting?.externalMeetingId && existing.videoMeeting.status === 'CREATED') {
        const provider = getVideoProvider(existing.meetingProvider);
        await provider?.cancelMeeting(existing.videoMeeting.externalMeetingId).catch(() => undefined);
        await prisma.videoMeeting.update({
          where: { bookingId: id },
          data: { status: 'CANCELLED' },
        });
      }
      await deleteCalendarEvent(id).catch(() => undefined);

      await auditFromRequest(request, {
        action: AUDIT_ACTIONS.BOOKING_CANCELLED,
        entity: 'Booking',
        entityId: id,
        metadata: { reason: input.reason, requestRefund: input.requestRefund },
      });

      const refundNote =
        existing.amountPaid > 0
          ? input.requestRefund
            ? 'A refund request has been raised. Our finance team will be in touch within two working days.'
            : 'If you believe a refund is due under our cancellation policy, reply to this email and we will review it.'
          : null;

      await sendBookingCancelledEmail({
        to: existing.client.user.email,
        firstName: existing.client.user.firstName,
        reference: existing.reference,
        serviceName: existing.service.name,
        consultantName: `${existing.consultant.user.firstName} ${existing.consultant.user.lastName}`,
        startAt: existing.startAt,
        durationMinutes: existing.durationMinutes,
        timezone: existing.timezone,
        currency: existing.currency,
        total: existing.total,
        amountPaid: existing.amountPaid,
        balance: existing.total - existing.amountPaid,
        meetingProvider: existing.meetingProvider,
        bookingId: existing.id,
        reason: input.reason ?? null,
        refundNote,
      });

      if (input.requestRefund && existing.amountPaid > 0) {
        await prisma.booking.update({
          where: { id },
          data: { paymentStatus: 'REFUND_PENDING' },
        });
      }

      const booking = await prisma.booking.findUniqueOrThrow({ where: { id }, include: BOOKING_INCLUDE });
      return ok(reply, toBookingDetail(booking));
    },
  );
}

/**
 * Builds the `where` scope for a booking list from the caller's identity.
 *
 * A client is pinned to their own client profile; a consultant to their own
 * profile; only staff holding `appointments.read` may filter freely.
 */
async function resolveListScope(
  user: AuthenticatedUser,
  requestedConsultantId?: string,
  requestedClientId?: string,
): Promise<Record<string, unknown>> {
  if (user.permissions.includes('appointments.read')) {
    return {
      ...(requestedConsultantId ? { consultantId: requestedConsultantId } : {}),
      ...(requestedClientId ? { clientId: requestedClientId } : {}),
    };
  }

  if (user.consultantProfileId) {
    return { consultantId: user.consultantProfileId };
  }

  const profile = await prisma.clientProfile.findUnique({
    where: { userId: user.id },
    select: { id: true },
  });

  // A user with neither profile nor permission sees an empty list rather than
  // an error — this is the correct answer, not a failure.
  return { clientId: profile?.id ?? '00000000-0000-0000-0000-000000000000' };
}

export { BOOKING_INCLUDE, assertCanAccessBooking, resolveListScope, clientProfileFor };
export const BOOKING_STATUSES = BOOKING_STATUS;
