import argon2 from 'argon2';
import { DateTime } from 'luxon';
import { DEFAULT_ROLE_PERMISSIONS, PERMISSIONS, ROLES, type Role } from '@meridian/types';
import { prisma } from '../../src/lib/prisma.js';

/**
 * Test fixtures. Each suite builds exactly the rows it needs on a truncated
 * database, so a test's assertions never depend on seed data it did not create.
 */

export const TEST_PASSWORD = 'TestPassword123!';
let cachedHash: string | null = null;

export async function testPasswordHash(): Promise<string> {
  // Argon2 is intentionally slow; hashing once per process keeps suites usable.
  cachedHash ??= await argon2.hash(TEST_PASSWORD, {
    type: argon2.argon2id,
    memoryCost: 19_456,
    timeCost: 2,
    parallelism: 1,
  });
  return cachedHash;
}

/**
 * Empties every table. Ordered by dependency and executed as one TRUNCATE so
 * foreign keys do not block it.
 */
export async function resetDatabase(): Promise<void> {
  await prisma.$executeRawUnsafe(`
    TRUNCATE TABLE
      audit_logs, email_logs, notifications, scheduled_jobs, webhook_events,
      discount_redemptions, discounts,
      download_entitlements, order_items, orders, digital_assets, products, product_categories,
      articles, article_categories,
      reviews, session_notes, attachments, consultation_sessions,
      refunds, invoices, payments,
      calendar_events, calendar_busy_blocks, calendar_connections,
      video_meetings, booking_status_events, bookings,
      availability_blackouts, availability_rules,
      service_consultants, service_durations, services, service_categories,
      consultant_profiles, client_profiles,
      verification_tokens, refresh_tokens, user_roles, role_permissions,
      permissions, roles, users,
      settings, integrations, contact_messages
    RESTART IDENTITY CASCADE
  `);
}

export async function seedRolesAndPermissions(): Promise<Map<Role, string>> {
  for (const [key, description] of Object.entries(PERMISSIONS)) {
    await prisma.permission.upsert({ where: { key }, create: { key, description }, update: {} });
  }

  const roleIds = new Map<Role, string>();
  for (const roleName of Object.values(ROLES)) {
    const role = await prisma.role.upsert({
      where: { name: roleName },
      create: { name: roleName, label: roleName },
      update: {},
    });
    roleIds.set(roleName, role.id);

    const permissions = await prisma.permission.findMany({
      where: { key: { in: [...DEFAULT_ROLE_PERMISSIONS[roleName]] } },
      select: { id: true },
    });
    await prisma.rolePermission.deleteMany({ where: { roleId: role.id } });
    await prisma.rolePermission.createMany({
      data: permissions.map((p) => ({ roleId: role.id, permissionId: p.id })),
      skipDuplicates: true,
    });
  }
  return roleIds;
}

export interface CreatedUser {
  id: string;
  email: string;
}

export async function createUser(options: {
  email: string;
  role: Role;
  firstName?: string;
  lastName?: string;
  emailVerified?: boolean;
}): Promise<CreatedUser> {
  const user = await prisma.user.create({
    data: {
      email: options.email,
      passwordHash: await testPasswordHash(),
      firstName: options.firstName ?? 'Test',
      lastName: options.lastName ?? 'User',
      timezone: 'Africa/Nairobi',
      emailVerified: options.emailVerified ?? true,
    },
    select: { id: true, email: true },
  });

  const role = await prisma.role.findUniqueOrThrow({ where: { name: options.role } });
  await prisma.userRole.create({ data: { userId: user.id, roleId: role.id } });
  return user;
}

export async function createClient(options: {
  email: string;
  code?: string;
}): Promise<{ userId: string; clientProfileId: string; email: string }> {
  const user = await createUser({ email: options.email, role: ROLES.CLIENT });
  const profile = await prisma.clientProfile.create({
    data: { userId: user.id, clientCode: options.code ?? `CL-${Math.random().toString(36).slice(2, 10)}` },
    select: { id: true },
  });
  return { userId: user.id, clientProfileId: profile.id, email: user.email };
}

