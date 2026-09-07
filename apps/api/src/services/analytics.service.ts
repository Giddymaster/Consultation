import type {
  AdminDashboardDto,
  AnalyticsDto,
  BreakdownPoint,
  Currency,
  StatDelta,
  TimeSeriesPoint,
} from '@meridian/types';
import { prisma } from '../lib/prisma.js';
import { env } from '../config/env.js';
import { bucketDates, bucketKeyFor } from '../lib/time.js';

/**
 * Reporting.
 *
 * Two conventions that keep the numbers honest:
 *
 *   • **Revenue means settled cash.** Every revenue figure sums `payments` rows
 *     with status PAID, net of refunds — never booking totals, which include
 *     amounts nobody has paid yet.
 *   • **Every KPI is compared against the immediately preceding window of the
 *     same length**, so "+12%" always has a stated meaning.
 */

export interface AnalyticsRange {
  from: Date;
  to: Date;
  granularity: 'day' | 'week' | 'month';
  timezone: string;
}

export function resolveRange(preset: string, custom?: { from?: string; to?: string }): AnalyticsRange {
  const timezone = env.BUSINESS_TIMEZONE;
  const to = custom?.to ? new Date(custom.to) : new Date();

  if (custom?.from) {
    const from = new Date(custom.from);
    const spanDays = Math.max(1, (to.getTime() - from.getTime()) / 86_400_000);
    return {
      from,
      to,
      granularity: spanDays > 180 ? 'month' : spanDays > 45 ? 'week' : 'day',
      timezone,
    };
  }

  const days = preset === '7d' ? 7 : preset === '30d' ? 30 : preset === '90d' ? 90 : 365;
  return {
    from: new Date(to.getTime() - days * 86_400_000),
    to,
    granularity: days <= 45 ? 'day' : days <= 180 ? 'week' : 'month',
    timezone,
  };
}

function delta(current: number, previous: number): StatDelta {
  if (previous === 0) {
    // Growth from zero is not a percentage; report the value with no change.
    return { value: current, changePercent: current > 0 ? null : 0 };
  }
  return { value: current, changePercent: Math.round(((current - previous) / previous) * 1000) / 10 };
}

/** The window of equal length immediately before `range`. */
function previousWindow(range: AnalyticsRange): { from: Date; to: Date } {
  const span = range.to.getTime() - range.from.getTime();
  return { from: new Date(range.from.getTime() - span), to: range.from };
}

async function settledRevenue(from: Date, to: Date): Promise<number> {
  const result = await prisma.payment.aggregate({
    where: { status: 'PAID', paidAt: { gte: from, lte: to } },
    _sum: { amount: true, refundedAmount: true },
  });
  return (result._sum.amount ?? 0) - (result._sum.refundedAmount ?? 0);
}

