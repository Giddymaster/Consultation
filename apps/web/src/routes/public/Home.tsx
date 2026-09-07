import { Link } from 'react-router-dom';
import {
  ArrowRight,
  BadgeCheck,
  CalendarCheck,
  CircleDollarSign,
  Compass,
  FileCheck2,
  Lock,
  MessageSquare,
  ShieldCheck,
  Sparkles,
  Video,
} from 'lucide-react';
import { Button, Card } from '@/components/ui';
import {
  ArticleCard,
  CardGridSkeleton,
  ConsultantCard,
  ProductCard,
  Reveal,
  ReviewCard,
  Section,
  SectionHeader,
  ServiceCard,
  StatBlock,
} from '@/components/marketing';
import { useArticles, useConsultants, useProducts, usePublicReviews, useServices } from '@/lib/queries';
import { SEO } from '@/components/SEO';

/**
 * Home page.
 *
 * The narrative order is deliberate: what we do → why trust us → how it works
 * → who you would work with → proof → what to read → act. Each section earns
 * the next; nothing is decoration.
 */

const HOW_IT_WORKS = [
  {
    step: '01',
    icon: Compass,
    title: 'Choose a service',
    description:
      'Pick the conversation that fits the decision in front of you. Each one states plainly what it covers and what you leave with.',
  },
  {
    step: '02',
    icon: CalendarCheck,
    title: 'Book your time',
    description:
      'Choose your consultant, duration and a time that suits you. Availability is live, so what you see is genuinely open.',
  },
  {
    step: '03',
    icon: Video,
    title: 'Meet your consultant',
    description:
      'Join by Zoom, Google Meet or Teams. Your calendar invitation and joining link arrive the moment payment clears.',
  },
  {
    step: '04',
    icon: FileCheck2,
    title: 'Move forward with clarity',
    description:
      'You receive a written summary, the recommendations we reached and a short list of actions with owners and dates.',
  },
];

const WHY_US = [
  {
    icon: BadgeCheck,
    title: 'Practitioners, not presenters',
    description:
      'Every consultant has run the thing they advise on — a plant, a fundraise, a board, an engineering organisation. You get judgement, not a framework.',
  },
  {
    icon: MessageSquare,
    title: 'A working session, not a pitch',
    description:
      'We read your material before we meet. The time is spent on your decision, not on orientation, and we will tell you when a question is bigger than the session.',
  },
  {
    icon: FileCheck2,
    title: 'Written up properly',
    description:
      'Every consultation ends with a structured record: what we discussed, what we found, what we recommend and what happens next.',
  },
  {
    icon: ShieldCheck,
    title: 'Confidential by default',
    description:
      'What you share stays between you and your consultant. Notes are access-controlled, and nothing is used as a case study without your written consent.',
  },
];

const TRUST_MARKERS = [
  { icon: Lock, label: 'Encrypted payments via Paystack' },
  { icon: ShieldCheck, label: 'Confidential engagements' },
  { icon: CircleDollarSign, label: 'Transparent fixed pricing' },
];

