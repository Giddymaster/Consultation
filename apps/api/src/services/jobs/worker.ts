import { prisma } from '../../lib/prisma.js';
import { logger } from '../../lib/logger.js';
import { addHours } from '../../lib/time.js';
import { expireStaleHolds } from '../booking.service.js';
import { sweepAbandonedPayments } from '../payments/payment.service.js';
import { syncBusyPeriods } from '../calendar/calendar.service.js';
import { notify } from '../notification.service.js';
import {
  sendBalanceDueEmail,
  sendReviewRequestEmail,
  sendSessionReminderEmail,
} from '../email/messages.js';

/**
 * Background job runner.
 *
 * Two kinds of work:
 *
 *   • **Scheduled sweeps** — periodic scans (expire stale holds, queue
 *     reminders, publish scheduled articles). These are derived from current
 *     database state rather than a queue, so a worker that was offline for an
 *     hour catches up simply by running again.
 *
 *   • **Queued jobs** — rows in `scheduled_jobs`, claimed with a conditional
 *     update so two workers cannot run the same job. Every handler is
 *     idempotent, because at-least-once delivery is the only guarantee a
 *     database-backed queue can honestly make.
 *
 * The whole thing runs in-process by default (`RUN_JOBS_IN_PROCESS`) and as a
 * separate process in production via `pnpm --filter @meridian/api jobs`.
 */

const WORKER_ID = `worker-${process.pid}-${Math.random().toString(36).slice(2, 8)}`;

/* -------------------------------------------------------------------------- */
/* Queue                                                                      */
/* -------------------------------------------------------------------------- */

export type JobType =
  | 'SESSION_REMINDER_24H'
  | 'SESSION_REMINDER_1H'
  | 'REVIEW_REQUEST'
  | 'BALANCE_REMINDER'
  | 'PUBLISH_ARTICLE'
  | 'SYNC_CALENDAR';

export interface EnqueueArgs {
  type: JobType;
  runAt: Date;
  payload: Record<string, unknown>;
  /** Makes the enqueue itself idempotent. */
  dedupeKey?: string;
}

/** Returns true only when a new job row was actually created. */
export async function enqueue(args: EnqueueArgs): Promise<boolean> {
  if (args.dedupeKey) {
    const existing = await prisma.scheduledJob.findUnique({
      where: { dedupeKey: args.dedupeKey },
      select: { id: true },
    });
    // An existing job is left exactly as it is — re-enqueuing must never reset
    // attempt counts, re-run a completed job, or move one that is running.
    if (existing) return false;

    try {
      await prisma.scheduledJob.create({
        data: {
          type: args.type,
          runAt: args.runAt,
          payload: args.payload as never,
          dedupeKey: args.dedupeKey,
        },
      });
      return true;
    } catch (error) {
      // Lost the race with another worker; the unique constraint is the
      // authority and the other worker owns the job.
      if (typeof error === 'object' && error !== null && (error as { code?: string }).code === 'P2002') {
        return false;
      }
      throw error;
    }
  }

  await prisma.scheduledJob.create({
    data: { type: args.type, runAt: args.runAt, payload: args.payload as never },
  });
  return true;
}

/**
 * Claims one due job. The conditional update is the lock: only the worker whose
 * UPDATE matches a PENDING row gets it.
 */
async function claimNextJob(): Promise<{ id: string; type: string; payload: unknown; attempts: number } | null> {
  const candidate = await prisma.scheduledJob.findFirst({
    where: { status: 'PENDING', runAt: { lte: new Date() } },
    orderBy: { runAt: 'asc' },
    select: { id: true },
  });
  if (!candidate) return null;

  const claimed = await prisma.scheduledJob.updateMany({
    where: { id: candidate.id, status: 'PENDING' },
    data: { status: 'RUNNING', lockedBy: WORKER_ID, lockedAt: new Date(), startedAt: new Date() },
  });
  if (claimed.count === 0) return null;

  return prisma.scheduledJob.findUniqueOrThrow({
    where: { id: candidate.id },
    select: { id: true, type: true, payload: true, attempts: true },
  });
}

async function completeJob(id: string): Promise<void> {
  await prisma.scheduledJob.update({
    where: { id },
    data: { status: 'COMPLETED', completedAt: new Date(), lockedBy: null, lockedAt: null },
  });
}

