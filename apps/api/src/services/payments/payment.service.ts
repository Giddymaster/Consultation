import {
  BOOKING_STATUS,
  ERROR_CODES,
  type Currency,
  type PaymentPurpose,
  type PaymentInitialization,
} from '@meridian/types';
import { prisma } from '../../lib/prisma.js';
import { env, integrationsConfigured } from '../../config/env.js';
import { AppError, badRequest, notFound, paymentAmountMismatch } from '../../lib/errors.js';
import { logger } from '../../lib/logger.js';
import { amountPayableFor } from '../pricing.service.js';
import { transitionBooking } from '../booking.service.js';
import { AUDIT_ACTIONS, recordAudit } from '../audit.service.js';
import * as paystack from './paystack.client.js';

/**
 * Payment orchestration.
 *
 * The rule the whole module is built around: **a browser reaching the callback
 * URL proves nothing.** Only `settlePayment`, driven by a signature-verified
 * webhook or an explicit server-side verify call, may mark anything paid — and
 * it re-checks the amount Paystack reports against the amount we computed
 * before it does.
 */

let referenceCounter = 0;

/** Unique, human-greppable payment reference. */
function newReference(): string {
  referenceCounter = (referenceCounter + 1) % 100_000;
  const stamp = Date.now().toString(36).toUpperCase();
  const seq = referenceCounter.toString(36).toUpperCase().padStart(3, '0');
  return `MRD_${stamp}_${seq}`;
}

export interface InitializeArgs {
  purpose: PaymentPurpose;
  bookingId?: string;
  orderId?: string;
  userId: string;
  userEmail: string;
  callbackPath?: string;
}

/**
 * Builds the return URL. Only a path is accepted from the client, and it is
 * resolved against APP_URL — an absolute URL in the request cannot redirect a
 * paying customer to an attacker's site.
 */
function safeCallbackUrl(callbackPath: string | undefined, fallback: string): string {
  const base = env.APP_URL.replace(/\/$/, '');
  if (!callbackPath) return `${base}${fallback}`;
  if (!callbackPath.startsWith('/') || callbackPath.startsWith('//')) return `${base}${fallback}`;
  return `${base}${callbackPath}`;
}

export async function initializePayment(args: InitializeArgs): Promise<PaymentInitialization> {
  if (!integrationsConfigured.paystack) {
    throw new AppError(
      ERROR_CODES.INTEGRATION_NOT_CONNECTED,
      'Online payment is not available right now. Please contact us to complete your booking.',
      503,
    );
  }

  if (args.purpose === 'PRODUCT_ORDER') return initializeOrderPayment(args);
  return initializeBookingPayment(args);
}

