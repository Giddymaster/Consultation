import { useEffect, useRef, useState, type ReactNode } from 'react';
import { Link } from 'react-router-dom';
import { ArrowRight, ArrowUpRight, Clock, Quote, Users } from 'lucide-react';
import type { ArticleSummaryDto, ConsultantSummaryDto, ProductSummaryDto, ReviewDto, ServiceSummaryDto } from '@meridian/types';
import { Avatar, Badge, Card, Rating } from '@/components/ui';
import { cn, formatDate, formatDuration, money, truncate } from '@/lib/utils';

/** Read once, synchronously — this is known before the first paint. */
function prefersReducedMotion(): boolean {
  return window.matchMedia('(prefers-reduced-motion: reduce)').matches;
}

/* -------------------------------------------------------------------------- */
/* Motion primitives                                                          */
/* -------------------------------------------------------------------------- */

/**
 * Reveals children when they enter the viewport.
 *
 * The observer is disconnected after the first reveal — content should not
 * re-animate when scrolled past twice. Users who prefer reduced motion get the
 * content immediately; the CSS neutralises the transform for them.
 */
export function Reveal({
  children,
  delay = 0,
  className,
  as: Tag = 'div',
}: {
  children: ReactNode;
  delay?: number;
  className?: string;
  as?: 'div' | 'section' | 'li' | 'article';
}) {
  const ref = useRef<HTMLElement>(null);

  // Reduced motion is known before the first paint, so it belongs in the
  // initial state rather than in an effect that corrects it a render later.
  // Setting it in the effect also meant one frame at `data-visible={false}` —
  // a flash of hidden content for exactly the users who asked for less motion.
  const [visible, setVisible] = useState(prefersReducedMotion);

  useEffect(() => {
    const element = ref.current;
    if (!element || visible) return;

    const observer = new IntersectionObserver(
      ([entry]) => {
        if (entry?.isIntersecting) {
          setVisible(true);
          observer.disconnect();
        }
      },
      { rootMargin: '0px 0px -12% 0px', threshold: 0.05 },
    );

    observer.observe(element);
    return () => observer.disconnect();
  }, [visible]);

  return (
    <Tag
      ref={ref as never}
      className={cn('reveal', className)}
      data-visible={visible}
      style={{ transitionDelay: `${delay}ms` }}
    >
      {children}
    </Tag>
  );
}

/**
 * Counts up to a value once visible. The final value is rendered immediately
 * for reduced-motion users and is always the DOM text, so it is never a
 * partially-counted number to a screen reader.
 */
export function CountUp({
  value,
  suffix = '',
  prefix = '',
  duration = 1600,
}: {
  value: number;
  suffix?: string;
  prefix?: string;
  duration?: number;
}) {
  // Preserve the precision of the target: a 4.8 rating must not land on "5".
  const decimals = (String(value).split('.')[1] ?? '').length;
  const ref = useRef<HTMLSpanElement>(null);

  // Same reasoning as `Reveal`: a reduced-motion reader gets the final figure
  // in the first render, not a zero that is corrected afterwards.
  const [display, setDisplay] = useState(() => (prefersReducedMotion() ? value : 0));
  const started = useRef(false);

  useEffect(() => {
    const element = ref.current;
    if (!element || started.current || prefersReducedMotion()) return;

    const observer = new IntersectionObserver(([entry]) => {
      if (!entry?.isIntersecting || started.current) return;
      started.current = true;
      observer.disconnect();

      const start = performance.now();
      const tick = (now: number) => {
        const progress = Math.min(1, (now - start) / duration);
        // Ease-out cubic: fast early, settling gently on the final figure.
        const eased = 1 - (1 - progress) ** 3;
        const factor = 10 ** decimals;
        setDisplay(Math.round(value * eased * factor) / factor);
        if (progress < 1) requestAnimationFrame(tick);
      };
      requestAnimationFrame(tick);
    });

    observer.observe(element);
    return () => observer.disconnect();
  }, [value, duration, decimals]);

  return (
    <span ref={ref} className="tabular">
      {prefix}
      {display.toLocaleString(undefined, {
        minimumFractionDigits: decimals,
        maximumFractionDigits: decimals,
      })}
      {suffix}
    </span>
  );
}

/* -------------------------------------------------------------------------- */
/* Section furniture                                                          */
/* -------------------------------------------------------------------------- */

