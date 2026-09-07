import { useEffect, useMemo, useState } from 'react';
import { useNavigate, useSearchParams } from 'react-router-dom';
import { DateTime } from 'luxon';
import { useForm } from 'react-hook-form';
import { zodResolver } from '@hookform/resolvers/zod';
import {
  AlertTriangle,
  ArrowLeft,
  ArrowRight,
  Building2,
  Calendar,
  CalendarClock,
  Check,
  ChevronRight,
  Clock,
  CreditCard,
  Info,
  Lock,
  Monitor,
  Phone,
  ShieldCheck,
  User,
  Users,
  Video,
} from 'lucide-react';
import {
  clientDetailsSchema,
  type ClientDetails,
  type MeetingProvider,
  type ServiceDetailDto,
  type ConsultantSummaryDto,
} from '@meridian/types';
import {
  Avatar,
  Badge,
  Button,
  Card,
  ErrorSummary,
  Field,
  Input,
  LoadingSkeleton,
  Progress,
  Rating,
  Textarea,
} from '@/components/ui';
import { BookingCalendar, TimeSlotPicker } from '@/components/booking/BookingCalendar';
import { DiscountField } from '@/components/booking/DiscountField';
import { useCalendarMonth } from '@/lib/use-calendar-month';
import { SEO } from '@/components/SEO';
import {
  useAvailability,
  useCreateBooking,
  usePreviewDiscount,
  useInitializePayment,
  useService,
  useServices,
} from '@/lib/queries';
import { useAuth } from '@/providers/auth-context';
import { useToast } from '@/providers/toast-context';
import { ApiError } from '@/lib/api';
import { browserTimezone, cn, formatDuration, money, idempotencyKey, clearIdempotencyKey } from '@/lib/utils';

/**
 * Booking wizard.
 *
 * Desktop is a three-column working surface — context on the left, the active
 * step in the centre, a live summary on the right. Mobile is a genuine
 * step-by-step wizard with a progress bar and a sticky action bar, not the
 * desktop layout squeezed narrow.
 *
 * The price shown in the summary is *display only*: it is recomputed on the
 * server when the booking is created, and again when payment is initialised.
 */

type StepId = 'service' | 'consultant' | 'duration' | 'schedule' | 'platform' | 'details' | 'review';

const STEPS: { id: StepId; label: string; shortLabel: string }[] = [
  { id: 'service', label: 'Choose a service', shortLabel: 'Service' },
  { id: 'consultant', label: 'Choose a consultant', shortLabel: 'Consultant' },
  { id: 'duration', label: 'Select duration', shortLabel: 'Duration' },
  { id: 'schedule', label: 'Pick a date and time', shortLabel: 'Time' },
  { id: 'platform', label: 'How would you like to meet?', shortLabel: 'Platform' },
  { id: 'details', label: 'Your details', shortLabel: 'Details' },
  { id: 'review', label: 'Review and pay', shortLabel: 'Review' },
];

const PROVIDER_META: Record<MeetingProvider, { label: string; description: string; icon: typeof Video }> = {
  ZOOM: { label: 'Zoom', description: 'A Zoom link is issued once payment clears.', icon: Video },
  GOOGLE_MEET: { label: 'Google Meet', description: 'Join from your browser, no download needed.', icon: Monitor },
  MICROSOFT_TEAMS: { label: 'Microsoft Teams', description: 'Appears in your Outlook calendar.', icon: Users },
  PHONE: { label: 'Phone call', description: 'We call the number you provide.', icon: Phone },
  IN_PERSON: { label: 'In person', description: 'At our Riverside Drive offices in Nairobi.', icon: Building2 },
  MANUAL: { label: 'Other', description: 'We will agree the details with you by email.', icon: Info },
};

