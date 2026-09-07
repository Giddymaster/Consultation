import { afterAll, beforeAll, describe, expect, it } from 'vitest';
import { ROLES } from '@meridian/types';
import { prisma } from '../src/lib/prisma.js';
import { buildApp } from '../src/app.js';
import { createBooking } from '../src/services/booking.service.js';
import {
  TEST_PASSWORD,
  createClient,
  createConsultant,
  createService,
  createUser,
  nextWorkingSlot,
  resetDatabase,
  seedRolesAndPermissions,
} from './helpers/fixtures.js';

/**
 * Authorization boundaries.
 *
 * These are the tests that would catch the most damaging class of bug in this
 * platform — one client reading another's records, or a client reading the
 * confidential notes a consultant wrote about them.
 */

type App = Awaited<ReturnType<typeof buildApp>>;
let app: App;

/**
 * Tokens are minted once per user and reused. Signing in inside each test
 * would trip the login rate limiter, which is doing its job — the suite should
 * not need to weaken it.
 */
const tokens = new Map<string, string>();

async function signIn(email: string): Promise<string> {
  const cached = tokens.get(email);
  if (cached) return cached;

  const response = await app.inject({
    method: 'POST',
    url: '/api/auth/login',
    payload: { email, password: TEST_PASSWORD },
  });
  if (response.statusCode !== 200) {
    throw new Error(`Sign-in failed for ${email}: ${response.statusCode} ${response.body}`);
  }
  const body = response.json() as { data: { tokens: { accessToken: string } } };
  tokens.set(email, body.data.tokens.accessToken);
  return body.data.tokens.accessToken;
}

/** A syntactically valid v4 UUID that does not exist in the database. */
const ABSENT_UUID = '11111111-1111-4111-8111-111111111111';

function auth(token: string) {
  return { authorization: `Bearer ${token}` };
}

