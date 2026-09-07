import { z } from 'zod';
import {
  CONTENT_STATUS_VALUES,
  CURRENCY_VALUES,
  MEETING_PROVIDER_VALUES,
  PAYMENT_MODEL_VALUES,
} from '../enums.js';
import {
  idSchema,
  minorAmountSchema,
  paginationSchema,
  queryBooleanSchema,
  slugSchema,
} from './common.js';

export const serviceDurationSchema = z.object({
  minutes: z.number().int().min(5).max(600),
  /** Price for this duration, in minor units. */
  price: minorAmountSchema,
  label: z.string().trim().max(60).optional(),
  isDefault: z.boolean().default(false),
});

/**
 * The service field set, without cross-field rules.
 *
 * Zod refuses `.partial()` on a schema carrying refinements — correctly, since
 * a rule like "a fixed deposit needs an amount" cannot be evaluated against a
 * half-supplied object. So the fields live here and the rules are layered on
 * separately for create and for update, each with the semantics that operation
 * actually needs.
 */
export const serviceFieldsSchema = z
  .object({
    name: z.string().trim().min(2).max(160),
    slug: slugSchema,
    categoryId: idSchema,
    shortDescription: z.string().trim().min(10).max(320),
    fullDescription: z.string().trim().min(20).max(20000),
    currency: z.enum(CURRENCY_VALUES),
    durations: z.array(serviceDurationSchema).min(1, 'Add at least one duration'),
    paymentModel: z.enum(PAYMENT_MODEL_VALUES),
    /** Used when paymentModel is FIXED_DEPOSIT. */
    depositAmount: minorAmountSchema.optional(),
    /** Basis points (2500 = 25%). Used when paymentModel is PERCENTAGE_DEPOSIT. */
    depositPercentBps: z.number().int().min(0).max(10000).optional(),
    taxRateBps: z.number().int().min(0).max(10000).default(0),
    meetingProviders: z.array(z.enum(MEETING_PROVIDER_VALUES)).min(1),
    preparationNotes: z.string().trim().max(5000).optional(),
    cancellationPolicy: z.string().trim().max(5000).optional(),
    reschedulePolicy: z.string().trim().max(5000).optional(),
    /** Hours before the session after which cancellation is no longer allowed. */
    cancellationWindowHours: z.number().int().min(0).max(720).default(24),
    rescheduleWindowHours: z.number().int().min(0).max(720).default(24),
    /** Minimum notice before the earliest bookable slot. */
    leadTimeHours: z.number().int().min(0).max(720).default(12),
    /** How far ahead the calendar may be booked. */
    bookingHorizonDays: z.number().int().min(1).max(365).default(60),
    bufferBeforeMinutes: z.number().int().min(0).max(120).default(0),
    bufferAfterMinutes: z.number().int().min(0).max(120).default(10),
    status: z.enum(CONTENT_STATUS_VALUES).default('DRAFT'),
    isFeatured: z.boolean().default(false),
    sortOrder: z.number().int().min(0).max(9999).default(0),
    seoTitle: z.string().trim().max(160).optional(),
    seoDescription: z.string().trim().max(320).optional(),
    heroImageUrl: z.url().max(2048).optional(),
    icon: z.string().trim().max(60).optional(),
    consultantIds: z.array(idSchema).default([]),
  });

/** Creating a service: every cross-field rule applies. */
export const upsertServiceSchema = serviceFieldsSchema
  .refine((v) => v.paymentModel !== 'FIXED_DEPOSIT' || typeof v.depositAmount === 'number', {
    message: 'A fixed deposit requires a deposit amount',
    path: ['depositAmount'],
  })
  .refine((v) => v.paymentModel !== 'PERCENTAGE_DEPOSIT' || typeof v.depositPercentBps === 'number', {
    message: 'A percentage deposit requires a percentage',
    path: ['depositPercentBps'],
  })
  .refine((v) => v.durations.some((d) => d.isDefault), {
    message: 'Mark one duration as the default',
    path: ['durations'],
  });
export type UpsertServiceInput = z.infer<typeof upsertServiceSchema>;

/**
 * Updating a service: every field is optional, and each rule fires only when
 * the fields it governs are actually part of this request. Changing the payment
 * model therefore requires supplying the matching deposit in the same call —
 * which is the correct demand, since the two are meaningless apart.
 */
