import argon2 from 'argon2';
import { randomUUID } from 'node:crypto';
import {
  DEFAULT_ROLE_PERMISSIONS,
  ERROR_CODES,
  expandPermissions,
  type AuthenticatedUser,
  type Permission,
  type Role,
} from '@meridian/types';
import { prisma } from '../lib/prisma.js';
import { env } from '../config/env.js';
import { AppError, forbidden, unauthorized } from '../lib/errors.js';
import { generateToken, hashToken } from '../lib/crypto.js';
import { addDays } from '../lib/time.js';
import { logger } from '../lib/logger.js';

/**
 * Argon2id parameters. These are the defaults recommended by OWASP for
 * interactive logins: 19 MiB of memory, 2 passes. They cost ~50 ms per hash on
 * commodity hardware, which is the point.
 */
const ARGON_OPTIONS: argon2.HashOptions & { raw?: false } = {
  type: argon2.argon2id,
  memoryCost: 19_456,
  timeCost: 2,
  parallelism: 1,
};

const MAX_FAILED_ATTEMPTS = 8;
const LOCK_DURATION_MINUTES = 15;

export async function hashPassword(password: string): Promise<string> {
  return argon2.hash(password, ARGON_OPTIONS);
}

export async function verifyPassword(hash: string, password: string): Promise<boolean> {
  try {
    return await argon2.verify(hash, password);
  } catch {
    return false;
  }
}

/* -------------------------------------------------------------------------- */
/* Permission resolution                                                      */
/* -------------------------------------------------------------------------- */

/**
 * Resolves a user's effective permissions from the database — the role→
 * permission grants are data, so an operator can re-shape a role without a
 * deploy. `DEFAULT_ROLE_PERMISSIONS` only seeds the initial grants.
 */
export async function resolvePermissions(userId: string): Promise<{
  roles: Role[];
  permissions: Permission[];
}> {
  const rows = await prisma.userRole.findMany({
    where: { userId },
    select: {
      role: {
        select: {
          name: true,
          permissions: { select: { permission: { select: { key: true } } } },
        },
      },
    },
  });

  const roles = rows.map((row) => row.role.name as Role);
  const granted = new Set<Permission>();
  for (const row of rows) {
    for (const rp of row.role.permissions) {
      granted.add(rp.permission.key as Permission);
    }
  }

  return { roles, permissions: [...expandPermissions(granted)] };
}

export function hasPermission(user: { permissions: Permission[] }, required: Permission): boolean {
  return user.permissions.includes(required);
}

export function requirePermission(
  user: { permissions: Permission[] } | null,
  required: Permission,
): void {
  if (!user) throw unauthorized();
  if (!hasPermission(user, required)) {
    throw forbidden('Your account does not have permission to do that.');
  }
}

/* -------------------------------------------------------------------------- */
/* Serialisation                                                              */
/* -------------------------------------------------------------------------- */

export interface UserRecord {
  id: string;
  email: string;
  firstName: string;
  lastName: string;
  avatarUrl: string | null;
  phone: string | null;
  company: string | null;
  jobTitle: string | null;
  timezone: string;
  emailVerified: boolean;
  marketingOptIn: boolean;
  createdAt: Date;
}

export async function toAuthenticatedUser(user: UserRecord): Promise<AuthenticatedUser> {
  const [{ roles, permissions }, consultant] = await Promise.all([
    resolvePermissions(user.id),
    prisma.consultantProfile.findUnique({ where: { userId: user.id }, select: { id: true } }),
  ]);

  return {
    id: user.id,
    email: user.email,
    firstName: user.firstName,
    lastName: user.lastName,
    avatarUrl: user.avatarUrl,
    phone: user.phone,
    company: user.company,
    jobTitle: user.jobTitle,
    timezone: user.timezone,
    emailVerified: user.emailVerified,
    marketingOptIn: user.marketingOptIn,
    roles,
    permissions,
    consultantProfileId: consultant?.id ?? null,
    createdAt: user.createdAt.toISOString(),
  };
}

/* -------------------------------------------------------------------------- */
/* Brute-force protection                                                     */
/* -------------------------------------------------------------------------- */

export function assertNotLocked(user: { lockedUntil: Date | null; isActive: boolean }): void {
  if (!user.isActive) {
    throw new AppError(
      ERROR_CODES.ACCOUNT_LOCKED,
      'This account has been deactivated. Contact support if you believe that is an error.',
      403,
    );
  }
  if (user.lockedUntil && user.lockedUntil > new Date()) {
    const minutes = Math.max(1, Math.ceil((user.lockedUntil.getTime() - Date.now()) / 60_000));
    throw new AppError(
      ERROR_CODES.ACCOUNT_LOCKED,
      `Too many failed sign-in attempts. Try again in ${minutes} minute${minutes === 1 ? '' : 's'}.`,
      423,
    );
  }
}

export async function recordFailedLogin(userId: string): Promise<void> {
  const user = await prisma.user.update({
    where: { id: userId },
    data: { failedLoginAttempts: { increment: 1 } },
    select: { failedLoginAttempts: true },
  });

  if (user.failedLoginAttempts >= MAX_FAILED_ATTEMPTS) {
    await prisma.user.update({
      where: { id: userId },
      data: {
        lockedUntil: new Date(Date.now() + LOCK_DURATION_MINUTES * 60_000),
        failedLoginAttempts: 0,
      },
    });
    logger.warn({ userId }, 'Account locked after repeated failed sign-in attempts');
  }
}