describe('authorization boundaries', () => {
  let alice: { userId: string; clientProfileId: string; email: string };
  let bob: { userId: string; clientProfileId: string; email: string };
  let consultantA: { userId: string; consultantProfileId: string };
  let consultantB: { userId: string; consultantProfileId: string };
  let adminEmail: string;
  let financeEmail: string;
  let serviceId: string;
  let durationMinutes: number;

  let aliceBookingId: string;
  let aliceSessionId: string;
  let bobBookingId: string;

  const PRIVATE_NOTE =
    'Client is overstating revenue to the board. Raise carefully at the next session.';

  beforeAll(async () => {
    await resetDatabase();
    await seedRolesAndPermissions();
    app = await buildApp();

    consultantA = await createConsultant({ email: 'consultant-a@test.local', slug: 'consultant-a' });
    consultantB = await createConsultant({ email: 'consultant-b@test.local', slug: 'consultant-b' });

    const service = await createService({
      slug: 'authz-service',
      consultantIds: [consultantA.consultantProfileId, consultantB.consultantProfileId],
      paymentModel: 'FREE',
      price: 0,
    });
    serviceId = service.id;
    durationMinutes = service.defaultDurationMinutes;

    alice = await createClient({ email: 'alice@test.local' });
    bob = await createClient({ email: 'bob@test.local' });

    adminEmail = (await createUser({ email: 'admin@test.local', role: ROLES.ADMIN })).email;
    financeEmail = (await createUser({ email: 'finance@test.local', role: ROLES.FINANCE_MANAGER })).email;

    const makeBooking = async (clientProfileId: string, consultantProfileId: string, dayOffset: number) => {
      const result = await createBooking({
        clientId: clientProfileId,
        actorId: null,
        input: {
          serviceId,
          consultantId: consultantProfileId,
          durationMinutes,
          startAt: nextWorkingSlot(dayOffset, 10).toISOString(),
          timezone: 'Africa/Nairobi',
          meetingProvider: 'ZOOM',
          client: { firstName: 'X', lastName: 'Y', email: 'x@test.local', phone: '+254700000000' },
        },
      });
      return result.bookingId;
    };

    aliceBookingId = await makeBooking(alice.clientProfileId, consultantA.consultantProfileId, 3);
    bobBookingId = await makeBooking(bob.clientProfileId, consultantB.consultantProfileId, 4);

    // A completed session for Alice, with a private consultant note on it.
    await prisma.booking.update({
      where: { id: aliceBookingId },
      data: { status: 'COMPLETED', paymentStatus: 'PAID' },
    });
    const session = await prisma.consultationSession.create({
      data: { bookingId: aliceBookingId, status: 'COMPLETED', startedAt: new Date(), endedAt: new Date() },
    });
    aliceSessionId = session.id;

    await prisma.sessionNote.create({
      data: {
        sessionId: session.id,
        objective: 'Review the FY27 plan',
        discussionSummary: 'Worked through the revenue build.',
        recommendations: 'Rebuild the working capital schedule.',
        actionItems: [],
        privateNotes: PRIVATE_NOTE,
        sharedWithClient: true,
      },
    });
  });

  afterAll(async () => {
    await app.close();
  });

  /* --- Cross-client isolation -------------------------------------------- */

  it('a client cannot read another client’s booking', async () => {
    const token = await signIn(bob.email);
    const response = await app.inject({
      method: 'GET',
      url: `/api/bookings/${aliceBookingId}`,
      headers: auth(token),
    });

    // 404 rather than 403: Bob must not learn that this booking id exists.
    expect(response.statusCode).toBe(404);
  });

  it('a client’s booking list contains only their own bookings', async () => {
    const token = await signIn(bob.email);
    const response = await app.inject({ method: 'GET', url: '/api/bookings', headers: auth(token) });

    expect(response.statusCode).toBe(200);
    const body = response.json() as { data: { items: { id: string }[] } };
    const ids = body.data.items.map((item) => item.id);
    expect(ids).toContain(bobBookingId);
    expect(ids).not.toContain(aliceBookingId);
  });

  it('a client cannot widen their own list by passing another client’s id', async () => {
    const token = await signIn(bob.email);
    const response = await app.inject({
      method: 'GET',
      url: `/api/bookings?clientId=${alice.clientProfileId}`,
      headers: auth(token),
    });

    const body = response.json() as { data: { items: { id: string }[] } };
    // The query parameter is ignored for a caller without appointments.read.
    expect(body.data.items.map((i) => i.id)).not.toContain(aliceBookingId);
  });

  /* --- Private consultant notes ------------------------------------------ */

  it('a client never receives private consultant notes on their own session', async () => {
    const token = await signIn(alice.email);
    const response = await app.inject({
      method: 'GET',
      url: `/api/sessions/${aliceSessionId}`,
      headers: auth(token),
    });

    expect(response.statusCode).toBe(200);
    // The shared write-up is present…
    const body = response.json() as { data: { sharedNotes: { recommendations: string } | null } };
    expect(body.data.sharedNotes?.recommendations).toBe('Rebuild the working capital schedule.');

    // …and the private note does not appear anywhere in the payload, under any key.
    expect(response.body).not.toContain(PRIVATE_NOTE);
    expect(response.body).not.toContain('privateNotes');
  });

  it('the delivering consultant does receive the private note', async () => {
    const token = await signIn('consultant-a@test.local');
    const response = await app.inject({
      method: 'GET',
      url: `/api/sessions/${aliceSessionId}`,
      headers: auth(token),
    });

    expect(response.statusCode).toBe(200);
    const body = response.json() as { data: { privateNotes: string | null } };
    expect(body.data.privateNotes).toBe(PRIVATE_NOTE);
  });

  it('another consultant cannot read a session they did not deliver', async () => {
    const token = await signIn('consultant-b@test.local');
    const response = await app.inject({
      method: 'GET',
      url: `/api/sessions/${aliceSessionId}`,
      headers: auth(token),
    });
    expect(response.statusCode).toBe(404);
  });

  it('another consultant cannot edit notes on a session they did not deliver', async () => {
    const token = await signIn('consultant-b@test.local');
    const response = await app.inject({
      method: 'PUT',
      url: `/api/sessions/${aliceSessionId}/notes`,
      headers: auth(token),
      payload: { privateNotes: 'Tampered', actionItems: [], sharedWithClient: false },
    });

    expect([403, 404]).toContain(response.statusCode);

    const stored = await prisma.sessionNote.findUniqueOrThrow({ where: { sessionId: aliceSessionId } });
    expect(stored.privateNotes).toBe(PRIVATE_NOTE);
  });

  it('a client cannot write session notes at all', async () => {
    const token = await signIn(alice.email);
    const response = await app.inject({
      method: 'PUT',
      url: `/api/sessions/${aliceSessionId}/notes`,
      headers: auth(token),
      payload: { privateNotes: 'Injected by client', actionItems: [], sharedWithClient: true },
    });

    expect(response.statusCode).toBe(403);
    const stored = await prisma.sessionNote.findUniqueOrThrow({ where: { sessionId: aliceSessionId } });
    expect(stored.privateNotes).toBe(PRIVATE_NOTE);
  });

  it('an admin without sessions.notes does not receive the private note', async () => {
    // The seeded ADMIN role holds sessions.notes, so this test strips it to
    // prove the check is on the permission and not on being staff.
    const role = await prisma.role.findUniqueOrThrow({ where: { name: 'ADMIN' } });
    const permission = await prisma.permission.findUniqueOrThrow({ where: { key: 'sessions.notes' } });
    await prisma.rolePermission.deleteMany({
      where: { roleId: role.id, permissionId: permission.id },
    });

    const token = await signIn(adminEmail);
    const response = await app.inject({
      method: 'GET',
      url: `/api/sessions/${aliceSessionId}`,
      headers: auth(token),
    });

    expect(response.statusCode).toBe(200);
    expect(response.body).not.toContain(PRIVATE_NOTE);

    // Restore the grant so later tests see the seeded role.
    await prisma.rolePermission.create({
      data: { roleId: role.id, permissionId: permission.id },
    });
  });

  /* --- Permission enforcement -------------------------------------------- */

  it('a client cannot issue a refund', async () => {
    const token = await signIn(alice.email);
    const response = await app.inject({
      method: 'POST',
      url: '/api/payments/refund',
      headers: auth(token),
      payload: {
        paymentId: ABSENT_UUID,
        reason: 'I would like my money back',
      },
    });

    expect(response.statusCode).toBe(403);
    const body = response.json() as { error: { code: string } };
    expect(body.error.code).toBe('FORBIDDEN');
  });

  it('a client cannot moderate reviews', async () => {
    const token = await signIn(alice.email);
    const response = await app.inject({
      method: 'PATCH',
      url: `/api/sessions/reviews/${ABSENT_UUID}/moderate`,
      headers: auth(token),
      payload: { status: 'APPROVED' },
    });
    expect(response.statusCode).toBe(403);
  });

  it('a finance manager can reach the refund endpoint', async () => {
    const token = await signIn(financeEmail);
    const response = await app.inject({
      method: 'POST',
      url: '/api/payments/refund',
      headers: auth(token),
      payload: {
        paymentId: ABSENT_UUID,
        reason: 'Duplicate charge on the client account',
      },
    });

    // Past the permission gate: it fails on the payment not existing, not on
    // authorization. That distinction is the assertion.
    expect(response.statusCode).not.toBe(403);
    expect(response.statusCode).toBe(404);
  });

  it('a client cannot review a booking that is not theirs', async () => {
    const token = await signIn(bob.email);
    const response = await app.inject({
      method: 'POST',
      url: '/api/sessions/reviews',
      headers: auth(token),
      payload: {
        bookingId: aliceBookingId,
        rating: 1,
        body: 'Attempting to review a consultation I did not attend.',
      },
    });
    expect(response.statusCode).toBe(403);
  });

  it('a client cannot review a booking that has not happened yet', async () => {
    const token = await signIn(bob.email);
    const response = await app.inject({
      method: 'POST',
      url: '/api/sessions/reviews',
      headers: auth(token),
      payload: {
        bookingId: bobBookingId,
        rating: 5,
        body: 'Reviewing before the consultation has taken place.',
      },
    });
    expect(response.statusCode).toBe(400);
  });

  it('unauthenticated callers are rejected from every protected route', async () => {
    const routes = [
      { method: 'GET' as const, url: '/api/bookings' },
      { method: 'GET' as const, url: `/api/bookings/${aliceBookingId}` },
      { method: 'GET' as const, url: `/api/sessions/${aliceSessionId}` },
      { method: 'GET' as const, url: '/api/payments' },
      { method: 'POST' as const, url: '/api/payments/initialize' },
    ];

    for (const route of routes) {
      const response = await app.inject(route);
      expect(response.statusCode, `${route.method} ${route.url}`).toBe(401);
    }
  });

  it('public catalog routes stay open to anonymous callers', async () => {
    for (const url of ['/api/services', '/api/consultants', '/api/reviews', '/api/service-categories']) {
      const response = await app.inject({ method: 'GET', url });
      expect(response.statusCode, url).toBe(200);
    }
  });

  /* ------------------------------------------------------------------------ */
  /* Consultant workspace scoping                                             */
  /* ------------------------------------------------------------------------ */

  /**
   * A consultant once held the broad `clients.read`, which is what the admin
   * client list is gated on — so a consultant could read every client on the
   * platform, internal staff notes included. They now hold `clients.read.own`
   * and reach their own people through `/api/consultant/*` instead.
   */
  it('a consultant cannot reach the practice-wide admin lists', async () => {
    const token = await signIn('consultant-a@test.local');

    for (const url of ['/api/admin/clients', '/api/admin/invoices', '/api/admin/analytics', '/api/admin/dashboard']) {
      const response = await app.inject({ method: 'GET', url, headers: auth(token) });
      expect(response.statusCode, url).toBe(403);
    }
  });

  it("a consultant's client list contains only their own clients", async () => {
    const token = await signIn('consultant-a@test.local');
    const response = await app.inject({
      method: 'GET',
      url: '/api/consultant/clients',
      headers: auth(token),
    });

    expect(response.statusCode).toBe(200);
    const body = response.json() as { data: { items: { id: string }[] } };
    const ids = body.data.items.map((item) => item.id);

    expect(ids).toContain(alice.clientProfileId);
    // Bob books consultant B, so he is not consultant A's client.
    expect(ids).not.toContain(bob.clientProfileId);
  });

  it("a consultant gets 404, not 403, for a client they have never seen", async () => {
    const token = await signIn('consultant-a@test.local');
    const response = await app.inject({
      method: 'GET',
      url: `/api/consultant/clients/${bob.clientProfileId}`,
      headers: auth(token),
    });

    // 403 would confirm the id exists, turning the route into a client directory.
    expect(response.statusCode).toBe(404);
  });

  it("a consultant's calendar contains only their own bookings", async () => {
    const token = await signIn('consultant-a@test.local');
    const from = new Date(Date.now() - 86_400_000).toISOString();
    const to = new Date(Date.now() + 30 * 86_400_000).toISOString();

    const response = await app.inject({
      method: 'GET',
      url: `/api/consultant/calendar?from=${from}&to=${to}`,
      headers: auth(token),
    });

    expect(response.statusCode).toBe(200);
    const body = response.json() as { data: { bookings: { id: string }[] } };
    const ids = body.data.bookings.map((booking) => booking.id);

    expect(ids).toContain(aliceBookingId);
    expect(ids).not.toContain(bobBookingId);
  });

  it('a consultant cannot publish themselves or move their own listing', async () => {
    const token = await signIn('consultant-a@test.local');

    const before = await prisma.consultantProfile.findUniqueOrThrow({
      where: { id: consultantA.consultantProfileId },
      select: { slug: true, isPublished: true, sortOrder: true },
    });

    const response = await app.inject({
      method: 'PATCH',
      url: '/api/consultant/profile',
      headers: auth(token),
      payload: {
        title: 'Self-declared Senior Partner',
        slug: 'hijacked',
        isPublished: !before.isPublished,
        sortOrder: -99,
      },
    });

    expect(response.statusCode).toBe(200);

    const after = await prisma.consultantProfile.findUniqueOrThrow({
      where: { id: consultantA.consultantProfileId },
      select: { slug: true, isPublished: true, sortOrder: true, title: true },
    });

    // The field they own changed; the ones the practice owns did not.
    expect(after.title).toBe('Self-declared Senior Partner');
    expect(after.slug).toBe(before.slug);
    expect(after.isPublished).toBe(before.isPublished);
    expect(after.sortOrder).toBe(before.sortOrder);
  });

  it('a client cannot enter the consultant workspace at all', async () => {
    const token = await signIn(alice.email);

    for (const url of ['/api/consultant/clients', '/api/consultant/reviews', '/api/consultant/profile']) {
      const response = await app.inject({ method: 'GET', url, headers: auth(token) });
      expect(response.statusCode, url).toBe(403);
    }
  });

  it('a client sees only their own reviews', async () => {
    const token = await signIn(alice.email);
    const response = await app.inject({
      method: 'GET',
      url: '/api/portal/reviews',
      headers: auth(token),
    });

    expect(response.statusCode).toBe(200);
    const body = response.json() as { data: { items: { id: string }[] } };
    // Alice has written none; the point is that the route is scoped and does
    // not fall back to the public list.
    expect(body.data.items).toEqual([]);
  });
});
