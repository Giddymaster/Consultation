import { useMemo, useState } from 'react';
import { Link, useNavigate, useParams } from 'react-router-dom';
import { DateTime } from 'luxon';
import {
  AlertTriangle,
  ArrowLeft,
  CalendarDays,
  Check,
  ChevronLeft,
  ChevronRight,
  ClipboardList,
  Download,
  Lock,
  Package,
  Receipt,
  RefreshCw,
  Save,
  Search,
  Truck,
} from 'lucide-react';
import {
  Avatar,
  Badge,
  Button,
  Card,
  CardDescription,
  CardTitle,
  ConfirmDialog,
  EmptyState,
  Field,
  Input,
  LoadingSkeleton,
  Select,
  StatusBadge,
  Textarea,
} from '@/components/ui';
import { DataTable, Pagination, type Column } from '@/components/admin/DataTable';
import { PageHeader } from '@/components/layout/DashboardLayout';
import { SEO } from '@/components/SEO';
import {
  useAdminCalendar,
  useAdminInvoices,
  useAdminOrder,
  useAdminOrders,
  useSettings,
  useUpdateOrder,
  useUpdateSetting,
  type CalendarBooking,
  type SettingRow,
} from '@/lib/admin-queries';
import { useBooking, useRetryMeeting, useSessions } from '@/lib/queries';
import { useToast } from '@/providers/toast-context';
import { ApiError } from '@/lib/api';
import {
  bookingStatus,
  cn,
  formatDate,
  formatDateTime,
  formatDateTimeWithZone,
  formatDuration,
  money,
  paymentStatus,
} from '@/lib/utils';

/* -------------------------------------------------------------------------- */
/* Calendar                                                                   */
/* -------------------------------------------------------------------------- */

const WEEKDAY_LABELS = ['Mon', 'Tue', 'Wed', 'Thu', 'Fri', 'Sat', 'Sun'];

/**
 * Operational calendar across every consultant.
 *
 * Month and week views share one data fetch — the range simply widens or
 * narrows — so switching between them is instant rather than a new round trip.
 */
