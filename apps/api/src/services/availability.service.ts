import { SLOT_BLOCKING_STATUSES, type AvailabilityResponse, type DayAvailability, type TimeSlot } from '@meridian/types';
import { DateTime } from 'luxon';
import { prisma } from '../lib/prisma.js';
import { badRequest, notFound } from '../lib/errors.js';
import {
  addMinutes,
  eachDateBetween,
  formatLocalTime,
  localWallClockToUtc,
  overlaps,
  subtractIntervals,
} from '../lib/time.js';

/**
 * Server-side availability computation.
 *
 * The client never decides what is bookable. This module is the only source of
 * truth for which instants are offered, and `assertSlotBookable` re-runs the
 * same checks at booking time inside the transaction — so a slot that went
 * stale between page load and submit is caught rather than double-booked.
 *
 * Order of subtraction for each day:
 *   consultant's weekly working blocks
 *     − one-off blackouts
 *     − busy periods mirrored from a connected calendar
 *     − existing bookings that hold a slot (padded by service buffers)
 *   = free intervals, then sliced into the consultant's slot grid.
 */

interface Interval {
  start: Date;
  end: Date;
}

export interface AvailabilityRequest {
  serviceId: string;
  consultantId: string;
  durationMinutes: number;
  from: string;
  to: string;
  timezone: string;
}

/** Hard ceiling on how many days one request may compute. */
const MAX_WINDOW_DAYS = 62;

