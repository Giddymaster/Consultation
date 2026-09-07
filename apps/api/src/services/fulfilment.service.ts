import { prisma } from '../lib/prisma.js';
import { logger } from '../lib/logger.js';
import { env } from '../config/env.js';
import { getVideoProvider, isOfflineProvider, isProviderReady } from './video/index.js';
import { createCalendarEvent } from './calendar/calendar.service.js';
import { AUDIT_ACTIONS, recordAudit } from './audit.service.js';
import { notify } from './notification.service.js';
import type { SettlementResult } from './payments/payment.service.js';
import {
  sendBookingConfirmedEmail,
  sendMeetingFailureAlert,
  sendPaymentSuccessEmail,
  sendResourcePurchaseEmail,
} from './email/messages.js';

/**
 * Everything that happens *after* a payment is confirmed.
 *
 * The ordering is deliberate and matches the platform's meeting rule: the
 * permanent meeting link is created only once payment is settled, never before.
 *
 *   payment settled → booking confirmed → create meeting → create calendar
 *   event → send confirmation → notify staff
 *
 * If meeting creation fails, the booking is **not** presented as complete. The
 * VideoMeeting row is recorded as FAILED with the reason, administrators are
 * emailed and notified, and the client receives a confirmation that carries no
 * join link. A retry can be run later from the admin dashboard without
 * duplicating anything.
 */

export async function onPaymentSettled(result: SettlementResult): Promise<void> {
  if (result.bookingId) await fulfilBooking(result.bookingId, result.paymentId);
  if (result.orderId) await fulfilOrder(result.orderId, result.paymentId);
}

/* -------------------------------------------------------------------------- */
/* Bookings                                                                   */
/* -------------------------------------------------------------------------- */

export async function fulfilBooking(bookingId: string, paymentId?: string): Promise<void> {
  const booking = await prisma.booking.findUnique({
    where: { id: bookingId },
    include: {
      service: { select: { name: true, preparationNotes: true } },
      client: { select: { user: true } },
      consultant: { select: { id: true, title: true, user: true } },
      videoMeeting: true,
    },
  });
  if (!booking) return;

  const clientUser = booking.client.user;
  const consultantUser = booking.consultant.user;

  // 1. Receipt for the payment just taken.
  if (paymentId) {
    const payment = await prisma.payment.findUnique({
      where: { id: paymentId },
      select: { amount: true, currency: true, reference: true, paidAt: true },
    });
    if (payment) {
      await sendPaymentSuccessEmail({
        to: clientUser.email,
        firstName: clientUser.firstName,
        amount: payment.amount,
        currency: payment.currency,
        reference: payment.reference,
        description: `${booking.service.name} — ${booking.reference}`,
        paidAt: payment.paidAt ?? new Date(),
        timezone: booking.timezone,
        relatedEntityId: paymentId,
      });
    }
  }

  // 2. The meeting. Offline formats need no provider call.
  let joinUrl: string | null = null;
  let meetingFailed = false;
  let failureReason: string | null = null;

  if (!isOfflineProvider(booking.meetingProvider)) {
    const outcome = await ensureMeeting(bookingId);
    joinUrl = outcome.joinUrl;
    meetingFailed = !outcome.ok;
    failureReason = outcome.reason;
  }

  // 3. Calendar event on the consultant's connected calendar, if any. A
  //    calendar failure is logged but never blocks the confirmation: the
  //    booking is still valid without a mirrored event.
  try {
    await createCalendarEvent(bookingId);
  } catch (error) {
    logger.warn({ err: error, bookingId }, 'Calendar event creation failed; booking is unaffected');
  }

  // 4. Confirmation to the client. When the meeting failed, this deliberately
  //    carries no join link rather than a fabricated one.
  await sendBookingConfirmedEmail({
    to: clientUser.email,
    firstName: clientUser.firstName,
    reference: booking.reference,
    serviceName: booking.service.name,
    consultantName: `${consultantUser.firstName} ${consultantUser.lastName}`,
    startAt: booking.startAt,
    durationMinutes: booking.durationMinutes,
    timezone: booking.timezone,
    currency: booking.currency,
    total: booking.total,
    amountPaid: booking.amountPaid,
    balance: booking.total - booking.amountPaid,
    meetingProvider: booking.meetingProvider,
    bookingId: booking.id,
    joinUrl,
    preparation: booking.service.preparationNotes,
  });

  // 5. Tell the consultant, and escalate a failed meeting to administrators.
  await notify({
    userId: consultantUser.id,
    type: 'BOOKING_CONFIRMED',
    title: 'New confirmed booking',
    body: `${clientUser.firstName} ${clientUser.lastName} booked ${booking.service.name}.`,
    href: `/consultant/sessions?booking=${booking.id}`,
  });

  if (meetingFailed) {
    await escalateMeetingFailure(bookingId, failureReason ?? 'Unknown error');
  }
}

