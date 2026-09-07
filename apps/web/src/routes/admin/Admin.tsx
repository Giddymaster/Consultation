import { useMemo, useState } from 'react';
import { Link, useParams } from 'react-router-dom';
import {
  Area,
  AreaChart,
  Bar,
  BarChart,
  CartesianGrid,
  Cell,
  Legend,
  Pie,
  PieChart,
  ResponsiveContainer,
  Tooltip,
  XAxis,
  YAxis,
} from 'recharts';
import {
  AlertTriangle,
  ArrowDownRight,
  ArrowUpRight,
  Check,
  CircleSlash,
  Download,
  Mail,
  RefreshCw,
  Search,
  ShieldCheck,
  Star,
  TrendingUp,
  Users,
  Wallet,
  X,
} from 'lucide-react';
import type { StatDelta } from '@meridian/types';
import {
  Avatar,
  Badge,
  Button,
  Card,
  CardDescription,
  CardTitle,
  EmptyState,
  Input,
  LoadingSkeleton,
  Select,
  StatusBadge,
  Tab,
  TabList,
  TabPanel,
  Tabs,
} from '@/components/ui';
import { PageHeader } from '@/components/layout/DashboardLayout';
import { SEO } from '@/components/SEO';
import {
  useAdminAnalytics,
  useAdminClient,
  useAdminClients,
  useAdminDashboard,
  useAdminUsers,
  useAuditLogs,
  useBookings,
  useEmailLogs,
  useIntegrations,
  useModerateReview,
  usePayments,
  usePendingReviews,
} from '@/lib/queries';
import { useTheme } from '@/providers/theme-context';
import { useToast } from '@/providers/toast-context';
import { bookingStatus, cn, formatDate, formatDateTime, formatRelative, money, paymentStatus } from '@/lib/utils';

/* -------------------------------------------------------------------------- */
/* Chart theming                                                              */
/* -------------------------------------------------------------------------- */

/**
 * Charts read their palette from the CSS custom properties rather than
 * hardcoding hex values, so a theme switch restyles them along with everything
 * else instead of leaving a light-mode chart on a dark page.
 */
function useChartTheme() {
  const { resolved } = useTheme();

  return useMemo(() => {
    const read = (token: string) =>
      getComputedStyle(document.documentElement).getPropertyValue(token).trim();

    return {
      accent: `hsl(${read('--accent')})`,
      success: `hsl(${read('--success')})`,
      warning: `hsl(${read('--warning')})`,
      info: `hsl(${read('--info')})`,
      grid: `hsl(${read('--border')})`,
      axis: `hsl(${read('--muted-foreground')})`,
      surface: `hsl(${read('--card')})`,
      // A categorical ramp for breakdowns, ordered for adjacent-hue distinction.
      series: [
        `hsl(${read('--accent')})`,
        `hsl(${read('--success')})`,
        `hsl(${read('--warning')})`,
        `hsl(${read('--info')})`,
        `hsl(${read('--destructive')})`,
      ],
      isDark: resolved === 'dark',
    };
  }, [resolved]);
}

function ChartTooltip({ formatter }: { formatter?: (value: number) => string }) {
  const theme = useChartTheme();
  return (
    <Tooltip
      cursor={{ fill: theme.grid, opacity: 0.35 }}
      contentStyle={{
        background: theme.surface,
        border: `1px solid ${theme.grid}`,
        borderRadius: 12,
        fontSize: 12,
        boxShadow: 'var(--shadow-raised)',
      }}
      labelStyle={{ color: theme.axis, marginBottom: 4 }}
      formatter={((value: unknown) =>
        formatter && typeof value === 'number' ? formatter(value) : String(value ?? '')) as never}
    />
  );
}

/* -------------------------------------------------------------------------- */
/* Dashboard                                                                  */
/* -------------------------------------------------------------------------- */

const RANGE_PRESETS = [
  { value: '7d', label: '7 days' },
  { value: '30d', label: '30 days' },
  { value: '90d', label: '90 days' },
  { value: '12m', label: '12 months' },
];

