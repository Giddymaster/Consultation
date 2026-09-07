import { useMemo, useState } from 'react';
import { Link, useParams } from 'react-router-dom';
import { DateTime } from 'luxon';
import {
  Briefcase,
  CalendarDays,
  CalendarOff,
  Check,
  ChevronLeft,
  ChevronRight,
  Clock,
  Globe,
  Mail,
  MapPin,
  MessageSquareQuote,
  Phone,
  Plus,
  Save,
  Search,
  Users,
  Video,
  X,
} from 'lucide-react';
import type { BookingStatus } from '@meridian/types';
import {
  Avatar,
  Badge,
  Button,
  Card,
  CardDescription,
  CardTitle,
  EmptyState,
  Field,
  Input,
  LoadingSkeleton,
  Progress,
  Rating,
  Separator,
  StatusBadge,
  Textarea,
} from '@/components/ui';
import { DataTable, Pagination, type Column } from '@/components/admin/DataTable';
import { PageHeader } from '@/components/layout/DashboardLayout';
import { SEO } from '@/components/SEO';
import {
  useConsultantCalendar,
  useConsultantClient,
  useConsultantClients,
  useConsultantProfile,
  useConsultantReviews,
  useSaveConsultantProfile,
  useSetBookingAcceptance,
  type ConsultantCalendarBooking,
  type ConsultantClient,
} from '@/lib/queries';
import { useAuth } from '@/providers/auth-context';
import { useToast } from '@/providers/toast-context';
import { ApiError } from '@/lib/api';
import { bookingStatus, cn, formatDate, formatDuration, money, paymentStatus } from '@/lib/utils';

/* -------------------------------------------------------------------------- */
/* Calendar                                                                   */
/* -------------------------------------------------------------------------- */

type CalendarView = 'day' | 'week' | 'month';

/** Bookings that no longer occupy the diary are dimmed rather than hidden. */
const INACTIVE_STATUSES: BookingStatus[] = ['CANCELLED', 'REFUNDED', 'EXPIRED', 'NO_SHOW'];

/**
 * The consultant's diary.
 *
 * Rendered in the consultant's *own* timezone, which the API returns alongside
 * the bookings — not in the browser's. A consultant travelling for a week should
 * not find their working day apparently shifted by four hours.
 */