export function AdminCalendar() {
  const [anchor, setAnchor] = useState(() => DateTime.now().startOf('month'));
  const [view, setView] = useState<'month' | 'week'>('month');
  const [consultantId, setConsultantId] = useState('');
  const navigate = useNavigate();

  const range = useMemo(() => {
    if (view === 'week') {
      const start = anchor.startOf('week');
      return { from: start, to: start.endOf('week') };
    }
    // Pad to whole weeks so the grid's leading and trailing days carry data too.
    return {
      from: anchor.startOf('month').startOf('week'),
      to: anchor.endOf('month').endOf('week'),
    };
  }, [anchor, view]);

  const { data, isLoading } = useAdminCalendar({
    from: range.from.toUTC().toISO() ?? '',
    to: range.to.toUTC().toISO() ?? '',
    consultantId: consultantId || undefined,
  });

  const byDay = useMemo(() => {
    const map = new Map<string, CalendarBooking[]>();
    for (const booking of data?.bookings ?? []) {
      const key = DateTime.fromISO(booking.startAt).toISODate();
      if (!key) continue;
      map.set(key, [...(map.get(key) ?? []), booking]);
    }
    return map;
  }, [data]);

  const days = useMemo(() => {
    const result: DateTime[] = [];
    let cursor = range.from;
    while (cursor <= range.to) {
      result.push(cursor);
      cursor = cursor.plus({ days: 1 });
    }
    return result;
  }, [range]);

  const today = DateTime.now().startOf('day');

  return (
    <>
      <SEO title="Calendar" noIndex />
      <PageHeader
        title="Calendar"
        description="Every booking across the practice."
        action={
          <>
            <div className="flex gap-1 rounded-[var(--radius-control)] bg-muted p-1">
              {(['month', 'week'] as const).map((option) => (
                <button
                  key={option}
                  type="button"
                  onClick={() => setView(option)}
                  aria-pressed={view === option}
                  className={cn(
                    'rounded-[calc(var(--radius-control)-2px)] px-3 py-1.5 text-xs font-medium capitalize transition-colors',
                    view === option ? 'bg-card text-foreground shadow-[var(--shadow-subtle)]' : 'text-muted-foreground',
                  )}
                >
                  {option}
                </button>
              ))}
            </div>
            <Button variant="secondary" onClick={() => setAnchor(DateTime.now().startOf(view === 'week' ? 'week' : 'month'))}>
              Today
            </Button>
          </>
        }
      />

      <Card padded={false} className="overflow-hidden">
        <div className="flex flex-wrap items-center justify-between gap-3 border-b border-border p-4">
          <div className="flex items-center gap-2">
            <button
              type="button"
              onClick={() => setAnchor((current) => current.minus(view === 'week' ? { weeks: 1 } : { months: 1 }))}
              aria-label={view === 'week' ? 'Previous week' : 'Previous month'}
              className="inline-flex size-8 items-center justify-center rounded-[var(--radius-control)] text-muted-foreground transition-colors hover:bg-muted hover:text-foreground"
            >
              <ChevronLeft className="size-4" aria-hidden />
            </button>
            <h2 className="min-w-44 text-center text-sm font-semibold">
              {view === 'week'
                ? `${range.from.toFormat('d LLL')} – ${range.to.toFormat('d LLL yyyy')}`
                : anchor.toFormat('LLLL yyyy')}
            </h2>
            <button
              type="button"
              onClick={() => setAnchor((current) => current.plus(view === 'week' ? { weeks: 1 } : { months: 1 }))}
              aria-label={view === 'week' ? 'Next week' : 'Next month'}
              className="inline-flex size-8 items-center justify-center rounded-[var(--radius-control)] text-muted-foreground transition-colors hover:bg-muted hover:text-foreground"
            >
              <ChevronRight className="size-4" aria-hidden />
            </button>
          </div>

          <Select
            value={consultantId}
            onChange={(event) => setConsultantId(event.target.value)}
            aria-label="Filter by consultant"
            className="w-56"
          >
            <option value="">All consultants</option>
            {data?.consultants.map((consultant) => (
              <option key={consultant.id} value={consultant.id}>
                {consultant.fullName}
              </option>
            ))}
          </Select>
        </div>

        {isLoading ? (
          <div className="p-5">
            <LoadingSkeleton rows={8} />
          </div>
        ) : (
          <div className="p-3 sm:p-4">
            {/* Weekday header — hidden in week view, where each column is labelled. */}
            {view === 'month' && (
              <div className="mb-1 hidden grid-cols-7 gap-1 sm:grid">
                {WEEKDAY_LABELS.map((label) => (
                  <div key={label} className="px-2 py-1.5 text-center text-[0.6875rem] font-medium text-muted-foreground">
                    {label}
                  </div>
                ))}
              </div>
            )}

            <div className={cn('grid gap-1', view === 'month' ? 'sm:grid-cols-7' : 'sm:grid-cols-7')}>
              {days.map((day) => {
                const iso = day.toISODate() ?? '';
                const bookings = byDay.get(iso) ?? [];
                const isCurrentMonth = view === 'week' || day.month === anchor.month;
                const isToday = day.hasSame(today, 'day');

                return (
                  <div
                    key={iso}
                    className={cn(
                      'min-h-28 rounded-[var(--radius-control)] p-1.5 transition-colors',
                      isCurrentMonth ? 'bg-muted/30' : 'bg-transparent',
                      isToday && 'ring-1 ring-accent',
                    )}
                  >
                    <div className="mb-1 flex items-center justify-between px-1">
                      <span
                        className={cn(
                          'tabular text-xs font-medium',
                          isToday ? 'text-accent' : isCurrentMonth ? 'text-foreground' : 'text-muted-foreground/40',
                        )}
                      >
                        <span className="sm:hidden">{day.toFormat('ccc d LLL')}</span>
                        <span className="hidden sm:inline">{day.day}</span>
                      </span>
                      {bookings.length > 0 && (
                        <span className="tabular rounded-full bg-accent-soft px-1.5 text-[0.625rem] font-semibold text-accent">
                          {bookings.length}
                        </span>
                      )}
                    </div>

                    <ul className="space-y-1">
                      {bookings.slice(0, 4).map((booking) => {
                        const start = DateTime.fromISO(booking.startAt);
                        const tone = bookingStatus(booking.status as never).tone;

                        return (
                          <li key={booking.id}>
                            <button
                              type="button"
                              onClick={() => navigate(`/admin/bookings/${booking.id}`)}
                              title={`${start.toFormat('HH:mm')} · ${booking.serviceName} · ${booking.clientName}`}
                              className={cn(
                                'w-full rounded px-1.5 py-1 text-left text-[0.6875rem] leading-tight transition-opacity hover:opacity-80',
                                tone === 'success' && 'bg-success-soft text-success',
                                tone === 'warning' && 'bg-warning-soft text-warning',
                                tone === 'destructive' && 'bg-destructive-soft text-destructive',
                                tone === 'accent' && 'bg-accent-soft text-accent',
                                tone === 'info' && 'bg-info-soft text-info',
                                tone === 'neutral' && 'bg-muted text-muted-foreground',
                              )}
                            >
                              <span className="tabular font-semibold">{start.toFormat('HH:mm')}</span>{' '}
                              <span className="truncate">{booking.clientName}</span>
                            </button>
                          </li>
                        );
                      })}
                      {bookings.length > 4 && (
                        <li className="px-1.5 text-[0.625rem] text-muted-foreground">
                          +{bookings.length - 4} more
                        </li>
                      )}
                    </ul>
                  </div>
                );
              })}
            </div>
          </div>
        )}
      </Card>
    </>
  );
}

/* -------------------------------------------------------------------------- */
/* Booking detail                                                             */
/* -------------------------------------------------------------------------- */

