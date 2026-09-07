import { z } from 'zod';
import { MEETING_PROVIDER_VALUES, BOOKING_STATUS_VALUES, PAYMENT_STATUS_VALUES } from '../enums.js';
import { emailSchema, idSchema, isoDateSchema, isoDateTimeSchema, paginationSchema, timezoneSchema } from './common.js';

/**
 * Availability query. Note the absence of any price or slot list from the
 * client — the server computes both from the service, the consultant's working
 * hours, connected-calendar busy periods and existing bookings.
 */
export const availabilityQuerySchema = z.object({
  serviceId: idSchema,
  consultantId: idSchema,
  durationMinutes: z.coerce.number().int().min(5).max(600),
  /** Inclusive start of the window, as a calendar date in `timezone`. */
  from: isoDateSchema,
  /** Inclusive end of the window. Capped server-side to 62 days. */
  to: isoDateSchema,
  timezone: timezoneSchema,
});
export type AvailabilityQuery = z.infer<typeof availabilityQuerySchema>;

export const clientDetailsSchema = z.object({
  firstName: z.string().trim().min(1, 'Required').max(80),
  lastName: z.string().trim().min(1, 'Required').max(80),
  email: emailSchema,
  phone: z.string().trim().min(7, 'Enter a reachable phone number').max(32),
  company: z.string().trim().max(160).optional(),
  jobTitle: z.string().trim().max(160).optional(),
});
export type ClientDetails = z.infer<typeof clientDetailsSchema>;

/**
 * Booking creation payload. Deliberately carries no monetary field: the server
 * recomputes subtotal, discount, tax, deposit and balance from the service
 * record, and a client-supplied amount would be ignored if it were sent.
 */
export const createBookingSchema = z.object({
  serviceId: idSchema,
  consultantId: idSchema,
  durationMinutes: z.number().int().min(5).max(600),
  startAt: isoDateTimeSchema,
  timezone: timezoneSchema,
  meetingProvider: z.enum(MEETING_PROVIDER_VALUES),
  client: clientDetailsSchema,
  /** What the client wants to get out of the session; shown to the consultant. */
  objective: z.string().trim().max(2000).optional(),
  notes: z.string().trim().max(2000).optional(),
  discountCode: z.string().trim().max(40).optional(),
  /** Opaque key that makes repeated submits of the same wizard idempotent. */
  idempotencyKey: z.string().min(8).max(80).optional(),
});
export type CreateBookingInput = z.infer<typeof createBookingSchema>;

export const rescheduleBookingSchema = z.object({
  startAt: isoDateTimeSchema,
  timezone: timezoneSchema,
  reason: z.string().trim().max(500).optional(),
  /** Consultants and admins may move a booking onto a different consultant. */
  consultantId: idSchema.optional(),
});
export type RescheduleBookingInput = z.infer<typeof rescheduleBookingSchema>;

export const cancelBookingSchema = z.object({
  reason: z.string().trim().max(500).optional(),
  requestRefund: z.boolean().default(false),
});
export type CancelBookingInput = z.infer<typeof cancelBookingSchema>;

export const bookingListQuerySchema = paginationSchema.extend({
  status: z.enum(BOOKING_STATUS_VALUES).optional(),
  paymentStatus: z.enum(PAYMENT_STATUS_VALUES).optional(),
  consultantId: idSchema.optional(),
  clientId: idSchema.optional(),
  serviceId: idSchema.optional(),
  from: isoDateTimeSchema.optional(),
  to: isoDateTimeSchema.optional(),
  search: z.string().trim().max(120).optional(),
  sort: z.enum(['startAt', 'createdAt', 'total']).default('startAt'),
  direction: z.enum(['asc', 'desc']).default('desc'),
});
export type BookingListQuery = z.infer<typeof bookingListQuerySchema>;

/** A bookable start time returned by the availability endpoint. */
export interface TimeSlot {
  /** UTC instant. */
  startAt: string;
  endAt: string;
  /** Rendered in the requested timezone, e.g. "09:30". */
  label: string;
  available: boolean;
}

export interface DayAvailability {
  /** Calendar date in the requested timezone, `YYYY-MM-DD`. */
  date: string;
  /** False when the consultant does not work this day or it is fully taken. */
  hasAvailability: boolean;
  isFullyBooked: boolean;
  slots: TimeSlot[];
}

export interface AvailabilityResponse {
  timezone: string;
  durationMinutes: number;
  days: DayAvailability[];
}
