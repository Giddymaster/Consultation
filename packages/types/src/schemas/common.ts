import { z } from 'zod';
import { CURRENCY_VALUES } from '../enums.js';

export const idSchema = z.uuid();
export const slugSchema = z
  .string()
  .min(1)
  .max(160)
  .regex(/^[a-z0-9]+(?:-[a-z0-9]+)*$/, 'Must be a lowercase hyphenated slug');

export const emailSchema = z.email().max(254).trim().toLowerCase();

export const currencySchema = z.enum(CURRENCY_VALUES);

/** IANA timezone identifier, validated against the runtime's tz database. */
export const timezoneSchema = z
  .string()
  .min(1)
  .max(64)
  .refine(
    (tz) => {
      try {
        new Intl.DateTimeFormat('en-US', { timeZone: tz });
        return true;
      } catch {
        return false;
      }
    },
    { message: 'Unknown timezone' },
  );

export const isoDateTimeSchema = z.iso.datetime({ offset: true }).or(z.iso.datetime());
export const isoDateSchema = z.iso.date();

export const paginationSchema = z.object({
  page: z.coerce.number().int().min(1).default(1),
  pageSize: z.coerce.number().int().min(1).max(100).default(20),
});

export const sortDirectionSchema = z.enum(['asc', 'desc']).default('desc');

export const dateRangeSchema = z.object({
  from: isoDateTimeSchema.optional(),
  to: isoDateTimeSchema.optional(),
});

/**
 * A boolean arriving in a query string.
 *
 * `z.coerce.boolean()` is wrong here and quietly so: it applies `Boolean(value)`,
 * and every non-empty string is truthy — so `?flag=false` becomes `true`. This
 * reads the string as a human wrote it, and still accepts a real boolean for
 * callers that pass one directly.
 */
export const queryBooleanSchema = z
  .union([z.boolean(), z.string()])
  .transform((value) =>
    typeof value === 'boolean' ? value : ['true', '1', 'yes', 'on'].includes(value.trim().toLowerCase()),
  );

/** Amounts always arrive as non-negative integer minor units. */
export const minorAmountSchema = z.number().int().min(0).max(1_000_000_000);

export type Pagination = z.infer<typeof paginationSchema>;