export function AdminBookingDetail() {
  const { id } = useParams<{ id: string }>();
  const { data: booking, isLoading } = useBooking(id);
  const retryMeeting = useRetryMeeting();
  const toast = useToast();

  if (isLoading) return <LoadingSkeleton rows={10} />;
  if (!booking) return <EmptyState title="Booking not found" />;

  const meetingFailed = booking.meeting?.status === 'FAILED';

  return (
    <>
      <SEO title={`Booking ${booking.reference}`} noIndex />
      <PageHeader
        title={booking.service.name}
        description={`${booking.reference} · ${formatDateTimeWithZone(booking.startAt, booking.timezone)}`}
        breadcrumbs={[
          { label: 'Admin', to: '/admin' },
          { label: 'Bookings', to: '/admin/bookings' },
          { label: booking.reference },
        ]}
        action={
          <>
            <StatusBadge {...bookingStatus(booking.status)} />
            <StatusBadge {...paymentStatus(booking.paymentStatus)} />
          </>
        }
      />

      {meetingFailed && (
        <Card className="mb-6 bg-warning-soft">
          <div className="flex flex-wrap items-start justify-between gap-4">
            <div className="flex items-start gap-3">
              <AlertTriangle className="mt-0.5 size-5 shrink-0 text-warning" aria-hidden />
              <div>
                <h2 className="font-semibold text-warning">This booking has no meeting link</h2>
                <p className="mt-1 text-sm text-warning/80">
                  Payment is confirmed but the video meeting could not be created. The client has not been given a
                  join link. Retrying is safe — it will not create a second meeting.
                </p>
              </div>
            </div>
            <Button
              size="sm"
              loading={retryMeeting.isPending}
              icon={<RefreshCw className="size-3.5" aria-hidden />}
              onClick={() =>
                retryMeeting.mutate(booking.id, {
                  onSuccess: (result) =>
                    result.ok
                      ? toast.success('Meeting created', 'The client can now join.')
                      : toast.error('Still failing', result.reason ?? 'Check the provider connection.'),
                })
              }
            >
              Retry meeting creation
            </Button>
          </div>
        </Card>
      )}

      <div className="grid gap-6 lg:grid-cols-[1fr_20rem]">
        <div className="space-y-6">
          <Card>
            <CardTitle>Booking</CardTitle>
            <dl className="mt-5 space-y-3.5 text-sm">
              <Row label="Reference" value={booking.reference} />
              <Row label="Service" value={booking.service.name} />
              <Row label="Consultant" value={booking.consultant.fullName} />
              <Row label="Client" value={booking.client?.fullName ?? '—'} />
              <Row label="Client email" value={booking.client?.email ?? '—'} />
              <Row label="Starts" value={formatDateTimeWithZone(booking.startAt, booking.timezone)} />
              <Row label="Duration" value={formatDuration(booking.durationMinutes)} />
              <Row label="Meeting" value={booking.meetingProvider.replace(/_/g, ' ')} />
              <Row label="Created" value={formatDateTime(booking.createdAt)} />
            </dl>
          </Card>

          {booking.objective && (
            <Card>
              <CardTitle>Client objective</CardTitle>
              <p className="mt-3 text-sm leading-relaxed text-muted-foreground">{booking.objective}</p>
            </Card>
          )}

          <Card>
            <CardTitle>Payments</CardTitle>
            {booking.payments.length === 0 ? (
              <p className="mt-4 text-sm text-muted-foreground">No payment attempts recorded.</p>
            ) : (
              <ul className="mt-4 space-y-3">
                {booking.payments.map((payment) => (
                  <li
                    key={payment.id}
                    className="flex flex-wrap items-center justify-between gap-3 rounded-[var(--radius-control)] bg-muted/40 p-3.5 text-sm"
                  >
                    <div className="min-w-0">
                      <p className="tabular truncate text-xs text-muted-foreground">{payment.reference}</p>
                      <p className="text-xs text-muted-foreground">
                        {payment.purpose.replace(/_/g, ' ').toLowerCase()}
                        {payment.paidAt ? ` · ${formatDate(payment.paidAt)}` : ''}
                      </p>
                    </div>
                    <div className="flex items-center gap-3">
                      <span className="tabular font-medium">{money(payment.amount, payment.currency)}</span>
                      <StatusBadge {...paymentStatus(payment.status)} />
                    </div>
                  </li>
                ))}
              </ul>
            )}
          </Card>

          {booking.sessionId && (
            <Card>
              <CardTitle>Session</CardTitle>
              <CardDescription className="mt-1.5">
                Consultation notes are visible only to the delivering consultant and holders of the
                sessions.notes permission.
              </CardDescription>
              <Link to={`/consultant/sessions/${booking.sessionId}`} className="mt-4 inline-block">
                <Button size="sm" variant="secondary">
                  Open session record
                </Button>
              </Link>
            </Card>
          )}
        </div>

        <aside className="space-y-6">
          <Card>
            <CardTitle className="text-[0.9375rem]">Money</CardTitle>
            <dl className="mt-4 space-y-3 text-sm">
              <div className="flex justify-between text-muted-foreground">
                <dt>Subtotal</dt>
                <dd className="tabular">{money(booking.pricing.subtotal, booking.currency)}</dd>
              </div>
              {booking.pricing.tax > 0 && (
                <div className="flex justify-between text-muted-foreground">
                  <dt>Tax</dt>
                  <dd className="tabular">{money(booking.pricing.tax, booking.currency)}</dd>
                </div>
              )}
              <div className="flex justify-between border-t border-border pt-3 font-semibold">
                <dt>Total</dt>
                <dd className="tabular">{money(booking.total, booking.currency)}</dd>
              </div>
              <div className="flex justify-between text-success">
                <dt>Collected</dt>
                <dd className="tabular">{money(booking.amountPaid, booking.currency)}</dd>
              </div>
              {booking.balance > 0 && (
                <div className="flex justify-between font-semibold text-warning">
                  <dt>Outstanding</dt>
                  <dd className="tabular">{money(booking.balance, booking.currency)}</dd>
                </div>
              )}
            </dl>
          </Card>

          <Card>
            <CardTitle className="text-[0.9375rem]">Meeting</CardTitle>
            {booking.meeting ? (
              <div className="mt-4 space-y-3 text-sm">
                <div className="flex items-center justify-between">
                  <span className="text-muted-foreground">Provider</span>
                  <span>{booking.meeting.provider.replace(/_/g, ' ')}</span>
                </div>
                <div className="flex items-center justify-between">
                  <span className="text-muted-foreground">Status</span>
                  <Badge
                    tone={
                      booking.meeting.status === 'CREATED'
                        ? 'success'
                        : booking.meeting.status === 'FAILED'
                          ? 'destructive'
                          : 'neutral'
                    }
                  >
                    {booking.meeting.status.toLowerCase()}
                  </Badge>
                </div>
                <p className="flex gap-2 rounded-[var(--radius-control)] bg-muted/50 p-3 text-xs text-muted-foreground">
                  <Lock className="mt-0.5 size-3.5 shrink-0" aria-hidden />
                  Join links are issued to the client only. Host URLs are never exposed through the API.
                </p>
              </div>
            ) : (
              <p className="mt-3 text-sm text-muted-foreground">
                No meeting yet. One is created automatically once payment is confirmed.
              </p>
            )}
          </Card>
        </aside>
      </div>
    </>
  );
}