export function ConsultantCalendar() {
  const [view, setView] = useState<CalendarView>('week');
  const [anchorIso, setAnchorIso] = useState(() => DateTime.now().toISODate() ?? '');

  // Fetched in a fixed zone first so the request is stable; re-anchored to the
  // consultant's zone once the response tells us what that is.
  const anchor = DateTime.fromISO(anchorIso);
  const range = useMemo(() => {
    const unit = view === 'day' ? 'day' : view === 'week' ? 'week' : 'month';
    return {
      from: anchor.startOf(unit).toUTC().toISO() ?? '',
      to: anchor.endOf(unit).toUTC().toISO() ?? '',
    };
  }, [anchorIso, view]); // eslint-disable-line react-hooks/exhaustive-deps

  const { data, isLoading } = useConsultantCalendar(range);
  const zone = data?.timezone ?? 'local';

  const step = (direction: -1 | 1) => {
    const unit = view === 'day' ? 'days' : view === 'week' ? 'weeks' : 'months';
    setAnchorIso(anchor.plus({ [unit]: direction }).toISODate() ?? anchorIso);
  };

  const heading = useMemo(() => {
    const local = DateTime.fromISO(anchorIso, { zone });
    if (view === 'day') return local.toFormat('cccc d LLLL yyyy');
    if (view === 'month') return local.toFormat('LLLL yyyy');
    const start = local.startOf('week');
    const end = local.endOf('week');
    return start.month === end.month
      ? `${start.toFormat('d')}–${end.toFormat('d LLLL yyyy')}`
      : `${start.toFormat('d LLL')} – ${end.toFormat('d LLL yyyy')}`;
  }, [anchorIso, view, zone]);

  // Bucketed by local date so a booking never lands on the wrong day because
  // the grouping was done on a UTC timestamp.
  const byDate = useMemo(() => {
    const map = new Map<string, ConsultantCalendarBooking[]>();
    for (const booking of data?.bookings ?? []) {
      const key = DateTime.fromISO(booking.startAt, { zone }).toISODate();
      if (!key) continue;
      map.set(key, [...(map.get(key) ?? []), booking]);
    }
    return map;
  }, [data, zone]);

  const days = useMemo(() => {
    const local = DateTime.fromISO(anchorIso, { zone });
    if (view === 'day') return [local];
    if (view === 'week') return Array.from({ length: 7 }, (_, i) => local.startOf('week').plus({ days: i }));

    // Month view is padded to whole weeks so the grid keeps its columns.
    const start = local.startOf('month').startOf('week');
    const end = local.endOf('month').endOf('week');
    const count = Math.round(end.diff(start, 'days').days) + 1;
    return Array.from({ length: count }, (_, i) => start.plus({ days: i }));
  }, [anchorIso, view, zone]);

  const today = DateTime.now().setZone(zone).toISODate();
  const bookingCount = data?.bookings.filter((b) => !INACTIVE_STATUSES.includes(b.status as BookingStatus)).length ?? 0;

  return (
    <>
      <SEO title="Calendar" noIndex />
      <PageHeader
        title="Calendar"
        description={
          data ? `${bookingCount} scheduled ${bookingCount === 1 ? 'session' : 'sessions'} · times in ${zone.replace(/_/g, ' ')}` : 'Your sessions, day by day.'
        }
        action={
          <Link to="/consultant/availability">
            <Button variant="secondary" icon={<Clock className="size-4" aria-hidden />}>
              Edit availability
            </Button>
          </Link>
        }
      />

      <Card className="mb-6">
        <div className="flex flex-wrap items-center justify-between gap-4">
          <div className="flex items-center gap-2">
            <Button
              variant="ghost"
              size="sm"
              onClick={() => step(-1)}
              aria-label={`Previous ${view}`}
              icon={<ChevronLeft className="size-4" aria-hidden />}
            />
            <h2 className="min-w-48 text-center font-semibold">{heading}</h2>
            <Button
              variant="ghost"
              size="sm"
              onClick={() => step(1)}
              aria-label={`Next ${view}`}
              icon={<ChevronRight className="size-4" aria-hidden />}
            />
            <Button
              variant="ghost"
              size="sm"
              onClick={() => setAnchorIso(DateTime.now().toISODate() ?? anchorIso)}
            >
              Today
            </Button>
          </div>

          <div
            role="group"
            aria-label="Calendar view"
            className="flex gap-1 rounded-full bg-surface-2 p-1"
          >
            {(['day', 'week', 'month'] as CalendarView[]).map((option) => (
              <button
                key={option}
                type="button"
                aria-pressed={view === option}
                onClick={() => setView(option)}
                className={cn(
                  'rounded-full px-3.5 py-1.5 text-sm font-medium capitalize transition-colors',
                  view === option ? 'bg-foreground text-background' : 'text-muted-foreground hover:text-foreground',
                )}
              >
                {option}
              </button>
            ))}
          </div>
        </div>
      </Card>

      {isLoading ? (
        <LoadingSkeleton rows={8} />
      ) : (
        <div
          className={cn(
            'grid gap-3',
            view === 'day' && 'grid-cols-1',
            view === 'week' && 'sm:grid-cols-2 lg:grid-cols-4 xl:grid-cols-7',
            view === 'month' && 'sm:grid-cols-2 lg:grid-cols-4 xl:grid-cols-7',
          )}
        >
          {days.map((day) => {
            const key = day.toISODate() ?? '';
            const dayBookings = byDate.get(key) ?? [];
            const outsideMonth = view === 'month' && day.month !== DateTime.fromISO(anchorIso, { zone }).month;

            return (
              <Card
                key={key}
                padded={false}
                className={cn(
                  'p-3',
                  view !== 'day' && 'min-h-32',
                  key === today && 'border-accent/40',
                  outsideMonth && 'opacity-45',
                )}
              >
                <div className="mb-2.5 flex items-baseline justify-between">
                  <p className={cn('text-xs font-semibold', key === today ? 'text-accent' : 'text-muted-foreground')}>
                    {view === 'day' ? day.toFormat('cccc') : day.toFormat('ccc d')}
                  </p>
                  {dayBookings.length > 0 && (
                    <span className="tabular text-xs text-muted-foreground">{dayBookings.length}</span>
                  )}
                </div>

                {dayBookings.length === 0 ? (
                  <p className="py-2 text-xs text-muted-foreground">—</p>
                ) : (
                  <ul className="space-y-2">
                    {dayBookings.map((booking) => {
                      const inactive = INACTIVE_STATUSES.includes(booking.status as BookingStatus);
                      const status = bookingStatus(booking.status as BookingStatus);

                      return (
                        <li key={booking.id}>
                          <Link
                            to={
                              booking.sessionId
                                ? `/consultant/sessions/${booking.sessionId}`
                                : `/consultant/sessions?booking=${booking.id}`
                            }
                            className={cn(
                              'block rounded-lg border border-border bg-surface-2 p-2.5 transition-colors hover:border-accent/40',
                              inactive && 'opacity-50 line-through decoration-1',
                            )}
                          >
                            <p className="tabular text-xs font-semibold">
                              {DateTime.fromISO(booking.startAt, { zone }).toFormat('HH:mm')}
                              <span className="ml-1.5 font-normal text-muted-foreground">
                                {formatDuration(booking.durationMinutes)}
                              </span>
                            </p>
                            <p className="mt-1 truncate text-xs font-medium">{booking.clientName}</p>
                            <p className="truncate text-xs text-muted-foreground">{booking.serviceName}</p>
                            {view === 'day' && (
                              <div className="mt-2 flex flex-wrap gap-1.5">
                                <StatusBadge label={status.label} tone={status.tone} />
                                <StatusBadge
                                  label={paymentStatus(booking.paymentStatus as never).label}
                                  tone={paymentStatus(booking.paymentStatus as never).tone}
                                />
                              </div>
                            )}
                          </Link>
                        </li>
                      );
                    })}
                  </ul>
                )}
              </Card>
            );
          })}
        </div>
      )}

      {(data?.blackouts.length ?? 0) > 0 && (
        <Card className="mt-6">
          <CardTitle className="flex items-center gap-2 text-base">
            <CalendarOff className="size-4 text-muted-foreground" aria-hidden />
            Time blocked out in this range
          </CardTitle>
          <ul className="mt-3 space-y-2">
            {data?.blackouts.map((blackout) => (
              <li key={blackout.id} className="flex flex-wrap items-baseline gap-x-3 text-sm">
                <span className="tabular font-medium">
                  {DateTime.fromISO(blackout.startAt, { zone }).toFormat('d LLL HH:mm')} –{' '}
                  {DateTime.fromISO(blackout.endAt, { zone }).toFormat('d LLL HH:mm')}
                </span>
                <span className="text-muted-foreground">{blackout.reason ?? 'Unavailable'}</span>
              </li>
            ))}
          </ul>
        </Card>
      )}
    </>
  );
}