async function failJob(id: string, error: unknown, attempts: number): Promise<void> {
  const job = await prisma.scheduledJob.findUnique({ where: { id }, select: { maxAttempts: true } });
  const message = error instanceof Error ? error.message : String(error);
  const nextAttempt = attempts + 1;
  const exhausted = nextAttempt >= (job?.maxAttempts ?? 5);

  await prisma.scheduledJob.update({
    where: { id },
    data: {
      status: exhausted ? 'FAILED' : 'PENDING',
      attempts: nextAttempt,
      lastError: message.slice(0, 2000),
      lockedBy: null,
      lockedAt: null,
      // Exponential backoff, capped so a transient outage does not park a job
      // for days.
      ...(exhausted ? {} : { runAt: new Date(Date.now() + Math.min(2 ** nextAttempt, 60) * 60_000) }),
    },
  });

  logger.error({ jobId: id, attempts: nextAttempt, exhausted, err: error }, 'Job failed');
}

/**
 * Releases jobs whose worker died mid-run. Without this a crash would leave a
 * job RUNNING forever and it would never be retried.
 */
async function reclaimStuckJobs(): Promise<number> {
  const result = await prisma.scheduledJob.updateMany({
    where: { status: 'RUNNING', lockedAt: { lt: new Date(Date.now() - 15 * 60_000) } },
    data: { status: 'PENDING', lockedBy: null, lockedAt: null },
  });
  if (result.count > 0) logger.warn({ count: result.count }, 'Reclaimed stuck jobs');
  return result.count;
}

/* -------------------------------------------------------------------------- */
/* Handlers                                                                   */
/* -------------------------------------------------------------------------- */

const BOOKING_INCLUDE = {
  service: { select: { name: true } },
  client: { select: { user: { select: { email: true, firstName: true } } } },
  consultant: { select: { user: { select: { firstName: true, lastName: true } } } },
  videoMeeting: { select: { status: true, joinUrl: true } },
} as const;

async function bookingEmailContext(bookingId: string) {
  const booking = await prisma.booking.findUnique({
    where: { id: bookingId },
    include: BOOKING_INCLUDE,
  });
  if (!booking) return null;

  return {
    booking,
    context: {
      to: booking.client.user.email,
      firstName: booking.client.user.firstName,
      reference: booking.reference,
      serviceName: booking.service.name,
      consultantName: `${booking.consultant.user.firstName} ${booking.consultant.user.lastName}`,
      startAt: booking.startAt,
      durationMinutes: booking.durationMinutes,
      timezone: booking.timezone,
      currency: booking.currency,
      total: booking.total,
      amountPaid: booking.amountPaid,
      balance: booking.total - booking.amountPaid,
      meetingProvider: booking.meetingProvider,
      bookingId: booking.id,
    },
  };
}

const HANDLERS: Record<string, (payload: Record<string, unknown>) => Promise<void>> = {
  async SESSION_REMINDER_24H(payload) {
    const result = await bookingEmailContext(String(payload.bookingId));
    if (!result) return;

    // A booking cancelled since the reminder was queued must not be reminded.
    if (!['CONFIRMED', 'RESCHEDULED'].includes(result.booking.status)) return;

    await sendSessionReminderEmail({
      ...result.context,
      hoursAhead: 24,
      joinUrl: result.booking.videoMeeting?.status === 'CREATED' ? result.booking.videoMeeting.joinUrl : null,
    });
  },

  async SESSION_REMINDER_1H(payload) {
    const result = await bookingEmailContext(String(payload.bookingId));
    if (!result) return;
    if (!['CONFIRMED', 'RESCHEDULED'].includes(result.booking.status)) return;

    await sendSessionReminderEmail({
      ...result.context,
      hoursAhead: 1,
      joinUrl: result.booking.videoMeeting?.status === 'CREATED' ? result.booking.videoMeeting.joinUrl : null,
    });
  },

  async BALANCE_REMINDER(payload) {
    const result = await bookingEmailContext(String(payload.bookingId));
    if (!result) return;
    // Settled since the reminder was queued — nothing to chase.
    if (result.context.balance <= 0) return;
    if (!['CONFIRMED', 'RESCHEDULED'].includes(result.booking.status)) return;

    await sendBalanceDueEmail(result.context);
  },

  async REVIEW_REQUEST(payload) {
    const booking = await prisma.booking.findUnique({
      where: { id: String(payload.bookingId) },
      include: { ...BOOKING_INCLUDE, review: { select: { id: true } } },
    });
    if (!booking || booking.status !== 'COMPLETED') return;
    // Already reviewed — asking again would be noise.
    if (booking.review) return;

    await sendReviewRequestEmail({
      to: booking.client.user.email,
      firstName: booking.client.user.firstName,
      bookingId: booking.id,
      serviceName: booking.service.name,
      consultantName: `${booking.consultant.user.firstName} ${booking.consultant.user.lastName}`,
    });
  },

  async PUBLISH_ARTICLE(payload) {
    await prisma.article.updateMany({
      where: { id: String(payload.articleId), status: 'SCHEDULED' },
      data: { status: 'PUBLISHED' },
    });
  },

  async SYNC_CALENDAR(payload) {
    await syncBusyPeriods(String(payload.consultantId));
  },
};