export function BookPage() {
  const [params, setParams] = useSearchParams();
  const navigate = useNavigate();
  const { user } = useAuth();
  const toast = useToast();

  const timezone = browserTimezone();
  const [stepIndex, setStepIndex] = useState(0);

  const [serviceSlug, setServiceSlug] = useState(params.get('service') ?? '');
  const [consultantId, setConsultantId] = useState(params.get('consultant') ?? '');
  const [durationMinutes, setDurationMinutes] = useState<number | null>(null);
  const [selectedDate, setSelectedDate] = useState<string | null>(null);
  const [selectedSlot, setSelectedSlot] = useState<string | null>(null);
  const [provider, setProvider] = useState<MeetingProvider | null>(null);
  const [objective, setObjective] = useState('');
  const [submitError, setSubmitError] = useState<string | null>(null);

  const [month, setMonth] = useCalendarMonth(timezone);

  const { data: allServices, isLoading: servicesLoading } = useServices({ pageSize: 40 });
  const { data: service, isLoading: serviceLoading } = useService(serviceSlug || undefined);

  const createBooking = useCreateBooking();
  const initializePayment = useInitializePayment();

  const detailsForm = useForm<ClientDetails>({
    resolver: zodResolver(clientDetailsSchema),
    defaultValues: {
      firstName: user?.firstName ?? '',
      lastName: user?.lastName ?? '',
      email: user?.email ?? '',
      phone: user?.phone ?? '',
      company: user?.company ?? '',
    },
  });

  // Prefill once the session resolves — a user who signs in mid-flow should not
  // have to retype what we already know.
  useEffect(() => {
    if (!user) return;
    detailsForm.reset({
      firstName: user.firstName,
      lastName: user.lastName,
      email: user.email,
      phone: user.phone ?? '',
      company: user.company ?? '',
    });
  }, [user, detailsForm]);

  // Defaults derived from the chosen service, applied during render so the
  // schedule step never paints with nothing selected. Keyed on the id: a
  // refetch returning an equal-but-new object must not re-apply them over a
  // choice the visitor has since made.
  const [defaultsAppliedFor, setDefaultsAppliedFor] = useState<string | null>(null);
  if (service && defaultsAppliedFor !== service.id) {
    setDefaultsAppliedFor(service.id);

    const defaultDuration =
      service.durations.find((d) => d.isDefault)?.minutes ?? service.durations[0]?.minutes ?? null;
    setDurationMinutes((current) => current ?? defaultDuration);

    if (service.consultants.length === 1) setConsultantId(service.consultants[0]!.id);
    if (service.meetingProviders.length === 1) setProvider(service.meetingProviders[0]!);
  }

  const consultant = useMemo<ConsultantSummaryDto | undefined>(
    () => service?.consultants.find((c) => c.id === consultantId),
    [service, consultantId],
  );

  const selectedDuration = service?.durations.find((d) => d.minutes === durationMinutes);

  // Availability for the visible month, clamped to today and the service horizon.
  const monthStart = DateTime.fromISO(month, { zone: timezone });
  const today = DateTime.now().setZone(timezone);
  const windowFrom = (monthStart < today.startOf('month') ? today : monthStart).toISODate()!;
  const windowTo = monthStart.endOf('month').toISODate()!;

  const { data: availability, isFetching: availabilityLoading } = useAvailability({
    serviceId: service?.id,
    consultantId: consultantId || undefined,
    durationMinutes: durationMinutes ?? undefined,
    from: windowFrom,
    to: windowTo,
    timezone,
  });

  const daySlots = availability?.days.find((day) => day.date === selectedDate)?.slots ?? [];

  /* --- Discount code ---------------------------------------------------- */

  // Only the code is ever sent. The server decides what it is worth here, and
  // decides again at checkout — this figure is for the summary, nothing else.
  const [discountCode, setDiscountCode] = useState('');
  const [appliedDiscount, setAppliedDiscount] = useState<{ code: string; amount: number } | null>(null);
  const [discountError, setDiscountError] = useState<string | null>(null);
  const previewDiscount = usePreviewDiscount();

  const applyDiscount = async () => {
    if (!service || !durationMinutes) return;
    setDiscountError(null);

    try {
      const quote = await previewDiscount.mutateAsync({
        code: discountCode,
        serviceId: service.id,
        durationMinutes,
      });
      setAppliedDiscount({ code: quote.code, amount: quote.amount });
    } catch (error) {
      setAppliedDiscount(null);
      setDiscountError(error instanceof ApiError ? error.message : 'That code could not be applied.');
    }
  };

  const clearDiscount = () => {
    setAppliedDiscount(null);
    setDiscountCode('');
    setDiscountError(null);
  };

  /* --- Pricing preview (display only) ---------------------------------- */

  const preview = useMemo(() => {
    if (!service || !selectedDuration) return null;

    const subtotal = selectedDuration.price;
    const discount = Math.min(appliedDiscount?.amount ?? 0, subtotal);
    const tax = Math.round(((subtotal - discount) * service.taxRateBps) / 10_000);
    const total = subtotal - discount + tax;

    const dueNow =
      service.paymentModel === 'FREE'
        ? 0
        : service.paymentModel === 'FULL_PAYMENT'
          ? total
          : service.paymentModel === 'FIXED_DEPOSIT'
            ? Math.min(service.depositAmount ?? total, total)
            : Math.min(Math.round((total * (service.depositPercentBps ?? 10_000)) / 10_000), total);

    return { subtotal, discount, tax, total, dueNow, balance: total - dueNow };
  }, [service, selectedDuration, appliedDiscount]);

  /* --- Step navigation -------------------------------------------------- */

  const currentStep = STEPS[stepIndex]!;

  // Skip steps that have exactly one option: forcing a choice between one thing
  // is friction, not clarity.
  const visibleSteps = useMemo(
    () =>
      STEPS.filter((step) => {
        if (step.id === 'consultant' && (service?.consultants.length ?? 0) <= 1) return false;
        if (step.id === 'duration' && (service?.durations.length ?? 0) <= 1) return false;
        if (step.id === 'platform' && (service?.meetingProviders.length ?? 0) <= 1) return false;
        return true;
      }),
    [service],
  );

  const canAdvance = (): boolean => {
    switch (currentStep.id) {
      case 'service':
        return Boolean(service);
      case 'consultant':
        return Boolean(consultantId);
      case 'duration':
        return Boolean(durationMinutes);
      case 'schedule':
        return Boolean(selectedSlot);
      case 'platform':
        return Boolean(provider);
      case 'details':
        return true;
      default:
        return true;
    }
  };

  const goNext = async () => {
    if (currentStep.id === 'details') {
      const valid = await detailsForm.trigger();
      if (!valid) return;
    }

    let next = stepIndex + 1;
    // Walk past any steps that were filtered out for this service.
    while (next < STEPS.length && !visibleSteps.some((step) => step.id === STEPS[next]!.id)) next += 1;
    setStepIndex(Math.min(next, STEPS.length - 1));
  };

  const goBack = () => {
    let previous = stepIndex - 1;
    while (previous > 0 && !visibleSteps.some((step) => step.id === STEPS[previous]!.id)) previous -= 1;
    setStepIndex(Math.max(previous, 0));
  };

  /* --- Submit ----------------------------------------------------------- */

  const submit = async () => {
    setSubmitError(null);

    if (!user) {
      // Preserve the whole wizard state in the URL so signing in returns the
      // client to exactly where they were.
      const returnTo = new URLSearchParams({
        service: serviceSlug,
        consultant: consultantId,
        duration: String(durationMinutes ?? ''),
        slot: selectedSlot ?? '',
        provider: provider ?? '',
      });
      navigate(`/login?next=${encodeURIComponent(`/book?${returnTo.toString()}`)}`);
      return;
    }

    if (!service || !consultantId || !durationMinutes || !selectedSlot || !provider) return;

    const details = detailsForm.getValues();
    const scope = `booking:${service.id}:${selectedSlot}`;

    try {
      const result = await createBooking.mutateAsync({
        serviceId: service.id,
        consultantId,
        durationMinutes,
        startAt: selectedSlot,
        timezone,
        meetingProvider: provider,
        client: details,
        objective: objective.trim() || undefined,
        // The code, never the amount.
        discountCode: appliedDiscount?.code,
        idempotencyKey: idempotencyKey(scope),
      });

      // A free consultation is already confirmed; there is nothing to pay.
      if (!result.requiresPayment) {
        clearIdempotencyKey(scope);
        toast.success('Booking confirmed', 'Check your email for the details.');
        navigate(`/book/confirmation?reference=${result.booking.reference}`);
        return;
      }

      const payment = await initializePayment.mutateAsync({
        purpose: service.paymentModel === 'FULL_PAYMENT' ? 'FULL_PAYMENT' : 'DEPOSIT',
        bookingId: result.booking.id,
        callbackPath: `/book/confirmation?reference=${result.booking.reference}`,
      });

      clearIdempotencyKey(scope);
      // Hand off to Paystack's hosted checkout. Card details never touch this app.
      window.location.href = payment.authorizationUrl;
    } catch (error) {
      const message =
        error instanceof ApiError
          ? error.message
          : 'We could not complete your booking. Please try again.';
      setSubmitError(message);

      // A conflict means someone took the slot while this client was filling in
      // the form. Send them back to pick again rather than leaving them stuck.
      if (error instanceof ApiError && (error.code === 'BOOKING_CONFLICT' || error.code === 'SLOT_UNAVAILABLE')) {
        clearIdempotencyKey(scope);
        setSelectedSlot(null);
        setStepIndex(STEPS.findIndex((step) => step.id === 'schedule'));
        toast.warning('That time was just taken', 'Please choose another available time.');
      } else {
        toast.error('Booking could not be completed', message);
      }
    }
  };

  const submitting = createBooking.isPending || initializePayment.isPending;
  const progress = ((stepIndex + 1) / STEPS.length) * 100;

  return (
    <>
      <SEO
        title="Book a consultation"
        description="Choose a service, consultant and time. Availability is live and your slot is held while you complete payment."
        path="/book"
      />

      <div className="aura border-b border-border">
        <div className="mx-auto max-w-7xl px-5 py-10 sm:px-8 sm:py-14">
          <h1 className="text-h1">Book a consultation</h1>
          <p className="mt-3 max-w-xl text-muted-foreground">
            Choose what you need, when suits you, and how you would like to meet. Your slot is held while you complete
            payment.
          </p>
        </div>
      </div>

      {/* Mobile progress */}
      <div className="sticky top-16 z-30 border-b border-border glass px-5 py-3 lg:hidden">
        <div className="mb-2 flex items-center justify-between text-xs">
          <span className="font-medium text-foreground">{currentStep.label}</span>
          <span className="tabular text-muted-foreground">
            Step {stepIndex + 1} of {STEPS.length}
          </span>
        </div>
        <Progress value={progress} label={`Booking progress: step ${stepIndex + 1} of ${STEPS.length}`} />
      </div>

      <div className="mx-auto max-w-7xl px-5 py-8 sm:px-8 lg:py-12">
        <div className="grid gap-8 lg:grid-cols-[16rem_minmax(0,1fr)_20rem] lg:gap-10">
          {/* --- Left: step rail ------------------------------------------ */}
          <nav aria-label="Booking steps" className="hidden lg:block">
            <ol className="sticky top-24 space-y-1">
              {STEPS.map((step, index) => {
                const hidden = !visibleSteps.some((visible) => visible.id === step.id);
                if (hidden) return null;

                const done = index < stepIndex;
                const active = index === stepIndex;

                return (
                  <li key={step.id}>
                    <button
                      type="button"
                      disabled={index > stepIndex}
                      onClick={() => setStepIndex(index)}
                      aria-current={active ? 'step' : undefined}
                      className={cn(
                        'flex w-full items-center gap-3 rounded-[var(--radius-control)] px-3 py-2.5 text-left text-sm transition-colors',
                        active && 'bg-accent-soft font-medium text-accent',
                        !active && done && 'text-foreground hover:bg-muted',
                        !active && !done && 'cursor-not-allowed text-muted-foreground/60',
                      )}
                    >
                      <span
                        aria-hidden
                        className={cn(
                          'tabular flex size-6 shrink-0 items-center justify-center rounded-full text-[0.6875rem] font-semibold',
                          done && 'bg-success text-success-foreground',
                          active && 'bg-accent text-accent-foreground',
                          !done && !active && 'bg-muted text-muted-foreground',
                        )}
                      >
                        {done ? <Check className="size-3" /> : index + 1}
                      </span>
                      {step.shortLabel}
                    </button>
                  </li>
                );
              })}
            </ol>
          </nav>

          {/* --- Centre: active step -------------------------------------- */}
          <div className="min-w-0">
            <h2 className="mb-6 hidden text-h2 lg:block">{currentStep.label}</h2>

            {currentStep.id === 'service' && (
              <ServiceStep
                services={allServices?.items ?? []}
                loading={servicesLoading}
                selected={serviceSlug}
                onSelect={(slug) => {
                  setServiceSlug(slug);
                  setParams({ service: slug }, { replace: true });
                  // Every downstream choice depends on the service.
                  setConsultantId('');
                  setDurationMinutes(null);
                  setSelectedDate(null);
                  setSelectedSlot(null);
                  setProvider(null);
                }}
              />
            )}

            {currentStep.id === 'consultant' && (
              <ConsultantStep
                service={service}
                loading={serviceLoading}
                selected={consultantId}
                onSelect={(id) => {
                  setConsultantId(id);
                  setSelectedDate(null);
                  setSelectedSlot(null);
                }}
              />
            )}

            {currentStep.id === 'duration' && service && (
              <DurationStep
                service={service}
                selected={durationMinutes}
                onSelect={(minutes) => {
                  setDurationMinutes(minutes);
                  setSelectedSlot(null);
                }}
              />
            )}

            {currentStep.id === 'schedule' && (
              <div className="grid gap-8 sm:grid-cols-2">
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
                    maxDate={
                      service
                        ? DateTime.now().plus({ days: service.bookingHorizonDays }).toISODate() ?? undefined
                        : undefined
                    }
                  />
                </Card>

                <Card>
                  <h3 className="mb-4 text-[0.9375rem] font-semibold">
                    {selectedDate
                      ? DateTime.fromISO(selectedDate).toFormat('cccc d LLLL')
                      : 'Select a date first'}
                  </h3>
                  {selectedDate ? (
                    <TimeSlotPicker
                      slots={daySlots}
                      selected={selectedSlot}
                      onSelect={setSelectedSlot}
                      loading={availabilityLoading}
                      timezone={timezone}
                      durationMinutes={durationMinutes ?? 0}
                    />
                  ) : (
                    <p className="py-10 text-center text-sm text-muted-foreground">
                      Choose a highlighted date to see available times.
                    </p>
                  )}
                </Card>
              </div>
            )}

            {currentStep.id === 'platform' && service && (
              <PlatformStep service={service} selected={provider} onSelect={setProvider} />
            )}

            {currentStep.id === 'details' && (
              <DetailsStep form={detailsForm} objective={objective} onObjectiveChange={setObjective} isSignedIn={Boolean(user)} />
            )}

            {currentStep.id === 'review' && service && preview && (
              <ReviewStep
                service={service}
                consultant={consultant}
                durationMinutes={durationMinutes!}
                startAt={selectedSlot!}
                timezone={timezone}
                provider={provider!}
                details={detailsForm.getValues()}
                objective={objective}
                preview={preview}
                error={submitError}
                isSignedIn={Boolean(user)}
              />
            )}

            {/* Desktop navigation */}
            <div className="mt-8 hidden items-center justify-between gap-4 lg:flex">
              <Button
                variant="ghost"
                onClick={goBack}
                disabled={stepIndex === 0}
                icon={<ArrowLeft className="size-4" aria-hidden />}
              >
                Back
              </Button>

              {currentStep.id === 'review' ? (
                <Button
                  size="lg"
                  onClick={() => void submit()}
                  loading={submitting}
                  icon={<Lock className="size-4" aria-hidden />}
                >
                  {!user
                    ? 'Sign in to continue'
                    : preview?.dueNow === 0
                      ? 'Confirm booking'
                      : `Pay ${money(preview?.dueNow ?? 0, service?.currency ?? 'KES')}`}
                </Button>
              ) : (
                <Button
                  onClick={() => void goNext()}
                  disabled={!canAdvance()}
                  iconRight={<ArrowRight className="size-4" aria-hidden />}
                >
                  Continue
                </Button>
              )}
            </div>
          </div>

          {/* --- Right: live summary -------------------------------------- */}
          <aside className="hidden lg:block">
            <div className="sticky top-24">
              <BookingSummary
                service={service}
                consultant={consultant}
                durationMinutes={durationMinutes}
                startAt={selectedSlot}
                timezone={timezone}
                provider={provider}
                preview={preview}
              />

              {/* Beside the price, not as a step of its own: a code is optional
                  and most clients do not have one. */}
              {service && durationMinutes && (
                <DiscountField
                  code={discountCode}
                  onCodeChange={setDiscountCode}
                  applied={appliedDiscount}
                  error={discountError}
                  currency={service.currency}
                  busy={previewDiscount.isPending}
                  onApply={() => void applyDiscount()}
                  onClear={clearDiscount}
                />
              )}
            </div>
          </aside>
        </div>
      </div>

      {/* Mobile sticky action bar */}
      <div className="sticky bottom-0 z-30 border-t border-border glass px-5 py-3 lg:hidden">
        {preview && (
          <div className="mb-2.5 flex items-baseline justify-between text-sm">
            <span className="text-muted-foreground">Due now</span>
            <span className="font-semibold">
              {preview.dueNow === 0 ? 'No charge' : money(preview.dueNow, service?.currency ?? 'KES')}
            </span>
          </div>
        )}
        <div className="flex gap-2">
          <Button variant="secondary" onClick={goBack} disabled={stepIndex === 0} size="md" className="shrink-0">
            <ArrowLeft className="size-4" aria-hidden />
            <span className="sr-only">Back</span>
          </Button>
          {currentStep.id === 'review' ? (
            <Button className="flex-1" onClick={() => void submit()} loading={submitting}>
              {!user ? 'Sign in to continue' : preview?.dueNow === 0 ? 'Confirm booking' : 'Pay and confirm'}
            </Button>
          ) : (
            <Button className="flex-1" onClick={() => void goNext()} disabled={!canAdvance()}>
              Continue
            </Button>
          )}
        </div>
      </div>
    </>
  );
}

