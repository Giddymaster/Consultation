import { useState } from 'react';
import { Link, useParams } from 'react-router-dom';
import { useForm } from 'react-hook-form';
import { zodResolver } from '@hookform/resolvers/zod';
import {
  AlertTriangle,
  ArrowRight,
  BookOpen,
  Calendar,
  CalendarClock,
  CreditCard,
  Download,
  FileText,
  Receipt,
  Star,
  Video,
  Wallet,
} from 'lucide-react';
import type { z } from 'zod';
import { createReviewSchema } from '@meridian/types';
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
  StatusBadge,
  Textarea,
} from '@/components/ui';
import { PageHeader } from '@/components/layout/DashboardLayout';
import { SEO } from '@/components/SEO';
import {
  useBooking,
  useBookings,
  useCancelBooking,
  useInitializePayment,
  useMyResources,
  usePortalDashboard,
  usePortalInvoices,
  useRequestDownload,
  useSession,
  useSessions,
  useSubmitReview,
} from '@/lib/queries';
import { useToast } from '@/providers/toast-context';
import { ApiError } from '@/lib/api';
import { bookingStatus, cn, formatDate, formatDateTimeWithZone, formatDuration, money, paymentStatus } from '@/lib/utils';

/* -------------------------------------------------------------------------- */
/* Dashboard                                                                  */
/* -------------------------------------------------------------------------- */