export const updateServiceSchema = serviceFieldsSchema
  .partial()
  .refine((v) => v.paymentModel !== 'FIXED_DEPOSIT' || typeof v.depositAmount === 'number', {
    message: 'Switching to a fixed deposit requires a deposit amount',
    path: ['depositAmount'],
  })
  .refine((v) => v.paymentModel !== 'PERCENTAGE_DEPOSIT' || typeof v.depositPercentBps === 'number', {
    message: 'Switching to a percentage deposit requires a percentage',
    path: ['depositPercentBps'],
  })
  .refine((v) => v.durations === undefined || v.durations.some((d) => d.isDefault), {
    message: 'Mark one duration as the default',
    path: ['durations'],
  });
export type UpdateServiceInput = z.infer<typeof updateServiceSchema>;

export const serviceListQuerySchema = paginationSchema.extend({
  category: slugSchema.optional(),
  consultantId: idSchema.optional(),
  search: z.string().trim().max(120).optional(),
  featured: queryBooleanSchema.optional(),
});

export const availabilityRuleSchema = z.object({
  /** 0 = Sunday … 6 = Saturday, in the consultant's timezone. */
  weekday: z.number().int().min(0).max(6),
  /** "09:00" local time. */
  startTime: z.string().regex(/^([01]\d|2[0-3]):[0-5]\d$/, 'Use HH:MM'),
  endTime: z.string().regex(/^([01]\d|2[0-3]):[0-5]\d$/, 'Use HH:MM'),
  isActive: z.boolean().default(true),
});

export const updateAvailabilitySchema = z
  .object({
    timezone: z.string().min(1).max(64),
    /** Slot grid granularity, e.g. 30 shows 09:00, 09:30, 10:00. */
    slotIntervalMinutes: z.number().int().min(5).max(120).default(30),
    rules: z.array(availabilityRuleSchema).max(40),
    /** Dates the consultant is unavailable regardless of weekly rules. */
    blackouts: z
      .array(
        z.object({
          startAt: z.iso.datetime(),
          endAt: z.iso.datetime(),
          reason: z.string().trim().max(200).optional(),
        }),
      )
      .max(200)
      .default([]),
  })
  .refine((v) => v.rules.every((r) => r.startTime < r.endTime), {
    message: 'Each working block must end after it starts',
    path: ['rules'],
  });
export type UpdateAvailabilityInput = z.infer<typeof updateAvailabilitySchema>;

/* -------------------------------------------------------------------------- */
/* Consultant management                                                      */
/* -------------------------------------------------------------------------- */

/**
 * Admin-side consultant profile. Creating one links an existing user account to
 * a consultant profile — the account itself is created through user management,
 * so a consultant always has a real, verifiable identity behind the profile.
 */
export const upsertConsultantSchema = z.object({
  userId: idSchema,
  slug: slugSchema,
  title: z.string().trim().min(2).max(160),
  biography: z.string().trim().min(40, 'Write at least a short paragraph').max(20000),
  specialties: z.array(z.string().trim().min(1).max(60)).min(1, 'Add at least one specialty').max(12),
  qualifications: z.array(z.string().trim().min(1).max(160)).max(12).default([]),
  languages: z.array(z.string().trim().min(1).max(40)).min(1).max(10),
  yearsExperience: z.number().int().min(0).max(70),
  linkedinUrl: z.url().max(2048).nullable().optional(),
  websiteUrl: z.url().max(2048).nullable().optional(),
  timezone: z.string().min(1).max(64),
  slotIntervalMinutes: z.number().int().min(5).max(120).default(30),
  isAcceptingBookings: z.boolean().default(true),
  isPublished: z.boolean().default(false),
  sortOrder: z.number().int().min(0).max(9999).default(0),
  serviceIds: z.array(idSchema).default([]),
});
export type UpsertConsultantInput = z.infer<typeof upsertConsultantSchema>;

/** Fulfilment transitions an operator can apply to a paid order. */
export const updateOrderSchema = z.object({
  status: z.enum(['PAID', 'FULFILLED', 'SHIPPED', 'CANCELLED']),
  note: z.string().trim().max(1000).optional(),
});
export type UpdateOrderInput = z.infer<typeof updateOrderSchema>;

/** Platform settings are typed loosely on purpose: the value shape varies. */
export const updateSettingSchema = z.object({
  value: z.unknown(),
});