function Row({ label, value }: { label: string; value: string }) {
  return (
    <div className="flex items-baseline justify-between gap-6">
      <dt className="shrink-0 text-muted-foreground">{label}</dt>
      <dd className="text-right font-medium">{value}</dd>
    </div>
  );
}

/* -------------------------------------------------------------------------- */
/* Sessions                                                                   */
/* -------------------------------------------------------------------------- */

export function AdminSessions() {
  const [status, setStatus] = useState('');
  const { data, isLoading } = useSessions({ pageSize: 50, status: status || undefined });
  const navigate = useNavigate();

  const rows = data?.items ?? [];

  return (
    <>
      <SEO title="Sessions" noIndex />
      <PageHeader
        title="Sessions"
        description="Consultations delivered across the practice. Private notes remain with the delivering consultant."
      />

      <DataTable
        columns={[
          {
            key: 'service',
            header: 'Session',
            showInCard: false,
            render: (row) => (
              <div className="min-w-0">
                <p className="truncate font-medium">{row.booking.service.name}</p>
                <p className="truncate text-xs text-muted-foreground">{row.booking.reference}</p>
              </div>
            ),
          },
          { key: 'client', header: 'Client', render: (row) => row.booking.client?.fullName ?? '—' },
          { key: 'consultant', header: 'Consultant', render: (row) => row.booking.consultant.fullName },
          {
            key: 'when',
            header: 'When',
            render: (row) => (
              <span className="whitespace-nowrap text-muted-foreground">
                {formatDate(row.booking.startAt)}
              </span>
            ),
          },
          {
            key: 'notes',
            header: 'Write-up',
            render: (row) =>
              row.sharedNotes ? <Badge tone="success">Shared</Badge> : <Badge tone="warning">Pending</Badge>,
          },
          { key: 'status', header: 'Status', render: (row) => <StatusBadge {...bookingStatus(row.booking.status)} /> },
        ]}
        rows={rows}
        loading={isLoading}
        rowKey={(row) => row.id}
        onRowClick={(row) => navigate(`/admin/bookings/${row.bookingId}`)}
        cardTitle={(row) => row.booking.service.name}
        empty={{ title: 'No sessions match that filter', icon: <ClipboardList className="size-5" aria-hidden /> }}
        toolbar={
          <Select
            value={status}
            onChange={(event) => setStatus(event.target.value)}
            aria-label="Filter by status"
            className="w-52"
          >
            <option value="">All statuses</option>
            <option value="SCHEDULED">Scheduled</option>
            <option value="IN_PROGRESS">In progress</option>
            <option value="COMPLETED">Completed</option>
            <option value="NO_SHOW">No show</option>
          </Select>
        }
      />
    </>
  );
}

/* -------------------------------------------------------------------------- */
/* Orders                                                                     */
/* -------------------------------------------------------------------------- */

interface OrderRow {
  id: string;
  reference: string;
  status: string;
  currency: string;
  total: number;
  itemCount: number;
  requiresShipping: boolean;
  customer: { fullName: string; email: string };
  createdAt: string;
  paidAt: string | null;
}

const ORDER_STATUS_TONE = {
  PENDING_PAYMENT: 'warning',
  PAID: 'success',
  FULFILLED: 'info',
  SHIPPED: 'accent',
  CANCELLED: 'destructive',
  REFUNDED: 'neutral',
} as const;

