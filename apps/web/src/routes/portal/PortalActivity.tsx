import { useState } from 'react';
import { Link, useNavigate, useParams } from 'react-router-dom';
import { DateTime } from 'luxon';
import {
  AlertTriangle,
  ArrowLeft,
  CalendarClock,
  CreditCard,
  MessageSquareQuote,
  Wallet,
} from 'lucide-react';
import type { PaymentSummaryDto } from '@meridian/types';
import {
  Badge,
  Button,
  Card,
  CardTitle,
  EmptyState,
  Field,
  Input,
  LoadingSkeleton,
  Rating,
  StatusBadge,
} from '@/components/ui';
import { DataTable, Pagination, type Column } from '@/components/admin/DataTable';
import { BookingCalendar, TimeSlotPicker } from '@/components/booking/BookingCalendar';
import { useCalendarMonth } from '@/lib/use-calendar-month';
import { PageHeader } from '@/components/layout/DashboardLayout';
import { SEO } from '@/components/SEO';
import {
  useAvailability,
  useBooking,
  useMyReviews,
  usePayments,
  useRescheduleBooking,
  type MyReview,
} from '@/lib/queries';
import { useToast } from '@/providers/toast-context';
import { ApiError } from '@/lib/api';
import {
  browserTimezone,
  formatDate,
  formatDateTimeWithZone,
  formatDuration,
  humanise,
  money,
  paymentStatus,
} from '@/lib/utils';
/* -------------------------------------------------------------------------- */
/* Payments                                                                   */
/* -------------------------------------------------------------------------- */
interface PortalPayment extends PaymentSummaryDto {
  customerEmail: string | null;
  booking: { id: string; reference: string; serviceName: string; clientName: string } | null;
}
/**
 * The client's own payment history.
 *
 * `/api/payments` pins the result to the caller's own rows unless they hold the
 * broad `payments.read` permission, so this page needs no filter of its own —
 * and could not widen the scope even if one were added to the query string.
 */
