import { useState } from 'react';
import { Link, useParams, useSearchParams } from 'react-router-dom';
import {
  ArrowRight,
  Award,
  CalendarClock,
  Check,
  Clock,
  Globe,
  GraduationCap,
  Languages,
  RefreshCcw,
  ShieldCheck,
  Users,
  XCircle,
} from 'lucide-react';
import { Avatar, Badge, Button, Card, EmptyState, Rating, Separator } from '@/components/ui';
import {
  CardGridSkeleton,
  ConsultantCard,
  Reveal,
  ReviewCard,
  Section,
  SectionHeader,
  ServiceCard,
} from '@/components/marketing';
import { SEO } from '@/components/SEO';
import { breadcrumbSchema, serviceSchema } from '@/lib/structured-data';
import { LinkedInIcon } from '@/components/BrandIcons';
import { useConsultant, useConsultants, usePublicReviews, useService, useServiceCategories, useServices } from '@/lib/queries';
import { cn, formatDuration, money } from '@/lib/utils';

/**
 * Public catalog pages: the services index, a service detail, the consultant
 * directory, a consultant profile, and the reviews wall.
 */

/* -------------------------------------------------------------------------- */
/* Services index                                                             */
/* -------------------------------------------------------------------------- */

export function ServicesPage() {
  const [params, setParams] = useSearchParams();
  const category = params.get('category') ?? '';

  const { data: categories } = useServiceCategories();
  const { data, isLoading } = useServices({ pageSize: 24, category: category || undefined });

  return (
    <>
      <SEO
        title="Consultation services"
        description="Strategy, finance, operations, technology, people and governance consultations. Fixed fee, stated duration, written outcome."
        path="/services"
      />

      <div className="aura border-b border-border">
        <div className="mx-auto max-w-7xl px-5 py-14 sm:px-8 sm:py-20">
          <p className="text-eyebrow uppercase text-accent">Our services</p>
          <h1 className="mt-3 max-w-3xl text-h1">Consultations built around a decision</h1>
          <p className="mt-5 max-w-2xl text-lg leading-relaxed text-muted-foreground">
            Every engagement is scoped to a question you are actually trying to answer. You will know the fee, the
            duration and what you leave with before you book.
          </p>
        </div>
      </div>

      <Section className="!pt-12">
        <div className="mb-10 flex flex-wrap gap-2" role="group" aria-label="Filter by category">
          <button
            type="button"
            onClick={() => setParams({})}
            aria-pressed={!category}
            className={cn(
              'rounded-full px-4 py-2 text-sm font-medium transition-colors',
              !category ? 'bg-primary text-primary-foreground' : 'bg-muted text-muted-foreground hover:text-foreground',
            )}
          >
            All services
          </button>
          {categories?.map((item) => (
            <button
              key={item.id}
              type="button"
              onClick={() => setParams({ category: item.slug })}
              aria-pressed={category === item.slug}
              className={cn(
                'rounded-full px-4 py-2 text-sm font-medium transition-colors',
                category === item.slug
                  ? 'bg-primary text-primary-foreground'
                  : 'bg-muted text-muted-foreground hover:text-foreground',
              )}
            >
              {item.name}
              <span className="ml-1.5 text-xs opacity-60">{item.serviceCount}</span>
            </button>
          ))}
        </div>

        <div className="grid gap-5 sm:grid-cols-2 lg:grid-cols-3">
          {isLoading ? (
            <CardGridSkeleton count={6} />
          ) : data && data.items.length > 0 ? (
            data.items.map((service, index) => <ServiceCard key={service.id} service={service} index={index} />)
          ) : (
            <div className="sm:col-span-2 lg:col-span-3">
              <EmptyState
                title="No services in this category yet"
                description="Try another category, or browse everything we offer."
                action={
                  <Button variant="secondary" onClick={() => setParams({})}>
                    Show all services
                  </Button>
                }
              />
            </div>
          )}
        </div>
      </Section>
    </>
  );
}

/* -------------------------------------------------------------------------- */
/* Service detail                                                             */
/* -------------------------------------------------------------------------- */

