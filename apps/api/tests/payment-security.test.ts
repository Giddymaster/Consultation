import { beforeAll, beforeEach, describe, expect, it } from 'vitest';
import { createHmac } from 'node:crypto';
import { ERROR_CODES } from '@meridian/types';
import { prisma } from '../src/lib/prisma.js';
import { buildApp } from '../src/app.js';
import { settlePayment } from '../src/services/payments/payment.service.js';
import { createBooking } from '../src/services/booking.service.js';
import { calculateBookingPrice } from '../src/services/pricing.service.js';
import type { PaystackTransaction } from '../src/services/payments/paystack.client.js';
import {
  createClient,
  createConsultant,
  createService,
  nextWorkingSlot,
  resetDatabase,
  seedRolesAndPermissions,
} from './helpers/fixtures.js';

/**
 * Payment integrity.
 *
 * The properties under test are the ones that decide whether money and access
 * can be manipulated from outside:
 *
 *   • A replayed webhook cannot credit a booking twice.
 *   • A forged or absent signature is rejected outright.
 *   • Paystack reporting an amount we did not ask for does not settle.
 *   • The price is derived from the service, never from the request.
 *   • An unpaid booking never exposes a meeting link.
 */

const SECRET = 'sk_test_meridian_suite_key_do_not_use';

function sign(body: string): string {
  return createHmac('sha512', SECRET).update(body).digest('hex');
}

function transactionFor(reference: string, amount: number, overrides: Partial<PaystackTransaction> = {}): PaystackTransaction {
  return {
    id: 999_000_111,
    status: 'success',
    reference,
    amount,
    currency: 'KES',
    channel: 'card',
    gateway_response: 'Successful',
    paid_at: new Date().toISOString(),
    created_at: new Date().toISOString(),
    fees: 725,
    metadata: {},
    customer: { email: 'payer@test.local' },
    authorization: { authorization_code: 'AUTH_test', last4: '4081', brand: 'visa' },
    ...overrides,
  };
}