/* -------------------------------------------------------------------------- */
/* Clients                                                                    */
/* -------------------------------------------------------------------------- */

/**
 * Only the people this consultant has actually worked with.
 *
 * The API scopes on the session's own consultant id, so this list cannot be
 * widened from the browser — there is no consultant filter to tamper with.
 */
export function ConsultantClients() {
  const [page, setPage] = useState(1);
  const [search, setSearch] = useState('');
  const [submitted, setSubmitted] = useState('');

  const { data, isLoading } = useConsultantClients({
    page,
    pageSize: 20,
    search: submitted || undefined,
  });

  const columns: Column<ConsultantClient>[] = [
    {
      key: 'name',
      header: 'Client',
      render: (row) => (
        // The name is the link rather than the whole row: the card layout on
        // small screens has no row to click, and a link is reachable by keyboard.
        <Link to={`/consultant/clients/${row.id}`} className="group flex items-center gap-3">
          <Avatar name={row.fullName} src={row.avatarUrl} size="sm" />
          <div className="min-w-0">
            <p className="truncate text-sm font-medium underline-offset-4 group-hover:underline">{row.fullName}</p>
            <p className="tabular truncate text-xs text-muted-foreground">{row.clientCode}</p>
          </div>
        </Link>
      ),
    },
    {
      key: 'company',
      header: 'Company',
      render: (row) =>
        row.company ? (
          <div className="min-w-0">
            <p className="truncate text-sm">{row.company}</p>
            {row.jobTitle && <p className="truncate text-xs text-muted-foreground">{row.jobTitle}</p>}
          </div>
        ) : (
          <span className="text-sm text-muted-foreground">—</span>
        ),
    },
    {
      key: 'sessions',
      header: 'Sessions',
      numeric: true,
      render: (row) => <span className="tabular text-sm">{row.sessionCount}</span>,
    },
    {
      key: 'last',
      header: 'Last seen',
      render: (row) => (
        <span className="text-sm text-muted-foreground">
          {row.lastSessionAt ? formatDate(row.lastSessionAt) : '—'}
        </span>
      ),
    },
    {
      key: 'next',
      header: 'Next',
      render: (row) =>
        row.nextSessionAt ? (
          <Badge tone="accent">{formatDate(row.nextSessionAt)}</Badge>
        ) : (
          <span className="text-sm text-muted-foreground">—</span>
        ),
    },
  ];

  return (
    <>
      <SEO title="Clients" noIndex />
      <PageHeader
        title="Your clients"
        description="Everyone you have worked with, and when you next see them."
        breadcrumbs={[{ label: 'Workspace', to: '/consultant' }, { label: 'Clients' }]}
      />

      <DataTable
        columns={columns}
        rows={data?.items}
        loading={isLoading}
        rowKey={(row) => row.id}
        cardTitle={(row) => row.fullName}
        toolbar={
          <form
            className="flex w-full max-w-md gap-2"
            onSubmit={(event) => {
              event.preventDefault();
              setPage(1);
              setSubmitted(search.trim());
            }}
          >
            <Input
              value={search}
              onChange={(event) => setSearch(event.target.value)}
              placeholder="Search by name, company or client code"
              aria-label="Search clients"
            />
            <Button type="submit" variant="secondary" icon={<Search className="size-4" aria-hidden />}>
              Search
            </Button>
          </form>
        }
        empty={{
          icon: <Users />,
          title: submitted ? 'No clients match that search' : 'No clients yet',
          description: submitted
            ? 'Try a different name, company or client code.'
            : 'Someone appears here once they book a session with you.',
        }}
        footer={
          data ? (
            <Pagination
              page={data.meta.page}
              pageSize={data.meta.pageSize}
              total={data.meta.total}
              onPageChange={setPage}
            />
          ) : null
        }
      />

      {data?.items.length ? (
        <p className="mt-4 text-xs text-muted-foreground">
          Open a client by name to see the sessions you have shared. Private notes stay on the session record they
          belong to.
        </p>
      ) : null}
    </>
  );
}