export function PortalDashboard() {
  const { data, isLoading } = usePortalDashboard();

  // Optional chaining on `data` alone was not enough: a response without one of
  // these arrays threw on `.length` and took the page down to a white screen.
  // Named here so every use below is genuinely guarded.
  const upcoming = data?.upcoming ?? [];
  const outstandingBookings = data?.outstandingBookings ?? [];
  const recentPurchases = data?.recentPurchases ?? [];
  const pendingReviews = data?.pendingReviews ?? [];

  if (isLoading) {
    return (
      <>
        <PageHeader title="Your portal" />
        <LoadingSkeleton rows={6} />
      </>
    );
  }

  const next = data?.nextSession;

  return (
    <>
      <SEO title="Your portal" noIndex />
      <PageHeader
        title="Your portal"
        description="Your sessions, payments and resources in one place."
        action={
          <Link to="/book">
            <Button icon={<CalendarClock className="size-4" aria-hidden />}>Book a consultation</Button>
          </Link>
        }
      />

      <div className="grid gap-4 sm:grid-cols-2 lg:grid-cols-4">
        <StatCard
          icon={<Calendar className="size-5" aria-hidden />}
          label="Upcoming sessions"
          value={String(data?.upcomingCount ?? 0)}
        />
        <StatCard
          icon={<FileText className="size-5" aria-hidden />}
          label="Completed sessions"
          value={String(data?.totalSessions ?? 0)}
        />
        <StatCard
          icon={<Wallet className="size-5" aria-hidden />}
          label="Outstanding balance"
          value={money(data?.outstandingBalance ?? 0, data?.currency ?? 'KES')}
          tone={(data?.outstandingBalance ?? 0) > 0 ? 'warning' : 'neutral'}
        />
        <StatCard
          icon={<BookOpen className="size-5" aria-hidden />}
          label="Recent purchases"
          value={String(recentPurchases.length)}
        />
      </div>

      {next && (
        <Card className="mt-6">
          <div className="flex flex-wrap items-start justify-between gap-4">
            <div>
              <p className="text-eyebrow uppercase text-accent">Your next session</p>
              <h2 className="mt-2 text-h3">{next.service.name}</h2>
              <p className="mt-1 text-sm text-muted-foreground">
                {formatDateTimeWithZone(next.startAt, next.timezone)} · {formatDuration(next.durationMinutes)}
              </p>

              <div className="mt-4 flex items-center gap-3">
                <Avatar name={next.consultant.fullName} src={next.consultant.avatarUrl} size="sm" />
                <div>
                  <p className="text-sm font-medium">{next.consultant.fullName}</p>
                  <p className="text-xs text-muted-foreground">{next.consultant.title}</p>
                </div>
              </div>
            </div>

            <div className="flex flex-col items-end gap-3">
              <StatusBadge {...bookingStatus(next.status)} />
              <Link to={`/portal/bookings/${next.id}`}>
                <Button size="sm" iconRight={<ArrowRight className="size-3.5" aria-hidden />}>
                  View details
                </Button>
              </Link>
            </div>
          </div>
        </Card>
      )}

      {outstandingBookings.length > 0 && (
        <Card className="mt-6 bg-warning-soft">
          <div className="flex items-start gap-4">
            <AlertTriangle className="mt-0.5 size-5 shrink-0 text-warning" aria-hidden />
            <div className="flex-1">
              <h2 className="font-semibold text-warning">Balance outstanding</h2>
              <p className="mt-1 text-sm text-warning/80">
                Settle the balance on these bookings before your session begins.
              </p>
              <ul className="mt-4 space-y-2">
                {outstandingBookings.map((booking) => (
                  <li key={booking.id}>
                    <Link
                      to={`/portal/bookings/${booking.id}`}
                      className="flex items-center justify-between gap-4 rounded-[var(--radius-control)] bg-card p-3 text-sm transition-colors hover:bg-muted"
                    >
                      <span>
                        <span className="tabular block font-medium">{booking.reference}</span>
                        <span className="text-xs text-muted-foreground">{formatDate(booking.startAt)}</span>
                      </span>
                      <span className="tabular font-semibold">{money(booking.balance, booking.currency)}</span>
                    </Link>
                  </li>
                ))}
              </ul>
            </div>
          </div>
        </Card>
      )}

      {pendingReviews.length > 0 && (
        <Card className="mt-6">
          <CardTitle>How did your recent sessions go?</CardTitle>
          <CardDescription className="mt-1.5">
            Your feedback helps other clients choose well — and helps us improve.
          </CardDescription>
          <ul className="mt-5 space-y-2">
            {pendingReviews.map((pending) => (
              <li
                key={pending.bookingId}
                className="flex flex-wrap items-center justify-between gap-3 rounded-[var(--radius-control)] bg-muted/50 p-3.5"
              >
                <div>
                  <p className="text-sm font-medium">{pending.serviceName}</p>
                  <p className="text-xs text-muted-foreground">with {pending.consultantName}</p>
                </div>
                <Link to={`/portal/reviews/new?booking=${pending.bookingId}`}>
                  <Button size="sm" variant="secondary" icon={<Star className="size-3.5" aria-hidden />}>
                    Leave a review
                  </Button>
                </Link>
              </li>
            ))}
          </ul>
        </Card>
      )}

      {upcoming.length > 1 && (
        <section className="mt-8">
          <h2 className="mb-4 text-h3">Upcoming</h2>
          <div className="space-y-3">
            {upcoming.slice(1).map((booking) => (
              <BookingRow key={booking.id} booking={booking} />
            ))}
          </div>
        </section>
      )}
    </>
  );
}

function StatCard({
  icon,
  label,
  value,
  tone = 'neutral',
}: {
  icon: React.ReactNode;
  label: string;
  value: string;
  tone?: 'neutral' | 'warning';
}) {
  return (
    <Card>
      <div
        className={cn(
          'mb-4 flex size-10 items-center justify-center rounded-[var(--radius-control)]',
          tone === 'warning' ? 'bg-warning-soft text-warning' : 'bg-accent-soft text-accent',
        )}
      >
        {icon}
      </div>
      <p className="tabular text-h3">{value}</p>
      <p className="mt-1 text-sm text-muted-foreground">{label}</p>
    </Card>
  );
}

function BookingRow({ booking }: { booking: import('@meridian/types').BookingSummaryDto }) {
  return (
    <Link to={`/portal/bookings/${booking.id}`} className="block">
      <Card interactive className="flex flex-wrap items-center gap-4">
        <div className="flex min-w-0 flex-1 items-center gap-4">
          <Avatar name={booking.consultant.fullName} src={booking.consultant.avatarUrl} size="sm" />
          <div className="min-w-0">
            <p className="truncate font-medium">{booking.service.name}</p>
            <p className="truncate text-xs text-muted-foreground">
              {formatDateTimeWithZone(booking.startAt, booking.timezone)} · {booking.consultant.fullName}
            </p>
          </div>
        </div>
        <div className="flex items-center gap-3">
          <StatusBadge {...bookingStatus(booking.status)} />
          <ArrowRight className="size-4 text-muted-foreground" aria-hidden />
        </div>
      </Card>
    </Link>
  );
}

