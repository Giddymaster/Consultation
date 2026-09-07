import type { FastifyInstance } from 'fastify';
import {
  changePasswordSchema,
  forgotPasswordSchema,
  loginSchema,
  registerSchema,
  resetPasswordSchema,
  updateProfileSchema,
  verifyEmailSchema,
  ERROR_CODES,
  ROLES,
  type AuthResult,
} from '@meridian/types';
import { prisma } from '../../lib/prisma.js';
import { env } from '../../config/env.js';
import { AppError, badRequest, unauthorized } from '../../lib/errors.js';
import { ok, noContent } from '../../lib/http.js';
import { generateToken, hashToken } from '../../lib/crypto.js';
import { addHours } from '../../lib/time.js';
import { REFRESH_COOKIE, refreshCookieOptions, requireUser } from '../../plugins/auth.js';
import {
  assignRole,
  hashPassword,
  issueRefreshToken,
  recordFailedLogin,
  recordSuccessfulLogin,
  revokeAllUserSessions,
  revokeRefreshToken,
  rotateRefreshToken,
  assertNotLocked,
  toAuthenticatedUser,
  verifyPassword,
} from '../../services/auth.service.js';
import { AUDIT_ACTIONS, auditContextFrom, recordAudit } from '../../services/audit.service.js';
import {
  sendPasswordResetEmail,
  sendVerificationEmail,
  sendWelcomeEmail,
} from '../../services/email/messages.js';

const USER_SELECT = {
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
  createdAt: true,
} as const;

/** Next sequential client code, e.g. CL-000142. */
async function nextClientCode(): Promise<string> {
  const count = await prisma.clientProfile.count();
  return `CL-${String(count + 1).padStart(6, '0')}`;
}