describe('payment integrity', () => {
  let consultantId: string;
  let serviceId: string;
  let clientProfileId: string;
  let clientUserId: string;
  let durationMinutes: number;
  let servicePrice: number;

  beforeAll(async () => {
    await resetDatabase();
    await seedRolesAndPermissions();
  });

  beforeEach(async () => {
    await prisma.videoMeeting.deleteMany({});
    await prisma.webhookEvent.deleteMany({});
    await prisma.invoice.deleteMany({});
    await prisma.payment.deleteMany({});
    await prisma.bookingStatusEvent.deleteMany({});
    await prisma.booking.deleteMany({});
    await prisma.serviceConsultant.deleteMany({});
    await prisma.serviceDuration.deleteMany({});
    await prisma.service.deleteMany({});
    await prisma.availabilityRule.deleteMany({});
    await prisma.consultantProfile.deleteMany({});
    await prisma.clientProfile.deleteMany({});
    await prisma.userRole.deleteMany({});
    await prisma.user.deleteMany({});

    consultantId = (await createConsultant({ email: 'pay-c@test.local', slug: 'pay-c' })).consultantProfileId;
    const service = await createService({
      slug: 'pay-svc',
      consultantIds: [consultantId],
      price: 500_000,
      taxRateBps: 1600,
      paymentModel: 'FIXED_DEPOSIT',
      depositAmount: 100_000,
    });
    serviceId = service.id;
    durationMinutes = service.defaultDurationMinutes;
    servicePrice = service.defaultPrice;

    const client = await createClient({ email: 'payer@test.local' });
    clientProfileId = client.clientProfileId;
    clientUserId = client.userId;
  });

  async function makeBooking(startAt = nextWorkingSlot()) {
    return createBooking({
      clientId: clientProfileId,
      actorId: clientUserId,
      input: {
        serviceId,
        consultantId,
        durationMinutes,
        startAt: startAt.toISOString(),
        timezone: 'Africa/Nairobi',
        meetingProvider: 'ZOOM',
        client: {
          firstName: 'Pay',
          lastName: 'Er',
          email: 'payer@test.local',
          phone: '+254700000000',
        },
      },
    });
  }

  async function makePayment(bookingId: string, amount: number, reference = `TEST_${Date.now()}`) {
    return prisma.payment.create({
      data: {
        reference,
        bookingId,
        userId: clientUserId,
        purpose: 'DEPOSIT',
        status: 'PROCESSING',
        currency: 'KES',
        amount,
        customerEmail: 'payer@test.local',
      },
      select: { id: true, reference: true, amount: true },
    });
  }

  /* --- Pricing authority ------------------------------------------------- */

  it('derives price from the service, ignoring anything the client might send', async () => {
    const booking = await makeBooking();

    const expected = calculateBookingPrice({
      service: {
        currency: 'KES',
        paymentModel: 'FIXED_DEPOSIT',
        depositAmount: 100_000,
        depositPercentBps: null,
        taxRateBps: 1600,
      },
      durationPrice: servicePrice,
    });

    const stored = await prisma.booking.findUniqueOrThrow({
      where: { id: booking.bookingId },
      select: { subtotal: true, tax: true, total: true, amountDueNow: true },
    });

    expect(stored.subtotal).toBe(servicePrice);
    expect(stored.tax).toBe(Math.round((servicePrice * 1600) / 10_000));
    expect(stored.total).toBe(expected.total);
    // The deposit is what holds the slot; the rest is a balance.
    expect(stored.amountDueNow).toBe(100_000);
    expect(stored.total - stored.amountDueNow).toBe(expected.balance);
  });

  it('a tampered request body cannot lower the amount charged', async () => {
    // A client crafting extra fields gets them ignored: createBooking reads
    // only the service and duration rows for money.
    const tampered = {
      serviceId,
      consultantId,
      durationMinutes,
      startAt: nextWorkingSlot(12).toISOString(),
      timezone: 'Africa/Nairobi',
      meetingProvider: 'ZOOM' as const,
      client: { firstName: 'A', lastName: 'B', email: 'payer@test.local', phone: '+254700000000' },
      // None of these are part of CreateBookingInput.
      total: 1,
      amountDueNow: 1,
      subtotal: 1,
      price: 1,
    };

    const booking = await createBooking({
      clientId: clientProfileId,
      actorId: clientUserId,
      input: tampered as never,
    });

    const stored = await prisma.booking.findUniqueOrThrow({
      where: { id: booking.bookingId },
      select: { total: true, amountDueNow: true, subtotal: true },
    });

    expect(stored.subtotal).toBe(servicePrice);
    expect(stored.amountDueNow).toBe(100_000);
    expect(stored.total).toBeGreaterThan(1);
  });

  /* --- Settlement -------------------------------------------------------- */

  it('settles a payment once and treats a repeat as already settled', async () => {
    const booking = await makeBooking(nextWorkingSlot(13));
    const payment = await makePayment(booking.bookingId, 100_000);
    const transaction = transactionFor(payment.reference, 100_000);

    const first = await settlePayment(transaction);
    expect(first.status).toBe('settled');
    expect(first.firstSettlement).toBe(true);

    const second = await settlePayment(transaction);
    expect(second.status).toBe('already_settled');
    expect(second.firstSettlement).toBe(false);

    // The booking was credited exactly once.
    const stored = await prisma.booking.findUniqueOrThrow({
      where: { id: booking.bookingId },
      select: { amountPaid: true, paymentStatus: true, status: true },
    });
    expect(stored.amountPaid).toBe(100_000);
    expect(stored.paymentStatus).toBe('PARTIALLY_PAID');
    expect(stored.status).toBe('CONFIRMED');
  });

  it('refuses to settle when Paystack reports a different amount', async () => {
    const booking = await makeBooking(nextWorkingSlot(14));
    const payment = await makePayment(booking.bookingId, 100_000);

    // Someone editing the amount at checkout to pay 1 cent instead.
    await expect(settlePayment(transactionFor(payment.reference, 100))).rejects.toMatchObject({
      code: ERROR_CODES.PAYMENT_AMOUNT_MISMATCH,
    });

    const stored = await prisma.booking.findUniqueOrThrow({
      where: { id: booking.bookingId },
      select: { amountPaid: true, paymentStatus: true, status: true },
    });
    expect(stored.amountPaid).toBe(0);
    expect(stored.status).toBe('PENDING_PAYMENT');
  });

  it('refuses to settle when the currency does not match', async () => {
    const booking = await makeBooking(nextWorkingSlot(15));
    const payment = await makePayment(booking.bookingId, 100_000);

    await expect(
      settlePayment(transactionFor(payment.reference, 100_000, { currency: 'NGN' })),
    ).rejects.toMatchObject({ code: ERROR_CODES.PAYMENT_AMOUNT_MISMATCH });
  });

  it('records a failed transaction without crediting the booking', async () => {
    const booking = await makeBooking(nextWorkingSlot(16));
    const payment = await makePayment(booking.bookingId, 100_000);

    const result = await settlePayment(
      transactionFor(payment.reference, 100_000, { status: 'failed', gateway_response: 'Declined' }),
    );
    expect(result.status).toBe('failed');

    const stored = await prisma.booking.findUniqueOrThrow({
      where: { id: booking.bookingId },
      select: { amountPaid: true, paymentStatus: true },
    });
    expect(stored.amountPaid).toBe(0);
    expect(stored.paymentStatus).toBe('FAILED');
  });

  it('an unpaid booking exposes no meeting link', async () => {
    const booking = await makeBooking(nextWorkingSlot(17));
    const meeting = await prisma.videoMeeting.findUnique({ where: { bookingId: booking.bookingId } });
    expect(meeting).toBeNull();
  });

  /* --- Webhook endpoint -------------------------------------------------- */

  it('rejects a webhook with a forged signature and settles nothing', async () => {
    const app = await buildApp();
    const booking = await makeBooking(nextWorkingSlot(18));
    const payment = await makePayment(booking.bookingId, 100_000);

    const body = JSON.stringify({ event: 'charge.success', data: transactionFor(payment.reference, 100_000) });

    const response = await app.inject({
      method: 'POST',
      url: '/api/webhooks/paystack',
      headers: { 'content-type': 'application/json', 'x-paystack-signature': 'a'.repeat(128) },
      payload: body,
    });

    expect(response.statusCode).toBe(401);
    const stored = await prisma.payment.findUniqueOrThrow({ where: { id: payment.id } });
    expect(stored.status).toBe('PROCESSING');
    await app.close();
  });

  it('rejects a webhook with no signature at all', async () => {
    const app = await buildApp();
    const response = await app.inject({
      method: 'POST',
      url: '/api/webhooks/paystack',
      headers: { 'content-type': 'application/json' },
      payload: JSON.stringify({ event: 'charge.success', data: transactionFor('nope', 1) }),
    });
    expect(response.statusCode).toBe(401);
    await app.close();
  });

  it('accepts a correctly signed webhook and settles exactly once across replays', async () => {
    const app = await buildApp();
    const booking = await makeBooking(nextWorkingSlot(19));
    const payment = await makePayment(booking.bookingId, 100_000);

    const body = JSON.stringify({
      event: 'charge.success',
      data: transactionFor(payment.reference, 100_000),
    });
    const headers = {
      'content-type': 'application/json',
      'x-paystack-signature': sign(body),
    };

    const first = await app.inject({ method: 'POST', url: '/api/webhooks/paystack', headers, payload: body });
    expect(first.statusCode).toBe(200);

    // Paystack retries the same delivery four times, then hourly for 72 hours.
    const replays = await Promise.all(
      Array.from({ length: 5 }, () =>
        app.inject({ method: 'POST', url: '/api/webhooks/paystack', headers, payload: body }),
      ),
    );
    for (const replay of replays) expect(replay.statusCode).toBe(200);

    // One webhook_events row, one credit, one payment.
    const events = await prisma.webhookEvent.count({ where: { provider: 'paystack' } });
    expect(events).toBe(1);

    const stored = await prisma.booking.findUniqueOrThrow({
      where: { id: booking.bookingId },
      select: { amountPaid: true, status: true },
    });
    expect(stored.amountPaid).toBe(100_000);
    expect(stored.status).toBe('CONFIRMED');

    const payments = await prisma.payment.count({ where: { bookingId: booking.bookingId, status: 'PAID' } });
    expect(payments).toBe(1);

    await app.close();
  });

  it('does not double-credit when the same payment is settled concurrently', async () => {
    const booking = await makeBooking(nextWorkingSlot(20));
    const payment = await makePayment(booking.bookingId, 100_000);
    const transaction = transactionFor(payment.reference, 100_000);

    const results = await Promise.allSettled([
      settlePayment(transaction),
      settlePayment(transaction),
      settlePayment(transaction),
    ]);

    const settled = results.filter(
      (r) => r.status === 'fulfilled' && r.value.firstSettlement,
    );
    expect(settled).toHaveLength(1);

    const stored = await prisma.booking.findUniqueOrThrow({
      where: { id: booking.bookingId },
      select: { amountPaid: true },
    });
    expect(stored.amountPaid).toBe(100_000);
  });
});