/* -------------------------------------------------------------------------- */
/* Sweeps                                                                     */
/* -------------------------------------------------------------------------- */

/** Queues reminders for sessions coming up, without duplicating any. */
async function queueSessionReminders(): Promise<number> {
  const now = new Date();
  let queued = 0;

  // 24-hour reminders: sessions starting in 23–25 hours.
  const upcoming24 = await prisma.booking.findMany({
    where: {
      status: { in: ['CONFIRMED', 'RESCHEDULED'] },
      startAt: { gte: addHours(now, 23), lte: addHours(now, 25) },
    },
    select: { id: true, startAt: true },
  });

  for (const booking of upcoming24) {
    // The dedupe key is what makes a re-run of this sweep harmless: the count
    // reflects jobs actually created, not enqueue attempts.
    const created = await enqueue({
      type: 'SESSION_REMINDER_24H',
      runAt: now,
      payload: { bookingId: booking.id },
      dedupeKey: `reminder-24h:${booking.id}`,
    });
    if (created) queued += 1;
  }

  // 1-hour reminders: sessions starting in 45–75 minutes.
  const upcoming1 = await prisma.booking.findMany({
    where: {
      status: { in: ['CONFIRMED', 'RESCHEDULED'] },
      startAt: { gte: new Date(now.getTime() + 45 * 60_000), lte: new Date(now.getTime() + 75 * 60_000) },
    },
    select: { id: true },
  });

  for (const booking of upcoming1) {
    const created = await enqueue({
      type: 'SESSION_REMINDER_1H',
      runAt: now,
      payload: { bookingId: booking.id },
      dedupeKey: `reminder-1h:${booking.id}`,
    });
    if (created) queued += 1;
  }

  return queued;
}

/** Chases outstanding balances 48 hours before the session. */
async function queueBalanceReminders(): Promise<number> {
  const now = new Date();

  const outstanding = await prisma.booking.findMany({
    where: {
      status: { in: ['CONFIRMED', 'RESCHEDULED'] },
      paymentStatus: 'PARTIALLY_PAID',
      startAt: { gte: addHours(now, 47), lte: addHours(now, 49) },
    },
    select: { id: true },
  });

  let queued = 0;
  for (const booking of outstanding) {
    const created = await enqueue({
      type: 'BALANCE_REMINDER',
      runAt: now,
      payload: { bookingId: booking.id },
      dedupeKey: `balance:${booking.id}`,
    });
    if (created) queued += 1;
  }

  return queued;
}

/** Publishes articles whose scheduled time has arrived. */
async function publishScheduledArticles(): Promise<number> {
  const result = await prisma.article.updateMany({
    where: { status: 'SCHEDULED', publishedAt: { lte: new Date() } },
    data: { status: 'PUBLISHED' },
  });
  if (result.count > 0) logger.info({ count: result.count }, 'Published scheduled articles');
  return result.count;
}

/** Refreshes mirrored calendar busy periods for connected consultants. */
async function refreshCalendars(): Promise<number> {
  const connections = await prisma.calendarConnection.findMany({
    where: {
      syncEnabled: true,
      OR: [{ lastSyncedAt: null }, { lastSyncedAt: { lt: new Date(Date.now() - 30 * 60_000) } }],
    },
    select: { consultantId: true },
    distinct: ['consultantId'],
    take: 20,
  });

  for (const connection of connections) {
    await syncBusyPeriods(connection.consultantId).catch((error: unknown) => {
      logger.warn({ err: error, consultantId: connection.consultantId }, 'Calendar refresh failed');
    });
  }

  return connections.length;
}

