import { beforeAll, beforeEach, describe, expect, it } from 'vitest';
import { ERROR_CODES } from '@meridian/types';
import { prisma } from '../src/lib/prisma.js';
import { createBooking } from '../src/services/booking.service.js';
import { getAvailability, checkSlot } from '../src/services/availability.service.js';
import { AppError } from '../src/lib/errors.js';
import {
  createClient,
  createConsultant,
  createService,
  nextWorkingSlot,
  resetDatabase,
  seedRolesAndPermissions,
} from './helpers/fixtures.js';

/**
 * The double-booking guarantee.
 *
 * These tests exist because "we check availability first" is not a guarantee —
 * two requests can both pass a check and then both insert. The booking service
 * runs its check and its insert inside one Serializable transaction, and this
 * suite is what demonstrates that actually holds under concurrency.
 */

describe('booking conflict prevention', () => {
  let consultantId: string;
  let serviceId: string;
  let clientA: string;
  let clientB: string;
  let durationMinutes: number;

  beforeAll(async () => {
    await resetDatabase();
    await seedRolesAndPermissions();
  });

  beforeEach(async () => {
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

    const consultant = await createConsultant({ email: 'c@test.local', slug: 'c-test' });
    consultantId = consultant.consultantProfileId;

    const service = await createService({ slug: 'svc-test', consultantIds: [consultantId] });
    serviceId = service.id;
    durationMinutes = service.defaultDurationMinutes;

    clientA = (await createClient({ email: 'a@test.local' })).clientProfileId;
    clientB = (await createClient({ email: 'b@test.local' })).clientProfileId;
  });

  const bookingInput = (startAt: Date) => ({
    serviceId,
    consultantId,
    durationMinutes,
    startAt: startAt.toISOString(),
    timezone: 'Africa/Nairobi',
    meetingProvider: 'ZOOM' as const,
    client: {
      firstName: 'Test',
      lastName: 'Client',
      email: 'client@test.local',
      phone: '+254700000000',
    },
  });

  it('two clients racing for the same slot: exactly one succeeds', async () => {
    const startAt = nextWorkingSlot();

    const [first, second] = await Promise.allSettled([
      createBooking({ input: bookingInput(startAt), clientId: clientA, actorId: null }),
      createBooking({ input: bookingInput(startAt), clientId: clientB, actorId: null }),
    ]);

    const fulfilled = [first, second].filter((r) => r.status === 'fulfilled');
    const rejected = [first, second].filter((r) => r.status === 'rejected');

    expect(fulfilled).toHaveLength(1);
    expect(rejected).toHaveLength(1);

    // The loser must get a conflict, not an opaque 500.
    const reason = (rejected[0] as PromiseRejectedResult).reason;
    expect(reason).toBeInstanceOf(AppError);
    expect([ERROR_CODES.BOOKING_CONFLICT, ERROR_CODES.CONFLICT]).toContain((reason as AppError).code);

    // And the database holds exactly one booking for that instant.
    const stored = await prisma.booking.count({ where: { consultantId, startAt } });
    expect(stored).toBe(1);
  });

  it('ten simultaneous attempts on one slot produce one booking', async () => {
    const startAt = nextWorkingSlot(4, 11);
    const clients = await Promise.all(
      Array.from({ length: 10 }, (_, i) => createClient({ email: `race${i}@test.local` })),
    );

    const results = await Promise.allSettled(
      clients.map((c) =>
        createBooking({ input: bookingInput(startAt), clientId: c.clientProfileId, actorId: null }),
      ),
    );

    const succeeded = results.filter((r) => r.status === 'fulfilled');
    expect(succeeded).toHaveLength(1);

    const stored = await prisma.booking.count({ where: { consultantId, startAt } });
    expect(stored).toBe(1);
  });

  it('rejects a second booking that merely overlaps the first', async () => {
    const startAt = nextWorkingSlot(5, 10);
    await createBooking({ input: bookingInput(startAt), clientId: clientA, actorId: null });

    // Starts 30 minutes into an existing 60-minute session.
    const overlapping = new Date(startAt.getTime() + 30 * 60_000);
    await expect(
      createBooking({ input: bookingInput(overlapping), clientId: clientB, actorId: null }),
    ).rejects.toMatchObject({ code: ERROR_CODES.BOOKING_CONFLICT });
  });

  it('honours the service buffer when deciding adjacency', async () => {
    await prisma.service.update({ where: { id: serviceId }, data: { bufferAfterMinutes: 15 } });

    const startAt = nextWorkingSlot(6, 10);
    await createBooking({ input: bookingInput(startAt), clientId: clientA, actorId: null });

    // Immediately after the session ends, but inside the 15-minute turnaround.
    const backToBack = new Date(startAt.getTime() + durationMinutes * 60_000);
    await expect(
      createBooking({ input: bookingInput(backToBack), clientId: clientB, actorId: null }),
    ).rejects.toMatchObject({ code: ERROR_CODES.BOOKING_CONFLICT });

    // Once the buffer has elapsed, the slot is bookable again.
    const afterBuffer = new Date(startAt.getTime() + (durationMinutes + 15) * 60_000);
    const ok = await createBooking({ input: bookingInput(afterBuffer), clientId: clientB, actorId: null });
    expect(ok.bookingId).toBeTruthy();
  });

  it('a cancelled booking releases its slot', async () => {
    const startAt = nextWorkingSlot(7, 14);
    const first = await createBooking({ input: bookingInput(startAt), clientId: clientA, actorId: null });

    await prisma.booking.update({ where: { id: first.bookingId }, data: { status: 'CANCELLED' } });

    const second = await createBooking({ input: bookingInput(startAt), clientId: clientB, actorId: null });
    expect(second.bookingId).not.toBe(first.bookingId);
  });

  it('refuses times outside the consultant’s working hours', async () => {
    // 04:00 local — well before the 09:00 fixture start.
    const tooEarly = nextWorkingSlot(3, 4);
    await expect(
      createBooking({ input: bookingInput(tooEarly), clientId: clientA, actorId: null }),
    ).rejects.toMatchObject({ code: ERROR_CODES.SLOT_UNAVAILABLE });
  });

  it('refuses a session that would run past the end of the working block', async () => {
    // 16:30 start on a 60-minute service ends at 17:30, past the 17:00 close.
    const startAt = nextWorkingSlot(3, 16);
    const overrunning = new Date(startAt.getTime() + 30 * 60_000);
    await expect(
      createBooking({ input: bookingInput(overrunning), clientId: clientA, actorId: null }),
    ).rejects.toMatchObject({ code: ERROR_CODES.SLOT_UNAVAILABLE });
  });

  it('refuses times in the past', async () => {
    const past = new Date(Date.now() - 3_600_000);
    await expect(
      createBooking({ input: bookingInput(past), clientId: clientA, actorId: null }),
    ).rejects.toMatchObject({ code: ERROR_CODES.BOOKING_IN_PAST });
  });

  it('respects the service lead time', async () => {
    await prisma.service.update({ where: { id: serviceId }, data: { leadTimeHours: 72 } });
    const tooSoon = nextWorkingSlot(1, 10);
    await expect(
      createBooking({ input: bookingInput(tooSoon), clientId: clientA, actorId: null }),
    ).rejects.toMatchObject({ code: ERROR_CODES.SLOT_UNAVAILABLE });
  });

  it('drops a booked slot out of the availability response', async () => {
    const startAt = nextWorkingSlot(8, 10);
    const from = new Date(startAt).toISOString().slice(0, 10);

    const before = await getAvailability({
      serviceId,
      consultantId,
      durationMinutes,
      from,
      to: from,
      timezone: 'Africa/Nairobi',
    });
    const offeredBefore = before.days[0]?.slots.map((s) => s.startAt) ?? [];
    expect(offeredBefore).toContain(startAt.toISOString());

    await createBooking({ input: bookingInput(startAt), clientId: clientA, actorId: null });

    const after = await getAvailability({
      serviceId,
      consultantId,
      durationMinutes,
      from,
      to: from,
      timezone: 'Africa/Nairobi',
    });
    const offeredAfter = after.days[0]?.slots.map((s) => s.startAt) ?? [];
    expect(offeredAfter).not.toContain(startAt.toISOString());
  });

  it('blocks slots covered by a one-off blackout', async () => {
    const startAt = nextWorkingSlot(9, 10);
    await prisma.availabilityBlackout.create({
      data: {
        consultantId,
        startAt: new Date(startAt.getTime() - 60_000),
        endAt: new Date(startAt.getTime() + 90 * 60_000),
        reason: 'Offsite',
      },
    });

    const check = await checkSlot({ consultantId, serviceId, startAt, durationMinutes });
    expect(check.ok).toBe(false);
    expect(check.reason).toBe('CONFLICT');
  });

  it('blocks slots covered by a mirrored calendar busy block', async () => {
    const startAt = nextWorkingSlot(10, 11);
    await prisma.calendarBusyBlock.create({
      data: {
        connectionId: crypto.randomUUID(),
        consultantId,
        startAt,
        endAt: new Date(startAt.getTime() + 60 * 60_000),
      },
    });

    await expect(
      createBooking({ input: bookingInput(startAt), clientId: clientA, actorId: null }),
    ).rejects.toMatchObject({ code: ERROR_CODES.BOOKING_CONFLICT });
  });

  it('treats a repeated idempotency key as the same booking', async () => {
    const startAt = nextWorkingSlot(11, 10);
    const input = { ...bookingInput(startAt), idempotencyKey: 'wizard-submit-abc123' };

    const first = await createBooking({ input, clientId: clientA, actorId: null });
    const second = await createBooking({ input, clientId: clientA, actorId: null });

    expect(second.bookingId).toBe(first.bookingId);
    expect(await prisma.booking.count({ where: { consultantId, startAt } })).toBe(1);
  });
});