async function initializeBookingPayment(args: InitializeArgs): Promise<PaymentInitialization> {
  if (!args.bookingId) throw badRequest('A booking is required for this payment.');

  const booking = await prisma.booking.findUnique({
    where: { id: args.bookingId },
    select: {
      id: true,
      reference: true,
      status: true,
      currency: true,
      total: true,
      amountDueNow: true,
      amountPaid: true,
      client: { select: { user: { select: { id: true, email: true } } } },
      service: { select: { name: true } },
    },
  });
  if (!booking) throw notFound('Booking');

  const payable: string[] = [
    BOOKING_STATUS.PENDING_PAYMENT,
    BOOKING_STATUS.PAYMENT_PROCESSING,
    BOOKING_STATUS.CONFIRMED,
    BOOKING_STATUS.RESCHEDULED,
  ];
  if (!payable.includes(booking.status)) {
    throw new AppError(
      ERROR_CODES.BOOKING_NOT_PAYABLE,
      'This booking is not currently accepting payment.',
      409,
    );
  }

  // Authoritative amount. Whatever the client believes it owes is irrelevant.
  const purpose = args.purpose === 'BALANCE_PAYMENT' ? 'BALANCE_PAYMENT' : args.purpose;
  const amount = amountPayableFor(
    purpose === 'PRODUCT_ORDER' ? 'FULL_PAYMENT' : purpose,
    { total: booking.total, amountDueNow: booking.amountDueNow, amountPaid: booking.amountPaid },
  );

  if (amount <= 0) {
    throw new AppError(ERROR_CODES.PAYMENT_ALREADY_SETTLED, 'There is nothing left to pay on this booking.', 409);
  }

  const reference = newReference();

  const payment = await prisma.payment.create({
    data: {
      reference,
      bookingId: booking.id,
      userId: args.userId,
      purpose,
      status: 'PROCESSING',
      currency: booking.currency,
      amount,
      customerEmail: args.userEmail,
      metadata: {
        bookingReference: booking.reference,
        serviceName: booking.service.name,
      },
    },
    select: { id: true },
  });

  const init = await paystack.initializeTransaction({
    email: args.userEmail,
    amount,
    currency: booking.currency,
    reference,
    callbackUrl: safeCallbackUrl(args.callbackPath, `/book/confirmation?reference=${booking.reference}`),
    metadata: {
      paymentId: payment.id,
      bookingId: booking.id,
      bookingReference: booking.reference,
      purpose,
    },
  });

  await prisma.booking.update({
    where: { id: booking.id },
    data: { paymentStatus: 'PROCESSING' },
  });

  await recordAudit({
    actorId: args.userId,
    action: AUDIT_ACTIONS.PAYMENT_INITIALIZED,
    entity: 'Payment',
    entityId: payment.id,
    metadata: { bookingId: booking.id, amount, currency: booking.currency, purpose },
  });

  return {
    reference,
    authorizationUrl: init.authorization_url,
    accessCode: init.access_code,
    amount,
    currency: booking.currency,
    publicKey: env.PAYSTACK_PUBLIC_KEY ?? '',
  };
}

async function initializeOrderPayment(args: InitializeArgs): Promise<PaymentInitialization> {
  if (!args.orderId) throw badRequest('An order is required for this payment.');

  const order = await prisma.order.findUnique({
    where: { id: args.orderId },
    select: { id: true, reference: true, status: true, currency: true, total: true, amountPaid: true, userId: true },
  });
  if (!order) throw notFound('Order');
  if (order.status !== 'PENDING_PAYMENT') {
    throw new AppError(ERROR_CODES.PAYMENT_ALREADY_SETTLED, 'This order has already been paid.', 409);
  }

  const amount = Math.max(0, order.total - order.amountPaid);
  if (amount <= 0) {
    throw new AppError(ERROR_CODES.PAYMENT_ALREADY_SETTLED, 'There is nothing left to pay on this order.', 409);
  }

  const reference = newReference();
  const payment = await prisma.payment.create({
    data: {
      reference,
      orderId: order.id,
      userId: args.userId,
      purpose: 'PRODUCT_ORDER',
      status: 'PROCESSING',
      currency: order.currency,
      amount,
      customerEmail: args.userEmail,
      metadata: { orderReference: order.reference },
    },
    select: { id: true },
  });

  const init = await paystack.initializeTransaction({
    email: args.userEmail,
    amount,
    currency: order.currency,
    reference,
    callbackUrl: safeCallbackUrl(args.callbackPath, `/shop/confirmation?reference=${order.reference}`),
    metadata: { paymentId: payment.id, orderId: order.id, orderReference: order.reference, purpose: 'PRODUCT_ORDER' },
  });

  return {
    reference,
    authorizationUrl: init.authorization_url,
    accessCode: init.access_code,
    amount,
    currency: order.currency,
    publicKey: env.PAYSTACK_PUBLIC_KEY ?? '',
  };
}

/* -------------------------------------------------------------------------- */
/* Settlement                                                                 */
/* -------------------------------------------------------------------------- */

export interface SettlementResult {
  status: 'settled' | 'already_settled' | 'failed' | 'pending';
  paymentId: string;
  bookingId?: string;
  orderId?: string;
  /** True only on the transition into PAID, so side effects fire exactly once. */
  firstSettlement: boolean;
}

