import Fastify from 'fastify';
import cookie from '@fastify/cookie';
import cors from '@fastify/cors';
import helmet from '@fastify/helmet';
import rateLimit from '@fastify/rate-limit';
import multipart from '@fastify/multipart';
import swagger from '@fastify/swagger';
import swaggerUi from '@fastify/swagger-ui';
import { randomUUID } from 'node:crypto';
import { env, integrationsConfigured, isProduction, isTest } from './config/env.js';
import { logger } from './lib/logger.js';
import { checkDatabase } from './lib/prisma.js';
import { authPlugin } from './plugins/auth.js';
import { errorHandlerPlugin } from './plugins/error-handler.js';
import { authRoutes } from './modules/auth/auth.routes.js';
import { paystackWebhookRoutes } from './modules/webhooks/paystack.webhook.js';
import { catalogRoutes } from './modules/catalog/catalog.routes.js';
import { bookingRoutes } from './modules/bookings/bookings.routes.js';
import { paymentRoutes } from './modules/payments/payments.routes.js';
import { sessionRoutes } from './modules/sessions/sessions.routes.js';
import { shopRoutes } from './modules/shop/shop.routes.js';
import { contentRoutes } from './modules/content/content.routes.js';
import { adminRoutes } from './modules/admin/admin.routes.js';
import { adminCatalogRoutes } from './modules/admin/admin-catalog.routes.js';
import { adminCommerceRoutes } from './modules/admin/admin-commerce.routes.js';
import { portalRoutes } from './modules/portal/portal.routes.js';
import { consultantRoutes } from './modules/consultant/consultant.routes.js';
import { discountRoutes } from './modules/admin/discount.routes.js';
import { brandingRoutes } from './modules/admin/branding.routes.js';
import { cleanupRoutes } from './modules/admin/cleanup.routes.js';

const MAX_UPLOAD_BYTES = 15 * 1024 * 1024;

/**
 * Assembles the whole application. The return type is inferred rather than
 * annotated as FastifyInstance because the pino logger instance specialises the
 * generic, and widening it back would discard our route-level typing.
 */
