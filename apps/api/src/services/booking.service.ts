import {
  BOOKING_STATUS,
  canTransition,
  ERROR_CODES,
  type BookingStatus,
  type CreateBookingInput,
  type MeetingProvider,
  type PriceBreakdown,
} from '@meridian/types';
import { prisma, type Tx } from '../lib/prisma.js';
import {
  AppError,
  badRequest,
  bookingConflict,
  invalidTransition,
  notFound,
  slotUnavailable,
} from '../lib/errors.js';
import { generateReference } from '../lib/crypto.js';
import { addMinutes, differenceInHours } from '../lib/time.js';
import { calculateBookingPrice } from './pricing.service.js';
import { quoteDiscount, redeemDiscount, type DiscountQuote } from './discount.service.js';
import { checkSlot } from './availability.service.js';
import { logger } from '../lib/logger.js';

/**
 * Booking lifecycle.
 *
 * Two invariants this module exists to hold:
 *
 *   1. **No double-booking.** Slot validation and insertion happen inside one
 *      serializable transaction, so two clients racing for the same time cannot
 *      both succeed — the loser gets BOOKING_CONFLICT, not a silent overlap.
 *
 *   2. **No client-supplied money.** Pricing is recomputed here from the
 *      service and duration rows. `CreateBookingInput` carries no amount field
 *      and none would be read if it did.
 */

/** How long an unpaid booking holds its slot before the sweeper expires it. */
const DEFAULT_HOLD_MINUTES = 45;

/**
 * Postgres raises a serialization failure when two Serializable transactions
 * cannot be ordered. That is the mechanism protecting us from double-booking,
 * but it is not by itself proof the two requests wanted the *same* slot —
 * transactions touching neighbouring index pages can collide too.
 *
 * So a serialization failure is retried a few times with jitter. Only if the
 * conflict persists do we look at what is actually in the way and report it.
 */
const SERIALIZATION_RETRIES = 4;

function isSerializationFailure(error: unknown): boolean {
  if (typeof error !== 'object' || error === null) return false;
  const code = (error as { code?: unknown }).code;
  // P2034 is Prisma's wrapper; 40001/40P01 are Postgres serialization failure
  // and deadlock detected, which can surface directly through the adapter.
  return code === 'P2034' || code === '40001' || code === '40P01';
}

async function withSerializableRetry<T>(work: () => Promise<T>, onExhausted: () => Promise<never>): Promise<T> {
  let lastError: unknown;

  for (let attempt = 0; attempt <= SERIALIZATION_RETRIES; attempt += 1) {
    try {
      return await work();
    } catch (error) {
      if (!isSerializationFailure(error)) throw error;
      lastError = error;
      // Full jitter: without it, retries re-collide in lockstep.
      const backoffMs = Math.round(Math.random() * 25 * 2 ** attempt);
      await new Promise((resolve) => setTimeout(resolve, backoffMs));
    }
  }

  logger.warn({ err: lastError }, 'Booking transaction exhausted serialization retries');
  return onExhausted();
}

async function holdMinutes(): Promise<number> {
  const setting = await prisma.setting.findUnique({ where: { key: 'booking.holdMinutes' } });
  const value = typeof setting?.value === 'number' ? setting.value : DEFAULT_HOLD_MINUTES;
  return Math.min(Math.max(value, 5), 24 * 60);
}

export interface CreateBookingArgs {
  input: CreateBookingInput;
  /** ClientProfile.id of whoever the booking is for. */
  clientId: string;
  actorId: string | null;
}

export interface CreateBookingResult {
  bookingId: string;
  reference: string;
  pricing: PriceBreakdown;
  status: BookingStatus;
  requiresPayment: boolean;
}

