import { useState } from 'react';
import { Link, useParams } from 'react-router-dom';
import { useForm } from 'react-hook-form';
import { zodResolver } from '@hookform/resolvers/zod';
import { z } from 'zod';
import {
  ArrowLeft,
  ArrowRight,
  Building2,
  CheckCircle2,
  Clock,
  Compass,
  Home,
  Lock,
  Mail,
  MapPin,
  Phone,
  SearchX,
  ServerCrash,
  ShieldOff,
} from 'lucide-react';
import { Button, Card, ErrorSummary, Field, Input, Textarea } from '@/components/ui';
import { CountUp, Reveal, Section, SectionHeader } from '@/components/marketing';
import { SEO } from '@/components/SEO';
import { organizationSchema } from '@/lib/structured-data';
import { useContactForm } from '@/lib/queries';
import { ApiError } from '@/lib/api';

/* -------------------------------------------------------------------------- */
/* About                                                                      */
/* -------------------------------------------------------------------------- */

const VALUES = [
  {
    title: 'Say the difficult thing',
    body: 'If the plan does not work, we say so in the first hour rather than the last. Clients pay us for judgement, not for agreement.',
  },
  {
    title: 'Scope to a decision',
    body: 'Open-ended reviews produce open-ended invoices. Every engagement names the decision it exists to inform.',
  },
  {
    title: 'Leave capability behind',
    body: 'We hand over the models, the templates and the reasoning. If you need us for the same problem twice, we did it wrong the first time.',
  },
  {
    title: 'Decline the wrong work',
    body: 'We turn down engagements where we are not the right firm. It costs revenue and it is the reason clients come back.',
  },
];

export function AboutPage() {
  return (
    <>
      <SEO
        title="About Meridian Advisory"
        description="A Nairobi-based advisory firm working with founder-led and mid-market organisations across East and West Africa."
        path="/about"
        structuredData={organizationSchema()}
      />

      <div className="aura border-b border-border">
        <div className="mx-auto max-w-7xl px-5 py-14 sm:px-8 sm:py-20">
          <p className="text-eyebrow uppercase text-accent">About us</p>
          <h1 className="mt-3 max-w-3xl text-h1">Advisory work, done properly</h1>
          <p className="mt-5 max-w-2xl text-lg leading-relaxed text-muted-foreground">
            Meridian was founded in 2019 by three partners who had spent their careers on the operating side and were
            tired of advice that arrived as a slide deck and left as one.
          </p>
        </div>
      </div>

      <Section>
        <div className="grid gap-14 lg:grid-cols-[1.5fr_1fr]">
          <div className="prose-editorial">
            <p>
              We work with organisations at an inflection point — a market entry, a fundraise, a succession, a system
              replacement, a turnaround. The common thread is that a small number of decisions are about to determine
              the next several years, and the team making them would benefit from someone who has made that decision
              before.
            </p>
            <h2>How we work</h2>
            <p>
              Most of our engagements start as a single consultation. You bring the question; we spend the time
              pressure-testing the reasoning, naming the assumptions carrying the most risk, and agreeing what evidence
              would change your mind. You leave with a written record and a short list of actions.
            </p>
            <p>
              Some of those conversations become longer engagements. Many do not, and that is a perfectly good outcome
              — a decision made confidently in ninety minutes is worth more than a three-month review that arrives
              after the window has closed.
            </p>
            <h2>Where we work</h2>
            <p>
              We are based in Nairobi and work across Kenya, Uganda, Tanzania, Rwanda, Nigeria and Ghana. Most
              consultations happen online; we travel for engagements that genuinely need us in the room.
            </p>
          </div>

          <aside className="space-y-5">
            <Card>
              <p className="text-h1">
                <CountUp value={310} suffix="+" />
              </p>
              <p className="mt-1.5 text-sm text-muted-foreground">Organisations advised since 2019</p>
            </Card>
            <Card>
              <p className="text-h1">
                <CountUp value={1240} suffix="+" />
              </p>
              <p className="mt-1.5 text-sm text-muted-foreground">Consultations delivered</p>
            </Card>
            <Card>
              <p className="text-h1">6</p>
              <p className="mt-1.5 text-sm text-muted-foreground">Countries served</p>
            </Card>
          </aside>
        </div>
      </Section>

      <Section className="bg-card">
        <SectionHeader eyebrow="How we operate" title="Four commitments" align="center" />
        <div className="grid gap-5 sm:grid-cols-2">
          {VALUES.map((value, index) => (
            <Reveal key={value.title} delay={index * 70}>
              <Card className="h-full">
                <h3 className="text-h3">{value.title}</h3>
                <p className="mt-2.5 text-sm leading-relaxed text-muted-foreground">{value.body}</p>
              </Card>
            </Reveal>
          ))}
        </div>
      </Section>

      <Section>
        <div className="aura relative overflow-hidden rounded-[var(--radius-card)] bg-primary px-8 py-14 text-center sm:px-16">
          <h2 className="text-h2 text-primary-foreground">Start with a conversation</h2>
          <p className="mx-auto mt-4 max-w-lg text-primary-foreground/70">
            Twenty minutes, no charge. We will tell you honestly whether we are the right firm.
          </p>
          <Link to="/book?service=introductory-call" className="mt-8 inline-block">
            <Button size="lg" variant="accent" iconRight={<ArrowRight className="size-4" aria-hidden />}>
              Book an introductory call
            </Button>
          </Link>
        </div>
      </Section>
    </>
  );
}

