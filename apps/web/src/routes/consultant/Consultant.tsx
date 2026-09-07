import { useEffect, useMemo, useRef, useState } from 'react';
import { Link, useParams, useSearchParams } from 'react-router-dom';
import { DateTime } from 'luxon';
import {
  AlertTriangle,
  Calendar,
  CalendarClock,
  CalendarOff,
  Check,
  CheckCircle2,
  Clock,
  Loader2,
  Lock,
  Mail,
  Play,
  Plus,
  Save,
  Send,
  Star,
  Trash2,
  TrendingUp,
  Users,
  Video,
  Wallet,
} from 'lucide-react';
import type { ConsultantSessionDto } from '@meridian/types';
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
  Separator,
  StatusBadge,
  Textarea,
} from '@/components/ui';
import { PageHeader } from '@/components/layout/DashboardLayout';
import { SEO } from '@/components/SEO';
import { ApiError, api } from '@/lib/api';
import {
  useAvailabilityConfig,
  useCancelBooking,
  useConsultantDashboard,
  useRequestBalancePayment,
  useSaveAvailability,
  useSession,
  useSessions,
} from '@/lib/queries';
import { useAuth } from '@/providers/auth-context';
import { useToast } from '@/providers/toast-context';
import { bookingStatus, cn, formatDate, formatDateTimeWithZone, formatDuration, money } from '@/lib/utils';

/* -------------------------------------------------------------------------- */
/* Dashboard                                                                  */
/* -------------------------------------------------------------------------- */

export function ConsultantDashboard() {
  const { user } = useAuth();
  const { data, isLoading } = useConsultantDashboard(Boolean(user?.consultantProfileId));
  const toast = useToast();
  const [accepting, setAccepting] = useState<boolean | null>(null);

  const isAccepting = accepting ?? data?.isAcceptingBookings ?? true;

  const toggleAccepting = async () => {
    const next = !isAccepting;
    setAccepting(next);
    try {
      await api.patch('/api/consultant/booking-status', { isAcceptingBookings: next });
      toast.success(next ? 'Accepting bookings' : 'Bookings paused', next ? 'Your calendar is open again.' : 'Existing bookings are unaffected.');
    } catch {
      setAccepting(!next);
      toast.error('Could not update', 'Please try again.');
    }
  };

  if (isLoading) {
    return (
      <>
        <PageHeader title="Your workspace" />
        <LoadingSkeleton rows={6} />
      </>
    );
  }

  return (
    <>
      <SEO title="Consultant workspace" noIndex />
      <PageHeader
        title={`Good ${greeting()}, ${user?.firstName}`}
        description={
          data && data.today.length > 0
            ? `You have ${data.today.length} session${data.today.length === 1 ? '' : 's'} today.`
            : 'No sessions scheduled for today.'
        }
        action={
          <Button
            variant={isAccepting ? 'secondary' : 'primary'}
            icon={isAccepting ? <CalendarOff className="size-4" aria-hidden /> : <Calendar className="size-4" aria-hidden />}
            onClick={() => void toggleAccepting()}
          >
            {isAccepting ? 'Pause bookings' : 'Resume bookings'}
          </Button>
        }
      />

      <div className="grid gap-4 sm:grid-cols-2 lg:grid-cols-4">
        <MetricCard
          icon={<Wallet className="size-5" aria-hidden />}
          label="Revenue this month"
          value={money(data?.revenueThisMonth ?? 0, data?.currency ?? 'KES')}
        />
        <MetricCard
          icon={<CheckCircle2 className="size-5" aria-hidden />}
          label="Sessions delivered"
          value={String(data?.completedSessions ?? 0)}
        />
        <MetricCard icon={<Users className="size-5" aria-hidden />} label="Clients" value={String(data?.clientCount ?? 0)} />
        <MetricCard
          icon={<Star className="size-5" aria-hidden />}
          label="Average rating"
          value={data?.averageRating ? `${data.averageRating.toFixed(1)} ★` : '—'}
          hint={data?.reviewCount ? `${data.reviewCount} reviews` : undefined}
        />
      </div>

      {(data?.pendingBalanceCount ?? 0) > 0 && (
        <Card className="mt-6 bg-warning-soft">
          <div className="flex items-start gap-4">
            <AlertTriangle className="mt-0.5 size-5 shrink-0 text-warning" aria-hidden />
            <div>
              <h2 className="font-semibold text-warning">
                {data!.pendingBalanceCount} booking{data!.pendingBalanceCount === 1 ? '' : 's'} with an outstanding balance
              </h2>
              <p className="mt-1 text-sm text-warning/80">
                {money(data!.pendingBalance, data!.currency)} due across upcoming sessions. Reminders are sent automatically.
              </p>
            </div>
          </div>
        </Card>
      )}

      <section className="mt-8">
        <h2 className="mb-4 text-h3">Today</h2>
        {data && data.today.length > 0 ? (
          <div className="space-y-3">
            {data.today.map((booking) => (
              <SessionRow key={booking.id} booking={booking} highlight />
            ))}
          </div>
        ) : (
          <EmptyState
            icon={<Calendar className="size-5" aria-hidden />}
            title="Nothing scheduled today"
            description="Your next session appears below when it is booked."
          />
        )}
      </section>

      {data && data.upcoming.length > 0 && (
        <section className="mt-8">
          <h2 className="mb-4 text-h3">Coming up</h2>
          <div className="space-y-3">
            {data.upcoming.map((booking) => (
              <SessionRow key={booking.id} booking={booking} />
            ))}
          </div>
        </section>
      )}
    </>
  );
}