export function AdminDashboard() {
  const [preset, setPreset] = useState('30d');
  const { data, isLoading } = useAdminDashboard({ preset });
  const { data: analytics } = useAdminAnalytics({ preset });
  const theme = useChartTheme();

  return (
    <>
      <SEO title="Admin dashboard" noIndex />
      <PageHeader
        title="Dashboard"
        description="Revenue counts settled payments net of refunds — not booking totals."
        action={
          <div className="flex gap-1 rounded-[var(--radius-control)] bg-muted p-1">
            {RANGE_PRESETS.map((range) => (
              <button
                key={range.value}
                type="button"
                onClick={() => setPreset(range.value)}
                aria-pressed={preset === range.value}
                className={cn(
                  'rounded-[calc(var(--radius-control)-2px)] px-3 py-1.5 text-xs font-medium transition-colors',
                  preset === range.value ? 'bg-card text-foreground shadow-[var(--shadow-subtle)]' : 'text-muted-foreground',
                )}
              >
                {range.label}
              </button>
            ))}
          </div>
        }
      />

      {isLoading ? (
        <LoadingSkeleton rows={8} />
      ) : data ? (
        <>
          <div className="grid gap-4 sm:grid-cols-2 lg:grid-cols-4">
            <KpiCard label="Revenue this month" delta={data.revenueThisMonth} currency={data.currency} money />
            <KpiCard label="Bookings" delta={data.bookings} />
            <KpiCard label="Completed sessions" delta={data.completedSessions} />
            <KpiCard label="Average session value" delta={data.averageSessionValue} currency={data.currency} money />
          </div>

          <div className="mt-4 grid gap-4 sm:grid-cols-2 lg:grid-cols-4">
            <SmallStat label="Total revenue" value={money(data.totalRevenue.value, data.currency)} icon={<Wallet className="size-4" aria-hidden />} />
            <SmallStat label="Outstanding balances" value={money(data.outstandingBalance, data.currency)} icon={<AlertTriangle className="size-4" aria-hidden />} tone="warning" />
            <SmallStat label="Active clients" value={String(data.activeClients.value)} icon={<Users className="size-4" aria-hidden />} />
            <SmallStat label="Average rating" value={data.averageRating ? `${data.averageRating.toFixed(1)} ★` : '—'} icon={<Star className="size-4" aria-hidden />} />
          </div>

          <div className="mt-4 grid gap-4 sm:grid-cols-2 lg:grid-cols-5">
            <RateCard label="Conversion" value={data.conversionRatePercent} good="high" />
            <RateCard label="Cancellations" value={data.cancellationRatePercent} good="low" />
            <RateCard label="No-shows" value={data.noShowRatePercent} good="low" />
            <RateCard label="Repeat clients" value={data.repeatClientRatePercent} good="high" />
            <RateCard label="Utilisation" value={data.consultantUtilisationPercent} good="high" />
          </div>

          {analytics && (
            <div className="mt-6 grid gap-4 lg:grid-cols-2">
              <Card>
                <CardTitle>Revenue over time</CardTitle>
                <CardDescription className="mt-1">Settled payments, net of refunds.</CardDescription>
                <div className="mt-6 h-64">
                  {analytics.revenueOverTime.some((point) => point.value > 0) ? (
                    <ResponsiveContainer width="100%" height="100%">
                      <AreaChart data={analytics.revenueOverTime} margin={{ top: 4, right: 4, bottom: 0, left: -12 }}>
                        <defs>
                          <linearGradient id="revenueFill" x1="0" y1="0" x2="0" y2="1">
                            <stop offset="0%" stopColor={theme.accent} stopOpacity={0.28} />
                            <stop offset="100%" stopColor={theme.accent} stopOpacity={0} />
                          </linearGradient>
                        </defs>
                        <CartesianGrid stroke={theme.grid} strokeDasharray="3 3" vertical={false} />
                        <XAxis dataKey="date" stroke={theme.axis} fontSize={11} tickLine={false} axisLine={false} tickFormatter={(value: string) => formatDate(value)} />
                        <YAxis stroke={theme.axis} fontSize={11} tickLine={false} axisLine={false} tickFormatter={(value: number) => money(value, data.currency, { compact: true })} />
                        <ChartTooltip formatter={(value) => money(value, data.currency)} />
                        <Area type="monotone" dataKey="value" stroke={theme.accent} strokeWidth={2} fill="url(#revenueFill)" name="Revenue" />
                      </AreaChart>
                    </ResponsiveContainer>
                  ) : (
                    <ChartEmpty message="No settled payments in this period." />
                  )}
                </div>
              </Card>

              <Card>
                <CardTitle>Bookings over time</CardTitle>
                <CardDescription className="mt-1">Created against completed.</CardDescription>
                <div className="mt-6 h-64">
                  {analytics.bookingsOverTime.some((point) => point.value > 0) ? (
                    <ResponsiveContainer width="100%" height="100%">
                      <BarChart data={analytics.bookingsOverTime} margin={{ top: 4, right: 4, bottom: 0, left: -20 }}>
                        <CartesianGrid stroke={theme.grid} strokeDasharray="3 3" vertical={false} />
                        <XAxis dataKey="date" stroke={theme.axis} fontSize={11} tickLine={false} axisLine={false} tickFormatter={(value: string) => formatDate(value)} />
                        <YAxis stroke={theme.axis} fontSize={11} tickLine={false} axisLine={false} allowDecimals={false} />
                        <ChartTooltip />
                        <Legend wrapperStyle={{ fontSize: 12 }} />
                        <Bar dataKey="value" fill={theme.accent} name="Created" radius={[4, 4, 0, 0]} />
                        <Bar dataKey="secondaryValue" fill={theme.success} name="Completed" radius={[4, 4, 0, 0]} />
                      </BarChart>
                    </ResponsiveContainer>
                  ) : (
                    <ChartEmpty message="No bookings in this period." />
                  )}
                </div>
              </Card>

              <Card>
                <CardTitle>Revenue by service</CardTitle>
                <div className="mt-6 h-64">
                  {analytics.revenueByService.length > 0 ? (
                    <ResponsiveContainer width="100%" height="100%">
                      <BarChart data={analytics.revenueByService.slice(0, 6)} layout="vertical" margin={{ left: 12, right: 12 }}>
                        <CartesianGrid stroke={theme.grid} strokeDasharray="3 3" horizontal={false} />
                        <XAxis type="number" stroke={theme.axis} fontSize={11} tickLine={false} axisLine={false} tickFormatter={(value: number) => money(value, data.currency, { compact: true })} />
                        <YAxis type="category" dataKey="label" stroke={theme.axis} fontSize={11} width={130} tickLine={false} axisLine={false} />
                        <ChartTooltip formatter={(value) => money(value, data.currency)} />
                        <Bar dataKey="value" fill={theme.accent} radius={[0, 4, 4, 0]} name="Revenue" />
                      </BarChart>
                    </ResponsiveContainer>
                  ) : (
                    <ChartEmpty message="No revenue recorded by service yet." />
                  )}
                </div>
              </Card>

              <Card>
                <CardTitle>Payment channels</CardTitle>
                <div className="mt-6 h-64">
                  {analytics.paymentChannels.length > 0 ? (
                    <ResponsiveContainer width="100%" height="100%">
                      <PieChart>
                        <Pie data={analytics.paymentChannels} dataKey="value" nameKey="label" innerRadius={54} outerRadius={88} paddingAngle={3} strokeWidth={0}>
                          {analytics.paymentChannels.map((entry, index) => (
                            <Cell key={entry.label} fill={theme.series[index % theme.series.length]} />
                          ))}
                        </Pie>
                        <ChartTooltip formatter={(value) => money(value, data.currency)} />
                        <Legend wrapperStyle={{ fontSize: 12 }} />
                      </PieChart>
                    </ResponsiveContainer>
                  ) : (
                    <ChartEmpty message="No payments settled yet." />
                  )}
                </div>
              </Card>
            </div>
          )}
        </>
      ) : null}
    </>
  );
}

function KpiCard({
  label,
  delta,
  currency,
  money: isMoney,
}: {
  label: string;
  delta: StatDelta;
  currency?: string;
  money?: boolean;
}) {
  const positive = (delta.changePercent ?? 0) >= 0;

  return (
    <Card>
      <p className="text-sm text-muted-foreground">{label}</p>
      <p className="tabular mt-2 text-h2">
        {isMoney ? money(delta.value, currency ?? 'KES', { compact: delta.value > 10_000_00 }) : delta.value.toLocaleString()}
      </p>
      {delta.changePercent !== null && (
        <p
          className={cn(
            'mt-2 inline-flex items-center gap-1 text-xs font-medium',
            positive ? 'text-success' : 'text-destructive',
          )}
        >
          {positive ? <ArrowUpRight className="size-3.5" aria-hidden /> : <ArrowDownRight className="size-3.5" aria-hidden />}
          {Math.abs(delta.changePercent)}%
          <span className="font-normal text-muted-foreground">vs previous period</span>
        </p>
      )}
    </Card>
  );
}

