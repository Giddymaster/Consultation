import type { FastifyInstance } from 'fastify';
import { z } from 'zod';
import {
  createReviewSchema,
  idSchema,
  moderateReviewSchema,
  sessionListQuerySchema,
  sessionNoteSchema,
  type AuthenticatedUser,
} from '@meridian/types';
import { prisma } from '../../lib/prisma.js';
import { badRequest, forbidden, notFound } from '../../lib/errors.js';
import { created, ok, paginated, toSkipTake } from '../../lib/http.js';
import { requireUser } from '../../plugins/auth.js';
import { transitionBooking } from '../../services/booking.service.js';
import { AUDIT_ACTIONS, auditFromRequest } from '../../services/audit.service.js';
import { notify } from '../../services/notification.service.js';
import { toClientSession, toConsultantSession, toReviewDto } from '../serializers.js';

/**
 * Sessions, structured notes and reviews.
 *
 * The security property this file exists to guarantee: **a client can never
 * read a consultant's private notes.** Two independent mechanisms enforce it —
 * the route picks a serialiser based on the caller's relationship to the
 * session, and the client serialiser has no path to the private field at all.
 * Neither alone would be sufficient; together a mistake in one is caught by
 * the other.
 */

const SESSION_INCLUDE = {
  note: true,
  attachments: true,
  booking: {
    include: {
      service: {
        select: {
          id: true,
          name: true,
          slug: true,
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
          user: { select: { firstName: true, lastName: true, avatarUrl: true } },
        },
      },
      client: {
        select: {
          id: true,
          userId: true,
          user: {
            select: { firstName: true, lastName: true, email: true, phone: true, company: true },
          },
        },
      },
    },
  },
} as const;

type SessionWithRelations = NonNullable<
  Awaited<ReturnType<typeof prisma.consultationSession.findFirst<{ include: typeof SESSION_INCLUDE }>>>
>;

interface SessionAccess {
  isClient: boolean;
  isConsultant: boolean;
  /** Whether this caller may see the private consultant note. */
  canSeePrivateNotes: boolean;
  canEditNotes: boolean;
}

/**
 * Resolves what the caller may do with this session.
 *
 * `sessions.notes` is a distinct permission from `sessions.read`: an operations
 * administrator can list and manage sessions without being able to read the
 * confidential write-up, which is the whole point of separating them.
 */
function resolveAccess(session: SessionWithRelations, user: AuthenticatedUser): SessionAccess {
  const isClient = session.booking.client.userId === user.id;
  const isConsultant = session.booking.consultant.userId === user.id;

  // `sessions.read` is the *broad* form, held by staff. Consultants hold only
  // `sessions.read.own`, which grants nothing on a session they did not
  // deliver. `sessions.notes` is a capability, not a scope: it says what you
  // may do with notes you can already reach, never which sessions you reach.
  const hasBroadRead = user.permissions.includes('sessions.read');
  const hasNotesPermission = user.permissions.includes('sessions.notes');

  if (!isClient && !isConsultant && !hasBroadRead) {
    throw notFound('Session');
  }

  return {
    isClient,
    isConsultant,
    // A client is excluded regardless of any other permission they hold, and a
    // consultant sees private notes only on their own sessions.
    canSeePrivateNotes: !isClient && (isConsultant || (hasBroadRead && hasNotesPermission)),
    canEditNotes: isConsultant || (hasBroadRead && hasNotesPermission),
  };
}