export function PortalPayments() {
  const [page, setPage] = useState(1);
  const { data, isLoading } = usePayments({ page, pageSize: 20 });
  const rows = (data?.items ?? []) as unknown as PortalPayment[];
  const columns: Column<PortalPayment>[] = [
    {
      key: 'reference',
      header: 'Reference',
      render: (row) => <span className="tabular text-sm font-medium">{row.reference}</span>,
    },
    {
      key: 'purpose',
      header: 'For',
      render: (row) => (
        <div className="min-w-0">
          <p className="truncate text-sm">{row.booking?.serviceName ?? humanise(row.purpose)}</p>
          <p className="text-xs text-muted-foreground">{humanise(row.purpose)}</p>
        </div>
      ),
    },
    {
      key: 'date',
      header: 'Date',
      render: (row) => (
        <span className="text-sm text-muted-foreground">{formatDate(row.paidAt ?? row.createdAt)}</span>
      ),
    },
    {
      key: 'status',
      header: 'Status',
      render: (row) => {
        const presentation = paymentStatus(row.status);
        return <StatusBadge label={presentation.label} tone={presentation.tone} />;
      },
    },
    {
      key: 'amount',
      header: 'Amount',
      numeric: true,
      render: (row) => (
        <div>
          <span className="tabular font-medium">{money(row.amount, row.currency)}</span>
          {row.refundedAmount > 0 && (
            <p className="tabular text-xs text-muted-foreground">
              −{money(row.refundedAmount, row.currency)} refunded
            </p>
          )}
        </div>
      ),
    },
  ];
  const totals = data?.totals;
  return (
    <>
      <SEO title="Payments" noIndex />
      <PageHeader
        title="Payments"
        description="Every charge on your account, and what it paid for."
        breadcrumbs={[{ label: 'Portal', to: '/portal' }, { label: 'Payments' }]}
        action={
          <Link to="/portal/invoices">
            <Button variant="secondary">View invoices</Button>
          </Link>
        }
      />
      {totals && (
        <div className="mb-6 grid gap-4 sm:grid-cols-3">
          {[
            { label: 'Total paid', value: totals.collected, icon: <Wallet className="size-4" aria-hidden /> },
            { label: 'Refunded', value: totals.refunded, icon: <CreditCard className="size-4" aria-hidden /> },
            {
              label: 'Net',
              value: totals.collected - totals.refunded,
              icon: <Wallet className="size-4" aria-hidden />,
            },
          ].map((stat) => (
            <Card key={stat.label}>
              <div className="flex items-center gap-2 text-xs font-medium tracking-wide text-muted-foreground uppercase">
                {stat.icon}
                {stat.label}
              </div>
              <p className="tabular mt-2 text-2xl font-semibold">{money(stat.value)}</p>
            </Card>
          ))}
        </div>
      )}
      <DataTable
        columns={columns}
        rows={rows}
        loading={isLoading}
        rowKey={(row) => row.id}
        cardTitle={(row) => row.booking?.serviceName ?? humanise(row.purpose)}
        empty={{
          icon: <CreditCard />,
          title: 'No payments yet',
          description: 'Charges appear here as soon as a booking is paid.',
        }}
        footer={
          data ? (
            <Pagination page={data.meta.page} pageSize={data.meta.pageSize} total={data.meta.total} onPageChange={setPage} />
          ) : null
        }
      />
    </>
  );
}
/* -------------------------------------------------------------------------- */
/* Reviews                                                                    */
/* -------------------------------------------------------------------------- */
const REVIEW_STATUS: Record<MyReview['status'], { label: string; tone: 'success' | 'warning' | 'neutral'; note: string }> = {
  APPROVED: { label: 'Published', tone: 'success', note: 'Visible on the public site.' },
  PENDING: { label: 'In review', tone: 'warning', note: 'A moderator is reading it. Nothing is public yet.' },
  REJECTED: { label: 'Not published', tone: 'neutral', note: 'This review was not published.' },
};
export function PortalReviews() {
  const [page, setPage] = useState(1);
  const { data, isLoading } = useMyReviews({ page, pageSize: 10 });
  const reviews = data?.items ?? [];
  return (
    <>
      <SEO title="Your reviews" noIndex />
      <PageHeader
        title="Your reviews"
        description="What you have written, and where each one stands."
        breadcrumbs={[{ label: 'Portal', to: '/portal' }, { label: 'Reviews' }]}
      />
      {isLoading ? (
        <LoadingSkeleton rows={5} />
      ) : reviews.length === 0 ? (
        <EmptyState
          icon={<MessageSquareQuote />}
          title="You have not written a review yet"
          description="After a completed session you will be invited to review it from the session record."
          action={
            <Link to="/portal/sessions">
              <Button variant="secondary">View sessions</Button>
            </Link>
          }
        />
      ) : (
        <div className="space-y-4">
          {reviews.map((review) => {
            const status = REVIEW_STATUS[review.status];
            return (
              <Card key={review.id}>
                <div className="flex flex-wrap items-start justify-between gap-4">
                  <div className="min-w-0">
                    <div className="flex flex-wrap items-center gap-3">
                      <Rating value={review.rating} />
                      <StatusBadge label={status.label} tone={status.tone} />
                      {review.isAnonymous && <Badge tone="neutral">Anonymous</Badge>}
                    </div>
                    {review.title && <h2 className="mt-3 font-semibold">{review.title}</h2>}
                    <p className="mt-1.5 text-sm leading-relaxed text-muted-foreground">{review.body}</p>
                    <p className="mt-3 text-xs text-muted-foreground">
                      {[review.serviceName, review.consultantName].filter(Boolean).join(' · ')}
                      {' · '}
                      {formatDate(review.createdAt)}
                    </p>
                  </div>
                  <Link to={`/portal/bookings/${review.bookingId}`} className="shrink-0">
                    <Button variant="ghost" size="sm">
                      View booking
                    </Button>
                  </Link>
                </div>
                <p className="mt-4 border-t border-border pt-3 text-xs text-muted-foreground">{status.note}</p>
                {review.moderationNote && (
                  <p className="mt-2 text-xs text-muted-foreground">
                    <span className="font-medium text-foreground">Reason given: </span>
                    {review.moderationNote}
                  </p>
                )}
              </Card>
            );
          })}
          {data && (
            <Pagination page={data.meta.page} pageSize={data.meta.pageSize} total={data.meta.total} onPageChange={setPage} />
          )}
        </div>
      )}
    </>
  );
}
/* -------------------------------------------------------------------------- */
/* Reschedule                                                                 */
/* -------------------------------------------------------------------------- */
/**
 * Moving an existing booking to a new slot.
 *
 * The calendar is fed by the same public availability endpoint the booking
 * wizard uses, so a slot offered here is one the server would accept. It still
 * re-checks on submit — a slot can be taken between rendering and clicking, and
 * the browser's view of availability is never the authority.
 *
 * One screen serves both audiences. The API already decides who may move a
 * booking (`assertCanAccessBooking`), and a consultant is allowed to move past
 * the client-facing window, so the only thing that differs here is where the
 * breadcrumbs and the confirmation lead back to.
 */