function SmallStat({
  label,
  value,
  icon,
  tone = 'neutral',
}: {
  label: string;
  value: string;
  icon: React.ReactNode;
  tone?: 'neutral' | 'warning';
}) {
  return (
    <Card className="flex items-center gap-4">
      <span
        className={cn(
          'flex size-9 shrink-0 items-center justify-center rounded-[var(--radius-control)]',
          tone === 'warning' ? 'bg-warning-soft text-warning' : 'bg-muted text-muted-foreground',
        )}
      >
        {icon}
      </span>
      <div className="min-w-0">
        <p className="tabular truncate font-semibold">{value}</p>
        <p className="truncate text-xs text-muted-foreground">{label}</p>
      </div>
    </Card>
  );
}

function RateCard({ label, value, good }: { label: string; value: number | null; good: 'high' | 'low' }) {
  const tone =
    value === null
      ? 'neutral'
      : good === 'high'
        ? value >= 60
          ? 'success'
          : value >= 30
            ? 'warning'
            : 'destructive'
        : value <= 10
          ? 'success'
          : value <= 25
            ? 'warning'
            : 'destructive';

  return (
    <Card>
      <p className="text-xs text-muted-foreground">{label}</p>
      <p className={cn('tabular mt-1.5 text-xl font-semibold', tone === 'success' && 'text-success', tone === 'warning' && 'text-warning', tone === 'destructive' && 'text-destructive')}>
        {value === null ? '—' : `${value}%`}
      </p>
    </Card>
  );
}

function ChartEmpty({ message }: { message: string }) {
  return (
    <div className="flex h-full items-center justify-center rounded-[var(--radius-panel)] bg-muted/40">
      <p className="text-sm text-muted-foreground">{message}</p>
    </div>
  );
}

/* -------------------------------------------------------------------------- */
/* Bookings                                                                   */
/* -------------------------------------------------------------------------- */

