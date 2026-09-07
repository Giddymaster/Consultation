import type { Currency, PriceBreakdown } from '@meridian/types';
import { badRequest } from '../lib/errors.js';

/**
 * The single place any consultation amount is decided.
 *
 * The web client renders a preview of this calculation for the booking summary,
 * but the number it shows is never trusted: `createBooking` and every payment
 * initialisation call back into `calculateBookingPrice` and use its output.
 * A tampered client can change what a user *sees*, never what they are charged.
 */

export interface PricingServiceInput {
  currency: Currency;
  paymentModel: 'FULL_PAYMENT' | 'FIXED_DEPOSIT' | 'PERCENTAGE_DEPOSIT' | 'FREE';
  depositAmount: number | null;
  depositPercentBps: number | null;
  taxRateBps: number;
}

export interface CalculatePriceArgs {
  service: PricingServiceInput;
  /** Price of the chosen duration, read from the service_durations row. */
  durationPrice: number;
  /** Applied before tax. Already validated against a discount rule. */
  discount?: number;
}

/** Rounds half-up, staying in integer minor units. */
function applyBps(amount: number, bps: number): number {
  return Math.round((amount * bps) / 10_000);
}

export function calculateBookingPrice({
  service,
  durationPrice,
  discount = 0,
}: CalculatePriceArgs): PriceBreakdown {
  if (!Number.isInteger(durationPrice) || durationPrice < 0) {
    throw badRequest('This service has an invalid price configured. Please contact support.');
  }

  const subtotal = durationPrice;
  const cappedDiscount = Math.min(Math.max(discount, 0), subtotal);
  const taxable = subtotal - cappedDiscount;
  const tax = applyBps(taxable, service.taxRateBps);
  const total = taxable + tax;

  const amountDueNow = resolveAmountDueNow(service, total);

  return {
    currency: service.currency,
    subtotal,
    discount: cappedDiscount,
    tax,
    taxRateBps: service.taxRateBps,
    total,
    amountDueNow,
    balance: total - amountDueNow,
    requiresDeposit: amountDueNow < total,
  };
}

function resolveAmountDueNow(service: PricingServiceInput, total: number): number {
  switch (service.paymentModel) {
    case 'FREE':
      return 0;

    case 'FULL_PAYMENT':
      return total;

    case 'FIXED_DEPOSIT': {
      const deposit = service.depositAmount ?? 0;
      // A deposit larger than the total would leave a negative balance; a
      // deposit of zero would let a paid service be booked for nothing.
      if (deposit <= 0 || deposit >= total) return total;
      return deposit;
    }

    case 'PERCENTAGE_DEPOSIT': {
      const bps = service.depositPercentBps ?? 0;
      if (bps <= 0 || bps >= 10_000) return total;
      const deposit = applyBps(total, bps);
      return deposit <= 0 ? total : Math.min(deposit, total);
    }

    default:
      return total;
  }
}

export interface OrderPricingArgs {
  currency: Currency;
  items: { unitAmount: number; quantity: number }[];
  taxRateBps?: number;
  shipping?: number;
}

export interface OrderTotals {
  currency: Currency;
  subtotal: number;
  tax: number;
  shipping: number;
  total: number;
}

/** Order totals are recomputed from live product prices at checkout, never
 *  from a cart the browser sent. */
export function calculateOrderTotals({
  currency,
  items,
  taxRateBps = 0,
  shipping = 0,
}: OrderPricingArgs): OrderTotals {
  const subtotal = items.reduce((sum, item) => sum + item.unitAmount * item.quantity, 0);
  const tax = applyBps(subtotal, taxRateBps);
  return { currency, subtotal, tax, shipping, total: subtotal + tax + shipping };
}

/**
 * How much is collectable right now for a given purpose. Guards against a
 * client asking to pay a balance that is already settled, or paying a deposit
 * twice.
 */
export function amountPayableFor(
  purpose: 'FULL_PAYMENT' | 'DEPOSIT' | 'BALANCE_PAYMENT',
  booking: { total: number; amountDueNow: number; amountPaid: number },
): number {
  switch (purpose) {
    case 'DEPOSIT':
      return Math.max(0, booking.amountDueNow - booking.amountPaid);
    case 'BALANCE_PAYMENT':
      return Math.max(0, booking.total - booking.amountPaid);
    case 'FULL_PAYMENT':
      return Math.max(0, booking.total - booking.amountPaid);
    default:
      return 0;
  }
}