export async function createConsultant(options: {
  email: string;
  slug: string;
  timezone?: string;
  slotIntervalMinutes?: number;
  /** Weekday (0=Sun) → working blocks. Defaults to Mon–Fri 09:00–17:00. */
  workingHours?: Record<number, [string, string][]>;
}): Promise<{ userId: string; consultantProfileId: string }> {
  const user = await createUser({ email: options.email, role: ROLES.CONSULTANT });
  const profile = await prisma.consultantProfile.create({
    data: {
      userId: user.id,
      slug: options.slug,
      title: 'Test Consultant',
      biography: 'Fixture consultant.',
      specialties: ['Testing'],
      qualifications: ['None'],
      languages: ['English'],
      yearsExperience: 5,
      timezone: options.timezone ?? 'Africa/Nairobi',
      slotIntervalMinutes: options.slotIntervalMinutes ?? 30,
      isPublished: true,
      isAcceptingBookings: true,
    },
    select: { id: true },
  });

  const hours = options.workingHours ?? {
    1: [['09:00', '17:00']],
    2: [['09:00', '17:00']],
    3: [['09:00', '17:00']],
    4: [['09:00', '17:00']],
    5: [['09:00', '17:00']],
  };

  await prisma.availabilityRule.createMany({
    data: Object.entries(hours).flatMap(([weekday, blocks]) =>
      blocks.map(([startTime, endTime]) => ({
        consultantId: profile.id,
        weekday: Number(weekday),
        startTime,
        endTime,
        isActive: true,
      })),
    ),
  });

  return { userId: user.id, consultantProfileId: profile.id };
}

export interface CreatedService {
  id: string;
  slug: string;
  defaultDurationMinutes: number;
  defaultPrice: number;
}

export async function createService(options: {
  slug: string;
  consultantIds: string[];
  paymentModel?: 'FULL_PAYMENT' | 'FIXED_DEPOSIT' | 'PERCENTAGE_DEPOSIT' | 'FREE';
  depositAmount?: number;
  depositPercentBps?: number;
  taxRateBps?: number;
  price?: number;
  durationMinutes?: number;
  leadTimeHours?: number;
  bufferAfterMinutes?: number;
  cancellationWindowHours?: number;
  rescheduleWindowHours?: number;
}): Promise<CreatedService> {
  const category = await prisma.serviceCategory.upsert({
    where: { slug: 'test-category' },
    create: { name: 'Test Category', slug: 'test-category' },
    update: {},
  });

  const price = options.price ?? 250_000;
  const minutes = options.durationMinutes ?? 60;

  const service = await prisma.service.create({
    data: {
      name: `Service ${options.slug}`,
      slug: options.slug,
      categoryId: category.id,
      shortDescription: 'Fixture service used by the test suite.',
      fullDescription: 'Fixture service used by the test suite.',
      currency: 'KES',
      paymentModel: options.paymentModel ?? 'FULL_PAYMENT',
      depositAmount: options.depositAmount ?? null,
      depositPercentBps: options.depositPercentBps ?? null,
      taxRateBps: options.taxRateBps ?? 0,
      meetingProviders: ['ZOOM', 'GOOGLE_MEET', 'MICROSOFT_TEAMS'],
      status: 'PUBLISHED',
      leadTimeHours: options.leadTimeHours ?? 1,
      bookingHorizonDays: 60,
      bufferBeforeMinutes: 0,
      bufferAfterMinutes: options.bufferAfterMinutes ?? 0,
      cancellationWindowHours: options.cancellationWindowHours ?? 24,
      rescheduleWindowHours: options.rescheduleWindowHours ?? 24,
      durations: {
        create: [{ minutes, price, isDefault: true }],
      },
      consultants: {
        create: options.consultantIds.map((consultantId) => ({ consultantId })),
      },
    },
    select: { id: true, slug: true },
  });

  return { id: service.id, slug: service.slug, defaultDurationMinutes: minutes, defaultPrice: price };
}

/**
 * A start time guaranteed to fall inside default 09:00–17:00 fixture hours,
 * on a weekday, far enough ahead to clear a 1-hour lead time.
 */
export function nextWorkingSlot(daysAhead = 3, hour = 10, zone = 'Africa/Nairobi'): Date {
  let dt = DateTime.now().setZone(zone).startOf('day').plus({ days: daysAhead }).set({ hour });
  while (dt.weekday === 6 || dt.weekday === 7) dt = dt.plus({ days: 1 });
  return dt.toJSDate();
}