/* -------------------------------------------------------------------------- */
/* Steps                                                                      */
/* -------------------------------------------------------------------------- */

function ServiceStep({
  services,
  loading,
  selected,
  onSelect,
}: {
  services: { id: string; slug: string; name: string; shortDescription: string; startingPrice: number; currency: string; defaultDurationMinutes: number; category: { name: string }; averageRating: number | null; reviewCount: number }[];
  loading: boolean;
  selected: string;
  onSelect: (slug: string) => void;
}) {
  if (loading) return <LoadingSkeleton rows={6} />;

  return (
    <div className="space-y-3">
      {services.map((service) => {
        const isSelected = selected === service.slug;
        return (
          <button
            key={service.id}
            type="button"
            onClick={() => onSelect(service.slug)}
            aria-pressed={isSelected}
            className={cn(
              'w-full rounded-[var(--radius-card)] p-5 text-left transition-all duration-200 ease-[var(--ease-out-quint)]',
              isSelected
                ? 'bg-accent-soft shadow-[var(--shadow-raised)] ring-2 ring-accent'
                : 'bg-card hairline hover:bg-muted/50',
            )}
          >
            <div className="flex items-start justify-between gap-4">
              <div className="min-w-0 flex-1">
                <div className="mb-1.5 flex flex-wrap items-center gap-2">
                  <Badge tone="neutral" className="text-[0.6875rem]">
                    {service.category.name}
                  </Badge>
                  {service.averageRating !== null && (
                    <Rating value={service.averageRating} count={service.reviewCount} />
                  )}
                </div>
                <h3 className="font-semibold tracking-tight">{service.name}</h3>
                <p className="mt-1.5 text-sm leading-relaxed text-muted-foreground">{service.shortDescription}</p>
                <p className="mt-3 flex items-center gap-4 text-xs text-muted-foreground">
                  <span className="flex items-center gap-1.5">
                    <Clock className="size-3.5" aria-hidden />
                    {formatDuration(service.defaultDurationMinutes)}
                  </span>
                </p>
              </div>

              <div className="shrink-0 text-right">
                <p className="text-xs text-muted-foreground">{service.startingPrice === 0 ? '' : 'from'}</p>
                <p className="font-semibold tracking-tight">
                  {service.startingPrice === 0 ? 'Free' : money(service.startingPrice, service.currency)}
                </p>
              </div>
            </div>
          </button>
        );
      })}
    </div>
  );
}