export function ServiceDetailPage() {
  const { slug } = useParams<{ slug: string }>();
  const { data: service, isLoading, isError } = useService(slug);
  const { data: reviews } = usePublicReviews({ serviceSlug: slug, pageSize: 6 });

  if (isLoading) {
    return (
      <div className="mx-auto max-w-7xl px-5 py-16 sm:px-8">
        <div className="skeleton h-12 w-2/3" />
        <div className="skeleton mt-4 h-6 w-1/2" />
        <div className="skeleton mt-10 h-64 w-full" />
      </div>
    );
  }

  if (isError || !service) {
    return (
      <Section>
        <EmptyState
          title="That service could not be found"
          description="It may have been renamed or withdrawn."
          action={
            <Link to="/services">
              <Button>Browse all services</Button>
            </Link>
          }
        />
      </Section>
    );
  }

  const bookHref = `/book?service=${service.slug}`;

  return (
    <>
      <SEO
        title={service.seoTitle ?? service.name}
        description={service.seoDescription ?? service.shortDescription}
        path={`/services/${service.slug}`}
        structuredData={serviceSchema(service)}
      />

      <div className="aura border-b border-border">
        <div className="mx-auto grid max-w-7xl gap-10 px-5 py-14 sm:px-8 sm:py-20 lg:grid-cols-[1.6fr_1fr]">
          <div>
            <nav aria-label="Breadcrumb" className="mb-5">
              <ol className="flex items-center gap-2 text-xs text-muted-foreground">
                <li>
                  <Link to="/services" className="transition-colors hover:text-foreground">
                    Services
                  </Link>
                </li>
                <li aria-hidden>/</li>
                <li className="text-foreground">{service.category.name}</li>
              </ol>
            </nav>

            <Badge tone="accent">{service.category.name}</Badge>
            <h1 className="mt-4 text-h1">{service.name}</h1>
            <p className="mt-5 max-w-2xl text-lg leading-relaxed text-muted-foreground">{service.shortDescription}</p>

            <div className="mt-7 flex flex-wrap items-center gap-x-6 gap-y-3 text-sm text-muted-foreground">
              <span className="flex items-center gap-2">
                <Clock className="size-4" aria-hidden />
                {service.durations.map((d) => formatDuration(d.minutes)).join(' · ')}
              </span>
              <span className="flex items-center gap-2">
                <Users className="size-4" aria-hidden />
                {service.consultants.length} consultant{service.consultants.length === 1 ? '' : 's'}
              </span>
              {service.averageRating !== null && <Rating value={service.averageRating} count={service.reviewCount} size="md" />}
            </div>
          </div>

          <Card className="h-fit lg:sticky lg:top-24">
            <p className="text-eyebrow uppercase text-muted-foreground">Pricing</p>

            <ul className="mt-4 space-y-3">
              {service.durations.map((duration) => (
                <li key={duration.id} className="flex items-baseline justify-between gap-4">
                  <span className="text-sm">
                    {formatDuration(duration.minutes)}
                    {duration.label && <span className="block text-xs text-muted-foreground">{duration.label}</span>}
                  </span>
                  <span className="tabular shrink-0 font-semibold">
                    {duration.price === 0 ? 'No charge' : money(duration.price, service.currency)}
                  </span>
                </li>
              ))}
            </ul>

            {service.paymentModel !== 'FULL_PAYMENT' && service.paymentModel !== 'FREE' && (
              <div className="mt-5 rounded-[var(--radius-control)] bg-accent-soft p-3.5 text-xs leading-relaxed text-accent">
                <strong className="font-semibold">Booking fee.</strong>{' '}
                {service.paymentModel === 'FIXED_DEPOSIT' && service.depositAmount
                  ? `Pay ${money(service.depositAmount, service.currency)} to hold your slot; the balance is due before the session.`
                  : `Pay ${(service.depositPercentBps ?? 0) / 100}% to hold your slot; the balance is due before the session.`}
              </div>
            )}

            <Link to={bookHref} className="mt-5 block">
              <Button className="w-full" size="lg" iconRight={<ArrowRight className="size-4" aria-hidden />}>
                Book this consultation
              </Button>
            </Link>

            <ul className="mt-5 space-y-2 border-t border-border pt-5 text-xs text-muted-foreground">
              <li className="flex items-center gap-2">
                <ShieldCheck className="size-3.5 shrink-0 text-success" aria-hidden />
                Secure payment via Paystack
              </li>
              <li className="flex items-center gap-2">
                <RefreshCcw className="size-3.5 shrink-0 text-success" aria-hidden />
                Free rescheduling up to {service.rescheduleWindowHours}h before
              </li>
              <li className="flex items-center gap-2">
                <CalendarClock className="size-3.5 shrink-0 text-success" aria-hidden />
                Calendar invitation sent automatically
              </li>
            </ul>
          </Card>
        </div>
      </div>

      <Section className="!py-16">
        <div className="grid gap-14 lg:grid-cols-[1.6fr_1fr]">
          <div>
            <h2 className="text-h2">About this consultation</h2>
            <div className="prose-editorial mt-6">
              {service.fullDescription.split('\n\n').map((paragraph, index) => (
                <p key={index}>{paragraph}</p>
              ))}
            </div>

            {service.preparationNotes && (
              <Card className="mt-10 bg-muted/40">
                <h3 className="flex items-center gap-2 text-h3">
                  <Check className="size-5 text-success" aria-hidden />
                  How to prepare
                </h3>
                <p className="mt-3 text-sm leading-relaxed text-muted-foreground">{service.preparationNotes}</p>
              </Card>
            )}

            <div className="mt-10 grid gap-5 sm:grid-cols-2">
              {service.cancellationPolicy && (
                <Card>
                  <h3 className="flex items-center gap-2 text-[0.9375rem] font-semibold">
                    <XCircle className="size-4 text-muted-foreground" aria-hidden />
                    Cancellation
                  </h3>
                  <p className="mt-2.5 text-sm leading-relaxed text-muted-foreground">{service.cancellationPolicy}</p>
                </Card>
              )}
              {service.reschedulePolicy && (
                <Card>
                  <h3 className="flex items-center gap-2 text-[0.9375rem] font-semibold">
                    <RefreshCcw className="size-4 text-muted-foreground" aria-hidden />
                    Rescheduling
                  </h3>
                  <p className="mt-2.5 text-sm leading-relaxed text-muted-foreground">{service.reschedulePolicy}</p>
                </Card>
              )}
            </div>
          </div>

          <aside>
            <h2 className="text-h3">Who delivers this</h2>
            <div className="mt-5 space-y-3">
              {service.consultants.map((consultant) => (
                <Link key={consultant.id} to={`/consultants/${consultant.slug}`} className="group block">
                  <Card interactive className="flex items-center gap-4">
                    <Avatar name={consultant.fullName} src={consultant.avatarUrl} size="md" />
                    <div className="min-w-0 flex-1">
                      <p className="truncate text-sm font-semibold transition-colors group-hover:text-accent">
                        {consultant.fullName}
                      </p>
                      <p className="truncate text-xs text-muted-foreground">{consultant.title}</p>
                      <div className="mt-1">
                        <Rating value={consultant.averageRating} count={consultant.reviewCount} />
                      </div>
                    </div>
                    <ArrowRight className="size-4 shrink-0 text-muted-foreground" aria-hidden />
                  </Card>
                </Link>
              ))}
            </div>
          </aside>
        </div>
      </Section>

      {reviews && reviews.items.length > 0 && (
        <Section className="bg-card">
          <SectionHeader
            eyebrow="Client feedback"
            title={`What clients said about ${service.name}`}
            description={
              reviews.averageRating
                ? `${reviews.averageRating.toFixed(1)} out of 5 across ${reviews.meta.total} verified reviews.`
                : undefined
            }
          />
          <div className="grid gap-5 sm:grid-cols-2 lg:grid-cols-3">
            {reviews.items.map((review, index) => (
              <ReviewCard key={review.id} review={review} index={index} />
            ))}
          </div>
        </Section>
      )}
    </>
  );
}