export async function createBooking(args: CreateBookingArgs): Promise<CreateBookingResult> {
  const { input, clientId } = args;

  // Replaying the same wizard submission returns the original booking rather
  // than creating a second one.
  if (input.idempotencyKey) {
    const existing = await prisma.booking.findUnique({
      where: { idempotencyKey: input.idempotencyKey },
      select: {
        id: true,
        reference: true,
        status: true,
        currency: true,
        subtotal: true,
        discount: true,
        tax: true,
        taxRateBps: true,
        total: true,
        amountDueNow: true,
        clientId: true,
      },
    });
    if (existing) {
      // An idempotency key is scoped to its author; reusing someone else's is
      // rejected rather than leaking their booking.
      if (existing.clientId !== clientId) throw badRequest('That request could not be processed.');
      return {
        bookingId: existing.id,
        reference: existing.reference,
        status: existing.status,
        requiresPayment: existing.amountDueNow > 0,
        pricing: {
          currency: existing.currency,
          subtotal: existing.subtotal,
          discount: existing.discount,
          tax: existing.tax,
          taxRateBps: existing.taxRateBps,
          total: existing.total,
          amountDueNow: existing.amountDueNow,
          balance: existing.total - existing.amountDueNow,
          requiresDeposit: existing.amountDueNow < existing.total,
        },
      };
    }
  }

  const service = await prisma.service.findUnique({
    where: { id: input.serviceId },
    select: {
      id: true,
      name: true,
      status: true,
      currency: true,
      paymentModel: true,
      depositAmount: true,
      depositPercentBps: true,
      taxRateBps: true,
      meetingProviders: true,
      bufferBeforeMinutes: true,
      bufferAfterMinutes: true,
      durations: { select: { minutes: true, price: true } },
      consultants: { select: { consultantId: true } },
    },
  });

  if (!service || service.status !== 'PUBLISHED') throw notFound('Service');

  if (!service.consultants.some((c) => c.consultantId === input.consultantId)) {
    throw badRequest('That consultant does not offer this service.');
  }
  if (!service.meetingProviders.includes(input.meetingProvider)) {
    throw badRequest('That meeting option is not available for this service.');
  }

  const duration = service.durations.find((d) => d.minutes === input.durationMinutes);
  if (!duration) throw badRequest('That duration is not offered for this service.');

  // A discount code is the only thing the client contributes to the price, and
  // it contributes a *code*, never an amount. `quoteDiscount` throws with a
  // readable reason if the code does not apply; it never consumes a redemption.
  let discountQuote: DiscountQuote | null = null;
  if (input.discountCode?.trim()) {
    const profile = await prisma.clientProfile.findUnique({
      where: { id: clientId },
      select: { userId: true },
    });

    discountQuote = await quoteDiscount({
      code: input.discountCode,
      userId: profile?.userId ?? null,
      currency: service.currency,
      subtotal: duration.price,
      scope: 'SERVICES',
      serviceId: service.id,
    });
  }

  // Authoritative pricing. Whatever the browser displayed is irrelevant here.
  const pricing = calculateBookingPrice({
    service: {
      currency: service.currency,
      paymentModel: service.paymentModel,
      depositAmount: service.depositAmount,
      depositPercentBps: service.depositPercentBps,
      taxRateBps: service.taxRateBps,
    },
    durationPrice: duration.price,
    discount: discountQuote?.amount ?? 0,
  });

  const startAt = new Date(input.startAt);
  if (Number.isNaN(startAt.getTime())) throw badRequest('That start time could not be understood.');

  const endAt = addMinutes(startAt, input.durationMinutes);
  const hold = await holdMinutes();

  const booking = await withSerializableRetry(
    () =>
      prisma.$transaction(
    async (tx) => {
      const slot = await checkSlot(
        {
          consultantId: input.consultantId,
          serviceId: service.id,
          startAt,
          durationMinutes: input.durationMinutes,
        },
        tx as unknown as typeof prisma,
      );

      if (!slot.ok) throw slotErrorFor(slot.reason);

      const created = await tx.booking.create({
        data: {
          reference: generateReference('MRD'),
          clientId,
          consultantId: input.consultantId,
          serviceId: service.id,
          status: BOOKING_STATUS.PENDING_PAYMENT,
          paymentStatus: 'UNPAID',
          startAt,
          endAt,
          durationMinutes: input.durationMinutes,
          timezone: input.timezone,
          blockStartAt: slot.blockStartAt,
          blockEndAt: slot.blockEndAt,
          currency: pricing.currency,
          subtotal: pricing.subtotal,
          discount: pricing.discount,
          taxRateBps: pricing.taxRateBps,
          tax: pricing.tax,
          total: pricing.total,
          amountDueNow: pricing.amountDueNow,
          amountPaid: 0,
          discountCode: discountQuote?.code ?? null,
          meetingProvider: input.meetingProvider,
          objective: input.objective ?? null,
          notes: input.notes ?? null,
          holdExpiresAt: pricing.amountDueNow > 0 ? addMinutes(new Date(), hold) : null,
          idempotencyKey: input.idempotencyKey ?? null,
        },
        select: { id: true, reference: true, status: true },
      });

      // Claimed inside the same transaction as the booking. Losing the race for
      // the last redemption rolls the whole booking back rather than quietly
      // charging the undiscounted price.
      if (discountQuote) {
        const claimed = await redeemDiscount(tx, {
          discountId: discountQuote.discountId,
          userId: (await tx.clientProfile.findUnique({
            where: { id: clientId },
            select: { userId: true },
          }))?.userId ?? null,
          bookingId: created.id,
          amount: discountQuote.amount,
          currency: pricing.currency,
        });

        if (!claimed) {
          throw badRequest('That discount code was fully redeemed while you were booking.');
        }
      }

      await tx.bookingStatusEvent.create({
        data: {
          bookingId: created.id,
          fromStatus: null,
          toStatus: BOOKING_STATUS.PENDING_PAYMENT,
          reason: 'Booking created',
          actorId: args.actorId,
        },
      });

      return created;
    },
    {
      // Serializable is the level that actually prevents two concurrent
      // transactions from each seeing "no conflict" and both inserting.
      isolationLevel: 'Serializable',
      timeout: 15_000,
    },
      ),
    async () => {
      // Retries exhausted. Ask what is actually occupying the slot now, so the
      // caller gets a truthful reason rather than a generic database error.
      const slot = await checkSlot({
        consultantId: input.consultantId,
        serviceId: service.id,
        startAt,
        durationMinutes: input.durationMinutes,
      });
      throw slot.ok
        ? bookingConflict('That booking could not be completed just now. Please try again.')
        : slotErrorFor(slot.reason);
    },
  );

  return {
    bookingId: booking.id,
    reference: booking.reference,
    status: booking.status,
    pricing,
    requiresPayment: pricing.amountDueNow > 0,
  };
}

