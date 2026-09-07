import type { FastifyRequest } from 'fastify';
import { prisma } from '../lib/prisma.js';
import { logger } from '../lib/logger.js';

/**
 * Immutable audit trail. The service exposes only `record` — there is
 * deliberately no update or delete path anywhere in the codebase.
 *
 * Writes are fire-and-forget: an audit failure is logged loudly but never
 * fails the user's request, because losing the ability to book because a log
 * row could not be written would be a worse outcome than a gap in the trail.
 */

export const AUDIT_ACTIONS = {
  USER_LOGIN: 'user.login',
  USER_LOGIN_FAILED: 'user.login_failed',
  USER_LOGOUT: 'user.logout',
  USER_REGISTERED: 'user.registered',
  USER_EMAIL_VERIFIED: 'user.email_verified',
  USER_PASSWORD_RESET_REQUESTED: 'user.password_reset_requested',
  USER_PASSWORD_CHANGED: 'user.password_changed',
  USER_ROLE_ASSIGNED: 'user.role_assigned',
  USER_ROLE_REVOKED: 'user.role_revoked',
  USER_DEACTIVATED: 'user.deactivated',

  BOOKING_CREATED: 'booking.created',
  BOOKING_CONFIRMED: 'booking.confirmed',
  BOOKING_RESCHEDULED: 'booking.rescheduled',
  BOOKING_CANCELLED: 'booking.cancelled',
  BOOKING_STATUS_CHANGED: 'booking.status_changed',
  BOOKING_EXPIRED: 'booking.expired',

  PAYMENT_INITIALIZED: 'payment.initialized',
  PAYMENT_SUCCEEDED: 'payment.succeeded',
  PAYMENT_FAILED: 'payment.failed',
  PAYMENT_REFUNDED: 'payment.refunded',
  WEBHOOK_RECEIVED: 'webhook.received',
  WEBHOOK_REJECTED: 'webhook.rejected',

  SESSION_STARTED: 'session.started',
  SESSION_COMPLETED: 'session.completed',
  NOTE_CREATED: 'note.created',
  NOTE_UPDATED: 'note.updated',
  NOTE_SHARED: 'note.shared',

  MEETING_CREATED: 'meeting.created',
  MEETING_CREATION_FAILED: 'meeting.creation_failed',
  CALENDAR_CONNECTED: 'calendar.connected',
  CALENDAR_DISCONNECTED: 'calendar.disconnected',

  REVIEW_SUBMITTED: 'review.submitted',
  REVIEW_MODERATED: 'review.moderated',

  CONTENT_CREATED: 'content.created',
  CONTENT_UPDATED: 'content.updated',
  CONTENT_PUBLISHED: 'content.published',

  ORDER_CREATED: 'order.created',
  ORDER_PAID: 'order.paid',
  ORDER_FULFILLED: 'order.fulfilled',

  SETTINGS_UPDATED: 'settings.updated',
  INTEGRATION_UPDATED: 'integration.updated',
  BRANDING_UPDATED: 'branding.updated',
  DISCOUNT_CREATED: 'discount.created',
  DISCOUNT_UPDATED: 'discount.updated',
  DISCOUNT_WITHDRAWN: 'discount.withdrawn',
  RECORD_DELETED: 'record.deleted',
} as const;

export type AuditAction = (typeof AUDIT_ACTIONS)[keyof typeof AUDIT_ACTIONS];

export interface AuditContext {
  ip?: string | null;
  userAgent?: string | null;
}

export interface AuditInput {
  actorId?: string | null;
  action: AuditAction;
  entity: string;
  entityId?: string | null;
  metadata?: Record<string, unknown> | null;
  context?: AuditContext;
}

export function auditContextFrom(request: FastifyRequest): AuditContext {
  return {
    ip: request.ip ?? null,
    userAgent: request.headers['user-agent']?.slice(0, 320) ?? null,
  };
}

export async function recordAudit(input: AuditInput): Promise<void> {
  try {
    await prisma.auditLog.create({
      data: {
        actorId: input.actorId ?? null,
        action: input.action,
        entity: input.entity,
        entityId: input.entityId ?? null,
        ip: input.context?.ip ?? null,
        userAgent: input.context?.userAgent ?? null,
        metadata: (input.metadata ?? undefined) as never,
      },
    });
  } catch (error) {
    logger.error({ err: error, action: input.action, entity: input.entity }, 'Failed to write audit log');
  }
}

/** Convenience wrapper for routes that already hold the request. */
export async function auditFromRequest(
  request: FastifyRequest,
  input: Omit<AuditInput, 'context' | 'actorId'> & { actorId?: string | null },
): Promise<void> {
  await recordAudit({
    ...input,
    actorId: input.actorId ?? request.currentUser?.id ?? null,
    context: auditContextFrom(request),
  });
}