interface RescheduleArea {
  /** Where the trail returns to. */
  homeLabel: string;
  homePath: string;
  bookingPath: (bookingId: string) => string;
}
const PORTAL_AREA: RescheduleArea = {
  homeLabel: 'Portal',
  homePath: '/portal',
  bookingPath: (bookingId) => `/portal/bookings/${bookingId}`,
};
const CONSULTANT_AREA: RescheduleArea = {
  homeLabel: 'Workspace',
  homePath: '/consultant',
  bookingPath: (bookingId) => `/consultant/sessions?booking=${bookingId}`,
};
export function PortalReschedule() {
  return <RescheduleBooking area={PORTAL_AREA} />;
}
export function ConsultantReschedule() {
  return <RescheduleBooking area={CONSULTANT_AREA} />;
}
function RescheduleBooking({ area }: { area: RescheduleArea }) {
  const { id } = useParams<{ id: string }>();
  const navigate = useNavigate();
  const toast = useToast();
  const { data: booking, isLoading } = useBooking(id);
  const reschedule = useRescheduleBooking(id ?? '');
  const timezone = booking?.timezone ?? browserTimezone();
  const [month, setMonth] = useCalendarMonth(timezone);
  const [selectedDate, setSelectedDate] = useState<string | null>(null);
  const [selectedSlot, setSelectedSlot] = useState<string | null>(null);
  const [reason, setReason] = useState('');
  const monthStart = DateTime.fromISO(month, { zone: timezone });
  const today = DateTime.now().setZone(timezone);
  const windowFrom = (monthStart < today.startOf('month') ? today : monthStart).toISODate() ?? undefined;
  const windowTo = monthStart.endOf('month').toISODate() ?? undefined;
  const { data: availability, isFetching: availabilityLoading } = useAvailability({
    serviceId: booking?.service.id,
    consultantId: booking?.consultant.id,
    durationMinutes: booking?.durationMinutes,
    from: windowFrom,
    to: windowTo,
    timezone,
  });
  if (isLoading) return <LoadingSkeleton rows={8} />;
  if (!booking) {
    return <EmptyState title="Booking not found" description="It may have been removed or the link is out of date." />;
  }
  const isPortal = area === PORTAL_AREA;
  if (isPortal && !booking.canReschedule) {
    return (
      <>
        <SEO title="Reschedule" noIndex />
        <PageHeader
          title="This booking cannot be rescheduled"
          breadcrumbs={[
            { label: area.homeLabel, to: area.homePath },
            { label: booking.reference },
          ]}
        />
        <Card className="bg-warning-soft">
          <div className="flex items-start gap-3">
            <AlertTriangle className="mt-0.5 size-5 shrink-0 text-warning" aria-hidden />
            <div>
              <h2 className="font-semibold text-warning">Outside the reschedule window</h2>
              <p className="mt-1 text-sm text-warning/80">
                This session can be moved up to {booking.rescheduleWindowHours} hours before it starts. Contact us
                and we will find a way forward together.
              </p>
              <div className="mt-4 flex flex-wrap gap-3">
                <Link to={area.bookingPath(booking.id)}>
                  <Button variant="secondary" size="sm">
                    Back to booking
                  </Button>
                </Link>
                <Link to="/contact">
                  <Button variant="ghost" size="sm">
                    Contact us
                  </Button>
                </Link>
              </div>
            </div>
          </div>
        </Card>
      </>
    );
  }
  const daySlots = availability?.days.find((day) => day.date === selectedDate)?.slots ?? [];
  const submit = async () => {
    if (!selectedSlot) return;
    try {
      await reschedule.mutateAsync({ startAt: selectedSlot, timezone, reason: reason.trim() || undefined });
      toast.success('Booking moved', 'Everyone on the booking has been notified and the meeting link updated.');
      void navigate(area.bookingPath(booking.id));
    } catch (error) {
      toast.error(
        'Could not move this booking',
        error instanceof ApiError ? error.message : 'That time may have just been taken. Try another slot.',
      );
    }
  };
  return (
    <>
      <SEO title={`Reschedule ${booking.reference}`} noIndex />
      <PageHeader
        title="Reschedule"
        description={booking.service.name}
        breadcrumbs={[
          { label: area.homeLabel, to: area.homePath },
          { label: booking.reference, to: area.bookingPath(booking.id) },
          { label: 'Reschedule' },
        ]}
        action={
          <Link to={area.bookingPath(booking.id)}>
            <Button variant="ghost" icon={<ArrowLeft className="size-4" aria-hidden />}>
              Cancel
            </Button>
          </Link>
        }
      />
      <Card className="mb-6">
        <div className="flex flex-wrap items-center gap-x-8 gap-y-3">
          <div>
            <p className="text-xs font-medium tracking-wide text-muted-foreground uppercase">Currently</p>
            <p className="mt-1 font-medium">{formatDateTimeWithZone(booking.startAt, timezone)}</p>
          </div>
          <div>
            <p className="text-xs font-medium tracking-wide text-muted-foreground uppercase">With</p>
            <p className="mt-1 font-medium">{booking.consultant.fullName}</p>
          </div>
          <div>
            <p className="text-xs font-medium tracking-wide text-muted-foreground uppercase">Length</p>
            <p className="mt-1 font-medium">{formatDuration(booking.durationMinutes)}</p>
          </div>
        </div>
      </Card>
      <div className="grid gap-6 lg:grid-cols-2">
        <Card>
          <BookingCalendar
            availability={availability}
            loading={availabilityLoading}
            selectedDate={selectedDate}
            onSelectDate={(date) => {
              setSelectedDate(date);
              setSelectedSlot(null);
            }}
            month={month}
            onMonthChange={setMonth}
            timezone={timezone}
          />
        </Card>
        <Card>
          <CardTitle className="text-base">
            {selectedDate ? DateTime.fromISO(selectedDate).toFormat('cccc d LLLL') : 'Pick a new date'}
          </CardTitle>
          {/* The slot picker prints the timezone and session length itself, so
              repeating it here would only say the same thing twice. */}
          <div className="mt-5">
            {selectedDate ? (
              <TimeSlotPicker
                slots={daySlots}
                selected={selectedSlot}
                onSelect={setSelectedSlot}
                loading={availabilityLoading}
                timezone={timezone}
                durationMinutes={booking.durationMinutes}
              />
            ) : (
              <p className="py-10 text-center text-sm text-muted-foreground">
                Choose a highlighted date to see available times.
              </p>
            )}
          </div>
        </Card>
      </div>
      <Card className="mt-6">
        <Field label="Reason for moving this session" hint="Optional — shared with your consultant.">
          {({ id: fieldId }) => (
            <Input
              id={fieldId}
              value={reason}
              onChange={(event) => setReason(event.target.value)}
              maxLength={500}
              placeholder="A short note, if you would like to explain"
            />
          )}
        </Field>
        <div className="mt-5 flex flex-wrap items-center gap-4">
          <Button
            size="lg"
            disabled={!selectedSlot}
            loading={reschedule.isPending}
            onClick={submit}
            icon={<CalendarClock className="size-4" aria-hidden />}
          >
            Confirm new time
          </Button>
          {selectedSlot && (
            <p className="text-sm text-muted-foreground">
              Moving to <span className="font-medium text-foreground">{formatDateTimeWithZone(selectedSlot, timezone)}</span>
            </p>
          )}
        </div>
        <p className="mt-4 text-xs text-muted-foreground">
          Rescheduling keeps the same price and payment. If a video meeting was already created, its link is
          moved to the new time.
          {!isPortal && booking.canReschedule === false
            ? ' This booking is inside the client-facing reschedule window; as the consultant you can still move it.'
            : ''}
        </p>
      </Card>
    </>
  );
}