export function AdminOrders() {
  const [search, setSearch] = useState('');
  const [status, setStatus] = useState('');
  const [page, setPage] = useState(1);
  const navigate = useNavigate();

  const { data, isLoading } = useAdminOrders({
    page,
    pageSize: 25,
    search: search || undefined,
    status: status || undefined,
  });

  const rows = (data?.items ?? []) as unknown as OrderRow[];

  const columns: Column<OrderRow>[] = [
    {
      key: 'reference',
      header: 'Order',
      showInCard: false,
      render: (row) => (
        <div className="min-w-0">
          <p className="tabular truncate font-medium">{row.reference}</p>
          <p className="truncate text-xs text-muted-foreground">{formatDate(row.createdAt)}</p>
        </div>
      ),
    },
    {
      key: 'customer',
      header: 'Customer',
      render: (row) => (
        <div className="min-w-0">
          <p className="truncate">{row.customer.fullName}</p>
          <p className="truncate text-xs text-muted-foreground">{row.customer.email}</p>
        </div>
      ),
    },
    {
      key: 'items',
      header: 'Items',
      numeric: true,
      render: (row) => (
        <span className="inline-flex items-center gap-1.5">
          {row.itemCount}
          {row.requiresShipping && <Truck className="size-3.5 text-muted-foreground" aria-hidden />}
        </span>
      ),
    },
    { key: 'total', header: 'Total', numeric: true, render: (row) => money(row.total, row.currency) },
    {
      key: 'status',
      header: 'Status',
      render: (row) => (
        <Badge tone={ORDER_STATUS_TONE[row.status as keyof typeof ORDER_STATUS_TONE] ?? 'neutral'}>
          {row.status.replace(/_/g, ' ').toLowerCase()}
        </Badge>
      ),
    },
  ];

  return (
    <>
      <SEO title="Orders" noIndex />
      <PageHeader title="Orders" description="Resource purchases and their fulfilment state." />

      {data && (
        <div className="mb-6 grid gap-4 sm:grid-cols-2">
          <Card className="flex items-center gap-4">
            <span className="flex size-9 items-center justify-center rounded-[var(--radius-control)] bg-success-soft text-success">
              <Receipt className="size-4" aria-hidden />
            </span>
            <div>
              <p className="tabular font-semibold">{money(data.totals.revenue, 'KES')}</p>
              <p className="text-xs text-muted-foreground">Revenue from paid orders</p>
            </div>
          </Card>
          <Card className="flex items-center gap-4">
            <span className="flex size-9 items-center justify-center rounded-[var(--radius-control)] bg-muted text-muted-foreground">
              <Package className="size-4" aria-hidden />
            </span>
            <div>
              <p className="tabular font-semibold">{data.totals.paidOrders}</p>
              <p className="text-xs text-muted-foreground">Paid orders</p>
            </div>
          </Card>
        </div>
      )}

      <DataTable
        columns={columns}
        rows={rows}
        loading={isLoading}
        rowKey={(row) => row.id}
        onRowClick={(row) => navigate(`/admin/orders/${row.id}`)}
        cardTitle={(row) => row.reference}
        empty={{ title: 'No orders match those filters', icon: <Package className="size-5" aria-hidden /> }}
        toolbar={
          <>
            <div className="relative min-w-56 flex-1">
              <Search className="absolute top-1/2 left-3 size-4 -translate-y-1/2 text-muted-foreground" aria-hidden />
              <Input
                value={search}
                onChange={(event) => {
                  setSearch(event.target.value);
                  setPage(1);
                }}
                placeholder="Search reference or customer"
                aria-label="Search orders"
                className="pl-10"
              />
            </div>
            <Select
              value={status}
              onChange={(event) => {
                setStatus(event.target.value);
                setPage(1);
              }}
              aria-label="Filter by status"
              className="w-48"
            >
              <option value="">All statuses</option>
              <option value="PENDING_PAYMENT">Awaiting payment</option>
              <option value="PAID">Paid</option>
              <option value="FULFILLED">Fulfilled</option>
              <option value="SHIPPED">Shipped</option>
              <option value="CANCELLED">Cancelled</option>
            </Select>
          </>
        }
        footer={
          data ? (
            <Pagination
              page={data.meta.page}
              pageSize={data.meta.pageSize}
              total={data.meta.total}
              onPageChange={setPage}
            />
          ) : undefined
        }
      />
    </>
  );
}