function ConsultantStep({
  service,
  loading,
  selected,
  onSelect,
}: {
  service: ServiceDetailDto | undefined;
  loading: boolean;
  selected: string;
  onSelect: (id: string) => void;
}) {
  if (loading) return <LoadingSkeleton rows={4} />;
  if (!service) return null;

  return (
    <div className="grid gap-3 sm:grid-cols-2">
      {service.consultants.map((consultant) => {
        const isSelected = selected === consultant.id;
        return (
          <button
            key={consultant.id}
            type="button"
            onClick={() => onSelect(consultant.id)}
            aria-pressed={isSelected}
            disabled={!consultant.isAcceptingBookings}
            className={cn(
              'rounded-[var(--radius-card)] p-5 text-left transition-all duration-200 ease-[var(--ease-out-quint)]',
              isSelected
                ? 'bg-accent-soft shadow-[var(--shadow-raised)] ring-2 ring-accent'
                : 'bg-card hairline hover:bg-muted/50',
              !consultant.isAcceptingBookings && 'cursor-not-allowed opacity-55',
            )}
          >
            <div className="flex items-start gap-4">
              <Avatar name={consultant.fullName} src={consultant.avatarUrl} size="lg" />
              <div className="min-w-0 flex-1">
                <h3 className="font-semibold tracking-tight">{consultant.fullName}</h3>
                <p className="text-sm text-muted-foreground">{consultant.title}</p>
                <div className="mt-2">
                  <Rating value={consultant.averageRating} count={consultant.reviewCount} />
                </div>
                <p className="mt-2 text-xs text-muted-foreground">
                  {consultant.yearsExperience} years · {consultant.completedSessions} sessions delivered
                </p>
                {!consultant.isAcceptingBookings && (
                  <Badge tone="warning" className="mt-2.5">
                    Not accepting bookings
                  </Badge>
                )}
              </div>
            </div>

            <div className="mt-4 flex flex-wrap gap-1.5 border-t border-border pt-4">
              {consultant.specialties.slice(0, 3).map((specialty) => (
                <Badge key={specialty} tone="neutral" className="text-[0.6875rem]">
                  {specialty}
                </Badge>
              ))}
            </div>
          </button>
        );
      })}
    </div>
  );
}