export async function authRoutes(app: FastifyInstance): Promise<void> {
  /* ---------------------------------------------------------------------- */
  /* Registration                                                           */
  /* ---------------------------------------------------------------------- */

  app.post(
    '/register',
    {
      config: { rateLimit: { max: 10, timeWindow: '10 minutes' } },
      schema: {
        tags: ['Auth'],
        summary: 'Create a client account',
        description:
          'Registers a client and sends a verification email. New accounts always receive the CLIENT role; elevated roles are assignable only from Admin → Users.',
      },
    },
    async (request, reply) => {
      const input = registerSchema.parse(request.body);

      const existing = await prisma.user.findUnique({
        where: { email: input.email },
        select: { id: true },
      });
      if (existing) {
        throw new AppError(
          ERROR_CODES.EMAIL_TAKEN,
          'An account with that email already exists. Try signing in instead.',
          409,
        );
      }

      const passwordHash = await hashPassword(input.password);
      const verificationToken = generateToken(32);

      const user = await prisma.$transaction(async (tx) => {
        const created = await tx.user.create({
          data: {
            email: input.email,
            passwordHash,
            firstName: input.firstName,
            lastName: input.lastName,
            phone: input.phone ?? null,
            company: input.company ?? null,
            timezone: input.timezone ?? env.BUSINESS_TIMEZONE,
            marketingOptIn: input.marketingOptIn,
          },
          select: USER_SELECT,
        });

        await tx.clientProfile.create({
          data: { userId: created.id, clientCode: await nextClientCode() },
        });

        await tx.verificationToken.create({
          data: {
            userId: created.id,
            tokenHash: hashToken(verificationToken),
            purpose: 'EMAIL_VERIFICATION',
            expiresAt: addHours(new Date(), 24),
          },
        });

        return created;
      });

      // The role grant is a separate step because it reads the seeded Role row.
      await assignRole(user.id, ROLES.CLIENT);

      await sendVerificationEmail({
        to: user.email,
        firstName: user.firstName,
        token: verificationToken,
      });

      await recordAudit({
        actorId: user.id,
        action: AUDIT_ACTIONS.USER_REGISTERED,
        entity: 'User',
        entityId: user.id,
        context: auditContextFrom(request),
      });

      const authUser = await toAuthenticatedUser(user);
      const refresh = await issueRefreshToken(user.id, {
        userAgent: request.headers['user-agent'],
        ip: request.ip,
      });

      reply.setCookie(REFRESH_COOKIE, refresh.token, refreshCookieOptions(refresh.expiresAt));

      const accessToken = app.jwt.sign({
        sub: user.id,
        email: user.email,
        roles: authUser.roles,
      });

      const result: AuthResult = {
        user: authUser,
        tokens: { accessToken, expiresIn: 15 * 60 },
      };
      return ok(reply, result, 201);
    },
  );

  /* ---------------------------------------------------------------------- */
  /* Login                                                                  */
  /* ---------------------------------------------------------------------- */

  app.post(
    '/login',
    {
      config: { rateLimit: { max: 12, timeWindow: '5 minutes' } },
      schema: { tags: ['Auth'], summary: 'Sign in with email and password' },
    },
    async (request, reply) => {
      const input = loginSchema.parse(request.body);

      const user = await prisma.user.findUnique({
        where: { email: input.email },
        select: { ...USER_SELECT, passwordHash: true, isActive: true, lockedUntil: true },
      });

      // Identical response whether the email is unknown or the password is
      // wrong, so the endpoint cannot be used to enumerate registered accounts.
      const invalid = () =>
        new AppError(ERROR_CODES.INVALID_CREDENTIALS, 'That email and password combination is not correct.', 401);

      if (!user) {
        // Burn comparable time so a missing account is not measurably faster.
        await verifyPassword(
          '$argon2id$v=19$m=19456,t=2,p=1$c29tZXNhbHRzb21lc2FsdA$0000000000000000000000000000000000000000000',
          input.password,
        );
        throw invalid();
      }

      assertNotLocked(user);

      const passwordValid = await verifyPassword(user.passwordHash, input.password);
      if (!passwordValid) {
        await recordFailedLogin(user.id);
        await recordAudit({
          actorId: user.id,
          action: AUDIT_ACTIONS.USER_LOGIN_FAILED,
          entity: 'User',
          entityId: user.id,
          context: auditContextFrom(request),
        });
        throw invalid();
      }

      await recordSuccessfulLogin(user.id);

      const authUser = await toAuthenticatedUser(user);
      const refresh = await issueRefreshToken(user.id, {
        userAgent: request.headers['user-agent'],
        ip: request.ip,
      });

      reply.setCookie(REFRESH_COOKIE, refresh.token, refreshCookieOptions(refresh.expiresAt));

      await recordAudit({
        actorId: user.id,
        action: AUDIT_ACTIONS.USER_LOGIN,
        entity: 'User',
        entityId: user.id,
        context: auditContextFrom(request),
      });

      const result: AuthResult = {
        user: authUser,
        tokens: {
          accessToken: app.jwt.sign({ sub: user.id, email: user.email, roles: authUser.roles }),
          expiresIn: 15 * 60,
        },
      };
      return ok(reply, result);
    },
  );

  /* ---------------------------------------------------------------------- */
  /* Session lifecycle                                                      */
  /* ---------------------------------------------------------------------- */

  app.post(
    '/refresh',
    {
      config: { rateLimit: { max: 60, timeWindow: '5 minutes' } },
      schema: {
        tags: ['Auth'],
        summary: 'Exchange the refresh cookie for a new access token',
        description:
          'Rotates the refresh token. Presenting an already-rotated token revokes the entire token family, on the assumption it was stolen.',
      },
    },
    async (request, reply) => {
      const presented = request.cookies[REFRESH_COOKIE];
      if (!presented) throw unauthorized('Your session has ended. Please sign in again.');

      const rotated = await rotateRefreshToken(presented, {
        userAgent: request.headers['user-agent'],
        ip: request.ip,
      });

      const user = await prisma.user.findUnique({
        where: { id: rotated.userId },
        select: USER_SELECT,
      });
      if (!user) throw unauthorized();

      const authUser = await toAuthenticatedUser(user);
      reply.setCookie(REFRESH_COOKIE, rotated.token, refreshCookieOptions(rotated.expiresAt));

      const result: AuthResult = {
        user: authUser,
        tokens: {
          accessToken: app.jwt.sign({ sub: user.id, email: user.email, roles: authUser.roles }),
          expiresIn: 15 * 60,
        },
      };
      return ok(reply, result);
    },
  );

  app.post('/logout', { schema: { tags: ['Auth'], summary: 'Sign out of this device' } }, async (request, reply) => {
    const presented = request.cookies[REFRESH_COOKIE];
    if (presented) await revokeRefreshToken(presented);

    reply.clearCookie(REFRESH_COOKIE, { path: '/api/auth' });

    await recordAudit({
      actorId: request.currentUser?.id ?? null,
      action: AUDIT_ACTIONS.USER_LOGOUT,
      entity: 'User',
      entityId: request.currentUser?.id ?? null,
      context: auditContextFrom(request),
    });

    return noContent(reply);
  });

  app.get(
    '/me',
    {
      preHandler: [app.authenticate],
      schema: { tags: ['Auth'], summary: 'The signed-in user, with resolved permissions' },
    },
    async (request, reply) => ok(reply, requireUser(request)),
  );

  /* ---------------------------------------------------------------------- */
  /* Email verification                                                     */
  /* ---------------------------------------------------------------------- */

  app.post(
    '/verify-email',
    { schema: { tags: ['Auth'], summary: 'Confirm an email address' } },
    async (request, reply) => {
      const { token } = verifyEmailSchema.parse(request.body);

      const record = await prisma.verificationToken.findUnique({
        where: { tokenHash: hashToken(token) },
        select: { id: true, userId: true, purpose: true, expiresAt: true, usedAt: true },
      });

      if (!record || record.purpose !== 'EMAIL_VERIFICATION' || record.usedAt) {
        throw new AppError(ERROR_CODES.TOKEN_INVALID, 'That verification link is not valid.', 400);
      }
      if (record.expiresAt <= new Date()) {
        throw new AppError(
          ERROR_CODES.TOKEN_EXPIRED,
          'That verification link has expired. Request a new one from your profile.',
          400,
        );
      }

      const user = await prisma.$transaction(async (tx) => {
        await tx.verificationToken.update({ where: { id: record.id }, data: { usedAt: new Date() } });
        return tx.user.update({
          where: { id: record.userId },
          data: { emailVerified: true },
          select: USER_SELECT,
        });
      });

      await sendWelcomeEmail({ to: user.email, firstName: user.firstName });
      await recordAudit({
        actorId: user.id,
        action: AUDIT_ACTIONS.USER_EMAIL_VERIFIED,
        entity: 'User',
        entityId: user.id,
        context: auditContextFrom(request),
      });

      return ok(reply, await toAuthenticatedUser(user));
    },
  );

  app.post(
    '/resend-verification',
    {
      preHandler: [app.authenticate],
      config: { rateLimit: { max: 3, timeWindow: '15 minutes' } },
      schema: { tags: ['Auth'], summary: 'Send a fresh verification email' },
    },
    async (request, reply) => {
      const current = requireUser(request);
      if (current.emailVerified) return noContent(reply);

      const token = generateToken(32);
      await prisma.verificationToken.create({
        data: {
          userId: current.id,
          tokenHash: hashToken(token),
          purpose: 'EMAIL_VERIFICATION',
          expiresAt: addHours(new Date(), 24),
        },
      });

      await sendVerificationEmail({ to: current.email, firstName: current.firstName, token });
      return noContent(reply);
    },
  );

  /* ---------------------------------------------------------------------- */
  /* Password reset                                                         */
  /* ---------------------------------------------------------------------- */

  app.post(
    '/forgot-password',
    {
      config: { rateLimit: { max: 5, timeWindow: '15 minutes' } },
      schema: {
        tags: ['Auth'],
        summary: 'Request a password reset link',
        description:
          'Always returns 204, whether or not the address is registered, so the endpoint cannot confirm which emails have accounts.',
      },
    },
    async (request, reply) => {
      const { email } = forgotPasswordSchema.parse(request.body);

      const user = await prisma.user.findUnique({
        where: { email },
        select: { id: true, email: true, firstName: true, isActive: true },
      });

      if (user?.isActive) {
        const token = generateToken(32);
        await prisma.verificationToken.create({
          data: {
            userId: user.id,
            tokenHash: hashToken(token),
            purpose: 'PASSWORD_RESET',
            expiresAt: addHours(new Date(), 1),
          },
        });
        await sendPasswordResetEmail({ to: user.email, firstName: user.firstName, token });
        await recordAudit({
          actorId: user.id,
          action: AUDIT_ACTIONS.USER_PASSWORD_RESET_REQUESTED,
          entity: 'User',
          entityId: user.id,
          context: auditContextFrom(request),
        });
      }

      return noContent(reply);
    },
  );

  app.post(
    '/reset-password',
    {
      config: { rateLimit: { max: 8, timeWindow: '15 minutes' } },
      schema: { tags: ['Auth'], summary: 'Set a new password using a reset token' },
    },
    async (request, reply) => {
      const input = resetPasswordSchema.parse(request.body);

      const record = await prisma.verificationToken.findUnique({
        where: { tokenHash: hashToken(input.token) },
        select: { id: true, userId: true, purpose: true, expiresAt: true, usedAt: true },
      });

      if (!record || record.purpose !== 'PASSWORD_RESET' || record.usedAt) {
        throw new AppError(ERROR_CODES.TOKEN_INVALID, 'That reset link is not valid.', 400);
      }
      if (record.expiresAt <= new Date()) {
        throw new AppError(ERROR_CODES.TOKEN_EXPIRED, 'That reset link has expired. Request a new one.', 400);
      }

      const passwordHash = await hashPassword(input.password);

      await prisma.$transaction(async (tx) => {
        await tx.verificationToken.update({ where: { id: record.id }, data: { usedAt: new Date() } });
        await tx.user.update({
          where: { id: record.userId },
          data: { passwordHash, failedLoginAttempts: 0, lockedUntil: null },
        });
      });

      // A password change ends every existing session — the whole point of a
      // reset is to lock out whoever might already be signed in.
      await revokeAllUserSessions(record.userId);
      reply.clearCookie(REFRESH_COOKIE, { path: '/api/auth' });

      await recordAudit({
        actorId: record.userId,
        action: AUDIT_ACTIONS.USER_PASSWORD_CHANGED,
        entity: 'User',
        entityId: record.userId,
        metadata: { via: 'reset' },
        context: auditContextFrom(request),
      });

      return noContent(reply);
    },
  );

  app.post(
    '/change-password',
    {
      preHandler: [app.authenticate],
      schema: { tags: ['Auth'], summary: 'Change password while signed in' },
    },
    async (request, reply) => {
      const current = requireUser(request);
      const input = changePasswordSchema.parse(request.body);

      const user = await prisma.user.findUnique({
        where: { id: current.id },
        select: { passwordHash: true },
      });
      if (!user) throw unauthorized();

      if (!(await verifyPassword(user.passwordHash, input.currentPassword))) {
        throw badRequest('Your current password is not correct.', [
          { path: 'currentPassword', message: 'That password is not correct' },
        ]);
      }

      await prisma.user.update({
        where: { id: current.id },
        data: { passwordHash: await hashPassword(input.password) },
      });
      await revokeAllUserSessions(current.id);
      reply.clearCookie(REFRESH_COOKIE, { path: '/api/auth' });

      await recordAudit({
        actorId: current.id,
        action: AUDIT_ACTIONS.USER_PASSWORD_CHANGED,
        entity: 'User',
        entityId: current.id,
        metadata: { via: 'self-service' },
        context: auditContextFrom(request),
      });

      return noContent(reply);
    },
  );

  /* ---------------------------------------------------------------------- */
  /* Profile                                                                */
  /* ---------------------------------------------------------------------- */

  app.patch(
    '/profile',
    { preHandler: [app.authenticate], schema: { tags: ['Auth'], summary: 'Update your own profile' } },
    async (request, reply) => {
      const current = requireUser(request);
      const input = updateProfileSchema.parse(request.body);

      const user = await prisma.user.update({
        where: { id: current.id },
        data: input,
        select: USER_SELECT,
      });

      return ok(reply, await toAuthenticatedUser(user));
    },
  );
}