export function AdminOrderDetail() {
  const { id } = useParams<{ id: string }>();
  const { data, isLoading } = useAdminOrder(id);
  const updateOrder = useUpdateOrder(id ?? '');
  const toast = useToast();
  const [pending, setPending] = useState<string | null>(null);

  if (isLoading) return <LoadingSkeleton rows={8} />;
  if (!data) return <EmptyState title="Order not found" />;

  const order = data as Record<string, never>;
  const items = order.items as unknown as {
    id: string;
    name: string;
    slug: string;
    type: string;
    coverImageUrl: string | null;
    quantity: number;
    unitAmount: number;
    amount: number;
    downloads: number;
  }[];
  const payments = order.payments as unknown as {
    id: string;
    reference: string;
    amount: number;
    status: string;
    channel: string | null;
    paidAt: string | null;
  }[];
  const customer = order.customer as unknown as { fullName: string; email: string; phone: string | null };
  const shipping = order.shippingAddress as unknown as Record<string, string> | null;
  const allowed = order.allowedTransitions as unknown as string[];
  const currency = String(order.currency);

  const TRANSITION_LABELS: Record<string, { label: string; icon: typeof Check }> = {
    FULFILLED: { label: 'Mark fulfilled', icon: Check },
    SHIPPED: { label: 'Mark shipped', icon: Truck },
    CANCELLED: { label: 'Cancel order', icon: AlertTriangle },
  };

  return (
    <>
      <SEO title={`Order ${String(order.reference)}`} noIndex />
      <PageHeader
        title={`Order ${String(order.reference)}`}
        description={`Placed ${formatDateTime(String(order.createdAt))}`}
        breadcrumbs={[
          { label: 'Admin', to: '/admin' },
          { label: 'Orders', to: '/admin/orders' },
          { label: String(order.reference) },
        ]}
        action={
          <Badge tone={ORDER_STATUS_TONE[String(order.status) as keyof typeof ORDER_STATUS_TONE] ?? 'neutral'} dot>
            {String(order.status).replace(/_/g, ' ').toLowerCase()}
          </Badge>
        }
      />

      <div className="grid gap-6 lg:grid-cols-[1fr_20rem]">
        <div className="space-y-6">
          <Card>
            <CardTitle>Items</CardTitle>
            <ul className="mt-5 space-y-3">
              {items.map((item) => (
                <li key={item.id} className="flex items-center gap-4 rounded-[var(--radius-control)] bg-muted/40 p-3.5">
                  <div className="size-12 shrink-0 overflow-hidden rounded-md bg-accent-soft">
                    {item.coverImageUrl ? (
                      <img src={item.coverImageUrl} alt="" className="size-full object-cover" />
                    ) : (
                      <span className="flex size-full items-center justify-center text-accent">
                        <Package className="size-5" aria-hidden />
                      </span>
                    )}
                  </div>
                  <div className="min-w-0 flex-1">
                    <p className="truncate font-medium">{item.name}</p>
                    <p className="text-xs text-muted-foreground">
                      {item.type === 'DIGITAL' ? 'Digital' : 'Print'} · {item.quantity} ×{' '}
                      {money(item.unitAmount, currency)}
                      {item.type === 'DIGITAL' && ` · ${item.downloads} download${item.downloads === 1 ? '' : 's'}`}
                    </p>
                  </div>
                  <span className="tabular font-medium">{money(item.amount, currency)}</span>
                </li>
              ))}
            </ul>
          </Card>

          {shipping && (
            <Card>
              <CardTitle className="flex items-center gap-2">
                <Truck className="size-4 text-muted-foreground" aria-hidden />
                Delivery address
              </CardTitle>
              <address className="mt-4 text-sm leading-relaxed not-italic text-muted-foreground">
                {shipping.fullName}
                <br />
                {shipping.line1}
                {shipping.line2 && (
                  <>
                    <br />
                    {shipping.line2}
                  </>
                )}
                <br />
                {shipping.city}
                {shipping.region ? `, ${shipping.region}` : ''} {shipping.postalCode ?? ''}
                <br />
                {shipping.country}
                <br />
                {shipping.phone}
              </address>
            </Card>
          )}

          <Card>
            <CardTitle>Payments</CardTitle>
            {payments.length === 0 ? (
              <p className="mt-4 text-sm text-muted-foreground">No payment recorded.</p>
            ) : (
              <ul className="mt-4 space-y-3">
                {payments.map((payment) => (
                  <li key={payment.id} className="flex flex-wrap items-center justify-between gap-3 text-sm">
                    <div className="min-w-0">
                      <p className="tabular truncate text-xs text-muted-foreground">{payment.reference}</p>
                      <p className="text-xs text-muted-foreground">
                        {payment.channel?.replace(/_/g, ' ') ?? '—'}
                        {payment.paidAt ? ` · ${formatDate(payment.paidAt)}` : ''}
                      </p>
                    </div>
                    <div className="flex items-center gap-3">
                      <span className="tabular font-medium">{money(payment.amount, currency)}</span>
                      <StatusBadge {...paymentStatus(payment.status as never)} />
                    </div>
                  </li>
                ))}
              </ul>
            )}
          </Card>
        </div>

        <aside className="space-y-6">
          <Card>
            <CardTitle className="text-[0.9375rem]">Customer</CardTitle>
            <div className="mt-4 flex items-center gap-3">
              <Avatar name={customer.fullName} size="sm" />
              <div className="min-w-0">
                <p className="truncate text-sm font-medium">{customer.fullName}</p>
                <p className="truncate text-xs text-muted-foreground">{customer.email}</p>
              </div>
            </div>
            {customer.phone && <p className="mt-3 text-xs text-muted-foreground">{customer.phone}</p>}
          </Card>

          <Card>
            <CardTitle className="text-[0.9375rem]">Totals</CardTitle>
            <dl className="mt-4 space-y-3 text-sm">
              <div className="flex justify-between text-muted-foreground">
                <dt>Subtotal</dt>
                <dd className="tabular">{money(Number(order.subtotal), currency)}</dd>
              </div>
              {Number(order.tax) > 0 && (
                <div className="flex justify-between text-muted-foreground">
                  <dt>Tax</dt>
                  <dd className="tabular">{money(Number(order.tax), currency)}</dd>
                </div>
              )}
              {Number(order.shipping) > 0 && (
                <div className="flex justify-between text-muted-foreground">
                  <dt>Delivery</dt>
                  <dd className="tabular">{money(Number(order.shipping), currency)}</dd>
                </div>
              )}
              <div className="flex justify-between border-t border-border pt-3 font-semibold">
                <dt>Total</dt>
                <dd className="tabular">{money(Number(order.total), currency)}</dd>
              </div>
              <div className="flex justify-between text-success">
                <dt>Paid</dt>
                <dd className="tabular">{money(Number(order.amountPaid), currency)}</dd>
              </div>
            </dl>
          </Card>

          <Card>
            <CardTitle className="text-[0.9375rem]">Fulfilment</CardTitle>
            {allowed.length === 0 ? (
              <p className="mt-3 text-sm text-muted-foreground">
                This order is in a final state — no further action is available.
              </p>
            ) : (
              <div className="mt-4 space-y-2">
                {allowed.map((target) => {
                  const meta = TRANSITION_LABELS[target] ?? { label: target, icon: Check };
                  return (
                    <Button
                      key={target}
                      variant={target === 'CANCELLED' ? 'secondary' : 'primary'}
                      className="w-full"
                      icon={<meta.icon className="size-4" aria-hidden />}
                      loading={updateOrder.isPending && pending === target}
                      onClick={() => {
                        setPending(target);
                        updateOrder.mutate(
                          { status: target },
                          {
                            onSuccess: () => toast.success(`Order marked ${target.toLowerCase()}`),
                            onError: (error) =>
                              toast.error(
                                'Could not update the order',
                                error instanceof ApiError ? error.message : undefined,
                              ),
                            onSettled: () => setPending(null),
                          },
                        );
                      }}
                    >
                      {meta.label}
                    </Button>
                  );
                })}
              </div>
            )}
          </Card>
        </aside>
      </div>
    </>
  );
}

/* -------------------------------------------------------------------------- */
/* Invoices                                                                   */
/* -------------------------------------------------------------------------- */