export interface MeetingOutcome {
  ok: boolean;
  joinUrl: string | null;
  reason: string | null;
}

/**
 * Creates the video meeting for a booking, idempotently.
 *
 * A booking that already has a CREATED meeting returns the existing link, so a
 * replayed webhook or a manual retry never produces a second meeting.
 */
export async function ensureMeeting(bookingId: string): Promise<MeetingOutcome> {
  const booking = await prisma.booking.findUnique({
    where: { id: bookingId },
    include: {
      service: { select: { name: true } },
      client: { select: { user: { select: { email: true, firstName: true, lastName: true } } } },
      consultant: { select: { user: { select: { email: true, firstName: true, lastName: true } } } },
      videoMeeting: true,
    },
  });
  if (!booking) return { ok: false, joinUrl: null, reason: 'Booking not found' };

  if (booking.videoMeeting?.status === 'CREATED' && booking.videoMeeting.joinUrl) {
    return { ok: true, joinUrl: booking.videoMeeting.joinUrl, reason: null };
  }

  if (isOfflineProvider(booking.meetingProvider)) {
    return { ok: true, joinUrl: null, reason: null };
  }

  const provider = getVideoProvider(booking.meetingProvider);

  if (!provider || !isProviderReady(booking.meetingProvider)) {
    const reason = `${booking.meetingProvider} is not connected`;
    await recordMeetingFailure(bookingId, booking.meetingProvider, reason);
    return { ok: false, joinUrl: null, reason };
  }

  const clientUser = booking.client.user;
  const consultantUser = booking.consultant.user;

  try {
    const details = await provider.createMeeting({
      bookingId: booking.id,
      bookingReference: booking.reference,
      topic: `${booking.service.name} — ${clientUser.firstName} ${clientUser.lastName}`,
      agenda: booking.objective ?? undefined,
      startAt: booking.startAt,
      durationMinutes: booking.durationMinutes,
      timezone: booking.timezone,
      hostEmail: consultantUser.email,
      hostName: `${consultantUser.firstName} ${consultantUser.lastName}`,
      attendeeEmail: clientUser.email,
      attendeeName: `${clientUser.firstName} ${clientUser.lastName}`,
    });

    await prisma.videoMeeting.upsert({
      where: { bookingId: booking.id },
      create: {
        bookingId: booking.id,
        provider: details.provider,
        status: 'CREATED',
        externalMeetingId: details.externalMeetingId,
        joinUrl: details.joinUrl,
        hostUrl: details.hostUrl,
        passcode: details.passcode,
        dialInNumber: details.dialInNumber,
        startTime: details.startTime,
        endTime: details.endTime,
        attempts: 1,
        lastAttemptAt: new Date(),
      },
      update: {
        status: 'CREATED',
        externalMeetingId: details.externalMeetingId,
        joinUrl: details.joinUrl,
        hostUrl: details.hostUrl,
        passcode: details.passcode,
        dialInNumber: details.dialInNumber,
        startTime: details.startTime,
        endTime: details.endTime,
        failureReason: null,
        attempts: { increment: 1 },
        lastAttemptAt: new Date(),
      },
    });

    await recordAudit({
      action: AUDIT_ACTIONS.MEETING_CREATED,
      entity: 'Booking',
      entityId: booking.id,
      metadata: { provider: details.provider, externalMeetingId: details.externalMeetingId },
    });

    return { ok: true, joinUrl: details.joinUrl, reason: null };
  } catch (error) {
    const reason = error instanceof Error ? error.message : 'Unknown meeting provider error';
    logger.error({ err: error, bookingId, provider: booking.meetingProvider }, 'Meeting creation failed');
    await recordMeetingFailure(bookingId, booking.meetingProvider, reason);
    return { ok: false, joinUrl: null, reason };
  }
}

