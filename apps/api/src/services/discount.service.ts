import type { Currency } from '@meridian/types';
import type { Prisma } from '../generated/prisma/client.js';
import { prisma } from '../lib/prisma.js';
import { badRequest } from '../lib/errors.js';

/**
 * Discount codes.
 *
 * The client sends a code and nothing else. Every amount is derived here from
 * the stored rule and recomputed at checkout, so a request that claims a
 * discount, or claims a larger one, buys exactly what the rule allows.
 *
 * Two limits need care because they are races, not validations:
 *
 *   * `maxRedemptions` — two people can both see the last remaining use. The
 *     claim is an atomic `updateMany` guarded on the count, so exactly one wins.
 *   * `perClientLimit` — enforced by counting that client's redemption rows
 *     inside the same transaction that creates the next one.
 *
 * A redemption row is written only once the booking or order actually exists.
 * Validating a code never consumes it; abandoning a checkout never burns a use.
 */

export type DiscountScope = 'SERVICES' | 'PRODUCTS';

export interface DiscountQuote {
  discountId: string;
  code: string;
  description: string | null;
  /** In minor units, already capped at the subtotal and at `maxDiscount`. */
  amount: number;
  currency: Currency;
}

interface ValidateArgs {
  code: string;
  userId: string | null;
  currency: Currency;
  /** Pre-discount subtotal in minor units. */
  subtotal: number;
  scope: DiscountScope;
  /** The service being booked, when `scope` is SERVICES. */
  serviceId?: string;
  /** The products in the basket, when `scope` is PRODUCTS. */
  productIds?: string[];
}

/** Normalised once so a code is case- and whitespace-insensitive everywhere. */
export function normaliseCode(code: string): string {
  return code.trim().toUpperCase();
}

/**
 * Resolves a code to the amount it is worth for this basket, or explains why it
 * does not apply. Never mutates anything.
 */
export async function quoteDiscount(args: ValidateArgs): Promise<DiscountQuote> {
  const code = normaliseCode(args.code);
  if (!code) throw badRequest('Enter a discount code.');

  const discount = await prisma.discount.findUnique({ where: { code } });

  // One message for "no such code" and "withdrawn": a distinct response would
  // let anyone enumerate which codes exist.
  if (!discount || !discount.isActive) {
    throw badRequest('That discount code is not valid.');
  }

  const now = new Date();
  if (discount.startsAt && discount.startsAt > now) {
    throw badRequest('That discount code is not active yet.');
  }
  if (discount.endsAt && discount.endsAt < now) {
    throw badRequest('That discount code has expired.');
  }

  if (discount.maxRedemptions !== null && discount.redeemedCount >= discount.maxRedemptions) {
    throw badRequest('That discount code has been fully redeemed.');
  }

  if (discount.appliesTo !== 'EVERYTHING') {
    const wanted = args.scope === 'SERVICES' ? 'SERVICES' : 'PRODUCTS';
    if (discount.appliesTo !== wanted) {
      throw badRequest(
        discount.appliesTo === 'SERVICES'
          ? 'That code applies to consultations, not resources.'
          : 'That code applies to resources, not consultations.',
      );
    }
  }

  // An empty id list means "everything within appliesTo".
  if (args.scope === 'SERVICES' && discount.serviceIds.length > 0) {
    if (!args.serviceId || !discount.serviceIds.includes(args.serviceId)) {
      throw badRequest('That code does not apply to this consultation.');
    }
  }
  if (args.scope === 'PRODUCTS' && discount.productIds.length > 0) {
    const basket = args.productIds ?? [];
    if (!basket.some((id) => discount.productIds.includes(id))) {
      throw badRequest('That code does not apply to anything in your basket.');
    }
  }

  if (discount.type === 'FIXED_AMOUNT' && discount.currency && discount.currency !== args.currency) {
    throw badRequest(`That code can only be used on ${discount.currency} purchases.`);
  }

  if (args.subtotal < discount.minSubtotal) {
    throw badRequest('Your total is below the minimum for that code.');
  }

  if (args.userId && discount.perClientLimit !== null) {
    const used = await prisma.discountRedemption.count({
      where: { discountId: discount.id, userId: args.userId },
    });
    if (used >= discount.perClientLimit) {
      throw badRequest('You have already used that discount code.');
    }
  }

  return {
    discountId: discount.id,
    code: discount.code,
    description: discount.description,
    amount: amountFor(discount, args.subtotal),
    currency: args.currency,
  };
}

/** The arithmetic, in one place, in integer minor units throughout. */
function amountFor(
  discount: { type: string; value: number; maxDiscount: number },
  subtotal: number,
): number {
  const raw =
    discount.type === 'PERCENTAGE'
      ? Math.round((subtotal * discount.value) / 10_000)
      : discount.value;

  const capped = discount.maxDiscount > 0 ? Math.min(raw, discount.maxDiscount) : raw;

  // Never below zero, never more than the basket is worth.
  return Math.min(Math.max(capped, 0), subtotal);
}

/**
 * Claims one use of a discount and records it against the booking or order.
 *
 * Runs inside the caller's transaction so that a failure anywhere in checkout
 * takes the redemption with it. Returns false when the last use was taken by
 * someone else between quoting and committing — the caller decides whether to
 * fail the checkout or continue without the discount.
 */
export async function redeemDiscount(
  tx: Prisma.TransactionClient,
  args: {
    discountId: string;
    userId: string | null;
    bookingId?: string;
    orderId?: string;
    amount: number;
    currency: Currency;
  },
): Promise<boolean> {
  // Atomic claim: the guard is re-evaluated under the row lock, so two callers
  // racing for the final redemption cannot both succeed.
  const claimed = await tx.discount.updateMany({
    where: {
      id: args.discountId,
      isActive: true,
      OR: [{ maxRedemptions: null }, { redeemedCount: { lt: tx.discount.fields.maxRedemptions } }],
    },
    data: { redeemedCount: { increment: 1 } },
  });

  if (claimed.count === 0) return false;

  await tx.discountRedemption.create({
    data: {
      discountId: args.discountId,
      userId: args.userId,
      bookingId: args.bookingId ?? null,
      orderId: args.orderId ?? null,
      amount: args.amount,
      currency: args.currency,
    },
  });

  return true;
}

/**
 * Returns a use to the pool when a booking or order that consumed one is
 * cancelled before it was ever paid for. Idempotent: a redemption already
 * released leaves the count alone.
 */
export async function releaseDiscount(
  tx: Prisma.TransactionClient,
  args: { bookingId?: string; orderId?: string },
): Promise<void> {
  const where = args.bookingId ? { bookingId: args.bookingId } : { orderId: args.orderId ?? '' };
  const redemption = await tx.discountRedemption.findFirst({ where });
  if (!redemption) return;

  await tx.discountRedemption.delete({ where: { id: redemption.id } });
  await tx.discount.updateMany({
    where: { id: redemption.discountId, redeemedCount: { gt: 0 } },
    data: { redeemedCount: { decrement: 1 } },
  });
}