interface InvoiceRow {
  id: string;
  number: string;
  status: string;
  currency: string;
  total: number;
  amountPaid: number;
  balance: number;
  issuedAt: string | null;
  dueAt: string | null;
  description: string;
  reference: string | null;
  customer: { fullName: string; email: string } | null;
}

export function AdminInvoices() {
  const [status, setStatus] = useState('');
  const [search, setSearch] = useState('');
  const [page, setPage] = useState(1);

  const { data, isLoading } = useAdminInvoices({
    page,
    pageSize: 25,
    status: status || undefined,
    search: search || undefined,
  });

  const rows = (data?.items ?? []) as unknown as InvoiceRow[];

  const columns: Column<InvoiceRow>[] = [
    {
      key: 'number',
      header: 'Invoice',
      showInCard: false,
      render: (row) => (
        <div className="min-w-0">
          <p className="tabular truncate font-medium">{row.number}</p>
          <p className="truncate text-xs text-muted-foreground">{row.reference ?? '—'}</p>
        </div>
      ),
    },
    {
      key: 'customer',
      header: 'Customer',
      render: (row) =>
        row.customer ? (
          <div className="min-w-0">
            <p className="truncate">{row.customer.fullName}</p>
            <p className="truncate text-xs text-muted-foreground">{row.customer.email}</p>
          </div>
        ) : (
          <span className="text-muted-foreground">—</span>
        ),
    },
    { key: 'description', header: 'For', render: (row) => <span className="text-muted-foreground">{row.description}</span> },
    {
      key: 'issued',
      header: 'Issued',
      render: (row) => (
        <span className="whitespace-nowrap text-muted-foreground">
          {row.issuedAt ? formatDate(row.issuedAt) : '—'}
        </span>
      ),
    },
    { key: 'total', header: 'Total', numeric: true, render: (row) => money(row.total, row.currency) },
    {
      key: 'balance',
      header: 'Outstanding',
      numeric: true,
      render: (row) =>
        row.balance > 0 ? (
          <span className="font-medium text-warning">{money(row.balance, row.currency)}</span>
        ) : (
          <span className="text-muted-foreground">—</span>
        ),
    },
    {
      key: 'status',
      header: 'Status',
      render: (row) => (
        <Badge
          tone={
            row.status === 'PAID'
              ? 'success'
              : row.status === 'PARTIALLY_PAID'
                ? 'info'
                : row.status === 'VOID'
                  ? 'neutral'
                  : 'warning'
          }
        >
          {row.status.replace(/_/g, ' ').toLowerCase()}
        </Badge>
      ),
    },
  ];

  return (
    <>
      <SEO title="Invoices" noIndex />
      <PageHeader title="Invoices" description="Issued against bookings and resource orders." />

      {data && (
        <div className="mb-6 grid gap-4 sm:grid-cols-3">
          {[
            { label: 'Invoiced', value: data.totals.invoiced, tone: 'neutral' as const },
            { label: 'Collected', value: data.totals.collected, tone: 'success' as const },
            { label: 'Outstanding', value: data.totals.outstanding, tone: 'warning' as const },
          ].map((stat) => (
            <Card key={stat.label}>
              <p className="text-xs text-muted-foreground">{stat.label}</p>
              <p
                className={cn(
                  'tabular mt-1.5 text-xl font-semibold',
                  stat.tone === 'success' && 'text-success',
                  stat.tone === 'warning' && stat.value > 0 && 'text-warning',
                )}
              >
                {money(stat.value, 'KES')}
              </p>
            </Card>
          ))}
        </div>
      )}

      <DataTable
        columns={columns}
        rows={rows}
        loading={isLoading}
        rowKey={(row) => row.id}
        cardTitle={(row) => row.number}
        empty={{ title: 'No invoices match those filters', icon: <Receipt className="size-5" aria-hidden /> }}
        toolbar={
          <>
            <div className="relative min-w-56 flex-1">
              <Search className="absolute top-1/2 left-3 size-4 -translate-y-1/2 text-muted-foreground" aria-hidden />
              <Input
                value={search}
                onChange={(event) => {
                  setSearch(event.target.value);
                  setPage(1);
                }}
                placeholder="Search invoice number"
                aria-label="Search invoices"
                className="pl-10"
              />
            </div>
            <Select
              value={status}
              onChange={(event) => {
                setStatus(event.target.value);
                setPage(1);
              }}
              aria-label="Filter by status"
              className="w-48"
            >
              <option value="">All statuses</option>
              <option value="PAID">Paid</option>
              <option value="PARTIALLY_PAID">Partly paid</option>
              <option value="ISSUED">Issued</option>
              <option value="OVERDUE">Overdue</option>
              <option value="VOID">Void</option>
            </Select>
          </>
        }
        footer={
          data ? (
            <Pagination
              page={data.meta.page}
              pageSize={data.meta.pageSize}
              total={data.meta.total}
              onPageChange={setPage}
            />
          ) : undefined
        }
      />
    </>
  );
}

/* -------------------------------------------------------------------------- */
/* Settings                                                                   */
/* -------------------------------------------------------------------------- */

const SETTING_GROUPS: { prefix: string; title: string; description: string }[] = [
  { prefix: 'business.', title: 'Business details', description: 'Identity, contact details and defaults.' },
  { prefix: 'booking.', title: 'Booking rules', description: 'How bookings are held, and how far ahead they open.' },
  { prefix: 'reviews.', title: 'Reviews', description: 'Moderation and when review requests are sent.' },
  { prefix: 'notifications.', title: 'Notifications', description: 'Where operational alerts are sent.' },
];