/* -------------------------------------------------------------------------- */
/* Bookings                                                                   */
/* -------------------------------------------------------------------------- */

export function PortalBookings() {
  const [status, setStatus] = useState<string>('');
  const { data, isLoading } = useBookings({ pageSize: 50, status: status || undefined });

  return (
    <>
      <SEO title="Your bookings" noIndex />
      <PageHeader
        title="Your bookings"
        description="Every consultation you have booked with us."
        action={
          <Link to="/book">
            <Button icon={<CalendarClock className="size-4" aria-hidden />}>Book a consultation</Button>
          </Link>
        }
      />

      <div className="mb-6 flex flex-wrap gap-2">
        {[
          { value: '', label: 'All' },
          { value: 'CONFIRMED', label: 'Confirmed' },
          { value: 'COMPLETED', label: 'Completed' },
          { value: 'PENDING_PAYMENT', label: 'Awaiting payment' },
          { value: 'CANCELLED', label: 'Cancelled' },
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
          {data.items.map((booking) => (
            <BookingRow key={booking.id} booking={booking} />
          ))}
        </div>
      ) : (
        <EmptyState
          icon={<Calendar className="size-5" aria-hidden />}
          title="No bookings here yet"
          description="When you book a consultation it will appear in this list."
          action={
            <Link to="/book">
              <Button>Book your first consultation</Button>
            </Link>
          }
        />
      )}
    </>
  );
}