function DurationStep({
  service,
  selected,
  onSelect,
}: {
  service: ServiceDetailDto;
  selected: number | null;
  onSelect: (minutes: number) => void;
}) {
  return (
    <div className="space-y-3">
      {service.durations.map((duration) => {
        const isSelected = selected === duration.minutes;
        return (
          <button
            key={duration.id}
            type="button"
            onClick={() => onSelect(duration.minutes)}
            aria-pressed={isSelected}
            className={cn(
              'flex w-full items-center justify-between gap-4 rounded-[var(--radius-card)] p-5 text-left transition-all duration-200',
              isSelected
                ? 'bg-accent-soft shadow-[var(--shadow-raised)] ring-2 ring-accent'
                : 'bg-card hairline hover:bg-muted/50',
            )}
          >
            <div>
              <p className="font-semibold tracking-tight">{formatDuration(duration.minutes)}</p>
              {duration.label && <p className="mt-0.5 text-sm text-muted-foreground">{duration.label}</p>}
            </div>
            <p className="shrink-0 text-lg font-semibold tracking-tight">
              {duration.price === 0 ? 'No charge' : money(duration.price, service.currency)}
            </p>
          </button>
        );
      })}
    </div>
  );
}

function PlatformStep({
  service,
  selected,
  onSelect,
}: {
  service: ServiceDetailDto;
  selected: MeetingProvider | null;
  onSelect: (provider: MeetingProvider) => void;
}) {
  return (
    <div className="grid gap-3 sm:grid-cols-2">
      {service.meetingProviders.map((provider) => {
        const meta = PROVIDER_META[provider];
        const Icon = meta.icon;
        const isSelected = selected === provider;

        return (
          <button
            key={provider}
            type="button"
            onClick={() => onSelect(provider)}
            aria-pressed={isSelected}
            className={cn(
              'flex items-start gap-4 rounded-[var(--radius-card)] p-5 text-left transition-all duration-200',
              isSelected
                ? 'bg-accent-soft shadow-[var(--shadow-raised)] ring-2 ring-accent'
                : 'bg-card hairline hover:bg-muted/50',
            )}
          >
            <span
              className={cn(
                'flex size-10 shrink-0 items-center justify-center rounded-[var(--radius-control)]',
                isSelected ? 'bg-accent text-accent-foreground' : 'bg-muted text-muted-foreground',
              )}
            >
              <Icon className="size-5" aria-hidden />
            </span>
            <span className="min-w-0">
              <span className="block font-semibold tracking-tight">{meta.label}</span>
              <span className="mt-0.5 block text-sm leading-relaxed text-muted-foreground">{meta.description}</span>
            </span>
          </button>
        );
      })}
    </div>
  );
}

