import { useEffect, useState } from 'react';
import { Link, useNavigate, useSearchParams } from 'react-router-dom';
import { useForm } from 'react-hook-form';
import { zodResolver } from '@hookform/resolvers/zod';
import { ArrowLeft, ArrowRight, CheckCircle2, Loader2, Lock, MailCheck, ShieldCheck } from 'lucide-react';
import type { z } from 'zod';
import {
  forgotPasswordSchema,
  loginSchema,
  registerSchema,
  resetPasswordSchema,
  type ForgotPasswordInput,
  type ResetPasswordInput,
} from '@meridian/types';

import { Button, Card, Checkbox, ErrorSummary, Field, Input } from '@/components/ui';
import { Logo } from '@/components/layout/PublicLayout';
import { SEO } from '@/components/SEO';
import { useAuth } from '@/providers/auth-context';
import { useToast } from '@/providers/toast-context';
import { ApiError, api } from '@/lib/api';
import { browserTimezone } from '@/lib/utils';

/**
 * Zod 4 distinguishes a schema's input from its output: a field with
 * `.default()` is optional going in and guaranteed coming out. React Hook Form
 * needs both, so forms over such schemas are typed <input, context, output>.
 */
type LoginValues = z.input<typeof loginSchema>;
type RegisterValues = z.input<typeof registerSchema>;


/**
 * Authentication screens.
 *
 * A dedicated split layout rather than the public shell: nothing on these
 * pages should compete with the form. The right panel carries the aura wash
 * and a short reassurance about what an account is for.
 */

function AuthShell({
  title,
  subtitle,
  children,
  footer,
}: {
  title: string;
  subtitle?: string;
  children: React.ReactNode;
  footer?: React.ReactNode;
}) {
  return (
    <div className="grid min-h-dvh lg:grid-cols-2">
      <div className="flex flex-col px-5 py-8 sm:px-10 lg:px-16">
        <Logo />

        <div className="flex flex-1 items-center py-10">
          <div className="w-full max-w-sm">
            <h1 className="text-h1">{title}</h1>
            {subtitle && <p className="mt-3 text-muted-foreground">{subtitle}</p>}
            <div className="mt-8">{children}</div>
            {footer && <div className="mt-7 text-sm text-muted-foreground">{footer}</div>}
          </div>
        </div>

        <Link
          to="/"
          className="inline-flex items-center gap-2 text-sm text-muted-foreground transition-colors hover:text-foreground"
        >
          <ArrowLeft className="size-4" aria-hidden />
          Back to website
        </Link>
      </div>

      <aside className="aura relative hidden bg-primary lg:flex lg:flex-col lg:justify-center lg:px-16">
        <blockquote className="relative max-w-md">
          <p className="text-h2 text-primary-foreground">
            “We had been going round the same market entry question since the start of the year. They asked the one
            question none of us had put on the table.”
          </p>
          <footer className="mt-7 text-sm text-primary-foreground/60">
            Grace Njeri — Chief Executive, Savanna Agro Processors
          </footer>
        </blockquote>

        <ul className="relative mt-14 space-y-3 text-sm text-primary-foreground/70">
          {[
            'Your bookings, invoices and session notes in one place',
            'Download purchased books and reports any time',
            'Reschedule or cancel within policy without an email chain',
          ].map((item) => (
            <li key={item} className="flex items-center gap-3">
              <CheckCircle2 className="size-4 shrink-0 text-primary-foreground/50" aria-hidden />
              {item}
            </li>
          ))}
        </ul>
      </aside>
    </div>
  );
}

/* -------------------------------------------------------------------------- */
/* Login                                                                      */
/* -------------------------------------------------------------------------- */