/* -------------------------------------------------------------------------- */
/* Contact                                                                    */
/* -------------------------------------------------------------------------- */

const contactSchema = z.object({
  name: z.string().trim().min(2, 'Please tell us your name').max(160),
  email: z.email('Enter a valid email address'),
  phone: z.string().trim().max(32).optional(),
  company: z.string().trim().max(160).optional(),
  subject: z.string().trim().min(3, 'Give your message a subject').max(200),
  message: z.string().trim().min(10, 'Please give us a little more detail').max(5000),
});

type ContactInput = z.infer<typeof contactSchema>;

export function ContactPage() {
  const [sent, setSent] = useState(false);
  const [formError, setFormError] = useState<string | null>(null);
  const submitContact = useContactForm();

  const form = useForm<ContactInput>({ resolver: zodResolver(contactSchema) });

  const onSubmit = form.handleSubmit(async (values) => {
    setFormError(null);
    try {
      await submitContact.mutateAsync(values);
      setSent(true);
    } catch (error) {
      setFormError(
        error instanceof ApiError ? error.message : 'Your message could not be sent. Please email us directly.',
      );
    }
  });

  const errors = Object.values(form.formState.errors)
    .map((error) => error?.message)
    .filter((message): message is string => Boolean(message));

  return (
    <>
      <SEO
        title="Contact us"
        description="Get in touch with Meridian Advisory in Nairobi — or book a free twenty-minute introductory call."
        path="/contact"
      />

      <div className="aura border-b border-border">
        <div className="mx-auto max-w-7xl px-5 py-14 sm:px-8 sm:py-20">
          <p className="text-eyebrow uppercase text-accent">Contact</p>
          <h1 className="mt-3 text-h1">Get in touch</h1>
          <p className="mt-5 max-w-2xl text-lg leading-relaxed text-muted-foreground">
            Tell us what you are working on. If a conversation would be more useful than an email, book a free
            introductory call instead.
          </p>
        </div>
      </div>

      <Section className="!pt-12">
        <div className="grid gap-12 lg:grid-cols-[1.4fr_1fr]">
          <div>
            {sent ? (
              <Card className="text-center">
                <CheckCircle2 className="mx-auto size-12 text-success" aria-hidden />
                <h2 className="mt-5 text-h2">Message received</h2>
                <p className="mt-3 text-muted-foreground">
                  Thank you. We reply to every enquiry within one working day.
                </p>
                <Link to="/services" className="mt-7 inline-block">
                  <Button variant="secondary">Browse our services</Button>
                </Link>
              </Card>
            ) : (
              <Card>
                <form onSubmit={onSubmit} className="space-y-5" noValidate>
                  {formError && (
                    <div role="alert" className="rounded-[var(--radius-panel)] bg-destructive-soft p-3.5 text-sm text-destructive">
                      {formError}
                    </div>
                  )}
                  <ErrorSummary errors={errors} />

                  <div className="grid gap-5 sm:grid-cols-2">
                    <Field label="Your name" required error={form.formState.errors.name?.message}>
                      {({ id, describedBy, invalid }) => (
                        <Input id={id} autoComplete="name" aria-describedby={describedBy} invalid={invalid} {...form.register('name')} />
                      )}
                    </Field>
                    <Field label="Email address" required error={form.formState.errors.email?.message}>
                      {({ id, describedBy, invalid }) => (
                        <Input id={id} type="email" autoComplete="email" aria-describedby={describedBy} invalid={invalid} {...form.register('email')} />
                      )}
                    </Field>
                    <Field label="Phone" hint="Optional" error={form.formState.errors.phone?.message}>
                      {({ id, describedBy, invalid }) => (
                        <Input id={id} type="tel" autoComplete="tel" aria-describedby={describedBy} invalid={invalid} {...form.register('phone')} />
                      )}
                    </Field>
                    <Field label="Organisation" hint="Optional" error={form.formState.errors.company?.message}>
                      {({ id, describedBy, invalid }) => (
                        <Input id={id} autoComplete="organization" aria-describedby={describedBy} invalid={invalid} {...form.register('company')} />
                      )}
                    </Field>
                  </div>

                  <Field label="Subject" required error={form.formState.errors.subject?.message}>
                    {({ id, describedBy, invalid }) => (
                      <Input id={id} aria-describedby={describedBy} invalid={invalid} {...form.register('subject')} />
                    )}
                  </Field>

                  <Field label="How can we help?" required error={form.formState.errors.message?.message}>
                    {({ id, describedBy, invalid }) => (
                      <Textarea
                        id={id}
                        rows={6}
                        aria-describedby={describedBy}
                        invalid={invalid}
                        placeholder="Tell us what you are working through and what prompted you to look for advice now."
                        {...form.register('message')}
                      />
                    )}
                  </Field>

                  <Button type="submit" size="lg" loading={form.formState.isSubmitting}>
                    Send message
                  </Button>
                </form>
              </Card>
            )}
          </div>

          <aside className="space-y-5">
            <Card>
              <h2 className="text-h3">Reach us directly</h2>
              <address className="mt-5 space-y-4 text-sm not-italic">
                <a href="mailto:hello@meridianadvisory.co.ke" className="flex items-start gap-3 text-muted-foreground transition-colors hover:text-foreground">
                  <Mail className="mt-0.5 size-4 shrink-0" aria-hidden />
                  <span>
                    <span className="block font-medium text-foreground">Email</span>
                    hello@meridianadvisory.co.ke
                  </span>
                </a>
                <a href="tel:+254202714400" className="flex items-start gap-3 text-muted-foreground transition-colors hover:text-foreground">
                  <Phone className="mt-0.5 size-4 shrink-0" aria-hidden />
                  <span>
                    <span className="block font-medium text-foreground">Telephone</span>
                    +254 20 271 4400
                  </span>
                </a>
                <p className="flex items-start gap-3 text-muted-foreground">
                  <MapPin className="mt-0.5 size-4 shrink-0" aria-hidden />
                  <span>
                    <span className="block font-medium text-foreground">Office</span>
                    Riverside Square, Riverside Drive
                    <br />
                    Nairobi, Kenya
                  </span>
                </p>
                <p className="flex items-start gap-3 text-muted-foreground">
                  <Clock className="mt-0.5 size-4 shrink-0" aria-hidden />
                  <span>
                    <span className="block font-medium text-foreground">Hours</span>
                    Monday to Friday, 08:30–17:30 EAT
                  </span>
                </p>
              </address>
            </Card>

            <Card className="aura bg-accent-soft">
              <Compass className="size-6 text-accent" aria-hidden />
              <h2 className="mt-4 text-h3 text-accent">Rather just talk?</h2>
              <p className="mt-2.5 text-sm leading-relaxed text-accent/80">
                Book a free twenty-minute call. No obligation, no follow-up sales sequence.
              </p>
              <Link to="/book?service=introductory-call" className="mt-5 inline-block">
                <Button size="sm" variant="accent">
                  Book a call
                </Button>
              </Link>
            </Card>
          </aside>
        </div>
      </Section>
    </>
  );
}