export async function getAvailability(request: AvailabilityRequest): Promise<AvailabilityResponse> {
  const [service, consultant] = await Promise.all([
    prisma.service.findUnique({
      where: { id: request.serviceId },
      select: {
        id: true,
        status: true,
        leadTimeHours: true,
        bookingHorizonDays: true,
        bufferBeforeMinutes: true,
        bufferAfterMinutes: true,
        durations: { select: { minutes: true } },
        consultants: { select: { consultantId: true } },
      },
    }),
    prisma.consultantProfile.findUnique({
      where: { id: request.consultantId },
      select: {
        id: true,
        timezone: true,
        slotIntervalMinutes: true,
        isAcceptingBookings: true,
        isPublished: true,
        availabilityRules: {
          where: { isActive: true },
          select: { weekday: true, startTime: true, endTime: true },
        },
      },
    }),
  ]);

  if (!service || service.status !== 'PUBLISHED') throw notFound('Service');
  if (!consultant || !consultant.isPublished) throw notFound('Consultant');

  if (!service.consultants.some((c) => c.consultantId === consultant.id)) {
    throw badRequest('That consultant does not offer this service.');
  }
  if (!service.durations.some((d) => d.minutes === request.durationMinutes)) {
    throw badRequest('That duration is not offered for this service.');
  }

  const emptyResponse = (dates: string[]): AvailabilityResponse => ({
    timezone: request.timezone,
    durationMinutes: request.durationMinutes,
    days: dates.map((date) => ({ date, hasAvailability: false, isFullyBooked: false, slots: [] })),
  });

  const dates = eachDateBetween(request.from, request.to, request.timezone, MAX_WINDOW_DAYS);
  if (dates.length === 0) return { timezone: request.timezone, durationMinutes: request.durationMinutes, days: [] };

  // A consultant who has paused bookings shows an empty calendar rather than
  // slots that would be refused at submit.
  if (!consultant.isAcceptingBookings || consultant.availabilityRules.length === 0) {
    return emptyResponse(dates);
  }

  // Bounds of the whole window, used to fetch conflicts in one round trip.
  const windowStart = DateTime.fromISO(dates[0]!, { zone: request.timezone }).startOf('day').toJSDate();
  const windowEnd = DateTime.fromISO(dates[dates.length - 1]!, { zone: request.timezone })
    .endOf('day')
    .toJSDate();

  const [bookings, blackouts, busyBlocks] = await Promise.all([
    prisma.booking.findMany({
      where: {
        consultantId: consultant.id,
        status: { in: [...SLOT_BLOCKING_STATUSES] },
        blockEndAt: { gt: windowStart },
        blockStartAt: { lt: windowEnd },
      },
      select: { blockStartAt: true, blockEndAt: true },
    }),
    prisma.availabilityBlackout.findMany({
      where: { consultantId: consultant.id, endAt: { gt: windowStart }, startAt: { lt: windowEnd } },
      select: { startAt: true, endAt: true },
    }),
    prisma.calendarBusyBlock.findMany({
      where: { consultantId: consultant.id, endAt: { gt: windowStart }, startAt: { lt: windowEnd } },
      select: { startAt: true, endAt: true },
    }),
  ]);

  const busy: Interval[] = [
    ...bookings.map((b) => ({ start: b.blockStartAt, end: b.blockEndAt })),
    ...blackouts.map((b) => ({ start: b.startAt, end: b.endAt })),
    ...busyBlocks.map((b) => ({ start: b.startAt, end: b.endAt })),
  ];

  const now = new Date();
  const earliestBookable = addMinutes(now, service.leadTimeHours * 60);
  const latestBookable = addMinutes(now, service.bookingHorizonDays * 24 * 60);

  const rulesByWeekday = new Map<number, { startTime: string; endTime: string }[]>();
  for (const rule of consultant.availabilityRules) {
    const list = rulesByWeekday.get(rule.weekday) ?? [];
    list.push({ startTime: rule.startTime, endTime: rule.endTime });
    rulesByWeekday.set(rule.weekday, list);
  }

  const slotGrid = consultant.slotIntervalMinutes;
  const totalBlock = service.bufferBeforeMinutes + request.durationMinutes + service.bufferAfterMinutes;

  const days: DayAvailability[] = dates.map((date) => {
    // Weekday is computed in the *consultant's* zone: their Tuesday, not the
    // client's, is what their working hours describe.
    const weekday = DateTime.fromISO(date, { zone: consultant.timezone }).weekday % 7;
    const rules = rulesByWeekday.get(weekday) ?? [];

    if (rules.length === 0) {
      return { date, hasAvailability: false, isFullyBooked: false, slots: [] };
    }

    // Working blocks as instants, resolved against the consultant's timezone so
    // a DST transition shifts the UTC instant rather than the local hour.
    const workingIntervals: Interval[] = [];
    for (const rule of rules) {
      const start = localWallClockToUtc(date, rule.startTime, consultant.timezone);
      const end = localWallClockToUtc(date, rule.endTime, consultant.timezone);
      if (start && end && end > start) workingIntervals.push({ start, end });
    }

    if (workingIntervals.length === 0) {
      return { date, hasAvailability: false, isFullyBooked: false, slots: [] };
    }

    const free = workingIntervals.flatMap((interval) =>
      subtractIntervals(interval, busy.filter((b) => overlaps(interval.start, interval.end, b.start, b.end))),
    );

    const slots: TimeSlot[] = [];
    for (const interval of free) {
      // Align the first candidate to the slot grid so times read as 09:00,
      // 09:30 rather than 09:07 after a preceding session's buffer.
      let cursor = alignToGrid(interval.start, consultant.timezone, slotGrid);

      while (true) {
        const sessionStart = addMinutes(cursor, service.bufferBeforeMinutes);
        const sessionEnd = addMinutes(sessionStart, request.durationMinutes);
        const blockEnd = addMinutes(cursor, totalBlock);
        if (blockEnd > interval.end) break;

        if (sessionStart >= earliestBookable && sessionStart <= latestBookable) {
          slots.push({
            startAt: sessionStart.toISOString(),
            endAt: sessionEnd.toISOString(),
            label: formatLocalTime(sessionStart, request.timezone),
            available: true,
          });
        }

        cursor = addMinutes(cursor, slotGrid);
      }
    }

    // A day the consultant works but where nothing survived subtraction is
    // "fully booked" — visually distinct from a non-working day.
    const worksToday = workingIntervals.length > 0;
    const withinHorizon =
      DateTime.fromISO(date, { zone: request.timezone }).endOf('day').toJSDate() >= earliestBookable;

    return {
      date,
      hasAvailability: slots.length > 0,
      isFullyBooked: worksToday && slots.length === 0 && withinHorizon,
      slots,
    };
  });

  return { timezone: request.timezone, durationMinutes: request.durationMinutes, days };
}

function alignToGrid(instant: Date, zone: string, gridMinutes: number): Date {
  const dt = DateTime.fromJSDate(instant, { zone });
  const minutesIntoDay = dt.hour * 60 + dt.minute;
  const remainder = minutesIntoDay % gridMinutes;
  if (remainder === 0 && dt.second === 0 && dt.millisecond === 0) return instant;
  return dt
    .plus({ minutes: gridMinutes - remainder })
    .set({ second: 0, millisecond: 0 })
    .toJSDate();
}

/* -------------------------------------------------------------------------- */
/* Booking-time validation                                                    */
/* -------------------------------------------------------------------------- */

export interface SlotCheckInput {
  consultantId: string;
  serviceId: string;
  startAt: Date;
  durationMinutes: number;
  /** Excluded from the conflict scan, so rescheduling does not collide with itself. */
  excludeBookingId?: string;
}