function greeting(): string {
  const hour = new Date().getHours();
  if (hour < 12) return 'morning';
  if (hour < 18) return 'afternoon';
  return 'evening';
}

function MetricCard({
  icon,
  label,
  value,
  hint,
}: {
  icon: React.ReactNode;
  label: string;
  value: string;
  hint?: string;
}) {
  return (
    <Card>
      <div className="mb-4 flex size-10 items-center justify-center rounded-[var(--radius-control)] bg-accent-soft text-accent">
        {icon}
      </div>
      <p className="tabular text-h3">{value}</p>
      <p className="mt-1 text-sm text-muted-foreground">{label}</p>
      {hint && <p className="mt-0.5 text-xs text-muted-foreground">{hint}</p>}
    </Card>
  );
}

function SessionRow({
  booking,
  highlight,
}: {
  booking: import('@meridian/types').BookingSummaryDto;
  highlight?: boolean;
}) {
  const start = DateTime.fromISO(booking.startAt).setZone(booking.timezone);

  return (
    <Card className={cn('flex flex-wrap items-center gap-4', highlight && 'ring-1 ring-accent/30')}>
      <div className="tabular w-16 shrink-0 text-center">
        <p className="text-lg font-semibold">{start.toFormat('HH:mm')}</p>
        <p className="text-xs text-muted-foreground">{formatDuration(booking.durationMinutes)}</p>
      </div>

      <Separator className="hidden h-10 w-px sm:block" />

      <div className="min-w-0 flex-1">
        <p className="truncate font-medium">{booking.service.name}</p>
        <p className="truncate text-xs text-muted-foreground">
          {booking.client?.fullName ?? 'Client'} · {booking.meetingProvider.replace(/_/g, ' ')}
        </p>
      </div>

      <div className="flex items-center gap-3">
        {booking.balance > 0 && (
          <Badge tone="warning">{money(booking.balance, booking.currency)} due</Badge>
        )}
        <StatusBadge {...bookingStatus(booking.status)} />
        <Link to={`/consultant/sessions?booking=${booking.id}`}>
          <Button size="sm" variant="secondary">
            Open
          </Button>
        </Link>
      </div>
    </Card>
  );
}

/* -------------------------------------------------------------------------- */
/* Sessions                                                                   */
/* -------------------------------------------------------------------------- */