/* -------------------------------------------------------------------------- */
/* Consultants                                                                */
/* -------------------------------------------------------------------------- */

export function ConsultantsPage() {
  const { data, isLoading } = useConsultants({ pageSize: 24 });

  return (
    <>
      <SEO
        title="Our consultants"
        description="Practitioners who have run the thing they advise on — strategy, finance, operations, technology and governance."
        path="/consultants"
      />

      <div className="aura border-b border-border">
        <div className="mx-auto max-w-7xl px-5 py-14 sm:px-8 sm:py-20">
          <p className="text-eyebrow uppercase text-accent">The team</p>
          <h1 className="mt-3 max-w-3xl text-h1">Practitioners, not presenters</h1>
          <p className="mt-5 max-w-2xl text-lg leading-relaxed text-muted-foreground">
            Every consultant here has run the thing they advise on. You meet the person whose name is on the profile —
            no account managers, no juniors on the call.
          </p>
        </div>
      </div>

      <Section className="!pt-12">
        <div className="grid gap-5 sm:grid-cols-2 lg:grid-cols-4">
          {isLoading ? (
            <CardGridSkeleton count={5} aspect="tall" />
          ) : (
            data?.items.map((consultant, index) => (
              <ConsultantCard key={consultant.id} consultant={consultant} index={index} />
            ))
          )}
        </div>
      </Section>
    </>
  );
}