/* -------------------------------------------------------------------------- */
/* Legal                                                                      */
/* -------------------------------------------------------------------------- */

const LEGAL_PAGES: Record<string, { title: string; updated: string; body: { heading?: string; text: string }[] }> = {
  privacy: {
    title: 'Privacy policy',
    updated: '1 August 2026',
    body: [
      {
        text: 'This policy explains what personal data Meridian Advisory Limited collects, why we collect it, and what rights you have over it. It applies to this website, the client portal and our consultation services.',
      },
      {
        heading: 'What we collect',
        text: 'When you create an account we collect your name, email address, telephone number and, optionally, your organisation and job title. When you book a consultation we additionally hold the booking itself, what you told us you wanted from the session, and the record your consultant writes afterwards. Payments are processed by Paystack; we receive confirmation of the amount, the last four digits of a card and the payment method, and never the full card number.',
      },
      {
        heading: 'Why we hold it',
        text: 'To deliver the consultation you booked, to issue invoices and meet our tax obligations, to send you transactional messages about your bookings, and — only if you opted in — to send occasional research. We do not sell personal data and we do not share it with third parties for their own marketing.',
      },
      {
        heading: 'Consultation records',
        text: 'Your consultant keeps two kinds of note: a shared write-up, which you can read in your portal once they release it, and private working notes, which are visible only to your consultant and are never exposed through the client portal or its API.',
      },
      {
        heading: 'How long we keep it',
        text: 'Booking and financial records are retained for seven years to satisfy Kenyan tax and company law. Consultation notes are retained for three years unless you ask us to delete them sooner. Account data is deleted within 30 days of you closing your account, other than records we are legally required to keep.',
      },
      {
        heading: 'Your rights',
        text: 'You may request a copy of the data we hold about you, ask us to correct it, or ask us to delete it. Write to privacy@meridianadvisory.co.ke and we will respond within 30 days.',
      },
    ],
  },
  terms: {
    title: 'Terms of service',
    updated: '1 August 2026',
    body: [
      {
        text: 'These terms govern your use of the Meridian Advisory website, client portal and consultation services. By booking a consultation you agree to them.',
      },
      {
        heading: 'What we provide',
        text: 'We provide professional advisory services. Our consultants give considered, experienced opinion. We do not provide regulated financial, legal or medical advice, and nothing in a consultation should be treated as such. Decisions you take remain yours.',
      },
      {
        heading: 'Booking and payment',
        text: 'Fees are stated before you book. Where a service takes a booking fee, that amount holds your slot and the balance falls due before the session begins. An unpaid booking is released automatically once its hold lapses. All amounts are in the currency stated at checkout.',
      },
      {
        heading: 'Confidentiality',
        text: 'What you share in a consultation is confidential. We will not disclose it, and we will not use your engagement as a case study or reference without your written consent.',
      },
      {
        heading: 'Your obligations',
        text: 'Material you send us must be yours to share. Please join sessions on time; a consultant is not obliged to extend a session to make up for a late start.',
      },
      {
        heading: 'Liability',
        text: 'Our liability arising from any single consultation is limited to the fee paid for that consultation, except where liability cannot lawfully be limited.',
      },
    ],
  },
  refunds: {
    title: 'Refund policy',
    updated: '1 August 2026',
    body: [
      {
        text: 'We want you to feel the consultation was worth what you paid. This policy sets out when a refund is available.',
      },
      {
        heading: 'Before a session',
        text: 'Cancel within the cancellation window shown on the service and you receive a full refund, booking fee included. Cancel inside that window and the booking fee is retained; any balance already paid is refunded.',
      },
      {
        heading: 'After a session',
        text: 'If a consultation did not deliver what the service described, tell us within seven days. We will review the session record and either arrange a further session at no charge or refund the fee. This is not a general satisfaction guarantee — advice you did not like is not the same as advice that was not delivered.',
      },
      {
        heading: 'If we cancel',
        text: 'If we cancel a session for any reason, you receive a full refund and, where you would like one, priority rebooking with the same consultant.',
      },
      {
        heading: 'Digital resources',
        text: 'Digital downloads are non-refundable once the file has been downloaded, because we cannot take it back. If a file is faulty or not as described, contact us and we will replace it or refund you.',
      },
      {
        heading: 'How refunds are paid',
        text: 'Refunds are returned to the original payment method through Paystack. Depending on your bank they usually appear within five to ten working days.',
      },
    ],
  },
  cancellation: {
    title: 'Cancellation & rescheduling policy',
    updated: '1 August 2026',
    body: [
      {
        text: 'Consultants block time exclusively for your session. This policy balances your flexibility against that commitment.',
      },
      {
        heading: 'Rescheduling',
        text: 'Every service states a rescheduling window — typically 24 to 72 hours before the session. Inside that window you can move your booking yourself from the client portal at no cost, subject to availability.',
      },
      {
        heading: 'Late changes',
        text: 'Once you are inside the window, online rescheduling closes. Contact us: where the consultant can accommodate a change, we will make it. We are not able to guarantee it.',
      },
      {
        heading: 'Cancellation',
        text: 'Cancelling within the window refunds you in full. Inside it, the booking fee is retained to compensate for the reserved time and any preparation already carried out.',
      },
      {
        heading: 'Missed sessions',
        text: 'If you do not attend and have not contacted us, the session is treated as delivered and fees are not refunded. If something went wrong, tell us — we deal with genuine circumstances sensibly.',
      },
    ],
  },
};