function slotErrorFor(reason: string | undefined): AppError {
  switch (reason) {
    case 'CONFLICT':
      return bookingConflict('The selected time is no longer available.');
    case 'IN_PAST':
      return new AppError(ERROR_CODES.BOOKING_IN_PAST, 'That time has already passed.', 400);
    case 'TOO_SOON':
      return slotUnavailable('That time is too soon — this service needs more notice.');
    case 'TOO_FAR':
      return slotUnavailable('That time is beyond how far ahead this service can be booked.');
    case 'NOT_ACCEPTING':
      return slotUnavailable('This consultant is not currently accepting bookings.');
    default:
      return slotUnavailable();
  }
}

/* -------------------------------------------------------------------------- */
/* State transitions                                                          */
/* -------------------------------------------------------------------------- */

export interface TransitionArgs {
  bookingId: string;
  to: BookingStatus;
  reason?: string;
  actorId?: string | null;
  /** Optional transaction handle so a transition can join a larger unit of work. */
  tx?: Tx;
}

/**
 * The only way a booking's status changes. Illegal moves throw rather than
 * being written, which is what keeps the state machine meaningful — an admin
 * clicking the wrong button in the dashboard hits the same wall as a bug.
 */
export async function transitionBooking(args: TransitionArgs): Promise<BookingStatus> {
  const client = (args.tx ?? prisma) as typeof prisma;

  const booking = await client.booking.findUnique({
    where: { id: args.bookingId },
    select: { id: true, status: true },
  });
  if (!booking) throw notFound('Booking');

  if (booking.status === args.to) return booking.status;
  if (!canTransition(booking.status, args.to)) throw invalidTransition(booking.status, args.to);

  await client.booking.update({
    where: { id: args.bookingId },
    data: {
      status: args.to,
      ...(args.to === BOOKING_STATUS.CONFIRMED ? { confirmedAt: new Date(), holdExpiresAt: null } : {}),
      ...(args.to === BOOKING_STATUS.CANCELLED
        ? { cancelledAt: new Date(), cancellationReason: args.reason ?? null }
        : {}),
    },
  });

  await client.bookingStatusEvent.create({
    data: {
      bookingId: args.bookingId,
      fromStatus: booking.status,
      toStatus: args.to,
      reason: args.reason ?? null,
      actorId: args.actorId ?? null,
    },
  });

  logger.info({ bookingId: args.bookingId, from: booking.status, to: args.to }, 'Booking status changed');
  return args.to;
}