export function PortalBookingDetail() {
  const { id } = useParams<{ id: string }>();
  const { data: booking, isLoading } = useBooking(id);
  const cancelBooking = useCancelBooking(id ?? '');
  const initializePayment = useInitializePayment();
  const toast = useToast();

  const [cancelOpen, setCancelOpen] = useState(false);
  const [cancelReason] = useState('');

  if (isLoading) return <LoadingSkeleton rows={8} />;
  if (!booking) {
    return <EmptyState title="Booking not found" description="It may have been removed or the link is out of date." />;
  }

  const payBalance = async () => {
    try {
      const payment = await initializePayment.mutateAsync({
        purpose: 'BALANCE_PAYMENT',
        bookingId: booking.id,
        callbackPath: `/portal/bookings/${booking.id}`,
      });
      window.location.href = payment.authorizationUrl;
    } catch (error) {
      toast.error(
        'Could not start payment',
        error instanceof ApiError ? error.message : 'Please try again shortly.',
      );
    }
  };

  const meetingReady = booking.meeting?.status === 'CREATED' && booking.meeting.joinUrl;

  return (
    <>
      <SEO title={`Booking ${booking.reference}`} noIndex />
      <PageHeader
        title={booking.service.name}
        description={formatDateTimeWithZone(booking.startAt, booking.timezone)}
        breadcrumbs={[
          { label: 'Portal', to: '/portal' },
          { label: 'Bookings', to: '/portal/bookings' },
          { label: booking.reference },
        ]}
        action={
          <>
            {booking.canReschedule && (
              <Link to={`/portal/bookings/${booking.id}/reschedule`}>
                <Button variant="secondary">Reschedule</Button>
              </Link>
            )}
            {booking.canCancel && (
              <Button variant="ghost" onClick={() => setCancelOpen(true)}>
                Cancel booking
              </Button>
            )}
          </>
        }
      />

      <div className="grid gap-6 lg:grid-cols-[1fr_20rem]">
        <div className="space-y-6">
          {meetingReady && (
            <Card className="bg-success-soft">
              <div className="flex flex-wrap items-center justify-between gap-4">
                <div className="flex items-start gap-3">
                  <Video className="mt-0.5 size-5 shrink-0 text-success" aria-hidden />
                  <div>
                    <h2 className="font-semibold text-success">Your meeting is ready</h2>
                    <p className="mt-0.5 text-sm text-success/80">
                      {booking.meeting!.passcode && `Passcode: ${booking.meeting!.passcode}`}
                    </p>
                  </div>
                </div>
                <a href={booking.meeting!.joinUrl!} target="_blank" rel="noopener noreferrer">
                  <Button size="sm">Join session</Button>
                </a>
              </div>
            </Card>
          )}

          {booking.meeting?.status === 'FAILED' && (
            <Card className="bg-warning-soft">
              <div className="flex items-start gap-3">
                <AlertTriangle className="mt-0.5 size-5 shrink-0 text-warning" aria-hidden />
                <div>
                  <h2 className="font-semibold text-warning">Meeting link still being set up</h2>
                  <p className="mt-1 text-sm text-warning/80">{booking.meeting.failureReason}</p>
                </div>
              </div>
            </Card>
          )}

          <Card>
            <CardTitle>Session details</CardTitle>
            <dl className="mt-5 space-y-3.5 text-sm">
              <DetailRow label="Reference" value={booking.reference} />
              <DetailRow label="Service" value={booking.service.name} />
              <DetailRow label="Consultant" value={booking.consultant.fullName} />
              <DetailRow label="Date and time" value={formatDateTimeWithZone(booking.startAt, booking.timezone)} />
              <DetailRow label="Duration" value={formatDuration(booking.durationMinutes)} />
              <DetailRow label="Meeting" value={booking.meetingProvider.replace(/_/g, ' ')} />
            </dl>
          </Card>

          {booking.preparationNotes && (
            <Card className="bg-muted/40">
              <CardTitle>How to prepare</CardTitle>
              <p className="mt-3 text-sm leading-relaxed text-muted-foreground">{booking.preparationNotes}</p>
            </Card>
          )}

          {booking.objective && (
            <Card>
              <CardTitle>What you asked for</CardTitle>
              <p className="mt-3 text-sm leading-relaxed text-muted-foreground">{booking.objective}</p>
            </Card>
          )}

          {booking.sessionId && (
            <Card>
              <CardTitle>Session record</CardTitle>
              <CardDescription className="mt-1.5">
                Your consultant’s write-up of this session.
              </CardDescription>
              <Link to={`/portal/sessions/${booking.sessionId}`} className="mt-4 inline-block">
                <Button variant="secondary" size="sm" iconRight={<ArrowRight className="size-3.5" aria-hidden />}>
                  View session notes
                </Button>
              </Link>
            </Card>
          )}
        </div>

        <aside className="space-y-6">
          <Card>
            <div className="flex items-center justify-between">
              <CardTitle className="text-[0.9375rem]">Status</CardTitle>
              <StatusBadge {...bookingStatus(booking.status)} />
            </div>
            <div className="mt-4 flex items-center justify-between text-sm">
              <span className="text-muted-foreground">Payment</span>
              <StatusBadge {...paymentStatus(booking.paymentStatus)} />
            </div>
          </Card>

          <Card>
            <CardTitle className="text-[0.9375rem]">Payment</CardTitle>
            <dl className="mt-4 space-y-3 text-sm">
              <div className="flex justify-between text-muted-foreground">
                <dt>Consultation</dt>
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
                <dt>Paid</dt>
                <dd className="tabular">{money(booking.amountPaid, booking.currency)}</dd>
              </div>
              {booking.balance > 0 && (
                <div className="flex justify-between font-semibold text-warning">
                  <dt>Balance due</dt>
                  <dd className="tabular">{money(booking.balance, booking.currency)}</dd>
                </div>
              )}
            </dl>

            {booking.canPayBalance && booking.balance > 0 && (
              <Button
                className="mt-5 w-full"
                loading={initializePayment.isPending}
                onClick={() => void payBalance()}
                icon={<CreditCard className="size-4" aria-hidden />}
              >
                Pay balance
              </Button>
            )}
          </Card>

          {booking.payments.length > 0 && (
            <Card>
              <CardTitle className="text-[0.9375rem]">Payment history</CardTitle>
              <ul className="mt-4 space-y-3 text-sm">
                {booking.payments.map((payment) => (
                  <li key={payment.id} className="flex items-start justify-between gap-3">
                    <div className="min-w-0">
                      <p className="tabular truncate text-xs text-muted-foreground">{payment.reference}</p>
                      <p className="text-xs text-muted-foreground">
                        {payment.paidAt ? formatDate(payment.paidAt) : 'Not settled'}
                      </p>
                    </div>
                    <div className="text-right">
                      <p className="tabular font-medium">{money(payment.amount, payment.currency)}</p>
                      <StatusBadge {...paymentStatus(payment.status)} />
                    </div>
                  </li>
                ))}
              </ul>
            </Card>
          )}

          {booking.cancellationPolicy && (
            <Card className="bg-muted/40">
              <CardTitle className="text-[0.9375rem]">Cancellation policy</CardTitle>
              <p className="mt-2.5 text-xs leading-relaxed text-muted-foreground">{booking.cancellationPolicy}</p>
            </Card>
          )}
        </aside>
      </div>

      <ConfirmDialog
        open={cancelOpen}
        onClose={() => setCancelOpen(false)}
        onConfirm={() => {
          cancelBooking.mutate(
            { reason: cancelReason || undefined, requestRefund: booking.amountPaid > 0 },
            {
              onSuccess: () => {
                setCancelOpen(false);
                toast.success('Booking cancelled', 'A confirmation email is on its way.');
              },
              onError: (error) =>
                toast.error(
                  'Could not cancel',
                  error instanceof ApiError ? error.message : 'Please try again.',
                ),
            },
          );
        }}
        title="Cancel this booking?"
        description={
          booking.amountPaid > 0
            ? 'We will review your payment against the cancellation policy and be in touch about any refund due.'
            : 'This will release your slot. You can book again at any time.'
        }
        confirmLabel="Cancel booking"
        tone="destructive"
        loading={cancelBooking.isPending}
      />
    </>
  );
}

