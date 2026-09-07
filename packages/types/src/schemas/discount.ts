import { z } from 'zod';
import { idSchema, isoDateTimeSchema, minorAmountSchema } from './common.js';
import { CURRENCY_VALUES } from '../enums.js';

/**
 * Discount rules.
 *
 * A percentage is expressed in basis points so the whole system stays in
 * integers — 1000 is 10%, and 12.5% is 1250 rather than a float that rounds
 * differently on two machines.
 */

export const DISCOUNT_TYPE_VALUES = ['PERCENTAGE', 'FIXED_AMOUNT'] as const;
export const DISCOUNT_APPLIES_TO_VALUES = ['EVERYTHING', 'SERVICES', 'PRODUCTS'] as const;

export type DiscountType = (typeof DISCOUNT_TYPE_VALUES)[number];
export type DiscountAppliesTo = (typeof DISCOUNT_APPLIES_TO_VALUES)[number];

const discountFieldsSchema = z.object({
  code: z
    .string()
    .trim()
    .min(3, 'Use at least 3 characters')
    .max(40)
    .regex(/^[A-Za-z0-9_-]+$/, 'Letters, numbers, hyphens and underscores only'),
  description: z.string().trim().max(240).nullable().optional(),
  type: z.enum(DISCOUNT_TYPE_VALUES),
  /** Basis points for PERCENTAGE, minor units for FIXED_AMOUNT. */
  value: z.number().int().min(1),
  currency: z.enum(CURRENCY_VALUES).nullable().optional(),
  appliesTo: z.enum(DISCOUNT_APPLIES_TO_VALUES).default('EVERYTHING'),
  serviceIds: z.array(idSchema).max(100).optional(),
  productIds: z.array(idSchema).max(100).optional(),
  minSubtotal: minorAmountSchema.optional(),
  /** Caps a percentage discount. 0 means uncapped. */
  maxDiscount: minorAmountSchema.optional(),
  maxRedemptions: z.number().int().min(1).max(1_000_000).nullable().optional(),
  perClientLimit: z.number().int().min(1).max(1000).nullable().optional(),
  startsAt: isoDateTimeSchema.nullable().optional(),
  endsAt: isoDateTimeSchema.nullable().optional(),
  isActive: z.boolean().optional(),
});

/**
 * Cross-field rules, shared by the create and update schemas.
 *
 * Written as a `superRefine` over a partial shape rather than a chain of
 * `.refine()` calls: the update schema is `.partial()`, and a rule that assumed
 * a field was present would reject a perfectly valid one-field edit.
 */
type DiscountFields = Partial<z.infer<typeof discountFieldsSchema>>;

function checkDiscountRules(value: DiscountFields, ctx: z.RefinementCtx): void {
  if (value.type === 'PERCENTAGE' && value.value !== undefined && value.value > 10_000) {
    ctx.addIssue({
      code: 'custom',
      message: 'A percentage cannot exceed 100% (10000 basis points)',
      path: ['value'],
    });
  }

  // Without a currency, a KES code could be applied to a USD basket at face value.
  if (value.type === 'FIXED_AMOUNT' && !value.currency) {
    ctx.addIssue({ code: 'custom', message: 'A fixed amount needs a currency', path: ['currency'] });
  }

  if (value.startsAt && value.endsAt && new Date(value.startsAt) >= new Date(value.endsAt)) {
    ctx.addIssue({
      code: 'custom',
      message: 'The end date must come after the start date',
      path: ['endsAt'],
    });
  }

  if (value.appliesTo === 'PRODUCTS' && (value.serviceIds ?? []).length > 0) {
    ctx.addIssue({
      code: 'custom',
      message: 'A products-only code cannot name services',
      path: ['serviceIds'],
    });
  }

  if (value.appliesTo === 'SERVICES' && (value.productIds ?? []).length > 0) {
    ctx.addIssue({
      code: 'custom',
      message: 'A services-only code cannot name products',
      path: ['productIds'],
    });
  }
}

export const upsertDiscountSchema = discountFieldsSchema.superRefine(checkDiscountRules);

/**
 * The code is deliberately absent: it is the identity clients have already been
 * given, and renaming it would break every email and invoice that quoted it.
 */
export const updateDiscountSchema = discountFieldsSchema
  .omit({ code: true })
  .partial()
  .superRefine(checkDiscountRules);

export type UpsertDiscountInput = z.infer<typeof upsertDiscountSchema>;
export type UpdateDiscountInput = z.infer<typeof updateDiscountSchema>;

export const previewDiscountSchema = z.object({
  code: z.string().trim().min(1).max(40),
  serviceId: idSchema.optional(),
  durationMinutes: z.number().int().min(5).max(600).optional(),
  productIds: z.array(idSchema).max(50).optional(),
});
export type PreviewDiscountInput = z.infer<typeof previewDiscountSchema>;

export interface DiscountQuoteDto {
  discountId: string;
  code: string;
  description: string | null;
  /** Minor units, already capped at the basket subtotal. */
  amount: number;
  currency: string;
  subtotal: number;
}