export async function getDashboard(range: AnalyticsRange): Promise<AdminDashboardDto> {
  const previous = previousWindow(range);
  const monthStart = new Date(new Date().getFullYear(), new Date().getMonth(), 1);
  const lastMonthStart = new Date(new Date().getFullYear(), new Date().getMonth() - 1, 1);

  const [
    revenue,
    previousRevenue,
    revenueThisMonth,
    revenueLastMonth,
    allTimeRevenue,
    bookings,
    previousBookings,
    completed,
    previousCompleted,
    pending,
    cancelled,
    noShow,
    activeClients,
    previousActiveClients,
    newClients,
    previousNewClients,
    ratingAggregate,
    outstanding,
    productSales,
    previousProductSales,
  ] = await Promise.all([
    settledRevenue(range.from, range.to),
    settledRevenue(previous.from, previous.to),
    settledRevenue(monthStart, new Date()),
    settledRevenue(lastMonthStart, monthStart),
    settledRevenue(new Date(0), new Date()),
    prisma.booking.count({ where: { createdAt: { gte: range.from, lte: range.to } } }),
    prisma.booking.count({ where: { createdAt: { gte: previous.from, lte: previous.to } } }),
    prisma.booking.count({ where: { status: 'COMPLETED', startAt: { gte: range.from, lte: range.to } } }),
    prisma.booking.count({ where: { status: 'COMPLETED', startAt: { gte: previous.from, lte: previous.to } } }),
    prisma.booking.count({ where: { status: { in: ['CONFIRMED', 'RESCHEDULED'] }, startAt: { gte: new Date() } } }),
    prisma.booking.count({ where: { status: 'CANCELLED', createdAt: { gte: range.from, lte: range.to } } }),
    prisma.booking.count({ where: { status: 'NO_SHOW', startAt: { gte: range.from, lte: range.to } } }),
    prisma.booking
      .findMany({
        where: { startAt: { gte: range.from, lte: range.to } },
        select: { clientId: true },
        distinct: ['clientId'],
      })
      .then((rows) => rows.length),
    prisma.booking
      .findMany({
        where: { startAt: { gte: previous.from, lte: previous.to } },
        select: { clientId: true },
        distinct: ['clientId'],
      })
      .then((rows) => rows.length),
    prisma.clientProfile.count({ where: { createdAt: { gte: range.from, lte: range.to } } }),
    prisma.clientProfile.count({ where: { createdAt: { gte: previous.from, lte: previous.to } } }),
    prisma.review.aggregate({ where: { status: 'APPROVED' }, _avg: { rating: true } }),
    prisma.booking.findMany({
      where: {
        status: { in: ['CONFIRMED', 'RESCHEDULED', 'IN_PROGRESS'] },
        paymentStatus: { in: ['PARTIALLY_PAID', 'UNPAID'] },
      },
      select: { total: true, amountPaid: true },
    }),
    prisma.order.aggregate({
      where: { status: { in: ['PAID', 'FULFILLED', 'SHIPPED'] }, paidAt: { gte: range.from, lte: range.to } },
      _sum: { total: true },
    }),
    prisma.order.aggregate({
      where: { status: { in: ['PAID', 'FULFILLED', 'SHIPPED'] }, paidAt: { gte: previous.from, lte: previous.to } },
      _sum: { total: true },
    }),
  ]);

  const outstandingBalance = outstanding.reduce((sum, b) => sum + (b.total - b.amountPaid), 0);
  const averageSessionValue = completed > 0 ? Math.round(revenue / completed) : 0;
  const previousAverage = previousCompleted > 0 ? Math.round(previousRevenue / previousCompleted) : 0;

  // Conversion: of the bookings created in the window, how many reached a paid
  // state. Bookings still pending payment count against it, which is the point.
  const paidInWindow = await prisma.booking.count({
    where: {
      createdAt: { gte: range.from, lte: range.to },
      paymentStatus: { in: ['PAID', 'PARTIALLY_PAID'] },
    },
  });

  const repeatClients = await prisma.booking.groupBy({
    by: ['clientId'],
    where: { status: 'COMPLETED' },
    _count: { _all: true },
  });
  const returning = repeatClients.filter((row) => row._count._all > 1).length;

  return {
    currency: env.BUSINESS_CURRENCY as Currency,
    totalRevenue: delta(allTimeRevenue, 0),
    revenueThisMonth: delta(revenueThisMonth, revenueLastMonth),
    bookings: delta(bookings, previousBookings),
    completedSessions: delta(completed, previousCompleted),
    pendingSessions: pending,
    activeClients: delta(activeClients, previousActiveClients),
    newClients: delta(newClients, previousNewClients),
    averageSessionValue: delta(averageSessionValue, previousAverage),
    averageRating: ratingAggregate._avg.rating ? Math.round(ratingAggregate._avg.rating * 10) / 10 : null,
    outstandingBalance,
    productSales: delta(productSales._sum.total ?? 0, previousProductSales._sum.total ?? 0),
    conversionRatePercent: bookings > 0 ? Math.round((paidInWindow / bookings) * 1000) / 10 : null,
    cancellationRatePercent: bookings > 0 ? Math.round((cancelled / bookings) * 1000) / 10 : null,
    noShowRatePercent: completed + noShow > 0 ? Math.round((noShow / (completed + noShow)) * 1000) / 10 : null,
    repeatClientRatePercent:
      repeatClients.length > 0 ? Math.round((returning / repeatClients.length) * 1000) / 10 : null,
    consultantUtilisationPercent: await consultantUtilisation(range),
  };
}