export function ConsultantClientDetail() {
  const { id } = useParams<{ id: string }>();
  const { data: client, isLoading } = useConsultantClient(id);

  if (isLoading) return <LoadingSkeleton rows={8} />;
  if (!client) {
    return (
      <EmptyState
        icon={<Users />}
        title="Client not found"
        description="You can only open clients you have worked with."
        action={
          <Link to="/consultant/clients">
            <Button variant="secondary">Back to clients</Button>
          </Link>
        }
      />
    );
  }

  return (
    <>
      <SEO title={client.fullName} noIndex />
      <PageHeader
        title={client.fullName}
        description={[client.jobTitle, client.company].filter(Boolean).join(' · ') || client.clientCode}
        breadcrumbs={[
          { label: 'Workspace', to: '/consultant' },
          { label: 'Clients', to: '/consultant/clients' },
          { label: client.fullName },
        ]}
      />

      <div className="grid gap-6 lg:grid-cols-[1fr_20rem]">
        <div className="space-y-6">
          <div className="grid gap-4 sm:grid-cols-3">
            {[
              { label: 'Sessions with you', value: String(client.sessionCount) },
              { label: 'Paid to you', value: money(client.totalPaid, client.currency) },
              { label: 'Client since', value: formatDate(client.clientSince) },
            ].map((stat) => (
              <Card key={stat.label}>
                <p className="text-xs font-medium tracking-wide text-muted-foreground uppercase">{stat.label}</p>
                <p className="tabular mt-1.5 text-xl font-semibold">{stat.value}</p>
              </Card>
            ))}
          </div>

          <Card padded={false}>
            <div className="border-b border-border p-5">
              <CardTitle className="text-base">Your shared history</CardTitle>
              <CardDescription className="mt-1">
                Most recent first. Notes live on each session record.
              </CardDescription>
            </div>

            {client.bookings.length === 0 ? (
              <div className="p-5">
                <EmptyState title="No bookings" description="Nothing scheduled between you yet." />
              </div>
            ) : (
              <ul className="divide-y divide-border">
                {client.bookings.map((booking) => {
                  const status = bookingStatus(booking.status);

                  return (
                    <li key={booking.id}>
                      <Link
                        to={
                          booking.sessionId
                            ? `/consultant/sessions/${booking.sessionId}`
                            : `/consultant/sessions?booking=${booking.id}`
                        }
                        className="flex flex-wrap items-center justify-between gap-4 p-5 transition-colors hover:bg-surface-2"
                      >
                        <div className="min-w-0">
                          <p className="truncate font-medium">{booking.service.name}</p>
                          <p className="mt-0.5 text-sm text-muted-foreground">
                            {formatDate(booking.startAt, booking.timezone)} ·{' '}
                            {formatDuration(booking.durationMinutes)}
                          </p>
                        </div>
                        <div className="flex items-center gap-3">
                          <span className="tabular text-sm">{money(booking.total, booking.currency)}</span>
                          <StatusBadge label={status.label} tone={status.tone} />
                        </div>
                      </Link>
                    </li>
                  );
                })}
              </ul>
            )}
          </Card>
        </div>

        <Card>
          <div className="flex items-center gap-3.5">
            <Avatar name={client.fullName} src={client.avatarUrl} size="lg" />
            <div className="min-w-0">
              <p className="truncate font-semibold">{client.fullName}</p>
              <p className="tabular truncate text-xs text-muted-foreground">{client.clientCode}</p>
            </div>
          </div>

          <Separator className="my-5" />

          <dl className="space-y-3.5 text-sm">
            {[
              { icon: <Mail className="size-4" aria-hidden />, label: 'Email', value: client.email },
              { icon: <Phone className="size-4" aria-hidden />, label: 'Phone', value: client.phone },
              { icon: <Briefcase className="size-4" aria-hidden />, label: 'Industry', value: client.industry },
              {
                icon: <MapPin className="size-4" aria-hidden />,
                label: 'Location',
                value: [client.city, client.country].filter(Boolean).join(', ') || null,
              },
              { icon: <Globe className="size-4" aria-hidden />, label: 'Timezone', value: client.timezone },
            ]
              .filter((row) => row.value)
              .map((row) => (
                <div key={row.label} className="flex items-start gap-3">
                  <span className="mt-0.5 text-muted-foreground">{row.icon}</span>
                  <div className="min-w-0">
                    <dt className="text-xs text-muted-foreground">{row.label}</dt>
                    <dd className="truncate">{row.value}</dd>
                  </div>
                </div>
              ))}
          </dl>

          <p className="mt-5 border-t border-border pt-4 text-xs text-muted-foreground">
            Contact details are here so you can reach a client about their session. They are not for marketing.
          </p>
        </Card>
      </div>
    </>
  );
}