export function LegalPage() {
  const { document: slug } = useParams<{ document: string }>();
  const page = slug ? LEGAL_PAGES[slug] : undefined;

  if (!page) return <NotFoundPage />;

  return (
    <>
      <SEO title={page.title} description={`${page.title} for Meridian Advisory.`} path={`/legal/${slug}`} />

      <Section className="!py-14">
        <div className="mx-auto max-w-3xl">
          <Link
            to="/"
            className="inline-flex items-center gap-2 text-sm text-muted-foreground transition-colors hover:text-foreground"
          >
            <ArrowLeft className="size-4" aria-hidden />
            Back to website
          </Link>

          <h1 className="mt-6 text-h1">{page.title}</h1>
          <p className="mt-3 text-sm text-muted-foreground">Last updated {page.updated}</p>

          <div className="prose-editorial mt-10">
            {page.body.map((block, index) => (
              <div key={index}>
                {block.heading && <h2>{block.heading}</h2>}
                <p>{block.text}</p>
              </div>
            ))}
          </div>

          <Card className="mt-12 bg-muted/40">
            <p className="text-sm text-muted-foreground">
              Questions about this policy? Email{' '}
              <a href="mailto:legal@meridianadvisory.co.ke" className="font-medium text-accent hover:underline">
                legal@meridianadvisory.co.ke
              </a>
              .
            </p>
          </Card>
        </div>
      </Section>
    </>
  );
}