export function AdminBookings() {
  const [search, setSearch] = useState('');
  const [status, setStatus] = useState('');
  const { data, isLoading } = useBookings({ pageSize: 50, search: search || undefined, status: status || undefined });

  return (
    <>
      <SEO title="Bookings" noIndex />
      <PageHeader title="Bookings" description="Every consultation booked on the platform." />

      <Card padded={false} className="overflow-hidden">
        <div className="flex flex-wrap gap-3 border-b border-border p-4">
          <div className="relative min-w-56 flex-1">
            <Search className="absolute top-1/2 left-3 size-4 -translate-y-1/2 text-muted-foreground" aria-hidden />
            <Input
              value={search}
              onChange={(event) => setSearch(event.target.value)}
              placeholder="Search reference, client or email"
              aria-label="Search bookings"
              className="pl-10"
            />
          </div>
          <Select value={status} onChange={(event) => setStatus(event.target.value)} aria-label="Filter by status" className="w-52">
            <option value="">All statuses</option>
            <option value="PENDING_PAYMENT">Awaiting payment</option>
            <option value="CONFIRMED">Confirmed</option>
            <option value="IN_PROGRESS">In progress</option>
            <option value="COMPLETED">Completed</option>
            <option value="CANCELLED">Cancelled</option>
            <option value="NO_SHOW">No show</option>
          </Select>
        </div>

        {isLoading ? (
          <div className="p-5">
            <LoadingSkeleton rows={6} />
          </div>
        ) : data && data.items.length > 0 ? (
          <div className="overflow-x-auto scroll-slim">
            <table className="w-full text-sm">
              <thead>
                <tr className="border-b border-border text-left text-xs text-muted-foreground">
                  <th className="px-5 py-3 font-medium">Reference</th>
                  <th className="px-5 py-3 font-medium">Client</th>
                  <th className="px-5 py-3 font-medium">Consultant</th>
                  <th className="px-5 py-3 font-medium">Service</th>
                  <th className="px-5 py-3 font-medium">When</th>
                  <th className="px-5 py-3 text-right font-medium">Total</th>
                  <th className="px-5 py-3 font-medium">Payment</th>
                  <th className="px-5 py-3 font-medium">Status</th>
                </tr>
              </thead>
              <tbody>
                {data.items.map((booking) => (
                  <tr key={booking.id} className="border-b border-border transition-colors last:border-0 hover:bg-muted/40">
                    <td className="tabular px-5 py-4 font-medium">
                      <Link to={`/portal/bookings/${booking.id}`} className="hover:text-accent">
                        {booking.reference}
                      </Link>
                    </td>
                    <td className="px-5 py-4">{booking.client?.fullName ?? '—'}</td>
                    <td className="px-5 py-4 text-muted-foreground">{booking.consultant.fullName}</td>
                    <td className="px-5 py-4 text-muted-foreground">{booking.service.name}</td>
                    <td className="px-5 py-4 whitespace-nowrap text-muted-foreground">
                      {formatDateTime(booking.startAt, booking.timezone)}
                    </td>
                    <td className="tabular px-5 py-4 text-right font-medium">{money(booking.total, booking.currency)}</td>
                    <td className="px-5 py-4">
                      <StatusBadge {...paymentStatus(booking.paymentStatus)} />
                    </td>
                    <td className="px-5 py-4">
                      <StatusBadge {...bookingStatus(booking.status)} />
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        ) : (
          <div className="p-5">
            <EmptyState title="No bookings match those filters" />
          </div>
        )}
      </Card>
    </>
  );
}

/* -------------------------------------------------------------------------- */
/* Payments                                                                   */
/* -------------------------------------------------------------------------- */

export function AdminPayments() {
  const [status, setStatus] = useState('');
  const [search, setSearch] = useState('');
  const { data, isLoading } = usePayments({ pageSize: 50, status: status || undefined, search: search || undefined });

  return (
    <>
      <SEO title="Payments" noIndex />
      <PageHeader title="Payments" description="Every transaction recorded through Paystack." />

      {data && (
        <div className="mb-6 grid gap-4 sm:grid-cols-3">
          <SmallStat label="Collected" value={money(data.totals.collected, 'KES')} icon={<Wallet className="size-4" aria-hidden />} />
          <SmallStat label="Refunded" value={money(data.totals.refunded, 'KES')} icon={<RefreshCw className="size-4" aria-hidden />} tone="warning" />
          <SmallStat label="Provider fees" value={money(data.totals.fees, 'KES')} icon={<TrendingUp className="size-4" aria-hidden />} />
        </div>
      )}

      <Card padded={false} className="overflow-hidden">
        <div className="flex flex-wrap gap-3 border-b border-border p-4">
          <div className="relative min-w-56 flex-1">
            <Search className="absolute top-1/2 left-3 size-4 -translate-y-1/2 text-muted-foreground" aria-hidden />
            <Input value={search} onChange={(event) => setSearch(event.target.value)} placeholder="Search reference or email" aria-label="Search payments" className="pl-10" />
          </div>
          <Select value={status} onChange={(event) => setStatus(event.target.value)} aria-label="Filter by status" className="w-52">
            <option value="">All statuses</option>
            <option value="PAID">Successful</option>
            <option value="PROCESSING">Pending</option>
            <option value="FAILED">Failed</option>
            <option value="REFUNDED">Refunded</option>
            <option value="ABANDONED">Abandoned</option>
          </Select>
        </div>

        {isLoading ? (
          <div className="p-5">
            <LoadingSkeleton rows={6} />
          </div>
        ) : data && data.items.length > 0 ? (
          <div className="overflow-x-auto scroll-slim">
            <table className="w-full text-sm">
              <thead>
                <tr className="border-b border-border text-left text-xs text-muted-foreground">
                  <th className="px-5 py-3 font-medium">Reference</th>
                  <th className="px-5 py-3 font-medium">Customer</th>
                  <th className="px-5 py-3 font-medium">For</th>
                  <th className="px-5 py-3 font-medium">Channel</th>
                  <th className="px-5 py-3 text-right font-medium">Amount</th>
                  <th className="px-5 py-3 font-medium">Paid</th>
                  <th className="px-5 py-3 font-medium">Status</th>
                </tr>
              </thead>
              <tbody>
                {data.items.map((payment) => {
                  const row = payment as Record<string, unknown>;
                  const booking = row.booking as { reference: string; serviceName: string; clientName: string } | null;

                  return (
                    <tr key={String(row.id)} className="border-b border-border transition-colors last:border-0 hover:bg-muted/40">
                      <td className="tabular px-5 py-4 font-medium">{String(row.reference)}</td>
                      <td className="px-5 py-4">{booking?.clientName ?? String(row.customerEmail ?? '—')}</td>
                      <td className="px-5 py-4 text-muted-foreground">{booking?.serviceName ?? 'Resources'}</td>
                      <td className="px-5 py-4 text-muted-foreground">{String(row.channel ?? '—').replace(/_/g, ' ')}</td>
                      <td className="tabular px-5 py-4 text-right font-medium">
                        {money(Number(row.amount), String(row.currency))}
                      </td>
                      <td className="px-5 py-4 whitespace-nowrap text-muted-foreground">
                        {row.paidAt ? formatDate(String(row.paidAt)) : '—'}
                      </td>
                      <td className="px-5 py-4">
                        <StatusBadge {...paymentStatus(String(row.status) as never)} />
                      </td>
                    </tr>
                  );
                })}
              </tbody>
            </table>
          </div>
        ) : (
          <div className="p-5">
            <EmptyState title="No payments match those filters" />
          </div>
        )}
      </Card>
    </>
  );
}

/* -------------------------------------------------------------------------- */
/* Clients                                                                    */
/* -------------------------------------------------------------------------- */

export function AdminClients() {
  const [search, setSearch] = useState('');
  const { data, isLoading } = useAdminClients({ pageSize: 50, search: search || undefined });

  return (
    <>
      <SEO title="Clients" noIndex />
      <PageHeader title="Clients" description="Everyone who has registered or booked with us." />

      <Card padded={false} className="overflow-hidden">
        <div className="border-b border-border p-4">
          <div className="relative max-w-md">
            <Search className="absolute top-1/2 left-3 size-4 -translate-y-1/2 text-muted-foreground" aria-hidden />
            <Input value={search} onChange={(event) => setSearch(event.target.value)} placeholder="Search name, email, company or code" aria-label="Search clients" className="pl-10" />
          </div>
        </div>

        {isLoading ? (
          <div className="p-5">
            <LoadingSkeleton rows={6} />
          </div>
        ) : data && data.items.length > 0 ? (
          <div className="overflow-x-auto scroll-slim">
            <table className="w-full text-sm">
              <thead>
                <tr className="border-b border-border text-left text-xs text-muted-foreground">
                  <th className="px-5 py-3 font-medium">Client</th>
                  <th className="px-5 py-3 font-medium">Organisation</th>
                  <th className="px-5 py-3 font-medium">Industry</th>
                  <th className="px-5 py-3 text-right font-medium">Bookings</th>
                  <th className="px-5 py-3 font-medium">Joined</th>
                  <th className="px-5 py-3 font-medium">Verified</th>
                </tr>
              </thead>
              <tbody>
                {data.items.map((client) => {
                  const row = client as Record<string, unknown>;
                  return (
                    <tr key={String(row.id)} className="border-b border-border transition-colors last:border-0 hover:bg-muted/40">
                      <td className="px-5 py-4">
                        <Link to={`/admin/clients/${String(row.id)}`} className="flex items-center gap-3 hover:text-accent">
                          <Avatar name={String(row.fullName)} size="xs" />
                          <span className="min-w-0">
                            <span className="block truncate font-medium">{String(row.fullName)}</span>
                            <span className="block truncate text-xs text-muted-foreground">{String(row.email)}</span>
                          </span>
                        </Link>
                      </td>
                      <td className="px-5 py-4 text-muted-foreground">{String(row.company ?? '—')}</td>
                      <td className="px-5 py-4 text-muted-foreground">{String(row.industry ?? '—')}</td>
                      <td className="tabular px-5 py-4 text-right">{String(row.bookingCount)}</td>
                      <td className="px-5 py-4 whitespace-nowrap text-muted-foreground">{formatDate(String(row.createdAt))}</td>
                      <td className="px-5 py-4">
                        {row.emailVerified ? (
                          <Badge tone="success">Verified</Badge>
                        ) : (
                          <Badge tone="warning">Pending</Badge>
                        )}
                      </td>
                    </tr>
                  );
                })}
              </tbody>
            </table>
          </div>
        ) : (
          <div className="p-5">
            <EmptyState title="No clients found" />
          </div>
        )}
      </Card>
    </>
  );
}

export function AdminClientDetail() {
  const { id } = useParams<{ id: string }>();
  const { data, isLoading } = useAdminClient(id);

  if (isLoading) return <LoadingSkeleton rows={8} />;
  if (!data) return <EmptyState title="Client not found" />;

  const client = data as Record<string, never>;
  const stats = client.stats as unknown as {
    bookings: number;
    completed: number;
    cancelled: number;
    totalSpend: number;
    outstanding: number;
  };
  const timeline = client.timeline as unknown as {
    id: string;
    type: string;
    title: string;
    description: string | null;
    occurredAt: string;
    href: string | null;
  }[];
  const bookings = client.bookings as unknown as Record<string, string | number>[];

  return (
    <>
      <SEO title={String(client.fullName)} noIndex />
      <PageHeader
        title={String(client.fullName)}
        description={`${String(client.clientCode)} · ${String(client.email)}`}
        breadcrumbs={[
          { label: 'Admin', to: '/admin' },
          { label: 'Clients', to: '/admin/clients' },
          { label: String(client.fullName) },
        ]}
      />

      <div className="mb-6 grid gap-4 sm:grid-cols-2 lg:grid-cols-4">
        <SmallStat label="Bookings" value={String(stats.bookings)} icon={<Users className="size-4" aria-hidden />} />
        <SmallStat label="Completed" value={String(stats.completed)} icon={<Check className="size-4" aria-hidden />} />
        <SmallStat label="Lifetime value" value={money(stats.totalSpend, 'KES')} icon={<Wallet className="size-4" aria-hidden />} />
        <SmallStat label="Outstanding" value={money(stats.outstanding, 'KES')} icon={<AlertTriangle className="size-4" aria-hidden />} tone="warning" />
      </div>

      <Tabs defaultValue="timeline">
        <TabList>
          <Tab value="timeline">Activity</Tab>
          <Tab value="bookings">Bookings</Tab>
          <Tab value="profile">Profile</Tab>
        </TabList>

        <TabPanel value="timeline">
          <Card>
            <ol className="relative space-y-6 border-l border-border pl-6">
              {timeline.map((event) => (
                <li key={event.id} className="relative">
                  <span className="absolute top-1.5 -left-[1.8125rem] size-2.5 rounded-full bg-accent ring-4 ring-background" aria-hidden />
                  <p className="text-sm font-medium">{event.title}</p>
                  {event.description && <p className="mt-0.5 text-xs text-muted-foreground">{event.description}</p>}
                  <p className="mt-1 text-xs text-muted-foreground">{formatRelative(event.occurredAt)}</p>
                </li>
              ))}
            </ol>
          </Card>
        </TabPanel>

        <TabPanel value="bookings">
          <div className="space-y-3">
            {bookings.map((booking) => (
              <Card key={String(booking.id)} className="flex flex-wrap items-center gap-4">
                <div className="min-w-0 flex-1">
                  <p className="truncate font-medium">{String(booking.serviceName)}</p>
                  <p className="truncate text-xs text-muted-foreground">
                    {formatDate(String(booking.startAt))} · {String(booking.consultantName)}
                  </p>
                </div>
                <span className="tabular text-sm font-medium">{money(Number(booking.total), 'KES')}</span>
                <StatusBadge {...bookingStatus(String(booking.status) as never)} />
              </Card>
            ))}
          </div>
        </TabPanel>

        <TabPanel value="profile">
          <Card>
            <dl className="grid gap-4 sm:grid-cols-2">
              {(
                [
                  ['Email', client.email],
                  ['Phone', client.phone],
                  ['Organisation', client.company],
                  ['Job title', client.jobTitle],
                  ['Industry', client.industry],
                  ['Company size', client.companySize],
                  ['City', client.city],
                  ['Source', client.source],
                ] as [string, string | null | undefined][]
              ).map(([label, value]) => (
                <div key={label}>
                  <dt className="text-xs text-muted-foreground">{label}</dt>
                  <dd className="mt-0.5 text-sm">{value ?? '—'}</dd>
                </div>
              ))}
            </dl>

            {client.internalNotes && (
              <div className="mt-6 rounded-[var(--radius-panel)] bg-warning-soft p-4">
                <p className="text-xs font-semibold text-warning">Internal notes — staff only</p>
                <p className="mt-2 text-sm text-warning/90">{String(client.internalNotes)}</p>
              </div>
            )}
          </Card>
        </TabPanel>
      </Tabs>
    </>
  );
}

/* -------------------------------------------------------------------------- */
/* Reviews moderation                                                         */
/* -------------------------------------------------------------------------- */

export function AdminReviews() {
  const [status, setStatus] = useState<'PENDING' | 'APPROVED' | 'REJECTED'>('PENDING');
  const { data, isLoading } = usePendingReviews({ status, pageSize: 50 });
  const moderate = useModerateReview();
  const toast = useToast();

  return (
    <>
      <SEO title="Reviews" noIndex />
      <PageHeader title="Reviews" description="Reviews appear publicly only after approval." />

      <div className="mb-6 flex gap-2">
        {(['PENDING', 'APPROVED', 'REJECTED'] as const).map((value) => (
          <button
            key={value}
            type="button"
            onClick={() => setStatus(value)}
            aria-pressed={status === value}
            className={cn(
              'rounded-full px-3.5 py-1.5 text-sm font-medium transition-colors',
              status === value ? 'bg-primary text-primary-foreground' : 'bg-muted text-muted-foreground hover:text-foreground',
            )}
          >
            {value.charAt(0) + value.slice(1).toLowerCase()}
          </button>
        ))}
      </div>

      {isLoading ? (
        <LoadingSkeleton rows={4} />
      ) : data && data.items.length > 0 ? (
        <div className="space-y-4">
          {data.items.map((review) => {
            const row = review as Record<string, unknown>;
            const moderatorView = row.moderatorView as { authorName: string; authorEmail: string; bookingReference: string };

            return (
              <Card key={String(row.id)}>
                <div className="flex flex-wrap items-start justify-between gap-4">
                  <div className="min-w-0 flex-1">
                    <div className="flex items-center gap-2">
                      <span className="text-warning" aria-label={`${String(row.rating)} stars`}>
                        {'★'.repeat(Number(row.rating))}
                        <span className="text-border">{'★'.repeat(5 - Number(row.rating))}</span>
                      </span>
                      {Boolean(row.isVerified) && <Badge tone="success">Verified booking</Badge>}
                    </div>

                    {row.title ? <h3 className="mt-2.5 font-semibold">{String(row.title)}</h3> : null}
                    <p className="mt-2 text-sm leading-relaxed text-muted-foreground">{String(row.body)}</p>

                    <p className="mt-4 text-xs text-muted-foreground">
                      {moderatorView.authorName} ({moderatorView.authorEmail}) · {String(row.serviceName ?? '')} ·{' '}
                      {moderatorView.bookingReference} · {formatDate(String(row.createdAt))}
                      {Boolean(row.isAnonymous) && ' · will publish anonymously'}
                    </p>
                  </div>

                  {status === 'PENDING' && (
                    <div className="flex gap-2">
                      <Button
                        size="sm"
                        icon={<Check className="size-3.5" aria-hidden />}
                        loading={moderate.isPending}
                        onClick={() =>
                          moderate.mutate(
                            { id: String(row.id), status: 'APPROVED' },
                            { onSuccess: () => toast.success('Review approved', 'It is now visible publicly.') },
                          )
                        }
                      >
                        Approve
                      </Button>
                      <Button
                        size="sm"
                        variant="secondary"
                        icon={<X className="size-3.5" aria-hidden />}
                        loading={moderate.isPending}
                        onClick={() =>
                          moderate.mutate(
                            { id: String(row.id), status: 'REJECTED' },
                            { onSuccess: () => toast.info('Review rejected', 'It will not appear publicly.') },
                          )
                        }
                      >
                        Reject
                      </Button>
                    </div>
                  )}
                </div>
              </Card>
            );
          })}
        </div>
      ) : (
        <EmptyState
          icon={<Star className="size-5" aria-hidden />}
          title={status === 'PENDING' ? 'Nothing awaiting moderation' : `No ${status.toLowerCase()} reviews`}
        />
      )}
    </>
  );
}

/* -------------------------------------------------------------------------- */
/* Integrations                                                               */
/* -------------------------------------------------------------------------- */

export function AdminIntegrations() {
  const { data, isLoading } = useIntegrations();

  const grouped = useMemo(() => {
    const map = new Map<string, typeof data>();
    for (const integration of data ?? []) {
      map.set(integration.category, [...(map.get(integration.category) ?? []), integration]);
    }
    return map;
  }, [data]);

  return (
    <>
      <SEO title="Integrations" noIndex />
      <PageHeader
        title="Integrations"
        description="Connection state is derived from whether credentials actually work — never assumed."
      />

      {isLoading ? (
        <LoadingSkeleton rows={6} />
      ) : (
        <div className="space-y-8">
          {[...grouped].map(([category, integrations]) => (
            <section key={category}>
              <h2 className="mb-4 text-h3 capitalize">{category}</h2>
              <div className="grid gap-4 sm:grid-cols-2">
                {integrations?.map((integration) => (
                  <Card key={integration.key}>
                    <div className="flex items-start justify-between gap-4">
                      <div className="min-w-0">
                        <h3 className="font-semibold">{integration.name}</h3>
                        {integration.accountLabel && (
                          <p className="mt-0.5 truncate text-xs text-muted-foreground">{integration.accountLabel}</p>
                        )}
                      </div>
                      <Badge
                        tone={
                          integration.state === 'connected'
                            ? 'success'
                            : integration.state === 'error'
                              ? 'destructive'
                              : 'neutral'
                        }
                        dot
                      >
                        {integration.state === 'connected'
                          ? 'Connected'
                          : integration.state === 'error'
                            ? 'Connection error'
                            : 'Not connected'}
                      </Badge>
                    </div>

                    {integration.detail && (
                      <p className="mt-3 text-xs leading-relaxed text-muted-foreground">{integration.detail}</p>
                    )}

                    {integration.linkedAccounts > 0 && (
                      <p className="mt-3 text-xs text-muted-foreground">
                        {integration.linkedAccounts} consultant account
                        {integration.linkedAccounts === 1 ? '' : 's'} linked
                      </p>
                    )}

                    {integration.state === 'not_connected' && (
                      <div className="mt-4 rounded-[var(--radius-control)] bg-muted/60 p-3">
                        <p className="text-xs leading-relaxed text-muted-foreground">
                          Set the credentials for this provider in your server environment, then restart the API.
                          Credentials are never entered or displayed here.
                        </p>
                      </div>
                    )}
                  </Card>
                ))}
              </div>
            </section>
          ))}
        </div>
      )}
    </>
  );
}

/* -------------------------------------------------------------------------- */
/* Audit and email logs                                                       */
/* -------------------------------------------------------------------------- */

export function AdminAuditLogs() {
  const [action, setAction] = useState('');
  const { data, isLoading } = useAuditLogs({ pageSize: 100, action: action || undefined });

  return (
    <>
      <SEO title="Audit log" noIndex />
      <PageHeader
        title="Audit log"
        description="Append-only. Entries are never edited or deleted, including by administrators."
        action={
          <Badge tone="neutral" dot>
            <ShieldCheck className="size-3" aria-hidden />
            Immutable
          </Badge>
        }
      />

      <Card padded={false} className="overflow-hidden">
        <div className="border-b border-border p-4">
          <Input
            value={action}
            onChange={(event) => setAction(event.target.value)}
            placeholder="Filter by action, e.g. payment or booking"
            aria-label="Filter audit log"
            className="max-w-md"
          />
        </div>

        {isLoading ? (
          <div className="p-5">
            <LoadingSkeleton rows={8} />
          </div>
        ) : data && data.items.length > 0 ? (
          <div className="overflow-x-auto scroll-slim">
            <table className="w-full text-sm">
              <thead>
                <tr className="border-b border-border text-left text-xs text-muted-foreground">
                  <th className="px-5 py-3 font-medium">When</th>
                  <th className="px-5 py-3 font-medium">Actor</th>
                  <th className="px-5 py-3 font-medium">Action</th>
                  <th className="px-5 py-3 font-medium">Entity</th>
                  <th className="px-5 py-3 font-medium">IP</th>
                </tr>
              </thead>
              <tbody>
                {data.items.map((log) => {
                  const row = log as Record<string, unknown>;
                  const actor = row.actor as { fullName: string; email: string } | null;

                  return (
                    <tr key={String(row.id)} className="border-b border-border last:border-0 hover:bg-muted/40">
                      <td className="px-5 py-3.5 whitespace-nowrap text-muted-foreground">
                        {formatDateTime(String(row.createdAt))}
                      </td>
                      <td className="px-5 py-3.5">
                        {actor ? (
                          <span>
                            <span className="block text-xs font-medium">{actor.fullName}</span>
                            <span className="block text-xs text-muted-foreground">{actor.email}</span>
                          </span>
                        ) : (
                          <span className="text-xs text-muted-foreground">System</span>
                        )}
                      </td>
                      <td className="px-5 py-3.5">
                        <code className="rounded bg-muted px-1.5 py-0.5 text-xs">{String(row.action)}</code>
                      </td>
                      <td className="px-5 py-3.5 text-xs text-muted-foreground">
                        {String(row.entity)}
                        {row.entityId ? ` · ${String(row.entityId).slice(0, 8)}` : ''}
                      </td>
                      <td className="tabular px-5 py-3.5 text-xs text-muted-foreground">{String(row.ip ?? '—')}</td>
                    </tr>
                  );
                })}
              </tbody>
            </table>
          </div>
        ) : (
          <div className="p-5">
            <EmptyState title="No audit entries match that filter" />
          </div>
        )}
      </Card>
    </>
  );
}

export function AdminEmails() {
  const [status, setStatus] = useState('');
  const { data, isLoading } = useEmailLogs({ pageSize: 100, status: status || undefined });

  return (
    <>
      <SEO title="Email log" noIndex />
      <PageHeader
        title="Email delivery"
        description="Every transactional message, with its outcome."
        action={
          data && data.failedCount > 0 ? (
            <Badge tone="destructive" dot>
              {data.failedCount} failed
            </Badge>
          ) : undefined
        }
      />

      <Card padded={false} className="overflow-hidden">
        <div className="border-b border-border p-4">
          <Select value={status} onChange={(event) => setStatus(event.target.value)} aria-label="Filter by status" className="w-52">
            <option value="">All statuses</option>
            <option value="SENT">Sent</option>
            <option value="FAILED">Failed</option>
            <option value="QUEUED">Queued</option>
          </Select>
        </div>

        {isLoading ? (
          <div className="p-5">
            <LoadingSkeleton rows={8} />
          </div>
        ) : data && data.items.length > 0 ? (
          <div className="overflow-x-auto scroll-slim">
            <table className="w-full text-sm">
              <thead>
                <tr className="border-b border-border text-left text-xs text-muted-foreground">
                  <th className="px-5 py-3 font-medium">Sent</th>
                  <th className="px-5 py-3 font-medium">Recipient</th>
                  <th className="px-5 py-3 font-medium">Template</th>
                  <th className="px-5 py-3 font-medium">Subject</th>
                  <th className="px-5 py-3 font-medium">Status</th>
                </tr>
              </thead>
              <tbody>
                {data.items.map((log) => {
                  const row = log as Record<string, unknown>;
                  return (
                    <tr key={String(row.id)} className="border-b border-border last:border-0 hover:bg-muted/40">
                      <td className="px-5 py-3.5 whitespace-nowrap text-muted-foreground">
                        {row.sentAt ? formatDateTime(String(row.sentAt)) : formatDateTime(String(row.createdAt))}
                      </td>
                      <td className="px-5 py-3.5">{String(row.recipient)}</td>
                      <td className="px-5 py-3.5">
                        <code className="rounded bg-muted px-1.5 py-0.5 text-xs">{String(row.template)}</code>
                      </td>
                      <td className="max-w-64 truncate px-5 py-3.5 text-muted-foreground">{String(row.subject)}</td>
                      <td className="px-5 py-3.5">
                        <Badge
                          tone={row.status === 'SENT' ? 'success' : row.status === 'FAILED' ? 'destructive' : 'warning'}
                        >
                          {String(row.status)}
                        </Badge>
                        {row.error ? (
                          <p className="mt-1 max-w-56 truncate text-xs text-destructive" title={String(row.error)}>
                            {String(row.error)}
                          </p>
                        ) : null}
                      </td>
                    </tr>
                  );
                })}
              </tbody>
            </table>
          </div>
        ) : (
          <div className="p-5">
            <EmptyState icon={<Mail className="size-5" aria-hidden />} title="No emails logged yet" />
          </div>
        )}
      </Card>
    </>
  );
}

export function AdminUsers() {
  const [search, setSearch] = useState('');
  const { data, isLoading } = useAdminUsers({ pageSize: 50, search: search || undefined });

  return (
    <>
      <SEO title="Users" noIndex />
      <PageHeader title="Users" description="Platform accounts and the roles assigned to them." />

      <Card padded={false} className="overflow-hidden">
        <div className="border-b border-border p-4">
          <div className="relative max-w-md">
            <Search className="absolute top-1/2 left-3 size-4 -translate-y-1/2 text-muted-foreground" aria-hidden />
            <Input value={search} onChange={(event) => setSearch(event.target.value)} placeholder="Search by name or email" aria-label="Search users" className="pl-10" />
          </div>
        </div>

        {isLoading ? (
          <div className="p-5">
            <LoadingSkeleton rows={6} />
          </div>
        ) : data && data.items.length > 0 ? (
          <div className="overflow-x-auto scroll-slim">
            <table className="w-full text-sm">
              <thead>
                <tr className="border-b border-border text-left text-xs text-muted-foreground">
                  <th className="px-5 py-3 font-medium">User</th>
                  <th className="px-5 py-3 font-medium">Roles</th>
                  <th className="px-5 py-3 font-medium">Last signed in</th>
                  <th className="px-5 py-3 font-medium">Status</th>
                </tr>
              </thead>
              <tbody>
                {data.items.map((user) => {
                  const row = user as Record<string, unknown>;
                  return (
                    <tr key={String(row.id)} className="border-b border-border last:border-0 hover:bg-muted/40">
                      <td className="px-5 py-4">
                        <div className="flex items-center gap-3">
                          <Avatar name={String(row.fullName)} size="xs" />
                          <span className="min-w-0">
                            <span className="block truncate font-medium">{String(row.fullName)}</span>
                            <span className="block truncate text-xs text-muted-foreground">{String(row.email)}</span>
                          </span>
                        </div>
                      </td>
                      <td className="px-5 py-4">
                        <div className="flex flex-wrap gap-1">
                          {(row.roles as string[]).map((role) => (
                            <Badge key={role} tone={role.includes('ADMIN') ? 'accent' : 'neutral'}>
                              {role.replace(/_/g, ' ').toLowerCase()}
                            </Badge>
                          ))}
                        </div>
                      </td>
                      <td className="px-5 py-4 whitespace-nowrap text-muted-foreground">
                        {row.lastLoginAt ? formatRelative(String(row.lastLoginAt)) : 'Never'}
                      </td>
                      <td className="px-5 py-4">
                        {row.isActive ? (
                          <Badge tone="success">Active</Badge>
                        ) : (
                          <Badge tone="destructive">
                            <CircleSlash className="size-3" aria-hidden />
                            Deactivated
                          </Badge>
                        )}
                      </td>
                    </tr>
                  );
                })}
              </tbody>
            </table>
          </div>
        ) : (
          <div className="p-5">
            <EmptyState title="No users found" />
          </div>
        )}
      </Card>
    </>
  );
}

export function AdminAnalytics() {
  const [preset, setPreset] = useState('90d');
  const { data, isLoading } = useAdminAnalytics({ preset });
  const theme = useChartTheme();

  return (
    <>
      <SEO title="Analytics" noIndex />
      <PageHeader
        title="Analytics"
        description="Performance across services, consultants and client mix."
        action={
          <Select value={preset} onChange={(event) => setPreset(event.target.value)} aria-label="Date range" className="w-40">
            {RANGE_PRESETS.map((range) => (
              <option key={range.value} value={range.value}>
                {range.label}
              </option>
            ))}
          </Select>
        }
      />

      {isLoading ? (
        <LoadingSkeleton rows={8} />
      ) : data ? (
        <div className="grid gap-4 lg:grid-cols-2">
          <Card>
            <CardTitle>Consultant performance</CardTitle>
            <CardDescription className="mt-1">Revenue from completed sessions.</CardDescription>
            <div className="mt-6 h-72">
              {data.consultantPerformance.length > 0 ? (
                <ResponsiveContainer width="100%" height="100%">
                  <BarChart data={data.consultantPerformance} layout="vertical" margin={{ left: 12, right: 12 }}>
                    <CartesianGrid stroke={theme.grid} strokeDasharray="3 3" horizontal={false} />
                    <XAxis type="number" stroke={theme.axis} fontSize={11} tickLine={false} axisLine={false} tickFormatter={(value: number) => money(value, data.dashboard.currency, { compact: true })} />
                    <YAxis type="category" dataKey="label" stroke={theme.axis} fontSize={11} width={120} tickLine={false} axisLine={false} />
                    <ChartTooltip formatter={(value) => money(value, data.dashboard.currency)} />
                    <Bar dataKey="value" fill={theme.accent} radius={[0, 4, 4, 0]} name="Revenue" />
                  </BarChart>
                </ResponsiveContainer>
              ) : (
                <ChartEmpty message="No completed sessions in this period." />
              )}
            </div>
          </Card>

          <Card>
            <CardTitle>Sessions by service</CardTitle>
            <div className="mt-6 h-72">
              {data.sessionsByService.length > 0 ? (
                <ResponsiveContainer width="100%" height="100%">
                  <BarChart data={data.sessionsByService.slice(0, 8)} margin={{ left: -20 }}>
                    <CartesianGrid stroke={theme.grid} strokeDasharray="3 3" vertical={false} />
                    <XAxis dataKey="label" stroke={theme.axis} fontSize={10} tickLine={false} axisLine={false} interval={0} angle={-25} textAnchor="end" height={70} />
                    <YAxis stroke={theme.axis} fontSize={11} tickLine={false} axisLine={false} allowDecimals={false} />
                    <ChartTooltip />
                    <Bar dataKey="value" fill={theme.info} radius={[4, 4, 0, 0]} name="Sessions" />
                  </BarChart>
                </ResponsiveContainer>
              ) : (
                <ChartEmpty message="No sessions in this period." />
              )}
            </div>
          </Card>

          <Card>
            <CardTitle>New versus returning clients</CardTitle>
            <div className="mt-6 h-72">
              {data.newVsReturning.some((point) => point.value > 0) ? (
                <ResponsiveContainer width="100%" height="100%">
                  <PieChart>
                    <Pie data={data.newVsReturning} dataKey="value" nameKey="label" innerRadius={60} outerRadius={95} paddingAngle={3} strokeWidth={0}>
                      {data.newVsReturning.map((entry, index) => (
                        <Cell key={entry.label} fill={theme.series[index % theme.series.length]} />
                      ))}
                    </Pie>
                    <ChartTooltip />
                    <Legend wrapperStyle={{ fontSize: 12 }} />
                  </PieChart>
                </ResponsiveContainer>
              ) : (
                <ChartEmpty message="No client activity in this period." />
              )}
            </div>
          </Card>

          <Card>
            <CardTitle>Revenue trend</CardTitle>
            <div className="mt-6 h-72">
              {data.revenueOverTime.some((point) => point.value > 0) ? (
                <ResponsiveContainer width="100%" height="100%">
                  <AreaChart data={data.revenueOverTime} margin={{ left: -12 }}>
                    <defs>
                      <linearGradient id="analyticsRevenue" x1="0" y1="0" x2="0" y2="1">
                        <stop offset="0%" stopColor={theme.success} stopOpacity={0.28} />
                        <stop offset="100%" stopColor={theme.success} stopOpacity={0} />
                      </linearGradient>
                    </defs>
                    <CartesianGrid stroke={theme.grid} strokeDasharray="3 3" vertical={false} />
                    <XAxis dataKey="date" stroke={theme.axis} fontSize={11} tickLine={false} axisLine={false} tickFormatter={(value: string) => formatDate(value)} />
                    <YAxis stroke={theme.axis} fontSize={11} tickLine={false} axisLine={false} tickFormatter={(value: number) => money(value, data.dashboard.currency, { compact: true })} />
                    <ChartTooltip formatter={(value) => money(value, data.dashboard.currency)} />
                    <Area type="monotone" dataKey="value" stroke={theme.success} strokeWidth={2} fill="url(#analyticsRevenue)" name="Revenue" />
                  </AreaChart>
                </ResponsiveContainer>
              ) : (
                <ChartEmpty message="No revenue in this period." />
              )}
            </div>
          </Card>
        </div>
      ) : null}
    </>
  );
}

export { Download };