async function recordMeetingFailure(
  bookingId: string,
  provider: string,
  reason: string,
): Promise<void> {
  await prisma.videoMeeting.upsert({
    where: { bookingId },
    create: {
      bookingId,
      provider: provider as never,
      status: 'FAILED',
      failureReason: reason.slice(0, 2000),
      attempts: 1,
      lastAttemptAt: new Date(),
    },
    update: {
      status: 'FAILED',
      failureReason: reason.slice(0, 2000),
      attempts: { increment: 1 },
      lastAttemptAt: new Date(),
    },
  });

  await recordAudit({
    action: AUDIT_ACTIONS.MEETING_CREATION_FAILED,
    entity: 'Booking',
    entityId: bookingId,
    metadata: { provider, reason: reason.slice(0, 500) },
  });
}

/**
 * A paid booking with no meeting link is an operational incident, not a
 * silent log line: administrators get an in-app notification and an email.
 */
async function escalateMeetingFailure(bookingId: string, reason: string): Promise<void> {
  const booking = await prisma.booking.findUnique({
    where: { id: bookingId },
    include: {
      client: { select: { user: { select: { firstName: true, lastName: true } } } },
    },
  });
  if (!booking) return;

  const clientName = `${booking.client.user.firstName} ${booking.client.user.lastName}`;

  const admins = await prisma.user.findMany({
    where: {
      isActive: true,
      roles: { some: { role: { name: { in: ['SUPER_ADMIN', 'ADMIN'] } } } },
    },
    select: { id: true, email: true },
    take: 10,
  });

  const setting = await prisma.setting.findUnique({ where: { key: 'notifications.adminEmail' } });
  const escalationEmail = typeof setting?.value === 'string' ? setting.value : env.SUPPORT_EMAIL;

  await sendMeetingFailureAlert({
    to: escalationEmail,
    bookingReference: booking.reference,
    bookingId: booking.id,
    provider: booking.meetingProvider,
    clientName,
    startAt: booking.startAt,
    timezone: booking.timezone,
    failureReason: reason,
  });

  for (const admin of admins) {
    await notify({
      userId: admin.id,
      type: 'INTEGRATION_FAILURE',
      title: 'Meeting link could not be created',
      body: `Booking ${booking.reference} is paid but has no meeting link. ${reason.slice(0, 160)}`,
      href: `/admin/bookings/${booking.id}`,
    });
  }
}

/* -------------------------------------------------------------------------- */
/* Orders                                                                     */
/* -------------------------------------------------------------------------- */

async function fulfilOrder(orderId: string, paymentId?: string): Promise<void> {
  const order = await prisma.order.findUnique({
    where: { id: orderId },
    include: {
      user: { select: { id: true, email: true, firstName: true } },
      items: { include: { product: { select: { type: true, name: true } } } },
    },
  });
  if (!order || order.status !== 'PAID') return;

  await sendResourcePurchaseEmail({
    to: order.user.email,
    firstName: order.user.firstName,
    orderReference: order.reference,
    orderId: order.id,
    items: order.items.map((item) => item.name),
    total: order.total,
    currency: order.currency,
    hasDigital: order.items.some((item) => item.product.type === 'DIGITAL'),
  });

  const admins = await prisma.user.findMany({
    where: { isActive: true, roles: { some: { role: { name: { in: ['SUPER_ADMIN', 'ADMIN'] } } } } },
    select: { id: true },
    take: 5,
  });
  for (const admin of admins) {
    await notify({
      userId: admin.id,
      type: 'NEW_ORDER',
      title: 'New order paid',
      body: `Order ${order.reference} — ${order.items.length} item${order.items.length === 1 ? '' : 's'}.`,
      href: `/admin/orders/${order.id}`,
    });
  }

  await recordAudit({
    actorId: order.user.id,
    action: AUDIT_ACTIONS.ORDER_PAID,
    entity: 'Order',
    entityId: order.id,
    metadata: { paymentId, total: order.total },
  });
}