export function LoginPage() {
  const { login, user } = useAuth();
  const navigate = useNavigate();
  const [params] = useSearchParams();
  const next = params.get('next');
  const [formError, setFormError] = useState<string | null>(null);

  const form = useForm<LoginValues, unknown, z.output<typeof loginSchema>>({
    resolver: zodResolver(loginSchema),
    defaultValues: { email: '', password: '', rememberMe: true },
  });

  // Already signed in — send them where they were going.
  useEffect(() => {
    if (user) navigate(next ?? defaultLanding(user.permissions, user.consultantProfileId), { replace: true });
  }, [user, next, navigate]);

  const onSubmit = form.handleSubmit(async (values) => {
    setFormError(null);
    try {
      const signedIn = await login(values);
      navigate(next ?? defaultLanding(signedIn.permissions, signedIn.consultantProfileId), { replace: true });
    } catch (error) {
      setFormError(
        error instanceof ApiError ? error.message : 'We could not sign you in. Please try again.',
      );
    }
  });

  return (
    <>
      <SEO title="Sign in" path="/login" noIndex />
      <AuthShell
        title="Welcome back"
        subtitle="Sign in to manage your consultations, invoices and resources."
        footer={
          <>
            New here?{' '}
            <Link to={`/register${next ? `?next=${encodeURIComponent(next)}` : ''}`} className="font-medium text-accent hover:underline">
              Create an account
            </Link>
          </>
        }
      >
        <form onSubmit={onSubmit} className="space-y-5" noValidate>
          {formError && (
            <div role="alert" className="rounded-[var(--radius-panel)] bg-destructive-soft p-3.5 text-sm text-destructive">
              {formError}
            </div>
          )}

          <Field label="Email address" required error={form.formState.errors.email?.message}>
            {({ id, describedBy, invalid }) => (
              <Input
                id={id}
                type="email"
                autoComplete="email"
                autoFocus
                aria-describedby={describedBy}
                invalid={invalid}
                {...form.register('email')}
              />
            )}
          </Field>

          <Field label="Password" required error={form.formState.errors.password?.message}>
            {({ id, describedBy, invalid }) => (
              <Input
                id={id}
                type="password"
                autoComplete="current-password"
                aria-describedby={describedBy}
                invalid={invalid}
                {...form.register('password')}
              />
            )}
          </Field>

          <div className="flex items-center justify-between">
            <Checkbox label="Keep me signed in" {...form.register('rememberMe')} />
            <Link to="/forgot-password" className="text-sm font-medium text-accent hover:underline">
              Forgot password?
            </Link>
          </div>

          <Button type="submit" className="w-full" size="lg" loading={form.formState.isSubmitting}>
            Sign in
          </Button>
        </form>
      </AuthShell>
    </>
  );
}

function defaultLanding(permissions: string[], consultantProfileId: string | null): string {
  if (consultantProfileId) return '/consultant';
  if (permissions.includes('analytics.read')) return '/admin';
  return '/portal';
}

/* -------------------------------------------------------------------------- */
/* Register                                                                   */
/* -------------------------------------------------------------------------- */