/**
 * Applies a verified Paystack transaction to our records.
 *
 * Idempotent by construction:
 *   • A payment already in a terminal state returns `already_settled` and does
 *     no work, so a replayed webhook cannot double-credit a booking.
 *   • `firstSettlement` gates every downstream effect — meeting creation,
 *     calendar events, confirmation emails — so those happen once.
 */
export async function settlePayment(transaction: paystack.PaystackTransaction): Promise<SettlementResult> {
  const payment = await prisma.payment.findUnique({
    where: { reference: transaction.reference },
    select: {
      id: true,
      status: true,
      amount: true,
      currency: true,
      purpose: true,
      bookingId: true,
      orderId: true,
      userId: true,
    },
  });

  if (!payment) {
    // A reference we never issued. Recorded and ignored rather than trusted.
    logger.warn({ reference: transaction.reference }, 'Received settlement for an unknown payment reference');
    throw notFound('Payment');
  }

  if (payment.status === 'PAID' || payment.status === 'REFUNDED' || payment.status === 'PARTIALLY_REFUNDED') {
    return {
      status: 'already_settled',
      paymentId: payment.id,
      bookingId: payment.bookingId ?? undefined,
      orderId: payment.orderId ?? undefined,
      firstSettlement: false,
    };
  }

  if (transaction.status !== 'success') {
    const failureStatus = transaction.status === 'abandoned' ? 'ABANDONED' : 'FAILED';
    await prisma.payment.update({
      where: { id: payment.id },
      data: {
        status: failureStatus,
        gatewayResponse: transaction.gateway_response?.slice(0, 320) ?? null,
        failedAt: new Date(),
        providerTransactionId: String(transaction.id),
      },
    });

    if (payment.bookingId) {
      await prisma.booking.update({
        where: { id: payment.bookingId },
        data: { paymentStatus: failureStatus === 'ABANDONED' ? 'ABANDONED' : 'FAILED' },
      });
    }

    await recordAudit({
      actorId: payment.userId,
      action: AUDIT_ACTIONS.PAYMENT_FAILED,
      entity: 'Payment',
      entityId: payment.id,
      metadata: { reference: transaction.reference, gatewayStatus: transaction.status },
    });

    return { status: 'failed', paymentId: payment.id, bookingId: payment.bookingId ?? undefined, firstSettlement: false };
  }

  // The amount Paystack settled must equal the amount we computed. A mismatch
  // means either a tampered checkout or a currency error; either way we refuse
  // to mark the booking paid and raise it for a human.
  if (transaction.amount !== payment.amount) {
    logger.error(
      { paymentId: payment.id, expected: payment.amount, received: transaction.amount },
      'Paystack amount does not match the amount owed — refusing to settle',
    );
    await prisma.payment.update({
      where: { id: payment.id },
      data: {
        status: 'FAILED',
        gatewayResponse: 'Amount mismatch — settlement refused',
        failedAt: new Date(),
        metadata: { expectedAmount: payment.amount, receivedAmount: transaction.amount },
      },
    });
    throw paymentAmountMismatch(payment.amount, transaction.amount);
  }

  if (transaction.currency.toUpperCase() !== payment.currency) {
    logger.error(
      { paymentId: payment.id, expected: payment.currency, received: transaction.currency },
      'Paystack currency does not match — refusing to settle',
    );
    throw paymentAmountMismatch(payment.amount, transaction.amount);
  }

  const paidAt = transaction.paid_at ? new Date(transaction.paid_at) : new Date();

  const outcome = await prisma.$transaction(async (tx) => {
    // Atomic claim. A read-then-write would let two concurrent deliveries both
    // observe PROCESSING and both credit the booking — at READ COMMITTED the
    // second UPDATE blocks on the row lock, then re-evaluates its WHERE against
    // the committed row and matches nothing. Exactly one caller gets count 1.
    const claimed = await tx.payment.updateMany({
      where: { id: payment.id, status: { notIn: ['PAID', 'REFUNDED', 'PARTIALLY_REFUNDED'] } },
      data: {
        status: 'PAID',
        providerTransactionId: String(transaction.id),
        channel: transaction.channel ?? null,
        cardLast4: transaction.authorization?.last4 ?? null,
        cardBrand: transaction.authorization?.brand ?? transaction.authorization?.card_type ?? null,
        authorizationCode: transaction.authorization?.authorization_code ?? null,
        feeAmount: transaction.fees ?? 0,
        gatewayResponse: transaction.gateway_response?.slice(0, 320) ?? null,
        paidAt,
      },
    });

    if (claimed.count === 0) return { firstSettlement: false };

    if (payment.bookingId) {
      const booking = await tx.booking.findUniqueOrThrow({
        where: { id: payment.bookingId },
        select: { id: true, status: true, total: true, amountPaid: true },
      });

      const amountPaid = booking.amountPaid + payment.amount;
      const paymentStatus = amountPaid >= booking.total ? 'PAID' : 'PARTIALLY_PAID';

      await tx.booking.update({
        where: { id: booking.id },
        data: { amountPaid, paymentStatus, holdExpiresAt: null },
      });

      await tx.invoice.updateMany({
        where: { bookingId: booking.id },
        data: {
          amountPaid,
          status: paymentStatus === 'PAID' ? 'PAID' : 'PARTIALLY_PAID',
          ...(paymentStatus === 'PAID' ? { paidAt } : {}),
        },
      });
    }

    if (payment.orderId) {
      const order = await tx.order.findUniqueOrThrow({
        where: { id: payment.orderId },
        select: { id: true, total: true, amountPaid: true, userId: true },
      });
      const amountPaid = order.amountPaid + payment.amount;

      await tx.order.update({
        where: { id: order.id },
        data: {
          amountPaid,
          status: amountPaid >= order.total ? 'PAID' : 'PENDING_PAYMENT',
          ...(amountPaid >= order.total ? { paidAt } : {}),
        },
      });

      // Digital entitlements are granted only here — after confirmed payment.
      if (amountPaid >= order.total) {
        const items = await tx.orderItem.findMany({
          where: { orderId: order.id },
          select: { productId: true, product: { select: { type: true } } },
        });
        for (const item of items) {
          if (item.product.type !== 'DIGITAL') continue;
          await tx.downloadEntitlement.upsert({
            where: {
              userId_productId_orderId: {
                userId: order.userId,
                productId: item.productId,
                orderId: order.id,
              },
            },
            create: { userId: order.userId, productId: item.productId, orderId: order.id },
            update: {},
          });
        }
      }
    }

    return { firstSettlement: true };
  });

  if (!outcome.firstSettlement) {
    return {
      status: 'already_settled',
      paymentId: payment.id,
      bookingId: payment.bookingId ?? undefined,
      orderId: payment.orderId ?? undefined,
      firstSettlement: false,
    };
  }

  // Booking confirmation is a state-machine move, kept outside the money
  // transaction so a rejected transition cannot roll back a recorded payment.
  if (payment.bookingId) {
    const booking = await prisma.booking.findUniqueOrThrow({
      where: { id: payment.bookingId },
      select: { status: true },
    });
    if (booking.status === BOOKING_STATUS.PENDING_PAYMENT || booking.status === BOOKING_STATUS.PAYMENT_PROCESSING) {
      await transitionBooking({
        bookingId: payment.bookingId,
        to: BOOKING_STATUS.CONFIRMED,
        reason: 'Payment confirmed by Paystack',
      });
    }
  }

  await recordAudit({
    actorId: payment.userId,
    action: AUDIT_ACTIONS.PAYMENT_SUCCEEDED,
    entity: 'Payment',
    entityId: payment.id,
    metadata: {
      reference: transaction.reference,
      amount: payment.amount,
      currency: payment.currency,
      channel: transaction.channel,
    },
  });

  return {
    status: 'settled',
    paymentId: payment.id,
    bookingId: payment.bookingId ?? undefined,
    orderId: payment.orderId ?? undefined,
    firstSettlement: true,
  };
}