export function Section({
  children,
  className,
  aura,
  id,
}: {
  children: ReactNode;
  className?: string;
  aura?: boolean;
  id?: string;
}) {
  return (
    <section id={id} className={cn(aura && 'aura', 'py-20 sm:py-24 lg:py-28', className)}>
      <div className="mx-auto max-w-7xl px-5 sm:px-8">{children}</div>
    </section>
  );
}

export function SectionHeader({
  eyebrow,
  title,
  description,
  action,
  align = 'left',
  className,
}: {
  eyebrow?: string;
  title: string;
  description?: string;
  action?: ReactNode;
  align?: 'left' | 'center';
  className?: string;
}) {
  return (
    <div
      className={cn(
        'mb-12 flex flex-col gap-5 sm:flex-row sm:items-end sm:justify-between',
        align === 'center' && 'sm:flex-col sm:items-center sm:text-center',
        className,
      )}
    >
      <div className={cn('max-w-2xl', align === 'center' && 'mx-auto')}>
        {eyebrow && (
          <p className="mb-3 text-eyebrow uppercase text-accent">{eyebrow}</p>
        )}
        <h2 className="text-h2">{title}</h2>
        {description && (
          <p className="mt-4 text-[1.0625rem] leading-relaxed text-muted-foreground">{description}</p>
        )}
      </div>
      {action && <div className="shrink-0">{action}</div>}
    </div>
  );
}

/* -------------------------------------------------------------------------- */
/* Cards                                                                      */
/* -------------------------------------------------------------------------- */

export function ServiceCard({ service, index = 0 }: { service: ServiceSummaryDto; index?: number }) {
  return (
    <Reveal delay={index * 60} as="article" className="h-full">
      <Link to={`/services/${service.slug}`} className="group block h-full">
        <Card interactive className="flex h-full flex-col">
          <div className="mb-5 flex items-start justify-between gap-3">
            <Badge tone="neutral">{service.category.name}</Badge>
            {service.averageRating !== null && <Rating value={service.averageRating} count={service.reviewCount} />}
          </div>

          <h3 className="text-h3 transition-colors group-hover:text-accent">{service.name}</h3>
          <p className="mt-2.5 flex-1 text-sm leading-relaxed text-muted-foreground">
            {truncate(service.shortDescription, 150)}
          </p>

          <dl className="mt-6 flex flex-wrap items-center gap-x-5 gap-y-2 text-xs text-muted-foreground">
            <div className="flex items-center gap-1.5">
              <dt className="sr-only">Duration</dt>
              <Clock className="size-3.5" aria-hidden />
              <dd>{formatDuration(service.defaultDurationMinutes)}</dd>
            </div>
            <div className="flex items-center gap-1.5">
              <dt className="sr-only">Consultants available</dt>
              <Users className="size-3.5" aria-hidden />
              <dd>
                {service.consultantCount} consultant{service.consultantCount === 1 ? '' : 's'}
              </dd>
            </div>
          </dl>

          <div className="mt-5 flex items-end justify-between border-t border-border pt-5">
            <div>
              <p className="text-xs text-muted-foreground">
                {service.startingPrice === 0 ? 'Complimentary' : 'From'}
              </p>
              <p className="text-lg font-semibold tracking-tight">
                {service.startingPrice === 0 ? 'No charge' : money(service.startingPrice, service.currency)}
              </p>
            </div>
            <span
              aria-hidden
              className="flex size-9 items-center justify-center rounded-full bg-muted text-muted-foreground transition-all duration-300 ease-[var(--ease-out-quint)] group-hover:bg-accent group-hover:text-accent-foreground motion-safe:group-hover:translate-x-0.5"
            >
              <ArrowRight className="size-4" />
            </span>
          </div>
        </Card>
      </Link>
    </Reveal>
  );
}