export function HomePage() {
  const { data: services, isLoading: servicesLoading } = useServices({ pageSize: 6, featured: true });
  const { data: consultants, isLoading: consultantsLoading } = useConsultants({ pageSize: 4 });
  const { data: articles, isLoading: articlesLoading } = useArticles({ pageSize: 3, isJournal: false });
  const { data: products } = useProducts({ pageSize: 4 });
  const { data: reviews } = usePublicReviews({ pageSize: 3, minRating: 4 });

  return (
    <>
      <SEO
        title="Meridian Advisory — Clarity for your next important decision"
        description="Strategy, finance and operations advisory for organisations at an inflection point. Book a working session with a practitioner who has run the thing they advise on."
        path="/"
      />

      {/* ---------------------------------------------------------------- */}
      {/* Hero                                                             */}
      {/* ---------------------------------------------------------------- */}

      <section className="aura relative overflow-hidden pt-16 pb-20 sm:pt-24 sm:pb-28 lg:pt-28 lg:pb-32">
        <div className="mx-auto grid max-w-7xl items-center gap-14 px-5 sm:px-8 lg:grid-cols-[1.05fr_0.95fr] lg:gap-20">
          <div>
            <Reveal>
              <p className="text-eyebrow inline-flex items-center gap-2 rounded-full bg-accent-soft px-3.5 py-1.5 uppercase text-accent">
                <Sparkles className="size-3" aria-hidden />
                Strategic consultation &amp; professional advisory
              </p>
            </Reveal>

            <Reveal delay={80}>
              <h1 className="mt-6 text-h1 sm:text-display">
                Clarity for your next
                <br />
                <span className="bg-gradient-to-br from-[hsl(var(--aura-one))] via-[hsl(var(--aura-two))] to-[hsl(var(--aura-three))] bg-clip-text text-transparent">
                  important decision.
                </span>
              </h1>
            </Reveal>

            <Reveal delay={140}>
              <p className="mt-6 max-w-xl text-lg leading-relaxed text-muted-foreground">
                Expert guidance. Clear decisions. Measurable progress. Meridian advises founder-led and mid-market
                organisations across East and West Africa on the small number of choices that shape the next decade.
              </p>
            </Reveal>

            <Reveal delay={200}>
              <div className="mt-9 flex flex-col gap-3 sm:flex-row">
                <Link to="/book">
                  <Button size="lg" className="w-full sm:w-auto" iconRight={<ArrowRight className="size-4" aria-hidden />}>
                    Book a consultation
                  </Button>
                </Link>
                <Link to="/services">
                  <Button size="lg" variant="secondary" className="w-full sm:w-auto">
                    Explore our services
                  </Button>
                </Link>
              </div>
            </Reveal>

            <Reveal delay={260}>
              <ul className="mt-10 flex flex-wrap gap-x-6 gap-y-3">
                {TRUST_MARKERS.map((marker) => (
                  <li key={marker.label} className="flex items-center gap-2 text-xs text-muted-foreground">
                    <marker.icon className="size-3.5 shrink-0 text-success" aria-hidden />
                    {marker.label}
                  </li>
                ))}
              </ul>
            </Reveal>
          </div>

          <Reveal delay={220} className="hidden lg:block">
            <HeroVisual />
          </Reveal>
        </div>
      </section>

      {/* ---------------------------------------------------------------- */}
      {/* Trust statistics                                                 */}
      {/* ---------------------------------------------------------------- */}

      <section className="border-y border-border bg-card">
        <div className="mx-auto grid max-w-7xl gap-10 px-5 py-14 sm:grid-cols-2 sm:px-8 lg:grid-cols-4">
          <StatBlock value={18} suffix="+" label="Years of combined practice" index={0} />
          <StatBlock value={1240} suffix="+" label="Consultations completed" index={1} />
          <StatBlock value={310} suffix="+" label="Organisations served" index={2} />
          <StatBlock value={4.8} label="Average client rating" index={3} />
        </div>
      </section>

      {/* ---------------------------------------------------------------- */}
      {/* Services                                                         */}
      {/* ---------------------------------------------------------------- */}

      <Section>
        <SectionHeader
          eyebrow="What we do"
          title="Consultations built around a decision"
          description="Each engagement is scoped to a question you are actually trying to answer. Fixed fee, stated duration, written outcome."
          action={
            <Link to="/services">
              <Button variant="secondary" iconRight={<ArrowRight className="size-4" aria-hidden />}>
                All services
              </Button>
            </Link>
          }
        />

        <div className="grid gap-5 sm:grid-cols-2 lg:grid-cols-3">
          {servicesLoading ? (
            <CardGridSkeleton count={6} />
          ) : (
            services?.items.map((service, index) => (
              <ServiceCard key={service.id} service={service} index={index} />
            ))
          )}
        </div>
      </Section>

      {/* ---------------------------------------------------------------- */}
      {/* Why us                                                           */}
      {/* ---------------------------------------------------------------- */}

      <Section aura className="bg-card">
        <SectionHeader
          eyebrow="Why Meridian"
          title="Advice you can act on by Friday"
          description="We are deliberately unglamorous about this work: get the numbers honest, name the decisions that matter, and build the discipline to follow through."
        />

        <div className="grid gap-5 sm:grid-cols-2">
          {WHY_US.map((item, index) => (
            <Reveal key={item.title} delay={index * 70}>
              <Card className="h-full">
                <div className="mb-5 flex size-11 items-center justify-center rounded-[var(--radius-control)] bg-accent-soft text-accent">
                  <item.icon className="size-5" aria-hidden />
                </div>
                <h3 className="text-h3">{item.title}</h3>
                <p className="mt-2.5 text-sm leading-relaxed text-muted-foreground">{item.description}</p>
              </Card>
            </Reveal>
          ))}
        </div>
      </Section>

      {/* ---------------------------------------------------------------- */}
      {/* How it works                                                     */}
      {/* ---------------------------------------------------------------- */}

      <Section>
        <SectionHeader eyebrow="How it works" title="Four steps, no ambiguity" align="center" />

        <ol className="grid gap-8 sm:grid-cols-2 lg:grid-cols-4">
          {HOW_IT_WORKS.map((step, index) => (
            <Reveal key={step.step} delay={index * 80} as="li">
              <div className="relative">
                <span className="text-h2 block text-border" aria-hidden>
                  {step.step}
                </span>
                <div className="mt-4 flex size-10 items-center justify-center rounded-[var(--radius-control)] bg-primary text-primary-foreground">
                  <step.icon className="size-5" aria-hidden />
                </div>
                <h3 className="mt-5 text-h3">{step.title}</h3>
                <p className="mt-2.5 text-sm leading-relaxed text-muted-foreground">{step.description}</p>
              </div>
            </Reveal>
          ))}
        </ol>
      </Section>

      {/* ---------------------------------------------------------------- */}
      {/* Consultants                                                      */}
      {/* ---------------------------------------------------------------- */}

      <Section className="bg-card">
        <SectionHeader
          eyebrow="Who you meet"
          title="The people you would actually work with"
          description="No account managers, no juniors on the call. You meet the person whose name is on the profile."
          action={
            <Link to="/consultants">
              <Button variant="secondary" iconRight={<ArrowRight className="size-4" aria-hidden />}>
                Meet the team
              </Button>
            </Link>
          }
        />

        <div className="grid gap-5 sm:grid-cols-2 lg:grid-cols-4">
          {consultantsLoading ? (
            <CardGridSkeleton count={4} aspect="tall" />
          ) : (
            consultants?.items.map((consultant, index) => (
              <ConsultantCard key={consultant.id} consultant={consultant} index={index} />
            ))
          )}
        </div>
      </Section>

      {/* ---------------------------------------------------------------- */}
      {/* Reviews                                                          */}
      {/* ---------------------------------------------------------------- */}

      {reviews && reviews.items.length > 0 && (
        <Section>
          <SectionHeader
            eyebrow="In their words"
            title="What clients say afterwards"
            description={
              reviews.averageRating
                ? `Averaging ${reviews.averageRating.toFixed(1)} out of 5 across ${reviews.meta.total} verified reviews.`
                : undefined
            }
            action={
              <Link to="/reviews">
                <Button variant="secondary" iconRight={<ArrowRight className="size-4" aria-hidden />}>
                  All reviews
                </Button>
              </Link>
            }
          />

          <div className="grid gap-5 sm:grid-cols-2 lg:grid-cols-3">
            {reviews.items.map((review, index) => (
              <ReviewCard key={review.id} review={review} index={index} />
            ))}
          </div>
        </Section>
      )}

      {/* ---------------------------------------------------------------- */}
      {/* Insights                                                         */}
      {/* ---------------------------------------------------------------- */}

      <Section className="bg-card">
        <SectionHeader
          eyebrow="Latest insights"
          title="Thinking worth your time"
          description="Short pieces on the decisions our clients are actually wrestling with."
          action={
            <Link to="/insights">
              <Button variant="secondary" iconRight={<ArrowRight className="size-4" aria-hidden />}>
                All insights
              </Button>
            </Link>
          }
        />

        <div className="grid gap-5 sm:grid-cols-2 lg:grid-cols-3">
          {articlesLoading ? (
            <CardGridSkeleton count={3} aspect="tall" />
          ) : (
            articles?.items.map((article, index) => (
              <ArticleCard key={article.id} article={article} index={index} />
            ))
          )}
        </div>
      </Section>

      {/* ---------------------------------------------------------------- */}
      {/* Resources                                                        */}
      {/* ---------------------------------------------------------------- */}

      {products && products.items.length > 0 && (
        <Section>
          <SectionHeader
            eyebrow="Books, journals &amp; reports"
            title="Take the thinking with you"
            description="Our books, research reports and working templates — the same instruments we use in engagements."
            action={
              <Link to="/shop">
                <Button variant="secondary" iconRight={<ArrowRight className="size-4" aria-hidden />}>
                  Browse resources
                </Button>
              </Link>
            }
          />

          <div className="grid gap-5 sm:grid-cols-2 lg:grid-cols-4">
            {products.items.map((product, index) => (
              <ProductCard key={product.id} product={product} index={index} />
            ))}
          </div>
        </Section>
      )}

      {/* ---------------------------------------------------------------- */}
      {/* CTA                                                              */}
      {/* ---------------------------------------------------------------- */}

      <Section>
        <Reveal>
          <div className="aura relative overflow-hidden rounded-[var(--radius-card)] bg-primary px-8 py-16 text-center sm:px-16 sm:py-20">
            <div className="relative mx-auto max-w-2xl">
              <h2 className="text-h1 text-primary-foreground">Start with a conversation.</h2>
              <p className="mx-auto mt-5 max-w-lg text-[1.0625rem] leading-relaxed text-primary-foreground/70">
                Twenty minutes, no charge, no follow-up sales sequence. We will tell you honestly whether we are the
                right firm for what you need.
              </p>

              <div className="mt-9 flex flex-col justify-center gap-3 sm:flex-row">
                <Link to="/book?service=introductory-call">
                  <Button
                    size="lg"
                    variant="accent"
                    className="w-full sm:w-auto"
                    iconRight={<ArrowRight className="size-4" aria-hidden />}
                  >
                    Book a free introductory call
                  </Button>
                </Link>
                <Link to="/contact">
                  <Button
                    size="lg"
                    variant="ghost"
                    className="w-full text-primary-foreground hover:bg-primary-foreground/10 sm:w-auto"
                  >
                    Send us a message
                  </Button>
                </Link>
              </div>
            </div>
          </div>
        </Reveal>
      </Section>
    </>
  );
}