export function AdminSettings() {
  const { data, isLoading } = useSettings();
  const updateSetting = useUpdateSetting();
  const toast = useToast();

  const [drafts, setDrafts] = useState<Record<string, string>>({});
  const [savingKey, setSavingKey] = useState<string | null>(null);

  const grouped = useMemo(() => {
    const groups = SETTING_GROUPS.map((group) => ({
      ...group,
      settings: (data ?? []).filter((setting) => setting.key.startsWith(group.prefix)),
    }));

    // Anything that does not match a known prefix still needs somewhere to live,
    // otherwise a new setting would be invisible until this list is updated.
    const claimed = new Set(groups.flatMap((group) => group.settings.map((setting) => setting.key)));
    const other = (data ?? []).filter((setting) => !claimed.has(setting.key));

    return other.length > 0
      ? [...groups, { prefix: '', title: 'Other', description: 'Uncategorised settings.', settings: other }]
      : groups;
  }, [data]);

  /** `booking.allowFreeBookings` → `Allow free bookings`. */
  const humaniseKey = (key: string): string => {
    const leaf = key.split('.').slice(1).join('.');
    const spaced = leaf.replace(/([A-Z])/g, ' $1').toLowerCase().trim();
    return spaced.charAt(0).toUpperCase() + spaced.slice(1);
  };

  const valueOf = (setting: SettingRow): string =>
    drafts[setting.key] ??
    (typeof setting.value === 'string' ? setting.value : JSON.stringify(setting.value));

  const save = (setting: SettingRow) => {
    const raw = valueOf(setting);

    // Settings hold JSON, so a boolean or number must be sent as that type —
    // a string "45" would be stored and later compared as a string.
    let parsed: unknown = raw;
    if (typeof setting.value !== 'string') {
      try {
        parsed = JSON.parse(raw);
      } catch {
        toast.error('That value is not valid', `Expected ${typeof setting.value}, for example ${JSON.stringify(setting.value)}.`);
        return;
      }
    }

    setSavingKey(setting.key);
    updateSetting.mutate(
      { key: setting.key, value: parsed },
      {
        onSuccess: () => {
          toast.success('Setting saved', setting.key);
          setDrafts((current) => {
            const next = { ...current };
            delete next[setting.key];
            return next;
          });
        },
        onError: (error) =>
          toast.error('Could not save', error instanceof ApiError ? error.message : undefined),
        onSettled: () => setSavingKey(null),
      },
    );
  };

  if (isLoading) return <LoadingSkeleton rows={10} />;

  return (
    <>
      <SEO title="Settings" noIndex />
      <PageHeader
        title="Settings"
        description="Platform configuration. Credentials are never stored here — those live in the server environment."
      />

      <div className="max-w-3xl space-y-6">
        {grouped.map((group) =>
          group.settings.length === 0 ? null : (
            <Card key={group.title}>
              <CardTitle>{group.title}</CardTitle>
              <CardDescription className="mt-1">{group.description}</CardDescription>

              <div className="mt-6 space-y-5">
                {group.settings.map((setting) => {
                  const isBoolean = typeof setting.value === 'boolean';
                  const dirty = drafts[setting.key] !== undefined;

                  return (
                    <div key={setting.key} className="border-t border-border pt-5 first:border-0 first:pt-0">
                      <Field
                        label={humaniseKey(setting.key)}
                        hint={setting.description ?? undefined}
                      >
                        {({ id: fieldId }) =>
                          isBoolean ? (
                            <Select
                              id={fieldId}
                              value={valueOf(setting)}
                              onChange={(event) =>
                                setDrafts((current) => ({ ...current, [setting.key]: event.target.value }))
                              }
                            >
                              <option value="true">Enabled</option>
                              <option value="false">Disabled</option>
                            </Select>
                          ) : String(setting.value).length > 60 ? (
                            <Textarea
                              id={fieldId}
                              rows={3}
                              value={valueOf(setting)}
                              onChange={(event) =>
                                setDrafts((current) => ({ ...current, [setting.key]: event.target.value }))
                              }
                            />
                          ) : (
                            <Input
                              id={fieldId}
                              value={valueOf(setting)}
                              onChange={(event) =>
                                setDrafts((current) => ({ ...current, [setting.key]: event.target.value }))
                              }
                            />
                          )
                        }
                      </Field>

                      <div className="mt-2 flex items-center gap-3">
                        <code className="rounded bg-muted px-1.5 py-0.5 text-[0.6875rem] text-muted-foreground">
                          {setting.key}
                        </code>
                        {setting.isPublic && (
                          <Badge tone="info" className="text-[0.625rem]">
                            Visible to the browser
                          </Badge>
                        )}
                        {dirty && (
                          <Button
                            size="sm"
                            className="ml-auto"
                            loading={savingKey === setting.key}
                            icon={<Save className="size-3.5" aria-hidden />}
                            onClick={() => save(setting)}
                          >
                            Save
                          </Button>
                        )}
                      </div>
                    </div>
                  );
                })}
              </div>
            </Card>
          ),
        )}

        <Card className="bg-muted/40">
          <div className="flex gap-3">
            <Lock className="mt-0.5 size-4 shrink-0 text-muted-foreground" aria-hidden />
            <p className="text-xs leading-relaxed text-muted-foreground">
              API keys, OAuth secrets and database credentials are deliberately not editable here. They are read from
              the server environment at boot, so they never pass through a browser, never appear in an audit log, and
              cannot be read back out by anyone with dashboard access.
            </p>
          </div>
        </Card>
      </div>
    </>
  );
}

export { ArrowLeft, CalendarDays, Download, ConfirmDialog };
