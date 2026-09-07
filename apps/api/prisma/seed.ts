import 'dotenv/config';
import argon2 from 'argon2';
import { PrismaPg } from '@prisma/adapter-pg';
import { DateTime } from 'luxon';
import { PrismaClient } from '../src/generated/prisma/client.js';
import { DEFAULT_ROLE_PERMISSIONS, PERMISSIONS, ROLES, type Role } from '@meridian/types';
import {
  ARTICLES,
  ARTICLE_CATEGORIES,
  CLIENTS,
  CONSULTANTS,
  PRODUCTS,
  PRODUCT_CATEGORIES,
  REVIEW_BODIES,
  SERVICES,
  SERVICE_CATEGORIES,
} from './seed-data.js';

/**
 * Seeds a complete, coherent demo dataset: roles and permissions, staff and
 * client accounts, the service catalog, availability, and ~30 bookings spread
 * across the past and future with payments, sessions, notes and reviews that
 * agree with each other.
 *
 * The script is idempotent — every write is an upsert keyed on a natural key,
 * so re-running it updates rather than duplicating.
 */

const adapter = new PrismaPg({ connectionString: process.env.DATABASE_URL! });
const prisma = new PrismaClient({ adapter });

const BUSINESS_TZ = process.env.BUSINESS_TIMEZONE ?? 'Africa/Nairobi';
const DEMO_PASSWORD = process.env.SEED_PASSWORD ?? 'Meridian2026!Demo';

/** Deterministic PRNG so repeated seeds produce the same dataset. */
function makeRandom(seed: number) {
  let state = seed >>> 0;
  return () => {
    state = (state * 1_664_525 + 1_013_904_223) >>> 0;
    return state / 0x1_0000_0000;
  };
}
const random = makeRandom(20260906);

function pick<T>(items: readonly T[]): T {
  return items[Math.floor(random() * items.length)]!;
}

function randomInt(min: number, max: number): number {
  return Math.floor(random() * (max - min + 1)) + min;
}

const REFERENCE_ALPHABET = '23456789ABCDEFGHJKLMNPQRSTUVWXYZ';
function reference(prefix: string, length = 6): string {
  let out = '';
  for (let i = 0; i < length; i += 1) out += REFERENCE_ALPHABET[Math.floor(random() * REFERENCE_ALPHABET.length)];
  return `${prefix}-${out}`;
}

function log(step: string, detail?: string): void {
  process.stdout.write(`  ${step}${detail ? ` — ${detail}` : ''}\n`);
}

/**
 * Places a booking on a weekday at a plausible working hour, in business time.
 * `dayOffset` is relative to today: negative for history, positive for future.
 */
function scheduleAt(dayOffset: number, hour: number, minute = 0): Date {
  let dt = DateTime.now()
    .setZone(BUSINESS_TZ)
    .startOf('day')
    .plus({ days: dayOffset })
    .set({ hour, minute });
  // Nudge weekends onto the following Monday so slots land inside working hours.
  if (dt.weekday === 6) dt = dt.plus({ days: 2 });
  if (dt.weekday === 7) dt = dt.plus({ days: 1 });
  return dt.toJSDate();
}