export function ConsultantDetailPage() {
  const { slug } = useParams<{ slug: string }>();
  const { data: consultant, isLoading, isError } = useConsultant(slug);

  if (isLoading) {
    return (
      <div className="mx-auto max-w-7xl px-5 py-16 sm:px-8">
        <div className="skeleton h-24 w-24 rounded-full" />
        <div className="skeleton mt-6 h-10 w-1/3" />
        <div className="skeleton mt-4 h-32 w-full" />
      </div>
    );
  }

  if (isError || !consultant) {
    return (
      <Section>
        <EmptyState
          title="That profile could not be found"
          action={
            <Link to="/consultants">
              <Button>Meet the team</Button>
            </Link>
          }
        />
      </Section>
    );
  }

  return (
    <>
      <SEO
        title={`${consultant.fullName} — ${consultant.title}`}
        description={consultant.biography.slice(0, 300)}
        path={`/consultants/${consultant.slug}`}
        type="profile"
        structuredData={breadcrumbSchema([
          { name: 'Consultants', path: '/consultants' },
          { name: consultant.fullName, path: `/consultants/${consultant.slug}` },
        ])}
      />

      <div className="aura border-b border-border">
        <div className="mx-auto max-w-7xl px-5 py-14 sm:px-8 sm:py-20">
          <div className="flex flex-col gap-8 sm:flex-row sm:items-start">
            <Avatar name={consultant.fullName} src={consultant.avatarUrl} size="xl" className="size-28" />

            <div className="min-w-0 flex-1">
              <h1 className="text-h1">{consultant.fullName}</h1>
              <p className="mt-2 text-lg text-muted-foreground">{consultant.title}</p>

              <div className="mt-5 flex flex-wrap items-center gap-x-6 gap-y-3 text-sm text-muted-foreground">
                <Rating value={consultant.averageRating} count={consultant.reviewCount} size="md" />
                <span className="flex items-center gap-2">
                  <Award className="size-4" aria-hidden />
                  {consultant.yearsExperience} years
                </span>
                <span className="flex items-center gap-2">
                  <Users className="size-4" aria-hidden />
                  {consultant.completedSessions} sessions delivered
                </span>
              </div>

              <div className="mt-7 flex flex-wrap gap-3">
                <Link to={`/book?consultant=${consultant.id}`}>
                  <Button size="lg" iconRight={<ArrowRight className="size-4" aria-hidden />}>
                    Book with {consultant.firstName}
                  </Button>
                </Link>
                {consultant.linkedinUrl && (
                  <a href={consultant.linkedinUrl} target="_blank" rel="noopener noreferrer">
                    <Button size="lg" variant="secondary" icon={<LinkedInIcon className="size-4" />}>
                      LinkedIn
                    </Button>
                  </a>
                )}
              </div>

              {!consultant.isAcceptingBookings && (
                <Badge tone="warning" className="mt-4">
                  Not currently accepting new bookings
                </Badge>
              )}
            </div>
          </div>
        </div>
      </div>

      <Section className="!py-16">
        <div className="grid gap-14 lg:grid-cols-[1.6fr_1fr]">
          <div>
            <h2 className="text-h2">About</h2>
            <div className="prose-editorial mt-6">
              {consultant.biography.split('\n\n').map((paragraph, index) => (
                <p key={index}>{paragraph}</p>
              ))}
            </div>

            {consultant.services.length > 0 && (
              <>
                <Separator className="my-12" />
                <h2 className="text-h2">Consultations with {consultant.firstName}</h2>
                <div className="mt-6 grid gap-5 sm:grid-cols-2">
                  {consultant.services.map((service, index) => (
                    <ServiceCard key={service.id} service={service} index={index} />
                  ))}
                </div>
              </>
            )}
          </div>

          <aside className="space-y-5">
            <Card>
              <h3 className="flex items-center gap-2 text-[0.9375rem] font-semibold">
                <Award className="size-4 text-accent" aria-hidden />
                Specialties
              </h3>
              <ul className="mt-4 flex flex-wrap gap-1.5">
                {consultant.specialties.map((specialty) => (
                  <li key={specialty}>
                    <Badge tone="neutral">{specialty}</Badge>
                  </li>
                ))}
              </ul>
            </Card>

            <Card>
              <h3 className="flex items-center gap-2 text-[0.9375rem] font-semibold">
                <GraduationCap className="size-4 text-accent" aria-hidden />
                Qualifications
              </h3>
              <ul className="mt-4 space-y-2.5 text-sm text-muted-foreground">
                {consultant.qualifications.map((qualification) => (
                  <li key={qualification} className="flex gap-2.5">
                    <Check className="mt-0.5 size-4 shrink-0 text-success" aria-hidden />
                    {qualification}
                  </li>
                ))}
              </ul>
            </Card>

            <Card>
              <h3 className="flex items-center gap-2 text-[0.9375rem] font-semibold">
                <Languages className="size-4 text-accent" aria-hidden />
                Languages
              </h3>
              <p className="mt-3 text-sm text-muted-foreground">{consultant.languages.join(', ')}</p>
              <h3 className="mt-5 flex items-center gap-2 text-[0.9375rem] font-semibold">
                <Globe className="size-4 text-accent" aria-hidden />
                Timezone
              </h3>
              <p className="mt-3 text-sm text-muted-foreground">{consultant.timezone.replace(/_/g, ' ')}</p>
            </Card>
          </aside>
        </div>
      </Section>

      {consultant.reviews.length > 0 && (
        <Section className="bg-card">
          <SectionHeader eyebrow="Client feedback" title={`Working with ${consultant.firstName}`} />
          <div className="grid gap-5 sm:grid-cols-2 lg:grid-cols-3">
            {consultant.reviews.map((review, index) => (
              <ReviewCard key={review.id} review={review} index={index} />
            ))}
          </div>
        </Section>
      )}
    </>
  );
}

