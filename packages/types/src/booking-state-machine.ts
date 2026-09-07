import { BOOKING_STATUS, type BookingStatus } from './enums.js';

/**
 * Legal booking transitions. The booking service refuses any move not listed
 * here, so an invalid state can never be persisted — including by an admin
 * acting through the dashboard.
 */
export const BOOKING_TRANSITIONS: Readonly<Record<BookingStatus, readonly BookingStatus[]>> = {
  [BOOKING_STATUS.PENDING_PAYMENT]: [
    BOOKING_STATUS.PAYMENT_PROCESSING,
    BOOKING_STATUS.CONFIRMED,
    BOOKING_STATUS.CANCELLED,
    BOOKING_STATUS.EXPIRED,
  ],
  [BOOKING_STATUS.PAYMENT_PROCESSING]: [
    BOOKING_STATUS.CONFIRMED,
    BOOKING_STATUS.PENDING_PAYMENT,
    BOOKING_STATUS.CANCELLED,
    BOOKING_STATUS.EXPIRED,
  ],
  [BOOKING_STATUS.CONFIRMED]: [
    BOOKING_STATUS.RESCHEDULED,
    BOOKING_STATUS.IN_PROGRESS,
    BOOKING_STATUS.CANCELLED,
    BOOKING_STATUS.NO_SHOW,
    BOOKING_STATUS.REFUND_PENDING,
  ],
  [BOOKING_STATUS.RESCHEDULED]: [
    BOOKING_STATUS.CONFIRMED,
    BOOKING_STATUS.IN_PROGRESS,
    BOOKING_STATUS.CANCELLED,
    BOOKING_STATUS.NO_SHOW,
    BOOKING_STATUS.RESCHEDULED,
  ],
  [BOOKING_STATUS.IN_PROGRESS]: [
    BOOKING_STATUS.COMPLETED,
    BOOKING_STATUS.CANCELLED,
    BOOKING_STATUS.NO_SHOW,
  ],
  [BOOKING_STATUS.COMPLETED]: [BOOKING_STATUS.REFUND_PENDING],
  [BOOKING_STATUS.CANCELLED]: [BOOKING_STATUS.REFUND_PENDING],
  [BOOKING_STATUS.NO_SHOW]: [BOOKING_STATUS.REFUND_PENDING, BOOKING_STATUS.COMPLETED],
  [BOOKING_STATUS.REFUND_PENDING]: [BOOKING_STATUS.REFUNDED, BOOKING_STATUS.CONFIRMED],
  [BOOKING_STATUS.REFUNDED]: [],
  [BOOKING_STATUS.EXPIRED]: [],
};

export function canTransition(from: BookingStatus, to: BookingStatus): boolean {
  return (BOOKING_TRANSITIONS[from] ?? []).includes(to);
}

/** Statuses that hold a slot and therefore block other bookings on it. */
export const SLOT_BLOCKING_STATUSES: readonly BookingStatus[] = [
  BOOKING_STATUS.PENDING_PAYMENT,
  BOOKING_STATUS.PAYMENT_PROCESSING,
  BOOKING_STATUS.CONFIRMED,
  BOOKING_STATUS.RESCHEDULED,
  BOOKING_STATUS.IN_PROGRESS,
];

/** Statuses after which no further client action is meaningful. */
export const TERMINAL_STATUSES: readonly BookingStatus[] = [
  BOOKING_STATUS.COMPLETED,
  BOOKING_STATUS.CANCELLED,
  BOOKING_STATUS.REFUNDED,
  BOOKING_STATUS.NO_SHOW,
  BOOKING_STATUS.EXPIRED,
];

export function isTerminal(status: BookingStatus): boolean {
  return TERMINAL_STATUSES.includes(status);
}

export function blocksSlot(status: BookingStatus): boolean {
  return SLOT_BLOCKING_STATUSES.includes(status);
}
