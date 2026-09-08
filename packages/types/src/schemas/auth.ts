import { z } from 'zod';
import { emailSchema, timezoneSchema } from './common.js';

/**
 * Password policy is enforced identically on both sides of the wire: the web
 * form and the API validate against this same schema.
 */
export const passwordSchema = z
  .string()
  .min(12, 'Use at least 12 characters')
  .max(128, 'Passwords are limited to 128 characters')
  .refine((v) => /[a-z]/.test(v), 'Include a lowercase letter')
  .refine((v) => /[A-Z]/.test(v), 'Include an uppercase letter')
  .refine((v) => /[0-9]/.test(v), 'Include a number');

/**
 * An optional free-text field, as an HTML form actually delivers it.
 *
 * A text input the user leaves alone submits '', never `undefined`, so
 * `z.string().min(n).optional()` measures the empty string and rejects it for a
 * length nobody tried to give. That is what made registration impossible: the
 * form carried an empty phone default, so every account — however well filled
 * in — failed on a hidden field with a raw "expected string to have >=7
 * characters". Here empty means "not provided", and only a value that is
 * really there is measured.
 *
 * `absent` is what an omitted field becomes: `undefined` on create, `null` on
 * update, where the API reads null as "clear this".
 */
const optionalText = <T>(opts: { min?: number; max: number; message?: string; absent: T }) =>
  z
    .string()
    .transform((value) => value.trim())
    .refine(
      (value) => value.length <= opts.max,
      `Keep this to ${opts.max} characters or fewer`,
    )
    .refine(
      (value) => value === '' || value.length >= (opts.min ?? 0),
      opts.message ?? 'This is too short',
    )
    .transform((value) => (value === '' ? opts.absent : value))
    .optional();

const optionalPhone = optionalText({
  min: 7,
  max: 32,
  message: 'Enter a reachable phone number',
  absent: undefined,
});

export const registerSchema = z.object({
  firstName: z.string().trim().min(1, 'Required').max(80),
  lastName: z.string().trim().min(1, 'Required').max(80),
  email: emailSchema,
  password: passwordSchema,
  phone: optionalPhone,
  company: optionalText({ max: 160, absent: undefined }),
  timezone: timezoneSchema.optional(),
  marketingOptIn: z.boolean().default(false),
});
export type RegisterInput = z.infer<typeof registerSchema>;

export const loginSchema = z.object({
  email: emailSchema,
  password: z.string().min(1, 'Required').max(128),
  rememberMe: z.boolean().default(false),
});
export type LoginInput = z.infer<typeof loginSchema>;

export const forgotPasswordSchema = z.object({ email: emailSchema });
export type ForgotPasswordInput = z.infer<typeof forgotPasswordSchema>;

export const resetPasswordSchema = z
  .object({
    token: z.string().min(16).max(256),
    password: passwordSchema,
    confirmPassword: z.string(),
  })
  .refine((v) => v.password === v.confirmPassword, {
    message: 'Passwords do not match',
    path: ['confirmPassword'],
  });
export type ResetPasswordInput = z.infer<typeof resetPasswordSchema>;

export const verifyEmailSchema = z.object({ token: z.string().min(16).max(256) });

export const changePasswordSchema = z
  .object({
    currentPassword: z.string().min(1).max(128),
    password: passwordSchema,
    confirmPassword: z.string(),
  })
  .refine((v) => v.password === v.confirmPassword, {
    message: 'Passwords do not match',
    path: ['confirmPassword'],
  });
export type ChangePasswordInput = z.infer<typeof changePasswordSchema>;

export const updateProfileSchema = z.object({
  firstName: z.string().trim().min(1).max(80).optional(),
  lastName: z.string().trim().min(1).max(80).optional(),
  // On update, a field the user has emptied means "clear this", which the API
  // stores as null — so these resolve to null rather than dropping out.
  phone: optionalText({
    min: 7,
    max: 32,
    message: 'Enter a reachable phone number',
    absent: null,
  }).nullable(),
  company: optionalText({ max: 160, absent: null }).nullable(),
  jobTitle: optionalText({ max: 160, absent: null }).nullable(),
  timezone: timezoneSchema.optional(),
  avatarUrl: z.url().max(2048).nullable().optional(),
  marketingOptIn: z.boolean().optional(),
});
export type UpdateProfileInput = z.infer<typeof updateProfileSchema>;