export function ConsultantCard({ consultant, index = 0 }: { consultant: ConsultantSummaryDto; index?: number }) {
  return (
    <Reveal delay={index * 60} as="article" className="h-full">
      <Link to={`/consultants/${consultant.slug}`} className="group block h-full">
        <Card interactive className="flex h-full flex-col text-center">
          <div className="mx-auto">
            <Avatar name={consultant.fullName} src={consultant.avatarUrl} size="xl" />
          </div>

          <h3 className="mt-5 text-h3 transition-colors group-hover:text-accent">{consultant.fullName}</h3>
          <p className="mt-1 text-sm text-muted-foreground">{consultant.title}</p>

          <div className="mt-4 flex flex-wrap justify-center gap-1.5">
            {consultant.specialties.slice(0, 3).map((specialty) => (
              <Badge key={specialty} tone="neutral" className="text-[0.6875rem]">
                {specialty}
              </Badge>
            ))}
          </div>

          <dl className="mt-6 flex flex-1 items-end justify-center gap-6 border-t border-border pt-5 text-center">
            <div>
              <dt className="text-[0.6875rem] uppercase tracking-wide text-muted-foreground">Experience</dt>
              <dd className="tabular mt-0.5 text-sm font-semibold">{consultant.yearsExperience} yrs</dd>
            </div>
            <div>
              <dt className="text-[0.6875rem] uppercase tracking-wide text-muted-foreground">Sessions</dt>
              <dd className="tabular mt-0.5 text-sm font-semibold">{consultant.completedSessions}</dd>
            </div>
            <div>
              <dt className="text-[0.6875rem] uppercase tracking-wide text-muted-foreground">Rating</dt>
              <dd className="tabular mt-0.5 text-sm font-semibold">
                {consultant.averageRating?.toFixed(1) ?? '—'}
              </dd>
            </div>
          </dl>
        </Card>
      </Link>
    </Reveal>
  );
}

export function ArticleCard({
  article,
  index = 0,
  featured,
}: {
  article: ArticleSummaryDto;
  index?: number;
  featured?: boolean;
}) {
  const href = article.isJournal ? `/journal/${article.slug}` : `/insights/${article.slug}`;

  return (
    <Reveal delay={index * 60} as="article" className="h-full">
      <Link to={href} className="group block h-full">
        <Card interactive padded={false} className="flex h-full flex-col overflow-hidden">
          {article.featuredImageUrl && (
            <div className="aspect-[16/9] overflow-hidden bg-muted">
              <img
                src={article.featuredImageUrl}
                alt=""
                loading="lazy"
                className="size-full object-cover transition-transform duration-500 ease-[var(--ease-out-quint)] group-hover:scale-105 motion-reduce:group-hover:scale-100"
              />
            </div>
          )}

          <div className={cn('flex flex-1 flex-col p-6', featured && 'sm:p-8')}>
            <div className="mb-3 flex items-center gap-2">
              <Badge tone={article.isJournal ? 'accent' : 'neutral'}>
                {article.isJournal ? 'Journal' : article.category.name}
              </Badge>
              <span className="text-xs text-muted-foreground">{article.readingMinutes} min read</span>
            </div>

            <h3 className={cn('transition-colors group-hover:text-accent', featured ? 'text-h2' : 'text-h3')}>
              {article.title}
            </h3>
            <p className="mt-3 flex-1 text-sm leading-relaxed text-muted-foreground">
              {truncate(article.excerpt, featured ? 240 : 140)}
            </p>

            <div className="mt-6 flex items-center gap-3 border-t border-border pt-5">
              {article.author && (
                <>
                  <Avatar name={article.author.fullName} src={article.author.avatarUrl} size="xs" />
                  <div className="min-w-0 flex-1">
                    <p className="truncate text-xs font-medium text-foreground">{article.author.fullName}</p>
                    {article.publishedAt && (
                      <p className="text-[0.6875rem] text-muted-foreground">{formatDate(article.publishedAt)}</p>
                    )}
                  </div>
                </>
              )}
              <ArrowUpRight
                className="size-4 shrink-0 text-muted-foreground transition-colors group-hover:text-accent"
                aria-hidden
              />
            </div>
          </div>
        </Card>
      </Link>
    </Reveal>
  );
}