export async function recordSuccessfulLogin(userId: string): Promise<void> {
  await prisma.user.update({
    where: { id: userId },
    data: { failedLoginAttempts: 0, lockedUntil: null, lastLoginAt: new Date() },
  });
}

/* -------------------------------------------------------------------------- */
/* Refresh token rotation                                                     */
/* -------------------------------------------------------------------------- */

export interface IssuedRefreshToken {
  token: string;
  expiresAt: Date;
  familyId: string;
}

/**
 * Issues a refresh token. Tokens belong to a *family*: rotation keeps the
 * family id, so detecting reuse of a rotated token lets us revoke the whole
 * family rather than just the one credential.
 */
export async function issueRefreshToken(
  userId: string,
  context: { userAgent?: string; ip?: string; familyId?: string },
): Promise<IssuedRefreshToken> {
  const token = generateToken(48);
  const familyId = context.familyId ?? randomUUID();
  const expiresAt = addDays(new Date(), env.REFRESH_TOKEN_TTL_DAYS);

  await prisma.refreshToken.create({
    data: {
      userId,
      tokenHash: hashToken(token),
      familyId,
      expiresAt,
      userAgent: context.userAgent?.slice(0, 320) ?? null,
      ip: context.ip?.slice(0, 64) ?? null,
    },
  });

  return { token, expiresAt, familyId };
}

export interface RotationResult {
  userId: string;
  token: string;
  expiresAt: Date;
}

/**
 * Consumes a refresh token and issues its replacement inside one transaction.
 *
 * Reuse of an already-rotated token is treated as theft: every token in the
 * family is revoked, which signs the attacker *and* the legitimate user out and
 * forces a fresh login.
 */
export async function rotateRefreshToken(
  presentedToken: string,
  context: { userAgent?: string; ip?: string },
): Promise<RotationResult> {
  const tokenHash = hashToken(presentedToken);

  const existing = await prisma.refreshToken.findUnique({
    where: { tokenHash },
    select: {
      id: true,
      userId: true,
      familyId: true,
      expiresAt: true,
      revokedAt: true,
      user: { select: { isActive: true } },
    },
  });

  if (!existing) {
    throw new AppError(ERROR_CODES.TOKEN_INVALID, 'Your session is no longer valid. Please sign in again.', 401);
  }

  if (existing.revokedAt) {
    await prisma.refreshToken.updateMany({
      where: { familyId: existing.familyId, revokedAt: null },
      data: { revokedAt: new Date() },
    });
    logger.warn(
      { userId: existing.userId, familyId: existing.familyId },
      'Refresh token reuse detected — revoking token family',
    );
    throw new AppError(
      ERROR_CODES.SESSION_EXPIRED,
      'Your session was ended for security reasons. Please sign in again.',
      401,
    );
  }

  if (existing.expiresAt <= new Date()) {
    throw new AppError(ERROR_CODES.SESSION_EXPIRED, 'Your session has expired. Please sign in again.', 401);
  }

  if (!existing.user.isActive) {
    throw new AppError(ERROR_CODES.ACCOUNT_LOCKED, 'This account has been deactivated.', 403);
  }

  const replacement = generateToken(48);
  const expiresAt = addDays(new Date(), env.REFRESH_TOKEN_TTL_DAYS);

  await prisma.$transaction(async (tx) => {
    const created = await tx.refreshToken.create({
      data: {
        userId: existing.userId,
        tokenHash: hashToken(replacement),
        familyId: existing.familyId,
        expiresAt,
        userAgent: context.userAgent?.slice(0, 320) ?? null,
        ip: context.ip?.slice(0, 64) ?? null,
      },
      select: { id: true },
    });

    await tx.refreshToken.update({
      where: { id: existing.id },
      data: { revokedAt: new Date(), replacedById: created.id },
    });
  });

  return { userId: existing.userId, token: replacement, expiresAt };
}

export async function revokeRefreshToken(presentedToken: string): Promise<void> {
  await prisma.refreshToken.updateMany({
    where: { tokenHash: hashToken(presentedToken), revokedAt: null },
    data: { revokedAt: new Date() },
  });
}

export async function revokeAllUserSessions(userId: string): Promise<void> {
  await prisma.refreshToken.updateMany({
    where: { userId, revokedAt: null },
    data: { revokedAt: new Date() },
  });
}

/* -------------------------------------------------------------------------- */
/* Role assignment                                                            */
/* -------------------------------------------------------------------------- */

export async function assignRole(userId: string, roleName: Role, assignedBy?: string): Promise<void> {
  const role = await prisma.role.findUnique({ where: { name: roleName }, select: { id: true } });
  if (!role) throw new Error(`Role ${roleName} is not seeded`);

  await prisma.userRole.upsert({
    where: { userId_roleId: { userId, roleId: role.id } },
    create: { userId, roleId: role.id, assignedBy: assignedBy ?? null },
    update: {},
  });
}

/** Used by the seed and by the admin role editor to keep grants in sync. */
export function defaultPermissionsFor(role: Role): readonly Permission[] {
  return DEFAULT_ROLE_PERMISSIONS[role];
}
