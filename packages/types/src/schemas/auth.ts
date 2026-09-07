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

export const registerSchema = z.object({
  firstName: z.string().trim().min(1, 'Required').max(80),
  lastName: z.string().trim().min(1, 'Required').max(80),
  email: emailSchema,
  password: passwordSchema,
  phone: z.string().trim().min(7).max(32).optional(),
  company: z.string().trim().max(160).optional(),
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
  phone: z.string().trim().min(7).max(32).nullable().optional(),
  company: z.string().trim().max(160).nullable().optional(),
  jobTitle: z.string().trim().max(160).nullable().optional(),
  timezone: timezoneSchema.optional(),
  avatarUrl: z.url().max(2048).nullable().optional(),
  marketingOptIn: z.boolean().optional(),
});
export type UpdateProfileInput = z.infer<typeof updateProfileSchema>;