/**
 * Booked minutes as a share of available working minutes, across all publishing
 * consultants, for the window.
 */
async function consultantUtilisation(range: AnalyticsRange): Promise<number | null> {
  const consultants = await prisma.consultantProfile.findMany({
    where: { isPublished: true },
    select: { id: true, availabilityRules: { where: { isActive: true }, select: { startTime: true, endTime: true } } },
  });
  if (consultants.length === 0) return null;

  const weeks = Math.max(1, (range.to.getTime() - range.from.getTime()) / (7 * 86_400_000));

  let capacityMinutes = 0;
  for (const consultant of consultants) {
    const weeklyMinutes = consultant.availabilityRules.reduce((sum, rule) => {
      const [startHour, startMinute] = rule.startTime.split(':').map(Number);
      const [endHour, endMinute] = rule.endTime.split(':').map(Number);
      return sum + ((endHour ?? 0) * 60 + (endMinute ?? 0) - ((startHour ?? 0) * 60 + (startMinute ?? 0)));
    }, 0);
    capacityMinutes += weeklyMinutes * weeks;
  }
  if (capacityMinutes === 0) return null;

  const booked = await prisma.booking.aggregate({
    where: {
      status: { in: ['CONFIRMED', 'RESCHEDULED', 'IN_PROGRESS', 'COMPLETED'] },
      startAt: { gte: range.from, lte: range.to },
    },
    _sum: { durationMinutes: true },
  });

  return Math.round(((booked._sum.durationMinutes ?? 0) / capacityMinutes) * 1000) / 10;
}

export async function getAnalytics(range: AnalyticsRange): Promise<AnalyticsDto> {
  const [dashboard, revenueOverTime, bookingsOverTime, byService, consultantPerformance, channels, newVsReturning] =
    await Promise.all([
      getDashboard(range),
      revenueSeries(range),
      bookingSeries(range),
      serviceBreakdown(range),
      consultantBreakdown(range),
      channelBreakdown(range),
      clientMix(range),
    ]);

  return {
    dashboard,
    revenueOverTime,
    bookingsOverTime,
    sessionsByService: byService.sessions,
    revenueByService: byService.revenue,
    consultantPerformance,
    paymentChannels: channels,
    newVsReturning,
  };
}

async function revenueSeries(range: AnalyticsRange): Promise<TimeSeriesPoint[]> {
  const payments = await prisma.payment.findMany({
    where: { status: 'PAID', paidAt: { gte: range.from, lte: range.to } },
    select: { paidAt: true, amount: true, refundedAmount: true },
  });

  // Buckets are pre-seeded with zero so a quiet week renders as a gap at the
  // baseline rather than the chart silently skipping it.
  const buckets = new Map<string, number>(
    bucketDates(range.from, range.to, range.granularity, range.timezone).map((date) => [date, 0]),
  );

  for (const payment of payments) {
    if (!payment.paidAt) continue;
    const key = bucketKeyFor(payment.paidAt, range.granularity, range.timezone);
    if (buckets.has(key)) buckets.set(key, buckets.get(key)! + payment.amount - payment.refundedAmount);
  }

  return [...buckets].map(([date, value]) => ({ date, value }));
}