/* -------------------------------------------------------------------------- */
/* Reschedule and cancel                                                      */
/* -------------------------------------------------------------------------- */

export interface RescheduleArgs {
  bookingId: string;
  startAt: Date;
  timezone: string;
  consultantId?: string;
  reason?: string;
  actorId: string | null;
  /** Staff may move a booking outside the client-facing reschedule window. */
  bypassWindow?: boolean;
}

export async function rescheduleBooking(args: RescheduleArgs): Promise<{ previousStartAt: Date; startAt: Date }> {
  const booking = await prisma.booking.findUnique({
    where: { id: args.bookingId },
    select: {
      id: true,
      status: true,
      startAt: true,
      consultantId: true,
      serviceId: true,
      durationMinutes: true,
      rescheduleCount: true,
      service: { select: { rescheduleWindowHours: true } },
    },
  });
  if (!booking) throw notFound('Booking');

  const reschedulable: BookingStatus[] = [BOOKING_STATUS.CONFIRMED, BOOKING_STATUS.RESCHEDULED];
  if (!reschedulable.includes(booking.status)) {
    throw invalidTransition(booking.status, BOOKING_STATUS.RESCHEDULED);
  }

  if (!args.bypassWindow) {
    const hoursUntil = differenceInHours(booking.startAt, new Date());
    if (hoursUntil < booking.service.rescheduleWindowHours) {
      throw new AppError(
        ERROR_CODES.OUTSIDE_RESCHEDULE_WINDOW,
        `This booking can no longer be rescheduled online — it starts in under ${booking.service.rescheduleWindowHours} hours. Contact us and we will help.`,
        409,
      );
    }
  }

  const consultantId = args.consultantId ?? booking.consultantId;
  const previousStartAt = booking.startAt;

  await withSerializableRetry(
    () =>
      prisma.$transaction(
    async (tx) => {
      const slot = await checkSlot(
        {
          consultantId,
          serviceId: booking.serviceId,
          startAt: args.startAt,
          durationMinutes: booking.durationMinutes,
          excludeBookingId: booking.id,
        },
        tx as unknown as typeof prisma,
      );
      if (!slot.ok) throw slotErrorFor(slot.reason);

      await tx.booking.update({
        where: { id: booking.id },
        data: {
          consultantId,
          startAt: args.startAt,
          endAt: addMinutes(args.startAt, booking.durationMinutes),
          blockStartAt: slot.blockStartAt,
          blockEndAt: slot.blockEndAt,
          timezone: args.timezone,
          status: BOOKING_STATUS.RESCHEDULED,
          rescheduleCount: { increment: 1 },
        },
      });

      await tx.bookingStatusEvent.create({
        data: {
          bookingId: booking.id,
          fromStatus: booking.status,
          toStatus: BOOKING_STATUS.RESCHEDULED,
          reason: args.reason ?? 'Rescheduled',
          actorId: args.actorId,
        },
      });
    },
    { isolationLevel: 'Serializable', timeout: 15_000 },
      ),
    async () => {
      const slot = await checkSlot({
        consultantId,
        serviceId: booking.serviceId,
        startAt: args.startAt,
        durationMinutes: booking.durationMinutes,
        excludeBookingId: booking.id,
      });
      throw slot.ok
        ? bookingConflict('That reschedule could not be completed just now. Please try again.')
        : slotErrorFor(slot.reason);
    },
  );

  return { previousStartAt, startAt: args.startAt };
}

