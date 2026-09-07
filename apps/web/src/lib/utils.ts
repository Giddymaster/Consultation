import { clsx, type ClassValue } from 'clsx';
import { twMerge } from 'tailwind-merge';
import { DateTime } from 'luxon';
import type { BookingStatus, Currency, PaymentStatus } from '@meridian/types';

/** Tailwind-aware class merge: later utilities win over earlier conflicts. */
export function cn(...inputs: ClassValue[]): string {
  return twMerge(clsx(inputs));
}

/* -------------------------------------------------------------------------- */
/* Formatting                                                                 */
/* -------------------------------------------------------------------------- */

const LOCALE_BY_CURRENCY: Record<string, string> = {
  KES: 'en-KE',
  USD: 'en-US',
  NGN: 'en-NG',
  GHS: 'en-GH',
  ZAR: 'en-ZA',
};

/**
 * Amounts arrive as integer minor units and are formatted for display only.
 * Nothing in the client ever computes a total it then sends back to the server.
 */
export function money(
  minor: number,
  currency: Currency | string = 'KES',
  options: { compact?: boolean; showDecimals?: boolean } = {},
): string {
  const major = minor / 100;
  const fractionDigits = options.showDecimals ?? !Number.isInteger(major) ? 2 : 0;

  return new Intl.NumberFormat(LOCALE_BY_CURRENCY[currency] ?? 'en-US', {
    style: 'currency',
    currency,
    currencyDisplay: 'code',
    notation: options.compact ? 'compact' : 'standard',
    minimumFractionDigits: fractionDigits,
    maximumFractionDigits: fractionDigits,
  })
    .format(major)
    // Intl separates the currency code from the number with a non-breaking
    // space. Written as an escape because a literal one is invisible in review,
    // and a reformat that "tidied" it would silently break every price.
    .replace(/\u00a0/g, ' ');
}

export function formatDate(iso: string | Date, timezone?: string): string {
  return toDateTime(iso, timezone).toFormat('d LLL yyyy');
}

export function formatLongDate(iso: string | Date, timezone?: string): string {
  return toDateTime(iso, timezone).toFormat('cccc, d LLLL yyyy');
}

export function formatTime(iso: string | Date, timezone?: string): string {
  return toDateTime(iso, timezone).toFormat('HH:mm');
}

export function formatDateTime(iso: string | Date, timezone?: string): string {
  const dt = toDateTime(iso, timezone);
  return `${dt.toFormat('d LLL yyyy')} at ${dt.toFormat('HH:mm')}`;
}

/** Includes the zone abbreviation — used wherever a timezone could be ambiguous. */
export function formatDateTimeWithZone(iso: string | Date, timezone?: string): string {
  const dt = toDateTime(iso, timezone);
  return `${dt.toFormat("cccc, d LLLL 'at' HH:mm")} ${dt.toFormat('ZZZZ')}`;
}

export function formatRelative(iso: string | Date, timezone?: string): string {
  return toDateTime(iso, timezone).toRelative() ?? '';
}

function toDateTime(iso: string | Date, timezone?: string): DateTime {
  const dt = typeof iso === 'string' ? DateTime.fromISO(iso) : DateTime.fromJSDate(iso);
  return timezone ? dt.setZone(timezone) : dt;
}

/** The viewer's own IANA timezone, used as the booking default. */
export function browserTimezone(): string {
  try {
    return Intl.DateTimeFormat().resolvedOptions().timeZone || 'Africa/Nairobi';
  } catch {
    return 'Africa/Nairobi';
  }
}

export function formatDuration(minutes: number): string {
  if (minutes < 60) return `${minutes} min`;
  const hours = Math.floor(minutes / 60);
  const rest = minutes % 60;
  if (rest === 0) return `${hours} hour${hours === 1 ? '' : 's'}`;
  return `${hours}h ${rest}m`;
}

