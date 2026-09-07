import fp from 'fastify-plugin';
import fastifyJwt from '@fastify/jwt';
import type { FastifyReply, FastifyRequest } from 'fastify';
import type { AuthenticatedUser, Permission, Role } from '@meridian/types';
import { env, isProduction } from '../config/env.js';
import { prisma } from '../lib/prisma.js';
import { forbidden, unauthorized } from '../lib/errors.js';
import { toAuthenticatedUser } from '../services/auth.service.js';

/** Claims carried by the short-lived access token. */
export interface AccessTokenClaims {
  sub: string;
  email: string;
  /** Denormalised for cheap guards; the DB is still consulted on `authenticate`. */
  roles: Role[];
}

declare module 'fastify' {
  interface FastifyRequest {
    /** Populated by `authenticate`; null on public routes. */
    currentUser: AuthenticatedUser | null;
  }
  interface FastifyInstance {
    /** Rejects the request unless a valid access token is present. */
    authenticate: (request: FastifyRequest, reply: FastifyReply) => Promise<void>;
    /** Populates `currentUser` when a token is present, but never rejects. */
    optionalAuth: (request: FastifyRequest, reply: FastifyReply) => Promise<void>;
    /** Rejects unless the caller holds every listed permission. */
    requirePermissions: (
      ...permissions: Permission[]
    ) => (request: FastifyRequest, reply: FastifyReply) => Promise<void>;
    /** Rejects unless the caller holds at least one of the listed permissions. */
    requireAnyPermission: (
      ...permissions: Permission[]
    ) => (request: FastifyRequest, reply: FastifyReply) => Promise<void>;
  }
}

declare module '@fastify/jwt' {
  interface FastifyJWT {
    payload: AccessTokenClaims;
    user: AccessTokenClaims;
  }
}

export const REFRESH_COOKIE = 'meridian_rt';

export function refreshCookieOptions(expiresAt: Date) {
  return {
    httpOnly: true,
    secure: env.COOKIE_SECURE || isProduction,
    // `strict` would drop the cookie on the return leg from Paystack checkout,
    // signing the user out mid-payment. `lax` keeps top-level navigations working
    // while still blocking cross-site subrequests.
    sameSite: 'lax' as const,
    path: '/api/auth',
    expires: expiresAt,
    ...(env.COOKIE_DOMAIN ? { domain: env.COOKIE_DOMAIN } : {}),
  };
}

export const authPlugin = fp(async (app) => {
  await app.register(fastifyJwt, {
    secret: env.JWT_SECRET,
    sign: { expiresIn: env.ACCESS_TOKEN_TTL },
    // The refresh token is an opaque, hashed database row read from a cookie —
    // not a JWT — so @fastify/jwt only ever handles access tokens.
  });

  app.decorateRequest('currentUser', null);

  /**
   * Loads the user fresh from the database on every authenticated request.
   *
   * The token's role claims are treated as a hint only: a role revoked a minute
   * ago must not stay effective until the access token expires, and a client
   * that forges claims gains nothing.
   */
  async function loadUser(request: FastifyRequest): Promise<AuthenticatedUser | null> {
    const claims = request.user;
    if (!claims?.sub) return null;

    const user = await prisma.user.findUnique({
      where: { id: claims.sub },
      select: {
        id: true,
        email: true,
        firstName: true,
        lastName: true,
        avatarUrl: true,
        phone: true,
        company: true,
        jobTitle: true,
        timezone: true,
        emailVerified: true,
        marketingOptIn: true,
        isActive: true,
        createdAt: true,
      },
    });

    if (!user || !user.isActive) return null;
    return toAuthenticatedUser(user);
  }

  app.decorate('authenticate', async (request: FastifyRequest) => {
    try {
      await request.jwtVerify();
    } catch {
      throw unauthorized('Your session has expired. Please sign in again.');
    }
    const user = await loadUser(request);
    if (!user) throw unauthorized('Your session is no longer valid. Please sign in again.');
    request.currentUser = user;
  });

  app.decorate('optionalAuth', async (request: FastifyRequest) => {
    try {
      await request.jwtVerify();
      request.currentUser = await loadUser(request);
    } catch {
      request.currentUser = null;
    }
  });

  app.decorate(
    'requirePermissions',
    (...permissions: Permission[]) =>
      async (request: FastifyRequest, reply: FastifyReply) => {
        if (!request.currentUser) await app.authenticate(request, reply);
        const user = request.currentUser;
        if (!user) throw unauthorized();

        const missing = permissions.filter((p) => !user.permissions.includes(p));
        if (missing.length > 0) {
          request.log.info(
            { userId: user.id, missing, route: request.routeOptions.url },
            'Permission check failed',
          );
          throw forbidden('Your account does not have permission to do that.');
        }
      },
  );

  app.decorate(
    'requireAnyPermission',
    (...permissions: Permission[]) =>
      async (request: FastifyRequest, reply: FastifyReply) => {
        if (!request.currentUser) await app.authenticate(request, reply);
        const user = request.currentUser;
        if (!user) throw unauthorized();

        if (!permissions.some((p) => user.permissions.includes(p))) {
          request.log.info(
            { userId: user.id, required: permissions, route: request.routeOptions.url },
            'Permission check failed',
          );
          throw forbidden('Your account does not have permission to do that.');
        }
      },
  );
});

/** Narrowing helper for handlers that ran behind `authenticate`. */
export function requireUser(request: FastifyRequest): AuthenticatedUser {
  if (!request.currentUser) throw unauthorized();
  return request.currentUser;
}