/** Alerts administrators to paid bookings still missing a meeting link. */
async function alertOnStuckMeetings(): Promise<number> {
  const stuck = await prisma.videoMeeting.findMany({
    where: {
      status: 'FAILED',
      booking: { status: { in: ['CONFIRMED', 'RESCHEDULED'] }, startAt: { gte: new Date() } },
      lastAttemptAt: { lt: new Date(Date.now() - 60 * 60_000) },
    },
    select: { booking: { select: { id: true, reference: true } } },
    take: 20,
  });

  if (stuck.length === 0) return 0;

  const admins = await prisma.user.findMany({
    where: { isActive: true, roles: { some: { role: { name: { in: ['SUPER_ADMIN', 'ADMIN'] } } } } },
    select: { id: true },
    take: 5,
  });

  for (const meeting of stuck) {
    for (const admin of admins) {
      await notify({
        userId: admin.id,
        type: 'INTEGRATION_FAILURE',
        title: 'Booking still has no meeting link',
        body: `${meeting.booking.reference} is paid and confirmed but its meeting could not be created.`,
        href: `/admin/bookings/${meeting.booking.id}`,
      });
    }
  }

  return stuck.length;
}

/* -------------------------------------------------------------------------- */
/* Tick                                                                       */
/* -------------------------------------------------------------------------- */

export interface TickResult {
  jobsProcessed: number;
  remindersQueued: number;
  balancesQueued: number;
  holdsExpired: number;
  paymentsAbandoned: number;
  articlesPublished: number;
  calendarsRefreshed: number;
  stuckMeetings: number;
}

/** One pass of every sweep, then drains up to `maxJobs` from the queue. */
export async function tick(maxJobs = 25): Promise<TickResult> {
  const result: TickResult = {
    jobsProcessed: 0,
    remindersQueued: 0,
    balancesQueued: 0,
    holdsExpired: 0,
    paymentsAbandoned: 0,
    articlesPublished: 0,
    calendarsRefreshed: 0,
    stuckMeetings: 0,
  };

  // Each sweep is isolated: one failing must not stop the others.
  const safely = async <T>(label: string, work: () => Promise<T>, fallback: T): Promise<T> => {
    try {
      return await work();
    } catch (error) {
      logger.error({ err: error, sweep: label }, 'Sweep failed');
      return fallback;
    }
  };

  await safely('reclaim', reclaimStuckJobs, 0);
  result.holdsExpired = await safely('expireHolds', expireStaleHolds, 0);
  result.paymentsAbandoned = await safely('abandonPayments', sweepAbandonedPayments, 0);
  result.remindersQueued = await safely('reminders', queueSessionReminders, 0);
  result.balancesQueued = await safely('balances', queueBalanceReminders, 0);
  result.articlesPublished = await safely('articles', publishScheduledArticles, 0);
  result.calendarsRefreshed = await safely('calendars', refreshCalendars, 0);
  result.stuckMeetings = await safely('stuckMeetings', alertOnStuckMeetings, 0);

  for (let i = 0; i < maxJobs; i += 1) {
    const job = await claimNextJob();
    if (!job) break;

    const handler = HANDLERS[job.type];
    if (!handler) {
      logger.warn({ jobId: job.id, type: job.type }, 'No handler registered for job type');
      await completeJob(job.id);
      continue;
    }

    try {
      await handler((job.payload ?? {}) as Record<string, unknown>);
      await completeJob(job.id);
      result.jobsProcessed += 1;
    } catch (error) {
      await failJob(job.id, error, job.attempts);
    }
  }

  return result;
}

/* -------------------------------------------------------------------------- */
/* Scheduler                                                                  */
/* -------------------------------------------------------------------------- */

let timer: NodeJS.Timeout | null = null;
let running = false;

/**
 * Starts the periodic scheduler. Overlapping ticks are skipped rather than
 * queued, so a slow pass cannot pile up behind itself.
 */
export function startWorker(intervalMs = 60_000): void {
  if (timer) return;

  logger.info({ workerId: WORKER_ID, intervalMs }, 'Background worker started');

  const run = async () => {
    if (running) return;
    running = true;
    try {
      const result = await tick();
      const didSomething = Object.values(result).some((value) => value > 0);
      if (didSomething) logger.info(result, 'Worker tick');
    } catch (error) {
      logger.error({ err: error }, 'Worker tick failed');
    } finally {
      running = false;
    }
  };

  // Delay the first pass so it does not compete with application boot.
  timer = setInterval(() => void run(), intervalMs);
  setTimeout(() => void run(), 10_000);
}

export function stopWorker(): void {
  if (timer) {
    clearInterval(timer);
    timer = null;
    logger.info('Background worker stopped');
  }
}

export { WORKER_ID };