/**
 * Server-side verification, used by the confirmation page and by an admin
 * "re-check" action. Calls Paystack directly rather than trusting the browser.
 */
export async function verifyAndSettle(reference: string): Promise<SettlementResult> {
  const transaction = await paystack.verifyTransaction(reference);
  return settlePayment(transaction);
}

/* -------------------------------------------------------------------------- */
/* Refunds                                                                    */
/* -------------------------------------------------------------------------- */

export interface RefundArgs {
  paymentId: string;
  amount?: number;
  reason: string;
  merchantNote?: string;
  actorId: string;
}

export async function refundPayment(args: RefundArgs): Promise<{ refundId: string; amount: number }> {
  const payment = await prisma.payment.findUnique({
    where: { id: args.paymentId },
    select: {
      id: true,
      reference: true,
      status: true,
      amount: true,
      refundedAmount: true,
      currency: true,
      bookingId: true,
      orderId: true,
    },
  });
  if (!payment) throw notFound('Payment');
  if (payment.status !== 'PAID' && payment.status !== 'PARTIALLY_REFUNDED') {
    throw new AppError(ERROR_CODES.REFUND_FAILED, 'Only a settled payment can be refunded.', 409);
  }

  const refundable = payment.amount - payment.refundedAmount;
  const amount = args.amount ?? refundable;

  if (amount <= 0 || amount > refundable) {
    throw badRequest(
      `The refund amount must be between 1 and ${refundable} minor units of ${payment.currency}.`,
    );
  }

  const providerRefund = await paystack.createRefund({
    transactionReference: payment.reference,
    amount,
    merchantNote: args.merchantNote,
    customerNote: args.reason,
  });

  const refundedTotal = payment.refundedAmount + amount;
  const fullyRefunded = refundedTotal >= payment.amount;

  const refund = await prisma.$transaction(async (tx) => {
    const created = await tx.refund.create({
      data: {
        paymentId: payment.id,
        reference: `${payment.reference}_R${Date.now().toString(36).toUpperCase()}`,
        providerRefundId: String(providerRefund.id),
        amount,
        currency: payment.currency as Currency,
        status: providerRefund.status ?? 'PENDING',
        reason: args.reason,
        merchantNote: args.merchantNote ?? null,
        initiatedBy: args.actorId,
      },
      select: { id: true },
    });

    await tx.payment.update({
      where: { id: payment.id },
      data: {
        refundedAmount: refundedTotal,
        status: fullyRefunded ? 'REFUNDED' : 'PARTIALLY_REFUNDED',
      },
    });

    if (payment.bookingId) {
      const booking = await tx.booking.findUniqueOrThrow({
        where: { id: payment.bookingId },
        select: { amountPaid: true, total: true },
      });
      const remaining = Math.max(0, booking.amountPaid - amount);
      await tx.booking.update({
        where: { id: payment.bookingId },
        data: {
          amountPaid: remaining,
          paymentStatus: remaining === 0 ? 'REFUNDED' : 'PARTIALLY_REFUNDED',
        },
      });
    }

    return created;
  });

  await recordAudit({
    actorId: args.actorId,
    action: AUDIT_ACTIONS.PAYMENT_REFUNDED,
    entity: 'Payment',
    entityId: payment.id,
    metadata: { refundId: refund.id, amount, reason: args.reason },
  });

  return { refundId: refund.id, amount };
}

/** Marks payments abandoned when their booking hold lapsed unpaid. */
export async function sweepAbandonedPayments(): Promise<number> {
  const cutoff = new Date(Date.now() - 2 * 60 * 60_000);
  const result = await prisma.payment.updateMany({
    where: { status: 'PROCESSING', createdAt: { lt: cutoff } },
    data: { status: 'ABANDONED' },
  });
  if (result.count > 0) logger.info({ count: result.count }, 'Marked stale payments abandoned');
  return result.count;
}

export function paystackConfigured(): boolean {
  return integrationsConfigured.paystack;
}