export function RegisterPage() {
  const { register: createAccount, user } = useAuth();
  const navigate = useNavigate();
  const [params] = useSearchParams();
  const next = params.get('next');
  const [formError, setFormError] = useState<string | null>(null);

  const form = useForm<RegisterValues, unknown, z.output<typeof registerSchema>>({
    resolver: zodResolver(registerSchema),
    defaultValues: {
      firstName: '',
      lastName: '',
      email: '',
      password: '',
      // No phone input on this form; the booking flow is where a number is
      // collected. Leaving a default here meant submitting a field the user
      // could not see or correct.
      company: '',
      timezone: browserTimezone(),
      marketingOptIn: false,
    },
  });

  useEffect(() => {
    if (user) navigate(next ?? '/portal', { replace: true });
  }, [user, next, navigate]);

  const onSubmit = form.handleSubmit(async (values) => {
    setFormError(null);
    try {
      await createAccount(values);
      navigate(next ?? '/portal', { replace: true });
    } catch (error) {
      if (error instanceof ApiError) {
        // Map field-level issues from the server back onto the form.
        for (const [path, message] of Object.entries(error.fieldErrors)) {
          form.setError(path as keyof RegisterValues, { message });
        }
        setFormError(error.issues?.length ? null : error.message);
      } else {
        setFormError('We could not create your account. Please try again.');
      }
    }
  });

  const errors = Object.values(form.formState.errors)
    .map((error) => error?.message)
    .filter((message): message is string => Boolean(message));

  return (
    <>
      <SEO title="Create an account" path="/register" noIndex />
      <AuthShell
        title="Create your account"
        subtitle="One place for your bookings, invoices, session notes and purchased resources."
        footer={
          <>
            Already have an account?{' '}
            <Link to={`/login${next ? `?next=${encodeURIComponent(next)}` : ''}`} className="font-medium text-accent hover:underline">
              Sign in
            </Link>
          </>
        }
      >
        <form onSubmit={onSubmit} className="space-y-5" noValidate>
          {formError && (
            <div role="alert" className="rounded-[var(--radius-panel)] bg-destructive-soft p-3.5 text-sm text-destructive">
              {formError}
            </div>
          )}
          <ErrorSummary errors={errors} />

          <div className="grid gap-5 sm:grid-cols-2">
            <Field label="First name" required error={form.formState.errors.firstName?.message}>
              {({ id, describedBy, invalid }) => (
                <Input id={id} autoComplete="given-name" aria-describedby={describedBy} invalid={invalid} {...form.register('firstName')} />
              )}
            </Field>
            <Field label="Last name" required error={form.formState.errors.lastName?.message}>
              {({ id, describedBy, invalid }) => (
                <Input id={id} autoComplete="family-name" aria-describedby={describedBy} invalid={invalid} {...form.register('lastName')} />
              )}
            </Field>
          </div>

          <Field label="Email address" required error={form.formState.errors.email?.message}>
            {({ id, describedBy, invalid }) => (
              <Input id={id} type="email" autoComplete="email" aria-describedby={describedBy} invalid={invalid} {...form.register('email')} />
            )}
          </Field>

          <Field
            label="Password"
            required
            hint="At least 12 characters, with an uppercase letter and a number."
            error={form.formState.errors.password?.message}
          >
            {({ id, describedBy, invalid }) => (
              <Input
                id={id}
                type="password"
                autoComplete="new-password"
                aria-describedby={describedBy}
                invalid={invalid}
                {...form.register('password')}
              />
            )}
          </Field>

          <Field label="Organisation" hint="Optional" error={form.formState.errors.company?.message}>
            {({ id, describedBy, invalid }) => (
              <Input id={id} autoComplete="organization" aria-describedby={describedBy} invalid={invalid} {...form.register('company')} />
            )}
          </Field>

          <Checkbox
            label="Send me occasional insights"
            description="Research and articles, roughly monthly. Unsubscribe any time."
            {...form.register('marketingOptIn')}
          />

          <Button type="submit" className="w-full" size="lg" loading={form.formState.isSubmitting}>
            Create account
          </Button>

          <p className="flex items-center justify-center gap-2 text-xs text-muted-foreground">
            <ShieldCheck className="size-3.5 text-success" aria-hidden />
            We never share your details with third parties.
          </p>
        </form>
      </AuthShell>
    </>
  );
}

/* -------------------------------------------------------------------------- */
/* Forgot / reset password                                                    */
/* -------------------------------------------------------------------------- */

export function ForgotPasswordPage() {
  const [sent, setSent] = useState(false);
  const form = useForm<ForgotPasswordInput>({ resolver: zodResolver(forgotPasswordSchema) });

  const onSubmit = form.handleSubmit(async (values) => {
    // Always reports success: the endpoint deliberately does not reveal whether
    // an address is registered, and the UI must not undo that.
    await api.post('/api/auth/forgot-password', values).catch(() => undefined);
    setSent(true);
  });

  return (
    <>
      <SEO title="Reset your password" path="/forgot-password" noIndex />
      <AuthShell
        title={sent ? 'Check your inbox' : 'Reset your password'}
        subtitle={
          sent
            ? undefined
            : 'Enter the email address on your account and we will send you a link to choose a new password.'
        }
        footer={
          <Link to="/login" className="font-medium text-accent hover:underline">
            Back to sign in
          </Link>
        }
      >
        {sent ? (
          <Card className="text-center">
            <MailCheck className="mx-auto size-10 text-success" aria-hidden />
            <p className="mt-4 text-sm leading-relaxed text-muted-foreground">
              If that address has an account with us, a reset link is on its way. It expires in one hour and can be
              used once.
            </p>
          </Card>
        ) : (
          <form onSubmit={onSubmit} className="space-y-5" noValidate>
            <Field label="Email address" required error={form.formState.errors.email?.message}>
              {({ id, describedBy, invalid }) => (
                <Input id={id} type="email" autoComplete="email" autoFocus aria-describedby={describedBy} invalid={invalid} {...form.register('email')} />
              )}
            </Field>

            <Button type="submit" className="w-full" size="lg" loading={form.formState.isSubmitting}>
              Send reset link
            </Button>
          </form>
        )}
      </AuthShell>
    </>
  );
}