export interface CancelArgs {
  bookingId: string;
  reason?: string;
  actorId: string | null;
  bypassWindow?: boolean;
}

export async function cancelBooking(args: CancelArgs): Promise<void> {
  const booking = await prisma.booking.findUnique({
    where: { id: args.bookingId },
    select: {
      id: true,
      status: true,
      startAt: true,
      service: { select: { cancellationWindowHours: true } },
    },
  });
  if (!booking) throw notFound('Booking');

  if (!args.bypassWindow) {
    const hoursUntil = differenceInHours(booking.startAt, new Date());
    if (hoursUntil < booking.service.cancellationWindowHours && hoursUntil > 0) {
      throw new AppError(
        ERROR_CODES.OUTSIDE_CANCELLATION_WINDOW,
        `This booking can no longer be cancelled online — it starts in under ${booking.service.cancellationWindowHours} hours. Contact us to discuss options.`,
        409,
      );
    }
  }

  await transitionBooking({
    bookingId: booking.id,
    to: BOOKING_STATUS.CANCELLED,
    reason: args.reason,
    actorId: args.actorId,
  });
}

/* -------------------------------------------------------------------------- */
/* Derived permissions on a booking                                           */
/* -------------------------------------------------------------------------- */

export interface BookingCapabilities {
  canCancel: boolean;
  canReschedule: boolean;
  canPayBalance: boolean;
}

export function bookingCapabilities(booking: {
  status: BookingStatus;
  startAt: Date;
  total: number;
  amountPaid: number;
  service: { cancellationWindowHours: number; rescheduleWindowHours: number };
}): BookingCapabilities {
  const hoursUntil = differenceInHours(booking.startAt, new Date());
  const active =
    booking.status === BOOKING_STATUS.CONFIRMED || booking.status === BOOKING_STATUS.RESCHEDULED;

  return {
    canCancel: active && hoursUntil >= booking.service.cancellationWindowHours,
    canReschedule: active && hoursUntil >= booking.service.rescheduleWindowHours,
    canPayBalance: active && booking.amountPaid < booking.total,
  };
}

/**
 * Releases slots held by unpaid bookings whose hold has lapsed. Run by the
 * scheduler; idempotent, so a duplicate run expires nothing twice.
 */
export async function expireStaleHolds(): Promise<number> {
  const stale = await prisma.booking.findMany({
    where: {
      status: { in: [BOOKING_STATUS.PENDING_PAYMENT, BOOKING_STATUS.PAYMENT_PROCESSING] },
      holdExpiresAt: { lt: new Date() },
    },
    select: { id: true },
    take: 200,
  });

  let expired = 0;
  for (const booking of stale) {
    try {
      await transitionBooking({
        bookingId: booking.id,
        to: BOOKING_STATUS.EXPIRED,
        reason: 'Payment hold lapsed',
      });
      expired += 1;
    } catch (error) {
      logger.warn({ err: error, bookingId: booking.id }, 'Could not expire stale booking hold');
    }
  }
  return expired;
}

/** Meeting providers a service permits, for the wizard's provider step. */
export function allowedProviders(service: { meetingProviders: MeetingProvider[] }): MeetingProvider[] {
  return service.meetingProviders;
}