export function ConsultantSessions() {
  const [status, setStatus] = useState('');
  const [searchParams, setSearchParams] = useSearchParams();

  // Calendar entries and client histories link here with `?booking=` when a
  // booking has no session record of its own yet.
  const bookingId = searchParams.get('booking') ?? undefined;

  const { data, isLoading } = useSessions({
    pageSize: 50,
    status: status || undefined,
    bookingId,
  });

  return (
    <>
      <SEO title="Sessions" noIndex />
      <PageHeader title="Sessions" description="Every consultation you have delivered or have scheduled." />

      {bookingId && (
        <Card className="mb-6 flex flex-wrap items-center justify-between gap-4">
          <p className="text-sm text-muted-foreground">
            Showing the session record for one booking.
          </p>
          <Button size="sm" variant="ghost" onClick={() => setSearchParams({})}>
            Show all sessions
          </Button>
        </Card>
      )}

      <div className="mb-6 flex flex-wrap gap-2">
        {[
          { value: '', label: 'All' },
          { value: 'SCHEDULED', label: 'Scheduled' },
          { value: 'COMPLETED', label: 'Completed' },
          { value: 'NO_SHOW', label: 'No shows' },
        ].map((filter) => (
          <button
            key={filter.value}
            type="button"
            onClick={() => setStatus(filter.value)}
            aria-pressed={status === filter.value}
            className={cn(
              'rounded-full px-3.5 py-1.5 text-sm font-medium transition-colors',
              status === filter.value
                ? 'bg-primary text-primary-foreground'
                : 'bg-muted text-muted-foreground hover:text-foreground',
            )}
          >
            {filter.label}
          </button>
        ))}
      </div>

      {isLoading ? (
        <LoadingSkeleton rows={5} />
      ) : data && data.items.length > 0 ? (
        <div className="space-y-3">
          {data.items.map((session) => (
            <Link key={session.id} to={`/consultant/sessions/${session.id}`} className="block">
              <Card interactive className="flex flex-wrap items-center gap-4">
                <div className="min-w-0 flex-1">
                  <p className="truncate font-medium">{session.booking.service.name}</p>
                  <p className="truncate text-xs text-muted-foreground">
                    {formatDate(session.booking.startAt)} · {session.booking.client?.fullName ?? 'Client'}
                  </p>
                </div>
                {session.sharedNotes ? (
                  <Badge tone="success">Written up</Badge>
                ) : (
                  <Badge tone="warning">Notes needed</Badge>
                )}
                <StatusBadge {...bookingStatus(session.booking.status)} />
              </Card>
            </Link>
          ))}
        </div>
      ) : bookingId ? (
        // A session row is created when the consultation starts, so a future
        // booking legitimately has none. Say that rather than showing "no match".
        <EmptyState
          icon={<Calendar className="size-5" aria-hidden />}
          title="No session record yet"
          description="A record is created when this consultation starts. Until then there is nothing to write up."
          action={
            <Button variant="secondary" size="sm" onClick={() => setSearchParams({})}>
              Show all sessions
            </Button>
          }
        />
      ) : (
        <EmptyState icon={<Calendar className="size-5" aria-hidden />} title="No sessions match that filter" />
      )}
    </>
  );
}

/**
 * Session workspace, with autosaving structured notes.
 *
 * Private notes are visually separated and labelled at the point of entry —
 * a consultant should never be uncertain about which box the client can read.
 */
