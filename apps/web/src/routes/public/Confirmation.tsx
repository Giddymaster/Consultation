import { useEffect, useRef, useState } from 'react';
import { Link, useSearchParams } from 'react-router-dom';
import { DateTime } from 'luxon';
import { AlertTriangle, ArrowRight, CalendarPlus, Clock, Download, Loader2, Mail, Video } from 'lucide-react';
import { Badge, Button, Card, EmptyState } from '@/components/ui';
import { Section } from '@/components/marketing';
import { SEO } from '@/components/SEO';
import { useBookingByReference, useVerifyPayment } from '@/lib/queries';
import { formatDuration, money } from '@/lib/utils';

/**
 * Post-payment confirmation.
 *
 * The browser arriving here proves nothing about payment, so the page asks the
 * server to verify the transaction with Paystack before showing any confirmed
 * state. Until that returns, the page says "confirming", not "paid".
 *
 * The meeting link is shown only when the server reports a CREATED meeting. If
 * meeting creation failed, the page says so plainly rather than showing a
 * booking that looks complete but has nothing to join.
 */

export function BookingConfirmationPage() {
  const [params] = useSearchParams();
  const reference = params.get('reference') ?? undefined;
  const paystackReference = params.get('trxref') ?? params.get('reference_paystack') ?? undefined;

  const verifyPayment = useVerifyPayment();
  const { data: booking, isLoading, refetch } = useBookingByReference(reference);

  const toVerify = paystackReference ?? params.get('paystack_reference');

  // Arriving without a reference means there is nothing to wait for, which is
  // known during render — no need to start at false and correct it in an effect.
  const [verified, setVerified] = useState(!toVerify);
  const attempted = useRef(false);

  // Verify once, then refetch the booking to pick up the settled state.
  useEffect(() => {
    if (attempted.current || !toVerify) return;

    attempted.current = true;
    verifyPayment
      .mutateAsync(toVerify)
      .then(() => refetch())
      .catch(() => undefined)
      .finally(() => setVerified(true));
  }, [toVerify, verifyPayment, refetch]);

  const busy = isLoading || !verified || verifyPayment.isPending;

  if (busy) {
    return (
      <Section>
        <div className="mx-auto max-w-md text-center">
          <Loader2 className="mx-auto size-8 animate-spin text-accent" aria-hidden />
          <h1 className="mt-6 text-h2">Confirming your booking</h1>
          <p className="mt-3 text-muted-foreground">
            We are checking your payment with Paystack. This takes a moment — please do not close this page.
          </p>
        </div>
      </Section>
    );
  }

  if (!booking) {
    return (
      <Section>
        <EmptyState
          title="We could not find that booking"
          description="If you have just paid, check your email — the confirmation contains a direct link."
          action={
            <Link to="/portal/bookings">
              <Button>Go to your bookings</Button>
            </Link>
          }
        />
      </Section>
    );
  }

  const paid = booking.paymentStatus === 'PAID' || booking.paymentStatus === 'PARTIALLY_PAID';
  const meetingReady = booking.meeting?.status === 'CREATED' && booking.meeting.joinUrl;
  const meetingFailed = booking.meeting?.status === 'FAILED';
  const when = DateTime.fromISO(booking.startAt).setZone(booking.timezone);

  return (
    <>
      <SEO title="Booking confirmed" path="/book/confirmation" noIndex />

      <Section className="!py-14">
        <div className="mx-auto max-w-2xl">
          <div className="text-center">
            {paid ? (
              <>
                <svg viewBox="0 0 64 64" className="success-ring mx-auto size-16" aria-hidden>
                  <circle cx="32" cy="32" r="30" fill="hsl(var(--success-soft))" />
                  <path
                    className="success-check"
                    d="M20 33l8.5 8.5L45 25"
                    fill="none"
                    stroke="hsl(var(--success))"
                    strokeWidth="4"
                    strokeLinecap="round"
                    strokeLinejoin="round"
                  />
                </svg>
                <h1 className="mt-6 text-h1">You are booked in</h1>
                <p className="mt-3 text-lg text-muted-foreground">
                  A confirmation is on its way to your inbox.
                </p>
              </>
            ) : (
              <>
                <div className="mx-auto flex size-16 items-center justify-center rounded-full bg-warning-soft text-warning">
                  <Clock className="size-8" aria-hidden />
                </div>
                <h1 className="mt-6 text-h1">Payment not yet confirmed</h1>
                <p className="mt-3 text-lg text-muted-foreground">
                  Your slot is held. As soon as your payment settles we will confirm by email.
                </p>
              </>
            )}
          </div>

          <Card className="mt-10">
            <div className="flex items-center justify-between gap-4 border-b border-border pb-5">
              <div>
                <p className="text-eyebrow uppercase text-muted-foreground">Booking reference</p>
                <p className="tabular mt-1 text-lg font-semibold">{booking.reference}</p>
              </div>
              <Badge tone={paid ? 'success' : 'warning'} dot>
                {paid ? 'Confirmed' : 'Awaiting payment'}
              </Badge>
            </div>

            <dl className="mt-5 space-y-3.5 text-sm">
              <Row label="Consultation" value={booking.service.name} />
              <Row label="Consultant" value={booking.consultant.fullName} />
              <Row label="Date" value={when.toFormat('cccc, d LLLL yyyy')} />
              <Row label="Time" value={`${when.toFormat('HH:mm')} ${when.toFormat('ZZZZ')}`} />
              <Row label="Duration" value={formatDuration(booking.durationMinutes)} />
              <Row label="Paid" value={money(booking.amountPaid, booking.currency)} />
              {booking.balance > 0 && (
                <Row label="Balance due before session" value={money(booking.balance, booking.currency)} />
              )}
            </dl>
          </Card>

          {meetingReady && (
            <Card className="mt-5 bg-success-soft">
              <div className="flex items-start gap-4">
                <Video className="mt-0.5 size-5 shrink-0 text-success" aria-hidden />
                <div className="min-w-0 flex-1">
                  <h2 className="font-semibold text-success">Your meeting link is ready</h2>
                  <p className="mt-1 text-sm text-success/80">
                    The same link is in your confirmation email and your portal.
                  </p>
                  <a href={booking.meeting!.joinUrl!} target="_blank" rel="noopener noreferrer" className="mt-4 inline-block">
                    <Button size="sm" iconRight={<ArrowRight className="size-3.5" aria-hidden />}>
                      Join the session
                    </Button>
                  </a>
                </div>
              </div>
            </Card>
          )}

          {meetingFailed && (
            <Card className="mt-5 bg-warning-soft">
              <div className="flex items-start gap-4">
                <AlertTriangle className="mt-0.5 size-5 shrink-0 text-warning" aria-hidden />
                <div>
                  <h2 className="font-semibold text-warning">Your meeting link is still being set up</h2>
                  <p className="mt-1 text-sm text-warning/80">
                    Your booking is confirmed and your slot is held. We hit a problem creating the video meeting, our
                    team has been alerted, and we will email you the link shortly.
                  </p>
                </div>
              </div>
            </Card>
          )}

          <div className="mt-8 flex flex-col gap-3 sm:flex-row">
            <Link to={`/portal/bookings/${booking.id}`} className="flex-1">
              <Button className="w-full" size="lg" iconRight={<ArrowRight className="size-4" aria-hidden />}>
                View my appointment
              </Button>
            </Link>
            <a
              href={buildIcsHref(booking)}
              download={`meridian-${booking.reference}.ics`}
              className="flex-1"
            >
              <Button className="w-full" size="lg" variant="secondary" icon={<CalendarPlus className="size-4" aria-hidden />}>
                Add to calendar
              </Button>
            </a>
          </div>

          <p className="mt-8 flex items-center justify-center gap-2 text-sm text-muted-foreground">
            <Mail className="size-4" aria-hidden />
            Confirmation sent to your registered email address
          </p>
        </div>
      </Section>
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

/**
 * Builds an .ics file client-side.
 *
 * Deliberately excludes the meeting URL: an .ics is often forwarded, and the
 * join link should stay with the person who booked. The description points
 * back to the portal instead.
 */
function buildIcsHref(booking: {
  reference: string;
  startAt: string;
  endAt: string;
  service: { name: string };
  consultant: { fullName: string };
  id: string;
}): string {
  const stamp = (iso: string) => DateTime.fromISO(iso).toUTC().toFormat("yyyyMMdd'T'HHmmss'Z'");

  const lines = [
    'BEGIN:VCALENDAR',
    'VERSION:2.0',
    'PRODID:-//Meridian Advisory//Booking//EN',
    'CALSCALE:GREGORIAN',
    'METHOD:PUBLISH',
    'BEGIN:VEVENT',
    `UID:${booking.reference}@meridianadvisory.co.ke`,
    `DTSTAMP:${stamp(new Date().toISOString())}`,
    `DTSTART:${stamp(booking.startAt)}`,
    `DTEND:${stamp(booking.endAt)}`,
    `SUMMARY:${booking.service.name} with ${booking.consultant.fullName}`,
    `DESCRIPTION:Booking reference ${booking.reference}. Joining details are in your Meridian portal.`,
    'BEGIN:VALARM',
    'TRIGGER:-PT30M',
    'ACTION:DISPLAY',
    'DESCRIPTION:Consultation starts in 30 minutes',
    'END:VALARM',
    'END:VEVENT',
    'END:VCALENDAR',
  ];

  return `data:text/calendar;charset=utf-8,${encodeURIComponent(lines.join('\r\n'))}`;
}

/* -------------------------------------------------------------------------- */
/* Order confirmation                                                         */
/* -------------------------------------------------------------------------- */

export function OrderConfirmationPage() {
  const [params] = useSearchParams();
  const verifyPayment = useVerifyPayment();

  const toVerify = params.get('trxref') ?? params.get('reference');

  // No reference means nothing to confirm, which is known during render.
  const [verified, setVerified] = useState(!toVerify);
  const attempted = useRef(false);

  useEffect(() => {
    if (attempted.current || !toVerify) return;

    attempted.current = true;
    verifyPayment
      .mutateAsync(toVerify)
      .catch(() => undefined)
      .finally(() => setVerified(true));
  }, [toVerify, verifyPayment]);

  if (!verified) {
    return (
      <Section>
        <div className="mx-auto max-w-md text-center">
          <Loader2 className="mx-auto size-8 animate-spin text-accent" aria-hidden />
          <h1 className="mt-6 text-h2">Confirming your order</h1>
        </div>
      </Section>
    );
  }

  return (
    <>
      <SEO title="Order confirmed" path="/shop/confirmation" noIndex />
      <Section className="!py-14">
        <div className="mx-auto max-w-lg text-center">
          <svg viewBox="0 0 64 64" className="success-ring mx-auto size-16" aria-hidden>
            <circle cx="32" cy="32" r="30" fill="hsl(var(--success-soft))" />
            <path
              className="success-check"
              d="M20 33l8.5 8.5L45 25"
              fill="none"
              stroke="hsl(var(--success))"
              strokeWidth="4"
              strokeLinecap="round"
              strokeLinejoin="round"
            />
          </svg>

          <h1 className="mt-6 text-h1">Thank you for your order</h1>
          <p className="mt-3 text-lg text-muted-foreground">
            Your payment has been received. Digital resources are ready in your portal now.
          </p>

          <div className="mt-9 flex flex-col justify-center gap-3 sm:flex-row">
            <Link to="/portal/resources">
              <Button size="lg" icon={<Download className="size-4" aria-hidden />}>
                Open My Resources
              </Button>
            </Link>
            <Link to="/shop">
              <Button size="lg" variant="secondary">
                Continue browsing
              </Button>
            </Link>
          </div>
        </div>
      </Section>
    </>
  );
}