function DetailsStep({
  form,
  objective,
  onObjectiveChange,
  isSignedIn,
}: {
  form: ReturnType<typeof useForm<ClientDetails>>;
  objective: string;
  onObjectiveChange: (value: string) => void;
  isSignedIn: boolean;
}) {
  const { register, formState } = form;
  const errors = Object.values(formState.errors)
    .map((error) => error?.message)
    .filter((message): message is string => Boolean(message));

  return (
    <div className="space-y-6">
      <ErrorSummary errors={errors} />

      {!isSignedIn && (
        <div className="flex gap-3 rounded-[var(--radius-panel)] bg-info-soft p-4 text-sm text-info">
          <Info className="mt-0.5 size-4 shrink-0" aria-hidden />
          <p>
            You will be asked to sign in or create an account before payment, so your booking, invoices and session
            notes are all in one place.
          </p>
        </div>
      )}

      <Card>
        <div className="grid gap-5 sm:grid-cols-2">
          <Field label="First name" required error={formState.errors.firstName?.message}>
            {({ id, describedBy, invalid }) => (
              <Input id={id} aria-describedby={describedBy} invalid={invalid} autoComplete="given-name" {...register('firstName')} />
            )}
          </Field>

          <Field label="Last name" required error={formState.errors.lastName?.message}>
            {({ id, describedBy, invalid }) => (
              <Input id={id} aria-describedby={describedBy} invalid={invalid} autoComplete="family-name" {...register('lastName')} />
            )}
          </Field>

          <Field label="Email address" required error={formState.errors.email?.message}>
            {({ id, describedBy, invalid }) => (
              <Input id={id} type="email" aria-describedby={describedBy} invalid={invalid} autoComplete="email" {...register('email')} />
            )}
          </Field>

          <Field
            label="Phone number"
            required
            hint="Used only if we need to reach you about this session."
            error={formState.errors.phone?.message}
          >
            {({ id, describedBy, invalid }) => (
              <Input id={id} type="tel" aria-describedby={describedBy} invalid={invalid} autoComplete="tel" {...register('phone')} />
            )}
          </Field>

          <div className="sm:col-span-2">
            <Field label="Organisation" hint="Optional" error={formState.errors.company?.message}>
              {({ id, describedBy, invalid }) => (
                <Input id={id} aria-describedby={describedBy} invalid={invalid} autoComplete="organization" {...register('company')} />
              )}
            </Field>
          </div>
        </div>
      </Card>

      <Card>
        <Field
          label="What would you like to get out of this session?"
          hint="Optional, but it means your consultant can prepare properly."
        >
          {({ id }) => (
            <Textarea
              id={id}
              value={objective}
              onChange={(event) => onObjectiveChange(event.target.value)}
              maxLength={2000}
              placeholder="For example: decide whether to proceed with the Uganda distribution partnership."
            />
          )}
        </Field>
      </Card>
    </div>
  );
}