/* -------------------------------------------------------------------------- */
/* Reviews                                                                    */
/* -------------------------------------------------------------------------- */

export function ReviewsPage() {
  const [minRating, setMinRating] = useState<number | undefined>(undefined);
  const { data, isLoading } = usePublicReviews({ pageSize: 24, minRating });

  return (
    <>
      <SEO
        title="Client reviews"
        description="Verified reviews from clients who completed a consultation with Meridian Advisory."
        path="/reviews"
      />

      <div className="aura border-b border-border">
        <div className="mx-auto max-w-7xl px-5 py-14 sm:px-8 sm:py-20">
          <p className="text-eyebrow uppercase text-accent">Client reviews</p>
          <h1 className="mt-3 text-h1">What clients say afterwards</h1>
          {data?.averageRating && (
            <div className="mt-5 flex items-center gap-3">
              <Rating value={data.averageRating} size="md" />
              <span className="text-sm text-muted-foreground">
                across {data.meta.total} verified reviews
              </span>
            </div>
          )}
          <p className="mt-5 max-w-2xl text-muted-foreground">
            Every review here is attached to a completed, paid consultation. Reviews are moderated before publication
            but never edited.
          </p>
        </div>
      </div>

      <Section className="!pt-12">
        <div className="mb-8 flex flex-wrap gap-2" role="group" aria-label="Filter by rating">
          {[undefined, 5, 4].map((rating) => (
            <button
              key={rating ?? 'all'}
              type="button"
              onClick={() => setMinRating(rating)}
              aria-pressed={minRating === rating}
              className={cn(
                'rounded-full px-4 py-2 text-sm font-medium transition-colors',
                minRating === rating
                  ? 'bg-primary text-primary-foreground'
                  : 'bg-muted text-muted-foreground hover:text-foreground',
              )}
            >
              {rating ? `${rating} stars and above` : 'All reviews'}
            </button>
          ))}
        </div>

        <div className="grid gap-5 sm:grid-cols-2 lg:grid-cols-3">
          {isLoading ? (
            <CardGridSkeleton count={6} />
          ) : data && data.items.length > 0 ? (
            data.items.map((review, index) => <ReviewCard key={review.id} review={review} index={index} />)
          ) : (
            <div className="sm:col-span-2 lg:col-span-3">
              <EmptyState title="No reviews match that filter" />
            </div>
          )}
        </div>
      </Section>
    </>
  );
}

export { Reveal };