/**
 * Abstract hero visual: a stylised booking summary and availability grid.
 * Built from the product's own vocabulary rather than a stock photograph, so
 * the hero shows what the platform actually does.
 */
function HeroVisual() {
  return (
    <div className="relative" aria-hidden>
      <div className="absolute -inset-6 rounded-[2rem] bg-gradient-to-br from-[hsl(var(--aura-one)/0.18)] via-transparent to-[hsl(var(--aura-three)/0.18)] blur-2xl" />

      <div className="relative space-y-4">
        <Card className="shadow-[var(--shadow-lifted)]">
          <div className="flex items-center justify-between">
            <div>
              <p className="text-eyebrow uppercase text-muted-foreground">Next consultation</p>
              <p className="mt-1.5 font-semibold tracking-tight">Business Strategy Consultation</p>
            </div>
            <span className="rounded-full bg-success-soft px-2.5 py-1 text-xs font-medium text-success">Confirmed</span>
          </div>

          <div className="mt-5 grid grid-cols-3 gap-4 border-t border-border pt-5 text-sm">
            <div>
              <p className="text-xs text-muted-foreground">Consultant</p>
              <p className="mt-0.5 font-medium">A. Mwangi</p>
            </div>
            <div>
              <p className="text-xs text-muted-foreground">Duration</p>
              <p className="tabular mt-0.5 font-medium">60 min</p>
            </div>
            <div>
              <p className="text-xs text-muted-foreground">Platform</p>
              <p className="mt-0.5 font-medium">Zoom</p>
            </div>
          </div>
        </Card>

        <Card className="shadow-[var(--shadow-raised)]">
          <p className="text-eyebrow uppercase text-muted-foreground">Available times</p>
          <div className="mt-4 grid grid-cols-4 gap-2">
            {['09:00', '09:30', '10:00', '10:30', '11:00', '13:30', '14:00', '14:30'].map((time, index) => (
              <span
                key={time}
                className={
                  index === 3
                    ? 'rounded-lg bg-accent px-2 py-2 text-center text-xs font-medium text-accent-foreground'
                    : index === 5
                      ? 'rounded-lg bg-muted px-2 py-2 text-center text-xs font-medium text-muted-foreground/40 line-through'
                      : 'rounded-lg bg-muted px-2 py-2 text-center text-xs font-medium text-muted-foreground'
                }
              >
                {time}
              </span>
            ))}
          </div>
        </Card>

        <Card className="flex items-center gap-4 shadow-[var(--shadow-raised)]">
          <div className="flex size-10 items-center justify-center rounded-full bg-success-soft text-success">
            <CircleDollarSign className="size-5" />
          </div>
          <div className="flex-1">
            <p className="text-sm font-medium">Booking fee received</p>
            <p className="text-xs text-muted-foreground">KES 500 · balance KES 2,000 before session</p>
          </div>
        </Card>
      </div>
    </div>
  );
}
