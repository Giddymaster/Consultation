import type { Currency } from './enums.js';

/**
 * All monetary amounts cross the wire and live in the database as **integer
 * minor units** (cents for KES/USD/ZAR, kobo for NGN, pesewas for GHS).
 * Floating-point money is never persisted or transmitted.
 *
 * Paystack itself expects minor units, so no conversion happens at the payment
 * boundary either.
 */
export type Minor = number;

const MINOR_UNITS_PER_MAJOR: Record<Currency, number> = {
  KES: 100,
  USD: 100,
  NGN: 100,
  GHS: 100,
  ZAR: 100,
};

const LOCALE_BY_CURRENCY: Record<Currency, string> = {
  KES: 'en-KE',
  USD: 'en-US',
  NGN: 'en-NG',
  GHS: 'en-GH',
  ZAR: 'en-ZA',
};

export function minorUnitsPerMajor(currency: Currency): number {
  return MINOR_UNITS_PER_MAJOR[currency] ?? 100;
}

export function toMinor(major: number, currency: Currency): Minor {
  return Math.round(major * minorUnitsPerMajor(currency));
}

export function toMajor(minor: Minor, currency: Currency): number {
  return minor / minorUnitsPerMajor(currency);
}

/** `KES 2,500.00` — used in UI, emails and invoices. */
export function formatMoney(
  minor: Minor,
  currency: Currency,
  options: { compact?: boolean; hideDecimals?: boolean } = {},
): string {
  const major = toMajor(minor, currency);
  const fractionDigits = options.hideDecimals || Number.isInteger(major) ? 0 : 2;
  return new Intl.NumberFormat(LOCALE_BY_CURRENCY[currency] ?? 'en-US', {
    style: 'currency',
    currency,
    currencyDisplay: 'code',
    notation: options.compact ? 'compact' : 'standard',
    minimumFractionDigits: fractionDigits,
    maximumFractionDigits: fractionDigits,
  })
    .format(major)
    .replace(/\u00a0/g, ' ');
}

export interface PriceBreakdown {
  currency: Currency;
  /** Undiscounted service price for the chosen duration. */
  subtotal: Minor;
  discount: Minor;
  /** Tax computed on (subtotal - discount) at the configured rate. */
  tax: Minor;
  taxRateBps: number;
  total: Minor;
  /** Amount required now to hold the slot. Equals `total` for FULL_PAYMENT. */
  amountDueNow: Minor;
  /** `total - amountDueNow`; settled before the session. */
  balance: Minor;
  requiresDeposit: boolean;
}