function DetailRow({ label, value }: { label: string; value: string }) {
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

export function PortalSessions() {
  const { data, isLoading } = useSessions({ pageSize: 50 });

  return (
    <>
      <SEO title="Your sessions" noIndex />
      <PageHeader title="Your sessions" description="Records of consultations you have completed." />

      {isLoading ? (
        <LoadingSkeleton rows={5} />
      ) : data && data.items.length > 0 ? (
        <div className="space-y-3">
          {data.items.map((session) => (
            <Link key={session.id} to={`/portal/sessions/${session.id}`} className="block">
              <Card interactive className="flex flex-wrap items-center gap-4">
                <div className="min-w-0 flex-1">
                  <p className="truncate font-medium">{session.booking.service.name}</p>
                  <p className="truncate text-xs text-muted-foreground">
                    {formatDate(session.booking.startAt)} · {session.booking.consultant.fullName}
                  </p>
                </div>
                {session.sharedNotes ? (
                  <Badge tone="success">Notes available</Badge>
                ) : (
                  <Badge tone="neutral">Notes pending</Badge>
                )}
                <ArrowRight className="size-4 text-muted-foreground" aria-hidden />
              </Card>
            </Link>
          ))}
        </div>
      ) : (
        <EmptyState
          icon={<FileText className="size-5" aria-hidden />}
          title="No completed sessions yet"
          description="Once you have attended a consultation, its record will appear here."
        />
      )}
    </>
  );
}

export function PortalSessionDetail() {
  const { id } = useParams<{ id: string }>();
  const { data: session, isLoading } = useSession(id);

  if (isLoading) return <LoadingSkeleton rows={8} />;
  if (!session) return <EmptyState title="Session not found" />;

  const notes = session.sharedNotes;

  return (
    <>
      <SEO title="Session record" noIndex />
      <PageHeader
        title={session.booking.service.name}
        description={formatDateTimeWithZone(session.booking.startAt, session.booking.timezone)}
        breadcrumbs={[
          { label: 'Portal', to: '/portal' },
          { label: 'Sessions', to: '/portal/sessions' },
          { label: 'Record' },
        ]}
      />

      <div className="grid gap-6 lg:grid-cols-[1fr_18rem]">
        <div className="space-y-6">
          {notes ? (
            <>
              {notes.objective && (
                <Card>
                  <CardTitle>Session objective</CardTitle>
                  <p className="mt-3 text-sm leading-relaxed text-muted-foreground">{notes.objective}</p>
                </Card>
              )}
              {notes.discussionSummary && (
                <Card>
                  <CardTitle>What we discussed</CardTitle>
                  <p className="mt-3 text-sm leading-relaxed text-muted-foreground">{notes.discussionSummary}</p>
                </Card>
              )}
              {notes.keyFindings && (
                <Card>
                  <CardTitle>Key findings</CardTitle>
                  <p className="mt-3 text-sm leading-relaxed text-muted-foreground">{notes.keyFindings}</p>
                </Card>
              )}
              {notes.recommendations && (
                <Card>
                  <CardTitle>Recommendations</CardTitle>
                  <p className="mt-3 text-sm leading-relaxed text-muted-foreground">{notes.recommendations}</p>
                </Card>
              )}

              {notes.actionItems.length > 0 && (
                <Card>
                  <CardTitle>Action items</CardTitle>
                  <ul className="mt-4 space-y-3">
                    {notes.actionItems.map((item, index) => (
                      <li key={index} className="flex items-start gap-3 text-sm">
                        <span
                          className={cn(
                            'mt-0.5 flex size-5 shrink-0 items-center justify-center rounded-full text-[0.625rem] font-semibold',
                            item.completed ? 'bg-success text-success-foreground' : 'bg-muted text-muted-foreground',
                          )}
                          aria-hidden
                        >
                          {item.completed ? '✓' : index + 1}
                        </span>
                        <span className="flex-1">
                          <span className={cn(item.completed && 'text-muted-foreground line-through')}>
                            {item.description}
                          </span>
                          <span className="mt-0.5 block text-xs text-muted-foreground">
                            Owner: {item.owner === 'CLIENT' ? 'You' : 'Your consultant'}
                            {item.dueDate && ` · due ${formatDate(item.dueDate)}`}
                          </span>
                        </span>
                      </li>
                    ))}
                  </ul>
                </Card>
              )}
            </>
          ) : (
            <EmptyState
              icon={<FileText className="size-5" aria-hidden />}
              title="Notes not yet shared"
              description="Your consultant is still writing up this session. You will be notified as soon as it is available."
            />
          )}
        </div>

        <aside className="space-y-6">
          <Card>
            <CardTitle className="text-[0.9375rem]">Consultant</CardTitle>
            <div className="mt-4 flex items-center gap-3">
              <Avatar
                name={session.booking.consultant.fullName}
                src={session.booking.consultant.avatarUrl}
                size="md"
              />
              <div>
                <p className="text-sm font-medium">{session.booking.consultant.fullName}</p>
                <p className="text-xs text-muted-foreground">{session.booking.consultant.title}</p>
              </div>
            </div>
          </Card>

          {notes?.followUpDate && (
            <Card className="bg-accent-soft">
              <CardTitle className="text-[0.9375rem] text-accent">Follow-up suggested</CardTitle>
              <p className="mt-2 text-sm text-accent/80">{formatDate(notes.followUpDate)}</p>
              <Link to="/book" className="mt-4 inline-block">
                <Button size="sm" variant="accent">
                  Book a follow-up
                </Button>
              </Link>
            </Card>
          )}

          <Link to={`/portal/bookings/${session.bookingId}`}>
            <Button variant="secondary" className="w-full">
              View booking
            </Button>
          </Link>
        </aside>
      </div>
    </>
  );
}

/* -------------------------------------------------------------------------- */
/* Invoices, resources, reviews                                               */
/* -------------------------------------------------------------------------- */

export function PortalInvoices() {
  const { data, isLoading } = usePortalInvoices();

  return (
    <>
      <SEO title="Your invoices" noIndex />
      <PageHeader title="Invoices" description="Every payment produces a numbered invoice you can download." />

      {isLoading ? (
        <LoadingSkeleton rows={5} />
      ) : data && data.length > 0 ? (
        <Card padded={false} className="overflow-hidden">
          <div className="overflow-x-auto scroll-slim">
            <table className="w-full text-sm">
              <thead>
                <tr className="border-b border-border text-left text-xs text-muted-foreground">
                  <th className="px-5 py-3 font-medium">Invoice</th>
                  <th className="px-5 py-3 font-medium">For</th>
                  <th className="px-5 py-3 font-medium">Issued</th>
                  <th className="px-5 py-3 text-right font-medium">Total</th>
                  <th className="px-5 py-3 text-right font-medium">Status</th>
                </tr>
              </thead>
              <tbody>
                {data.map((invoice) => {
                  const row = invoice as Record<string, string | number | null>;
                  return (
                    <tr key={String(row.id)} className="border-b border-border last:border-0">
                      <td className="tabular px-5 py-4 font-medium">{String(row.number)}</td>
                      <td className="px-5 py-4 text-muted-foreground">{String(row.serviceName ?? 'Resources')}</td>
                      <td className="px-5 py-4 text-muted-foreground">
                        {row.issuedAt ? formatDate(String(row.issuedAt)) : '—'}
                      </td>
                      <td className="tabular px-5 py-4 text-right font-medium">
                        {money(Number(row.total), String(row.currency))}
                      </td>
                      <td className="px-5 py-4 text-right">
                        <Badge tone={row.status === 'PAID' ? 'success' : 'warning'}>{String(row.status)}</Badge>
                      </td>
                    </tr>
                  );
                })}
              </tbody>
            </table>
          </div>
        </Card>
      ) : (
        <EmptyState icon={<Receipt className="size-5" aria-hidden />} title="No invoices yet" />
      )}
    </>
  );
}

export function PortalResources() {
  const { data, isLoading } = useMyResources();
  const requestDownload = useRequestDownload();
  const toast = useToast();

  const download = async (entitlementId: string) => {
    try {
      const result = await requestDownload.mutateAsync(entitlementId);
      // The URL is short-lived and single-purpose; open it immediately.
      window.open(result.url, '_blank', 'noopener,noreferrer');
    } catch (error) {
      toast.error(
        'Download unavailable',
        error instanceof ApiError ? error.message : 'Please try again shortly.',
      );
    }
  };

  return (
    <>
      <SEO title="My resources" noIndex />
      <PageHeader
        title="My resources"
        description="Books, reports and templates you have purchased. Download links are generated fresh each time."
      />

      {isLoading ? (
        <LoadingSkeleton rows={4} />
      ) : data && data.length > 0 ? (
        <div className="grid gap-4 sm:grid-cols-2">
          {data.map((entitlement) => (
            <Card key={entitlement.entitlementId} className="flex gap-4">
              <div className="size-16 shrink-0 overflow-hidden rounded-[var(--radius-control)] bg-accent-soft">
                {entitlement.product.coverImageUrl ? (
                  <img src={entitlement.product.coverImageUrl} alt="" className="size-full object-cover" />
                ) : (
                  <span className="flex size-full items-center justify-center text-accent">
                    <BookOpen className="size-6" aria-hidden />
                  </span>
                )}
              </div>

              <div className="min-w-0 flex-1">
                <p className="truncate font-medium">{entitlement.product.name}</p>
                <p className="mt-0.5 text-xs text-muted-foreground">
                  Purchased {formatDate(entitlement.purchasedAt)} · {entitlement.orderReference}
                </p>
                {entitlement.downloadCount > 0 && (
                  <p className="mt-0.5 text-xs text-muted-foreground">
                    Downloaded {entitlement.downloadCount} time{entitlement.downloadCount === 1 ? '' : 's'}
                  </p>
                )}

                <Button
                  size="sm"
                  variant="secondary"
                  className="mt-3"
                  icon={<Download className="size-3.5" aria-hidden />}
                  loading={requestDownload.isPending}
                  onClick={() => void download(entitlement.entitlementId)}
                >
                  Download
                </Button>
              </div>
            </Card>
          ))}
        </div>
      ) : (
        <EmptyState
          icon={<BookOpen className="size-5" aria-hidden />}
          title="No resources yet"
          description="Books, reports and templates you buy will appear here, ready to download."
          action={
            <Link to="/shop">
              <Button>Browse resources</Button>
            </Link>
          }
        />
      )}
    </>
  );
}

export function PortalNewReview() {
  const params = new URLSearchParams(window.location.search);
  const bookingId = params.get('booking') ?? '';
  const submitReview = useSubmitReview();
  const toast = useToast();
  const [done, setDone] = useState(false);
  const [rating, setRating] = useState(5);

  const form = useForm<z.input<typeof createReviewSchema>, unknown, z.output<typeof createReviewSchema>>({
    resolver: zodResolver(createReviewSchema),
    defaultValues: { bookingId, rating: 5, body: '', isAnonymous: false },
  });

  const onSubmit = form.handleSubmit(async (values) => {
    try {
      await submitReview.mutateAsync({ ...values, rating });
      setDone(true);
      toast.success('Thank you', 'Your review will appear once it has been moderated.');
    } catch (error) {
      toast.error(
        'Could not submit review',
        error instanceof ApiError ? error.message : 'Please try again.',
      );
    }
  });

  if (done) {
    return (
      <>
        <PageHeader title="Thank you" />
        <Card className="max-w-lg text-center">
          <Star className="mx-auto size-10 text-warning" aria-hidden />
          <h2 className="mt-4 text-h3">Your review has been submitted</h2>
          <p className="mt-2 text-sm text-muted-foreground">
            Reviews are moderated before publication. We never edit what you wrote.
          </p>
          <Link to="/portal" className="mt-6 inline-block">
            <Button variant="secondary">Back to your portal</Button>
          </Link>
        </Card>
      </>
    );
  }

  return (
    <>
      <SEO title="Leave a review" noIndex />
      <PageHeader title="How did it go?" description="Your feedback helps other clients choose well." />

      <Card className="max-w-2xl">
        <form onSubmit={onSubmit} className="space-y-6" noValidate>
          <fieldset>
            <legend className="mb-3 text-sm font-medium">Overall rating</legend>
            <div className="flex gap-2">
              {[1, 2, 3, 4, 5].map((value) => (
                <button
                  key={value}
                  type="button"
                  onClick={() => setRating(value)}
                  aria-label={`${value} star${value === 1 ? '' : 's'}`}
                  aria-pressed={rating === value}
                  className="transition-transform hover:scale-110 motion-reduce:hover:scale-100"
                >
                  <svg
                    viewBox="0 0 20 20"
                    className={cn('size-8', value <= rating ? 'text-warning' : 'text-border')}
                    fill="currentColor"
                    aria-hidden
                  >
                    <path d="M10 1.5l2.6 5.3 5.9.9-4.3 4.1 1 5.8-5.2-2.7-5.2 2.7 1-5.8L1.5 7.7l5.9-.9L10 1.5z" />
                  </svg>
                </button>
              ))}
            </div>
          </fieldset>

          <Field label="Headline" hint="Optional" error={form.formState.errors.title?.message}>
            {({ id }) => <Input id={id} placeholder="Sum it up in a few words" {...form.register('title')} />}
          </Field>

          <Field label="Your review" required error={form.formState.errors.body?.message}>
            {({ id, invalid }) => (
              <Textarea
                id={id}
                rows={6}
                invalid={invalid}
                placeholder="What did you come in with, and what did you leave with?"
                {...form.register('body')}
              />
            )}
          </Field>

          <div className="flex items-center gap-3">
            <input
              id="anonymous"
              type="checkbox"
              className="size-4 rounded accent-[hsl(var(--accent))]"
              {...form.register('isAnonymous')}
            />
            <label htmlFor="anonymous" className="text-sm">
              Publish this review anonymously
            </label>
          </div>

          <Button type="submit" size="lg" loading={form.formState.isSubmitting}>
            Submit review
          </Button>
        </form>
      </Card>
    </>
  );
}