export async function sessionRoutes(app: FastifyInstance): Promise<void> {
  /* ---------------------------------------------------------------------- */
  /* List                                                                   */
  /* ---------------------------------------------------------------------- */

  app.get(
    '/',
    {
      preHandler: [app.authenticate],
      schema: { tags: ['Sessions'], summary: 'List sessions visible to the caller', security: [{ bearerAuth: [] }] },
    },
    async (request, reply) => {
      const user = requireUser(request);
      const query = sessionListQuerySchema.parse(request.query);
      const { skip, take } = toSkipTake(query.page, query.pageSize);

      const scope = await sessionScopeFor(user, query.consultantId, query.clientId);

      const where = {
        ...scope,
        // The scope already restricts which bookings are reachable, so this
        // narrows within that set rather than widening it.
        ...(query.bookingId ? { bookingId: query.bookingId } : {}),
        ...(query.status ? { status: query.status } : {}),
        ...(query.from || query.to
          ? {
              booking: {
                ...(scope.booking ?? {}),
                startAt: {
                  ...(query.from ? { gte: new Date(query.from) } : {}),
                  ...(query.to ? { lte: new Date(query.to) } : {}),
                },
              },
            }
          : {}),
      };

      const [sessions, total] = await Promise.all([
        prisma.consultationSession.findMany({
          where,
          include: SESSION_INCLUDE,
          orderBy: { booking: { startAt: 'desc' } },
          skip,
          take,
        }),
        prisma.consultationSession.count({ where }),
      ]);

      // Each row is serialised through the view its own access level allows,
      // so a mixed list (staff seeing many consultants) is still correct.
      const items = sessions.map((session) => {
        const access = resolveAccess(session, user);
        return access.canSeePrivateNotes ? toConsultantSession(session) : toClientSession(session);
      });

      return ok(reply, paginated(items, total, query.page, query.pageSize));
    },
  );

  app.get(
    '/:id',
    {
      preHandler: [app.authenticate],
      schema: {
        tags: ['Sessions'],
        summary: 'Session detail',
        description:
          'Clients receive a view with no private consultant notes. Consultants and holders of sessions.notes receive the full record.',
        security: [{ bearerAuth: [] }],
      },
    },
    async (request, reply) => {
      const user = requireUser(request);
      const { id } = z.object({ id: idSchema }).parse(request.params);

      const session = await prisma.consultationSession.findUnique({
        where: { id },
        include: SESSION_INCLUDE,
      });
      if (!session) throw notFound('Session');

      const access = resolveAccess(session, user);
      return ok(
        reply,
        access.canSeePrivateNotes ? toConsultantSession(session) : toClientSession(session),
      );
    },
  );

  /* ---------------------------------------------------------------------- */
  /* Notes                                                                  */
  /* ---------------------------------------------------------------------- */

  app.put(
    '/:id/notes',
    {
      preHandler: [app.authenticate],
      schema: {
        tags: ['Sessions'],
        summary: 'Create or update the session write-up',
        description:
          'Requires being the delivering consultant, or holding sessions.notes. Autosave-friendly: the whole note is replaced on each call.',
        security: [{ bearerAuth: [] }],
      },
    },
    async (request, reply) => {
      const user = requireUser(request);
      const { id } = z.object({ id: idSchema }).parse(request.params);
      const input = sessionNoteSchema.parse(request.body);

      const session = await prisma.consultationSession.findUnique({
        where: { id },
        include: SESSION_INCLUDE,
      });
      if (!session) throw notFound('Session');

      const access = resolveAccess(session, user);
      if (!access.canEditNotes) {
        throw forbidden('Only the consultant who delivered this session can edit its notes.');
      }

      const existing = await prisma.sessionNote.findUnique({ where: { sessionId: id } });

      const data = {
        objective: input.objective ?? null,
        discussionSummary: input.discussionSummary ?? null,
        keyFindings: input.keyFindings ?? null,
        recommendations: input.recommendations ?? null,
        actionItems: input.actionItems as never,
        followUpDate: input.followUpDate ? new Date(input.followUpDate) : null,
        privateNotes: input.privateNotes ?? null,
        sharedWithClient: input.sharedWithClient,
        lastEditedBy: user.id,
      };

      const note = await prisma.sessionNote.upsert({
        where: { sessionId: id },
        create: { sessionId: id, ...data },
        update: data,
      });

      await auditFromRequest(request, {
        action: existing ? AUDIT_ACTIONS.NOTE_UPDATED : AUDIT_ACTIONS.NOTE_CREATED,
        entity: 'SessionNote',
        entityId: note.id,
        // The note body is never written to the audit log.
        metadata: { sessionId: id, sharedWithClient: input.sharedWithClient },
      });

      // Tell the client the moment a write-up becomes visible to them.
      if (input.sharedWithClient && !existing?.sharedWithClient) {
        await notify({
          userId: session.booking.client.userId,
          type: 'SYSTEM',
          title: 'Your session notes are ready',
          body: `Notes from your ${session.booking.service.name} are now available in your portal.`,
          href: `/portal/sessions/${id}`,
        });
        await auditFromRequest(request, {
          action: AUDIT_ACTIONS.NOTE_SHARED,
          entity: 'SessionNote',
          entityId: note.id,
          metadata: { sessionId: id },
        });
      }

      const refreshed = await prisma.consultationSession.findUniqueOrThrow({
        where: { id },
        include: SESSION_INCLUDE,
      });
      return ok(reply, toConsultantSession(refreshed));
    },
  );

  /* ---------------------------------------------------------------------- */
  /* Session lifecycle                                                      */
  /* ---------------------------------------------------------------------- */

  app.post(
    '/:id/start',
    {
      preHandler: [app.authenticate],
      schema: { tags: ['Sessions'], summary: 'Mark a session as started', security: [{ bearerAuth: [] }] },
    },
    async (request, reply) => {
      const user = requireUser(request);
      const { id } = z.object({ id: idSchema }).parse(request.params);

      const session = await prisma.consultationSession.findUnique({
        where: { id },
        include: SESSION_INCLUDE,
      });
      if (!session) throw notFound('Session');
      const access = resolveAccess(session, user);
      if (!access.isConsultant && !user.permissions.includes('sessions.update')) {
        throw forbidden('Only the delivering consultant can start this session.');
      }

      await prisma.consultationSession.update({
        where: { id },
        data: { status: 'IN_PROGRESS', startedAt: new Date() },
      });
      await transitionBooking({
        bookingId: session.bookingId,
        to: 'IN_PROGRESS',
        reason: 'Session started',
        actorId: user.id,
      });

      await auditFromRequest(request, {
        action: AUDIT_ACTIONS.SESSION_STARTED,
        entity: 'Session',
        entityId: id,
      });

      const refreshed = await prisma.consultationSession.findUniqueOrThrow({
        where: { id },
        include: SESSION_INCLUDE,
      });
      return ok(reply, toConsultantSession(refreshed));
    },
  );

  app.post(
    '/:id/complete',
    {
      preHandler: [app.authenticate],
      schema: { tags: ['Sessions'], summary: 'Complete a session and queue the review request', security: [{ bearerAuth: [] }] },
    },
    async (request, reply) => {
      const user = requireUser(request);
      const { id } = z.object({ id: idSchema }).parse(request.params);
      const body = z
        .object({ actualMinutes: z.number().int().min(1).max(600).optional() })
        .parse(request.body ?? {});

      const session = await prisma.consultationSession.findUnique({
        where: { id },
        include: SESSION_INCLUDE,
      });
      if (!session) throw notFound('Session');
      const access = resolveAccess(session, user);
      if (!access.isConsultant && !user.permissions.includes('sessions.update')) {
        throw forbidden('Only the delivering consultant can complete this session.');
      }

      const endedAt = new Date();
      await prisma.consultationSession.update({
        where: { id },
        data: {
          status: 'COMPLETED',
          endedAt,
          actualMinutes:
            body.actualMinutes ??
            (session.startedAt
              ? Math.round((endedAt.getTime() - session.startedAt.getTime()) / 60_000)
              : session.booking.durationMinutes),
        },
      });

      await transitionBooking({
        bookingId: session.bookingId,
        to: 'COMPLETED',
        reason: 'Session completed',
        actorId: user.id,
      });

      await prisma.consultantProfile.update({
        where: { id: session.booking.consultant.id },
        data: { completedSessions: { increment: 1 } },
      });

      // The review request is queued rather than sent inline, so the request
      // returns promptly and a delivery failure can be retried.
      const setting = await prisma.setting.findUnique({ where: { key: 'reviews.autoRequestHours' } });
      const delayHours = typeof setting?.value === 'number' ? setting.value : 6;
      await prisma.scheduledJob.upsert({
        where: { dedupeKey: `review-request:${session.bookingId}` },
        create: {
          type: 'REVIEW_REQUEST',
          runAt: new Date(Date.now() + delayHours * 3_600_000),
          payload: { bookingId: session.bookingId },
          dedupeKey: `review-request:${session.bookingId}`,
        },
        update: {},
      });

      await auditFromRequest(request, {
        action: AUDIT_ACTIONS.SESSION_COMPLETED,
        entity: 'Session',
        entityId: id,
      });

      const refreshed = await prisma.consultationSession.findUniqueOrThrow({
        where: { id },
        include: SESSION_INCLUDE,
      });
      return ok(reply, toConsultantSession(refreshed));
    },
  );

  /* ---------------------------------------------------------------------- */
  /* Reviews                                                                */
  /* ---------------------------------------------------------------------- */

  app.post(
    '/reviews',
    {
      preHandler: [app.authenticate],
      config: { rateLimit: { max: 10, timeWindow: '1 hour' } },
      schema: {
        tags: ['Reviews'],
        summary: 'Submit a review for a completed booking',
        description:
          'Only the client on a completed booking may review it, and only once. Reviews are held for moderation before appearing publicly.',
        security: [{ bearerAuth: [] }],
      },
    },
    async (request, reply) => {
      const user = requireUser(request);
      const input = createReviewSchema.parse(request.body);

      const booking = await prisma.booking.findUnique({
        where: { id: input.bookingId },
        include: { client: { select: { userId: true } }, review: { select: { id: true } } },
      });
      if (!booking) throw notFound('Booking');

      // Only the person who received the consultation may review it.
      if (booking.client.userId !== user.id) {
        throw forbidden('You can only review a consultation you attended.');
      }
      if (booking.status !== 'COMPLETED') {
        throw badRequest('You can leave a review once the consultation has taken place.');
      }
      if (booking.review) {
        throw badRequest('You have already reviewed this consultation.');
      }

      const review = await prisma.review.create({
        data: {
          bookingId: booking.id,
          userId: user.id,
          consultantId: booking.consultantId,
          serviceId: booking.serviceId,
          rating: input.rating,
          title: input.title ?? null,
          body: input.body,
          serviceRating: input.serviceRating ?? null,
          consultantRating: input.consultantRating ?? null,
          communicationRating: input.communicationRating ?? null,
          valueRating: input.valueRating ?? null,
          displayName: input.displayName ?? null,
          isAnonymous: input.isAnonymous,
          // Verified because it is attached to a completed, paid booking.
          isVerified: booking.paymentStatus === 'PAID' || booking.paymentStatus === 'PARTIALLY_PAID',
          status: 'PENDING',
        },
        include: {
          user: { select: { firstName: true, lastName: true } },
          service: { select: { name: true } },
          consultant: { include: { user: { select: { firstName: true, lastName: true } } } },
        },
      });

      await auditFromRequest(request, {
        action: AUDIT_ACTIONS.REVIEW_SUBMITTED,
        entity: 'Review',
        entityId: review.id,
        metadata: { bookingId: booking.id, rating: input.rating },
      });

      await notify({
        userId: booking.consultantId,
        type: 'REVIEW_RECEIVED',
        title: 'New review received',
        body: `A ${input.rating}-star review is awaiting moderation.`,
        href: '/admin/reviews',
      });

      return created(reply, toReviewDto(review));
    },
  );

  app.patch(
    '/reviews/:id/moderate',
    {
      preHandler: [app.requirePermissions('reviews.moderate')],
      schema: { tags: ['Reviews'], summary: 'Approve or reject a review', security: [{ bearerAuth: [] }] },
    },
    async (request, reply) => {
      const user = requireUser(request);
      const { id } = z.object({ id: idSchema }).parse(request.params);
      const input = moderateReviewSchema.parse(request.body);

      const review = await prisma.review.update({
        where: { id },
        data: {
          status: input.status,
          moderationNote: input.moderationNote ?? null,
          moderatedBy: user.id,
          moderatedAt: new Date(),
        },
        include: {
          user: { select: { firstName: true, lastName: true } },
          service: { select: { name: true } },
          consultant: { include: { user: { select: { firstName: true, lastName: true } } } },
        },
      });

      // Recompute the consultant's public rating from approved reviews only.
      const approved = await prisma.review.findMany({
        where: { consultantId: review.consultantId, status: 'APPROVED' },
        select: { rating: true },
      });
      await prisma.consultantProfile.update({
        where: { id: review.consultantId },
        data: {
          reviewCount: approved.length,
          averageRating:
            approved.length > 0
              ? Math.round((approved.reduce((sum, r) => sum + r.rating, 0) / approved.length) * 10) / 10
              : null,
        },
      });

      await auditFromRequest(request, {
        action: AUDIT_ACTIONS.REVIEW_MODERATED,
        entity: 'Review',
        entityId: id,
        metadata: { status: input.status },
      });

      return ok(reply, toReviewDto(review));
    },
  );

  app.get(
    '/reviews/pending',
    {
      preHandler: [app.requirePermissions('reviews.moderate')],
      schema: { tags: ['Reviews'], summary: 'Reviews awaiting moderation', security: [{ bearerAuth: [] }] },
    },
    async (request, reply) => {
      const query = z
        .object({
          page: z.coerce.number().int().min(1).default(1),
          pageSize: z.coerce.number().int().min(1).max(50).default(20),
          status: z.enum(['PENDING', 'APPROVED', 'REJECTED']).default('PENDING'),
        })
        .parse(request.query);

      const { skip, take } = toSkipTake(query.page, query.pageSize);
      const where = { status: query.status };

      const [reviews, total] = await Promise.all([
        prisma.review.findMany({
          where,
          include: {
            user: { select: { firstName: true, lastName: true, email: true } },
            service: { select: { name: true } },
            consultant: { include: { user: { select: { firstName: true, lastName: true } } } },
            booking: { select: { reference: true, startAt: true } },
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
            ...toReviewDto(review),
            // Moderators need the real identity even on anonymous reviews.
            moderatorView: {
              authorEmail: review.user.email,
              authorName: `${review.user.firstName} ${review.user.lastName}`,
              bookingReference: review.booking.reference,
            },
          })),
          total,
          query.page,
          query.pageSize,
        ),
      );
    },
  );
}

async function sessionScopeFor(
  user: AuthenticatedUser,
  requestedConsultantId?: string,
  requestedClientId?: string,
): Promise<{ booking?: Record<string, unknown> }> {
  if (user.permissions.includes('sessions.read')) {
    if (!requestedConsultantId && !requestedClientId) return {};
    return {
      booking: {
        ...(requestedConsultantId ? { consultantId: requestedConsultantId } : {}),
        ...(requestedClientId ? { clientId: requestedClientId } : {}),
      },
    };
  }

  if (user.consultantProfileId) {
    return { booking: { consultantId: user.consultantProfileId } };
  }

  const profile = await prisma.clientProfile.findUnique({
    where: { userId: user.id },
    select: { id: true },
  });
  return { booking: { clientId: profile?.id ?? '00000000-0000-0000-0000-000000000000' } };
}
