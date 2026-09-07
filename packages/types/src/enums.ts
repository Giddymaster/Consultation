/**
 * Domain enumerations shared by the API and the web client.
 *
 * These are declared as const objects (not TS `enum`) so they survive
 * `isolatedModules`, tree-shake cleanly, and can be iterated at runtime for
 * form option lists and Zod schema construction.
 */

export const ROLES = {
  SUPER_ADMIN: 'SUPER_ADMIN',
  ADMIN: 'ADMIN',
  CONSULTANT: 'CONSULTANT',
  CLIENT: 'CLIENT',
  CONTENT_MANAGER: 'CONTENT_MANAGER',
  FINANCE_MANAGER: 'FINANCE_MANAGER',
} as const;
export type Role = (typeof ROLES)[keyof typeof ROLES];
export const ROLE_VALUES = Object.values(ROLES) as [Role, ...Role[]];

/**
 * Booking lifecycle. Transitions are constrained by BOOKING_TRANSITIONS below
 * and enforced server-side; the string is never advanced ad hoc.
 */
export const BOOKING_STATUS = {
  PENDING_PAYMENT: 'PENDING_PAYMENT',
  PAYMENT_PROCESSING: 'PAYMENT_PROCESSING',
  CONFIRMED: 'CONFIRMED',
  RESCHEDULED: 'RESCHEDULED',
  IN_PROGRESS: 'IN_PROGRESS',
  COMPLETED: 'COMPLETED',
  CANCELLED: 'CANCELLED',
  REFUND_PENDING: 'REFUND_PENDING',
  REFUNDED: 'REFUNDED',
  NO_SHOW: 'NO_SHOW',
  EXPIRED: 'EXPIRED',
} as const;
export type BookingStatus = (typeof BOOKING_STATUS)[keyof typeof BOOKING_STATUS];
export const BOOKING_STATUS_VALUES = Object.values(BOOKING_STATUS) as [
  BookingStatus,
  ...BookingStatus[],
];

/**
 * Payment progress is tracked separately from booking lifecycle: a booking can
 * be CONFIRMED while only PARTIALLY_PAID (deposit taken, balance outstanding).
 */
export const PAYMENT_STATUS = {
  UNPAID: 'UNPAID',
  PROCESSING: 'PROCESSING',
  PARTIALLY_PAID: 'PARTIALLY_PAID',
  PAID: 'PAID',
  REFUND_PENDING: 'REFUND_PENDING',
  PARTIALLY_REFUNDED: 'PARTIALLY_REFUNDED',
  REFUNDED: 'REFUNDED',
  FAILED: 'FAILED',
  ABANDONED: 'ABANDONED',
} as const;
export type PaymentStatus = (typeof PAYMENT_STATUS)[keyof typeof PAYMENT_STATUS];
export const PAYMENT_STATUS_VALUES = Object.values(PAYMENT_STATUS) as [
  PaymentStatus,
  ...PaymentStatus[],
];

export const PAYMENT_PURPOSE = {
  FULL_PAYMENT: 'FULL_PAYMENT',
  DEPOSIT: 'DEPOSIT',
  BALANCE_PAYMENT: 'BALANCE_PAYMENT',
  PRODUCT_ORDER: 'PRODUCT_ORDER',
} as const;
export type PaymentPurpose = (typeof PAYMENT_PURPOSE)[keyof typeof PAYMENT_PURPOSE];
export const PAYMENT_PURPOSE_VALUES = Object.values(PAYMENT_PURPOSE) as [
  PaymentPurpose,
  ...PaymentPurpose[],
];

/** How a service expects to be paid for. Configured per-service by an admin. */
export const PAYMENT_MODEL = {
  FULL_PAYMENT: 'FULL_PAYMENT',
  FIXED_DEPOSIT: 'FIXED_DEPOSIT',
  PERCENTAGE_DEPOSIT: 'PERCENTAGE_DEPOSIT',
  FREE: 'FREE',
} as const;
export type PaymentModel = (typeof PAYMENT_MODEL)[keyof typeof PAYMENT_MODEL];
export const PAYMENT_MODEL_VALUES = Object.values(PAYMENT_MODEL) as [
  PaymentModel,
  ...PaymentModel[],
];

export const MEETING_PROVIDER = {
  ZOOM: 'ZOOM',
  GOOGLE_MEET: 'GOOGLE_MEET',
  MICROSOFT_TEAMS: 'MICROSOFT_TEAMS',
  IN_PERSON: 'IN_PERSON',
  PHONE: 'PHONE',
  MANUAL: 'MANUAL',
} as const;
export type MeetingProvider = (typeof MEETING_PROVIDER)[keyof typeof MEETING_PROVIDER];
export const MEETING_PROVIDER_VALUES = Object.values(MEETING_PROVIDER) as [
  MeetingProvider,
  ...MeetingProvider[],
];

export const MEETING_STATUS = {
  PENDING: 'PENDING',
  CREATED: 'CREATED',
  FAILED: 'FAILED',
  CANCELLED: 'CANCELLED',
} as const;
export type MeetingStatus = (typeof MEETING_STATUS)[keyof typeof MEETING_STATUS];

export const CALENDAR_PROVIDER = {
  GOOGLE: 'GOOGLE',
  MICROSOFT: 'MICROSOFT',
} as const;
export type CalendarProvider = (typeof CALENDAR_PROVIDER)[keyof typeof CALENDAR_PROVIDER];

