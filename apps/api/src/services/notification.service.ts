import type { NotificationType } from '@meridian/types';
import { prisma } from '../lib/prisma.js';
import { logger } from '../lib/logger.js';

/**
 * In-app notifications. Kept non-fatal on purpose: failing to write a
 * notification must never fail the operation that triggered it.
 */

export interface NotifyArgs {
  userId: string;
  type: NotificationType;
  title: string;
  body: string;
  href?: string;
  metadata?: Record<string, unknown>;
}

export async function notify(args: NotifyArgs): Promise<void> {
  try {
    await prisma.notification.create({
      data: {
        userId: args.userId,
        type: args.type,
        title: args.title.slice(0, 200),
        body: args.body.slice(0, 1000),
        href: args.href?.slice(0, 500) ?? null,
        metadata: (args.metadata ?? undefined) as never,
      },
    });
  } catch (error) {
    logger.error({ err: error, userId: args.userId, type: args.type }, 'Failed to create notification');
  }
}

/** Fan-out to everyone holding one of the given roles. */
export async function notifyRoles(
  roles: string[],
  args: Omit<NotifyArgs, 'userId'>,
): Promise<void> {
  const users = await prisma.user.findMany({
    where: { isActive: true, roles: { some: { role: { name: { in: roles as never[] } } } } },
    select: { id: true },
    take: 50,
  });
  await Promise.all(users.map((user) => notify({ ...args, userId: user.id })));
}

export async function markRead(userId: string, notificationId: string): Promise<void> {
  // Scoped by userId so one user cannot mark another's notification read.
  await prisma.notification.updateMany({
    where: { id: notificationId, userId, readAt: null },
    data: { readAt: new Date() },
  });
}

export async function markAllRead(userId: string): Promise<number> {
  const result = await prisma.notification.updateMany({
    where: { userId, readAt: null },
    data: { readAt: new Date() },
  });
  return result.count;
}

export async function unreadCount(userId: string): Promise<number> {
  return prisma.notification.count({ where: { userId, readAt: null } });
}