function ReviewStep({
  service,
  consultant,
  durationMinutes,
  startAt,
  timezone,
  provider,
  details,
  objective,
  preview,
  error,
  isSignedIn,
}: {
  service: ServiceDetailDto;
  consultant: ConsultantSummaryDto | undefined;
  durationMinutes: number;
  startAt: string;
  timezone: string;
  provider: MeetingProvider;
  details: ClientDetails;
  objective: string;
  preview: { subtotal: number; discount: number; tax: number; total: number; dueNow: number; balance: number };
  error: string | null;
  isSignedIn: boolean;
}) {
  const when = DateTime.fromISO(startAt).setZone(timezone);

  return (
    <div className="space-y-5">
      {error && (
        <div role="alert" className="flex gap-3 rounded-[var(--radius-panel)] bg-destructive-soft p-4 text-sm text-destructive">
          <AlertTriangle className="mt-0.5 size-4 shrink-0" aria-hidden />
          <p>{error}</p>
        </div>
      )}

      <Card>
        <h3 className="mb-5 text-[0.9375rem] font-semibold">Your consultation</h3>
        <dl className="space-y-3.5 text-sm">
          <Row label="Service" value={service.name} />
          {consultant && <Row label="Consultant" value={consultant.fullName} />}
          <Row label="Date" value={when.toFormat('cccc, d LLLL yyyy')} />
          <Row label="Time" value={`${when.toFormat('HH:mm')} ${when.toFormat('ZZZZ')}`} />
          <Row label="Duration" value={formatDuration(durationMinutes)} />
          <Row label="Meeting" value={PROVIDER_META[provider].label} />
        </dl>
      </Card>

      <Card>
        <h3 className="mb-5 text-[0.9375rem] font-semibold">Your details</h3>
        <dl className="space-y-3.5 text-sm">
          <Row label="Name" value={`${details.firstName} ${details.lastName}`} />
          <Row label="Email" value={details.email} />
          <Row label="Phone" value={details.phone} />
          {details.company && <Row label="Organisation" value={details.company} />}
          {objective && <Row label="Objective" value={objective} />}
        </dl>
      </Card>

      <Card>
        <h3 className="mb-5 text-[0.9375rem] font-semibold">Payment</h3>
        <dl className="space-y-3.5 text-sm">
          <Row label="Consultation fee" value={money(preview.subtotal, service.currency)} />
          {preview.discount > 0 && (
            <Row label="Discount" value={`−${money(preview.discount, service.currency)}`} />
          )}
          {preview.tax > 0 && (
            <Row label={`Tax (${(service.taxRateBps / 100).toFixed(0)}%)`} value={money(preview.tax, service.currency)} />
          )}
          <div className="flex items-baseline justify-between border-t border-border pt-3.5">
            <dt className="font-medium">Total</dt>
            <dd className="tabular font-semibold">{money(preview.total, service.currency)}</dd>
          </div>

          {preview.balance > 0 && (
            <>
              <div className="flex items-baseline justify-between text-accent">
                <dt className="font-medium">Booking fee due now</dt>
                <dd className="tabular font-semibold">{money(preview.dueNow, service.currency)}</dd>
              </div>
              <Row label="Balance before session" value={money(preview.balance, service.currency)} />
            </>
          )}
        </dl>

        {preview.balance > 0 && (
          <p className="mt-4 rounded-[var(--radius-control)] bg-muted/60 p-3 text-xs leading-relaxed text-muted-foreground">
            You pay the booking fee now to hold this time. The remaining{' '}
            {money(preview.balance, service.currency)} is due before the session begins — we will send a reminder.
          </p>
        )}

        {service.cancellationPolicy && (
          <p className="mt-3 text-xs leading-relaxed text-muted-foreground">
            <strong className="font-medium text-foreground">Cancellation:</strong> {service.cancellationPolicy}
          </p>
        )}
      </Card>

      <div className="flex items-center justify-center gap-2 text-xs text-muted-foreground">
        <ShieldCheck className="size-3.5 text-success" aria-hidden />
        {isSignedIn
          ? 'Payment is processed securely by Paystack. We never see or store your card details.'
          : 'You will sign in before payment. Card details are handled entirely by Paystack.'}
      </div>
    </div>
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
/* Summary panel                                                              */
/* -------------------------------------------------------------------------- */

function BookingSummary({
  service,
  consultant,
  durationMinutes,
  startAt,
  timezone,
  provider,
  preview,
}: {
  service: ServiceDetailDto | undefined;
  consultant: ConsultantSummaryDto | undefined;
  durationMinutes: number | null;
  startAt: string | null;
  timezone: string;
  provider: MeetingProvider | null;
  preview: {
    subtotal: number;
    discount: number;
    tax: number;
    total: number;
    dueNow: number;
    balance: number;
  } | null;
}) {
  if (!service) {
    return (
      <Card className="text-center">
        <CalendarClock className="mx-auto size-8 text-muted-foreground/40" aria-hidden />
        <p className="mt-3 text-sm text-muted-foreground">
          Your booking summary will appear here as you make your choices.
        </p>
      </Card>
    );
  }

  const when = startAt ? DateTime.fromISO(startAt).setZone(timezone) : null;

  return (
    <Card>
      <p className="text-eyebrow uppercase text-muted-foreground">Booking summary</p>
      <h3 className="mt-2.5 text-h3">{service.name}</h3>

      <dl className="mt-5 space-y-3 text-sm">
        {consultant && (
          <div className="flex items-center gap-3">
            <Avatar name={consultant.fullName} src={consultant.avatarUrl} size="xs" />
            <div className="min-w-0">
              <dt className="sr-only">Consultant</dt>
              <dd className="truncate text-sm font-medium">{consultant.fullName}</dd>
            </div>
          </div>
        )}

        {durationMinutes && (
          <div className="flex items-center gap-2.5 text-muted-foreground">
            <Clock className="size-4 shrink-0" aria-hidden />
            <dt className="sr-only">Duration</dt>
            <dd>{formatDuration(durationMinutes)}</dd>
          </div>
        )}

        {when && (
          <div className="flex items-start gap-2.5 text-muted-foreground">
            <Calendar className="mt-0.5 size-4 shrink-0" aria-hidden />
            <div>
              <dt className="sr-only">Date and time</dt>
              <dd className="text-foreground">{when.toFormat('ccc d LLL')}</dd>
              <dd className="tabular text-xs">
                {when.toFormat('HH:mm')} {when.toFormat('ZZZZ')}
              </dd>
            </div>
          </div>
        )}

        {provider && (
          <div className="flex items-center gap-2.5 text-muted-foreground">
            <Video className="size-4 shrink-0" aria-hidden />
            <dt className="sr-only">Meeting platform</dt>
            <dd>{PROVIDER_META[provider].label}</dd>
          </div>
        )}
      </dl>

      {preview && (
        <div className="mt-5 space-y-2.5 border-t border-border pt-5 text-sm">
          <div className="flex justify-between text-muted-foreground">
            <span>Consultation</span>
            <span className="tabular">{money(preview.subtotal, service.currency)}</span>
          </div>
          {preview.discount > 0 && (
            <div className="flex justify-between text-success">
              <span>Discount</span>
              <span className="tabular">−{money(preview.discount, service.currency)}</span>
            </div>
          )}
          {preview.tax > 0 && (
            <div className="flex justify-between text-muted-foreground">
              <span>Tax</span>
              <span className="tabular">{money(preview.tax, service.currency)}</span>
            </div>
          )}
          <div className="flex justify-between border-t border-border pt-2.5 font-semibold">
            <span>Total</span>
            <span className="tabular">{money(preview.total, service.currency)}</span>
          </div>

          {preview.balance > 0 && (
            <>
              <div className="flex justify-between rounded-[var(--radius-control)] bg-accent-soft px-3 py-2.5 font-semibold text-accent">
                <span>Due now</span>
                <span className="tabular">{money(preview.dueNow, service.currency)}</span>
              </div>
              <p className="text-xs text-muted-foreground">
                Balance of {money(preview.balance, service.currency)} due before your session.
              </p>
            </>
          )}
        </div>
      )}

      <div className="mt-5 flex items-start gap-2 border-t border-border pt-4 text-xs text-muted-foreground">
        <CreditCard className="mt-0.5 size-3.5 shrink-0" aria-hidden />
        <p>Secured by Paystack. Your card details never reach our servers.</p>
      </div>
    </Card>
  );
}

export { ChevronRight, User };