export function ConsultantSessionDetail() {
  const { id } = useParams<{ id: string }>();
  const { data, isLoading, refetch } = useSession(id);
  const toast = useToast();

  const session = data as ConsultantSessionDto | undefined;

  const [notes, setNotes] = useState({
    objective: '',
    discussionSummary: '',
    keyFindings: '',
    recommendations: '',
    privateNotes: '',
    followUpDate: '',
    sharedWithClient: false,
  });
  const [actionItems, setActionItems] = useState<
    { description: string; owner: 'CLIENT' | 'CONSULTANT'; completed: boolean }[]
  >([]);
  const [savedAt, setSavedAt] = useState<Date | null>(null);
  const [saving, setSaving] = useState(false);
  const [cancelOpen, setCancelOpen] = useState(false);

  // Which session's notes are currently in the fields. Doubles as the "record
  // has loaded" flag that the autosave timer waits on.
  const [hydratedSessionId, setHydratedSessionId] = useState<string | null>(null);

  const bookingId = session?.booking.id ?? '';
  const cancelBooking = useCancelBooking(bookingId);
  const requestPayment = useRequestBalancePayment(bookingId);

  // Filled during render, not in an effect. An effect would paint the empty
  // write-up once before the saved notes arrive, which reads as a consultant's
  // work having been lost.
  if (session && hydratedSessionId !== session.id) {
    setHydratedSessionId(session.id);

    setNotes({
      objective: session.sharedNotes?.objective ?? '',
      discussionSummary: session.sharedNotes?.discussionSummary ?? '',
      keyFindings: session.sharedNotes?.keyFindings ?? '',
      recommendations: session.sharedNotes?.recommendations ?? '',
      privateNotes: session.privateNotes ?? '',
      followUpDate: session.sharedNotes?.followUpDate ?? '',
      sharedWithClient: Boolean(session.sharedNotes),
    });
    setActionItems(
      (session.sharedNotes?.actionItems ?? []).map((item) => ({
        description: item.description,
        owner: item.owner === 'CONSULTANT' ? 'CONSULTANT' : 'CLIENT',
        completed: item.completed,
      })),
    );
    setSavedAt(session.notesUpdatedAt ? new Date(session.notesUpdatedAt) : null);
  }

  const save = async (override?: Partial<typeof notes>) => {
    if (!id) return;
    setSaving(true);
    const payload = { ...notes, ...override };

    try {
      await api.put(`/api/sessions/${id}/notes`, {
        objective: payload.objective || undefined,
        discussionSummary: payload.discussionSummary || undefined,
        keyFindings: payload.keyFindings || undefined,
        recommendations: payload.recommendations || undefined,
        privateNotes: payload.privateNotes || undefined,
        followUpDate: payload.followUpDate || undefined,
        sharedWithClient: payload.sharedWithClient,
        actionItems: actionItems.filter((item) => item.description.trim()),
      });
      setSavedAt(new Date());
    } catch {
      toast.error('Could not save notes', 'Your text is still here — try again in a moment.');
    } finally {
      setSaving(false);
    }
  };

  // Autosave two seconds after typing stops, but not before the record has
  // loaded — otherwise opening a session would immediately save the empty form
  // over the notes it is still fetching.
  useEffect(() => {
    if (!hydratedSessionId) return;
    const timer = window.setTimeout(() => void save(), 2000);
    return () => window.clearTimeout(timer);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [notes, actionItems, hydratedSessionId]);

  if (isLoading) return <LoadingSkeleton rows={8} />;
  if (!session) return <EmptyState title="Session not found" />;

  // A booking that has already run, been cancelled or refunded is not one to
  // move or cancel again.
  const canChangeSchedule = ['CONFIRMED', 'RESCHEDULED', 'PENDING_PAYMENT'].includes(session.booking.status);
  const balance = session.booking.balance;

  const chasePayment = async () => {
    try {
      const result = await requestPayment.mutateAsync();
      toast.success(
        result.queued ? 'Payment request sent' : 'Already requested today',
        result.queued
          ? 'The client has an email and a portal notification with a payment link.'
          : 'A reminder for this booking already went out today, so nothing was sent again.',
      );
    } catch (error) {
      toast.error(
        'Could not request payment',
        error instanceof ApiError ? error.message : 'Please try again shortly.',
      );
    }
  };

  const transition = async (action: 'start' | 'complete') => {
    try {
      await api.post(`/api/sessions/${id}/${action}`);
      await refetch();
      toast.success(action === 'start' ? 'Session started' : 'Session completed');
    } catch {
      toast.error('Could not update session status');
    }
  };

  return (
    <>
      <SEO title="Session workspace" noIndex />
      <PageHeader
        title={session.booking.service.name}
        description={formatDateTimeWithZone(session.booking.startAt, session.booking.timezone)}
        breadcrumbs={[
          { label: 'Workspace', to: '/consultant' },
          { label: 'Sessions', to: '/consultant/sessions' },
          { label: 'Record' },
        ]}
        action={
          <>
            {session.status === 'SCHEDULED' && (
              <Button icon={<Play className="size-4" aria-hidden />} onClick={() => void transition('start')}>
                Start session
              </Button>
            )}
            {session.status === 'IN_PROGRESS' && (
              <Button icon={<Check className="size-4" aria-hidden />} onClick={() => void transition('complete')}>
                Complete session
              </Button>
            )}
            {canChangeSchedule && (
              <Link to={`/consultant/bookings/${session.booking.id}/reschedule`}>
                <Button variant="secondary" icon={<CalendarClock className="size-4" aria-hidden />}>
                  Reschedule
                </Button>
              </Link>
            )}
            {canChangeSchedule && (
              <Button variant="ghost" onClick={() => setCancelOpen(true)}>
                Cancel
              </Button>
            )}
          </>
        }
      />

      <ConfirmDialog
        open={cancelOpen}
        onClose={() => setCancelOpen(false)}
        title="Cancel this booking?"
        description={`${session.booking.client?.fullName ?? 'The client'} will be told the session is cancelled, and any meeting link is withdrawn. This cannot be undone.`}
        confirmLabel="Cancel booking"
        tone="destructive"
        loading={cancelBooking.isPending}
        onConfirm={async () => {
          try {
            await cancelBooking.mutateAsync({ reason: 'Cancelled by the consultant' });
            setCancelOpen(false);
            await refetch();
            toast.success('Booking cancelled', 'The client has been notified.');
          } catch (error) {
            toast.error(
              'Could not cancel this booking',
              error instanceof ApiError ? error.message : 'Please try again shortly.',
            );
          }
        }}
      />

      <div className="grid gap-6 lg:grid-cols-[1fr_19rem]">
        <div className="space-y-5">
          <div className="flex items-center justify-between rounded-[var(--radius-panel)] bg-muted/50 px-4 py-2.5 text-xs">
            <span className="flex items-center gap-2 text-muted-foreground">
              {saving ? (
                <>
                  <Loader2 className="size-3.5 animate-spin" aria-hidden />
                  Saving…
                </>
              ) : savedAt ? (
                <>
                  <Check className="size-3.5 text-success" aria-hidden />
                  Saved at {DateTime.fromJSDate(savedAt).toFormat('HH:mm:ss')}
                </>
              ) : (
                'Not yet saved'
              )}
            </span>
            <Button size="sm" variant="ghost" icon={<Save className="size-3.5" aria-hidden />} onClick={() => void save()}>
              Save now
            </Button>
          </div>

          <Card>
            <CardTitle>Session write-up</CardTitle>
            <CardDescription className="mt-1.5">
              Shared with the client once you release it below.
            </CardDescription>

            <div className="mt-5 space-y-5">
              {(
                [
                  ['objective', 'Session objective', 'What was this session for?'],
                  ['discussionSummary', 'Discussion summary', 'What did you cover?'],
                  ['keyFindings', 'Key findings', 'What did you conclude?'],
                  ['recommendations', 'Recommendations', 'What should they do?'],
                ] as const
              ).map(([key, label, placeholder]) => (
                <Field key={key} label={label}>
                  {({ id: fieldId }) => (
                    <Textarea
                      id={fieldId}
                      rows={key === 'objective' ? 2 : 4}
                      placeholder={placeholder}
                      value={notes[key]}
                      onChange={(event) => setNotes((current) => ({ ...current, [key]: event.target.value }))}
                    />
                  )}
                </Field>
              ))}
            </div>
          </Card>

          <Card>
            <div className="flex items-center justify-between">
              <CardTitle>Action items</CardTitle>
              <Button
                size="sm"
                variant="secondary"
                icon={<Plus className="size-3.5" aria-hidden />}
                onClick={() =>
                  setActionItems((current) => [...current, { description: '', owner: 'CLIENT', completed: false }])
                }
              >
                Add
              </Button>
            </div>

            {actionItems.length === 0 ? (
              <p className="mt-5 text-sm text-muted-foreground">No action items yet.</p>
            ) : (
              <ul className="mt-5 space-y-3">
                {actionItems.map((item, index) => (
                  <li key={index} className="flex flex-wrap items-center gap-2">
                    <input
                      type="checkbox"
                      checked={item.completed}
                      aria-label={`Mark action ${index + 1} complete`}
                      onChange={(event) =>
                        setActionItems((current) =>
                          current.map((entry, i) =>
                            i === index ? { ...entry, completed: event.target.checked } : entry,
                          ),
                        )
                      }
                      className="size-4 shrink-0 rounded accent-[hsl(var(--accent))]"
                    />
                    <Input
                      value={item.description}
                      placeholder="What needs to happen?"
                      aria-label={`Action item ${index + 1}`}
                      onChange={(event) =>
                        setActionItems((current) =>
                          current.map((entry, i) =>
                            i === index ? { ...entry, description: event.target.value } : entry,
                          ),
                        )
                      }
                      className="min-w-40 flex-1"
                    />
                    <Select
                      value={item.owner}
                      aria-label={`Owner of action ${index + 1}`}
                      onChange={(event) =>
                        setActionItems((current) =>
                          current.map((entry, i) =>
                            i === index ? { ...entry, owner: event.target.value as 'CLIENT' | 'CONSULTANT' } : entry,
                          ),
                        )
                      }
                      className="w-36"
                    >
                      <option value="CLIENT">Client</option>
                      <option value="CONSULTANT">Me</option>
                    </Select>
                    <button
                      type="button"
                      onClick={() => setActionItems((current) => current.filter((_, i) => i !== index))}
                      aria-label={`Remove action item ${index + 1}`}
                      className="rounded-lg p-2 text-muted-foreground transition-colors hover:bg-destructive-soft hover:text-destructive"
                    >
                      <Trash2 className="size-4" aria-hidden />
                    </button>
                  </li>
                ))}
              </ul>
            )}
          </Card>

          {/* Visually distinct so the boundary is unmistakable while typing. */}
          <Card className="border-2 border-dashed border-warning/40 bg-warning-soft/30">
            <div className="flex items-start gap-3">
              <Lock className="mt-0.5 size-5 shrink-0 text-warning" aria-hidden />
              <div className="flex-1">
                <CardTitle>Private notes</CardTitle>
                <CardDescription className="mt-1.5">
                  Visible only to you. Never shown to the client, whatever you share above.
                </CardDescription>

                <Textarea
                  rows={5}
                  className="mt-4"
                  aria-label="Private consultant notes"
                  placeholder="Your own observations, judgements and things to raise next time."
                  value={notes.privateNotes}
                  onChange={(event) => setNotes((current) => ({ ...current, privateNotes: event.target.value }))}
                />
              </div>
            </div>
          </Card>
        </div>

        <aside className="space-y-5">
          <Card>
            <CardTitle className="text-[0.9375rem]">Client</CardTitle>
            <div className="mt-4 flex items-center gap-3">
              <Avatar name={session.booking.client?.fullName ?? 'Client'} size="md" />
              <div className="min-w-0">
                <p className="truncate text-sm font-medium">{session.booking.client?.fullName}</p>
                <p className="truncate text-xs text-muted-foreground">{session.clientContact.email}</p>
              </div>
            </div>
            <dl className="mt-4 space-y-2 border-t border-border pt-4 text-xs">
              {session.clientContact.phone && (
                <div className="flex justify-between">
                  <dt className="text-muted-foreground">Phone</dt>
                  <dd>{session.clientContact.phone}</dd>
                </div>
              )}
              {session.clientContact.company && (
                <div className="flex justify-between">
                  <dt className="text-muted-foreground">Organisation</dt>
                  <dd className="text-right">{session.clientContact.company}</dd>
                </div>
              )}
            </dl>

            {/* A real mail client, not an in-app inbox this platform does not
                have. Nothing is sent on the client's behalf without them. */}
            <a
              href={`mailto:${session.clientContact.email}?subject=${encodeURIComponent(
                `${session.booking.service.name} — ${session.booking.reference}`,
              )}`}
              className="mt-4 inline-block"
            >
              <Button size="sm" variant="secondary" icon={<Mail className="size-3.5" aria-hidden />}>
                Send a message
              </Button>
            </a>
          </Card>

          {balance > 0 && (
            <Card className="bg-warning-soft">
              <CardTitle className="text-[0.9375rem] text-warning">Balance outstanding</CardTitle>
              <p className="tabular mt-2 text-2xl font-semibold text-warning">
                {money(balance, session.booking.currency)}
              </p>
              <p className="mt-1.5 text-xs text-warning/80">
                {money(session.booking.amountPaid, session.booking.currency)} of{' '}
                {money(session.booking.total, session.booking.currency)} paid.
              </p>

              <Button
                className="mt-4"
                size="sm"
                variant="secondary"
                loading={requestPayment.isPending}
                onClick={() => void chasePayment()}
                icon={<Send className="size-3.5" aria-hidden />}
              >
                Request payment
              </Button>

              <p className="mt-3 text-xs text-warning/70">
                Sends the client a payment link. It does not take payment, and at most one request goes out per day.
              </p>
            </Card>
          )}

          {session.booking.status === 'CONFIRMED' && (
            <Card>
              <CardTitle className="text-[0.9375rem]">Meeting</CardTitle>
              <p className="mt-2 text-sm text-muted-foreground">
                {session.booking.meetingProvider.replace(/_/g, ' ')}
              </p>
              <Link to={`/consultant/sessions/${session.id}`} className="mt-4 inline-block">
                <Button size="sm" variant="secondary" icon={<Video className="size-3.5" aria-hidden />}>
                  Meeting details
                </Button>
              </Link>
            </Card>
          )}

          <Card>
            <CardTitle className="text-[0.9375rem]">Share with client</CardTitle>
            <CardDescription className="mt-1.5">
              Releases the write-up above — not your private notes — to the client portal.
            </CardDescription>

            <label className="mt-4 flex items-center gap-3 text-sm">
              <input
                type="checkbox"
                checked={notes.sharedWithClient}
                onChange={(event) => {
                  const sharedWithClient = event.target.checked;
                  setNotes((current) => ({ ...current, sharedWithClient }));
                  void save({ sharedWithClient });
                }}
                className="size-4 rounded accent-[hsl(var(--accent))]"
              />
              Share notes with the client
            </label>

            {notes.sharedWithClient && (
              <Badge tone="success" className="mt-3">
                Visible in their portal
              </Badge>
            )}
          </Card>

          <Card>
            <CardTitle className="text-[0.9375rem]">Follow-up</CardTitle>
            <Field label="Suggested follow-up date">
              {({ id: fieldId }) => (
                <Input
                  id={fieldId}
                  type="date"
                  value={notes.followUpDate}
                  onChange={(event) => setNotes((current) => ({ ...current, followUpDate: event.target.value }))}
                />
              )}
            </Field>
          </Card>
        </aside>
      </div>
    </>
  );
}

/* -------------------------------------------------------------------------- */
/* Availability                                                               */
/* -------------------------------------------------------------------------- */

const WEEKDAYS = [
  { value: 1, label: 'Monday' },
  { value: 2, label: 'Tuesday' },
  { value: 3, label: 'Wednesday' },
  { value: 4, label: 'Thursday' },
  { value: 5, label: 'Friday' },
  { value: 6, label: 'Saturday' },
  { value: 0, label: 'Sunday' },
];

export function ConsultantAvailability() {
  const { user } = useAuth();
  const consultantId = user?.consultantProfileId ?? '';
  const { data, isLoading } = useAvailabilityConfig(consultantId);
  const saveAvailability = useSaveAvailability(consultantId);
  const toast = useToast();

  const [rules, setRules] = useState<{ weekday: number; startTime: string; endTime: string; isActive: boolean }[]>([]);
  const [interval, setIntervalMinutes] = useState(30);
  const [timezone, setTimezone] = useState('Africa/Nairobi');
  const hydrated = useRef(false);

  useEffect(() => {
    if (!data || hydrated.current) return;
    hydrated.current = true;
    setRules(data.rules.map(({ weekday, startTime, endTime, isActive }) => ({ weekday, startTime, endTime, isActive })));
    setIntervalMinutes(data.slotIntervalMinutes);
    setTimezone(data.timezone);
  }, [data]);

  const byWeekday = useMemo(() => {
    const map = new Map<number, typeof rules>();
    for (const rule of rules) {
      map.set(rule.weekday, [...(map.get(rule.weekday) ?? []), rule]);
    }
    return map;
  }, [rules]);

  const save = () => {
    saveAvailability.mutate(
      { timezone, slotIntervalMinutes: interval, rules, blackouts: [] },
      {
        onSuccess: () => toast.success('Availability updated', 'Your booking calendar reflects this immediately.'),
        onError: () => toast.error('Could not save availability'),
      },
    );
  };

  if (isLoading) return <LoadingSkeleton rows={6} />;

  return (
    <>
      <SEO title="Availability" noIndex />
      <PageHeader
        title="Your availability"
        description="Working hours are in your own timezone, so daylight-saving changes never shift your day."
        action={
          <Button loading={saveAvailability.isPending} onClick={save} icon={<Save className="size-4" aria-hidden />}>
            Save changes
          </Button>
        }
      />

      <div className="grid gap-6 lg:grid-cols-[1fr_19rem]">
        <div className="space-y-3">
          {WEEKDAYS.map((day) => {
            const dayRules = byWeekday.get(day.value) ?? [];

            return (
              <Card key={day.value}>
                <div className="flex items-center justify-between">
                  <h2 className="font-semibold">{day.label}</h2>
                  <Button
                    size="sm"
                    variant="ghost"
                    icon={<Plus className="size-3.5" aria-hidden />}
                    onClick={() =>
                      setRules((current) => [
                        ...current,
                        { weekday: day.value, startTime: '09:00', endTime: '17:00', isActive: true },
                      ])
                    }
                  >
                    Add block
                  </Button>
                </div>

                {dayRules.length === 0 ? (
                  <p className="mt-3 text-sm text-muted-foreground">Not working</p>
                ) : (
                  <ul className="mt-4 space-y-2">
                    {dayRules.map((rule) => {
                      const index = rules.indexOf(rule);
                      return (
                        <li key={index} className="flex flex-wrap items-center gap-2">
                          <Input
                            type="time"
                            value={rule.startTime}
                            aria-label={`${day.label} start time`}
                            onChange={(event) =>
                              setRules((current) =>
                                current.map((entry, i) =>
                                  i === index ? { ...entry, startTime: event.target.value } : entry,
                                ),
                              )
                            }
                            className="w-32"
                          />
                          <span className="text-sm text-muted-foreground" aria-hidden>
                            to
                          </span>
                          <Input
                            type="time"
                            value={rule.endTime}
                            aria-label={`${day.label} end time`}
                            onChange={(event) =>
                              setRules((current) =>
                                current.map((entry, i) =>
                                  i === index ? { ...entry, endTime: event.target.value } : entry,
                                ),
                              )
                            }
                            className="w-32"
                          />
                          <button
                            type="button"
                            onClick={() => setRules((current) => current.filter((_, i) => i !== index))}
                            aria-label={`Remove ${day.label} block`}
                            className="rounded-lg p-2 text-muted-foreground transition-colors hover:bg-destructive-soft hover:text-destructive"
                          >
                            <Trash2 className="size-4" aria-hidden />
                          </button>
                        </li>
                      );
                    })}
                  </ul>
                )}
              </Card>
            );
          })}
        </div>

        <aside className="space-y-5">
          <Card>
            <CardTitle className="text-[0.9375rem]">Slot settings</CardTitle>
            <div className="mt-4 space-y-4">
              <Field label="Slot interval" hint="How your times appear to clients.">
                {({ id }) => (
                  <Select id={id} value={interval} onChange={(event) => setIntervalMinutes(Number(event.target.value))}>
                    <option value={15}>Every 15 minutes</option>
                    <option value={30}>Every 30 minutes</option>
                    <option value={60}>Every hour</option>
                  </Select>
                )}
              </Field>
              <Field label="Your timezone">
                {({ id }) => <Input id={id} value={timezone} onChange={(event) => setTimezone(event.target.value)} />}
              </Field>
            </div>
          </Card>

          <Card>
            <CardTitle className="text-[0.9375rem]">Calendar connections</CardTitle>
            <CardDescription className="mt-1.5">
              Connected calendars are checked for conflicts before a slot is offered.
            </CardDescription>

            {data && data.calendarConnections.length > 0 ? (
              <ul className="mt-4 space-y-3">
                {data.calendarConnections.map((connection) => (
                  <li key={connection.id} className="flex items-center justify-between gap-3 text-sm">
                    <div className="min-w-0">
                      <p className="font-medium">{connection.provider === 'GOOGLE' ? 'Google' : 'Microsoft'}</p>
                      <p className="truncate text-xs text-muted-foreground">{connection.accountEmail}</p>
                    </div>
                    <Badge tone={connection.state === 'connected' ? 'success' : 'destructive'}>
                      {connection.state === 'connected' ? 'Connected' : 'Error'}
                    </Badge>
                  </li>
                ))}
              </ul>
            ) : (
              <div className="mt-4 rounded-[var(--radius-control)] bg-muted/60 p-3.5">
                <p className="text-sm font-medium">Not connected</p>
                <p className="mt-1 text-xs text-muted-foreground">
                  Ask an administrator to configure calendar integration, then connect your account.
                </p>
              </div>
            )}
          </Card>

          <Card className="bg-muted/40">
            <div className="flex gap-3">
              <Clock className="mt-0.5 size-4 shrink-0 text-muted-foreground" aria-hidden />
              <p className="text-xs leading-relaxed text-muted-foreground">
                Existing bookings are never affected by a change here. Removing a working block only stops new bookings
                being taken in it.
              </p>
            </div>
          </Card>
        </aside>
      </div>
    </>
  );
}

export { TrendingUp };