export interface SlotCheckResult {
  ok: boolean;
  reason?: 'OUTSIDE_WORKING_HOURS' | 'CONFLICT' | 'TOO_SOON' | 'TOO_FAR' | 'IN_PAST' | 'NOT_ACCEPTING';
  blockStartAt: Date;
  blockEndAt: Date;
}

/**
 * Re-validates a slot at write time. Called inside the booking transaction:
 * availability shown in the browser is a snapshot, and the authoritative answer
 * is the one computed here against current rows.
 */
export async function checkSlot(input: SlotCheckInput, client = prisma): Promise<SlotCheckResult> {
  const [service, consultant] = await Promise.all([
    client.service.findUniqueOrThrow({
      where: { id: input.serviceId },
      select: {
        leadTimeHours: true,
        bookingHorizonDays: true,
        bufferBeforeMinutes: true,
        bufferAfterMinutes: true,
      },
    }),
    client.consultantProfile.findUniqueOrThrow({
      where: { id: input.consultantId },
      select: {
        timezone: true,
        isAcceptingBookings: true,
        availabilityRules: {
          where: { isActive: true },
          select: { weekday: true, startTime: true, endTime: true },
        },
      },
    }),
  ]);

  const endAt = addMinutes(input.startAt, input.durationMinutes);
  const blockStartAt = addMinutes(input.startAt, -service.bufferBeforeMinutes);
  const blockEndAt = addMinutes(endAt, service.bufferAfterMinutes);
  const result = (ok: boolean, reason?: SlotCheckResult['reason']): SlotCheckResult => ({
    ok,
    reason,
    blockStartAt,
    blockEndAt,
  });

  const now = new Date();
  if (input.startAt <= now) return result(false, 'IN_PAST');
  if (!consultant.isAcceptingBookings) return result(false, 'NOT_ACCEPTING');
  if (input.startAt < addMinutes(now, service.leadTimeHours * 60)) return result(false, 'TOO_SOON');
  if (input.startAt > addMinutes(now, service.bookingHorizonDays * 24 * 60)) return result(false, 'TOO_FAR');

  // The session must sit entirely inside one working block on the consultant's
  // local calendar date.
  const localDate = DateTime.fromJSDate(input.startAt, { zone: consultant.timezone }).toISODate();
  if (!localDate) return result(false, 'OUTSIDE_WORKING_HOURS');
  const weekday = DateTime.fromJSDate(input.startAt, { zone: consultant.timezone }).weekday % 7;

  const fits = consultant.availabilityRules
    .filter((rule) => rule.weekday === weekday)
    .some((rule) => {
      const blockStart = localWallClockToUtc(localDate, rule.startTime, consultant.timezone);
      const blockEnd = localWallClockToUtc(localDate, rule.endTime, consultant.timezone);
      if (!blockStart || !blockEnd) return false;
      return blockStartAt >= blockStart && blockEndAt <= blockEnd;
    });

  if (!fits) return result(false, 'OUTSIDE_WORKING_HOURS');

  const [conflictingBooking, blackout, busy] = await Promise.all([
    client.booking.findFirst({
      where: {
        consultantId: input.consultantId,
        status: { in: [...SLOT_BLOCKING_STATUSES] },
        blockStartAt: { lt: blockEndAt },
        blockEndAt: { gt: blockStartAt },
        ...(input.excludeBookingId ? { id: { not: input.excludeBookingId } } : {}),
      },
      select: { id: true },
    }),
    client.availabilityBlackout.findFirst({
      where: {
        consultantId: input.consultantId,
        startAt: { lt: blockEndAt },
        endAt: { gt: blockStartAt },
      },
      select: { id: true },
    }),
    client.calendarBusyBlock.findFirst({
      where: {
        consultantId: input.consultantId,
        startAt: { lt: blockEndAt },
        endAt: { gt: blockStartAt },
      },
      select: { id: true },
    }),
  ]);

  if (conflictingBooking || blackout || busy) return result(false, 'CONFLICT');

  return result(true);
}

/** Next bookable slot for a consultant, used for "next available" hints. */
export async function nextAvailableSlot(
  consultantId: string,
  serviceId: string,
  durationMinutes: number,
  timezone: string,
): Promise<string | null> {
  const from = DateTime.now().setZone(timezone).toISODate();
  const to = DateTime.now().setZone(timezone).plus({ days: 30 }).toISODate();
  if (!from || !to) return null;

  const availability = await getAvailability({
    serviceId,
    consultantId,
    durationMinutes,
    from,
    to,
    timezone,
  });

  for (const day of availability.days) {
    const slot = day.slots.find((s) => s.available);
    if (slot) return slot.startAt;
  }
  return null;
}