export function ResetPasswordPage() {
  const [params] = useSearchParams();
  const token = params.get('token') ?? '';
  const navigate = useNavigate();
  const toast = useToast();
  const [formError, setFormError] = useState<string | null>(null);

  const form = useForm<ResetPasswordInput>({
    resolver: zodResolver(resetPasswordSchema),
    defaultValues: { token, password: '', confirmPassword: '' },
  });

  const onSubmit = form.handleSubmit(async (values) => {
    setFormError(null);
    try {
      await api.post('/api/auth/reset-password', values);
      toast.success('Password updated', 'You can now sign in with your new password.');
      navigate('/login', { replace: true });
    } catch (error) {
      setFormError(error instanceof ApiError ? error.message : 'That reset link could not be used.');
    }
  });

  if (!token) {
    return (
      <AuthShell title="That link is not valid" subtitle="Reset links expire after an hour and can be used once.">
        <Link to="/forgot-password">
          <Button className="w-full" size="lg">
            Request a new link
          </Button>
        </Link>
      </AuthShell>
    );
  }

  return (
    <>
      <SEO title="Choose a new password" path="/reset-password" noIndex />
      <AuthShell title="Choose a new password" subtitle="Signing in elsewhere will end those sessions.">
        <form onSubmit={onSubmit} className="space-y-5" noValidate>
          {formError && (
            <div role="alert" className="rounded-[var(--radius-panel)] bg-destructive-soft p-3.5 text-sm text-destructive">
              {formError}
            </div>
          )}

          <Field
            label="New password"
            required
            hint="At least 12 characters, with an uppercase letter and a number."
            error={form.formState.errors.password?.message}
          >
            {({ id, describedBy, invalid }) => (
              <Input id={id} type="password" autoComplete="new-password" autoFocus aria-describedby={describedBy} invalid={invalid} {...form.register('password')} />
            )}
          </Field>

          <Field label="Confirm new password" required error={form.formState.errors.confirmPassword?.message}>
            {({ id, describedBy, invalid }) => (
              <Input id={id} type="password" autoComplete="new-password" aria-describedby={describedBy} invalid={invalid} {...form.register('confirmPassword')} />
            )}
          </Field>

          <Button type="submit" className="w-full" size="lg" loading={form.formState.isSubmitting} icon={<Lock className="size-4" aria-hidden />}>
            Update password
          </Button>
        </form>
      </AuthShell>
    </>
  );
}

/* -------------------------------------------------------------------------- */
/* Email verification                                                         */
/* -------------------------------------------------------------------------- */

export function VerifyEmailPage() {
  const [params] = useSearchParams();
  const token = params.get('token');
  const { refresh } = useAuth();
  // A link with no token has already failed; that is knowable before any
  // request, so it is the initial state rather than an effect's correction.
  const [state, setState] = useState<'verifying' | 'done' | 'failed'>(token ? 'verifying' : 'failed');
  const [message, setMessage] = useState(token ? '' : 'That verification link is missing its token.');

  useEffect(() => {
    if (!token) return;

    api
      .post('/api/auth/verify-email', { token })
      .then(async () => {
        await refresh();
        setState('done');
      })
      .catch((error: unknown) => {
        setState('failed');
        setMessage(error instanceof ApiError ? error.message : 'That verification link could not be used.');
      });
  }, [token, refresh]);

  return (
    <>
      <SEO title="Verify your email" path="/verify-email" noIndex />
      <AuthShell
        title={
          state === 'verifying' ? 'Verifying your email' : state === 'done' ? 'Email confirmed' : 'Verification failed'
        }
        subtitle={state === 'done' ? 'Your account is fully active.' : state === 'failed' ? message : undefined}
      >
        {state === 'verifying' && <Loader2 className="size-8 animate-spin text-accent" aria-hidden />}

        {state === 'done' && (
          <Link to="/portal">
            <Button className="w-full" size="lg" iconRight={<ArrowRight className="size-4" aria-hidden />}>
              Go to your portal
            </Button>
          </Link>
        )}

        {state === 'failed' && (
          <Link to="/login">
            <Button className="w-full" size="lg" variant="secondary">
              Back to sign in
            </Button>
          </Link>
        )}
      </AuthShell>
    </>
  );
}