export async function buildApp() {
  const app = Fastify({
    loggerInstance: logger,
    // Correlates a user-visible error with its server log entry.
    genReqId: (req) => (req.headers['x-request-id'] as string | undefined) ?? randomUUID(),
    trustProxy: isProduction,
    bodyLimit: 1 * 1024 * 1024,
    // Request logging is silenced under test by the logger's own level rather
    // than the deprecated `disableRequestLogging` flag.
  });

  /* --- Security headers -------------------------------------------------- */

  await app.register(helmet, {
    // The API serves JSON and the Swagger UI, never user-authored HTML, so a
    // strict default-src is safe. Swagger's own assets are allow-listed.
    contentSecurityPolicy: {
      directives: {
        defaultSrc: ["'self'"],
        scriptSrc: ["'self'", "'unsafe-inline'"],
        styleSrc: ["'self'", "'unsafe-inline'"],
        imgSrc: ["'self'", 'data:', 'https:'],
        connectSrc: ["'self'"],
        frameAncestors: ["'none'"],
        objectSrc: ["'none'"],
      },
    },
    crossOriginResourcePolicy: { policy: 'same-site' },
    hsts: isProduction ? { maxAge: 31_536_000, includeSubDomains: true, preload: true } : false,
    referrerPolicy: { policy: 'strict-origin-when-cross-origin' },
  });

  /* --- CORS -------------------------------------------------------------- */

  const allowedOrigins = new Set(
    [env.APP_URL, isProduction ? null : 'http://localhost:5173', isProduction ? null : 'http://127.0.0.1:5173'].filter(
      (value): value is string => Boolean(value),
    ),
  );

  await app.register(cors, {
    origin(origin, callback) {
      // Same-origin and server-to-server requests arrive with no Origin header.
      if (!origin) return callback(null, true);
      if (allowedOrigins.has(origin)) return callback(null, true);
      logger.warn({ origin }, 'Blocked cross-origin request');
      return callback(null, false);
    },
    // The refresh token travels as a cookie, so credentialed requests are required.
    credentials: true,
    methods: ['GET', 'POST', 'PATCH', 'PUT', 'DELETE', 'OPTIONS'],
    allowedHeaders: ['Content-Type', 'Authorization', 'X-Request-Id', 'Idempotency-Key'],
    exposedHeaders: ['X-Request-Id'],
    maxAge: 86_400,
  });

  /* --- Body parsing ------------------------------------------------------ */

  /**
   * The single JSON body parser, doing two jobs Fastify's default cannot.
   *
   * First, it tolerates an empty body. Many HTTP clients set
   * `Content-Type: application/json` on every request, including a DELETE or a
   * POST that carries nothing; the default parser rejects that as malformed and
   * produces an opaque 400 for a perfectly well-formed request. An empty body
   * becomes `undefined` and the route's own schema decides whether one was
   * required.
   *
   * Second, it keeps the raw bytes on `request.rawBody` for signed webhooks.
   * Paystack signs the exact bytes it sent, so verifying against a re-serialised
   * object would fail on key order or number formatting. This must live here
   * rather than in the webhook plugin: Fastify allows only one parser per
   * content type across the whole instance.
   */
  app.addContentTypeParser('application/json', { parseAs: 'buffer' }, (request, body, done) => {
    const buffer = body as Buffer;
    request.rawBody = buffer;

    const text = buffer.toString('utf8').trim();
    if (text.length === 0) return done(null, undefined);

    try {
      done(null, JSON.parse(text));
    } catch {
      const error = new Error('The request body is not valid JSON.') as Error & { statusCode?: number };
      error.statusCode = 400;
      done(error, undefined);
    }
  });

  await app.register(cookie, { secret: env.JWT_SECRET, hook: 'onRequest' });

  await app.register(rateLimit, {
    global: true,
    max: env.RATE_LIMIT_MAX,
    timeWindow: env.RATE_LIMIT_WINDOW,
    // Rate limit by authenticated identity where available, so several users
    // behind one office NAT do not exhaust each other's budget.
    keyGenerator: (request) => request.currentUser?.id ?? request.ip,
    // Webhooks are authenticated by signature and must not be throttled away.
    allowList: (request) => request.url.startsWith('/api/webhooks/'),
  });

  await app.register(multipart, {
    limits: { fileSize: MAX_UPLOAD_BYTES, files: 5, fields: 20 },
  });

  await app.register(errorHandlerPlugin);
  await app.register(authPlugin);

  /* --- OpenAPI ----------------------------------------------------------- */

  if (!isTest) {
    await app.register(swagger, {
      openapi: {
        openapi: '3.1.0',
        info: {
          title: `${env.BUSINESS_NAME} API`,
          description:
            'Consultation booking, payments, client and consultant portals, commerce and content APIs.\n\n' +
            'All responses use a single envelope: `{ success: true, data }` or `{ success: false, error: { code, message } }`.\n\n' +
            'Authenticate with `Authorization: Bearer <accessToken>`. Access tokens are short-lived; refresh them at `POST /api/auth/refresh`, which reads an httpOnly cookie.',
          version: '1.0.0',
          contact: { name: 'Support', email: env.SUPPORT_EMAIL },
        },
        servers: [{ url: env.API_URL, description: env.NODE_ENV }],
        components: {
          securitySchemes: {
            bearerAuth: { type: 'http', scheme: 'bearer', bearerFormat: 'JWT' },
          },
        },
        tags: [
          { name: 'Auth', description: 'Registration, sign-in, tokens and profile' },
          { name: 'Services', description: 'Consultation catalog' },
          { name: 'Consultants', description: 'Consultant profiles and availability' },
          { name: 'Bookings', description: 'Booking lifecycle' },
          { name: 'Payments', description: 'Paystack initialisation, verification and refunds' },
          { name: 'Webhooks', description: 'Inbound provider callbacks' },
          { name: 'Sessions', description: 'Consultation sessions and notes' },
          { name: 'Reviews', description: 'Client reviews and moderation' },
          { name: 'Products', description: 'Books, journals and digital resources' },
          { name: 'Orders', description: 'Resource purchases and downloads' },
          { name: 'Content', description: 'Articles and journal publications' },
          { name: 'Portal', description: 'Client portal' },
          { name: 'Consultant Portal', description: 'Consultant workspace' },
          { name: 'Admin', description: 'Administrative operations' },
          { name: 'Analytics', description: 'Reporting and KPIs' },
          { name: 'Integrations', description: 'Calendar, video and payment connections' },
          { name: 'System', description: 'Health and configuration' },
        ],
      },
    });

    await app.register(swaggerUi, {
      routePrefix: '/docs',
      uiConfig: { docExpansion: 'list', deepLinking: true, persistAuthorization: true },
    });
  }

  /* --- System routes ----------------------------------------------------- */

  app.get(
    '/health',
    { schema: { tags: ['System'], summary: 'Liveness and database health' } },
    async (_request, reply) => {
      const database = await checkDatabase();
      const status = database.ok ? 200 : 503;
      return reply.status(status).send({
        success: database.ok,
        data: {
          status: database.ok ? 'healthy' : 'degraded',
          version: '1.0.0',
          environment: env.NODE_ENV,
          uptimeSeconds: Math.round(process.uptime()),
          database,
          integrations: integrationsConfigured,
        },
      });
    },
  );

  /* --- Feature routes ---------------------------------------------------- */

  await app.register(authRoutes, { prefix: '/api/auth' });
  await app.register(catalogRoutes, { prefix: '/api' });
  await app.register(bookingRoutes, { prefix: '/api/bookings' });
  await app.register(paymentRoutes, { prefix: '/api/payments' });
  await app.register(sessionRoutes, { prefix: '/api/sessions' });
  await app.register(shopRoutes, { prefix: '/api' });
  await app.register(contentRoutes, { prefix: '/api' });
  await app.register(adminRoutes, { prefix: '/api/admin' });
  await app.register(adminCatalogRoutes, { prefix: '/api/admin' });
  await app.register(adminCommerceRoutes, { prefix: '/api/admin' });
  await app.register(portalRoutes, { prefix: '/api' });
  await app.register(consultantRoutes, { prefix: '/api' });
  // Both carry their own /admin and public paths, so they mount at /api.
  await app.register(discountRoutes, { prefix: '/api' });
  await app.register(brandingRoutes, { prefix: '/api' });
  await app.register(cleanupRoutes, { prefix: '/api' });
  // Registered as its own plugin scope: the webhook installs a raw-body content
  // parser that must not leak into the JSON routes above.
  await app.register(paystackWebhookRoutes, { prefix: '/api/webhooks' });

  return app;
}