export function initials(name: string): string {
  return name
    .split(/\s+/)
    .filter(Boolean)
    .slice(0, 2)
    .map((part) => part.charAt(0).toUpperCase())
    .join('');
}

export function pluralise(count: number, singular: string, plural?: string): string {
  return `${count} ${count === 1 ? singular : (plural ?? `${singular}s`)}`;
}

export function truncate(text: string, max: number): string {
  return text.length <= max ? text : `${text.slice(0, max - 1).trimEnd()}…`;
}

/* -------------------------------------------------------------------------- */
/* Status presentation                                                        */
/* -------------------------------------------------------------------------- */

export type StatusTone = 'neutral' | 'accent' | 'success' | 'warning' | 'destructive' | 'info';

interface StatusPresentation {
  label: string;
  tone: StatusTone;
}

const BOOKING_STATUS_PRESENTATION: Record<BookingStatus, StatusPresentation> = {
  PENDING_PAYMENT: { label: 'Awaiting payment', tone: 'warning' },
  PAYMENT_PROCESSING: { label: 'Processing payment', tone: 'info' },
  CONFIRMED: { label: 'Confirmed', tone: 'success' },
  RESCHEDULED: { label: 'Rescheduled', tone: 'info' },
  IN_PROGRESS: { label: 'In progress', tone: 'accent' },
  COMPLETED: { label: 'Completed', tone: 'neutral' },
  CANCELLED: { label: 'Cancelled', tone: 'destructive' },
  REFUND_PENDING: { label: 'Refund pending', tone: 'warning' },
  REFUNDED: { label: 'Refunded', tone: 'neutral' },
  NO_SHOW: { label: 'No show', tone: 'destructive' },
  EXPIRED: { label: 'Expired', tone: 'neutral' },
};

const PAYMENT_STATUS_PRESENTATION: Record<PaymentStatus, StatusPresentation> = {
  UNPAID: { label: 'Unpaid', tone: 'warning' },
  PROCESSING: { label: 'Processing', tone: 'info' },
  PARTIALLY_PAID: { label: 'Deposit paid', tone: 'info' },
  PAID: { label: 'Paid', tone: 'success' },
  REFUND_PENDING: { label: 'Refund pending', tone: 'warning' },
  PARTIALLY_REFUNDED: { label: 'Partly refunded', tone: 'neutral' },
  REFUNDED: { label: 'Refunded', tone: 'neutral' },
  FAILED: { label: 'Failed', tone: 'destructive' },
  ABANDONED: { label: 'Abandoned', tone: 'neutral' },
};

export function bookingStatus(status: BookingStatus): StatusPresentation {
  return BOOKING_STATUS_PRESENTATION[status] ?? { label: status, tone: 'neutral' };
}

export function paymentStatus(status: PaymentStatus): StatusPresentation {
  return PAYMENT_STATUS_PRESENTATION[status] ?? { label: status, tone: 'neutral' };
}

export function humanise(value: string): string {
  return value
    .replace(/_/g, ' ')
    .toLowerCase()
    .replace(/^\w/, (c) => c.toUpperCase());
}

/* -------------------------------------------------------------------------- */
/* Misc                                                                       */
/* -------------------------------------------------------------------------- */

/** Stable key for idempotent submissions, persisted for the life of the tab. */
export function idempotencyKey(scope: string): string {
  const storageKey = `meridian:idem:${scope}`;
  try {
    const existing = sessionStorage.getItem(storageKey);
    if (existing) return existing;
    const key = `${scope}-${crypto.randomUUID()}`;
    sessionStorage.setItem(storageKey, key);
    return key;
  } catch {
    return `${scope}-${crypto.randomUUID()}`;
  }
}

export function clearIdempotencyKey(scope: string): void {
  try {
    sessionStorage.removeItem(`meridian:idem:${scope}`);
  } catch {
    /* Private-mode browsers throw on sessionStorage; nothing to clean up. */
  }
}