/* -------------------------------------------------------------------------- */
/* FAQ                                                                        */
/* -------------------------------------------------------------------------- */

const FAQS = [
  {
    q: 'How quickly can I get a consultation?',
    a: 'Most services can be booked with 24 to 72 hours’ notice, depending on the preparation involved. The calendar shows genuine live availability — if a slot appears, it is bookable.',
  },
  {
    q: 'What is the booking fee?',
    a: 'Some services take a deposit rather than the full fee up front. The deposit holds your slot; the balance falls due before the session. Both amounts are shown clearly before you pay.',
  },
  {
    q: 'What if I need to reschedule?',
    a: 'Every service states its rescheduling window. Inside it, you can move your booking yourself from the client portal at no cost. After it, contact us and we will do what we can.',
  },
  {
    q: 'How do I join the session?',
    a: 'Your meeting link is created once payment is confirmed and appears in your confirmation email, your calendar invitation and your client portal. You can choose Zoom, Google Meet or Microsoft Teams when you book.',
  },
  {
    q: 'Do I get anything in writing?',
    a: 'Yes. Your consultant writes up the session — objective, discussion, findings, recommendations and action items — and releases it to your portal. Their private working notes stay private.',
  },
  {
    q: 'Is my information confidential?',
    a: 'Yes. What you share stays between you and your consultant. We do not use engagements as case studies without written consent, and private consultation notes are never exposed through the client portal.',
  },
  {
    q: 'Can I expense this?',
    a: 'Every payment produces a numbered invoice in your portal, downloadable at any time.',
  },
];

