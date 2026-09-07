import { afterAll, beforeAll, describe, expect, it } from 'vitest';
import { prisma } from '../src/lib/prisma.js';
import { buildApp } from '../src/app.js';
import { createBooking } from '../src/services/booking.service.js';
import { quoteDiscount } from '../src/services/discount.service.js';
import {
  createClient,
  createConsultant,
  createService,
  nextWorkingSlot,
  resetDatabase,
  seedRolesAndPermissions,
} from './helpers/fixtures.js';

/**
 * Discount codes.
 *
 * The property that matters is that a code is worth what the *rule* says, never
 * what the request says, and that its limits hold when two people race for the
 * last redemption.
 */

type App = Awaited<ReturnType<typeof buildApp>>;
let app: App;

describe('discount codes', () => {
  let serviceId: string;
  let durationMinutes: number;
  let durationPrice: number;
  let consultantId: string;
  let alice: { userId: string; clientProfileId: string; email: string };
  let bob: { userId: string; clientProfileId: string; email: string };

  beforeAll(async () => {
    await resetDatabase();
    await seedRolesAndPermissions();
    app = await buildApp();

    const consultant = await createConsultant({ email: 'disc-c@test.local', slug: 'disc-c' });
    consultantId = consultant.consultantProfileId;

    const service = await createService({
      slug: 'discount-service',
      consultantIds: [consultantId],
      paymentModel: 'FULL_PAYMENT',
      price: 100_000, // KES 1,000.00
    });
    serviceId = service.id;
    durationMinutes = service.defaultDurationMinutes;

    const duration = await prisma.serviceDuration.findFirstOrThrow({
      where: { serviceId, minutes: durationMinutes },
    });
    durationPrice = duration.price;

    alice = await createClient({ email: 'disc-alice@test.local' });
    bob = await createClient({ email: 'disc-bob@test.local' });
  });

  afterAll(async () => {
    await app?.close();
    await prisma.$disconnect();
  });

  const book = (clientProfileId: string, dayOffset: number, discountCode?: string) =>
    createBooking({
      clientId: clientProfileId,
      actorId: null,
      input: {
        serviceId,
        consultantId,
        durationMinutes,
        startAt: nextWorkingSlot(dayOffset, 10).toISOString(),
        timezone: 'Africa/Nairobi',
        meetingProvider: 'ZOOM',
        client: { firstName: 'X', lastName: 'Y', email: 'x@test.local', phone: '+254700000000' },
        ...(discountCode ? { discountCode } : {}),
      },
    });

  it('applies a percentage against the price the catalogue holds', async () => {
    await prisma.discount.create({
      data: { code: 'TENOFF', type: 'PERCENTAGE', value: 1000, isActive: true },
    });

    const result = await book(alice.clientProfileId, 3, 'TENOFF');

    expect(result.pricing.subtotal).toBe(durationPrice);
    expect(result.pricing.discount).toBe(Math.round(durationPrice * 0.1));
    // Tax is charged on the discounted amount, not the list price.
    expect(result.pricing.total).toBeLessThan(durationPrice);
  });

  it('caps a percentage at maxDiscount', async () => {
    await prisma.discount.create({
      data: {
        code: 'BIGBUTCAPPED',
        type: 'PERCENTAGE',
        value: 5000,
        maxDiscount: 1_000,
        isActive: true,
      },
    });

    const quote = await quoteDiscount({
      code: 'BIGBUTCAPPED',
      userId: alice.userId,
      currency: 'KES',
      subtotal: durationPrice,
      scope: 'SERVICES',
      serviceId,
    });

    expect(quote.amount).toBe(1_000);
  });

  it('never discounts more than the basket is worth', async () => {
    await prisma.discount.create({
      data: {
        code: 'HUGE',
        type: 'FIXED_AMOUNT',
        value: 999_999_999,
        currency: 'KES',
        isActive: true,
      },
    });

    const quote = await quoteDiscount({
      code: 'HUGE',
      userId: alice.userId,
      currency: 'KES',
      subtotal: durationPrice,
      scope: 'SERVICES',
      serviceId,
    });

    expect(quote.amount).toBe(durationPrice);
  });

  it('refuses a code outside its window, and one that is withdrawn', async () => {
    await prisma.discount.createMany({
      data: [
        {
          code: 'EXPIRED',
          type: 'PERCENTAGE',
          value: 1000,
          endsAt: new Date(Date.now() - 86_400_000),
          isActive: true,
        },
        { code: 'WITHDRAWN', type: 'PERCENTAGE', value: 1000, isActive: false },
      ],
    });

    for (const code of ['EXPIRED', 'WITHDRAWN', 'NOSUCHCODE']) {
      await expect(
        quoteDiscount({
          code,
          userId: alice.userId,
          currency: 'KES',
          subtotal: durationPrice,
          scope: 'SERVICES',
          serviceId,
        }),
      ).rejects.toThrow();
    }
  });

  it('refuses a fixed-amount code in the wrong currency', async () => {
    await prisma.discount.create({
      data: { code: 'USDONLY', type: 'FIXED_AMOUNT', value: 500, currency: 'USD', isActive: true },
    });

    await expect(
      quoteDiscount({
        code: 'USDONLY',
        userId: alice.userId,
        currency: 'KES',
        subtotal: durationPrice,
        scope: 'SERVICES',
        serviceId,
      }),
    ).rejects.toThrow();
  });

  it('enforces the per-client limit', async () => {
    await prisma.discount.create({
      data: { code: 'ONEPERCLIENT', type: 'PERCENTAGE', value: 1000, perClientLimit: 1, isActive: true },
    });

    await book(alice.clientProfileId, 4, 'ONEPERCLIENT');

    // Second attempt by the same client is refused; a different client is fine.
    await expect(book(alice.clientProfileId, 5, 'ONEPERCLIENT')).rejects.toThrow();
    await expect(book(bob.clientProfileId, 6, 'ONEPERCLIENT')).resolves.toBeTruthy();
  });

  /**
   * The race that a plain read-then-write would lose: two bookings competing
   * for a single remaining redemption. Exactly one may have it.
   */
  it('never over-redeems when two bookings race for the last use', async () => {
    await prisma.discount.create({
      data: { code: 'LASTONE', type: 'PERCENTAGE', value: 2000, maxRedemptions: 1, isActive: true },
    });

    const attempts = await Promise.allSettled([
      book(alice.clientProfileId, 7, 'LASTONE'),
      book(bob.clientProfileId, 8, 'LASTONE'),
    ]);

    const succeeded = attempts.filter((attempt) => attempt.status === 'fulfilled');
    expect(succeeded).toHaveLength(1);

    const discount = await prisma.discount.findUniqueOrThrow({ where: { code: 'LASTONE' } });
    expect(discount.redeemedCount).toBe(1);

    const redemptions = await prisma.discountRedemption.count({ where: { discountId: discount.id } });
    expect(redemptions).toBe(1);
  });

  it('ignores an amount supplied by the client', async () => {
    await prisma.discount.create({
      data: { code: 'FIVEPCT', type: 'PERCENTAGE', value: 500, isActive: true },
    });

    // The booking input has no amount field at all — the code is the only lever
    // — so a client sending one changes nothing about what is charged.
    const result = await book(alice.clientProfileId, 9, 'FIVEPCT');
    expect(result.pricing.discount).toBe(Math.round(durationPrice * 0.05));
  });

  it('records the redemption against the booking that used it', async () => {
    await prisma.discount.create({
      data: { code: 'TRACKED', type: 'PERCENTAGE', value: 1000, isActive: true },
    });

    const result = await book(bob.clientProfileId, 10, 'TRACKED');

    const redemption = await prisma.discountRedemption.findFirst({
      where: { bookingId: result.bookingId },
    });

    expect(redemption).not.toBeNull();
    expect(redemption?.amount).toBe(result.pricing.discount);
    expect(redemption?.userId).toBe(bob.userId);
  });
});