export const SESSION_STATUS = {
  SCHEDULED: 'SCHEDULED',
  IN_PROGRESS: 'IN_PROGRESS',
  COMPLETED: 'COMPLETED',
  CANCELLED: 'CANCELLED',
  NO_SHOW: 'NO_SHOW',
} as const;
export type SessionStatus = (typeof SESSION_STATUS)[keyof typeof SESSION_STATUS];

export const REVIEW_STATUS = {
  PENDING: 'PENDING',
  APPROVED: 'APPROVED',
  REJECTED: 'REJECTED',
} as const;
export type ReviewStatus = (typeof REVIEW_STATUS)[keyof typeof REVIEW_STATUS];

export const CONTENT_STATUS = {
  DRAFT: 'DRAFT',
  SCHEDULED: 'SCHEDULED',
  PUBLISHED: 'PUBLISHED',
  ARCHIVED: 'ARCHIVED',
} as const;
export type ContentStatus = (typeof CONTENT_STATUS)[keyof typeof CONTENT_STATUS];
export const CONTENT_STATUS_VALUES = Object.values(CONTENT_STATUS) as [
  ContentStatus,
  ...ContentStatus[],
];

export const PRODUCT_TYPE = {
  DIGITAL: 'DIGITAL',
  PHYSICAL: 'PHYSICAL',
} as const;
export type ProductType = (typeof PRODUCT_TYPE)[keyof typeof PRODUCT_TYPE];

export const ORDER_STATUS = {
  PENDING_PAYMENT: 'PENDING_PAYMENT',
  PAID: 'PAID',
  FULFILLED: 'FULFILLED',
  SHIPPED: 'SHIPPED',
  CANCELLED: 'CANCELLED',
  REFUNDED: 'REFUNDED',
} as const;
export type OrderStatus = (typeof ORDER_STATUS)[keyof typeof ORDER_STATUS];

export const INVOICE_STATUS = {
  DRAFT: 'DRAFT',
  ISSUED: 'ISSUED',
  PAID: 'PAID',
  PARTIALLY_PAID: 'PARTIALLY_PAID',
  VOID: 'VOID',
  OVERDUE: 'OVERDUE',
} as const;
export type InvoiceStatus = (typeof INVOICE_STATUS)[keyof typeof INVOICE_STATUS];

export const EMAIL_TEMPLATE = {
  ACCOUNT_VERIFICATION: 'ACCOUNT_VERIFICATION',
  PASSWORD_RESET: 'PASSWORD_RESET',
  WELCOME_EMAIL: 'WELCOME_EMAIL',
  BOOKING_CREATED: 'BOOKING_CREATED',
  PAYMENT_SUCCESS: 'PAYMENT_SUCCESS',
  BOOKING_CONFIRMED: 'BOOKING_CONFIRMED',
  BOOKING_RESCHEDULED: 'BOOKING_RESCHEDULED',
  BOOKING_CANCELLED: 'BOOKING_CANCELLED',
  SESSION_REMINDER_24H: 'SESSION_REMINDER_24H',
  SESSION_REMINDER_1H: 'SESSION_REMINDER_1H',
  BALANCE_DUE: 'BALANCE_DUE',
  REVIEW_REQUEST: 'REVIEW_REQUEST',
  RESOURCE_PURCHASE: 'RESOURCE_PURCHASE',
  REFUND_CONFIRMATION: 'REFUND_CONFIRMATION',
  MEETING_CREATION_FAILED: 'MEETING_CREATION_FAILED',
} as const;
export type EmailTemplate = (typeof EMAIL_TEMPLATE)[keyof typeof EMAIL_TEMPLATE];

export const EMAIL_STATUS = {
  QUEUED: 'QUEUED',
  SENT: 'SENT',
  FAILED: 'FAILED',
  SUPPRESSED: 'SUPPRESSED',
} as const;
export type EmailStatus = (typeof EMAIL_STATUS)[keyof typeof EMAIL_STATUS];

export const NOTIFICATION_TYPE = {
  PAYMENT_SUCCESS: 'PAYMENT_SUCCESS',
  BOOKING_CONFIRMED: 'BOOKING_CONFIRMED',
  BOOKING_RESCHEDULED: 'BOOKING_RESCHEDULED',
  BOOKING_CANCELLED: 'BOOKING_CANCELLED',
  NEW_CLIENT: 'NEW_CLIENT',
  SESSION_STARTING_SOON: 'SESSION_STARTING_SOON',
  REVIEW_RECEIVED: 'REVIEW_RECEIVED',
  NEW_ORDER: 'NEW_ORDER',
  BALANCE_DUE: 'BALANCE_DUE',
  INTEGRATION_FAILURE: 'INTEGRATION_FAILURE',
  SYSTEM: 'SYSTEM',
} as const;
export type NotificationType = (typeof NOTIFICATION_TYPE)[keyof typeof NOTIFICATION_TYPE];

export const CURRENCY = {
  KES: 'KES',
  USD: 'USD',
  NGN: 'NGN',
  GHS: 'GHS',
  ZAR: 'ZAR',
} as const;
export type Currency = (typeof CURRENCY)[keyof typeof CURRENCY];
export const CURRENCY_VALUES = Object.values(CURRENCY) as [Currency, ...Currency[]];
