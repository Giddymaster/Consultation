import { z } from 'zod';
import { PAYMENT_PURPOSE_VALUES, PAYMENT_STATUS_VALUES } from '../enums.js';
import { idSchema, isoDateTimeSchema, minorAmountSchema, paginationSchema } from './common.js';

/**
 * Payment initialisation. The client names *what* it wants to pay for, never
 * *how much*: the server derives the amount from the booking or order and
 * rejects any mismatch reported back by Paystack at verification time.
 */
export const initializePaymentSchema = z.object({
  purpose: z.enum(PAYMENT_PURPOSE_VALUES),
  bookingId: idSchema.optional(),
  orderId: idSchema.optional(),
  /** Where Paystack returns the browser after checkout. Validated against APP_URL. */
  callbackPath: z.string().max(300).optional(),
});
export type InitializePaymentInput = z.infer<typeof initializePaymentSchema>;

export interface PaymentInitialization {
  /** Our reference, unique and idempotent per payment attempt. */
  reference: string;
  authorizationUrl: string;
  accessCode: string;
  amount: number;
  currency: string;
  publicKey: string;
}

export const verifyPaymentSchema = z.object({
  reference: z.string().min(6).max(120),
});

export const refundSchema = z.object({
  paymentId: idSchema,
  /** Omit for a full refund of the remaining refundable amount. */
  amount: minorAmountSchema.optional(),
  reason: z.string().trim().min(3).max(500),
  merchantNote: z.string().trim().max(500).optional(),
});
export type RefundInput = z.infer<typeof refundSchema>;

export const paymentListQuerySchema = paginationSchema.extend({
  status: z.enum(PAYMENT_STATUS_VALUES).optional(),
  purpose: z.enum(PAYMENT_PURPOSE_VALUES).optional(),
  consultantId: idSchema.optional(),
  serviceId: idSchema.optional(),
  clientId: idSchema.optional(),
  from: isoDateTimeSchema.optional(),
  to: isoDateTimeSchema.optional(),
  search: z.string().trim().max(120).optional(),
});
export type PaymentListQuery = z.infer<typeof paymentListQuerySchema>;