async function bookingSeries(range: AnalyticsRange): Promise<TimeSeriesPoint[]> {
  const bookings = await prisma.booking.findMany({
    where: { createdAt: { gte: range.from, lte: range.to } },
    select: { createdAt: true, status: true },
  });

  const created = new Map<string, number>(
    bucketDates(range.from, range.to, range.granularity, range.timezone).map((date) => [date, 0]),
  );
  const completed = new Map<string, number>([...created].map(([date]) => [date, 0]));

  for (const booking of bookings) {
    const key = bucketKeyFor(booking.createdAt, range.granularity, range.timezone);
    if (created.has(key)) created.set(key, created.get(key)! + 1);
    if (booking.status === 'COMPLETED' && completed.has(key)) {
      completed.set(key, completed.get(key)! + 1);
    }
  }

  return [...created].map(([date, value]) => ({
    date,
    value,
    secondaryValue: completed.get(date) ?? 0,
  }));
}

async function serviceBreakdown(
  range: AnalyticsRange,
): Promise<{ sessions: BreakdownPoint[]; revenue: BreakdownPoint[] }> {
  const bookings = await prisma.booking.findMany({
    where: {
      startAt: { gte: range.from, lte: range.to },
      status: { in: ['COMPLETED', 'CONFIRMED', 'RESCHEDULED', 'IN_PROGRESS'] },
    },
    select: { amountPaid: true, service: { select: { name: true } } },
  });

  const sessions = new Map<string, number>();
  const revenue = new Map<string, number>();

  for (const booking of bookings) {
    const name = booking.service.name;
    sessions.set(name, (sessions.get(name) ?? 0) + 1);
    revenue.set(name, (revenue.get(name) ?? 0) + booking.amountPaid);
  }

  const sortDesc = (a: BreakdownPoint, b: BreakdownPoint) => b.value - a.value;

  return {
    sessions: [...sessions].map(([label, value]) => ({ label, value })).sort(sortDesc),
    revenue: [...revenue].map(([label, value]) => ({ label, value })).sort(sortDesc),
  };
}

async function consultantBreakdown(range: AnalyticsRange): Promise<BreakdownPoint[]> {
  const bookings = await prisma.booking.findMany({
    where: { startAt: { gte: range.from, lte: range.to }, status: 'COMPLETED' },
    select: {
      amountPaid: true,
      consultant: { select: { user: { select: { firstName: true, lastName: true } } } },
    },
  });

  const totals = new Map<string, { value: number; count: number }>();
  for (const booking of bookings) {
    const label = `${booking.consultant.user.firstName} ${booking.consultant.user.lastName}`;
    const current = totals.get(label) ?? { value: 0, count: 0 };
    totals.set(label, { value: current.value + booking.amountPaid, count: current.count + 1 });
  }

  return [...totals]
    .map(([label, data]) => ({ label, value: data.value, count: data.count }))
    .sort((a, b) => b.value - a.value);
}

async function channelBreakdown(range: AnalyticsRange): Promise<BreakdownPoint[]> {
  const grouped = await prisma.payment.groupBy({
    by: ['channel'],
    where: { status: 'PAID', paidAt: { gte: range.from, lte: range.to } },
    _sum: { amount: true },
    _count: { _all: true },
  });

  return grouped
    .map((row) => ({
      label: row.channel ? row.channel.replace(/_/g, ' ') : 'Unknown',
      value: row._sum.amount ?? 0,
      count: row._count._all,
    }))
    .sort((a, b) => b.value - a.value);
}

async function clientMix(range: AnalyticsRange): Promise<BreakdownPoint[]> {
  const bookings = await prisma.booking.findMany({
    where: { createdAt: { gte: range.from, lte: range.to } },
    select: { clientId: true, client: { select: { createdAt: true } } },
  });

  let newClients = 0;
  let returning = 0;
  const seen = new Set<string>();

  for (const booking of bookings) {
    if (seen.has(booking.clientId)) continue;
    seen.add(booking.clientId);
    // "New" means the client account itself was created inside this window.
    if (booking.client.createdAt >= range.from) newClients += 1;
    else returning += 1;
  }

  return [
    { label: 'New clients', value: newClients },
    { label: 'Returning clients', value: returning },
  ];
}