async function main(): Promise<void> {
  process.stdout.write('\nSeeding Meridian Advisory\n\n');
  const passwordHash = await argon2.hash(DEMO_PASSWORD, {
    type: argon2.argon2id,
    memoryCost: 19_456,
    timeCost: 2,
    parallelism: 1,
  });

  /* ---------------------------------------------------------------------- */
  /* 1. Permissions and roles                                               */
  /* ---------------------------------------------------------------------- */

  for (const [key, description] of Object.entries(PERMISSIONS)) {
    await prisma.permission.upsert({
      where: { key },
      create: { key, description },
      update: { description },
    });
  }
  log('Permissions', `${Object.keys(PERMISSIONS).length} capabilities`);

  const ROLE_LABELS: Record<Role, { label: string; description: string }> = {
    SUPER_ADMIN: { label: 'Super Administrator', description: 'Unrestricted access, including platform settings.' },
    ADMIN: { label: 'Administrator', description: 'Full operational access across bookings, clients and content.' },
    CONSULTANT: { label: 'Consultant', description: 'Own sessions, clients, availability and private notes.' },
    CLIENT: { label: 'Client', description: 'Own bookings, payments, resources and reviews.' },
    CONTENT_MANAGER: { label: 'Content Manager', description: 'Articles, journal, products and review moderation.' },
    FINANCE_MANAGER: { label: 'Finance Manager', description: 'Payments, refunds, invoices and financial reporting.' },
  };

  const roleIds = new Map<Role, string>();
  for (const roleName of Object.values(ROLES)) {
    const meta = ROLE_LABELS[roleName];
    const role = await prisma.role.upsert({
      where: { name: roleName },
      create: { name: roleName, label: meta.label, description: meta.description },
      update: { label: meta.label, description: meta.description },
    });
    roleIds.set(roleName, role.id);

    const permissionKeys = DEFAULT_ROLE_PERMISSIONS[roleName];
    const permissions = await prisma.permission.findMany({
      where: { key: { in: [...permissionKeys] } },
      select: { id: true },
    });

    // Replace grants wholesale so a changed default is reflected on re-seed.
    await prisma.rolePermission.deleteMany({ where: { roleId: role.id } });
    await prisma.rolePermission.createMany({
      data: permissions.map((p) => ({ roleId: role.id, permissionId: p.id })),
      skipDuplicates: true,
    });
  }
  log('Roles', `${roleIds.size} roles with default grants`);

  async function grantRole(userId: string, roleName: Role): Promise<void> {
    const roleId = roleIds.get(roleName)!;
    await prisma.userRole.upsert({
      where: { userId_roleId: { userId, roleId } },
      create: { userId, roleId },
      update: {},
    });
  }

  /* ---------------------------------------------------------------------- */
  /* 2. Staff accounts                                                      */
  /* ---------------------------------------------------------------------- */

  const owner = await prisma.user.upsert({
    where: { email: 'admin@meridianadvisory.co.ke' },
    create: {
      email: 'admin@meridianadvisory.co.ke',
      passwordHash,
      firstName: 'Meridian',
      lastName: 'Administrator',
      timezone: BUSINESS_TZ,
      emailVerified: true,
      jobTitle: 'Platform Administrator',
    },
    update: { passwordHash, emailVerified: true },
  });
  await grantRole(owner.id, ROLES.SUPER_ADMIN);

  const financeManager = await prisma.user.upsert({
    where: { email: 'finance@meridianadvisory.co.ke' },
    create: {
      email: 'finance@meridianadvisory.co.ke',
      passwordHash,
      firstName: 'Joan',
      lastName: 'Kilonzo',
      timezone: BUSINESS_TZ,
      emailVerified: true,
      jobTitle: 'Finance Manager',
    },
    update: { passwordHash, emailVerified: true },
  });
  await grantRole(financeManager.id, ROLES.FINANCE_MANAGER);

  const contentManager = await prisma.user.upsert({
    where: { email: 'editor@meridianadvisory.co.ke' },
    create: {
      email: 'editor@meridianadvisory.co.ke',
      passwordHash,
      firstName: 'Wanjiku',
      lastName: 'Ndegwa',
      timezone: BUSINESS_TZ,
      emailVerified: true,
      jobTitle: 'Editorial Manager',
    },
    update: { passwordHash, emailVerified: true },
  });
  await grantRole(contentManager.id, ROLES.CONTENT_MANAGER);
  log('Staff', 'super admin, finance manager, content manager');

  /* ---------------------------------------------------------------------- */
  /* 3. Consultants                                                         */
  /* ---------------------------------------------------------------------- */

  const consultantIdBySlug = new Map<string, string>();
  const consultantUserIdBySlug = new Map<string, string>();

  for (const c of CONSULTANTS) {
    const user = await prisma.user.upsert({
      where: { email: c.email },
      create: {
        email: c.email,
        passwordHash,
        firstName: c.firstName,
        lastName: c.lastName,
        timezone: c.timezone,
        emailVerified: true,
        jobTitle: c.title,
      },
      update: { passwordHash, emailVerified: true, jobTitle: c.title },
    });
    await grantRole(user.id, ROLES.CONSULTANT);

    const profile = await prisma.consultantProfile.upsert({
      where: { userId: user.id },
      create: {
        userId: user.id,
        slug: c.slug,
        title: c.title,
        biography: c.biography,
        specialties: c.specialties,
        qualifications: c.qualifications,
        languages: c.languages,
        yearsExperience: c.yearsExperience,
        linkedinUrl: c.linkedinUrl,
        timezone: c.timezone,
        slotIntervalMinutes: c.slotIntervalMinutes,
        isPublished: true,
        isAcceptingBookings: true,
        sortOrder: CONSULTANTS.indexOf(c),
      },
      update: {
        title: c.title,
        biography: c.biography,
        specialties: c.specialties,
        qualifications: c.qualifications,
        languages: c.languages,
        yearsExperience: c.yearsExperience,
        isPublished: true,
      },
    });

    consultantIdBySlug.set(c.slug, profile.id);
    consultantUserIdBySlug.set(c.slug, user.id);

    // Weekly availability, rebuilt from scratch each run.
    await prisma.availabilityRule.deleteMany({ where: { consultantId: profile.id } });
    const rules = Object.entries(c.workingHours).flatMap(([weekday, blocks]) =>
      blocks.map(([startTime, endTime]) => ({
        consultantId: profile.id,
        weekday: Number(weekday),
        startTime,
        endTime,
        isActive: true,
      })),
    );
    await prisma.availabilityRule.createMany({ data: rules });
  }
  log('Consultants', `${CONSULTANTS.length} profiles with weekly availability`);

  /* ---------------------------------------------------------------------- */
  /* 4. Service catalog                                                     */
  /* ---------------------------------------------------------------------- */

  const categoryIdBySlug = new Map<string, string>();
  for (const cat of SERVICE_CATEGORIES) {
    const row = await prisma.serviceCategory.upsert({
      where: { slug: cat.slug },
      create: { ...cat },
      update: { name: cat.name, description: cat.description, icon: cat.icon, sortOrder: cat.sortOrder },
    });
    categoryIdBySlug.set(cat.slug, row.id);
  }

  const serviceIdBySlug = new Map<string, string>();
  for (const [index, svc] of SERVICES.entries()) {
    const categoryId = categoryIdBySlug.get(svc.categorySlug)!;
    const service = await prisma.service.upsert({
      where: { slug: svc.slug },
      create: {
        name: svc.name,
        slug: svc.slug,
        categoryId,
        shortDescription: svc.shortDescription,
        fullDescription: svc.fullDescription,
        currency: 'KES',
        paymentModel: svc.paymentModel,
        depositAmount: svc.depositAmount ?? null,
        depositPercentBps: svc.depositPercentBps ?? null,
        taxRateBps: svc.taxRateBps,
        meetingProviders: svc.meetingProviders,
        preparationNotes: svc.preparationNotes,
        cancellationPolicy: svc.cancellationPolicy,
        reschedulePolicy: svc.reschedulePolicy,
        leadTimeHours: svc.leadTimeHours,
        status: 'PUBLISHED',
        isFeatured: svc.isFeatured,
        sortOrder: index,
        icon: svc.icon,
        seoTitle: `${svc.name} | Meridian Advisory`,
        seoDescription: svc.shortDescription.slice(0, 300),
      },
      update: {
        name: svc.name,
        shortDescription: svc.shortDescription,
        fullDescription: svc.fullDescription,
        paymentModel: svc.paymentModel,
        depositAmount: svc.depositAmount ?? null,
        depositPercentBps: svc.depositPercentBps ?? null,
        taxRateBps: svc.taxRateBps,
        meetingProviders: svc.meetingProviders,
        status: 'PUBLISHED',
        isFeatured: svc.isFeatured,
      },
    });
    serviceIdBySlug.set(svc.slug, service.id);

    for (const [di, d] of svc.durations.entries()) {
      await prisma.serviceDuration.upsert({
        where: { serviceId_minutes: { serviceId: service.id, minutes: d.minutes } },
        create: {
          serviceId: service.id,
          minutes: d.minutes,
          price: d.price,
          label: d.label ?? null,
          isDefault: d.isDefault ?? false,
          sortOrder: di,
        },
        update: { price: d.price, label: d.label ?? null, isDefault: d.isDefault ?? false },
      });
    }

    await prisma.serviceConsultant.deleteMany({ where: { serviceId: service.id } });
    await prisma.serviceConsultant.createMany({
      data: svc.consultantSlugs.map((slug) => ({
        serviceId: service.id,
        consultantId: consultantIdBySlug.get(slug)!,
      })),
      skipDuplicates: true,
    });
  }
  log('Services', `${SERVICES.length} services with durations and consultant assignments`);

  /* ---------------------------------------------------------------------- */
  /* 5. Clients                                                             */
  /* ---------------------------------------------------------------------- */

  const clientProfileIds: string[] = [];
  const clientUserIds: string[] = [];

  for (const [index, c] of CLIENTS.entries()) {
    const user = await prisma.user.upsert({
      where: { email: c.email },
      create: {
        email: c.email,
        passwordHash,
        firstName: c.firstName,
        lastName: c.lastName,
        company: c.company,
        jobTitle: c.jobTitle,
        phone: `+2547${String(randomInt(10_000_000, 99_999_999))}`,
        timezone: BUSINESS_TZ,
        emailVerified: index < CLIENTS.length - 2,
        marketingOptIn: index % 3 !== 0,
        createdAt: DateTime.now().minus({ days: 300 - index * 17 }).toJSDate(),
      },
      update: { passwordHash, company: c.company, jobTitle: c.jobTitle },
    });
    await grantRole(user.id, ROLES.CLIENT);

    const profile = await prisma.clientProfile.upsert({
      where: { userId: user.id },
      create: {
        userId: user.id,
        clientCode: `CL-${String(index + 1).padStart(6, '0')}`,
        industry: c.industry,
        companySize: c.companySize,
        country: 'KE',
        city: c.city,
        source: pick(['Referral', 'Search', 'LinkedIn', 'Event', 'Existing client']),
      },
      update: { industry: c.industry, companySize: c.companySize, city: c.city },
    });

    clientProfileIds.push(profile.id);
    clientUserIds.push(user.id);
  }
  log('Clients', `${CLIENTS.length} client accounts`);

  /* ---------------------------------------------------------------------- */
  /* 6. Bookings, payments, sessions                                        */
  /* ---------------------------------------------------------------------- */

  // Wipe transactional demo data so re-seeding produces a clean, consistent set
  // rather than layering a second batch of bookings on top of the first.
  await prisma.review.deleteMany({});
  await prisma.sessionNote.deleteMany({});
  await prisma.consultationSession.deleteMany({});
  await prisma.videoMeeting.deleteMany({});
  await prisma.bookingStatusEvent.deleteMany({});
  await prisma.invoice.deleteMany({});
  await prisma.refund.deleteMany({});
  await prisma.payment.deleteMany({});
  await prisma.booking.deleteMany({});

  const services = await prisma.service.findMany({
    include: { durations: true, consultants: true },
  });
  const serviceBySlug = new Map(services.map((s) => [s.slug, s]));

  interface BookingPlan {
    serviceSlug: string;
    dayOffset: number;
    hour: number;
    status:
      | 'COMPLETED'
      | 'CONFIRMED'
      | 'CANCELLED'
      | 'NO_SHOW'
      | 'PENDING_PAYMENT'
      | 'EXPIRED';
    payment: 'PAID' | 'PARTIALLY_PAID' | 'UNPAID' | 'REFUNDED';
    clientIndex: number;
  }

  // 30 bookings: 18 historical (mostly completed), 10 upcoming, 2 unpaid holds.
  const plans: BookingPlan[] = [
    { serviceSlug: 'business-strategy-consultation', dayOffset: -96, hour: 10, status: 'COMPLETED', payment: 'PAID', clientIndex: 0 },
    { serviceSlug: 'fundraising-readiness-review', dayOffset: -88, hour: 9, status: 'COMPLETED', payment: 'PAID', clientIndex: 1 },
    { serviceSlug: 'operating-model-review', dayOffset: -81, hour: 14, status: 'COMPLETED', payment: 'PAID', clientIndex: 2 },
    { serviceSlug: 'executive-coaching-session', dayOffset: -74, hour: 9, status: 'COMPLETED', payment: 'PAID', clientIndex: 3 },
    { serviceSlug: 'business-strategy-consultation', dayOffset: -67, hour: 15, status: 'COMPLETED', payment: 'PAID', clientIndex: 4 },
    { serviceSlug: 'technology-due-diligence', dayOffset: -60, hour: 10, status: 'COMPLETED', payment: 'PAID', clientIndex: 5 },
    { serviceSlug: 'financial-model-build', dayOffset: -55, hour: 11, status: 'COMPLETED', payment: 'PAID', clientIndex: 6 },
    { serviceSlug: 'board-effectiveness-review', dayOffset: -49, hour: 14, status: 'COMPLETED', payment: 'PAID', clientIndex: 7 },
    { serviceSlug: 'introductory-call', dayOffset: -45, hour: 16, status: 'COMPLETED', payment: 'PAID', clientIndex: 8 },
    { serviceSlug: 'business-strategy-consultation', dayOffset: -41, hour: 9, status: 'COMPLETED', payment: 'PAID', clientIndex: 9 },
    { serviceSlug: 'operating-model-review', dayOffset: -35, hour: 10, status: 'COMPLETED', payment: 'PAID', clientIndex: 10 },
    { serviceSlug: 'executive-coaching-session', dayOffset: -30, hour: 11, status: 'COMPLETED', payment: 'PAID', clientIndex: 3 },
    { serviceSlug: 'fundraising-readiness-review', dayOffset: -26, hour: 9, status: 'COMPLETED', payment: 'PAID', clientIndex: 11 },
    { serviceSlug: 'business-strategy-consultation', dayOffset: -21, hour: 15, status: 'CANCELLED', payment: 'REFUNDED', clientIndex: 12 },
    { serviceSlug: 'financial-model-build', dayOffset: -18, hour: 10, status: 'COMPLETED', payment: 'PAID', clientIndex: 13 },
    { serviceSlug: 'introductory-call', dayOffset: -14, hour: 16, status: 'NO_SHOW', payment: 'PAID', clientIndex: 14 },
    { serviceSlug: 'executive-coaching-session', dayOffset: -9, hour: 9, status: 'COMPLETED', payment: 'PAID', clientIndex: 3 },
    { serviceSlug: 'technology-due-diligence', dayOffset: -5, hour: 10, status: 'COMPLETED', payment: 'PAID', clientIndex: 9 },

    { serviceSlug: 'business-strategy-consultation', dayOffset: 2, hour: 10, status: 'CONFIRMED', payment: 'PARTIALLY_PAID', clientIndex: 0 },
    { serviceSlug: 'fundraising-readiness-review', dayOffset: 3, hour: 9, status: 'CONFIRMED', payment: 'PARTIALLY_PAID', clientIndex: 1 },
    { serviceSlug: 'executive-coaching-session', dayOffset: 4, hour: 14, status: 'CONFIRMED', payment: 'PAID', clientIndex: 3 },
    { serviceSlug: 'operating-model-review', dayOffset: 6, hour: 10, status: 'CONFIRMED', payment: 'PARTIALLY_PAID', clientIndex: 6 },
    { serviceSlug: 'introductory-call', dayOffset: 7, hour: 16, status: 'CONFIRMED', payment: 'PAID', clientIndex: 12 },
    { serviceSlug: 'board-effectiveness-review', dayOffset: 9, hour: 14, status: 'CONFIRMED', payment: 'PARTIALLY_PAID', clientIndex: 14 },
    { serviceSlug: 'business-strategy-consultation', dayOffset: 11, hour: 11, status: 'CONFIRMED', payment: 'PAID', clientIndex: 4 },
    { serviceSlug: 'financial-model-build', dayOffset: 13, hour: 9, status: 'CONFIRMED', payment: 'PARTIALLY_PAID', clientIndex: 13 },
    { serviceSlug: 'technology-due-diligence', dayOffset: 16, hour: 10, status: 'CONFIRMED', payment: 'PARTIALLY_PAID', clientIndex: 5 },
    { serviceSlug: 'introductory-call', dayOffset: 18, hour: 15, status: 'CONFIRMED', payment: 'PAID', clientIndex: 2 },

    { serviceSlug: 'business-strategy-consultation', dayOffset: 5, hour: 14, status: 'PENDING_PAYMENT', payment: 'UNPAID', clientIndex: 10 },
    { serviceSlug: 'operating-model-review', dayOffset: -3, hour: 11, status: 'EXPIRED', payment: 'UNPAID', clientIndex: 11 },
  ];

  const completedBookings: {
    id: string;
    consultantId: string;
    serviceId: string;
    clientUserId: string;
    startAt: Date;
  }[] = [];

  let paymentSequence = 1;

  for (const plan of plans) {
    const service = serviceBySlug.get(plan.serviceSlug)!;
    const duration = service.durations.find((d) => d.isDefault) ?? service.durations[0]!;
    const consultantLink = pick(service.consultants);
    const consultantId = consultantLink.consultantId;
    const clientId = clientProfileIds[plan.clientIndex]!;
    const clientUserId = clientUserIds[plan.clientIndex]!;

    const startAt = scheduleAt(plan.dayOffset, plan.hour);
    const endAt = new Date(startAt.getTime() + duration.minutes * 60_000);

    // Mirror the pricing engine so seeded money is internally consistent.
    const subtotal = duration.price;
    const tax = Math.round((subtotal * service.taxRateBps) / 10_000);
    const total = subtotal + tax;
    const amountDueNow =
      service.paymentModel === 'FREE'
        ? 0
        : service.paymentModel === 'FULL_PAYMENT'
          ? total
          : service.paymentModel === 'FIXED_DEPOSIT'
            ? Math.min(service.depositAmount ?? total, total)
            : Math.min(Math.round((total * (service.depositPercentBps ?? 10_000)) / 10_000), total);

    const amountPaid =
      plan.payment === 'PAID' || plan.payment === 'REFUNDED'
        ? total
        : plan.payment === 'PARTIALLY_PAID'
          ? amountDueNow
          : 0;

    const paymentStatus =
      plan.payment === 'PAID'
        ? 'PAID'
        : plan.payment === 'PARTIALLY_PAID'
          ? 'PARTIALLY_PAID'
          : plan.payment === 'REFUNDED'
            ? 'REFUNDED'
            : 'UNPAID';

    const createdAt = new Date(startAt.getTime() - randomInt(3, 21) * 86_400_000);
    const meetingProvider = pick(service.meetingProviders);

    const booking = await prisma.booking.create({
      data: {
        reference: reference('MRD'),
        clientId,
        consultantId,
        serviceId: service.id,
        status: plan.status,
        paymentStatus,
        startAt,
        endAt,
        durationMinutes: duration.minutes,
        timezone: BUSINESS_TZ,
        blockStartAt: new Date(startAt.getTime() - service.bufferBeforeMinutes * 60_000),
        blockEndAt: new Date(endAt.getTime() + service.bufferAfterMinutes * 60_000),
        currency: 'KES',
        subtotal,
        discount: 0,
        taxRateBps: service.taxRateBps,
        tax,
        total,
        amountDueNow,
        amountPaid,
        meetingProvider,
        objective: pick([
          'Decide whether to proceed with the Uganda distribution partnership.',
          'Pressure-test our FY27 revenue plan before the board meeting.',
          'Work out why our delivery lead times have doubled since March.',
          'Prepare for the Series A conversations starting next quarter.',
          'Review the succession plan for the operations director role.',
          'Assess the technology estate of an acquisition target.',
        ]),
        createdAt,
        confirmedAt: plan.status === 'PENDING_PAYMENT' || plan.status === 'EXPIRED' ? null : createdAt,
        cancelledAt: plan.status === 'CANCELLED' ? new Date(startAt.getTime() - 2 * 86_400_000) : null,
        cancellationReason:
          plan.status === 'CANCELLED' ? 'Client postponed pending an internal board decision.' : null,
        holdExpiresAt:
          plan.status === 'PENDING_PAYMENT'
            ? new Date(Date.now() + 45 * 60_000)
            : plan.status === 'EXPIRED'
              ? new Date(Date.now() - 3 * 86_400_000)
              : null,
      },
    });

    await prisma.bookingStatusEvent.create({
      data: {
        bookingId: booking.id,
        fromStatus: null,
        toStatus: 'PENDING_PAYMENT',
        reason: 'Booking created',
        createdAt,
      },
    });
    if (plan.status !== 'PENDING_PAYMENT' && plan.status !== 'EXPIRED') {
      await prisma.bookingStatusEvent.create({
        data: {
          bookingId: booking.id,
          fromStatus: 'PENDING_PAYMENT',
          toStatus: 'CONFIRMED',
          reason: 'Payment confirmed',
          createdAt: new Date(createdAt.getTime() + 300_000),
        },
      });
    }

    /* --- Payments ------------------------------------------------------- */

    if (amountPaid > 0) {
      const paidAt = new Date(createdAt.getTime() + randomInt(2, 40) * 60_000);
      const purpose =
        plan.payment === 'PARTIALLY_PAID'
          ? 'DEPOSIT'
          : service.paymentModel === 'FULL_PAYMENT' || service.paymentModel === 'FREE'
            ? 'FULL_PAYMENT'
            : 'FULL_PAYMENT';

      const clientUser = await prisma.user.findUniqueOrThrow({
        where: { id: clientUserId },
        select: { email: true },
      });

      const payment = await prisma.payment.create({
        data: {
          reference: `MRD_PAY_${String(paymentSequence++).padStart(6, '0')}`,
          providerTransactionId: `demo_txn_${String(paymentSequence).padStart(9, '0')}`,
          bookingId: booking.id,
          userId: clientUserId,
          purpose,
          status: plan.payment === 'REFUNDED' ? 'REFUNDED' : 'PAID',
          currency: 'KES',
          amount: amountPaid,
          feeAmount: Math.round(amountPaid * 0.029),
          refundedAmount: plan.payment === 'REFUNDED' ? amountPaid : 0,
          channel: pick(['card', 'mobile_money', 'bank_transfer', 'card']),
          cardLast4: pick(['4081', '5399', '2214', '7742']),
          cardBrand: pick(['visa', 'mastercard']),
          customerEmail: clientUser.email,
          authorizationCode: `AUTH_${reference('X', 8)}`,
          gatewayResponse: 'Successful',
          paidAt,
          createdAt,
        },
      });

      if (plan.payment === 'REFUNDED') {
        await prisma.refund.create({
          data: {
            paymentId: payment.id,
            reference: `MRD_REF_${String(paymentSequence).padStart(6, '0')}`,
            providerRefundId: `demo_ref_${String(paymentSequence).padStart(9, '0')}`,
            amount: amountPaid,
            currency: 'KES',
            status: 'COMPLETED',
            reason: 'Client cancelled outside the charge window.',
            initiatedBy: financeManager.id,
            processedAt: new Date(startAt.getTime() - 86_400_000),
          },
        });
      }

      await prisma.invoice.create({
        data: {
          number: `INV-${DateTime.fromJSDate(createdAt).toFormat('yyyyMM')}-${String(paymentSequence).padStart(4, '0')}`,
          status: amountPaid >= total ? 'PAID' : 'PARTIALLY_PAID',
          bookingId: booking.id,
          userId: clientUserId,
          currency: 'KES',
          subtotal,
          tax,
          total,
          amountPaid,
          lines: [
            {
              description: `${service.name} — ${duration.minutes} minutes`,
              quantity: 1,
              unitAmount: subtotal,
              amount: subtotal,
            },
          ],
          issuedAt: createdAt,
          dueAt: new Date(startAt.getTime() - 86_400_000),
          paidAt: amountPaid >= total ? paidAt : null,
        },
      });
    }

    /* --- Meetings ------------------------------------------------------- */

    if (plan.status !== 'PENDING_PAYMENT' && plan.status !== 'EXPIRED' && meetingProvider !== 'IN_PERSON' && meetingProvider !== 'PHONE') {
      await prisma.videoMeeting.create({
        data: {
          bookingId: booking.id,
          provider: meetingProvider,
          // Seeded demo meetings are marked PENDING rather than CREATED: no real
          // provider was called, so claiming a live meeting exists would be a lie.
          status: 'PENDING',
          startTime: startAt,
          endTime: endAt,
          failureReason: 'Seeded demo booking — no meeting was created with the provider.',
        },
      });
    }

    /* --- Sessions ------------------------------------------------------- */

    if (plan.status === 'COMPLETED' || plan.status === 'NO_SHOW') {
      const session = await prisma.consultationSession.create({
        data: {
          bookingId: booking.id,
          status: plan.status === 'NO_SHOW' ? 'NO_SHOW' : 'COMPLETED',
          startedAt: plan.status === 'NO_SHOW' ? null : startAt,
          endedAt: plan.status === 'NO_SHOW' ? null : endAt,
          actualMinutes: plan.status === 'NO_SHOW' ? null : duration.minutes + randomInt(-5, 8),
        },
      });

      if (plan.status === 'COMPLETED') {
        await prisma.sessionNote.create({
          data: {
            sessionId: session.id,
            objective: booking.objective,
            discussionSummary: pick([
              'Worked through the unit economics of the proposed expansion. The contribution margin assumption did not survive scrutiny once distribution cost was allocated properly.',
              'Reviewed the current delivery pipeline and mapped where work waits. Two approval steps account for most of the elapsed time.',
              'Discussed the leadership transition and the specific conversations that have been deferred with three direct reports.',
              'Walked the financial model line by line. Revenue build is sound; working capital schedule understates the cash requirement at plan growth.',
            ]),
            keyFindings: pick([
              'The binding constraint is approval latency, not capacity. Adding headcount would not shorten lead times.',
              'Margin is being lost at the point of quotation rather than in delivery. Pricing discipline, not cost control, is the lever.',
              'Two of the three assumptions carrying the most valuation weight have no supporting evidence.',
              'The organisation has outgrown a structure designed when it was a third of its current size.',
            ]),
            recommendations: pick([
              'Delegate approvals below the threshold to the regional managers and review the exception rate monthly for one quarter.',
              'Rebuild the working capital schedule with separate receivable and inventory drivers, then re-run the plan at 1.5x growth.',
              'Hold the three deferred conversations within two weeks, individually, before the next leadership offsite.',
              'Run a two-week observation of the quotation process before making any structural change.',
            ]),
            actionItems: [
              { description: 'Circulate revised assumptions to the leadership team', owner: 'CLIENT', completed: true },
              { description: 'Share the working capital template discussed', owner: 'CONSULTANT', completed: true },
              { description: 'Reconvene once the observation period is complete', owner: 'CLIENT', completed: false },
            ],
            followUpDate: DateTime.fromJSDate(startAt).plus({ weeks: 3 }).startOf('day').toJSDate(),
            privateNotes:
              'Client is more constrained by the board than they let on in the session. The real blocker is the chair, not the analysis. Worth raising directly next time — they invited candour at the end.',
            sharedWithClient: true,
            lastEditedBy: consultantUserIdBySlug.get(
              CONSULTANTS.find((c) => consultantIdBySlug.get(c.slug) === consultantId)?.slug ?? '',
            ),
          },
        });

        completedBookings.push({
          id: booking.id,
          consultantId,
          serviceId: service.id,
          clientUserId,
          startAt,
        });
      }
    }
  }
  log('Bookings', `${plans.length} bookings with payments, invoices and sessions`);

  /* ---------------------------------------------------------------------- */
  /* 7. Reviews                                                             */
  /* ---------------------------------------------------------------------- */

  const reviewable = completedBookings.slice(0, REVIEW_BODIES.length);
  for (const [index, booking] of reviewable.entries()) {
    const content = REVIEW_BODIES[index]!;
    // Leave the last two pending so review moderation has something to act on.
    const status = index >= reviewable.length - 2 ? 'PENDING' : 'APPROVED';

    await prisma.review.create({
      data: {
        bookingId: booking.id,
        userId: booking.clientUserId,
        consultantId: booking.consultantId,
        serviceId: booking.serviceId,
        rating: content.rating,
        title: content.title,
        body: content.body,
        serviceRating: content.rating,
        consultantRating: Math.min(5, content.rating + (random() > 0.7 ? 0 : 0)),
        communicationRating: Math.max(3, content.rating - (random() > 0.6 ? 0 : 1)),
        valueRating: Math.max(3, content.rating - (random() > 0.5 ? 0 : 1)),
        isAnonymous: index % 7 === 3,
        isVerified: true,
        status,
        moderatedBy: status === 'APPROVED' ? contentManager.id : null,
        moderatedAt: status === 'APPROVED' ? new Date(booking.startAt.getTime() + 3 * 86_400_000) : null,
        createdAt: new Date(booking.startAt.getTime() + 2 * 86_400_000),
      },
    });
  }

  // Refresh denormalised consultant rating aggregates.
  for (const consultantId of consultantIdBySlug.values()) {
    const approved = await prisma.review.findMany({
      where: { consultantId, status: 'APPROVED' },
      select: { rating: true },
    });
    const completed = await prisma.booking.count({ where: { consultantId, status: 'COMPLETED' } });
    await prisma.consultantProfile.update({
      where: { id: consultantId },
      data: {
        reviewCount: approved.length,
        averageRating:
          approved.length > 0
            ? Math.round((approved.reduce((s, r) => s + r.rating, 0) / approved.length) * 10) / 10
            : null,
        completedSessions: completed,
      },
    });
  }
  log('Reviews', `${reviewable.length} reviews (2 awaiting moderation)`);

  /* ---------------------------------------------------------------------- */
  /* 8. Content                                                             */
  /* ---------------------------------------------------------------------- */

  const articleCategoryIds = new Map<string, string>();
  for (const [index, cat] of ARTICLE_CATEGORIES.entries()) {
    const row = await prisma.articleCategory.upsert({
      where: { slug: cat.slug },
      create: { ...cat, sortOrder: index },
      update: { name: cat.name, description: cat.description },
    });
    articleCategoryIds.set(cat.slug, row.id);
  }

  for (const article of ARTICLES) {
    const publishedAt = DateTime.now().minus({ days: article.daysAgo }).toJSDate();
    await prisma.article.upsert({
      where: { slug: article.slug },
      create: {
        title: article.title,
        slug: article.slug,
        categoryId: articleCategoryIds.get(article.categorySlug)!,
        excerpt: article.excerpt,
        content: article.content,
        tags: article.tags,
        authorId: consultantUserIdBySlug.get(article.authorSlug) ?? null,
        status: 'PUBLISHED',
        publishedAt,
        readingMinutes: article.readingMinutes,
        viewCount: randomInt(120, 4800),
        seoTitle: `${article.title} | Meridian Advisory`,
        seoDescription: article.excerpt.slice(0, 300),
        isJournal: article.isJournal ?? false,
        journalVolume: article.journalVolume ?? null,
        journalIssue: article.journalIssue ?? null,
        doi: article.doi ?? null,
        createdAt: publishedAt,
      },
      update: { content: article.content, excerpt: article.excerpt, status: 'PUBLISHED', publishedAt },
    });
  }

  // One scheduled and one draft article so the CMS has non-published states.
  await prisma.article.upsert({
    where: { slug: 'preparing-for-the-2027-capital-cycle' },
    create: {
      title: 'Preparing for the 2027 capital cycle',
      slug: 'preparing-for-the-2027-capital-cycle',
      categoryId: articleCategoryIds.get('capital')!,
      excerpt: 'What the shift in development finance allocations means for mid-market borrowers next year.',
      content: '<p>Draft in preparation. Publication scheduled once the Q4 allocation data is released.</p>',
      tags: ['capital', 'outlook'],
      authorId: consultantUserIdBySlug.get('david-otieno') ?? null,
      status: 'SCHEDULED',
      publishedAt: DateTime.now().plus({ days: 12 }).toJSDate(),
      readingMinutes: 7,
    },
    update: {},
  });

  await prisma.article.upsert({
    where: { slug: 'notes-on-scenario-planning' },
    create: {
      title: 'Notes on scenario planning',
      slug: 'notes-on-scenario-planning',
      categoryId: articleCategoryIds.get('strategy-notes')!,
      excerpt: 'Why most scenario exercises produce three versions of the same forecast.',
      content: '<p>Working draft.</p>',
      tags: ['strategy', 'planning'],
      authorId: consultantUserIdBySlug.get('achieng-mwangi') ?? null,
      status: 'DRAFT',
      readingMinutes: 5,
    },
    update: {},
  });
  log('Articles', `${ARTICLES.length} published, 1 scheduled, 1 draft`);

  /* ---------------------------------------------------------------------- */
  /* 9. Products                                                            */
  /* ---------------------------------------------------------------------- */

  const productCategoryIds = new Map<string, string>();
  for (const [index, cat] of PRODUCT_CATEGORIES.entries()) {
    const row = await prisma.productCategory.upsert({
      where: { slug: cat.slug },
      create: { ...cat, sortOrder: index },
      update: { name: cat.name, description: cat.description, icon: cat.icon },
    });
    productCategoryIds.set(cat.slug, row.id);
  }

  for (const p of PRODUCTS) {
    const product = await prisma.product.upsert({
      where: { slug: p.slug },
      create: {
        name: p.name,
        slug: p.slug,
        categoryId: productCategoryIds.get(p.categorySlug)!,
        description: p.description,
        shortDescription: p.shortDescription,
        author: p.author,
        price: p.price,
        compareAtPrice: p.compareAtPrice ?? null,
        currency: 'KES',
        sku: p.sku,
        type: p.type,
        stock: p.stock ?? null,
        isbn: p.isbn ?? null,
        pages: p.pages ?? null,
        publishedYear: p.publishedYear ?? null,
        status: 'PUBLISHED',
        isFeatured: p.isFeatured,
        seoTitle: `${p.name} | Meridian Advisory`,
        seoDescription: p.shortDescription.slice(0, 300),
      },
      update: {
        name: p.name,
        description: p.description,
        price: p.price,
        stock: p.stock ?? null,
        status: 'PUBLISHED',
        isFeatured: p.isFeatured,
      },
    });

    if (p.type === 'DIGITAL') {
      await prisma.digitalAsset.upsert({
        where: { productId: product.id },
        create: {
          productId: product.id,
          // Storage key only — the file itself lives in a private bucket and is
          // only ever served through a short-lived signed URL.
          storageKey: `products/${p.slug}/${p.slug}.pdf`,
          fileName: `${p.slug}.pdf`,
          mimeType: 'application/pdf',
          sizeBytes: randomInt(1_200_000, 18_000_000),
          version: '1.0',
        },
        update: {},
      });
    }
  }
  log('Products', `${PRODUCTS.length} products (${PRODUCTS.filter((p) => p.type === 'DIGITAL').length} digital)`);

  /* ---------------------------------------------------------------------- */
  /* 10. Settings and integrations                                          */
  /* ---------------------------------------------------------------------- */

  const settings: { key: string; value: unknown; description: string; isPublic: boolean }[] = [
    { key: 'business.name', value: 'Meridian Advisory', description: 'Trading name shown across the platform.', isPublic: true },
    { key: 'business.tagline', value: 'Clarity for your next important decision.', description: 'Hero tagline.', isPublic: true },
    { key: 'business.timezone', value: BUSINESS_TZ, description: 'Default timezone for scheduling.', isPublic: true },
    { key: 'business.currency', value: 'KES', description: 'Default currency.', isPublic: true },
    { key: 'business.email', value: 'hello@meridianadvisory.co.ke', description: 'Public contact address.', isPublic: true },
    { key: 'business.phone', value: '+254 20 271 4400', description: 'Public contact number.', isPublic: true },
    { key: 'business.address', value: 'Riverside Square, Riverside Drive, Nairobi, Kenya', description: 'Registered office.', isPublic: true },
    { key: 'booking.holdMinutes', value: 45, description: 'Minutes an unpaid booking holds its slot before expiring.', isPublic: false },
    { key: 'booking.maxHorizonDays', value: 60, description: 'How far ahead clients may book.', isPublic: true },
    { key: 'booking.allowFreeBookings', value: true, description: 'Permit services priced at zero to confirm without payment.', isPublic: false },
    { key: 'reviews.autoRequestHours', value: 6, description: 'Hours after a completed session before a review request is sent.', isPublic: false },
    { key: 'reviews.requireModeration', value: true, description: 'Reviews appear publicly only after approval.', isPublic: true },
    { key: 'notifications.adminEmail', value: 'operations@meridianadvisory.co.ke', description: 'Where integration failures are reported.', isPublic: false },
  ];

  for (const setting of settings) {
    await prisma.setting.upsert({
      where: { key: setting.key },
      create: {
        key: setting.key,
        value: setting.value as never,
        description: setting.description,
        isPublic: setting.isPublic,
      },
      update: { description: setting.description, isPublic: setting.isPublic },
    });
  }

  const integrations = [
    { key: 'paystack', name: 'Paystack', category: 'payments' },
    { key: 'google_calendar', name: 'Google Calendar', category: 'calendar' },
    { key: 'microsoft_calendar', name: 'Microsoft Outlook Calendar', category: 'calendar' },
    { key: 'zoom', name: 'Zoom', category: 'video' },
    { key: 'google_meet', name: 'Google Meet', category: 'video' },
    { key: 'microsoft_teams', name: 'Microsoft Teams', category: 'video' },
    { key: 'email', name: 'Transactional Email', category: 'email' },
    { key: 'storage', name: 'Object Storage', category: 'storage' },
  ];

  for (const integration of integrations) {
    await prisma.integration.upsert({
      where: { key: integration.key },
      create: { ...integration, isEnabled: false },
      update: { name: integration.name, category: integration.category },
    });
  }
  log('Configuration', `${settings.length} settings, ${integrations.length} integration slots (all disconnected)`);

  /* ---------------------------------------------------------------------- */
  /* 11. Notifications                                                      */
  /* ---------------------------------------------------------------------- */

  await prisma.notification.deleteMany({});
  const upcoming = await prisma.booking.findMany({
    where: { status: 'CONFIRMED', startAt: { gte: new Date() } },
    include: { service: true, client: { include: { user: true } } },
    take: 6,
    orderBy: { startAt: 'asc' },
  });

  for (const booking of upcoming) {
    await prisma.notification.create({
      data: {
        userId: owner.id,
        type: 'BOOKING_CONFIRMED',
        title: 'Booking confirmed',
        body: `${booking.client.user.firstName} ${booking.client.user.lastName} booked ${booking.service.name}.`,
        href: `/admin/bookings/${booking.id}`,
        createdAt: booking.createdAt,
      },
    });
  }

  await prisma.notification.create({
    data: {
      userId: owner.id,
      type: 'SYSTEM',
      title: 'Connect your integrations',
      body: 'Paystack, calendar and video providers are not yet connected. Bookings cannot be paid for or given meeting links until they are.',
      href: '/admin/integrations',
    },
  });
  log('Notifications', `${upcoming.length + 1} admin notifications`);

  /* ---------------------------------------------------------------------- */

  process.stdout.write('\nSeed complete.\n\n');
  process.stdout.write('  Sign-in accounts (all share the same password)\n');
  process.stdout.write(`  Password: ${DEMO_PASSWORD}\n\n`);
  process.stdout.write('  Super admin      admin@meridianadvisory.co.ke\n');
  process.stdout.write('  Finance manager  finance@meridianadvisory.co.ke\n');
  process.stdout.write('  Content manager  editor@meridianadvisory.co.ke\n');
  process.stdout.write('  Consultant       a.mwangi@meridianadvisory.co.ke\n');
  process.stdout.write('  Client           grace.njeri@savannaagro.co.ke\n\n');
}

main()
  .catch((error) => {
    process.stderr.write(`\nSeed failed: ${error instanceof Error ? error.stack : String(error)}\n`);
    process.exitCode = 1;
  })
  .finally(() => prisma.$disconnect());