/* -------------------------------------------------------------------------- */
/* Reviews                                                                    */
/* -------------------------------------------------------------------------- */

export function ConsultantReviews() {
  const [page, setPage] = useState(1);
  const { data, isLoading } = useConsultantReviews({ page, pageSize: 10 });

  const total = data?.distribution.reduce((sum, row) => sum + row.count, 0) ?? 0;

  return (
    <>
      <SEO title="Reviews" noIndex />
      <PageHeader
        title="Reviews about you"
        description="What clients said, including anything still with a moderator."
        breadcrumbs={[{ label: 'Workspace', to: '/consultant' }, { label: 'Reviews' }]}
      />

      {isLoading ? (
        <LoadingSkeleton rows={6} />
      ) : (
        <div className="grid gap-6 lg:grid-cols-[1fr_18rem]">
          <div className="space-y-4">
            {(data?.items.length ?? 0) === 0 ? (
              <EmptyState
                icon={<MessageSquareQuote />}
                title="No reviews yet"
                description="Clients are invited to review a session once it is completed."
              />
            ) : (
              data?.items.map((review) => (
                <Card key={review.id}>
                  <div className="flex flex-wrap items-start justify-between gap-3">
                    <Rating value={review.rating} />
                    {review.status === 'PENDING' && <Badge tone="warning">Awaiting moderation</Badge>}
                  </div>

                  {review.title && <h2 className="mt-3 font-semibold">{review.title}</h2>}
                  <p className="mt-1.5 text-sm leading-relaxed text-muted-foreground">{review.body}</p>

                  <p className="mt-3 text-xs text-muted-foreground">
                    {review.authorName}
                    {review.serviceName ? ` · ${review.serviceName}` : ''} · {formatDate(review.createdAt)}
                  </p>
                </Card>
              ))
            )}

            {data && (
              <Pagination
                page={data.meta.page}
                pageSize={data.meta.pageSize}
                total={data.meta.total}
                onPageChange={setPage}
              />
            )}
          </div>

          <Card>
            <CardTitle className="text-base">Your rating</CardTitle>
            <div className="mt-3 flex items-baseline gap-2">
              <span className="tabular text-4xl font-semibold">
                {data?.averageRating != null ? data.averageRating.toFixed(1) : '—'}
              </span>
              <span className="text-sm text-muted-foreground">
                from {data?.reviewCount ?? 0} published {(data?.reviewCount ?? 0) === 1 ? 'review' : 'reviews'}
              </span>
            </div>

            <div className="mt-5 space-y-2.5">
              {data?.distribution.map((row) => (
                <div key={row.rating} className="flex items-center gap-3">
                  <span className="tabular w-3 text-xs text-muted-foreground">{row.rating}</span>
                  <div className="flex-1">
                    <Progress
                      value={total === 0 ? 0 : (row.count / total) * 100}
                      label={`${row.count} ${row.count === 1 ? 'review' : 'reviews'} at ${row.rating} stars`}
                    />
                  </div>
                  <span className="tabular w-6 text-right text-xs text-muted-foreground">{row.count}</span>
                </div>
              ))}
            </div>

            <p className="mt-5 border-t border-border pt-4 text-xs text-muted-foreground">
              Reviews are moderated before they appear publicly, and an anonymous author stays anonymous here too.
            </p>
          </Card>
        </div>
      )}
    </>
  );
}