export function ProductCard({ product, index = 0 }: { product: ProductSummaryDto; index?: number }) {
  return (
    <Reveal delay={index * 60} as="article" className="h-full">
      <Link to={`/shop/${product.slug}`} className="group block h-full">
        <Card interactive padded={false} className="flex h-full flex-col overflow-hidden">
          <div className="relative aspect-[3/4] overflow-hidden bg-gradient-to-br from-muted to-accent-soft">
            {product.coverImageUrl ? (
              <img
                src={product.coverImageUrl}
                alt=""
                loading="lazy"
                className="size-full object-cover transition-transform duration-500 ease-[var(--ease-out-quint)] group-hover:scale-105 motion-reduce:group-hover:scale-100"
              />
            ) : (
              // A typographic placeholder rather than a stock image: this is a
              // real product with no cover yet, and it should look deliberate.
              <div className="flex size-full flex-col justify-between p-5">
                <span className="text-eyebrow uppercase text-accent">{product.category.name}</span>
                <span className="text-lg leading-tight font-semibold tracking-tight text-foreground">
                  {truncate(product.name, 60)}
                </span>
              </div>
            )}
            {product.compareAtPrice && product.compareAtPrice > product.price && (
              <Badge tone="destructive" className="absolute top-3 right-3">
                Save {Math.round((1 - product.price / product.compareAtPrice) * 100)}%
              </Badge>
            )}
          </div>

          <div className="flex flex-1 flex-col p-5">
            <p className="text-[0.6875rem] uppercase tracking-wide text-muted-foreground">
              {product.type === 'DIGITAL' ? 'Digital download' : 'Print edition'}
            </p>
            <h3 className="mt-1.5 text-[0.9375rem] leading-snug font-semibold transition-colors group-hover:text-accent">
              {product.name}
            </h3>
            {product.author && <p className="mt-1 text-xs text-muted-foreground">{product.author}</p>}

            <div className="mt-4 flex flex-1 items-end justify-between">
              <p className="text-base font-semibold tracking-tight">{money(product.price, product.currency)}</p>
              {!product.inStock && (
                <Badge tone="neutral" className="text-[0.6875rem]">
                  Out of stock
                </Badge>
              )}
            </div>
          </div>
        </Card>
      </Link>
    </Reveal>
  );
}

export function ReviewCard({ review, index = 0 }: { review: ReviewDto; index?: number }) {
  return (
    <Reveal delay={index * 60} as="article" className="h-full">
      <Card className="flex h-full flex-col">
        <Quote className="size-6 text-accent/30" aria-hidden />

        {review.title && <h3 className="mt-4 text-[0.9375rem] font-semibold">{review.title}</h3>}
        <blockquote className="mt-2.5 flex-1 text-sm leading-relaxed text-muted-foreground">
          “{truncate(review.body, 280)}”
        </blockquote>

        <footer className="mt-6 border-t border-border pt-5">
          <Rating value={review.rating} size="md" />
          <div className="mt-3 flex items-center gap-2.5">
            <Avatar name={review.authorName} size="xs" />
            <div className="min-w-0">
              <p className="flex items-center gap-1.5 text-xs font-medium text-foreground">
                {review.authorName}
                {review.isVerified && (
                  <span className="inline-flex items-center gap-1 text-success" title="Verified client">
                    <svg viewBox="0 0 16 16" className="size-3" fill="currentColor" aria-hidden>
                      <path d="M8 0l2 1.5 2.5-.3.8 2.4 2 1.5-1 2.3 1 2.3-2 1.5-.8 2.4-2.5-.3L8 16l-2-1.5-2.5.3-.8-2.4-2-1.5 1-2.3-1-2.3 2-1.5.8-2.4 2.5.3L8 0zm3.2 5.6l-4 4-2-2-1 1 3 3 5-5-1-1z" />
                    </svg>
                    <span className="sr-only">Verified client</span>
                  </span>
                )}
              </p>
              <p className="text-[0.6875rem] text-muted-foreground">
                {review.serviceName ?? 'Consultation'} · {formatDate(review.createdAt)}
              </p>
            </div>
          </div>
        </footer>
      </Card>
    </Reveal>
  );
}

/* -------------------------------------------------------------------------- */
/* Stats                                                                      */
/* -------------------------------------------------------------------------- */

export function StatBlock({
  value,
  label,
  suffix,
  prefix,
  index = 0,
}: {
  value: number;
  label: string;
  suffix?: string;
  prefix?: string;
  index?: number;
}) {
  return (
    <Reveal delay={index * 80} className="text-center sm:text-left">
      <p className="text-h1">
        <CountUp value={value} suffix={suffix} prefix={prefix} />
      </p>
      <p className="mt-2 text-sm text-muted-foreground">{label}</p>
    </Reveal>
  );
}

/** Card grid skeleton, shaped like the cards it replaces. */
export function CardGridSkeleton({ count = 3, aspect = 'card' }: { count?: number; aspect?: 'card' | 'tall' }) {
  return (
    <>
      {Array.from({ length: count }).map((_, index) => (
        <div
          key={index}
          className={cn(
            'skeleton rounded-[var(--radius-card)]',
            aspect === 'tall' ? 'h-[26rem]' : 'h-64',
          )}
          aria-hidden
        />
      ))}
    </>
  );
}
