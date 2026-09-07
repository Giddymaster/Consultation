import { DateTime, Interval } from 'luxon';

/**
 * Timezone handling rules for the whole platform:
 *
 *   • Every instant is stored and compared in UTC.
 *   • A consultant's working hours are wall-clock times in *their* timezone,
 *     so 09:00–17:00 stays 09:00–17:00 across a DST boundary.
 *   • A client sees times in the timezone they booked in.
 *
 * Everything below exists so no route has to reason about offsets by hand.
 */

export function nowUtc(): Date {
  return new Date();
}

export function isValidTimezone(tz: string): boolean {
  return DateTime.local().setZone(tz).isValid;
}

/**
 * Turns a local wall-clock time on a given calendar date into a UTC instant.
 * `date` is `YYYY-MM-DD`, `time` is `HH:MM`, both interpreted in `zone`.
 *
 * Returns null for times that do not exist — the hour skipped by a spring-
 * forward transition — so callers drop the slot rather than silently shifting it.
 */
export function localWallClockToUtc(date: string, time: string, zone: string): Date | null {
  const [hourRaw, minuteRaw] = time.split(':');
  const hour = Number(hourRaw);
  const minute = Number(minuteRaw);
  if (!Number.isInteger(hour) || !Number.isInteger(minute)) return null;

  const dt = DateTime.fromISO(date, { zone }).set({ hour, minute, second: 0, millisecond: 0 });
  if (!dt.isValid) return null;
  // Luxon maps a non-existent local time forward; detect that and reject it.
  if (dt.hour !== hour || dt.minute !== minute) return null;
  return dt.toJSDate();
}

/** Calendar date (`YYYY-MM-DD`) that a UTC instant falls on, in `zone`. */
export function utcToLocalDate(instant: Date, zone: string): string {
  return DateTime.fromJSDate(instant, { zone }).toISODate() ?? '';
}

/** `09:30` in `zone`. */
export function formatLocalTime(instant: Date, zone: string, locale = 'en-GB'): string {
  return DateTime.fromJSDate(instant, { zone }).setLocale(locale).toFormat('HH:mm');
}

/** `Tuesday, 14 October 2026 at 09:30 EAT` — the format used in emails. */
export function formatFullDateTime(instant: Date, zone: string, locale = 'en-GB'): string {
  const dt = DateTime.fromJSDate(instant, { zone }).setLocale(locale);
  return `${dt.toFormat("cccc, d LLLL yyyy 'at' HH:mm")} ${dt.toFormat('ZZZZ')}`;
}

export function weekdayInZone(instant: Date, zone: string): number {
  // Luxon: 1 = Monday … 7 = Sunday. We use 0 = Sunday … 6 = Saturday.
  return DateTime.fromJSDate(instant, { zone }).weekday % 7;
}

/** Inclusive list of `YYYY-MM-DD` dates between two calendar dates in `zone`. */
export function eachDateBetween(from: string, to: string, zone: string, maxDays = 62): string[] {
  const start = DateTime.fromISO(from, { zone }).startOf('day');
  const end = DateTime.fromISO(to, { zone }).startOf('day');
  if (!start.isValid || !end.isValid || end < start) return [];

  const dates: string[] = [];
  let cursor = start;
  while (cursor <= end && dates.length < maxDays) {
    const iso = cursor.toISODate();
    if (iso) dates.push(iso);
    cursor = cursor.plus({ days: 1 });
  }
  return dates;
}

export function addMinutes(instant: Date, minutes: number): Date {
  return new Date(instant.getTime() + minutes * 60_000);
}

export function addHours(instant: Date, hours: number): Date {
  return addMinutes(instant, hours * 60);
}

export function addDays(instant: Date, days: number): Date {
  return addMinutes(instant, days * 24 * 60);
}

export function differenceInHours(later: Date, earlier: Date): number {
  return (later.getTime() - earlier.getTime()) / 3_600_000;
}

export function differenceInMinutes(later: Date, earlier: Date): number {
  return (later.getTime() - earlier.getTime()) / 60_000;
}

/** True when [aStart, aEnd) and [bStart, bEnd) share any time at all. */
export function overlaps(aStart: Date, aEnd: Date, bStart: Date, bEnd: Date): boolean {
  return aStart < bEnd && bStart < aEnd;
}

export function toInterval(start: Date, end: Date): Interval {
  return Interval.fromDateTimes(DateTime.fromJSDate(start), DateTime.fromJSDate(end));
}

/**
 * Subtracts busy intervals from a free interval, returning what remains.
 * Used to carve calendar busy blocks and existing bookings out of a working day.
 */
export function subtractIntervals(
  free: { start: Date; end: Date },
  busy: { start: Date; end: Date }[],
): { start: Date; end: Date }[] {
  let remaining = [free];

  for (const block of busy) {
    const next: { start: Date; end: Date }[] = [];
    for (const segment of remaining) {
      if (!overlaps(segment.start, segment.end, block.start, block.end)) {
        next.push(segment);
        continue;
      }
      if (block.start > segment.start) next.push({ start: segment.start, end: block.start });
      if (block.end < segment.end) next.push({ start: block.end, end: segment.end });
    }
    remaining = next;
    if (remaining.length === 0) break;
  }

  return remaining;
}

/** Start of the current month in `zone`, as a UTC instant. */
export function startOfMonth(zone: string, offsetMonths = 0): Date {
  return DateTime.now().setZone(zone).startOf('month').plus({ months: offsetMonths }).toJSDate();
}

export function startOfDay(instant: Date, zone: string): Date {
  return DateTime.fromJSDate(instant, { zone }).startOf('day').toJSDate();
}

/** Buckets for analytics time series. */
export function bucketDates(
  from: Date,
  to: Date,
  granularity: 'day' | 'week' | 'month',
  zone: string,
): string[] {
  const buckets: string[] = [];
  let cursor = DateTime.fromJSDate(from, { zone }).startOf(granularity);
  const end = DateTime.fromJSDate(to, { zone }).endOf(granularity);
  while (cursor <= end && buckets.length < 400) {
    const iso = cursor.toISODate();
    if (iso) buckets.push(iso);
    cursor = cursor.plus({ [`${granularity}s`]: 1 });
  }
  return buckets;
}

export function bucketKeyFor(instant: Date, granularity: 'day' | 'week' | 'month', zone: string): string {
  return DateTime.fromJSDate(instant, { zone }).startOf(granularity).toISODate() ?? '';
}