export function FaqPage() {
  return (
    <>
      <SEO
        title="Frequently asked questions"
        description="Booking, payment, rescheduling, confidentiality and what you receive after a consultation."
        path="/faq"
      />

      <div className="aura border-b border-border">
        <div className="mx-auto max-w-7xl px-5 py-14 sm:px-8 sm:py-20">
          <p className="text-eyebrow uppercase text-accent">Support</p>
          <h1 className="mt-3 text-h1">Frequently asked</h1>
        </div>
      </div>

      <Section className="!pt-12">
        <div className="mx-auto max-w-3xl">
          <dl className="space-y-3">
            {FAQS.map((faq, index) => (
              <Reveal key={faq.q} delay={index * 50}>
                <Card>
                  <dt className="text-h3">{faq.q}</dt>
                  <dd className="mt-2.5 text-sm leading-relaxed text-muted-foreground">{faq.a}</dd>
                </Card>
              </Reveal>
            ))}
          </dl>

          <Card className="mt-8 text-center">
            <h2 className="text-h3">Still have a question?</h2>
            <p className="mt-2 text-sm text-muted-foreground">We reply within one working day.</p>
            <Link to="/contact" className="mt-5 inline-block">
              <Button>Contact us</Button>
            </Link>
          </Card>
        </div>
      </Section>
    </>
  );
}

/* -------------------------------------------------------------------------- */
/* Error pages                                                                */
/* -------------------------------------------------------------------------- */

function ErrorPage({
  code,
  icon: Icon,
  title,
  description,
  primary,
}: {
  code: string;
  icon: typeof SearchX;
  title: string;
  description: string;
  primary?: { to: string; label: string };
}) {
  return (
    <Section className="!py-24">
      <div className="mx-auto max-w-md text-center">
        <div className="mx-auto flex size-16 items-center justify-center rounded-full bg-muted text-muted-foreground">
          <Icon className="size-8" aria-hidden />
        </div>

        <p className="tabular mt-8 text-eyebrow uppercase text-muted-foreground">Error {code}</p>
        <h1 className="mt-2 text-h1">{title}</h1>
        <p className="mt-4 leading-relaxed text-muted-foreground">{description}</p>

        <div className="mt-9 flex flex-col justify-center gap-3 sm:flex-row">
          <Link to={primary?.to ?? '/'}>
            <Button size="lg" icon={<Home className="size-4" aria-hidden />}>
              {primary?.label ?? 'Back to home'}
            </Button>
          </Link>
          <Link to="/contact">
            <Button size="lg" variant="secondary">
              Contact support
            </Button>
          </Link>
        </div>
      </div>
    </Section>
  );
}

export function NotFoundPage() {
  return (
    <>
      <SEO title="Page not found" noIndex />
      <ErrorPage
        code="404"
        icon={SearchX}
        title="We could not find that page"
        description="The link may be out of date, or the page may have moved. Try the navigation above, or search with ⌘K."
      />
    </>
  );
}

export function ForbiddenPage() {
  return (
    <>
      <SEO title="Access denied" noIndex />
      <ErrorPage
        code="403"
        icon={ShieldOff}
        title="You do not have access to this"
        description="Your account does not have permission for that area. If you believe it should, ask an administrator to review your role."
        primary={{ to: '/portal', label: 'Go to your portal' }}
      />
    </>
  );
}

export function ServerErrorPage() {
  return (
    <>
      <SEO title="Something went wrong" noIndex />
      <ErrorPage
        code="500"
        icon={ServerCrash}
        title="Something went wrong on our end"
        description="This is our fault, not yours. Our team has been notified. Please try again in a moment."
      />
    </>
  );
}

export function SessionExpiredPage() {
  return (
    <>
      <SEO title="Session expired" noIndex />
      <ErrorPage
        code="401"
        icon={Lock}
        title="Your session has ended"
        description="For your security we sign you out after a period of inactivity. Sign in again to pick up where you left off."
        primary={{ to: '/login', label: 'Sign in' }}
      />
    </>
  );
}

export { Building2 };
