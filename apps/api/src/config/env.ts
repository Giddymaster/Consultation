import 'dotenv/config';
import { z } from 'zod';

/**
 * Environment is parsed once, at boot, through a schema. A malformed or missing
 * variable stops the process with a readable report rather than surfacing as a
 * confusing runtime failure hours later.
 */

const booleanish = z
  .string()
  .transform((v) => v.trim().toLowerCase())
  .pipe(z.enum(['true', 'false', '1', '0', 'yes', 'no']))
  .transform((v) => v === 'true' || v === '1' || v === 'yes');

const optionalString = z
  .string()
  .trim()
  .transform((v) => (v.length === 0 ? undefined : v))
  .optional();

const envSchema = z
  .object({
    NODE_ENV: z.enum(['development', 'test', 'production']).default('development'),
    PORT: z.coerce.number().int().min(1).max(65535).default(4000),
    APP_URL: z.url(),
    API_URL: z.url(),

    DATABASE_URL: z.string().min(1, 'DATABASE_URL is required'),

    JWT_SECRET: z.string().min(32, 'JWT_SECRET must be at least 32 characters'),
    JWT_REFRESH_SECRET: z.string().min(32, 'JWT_REFRESH_SECRET must be at least 32 characters'),
    ACCESS_TOKEN_TTL: z.string().default('15m'),
    REFRESH_TOKEN_TTL_DAYS: z.coerce.number().int().min(1).max(365).default(30),
    ENCRYPTION_KEY: z
      .string()
      .refine((v) => Buffer.from(v, 'base64').length === 32, {
        message: 'ENCRYPTION_KEY must be 32 bytes, base64-encoded',
      }),
    COOKIE_DOMAIN: optionalString,
    COOKIE_SECURE: booleanish.default(false),

    BUSINESS_NAME: z.string().default('Meridian Advisory'),
    BUSINESS_TIMEZONE: z.string().default('Africa/Nairobi'),
    BUSINESS_CURRENCY: z.enum(['KES', 'USD', 'NGN', 'GHS', 'ZAR']).default('KES'),
    SUPPORT_EMAIL: z.email().default('support@example.com'),
    SUPPORT_PHONE: z.string().default(''),

    PAYSTACK_SECRET_KEY: optionalString,
    PAYSTACK_PUBLIC_KEY: optionalString,
    PAYSTACK_BASE_URL: z.url().default('https://api.paystack.co'),

    GOOGLE_CLIENT_ID: optionalString,
    GOOGLE_CLIENT_SECRET: optionalString,

    MICROSOFT_CLIENT_ID: optionalString,
    MICROSOFT_CLIENT_SECRET: optionalString,
    MICROSOFT_TENANT_ID: z.string().default('common'),

    ZOOM_CLIENT_ID: optionalString,
    ZOOM_CLIENT_SECRET: optionalString,
    ZOOM_ACCOUNT_ID: optionalString,

    EMAIL_PROVIDER: z.enum(['smtp', 'resend', 'console']).default('console'),
    EMAIL_FROM: z.string().default('Meridian Advisory <no-reply@example.com>'),
    EMAIL_API_KEY: optionalString,
    SMTP_HOST: optionalString,
    SMTP_PORT: z.coerce.number().int().default(587),
    SMTP_USER: optionalString,
    SMTP_PASSWORD: optionalString,
    SMTP_SECURE: booleanish.default(false),

    STORAGE_DRIVER: z.enum(['s3', 'local']).default('local'),
    STORAGE_ENDPOINT: optionalString,
    STORAGE_REGION: z.string().default('auto'),
    STORAGE_ACCESS_KEY: optionalString,
    STORAGE_SECRET_KEY: optionalString,
    STORAGE_BUCKET: z.string().default('meridian-private'),
    STORAGE_PUBLIC_BUCKET: z.string().default('meridian-public'),
    STORAGE_SIGNED_URL_TTL: z.coerce.number().int().min(30).max(86400).default(300),
    STORAGE_LOCAL_PATH: z.string().default('./storage'),

    MOCK_PAYMENTS: booleanish.default(false),
    MOCK_VIDEO: booleanish.default(false),
    MOCK_EMAIL: booleanish.default(false),
    MOCK_CALENDAR: booleanish.default(false),

    LOG_LEVEL: z.enum(['fatal', 'error', 'warn', 'info', 'debug', 'trace']).default('info'),
    RATE_LIMIT_MAX: z.coerce.number().int().min(1).default(200),
    RATE_LIMIT_WINDOW: z.string().default('1 minute'),
    RUN_JOBS_IN_PROCESS: booleanish.default(true),
  })
  .superRefine((cfg, ctx) => {
    // A mock adapter reaching production would fabricate payments or meeting
    // links against real users. Refuse to boot rather than risk it.
    if (cfg.NODE_ENV === 'production') {
      const enabledMocks = (
        [
          ['MOCK_PAYMENTS', cfg.MOCK_PAYMENTS],
          ['MOCK_VIDEO', cfg.MOCK_VIDEO],
          ['MOCK_EMAIL', cfg.MOCK_EMAIL],
          ['MOCK_CALENDAR', cfg.MOCK_CALENDAR],
        ] as const
      ).filter(([, on]) => on);

      for (const [name] of enabledMocks) {
        ctx.addIssue({
          code: 'custom',
          path: [name],
          message: `${name} must be false in production — mock adapters may never run against live users`,
        });
      }

      if (!cfg.COOKIE_SECURE) {
        ctx.addIssue({
          code: 'custom',
          path: ['COOKIE_SECURE'],
          message: 'COOKIE_SECURE must be true in production',
        });
      }
      if (cfg.EMAIL_PROVIDER === 'console') {
        ctx.addIssue({
          code: 'custom',
          path: ['EMAIL_PROVIDER'],
          message: 'Configure a real email provider in production',
        });
      }
    }

    if (cfg.EMAIL_PROVIDER === 'smtp' && !cfg.SMTP_HOST) {
      ctx.addIssue({ code: 'custom', path: ['SMTP_HOST'], message: 'SMTP_HOST is required when EMAIL_PROVIDER=smtp' });
    }
    if (cfg.EMAIL_PROVIDER === 'resend' && !cfg.EMAIL_API_KEY) {
      ctx.addIssue({ code: 'custom', path: ['EMAIL_API_KEY'], message: 'EMAIL_API_KEY is required when EMAIL_PROVIDER=resend' });
    }
    if (cfg.STORAGE_DRIVER === 's3' && (!cfg.STORAGE_ACCESS_KEY || !cfg.STORAGE_SECRET_KEY)) {
      ctx.addIssue({
        code: 'custom',
        path: ['STORAGE_ACCESS_KEY'],
        message: 'S3 storage requires STORAGE_ACCESS_KEY and STORAGE_SECRET_KEY',
      });
    }
  });