/* -------------------------------------------------------------------------- */
/* Settings                                                                   */
/* -------------------------------------------------------------------------- */

/** A comma-free list editor — specialties, qualifications and languages. */
function ListEditor({
  label,
  hint,
  values,
  onChange,
  placeholder,
}: {
  label: string;
  hint?: string;
  values: string[];
  onChange: (values: string[]) => void;
  placeholder: string;
}) {
  const [draft, setDraft] = useState('');

  const add = () => {
    const value = draft.trim();
    if (!value || values.includes(value)) return;
    onChange([...values, value]);
    setDraft('');
  };

  return (
    <Field label={label} hint={hint}>
      {({ id }) => (
        <div className="space-y-2.5">
          <div className="flex gap-2">
            <Input
              id={id}
              value={draft}
              placeholder={placeholder}
              onChange={(event) => setDraft(event.target.value)}
              onKeyDown={(event) => {
                if (event.key !== 'Enter') return;
                // Otherwise Enter would submit the surrounding form.
                event.preventDefault();
                add();
              }}
            />
            <Button type="button" variant="secondary" onClick={add} icon={<Plus className="size-4" aria-hidden />}>
              Add
            </Button>
          </div>

          {values.length > 0 && (
            <ul className="flex flex-wrap gap-2">
              {values.map((value) => (
                <li key={value}>
                  <span className="inline-flex items-center gap-1.5 rounded-full bg-surface-2 py-1 pr-1.5 pl-3 text-sm">
                    {value}
                    <button
                      type="button"
                      onClick={() => onChange(values.filter((item) => item !== value))}
                      aria-label={`Remove ${value}`}
                      className="rounded-full p-0.5 text-muted-foreground transition-colors hover:bg-surface-3 hover:text-foreground"
                    >
                      <X className="size-3.5" aria-hidden />
                    </button>
                  </span>
                </li>
              ))}
            </ul>
          )}
        </div>
      )}
    </Field>
  );
}

interface ProfileDraft {
  title: string;
  biography: string;
  yearsExperience: string;
  linkedinUrl: string;
  websiteUrl: string;
  specialties: string[];
  qualifications: string[];
  languages: string[];
}

export function ConsultantSettings() {
  const { user } = useAuth();
  const { data: profile, isLoading } = useConsultantProfile(Boolean(user?.consultantProfileId));
  const saveProfile = useSaveConsultantProfile();
  const setAcceptance = useSetBookingAcceptance();
  const toast = useToast();

  const [draft, setDraft] = useState<ProfileDraft | null>(null);

  // `values` on a controlled draft rather than a form library: the list editors
  // are not native inputs, so there is nothing for a resolver to register.
  const current: ProfileDraft | null =
    draft ??
    (profile
      ? {
          title: profile.title,
          biography: profile.biography,
          yearsExperience: String(profile.yearsExperience),
          linkedinUrl: profile.linkedinUrl ?? '',
          websiteUrl: profile.websiteUrl ?? '',
          specialties: profile.specialties,
          qualifications: profile.qualifications,
          languages: profile.languages,
        }
      : null);

  if (isLoading || !current || !profile) return <LoadingSkeleton rows={8} />;

  const patch = (changes: Partial<ProfileDraft>) => setDraft({ ...current, ...changes });

  const save = async () => {
    try {
      await saveProfile.mutateAsync({
        title: current.title.trim(),
        biography: current.biography.trim(),
        yearsExperience: Number(current.yearsExperience) || 0,
        linkedinUrl: current.linkedinUrl.trim() || null,
        websiteUrl: current.websiteUrl.trim() || null,
        specialties: current.specialties,
        qualifications: current.qualifications,
        languages: current.languages,
      });
      setDraft(null);
      toast.success('Profile saved', 'Your public page reflects this immediately.');
    } catch (error) {
      toast.error(
        'Could not save your profile',
        error instanceof ApiError ? error.message : 'Please try again shortly.',
      );
    }
  };

  return (
    <>
      <SEO title="Consultant settings" noIndex />
      <PageHeader
        title="Your consultant profile"
        description="What prospective clients read before they book you."
        breadcrumbs={[{ label: 'Workspace', to: '/consultant' }, { label: 'Settings' }]}
        action={
          <Button
            onClick={save}
            loading={saveProfile.isPending}
            disabled={!draft}
            icon={<Save className="size-4" aria-hidden />}
          >
            Save changes
          </Button>
        }
      />

      <div className="grid gap-6 lg:grid-cols-[1fr_20rem]">
        <div className="space-y-6">
          <Card>
            <CardTitle className="text-base">Headline and biography</CardTitle>
            <div className="mt-5 space-y-5">
              <Field label="Professional title" required hint="Shown under your name across the site.">
                {({ id }) => (
                  <Input
                    id={id}
                    value={current.title}
                    maxLength={160}
                    onChange={(event) => patch({ title: event.target.value })}
                  />
                )}
              </Field>

              <Field label="Biography" hint="Two or three paragraphs. Plain text.">
                {({ id }) => (
                  <Textarea
                    id={id}
                    rows={10}
                    value={current.biography}
                    maxLength={5000}
                    onChange={(event) => patch({ biography: event.target.value })}
                  />
                )}
              </Field>

              <Field label="Years of experience">
                {({ id }) => (
                  <Input
                    id={id}
                    type="number"
                    min={0}
                    max={80}
                    value={current.yearsExperience}
                    onChange={(event) => patch({ yearsExperience: event.target.value })}
                    className="max-w-32"
                  />
                )}
              </Field>
            </div>
          </Card>

          <Card>
            <CardTitle className="text-base">Expertise</CardTitle>
            <div className="mt-5 space-y-6">
              <ListEditor
                label="Specialties"
                hint="Clients filter the directory by these."
                values={current.specialties}
                onChange={(specialties) => patch({ specialties })}
                placeholder="e.g. Corporate restructuring"
              />
              <ListEditor
                label="Qualifications"
                values={current.qualifications}
                onChange={(qualifications) => patch({ qualifications })}
                placeholder="e.g. MBA, INSEAD"
              />
              <ListEditor
                label="Languages"
                values={current.languages}
                onChange={(languages) => patch({ languages })}
                placeholder="e.g. English"
              />
            </div>
          </Card>

          <Card>
            <CardTitle className="text-base">Links</CardTitle>
            <div className="mt-5 grid gap-5 sm:grid-cols-2">
              <Field label="LinkedIn" hint="Full URL, including https://">
                {({ id }) => (
                  <Input
                    id={id}
                    type="url"
                    inputMode="url"
                    value={current.linkedinUrl}
                    placeholder="https://www.linkedin.com/in/…"
                    onChange={(event) => patch({ linkedinUrl: event.target.value })}
                  />
                )}
              </Field>
              <Field label="Website">
                {({ id }) => (
                  <Input
                    id={id}
                    type="url"
                    inputMode="url"
                    value={current.websiteUrl}
                    placeholder="https://…"
                    onChange={(event) => patch({ websiteUrl: event.target.value })}
                  />
                )}
              </Field>
            </div>
          </Card>
        </div>

        <div className="space-y-6">
          <Card>
            <CardTitle className="text-base">Taking bookings</CardTitle>
            <CardDescription className="mt-1">
              Pausing hides every future slot. Sessions already booked are unaffected.
            </CardDescription>

            <div className="mt-4 flex items-center gap-3">
              <Badge tone={profile.isAcceptingBookings ? 'success' : 'warning'} dot>
                {profile.isAcceptingBookings ? 'Accepting bookings' : 'Paused'}
              </Badge>
            </div>

            <Button
              className="mt-4"
              variant="secondary"
              size="sm"
              loading={setAcceptance.isPending}
              onClick={() =>
                setAcceptance.mutate(!profile.isAcceptingBookings, {
                  onSuccess: () =>
                    toast.success(
                      profile.isAcceptingBookings ? 'Bookings paused' : 'Bookings resumed',
                      profile.isAcceptingBookings
                        ? 'Your calendar shows no available slots.'
                        : 'Clients can book you again.',
                    ),
                  onError: () => toast.error('Could not change your booking status'),
                })
              }
              icon={profile.isAcceptingBookings ? <CalendarOff className="size-4" aria-hidden /> : <Check className="size-4" aria-hidden />}
            >
              {profile.isAcceptingBookings ? 'Pause bookings' : 'Resume bookings'}
            </Button>
          </Card>

          <Card>
            <CardTitle className="text-base">Managed by the practice</CardTitle>
            <CardDescription className="mt-1">
              These are set by an administrator, so a profile cannot publish itself or change which services it
              appears under.
            </CardDescription>

            <dl className="mt-4 space-y-3 text-sm">
              <div className="flex items-center justify-between gap-3">
                <dt className="text-muted-foreground">Public listing</dt>
                <dd>
                  <Badge tone={profile.isPublished ? 'success' : 'neutral'}>
                    {profile.isPublished ? 'Published' : 'Not published'}
                  </Badge>
                </dd>
              </div>
              <div className="flex items-center justify-between gap-3">
                <dt className="text-muted-foreground">Profile URL</dt>
                <dd className="tabular truncate text-xs">/consultants/{profile.slug}</dd>
              </div>
              <div className="flex items-center justify-between gap-3">
                <dt className="text-muted-foreground">Slot interval</dt>
                <dd>{profile.slotIntervalMinutes} min</dd>
              </div>
              <div className="flex items-center justify-between gap-3">
                <dt className="text-muted-foreground">Timezone</dt>
                <dd className="truncate text-xs">{profile.timezone.replace(/_/g, ' ')}</dd>
              </div>
            </dl>

            {profile.services.length > 0 && (
              <>
                <Separator className="my-4" />
                <p className="text-xs font-medium tracking-wide text-muted-foreground uppercase">
                  Services you deliver
                </p>
                <ul className="mt-2.5 flex flex-wrap gap-2">
                  {profile.services.map((service) => (
                    <li key={service.id}>
                      <Badge tone="neutral">{service.name}</Badge>
                    </li>
                  ))}
                </ul>
              </>
            )}
          </Card>

          <Card>
            <CardTitle className="text-base">Elsewhere</CardTitle>
            <div className="mt-4 flex flex-col gap-2.5">
              <Link to="/consultant/availability">
                <Button variant="ghost" size="sm" className="w-full justify-start" icon={<Clock className="size-4" aria-hidden />}>
                  Working hours
                </Button>
              </Link>
              <Link to="/consultant/calendar">
                <Button variant="ghost" size="sm" className="w-full justify-start" icon={<CalendarDays className="size-4" aria-hidden />}>
                  Calendar
                </Button>
              </Link>
              <Link to="/portal/settings">
                <Button variant="ghost" size="sm" className="w-full justify-start" icon={<Video className="size-4" aria-hidden />}>
                  Account and password
                </Button>
              </Link>
            </div>
          </Card>
        </div>
      </div>
    </>
  );
}