export type Env = z.infer<typeof envSchema>;

function loadEnv(): Env {
  const parsed = envSchema.safeParse(process.env);
  if (!parsed.success) {
    const report = parsed.error.issues
      .map((issue) => `  • ${issue.path.join('.') || '(root)'}: ${issue.message}`)
      .join('\n');
    // eslint-disable-next-line no-console -- the logger does not exist yet at this point.
    console.error(`\nInvalid environment configuration:\n${report}\n\nSee .env.example for the full template.\n`);
    process.exit(1);
  }
  return parsed.data;
}

export const env = loadEnv();

export const isProduction = env.NODE_ENV === 'production';
export const isTest = env.NODE_ENV === 'test';
export const isDevelopment = env.NODE_ENV === 'development';

/**
 * Integration availability is derived from credentials, never assumed. Every
 * provider consults these before acting; when false the platform reports
 * "Not connected" instead of inventing a result.
 */
export const integrationsConfigured = {
  paystack: Boolean(env.PAYSTACK_SECRET_KEY && env.PAYSTACK_PUBLIC_KEY),
  google: Boolean(env.GOOGLE_CLIENT_ID && env.GOOGLE_CLIENT_SECRET),
  microsoft: Boolean(env.MICROSOFT_CLIENT_ID && env.MICROSOFT_CLIENT_SECRET),
  zoom: Boolean(env.ZOOM_CLIENT_ID && env.ZOOM_CLIENT_SECRET && env.ZOOM_ACCOUNT_ID),
  email: env.EMAIL_PROVIDER !== 'console',
  storage: env.STORAGE_DRIVER === 's3',
} as const;
