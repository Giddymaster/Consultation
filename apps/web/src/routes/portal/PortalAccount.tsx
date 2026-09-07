import { useMemo, useState } from 'react';
import { useForm } from 'react-hook-form';
import { zodResolver } from '@hookform/resolvers/zod';
import {
  BellRing,
  Check,
  CheckCheck,
  Globe,
  KeyRound,
  Mail,
  MailCheck,
  ShieldCheck,
  UserRound,
} from 'lucide-react';
import { Link } from 'react-router-dom';
import type { z } from 'zod';
import { changePasswordSchema, updateProfileSchema } from '@meridian/types';
import {
  Avatar,
  Badge,
  Button,
  Card,
  CardDescription,
  CardTitle,
  Checkbox,
  EmptyState,
  Field,
  Input,
  LoadingSkeleton,
  Select,
  Separator,
} from '@/components/ui';
import { PageHeader } from '@/components/layout/DashboardLayout';
import { SEO } from '@/components/SEO';
import {
  useChangePassword,
  useMarkAllNotificationsRead,
  useMarkNotificationRead,
  useNotifications,
  useResendVerification,
  useUpdateProfile,
} from '@/lib/queries';
import { useAuth } from '@/providers/auth-context';
import { useToast } from '@/providers/toast-context';
import { ApiError } from '@/lib/api';
import { browserTimezone, cn, formatDate, formatRelative } from '@/lib/utils';

/**
 * Account screens shared by every signed-in user.
 *
 * Profile and settings are split deliberately: one is the identity other people
 * see, the other is how the account behaves. Mixing a password field into a page
 * of display names makes it too easy to submit the wrong one by habit.
 */

/* -------------------------------------------------------------------------- */
/* Timezone options                                                           */
/* -------------------------------------------------------------------------- */

/**
 * The browser knows the full IANA list on every engine that matters now, but the
 * call still needs a guard: an older runtime returns `undefined` and would take
 * the whole settings page down over a dropdown.
 */
function timezoneOptions(current: string): string[] {
  let zones: string[];
  try {
    const supported = (Intl as { supportedValuesOf?: (key: string) => string[] }).supportedValuesOf;
    zones = supported ? supported('timeZone') : [];
  } catch {
    zones = [];
  }

  if (zones.length === 0) {
    zones = [
      'Africa/Nairobi', 'Africa/Lagos', 'Africa/Johannesburg', 'Africa/Cairo',
      'Europe/London', 'Europe/Paris', 'Europe/Berlin',
      'America/New_York', 'America/Chicago', 'America/Los_Angeles',
      'Asia/Dubai', 'Asia/Kolkata', 'Asia/Singapore', 'Australia/Sydney', 'UTC',
    ];
  }

  // A zone the account already holds must stay selectable even if this browser
  // does not list it, otherwise saving the form would silently change it.
  return zones.includes(current) ? zones : [current, ...zones];
}

/** e.g. "Africa/Nairobi (GMT+3)" — the offset is what people actually reason about. */
function zoneLabel(zone: string): string {
  try {
    const parts = new Intl.DateTimeFormat('en-GB', { timeZone: zone, timeZoneName: 'shortOffset' }).formatToParts(
      new Date(),
    );
    const offset = parts.find((part) => part.type === 'timeZoneName')?.value;
    return offset ? `${zone.replace(/_/g, ' ')} (${offset})` : zone.replace(/_/g, ' ');
  } catch {
    return zone.replace(/_/g, ' ');
  }
}

/* -------------------------------------------------------------------------- */
/* Profile                                                                    */
/* -------------------------------------------------------------------------- */

type ProfileSchema = typeof updateProfileSchema;

export function PortalProfile() {
  const { user, setUser } = useAuth();
  const updateProfile = useUpdateProfile();
  const resendVerification = useResendVerification();
  const toast = useToast();
  const [resent, setResent] = useState(false);

  const form = useForm<z.input<ProfileSchema>, unknown, z.output<ProfileSchema>>({
    resolver: zodResolver(updateProfileSchema),
    values: user
      ? {
          firstName: user.firstName,
          lastName: user.lastName,
          phone: user.phone ?? '',
          company: user.company ?? '',
          jobTitle: user.jobTitle ?? '',
        }
      : undefined,
  });

  if (!user) return <LoadingSkeleton rows={6} />;

  const submit = form.handleSubmit(async (values) => {
    try {
      // Empty optional text means "clear this", which the API expresses as null.
      const updated = await updateProfile.mutateAsync({
        firstName: values.firstName,
        lastName: values.lastName,
        phone: values.phone?.trim() ? values.phone : null,
        company: values.company?.trim() ? values.company : null,
        jobTitle: values.jobTitle?.trim() ? values.jobTitle : null,
      });
      setUser(updated);
      toast.success('Profile updated');
    } catch (error) {
      toast.error(
        'Could not save your profile',
        error instanceof ApiError ? error.message : 'Please try again shortly.',
      );
    }
  });

  const resend = async () => {
    try {
      await resendVerification.mutateAsync(user.email);
      setResent(true);
      toast.success('Verification email sent', `Check ${user.email} for the link.`);
    } catch {
      toast.error('Could not send the email', 'Please try again in a few minutes.');
    }
  };

  return (
    <>
      <SEO title="Your profile" noIndex />
      <PageHeader
        title="Your profile"
        description="This is the name and contact detail your consultant sees on a booking."
        breadcrumbs={[{ label: 'Portal', to: '/portal' }, { label: 'Profile' }]}
      />

      <div className="grid gap-6 lg:grid-cols-[1fr_20rem]">
        <Card>
          <form onSubmit={submit} className="space-y-5" noValidate>
            <div className="grid gap-5 sm:grid-cols-2">
              <Field label="First name" required error={form.formState.errors.firstName?.message}>
                {({ id, invalid }) => <Input id={id} invalid={invalid} {...form.register('firstName')} />}
              </Field>
              <Field label="Last name" required error={form.formState.errors.lastName?.message}>
                {({ id, invalid }) => <Input id={id} invalid={invalid} {...form.register('lastName')} />}
              </Field>
            </div>

            <Field
              label="Phone"
              hint="Used for session reminders and nothing else."
              error={form.formState.errors.phone?.message}
            >
              {({ id, invalid }) => (
                <Input id={id} type="tel" autoComplete="tel" invalid={invalid} {...form.register('phone')} />
              )}
            </Field>

            <div className="grid gap-5 sm:grid-cols-2">
              <Field label="Company" error={form.formState.errors.company?.message}>
                {({ id, invalid }) => <Input id={id} invalid={invalid} {...form.register('company')} />}
              </Field>
              <Field label="Job title" error={form.formState.errors.jobTitle?.message}>
                {({ id, invalid }) => <Input id={id} invalid={invalid} {...form.register('jobTitle')} />}
              </Field>
            </div>

            <Separator />

            <Button type="submit" loading={updateProfile.isPending} icon={<Check className="size-4" aria-hidden />}>
              Save changes
            </Button>
          </form>
        </Card>

        <div className="space-y-6">
          <Card>
            <div className="flex items-center gap-3.5">
              <Avatar name={`${user.firstName} ${user.lastName}`} src={user.avatarUrl} size="lg" />
              <div className="min-w-0">
                <p className="truncate font-semibold">
                  {user.firstName} {user.lastName}
                </p>
                {/* Not the email — the card below already carries it, with the
                    verification state that actually matters. */}
                <p className="truncate text-sm text-muted-foreground">
                  With us since {formatDate(user.createdAt)}
                </p>
              </div>
            </div>
          </Card>

          <Card>
            <CardTitle className="flex items-center gap-2 text-base">
              <Mail className="size-4 text-muted-foreground" aria-hidden />
              Email address
            </CardTitle>
            <p className="mt-2 truncate text-sm text-muted-foreground">{user.email}</p>

            <div className="mt-3">
              {user.emailVerified ? (
                <Badge tone="success" dot>
                  Verified
                </Badge>
              ) : (
                <div className="space-y-3">
                  <Badge tone="warning" dot>
                    Not verified
                  </Badge>
                  <p className="text-xs text-muted-foreground">
                    Some receipts and meeting links are only sent to a verified address.
                  </p>
                  <Button
                    size="sm"
                    variant="secondary"
                    loading={resendVerification.isPending}
                    disabled={resent}
                    onClick={resend}
                    icon={<MailCheck className="size-3.5" aria-hidden />}
                  >
                    {resent ? 'Email sent' : 'Resend verification'}
                  </Button>
                </div>
              )}
            </div>

            <p className="mt-4 text-xs text-muted-foreground">
              Changing the email on an account is handled by our team, so a booking history can never be moved
              silently. Contact us and we will do it with you.
            </p>
          </Card>
        </div>
      </div>
    </>
  );
}

/* -------------------------------------------------------------------------- */
/* Settings                                                                   */
/* -------------------------------------------------------------------------- */

type PasswordSchema = typeof changePasswordSchema;

export function PortalSettings() {
  const { user, setUser, logout } = useAuth();
  const updateProfile = useUpdateProfile();
  const changePassword = useChangePassword();
  const toast = useToast();

  const [timezone, setTimezone] = useState<string | null>(null);
  const [marketingOptIn, setMarketingOptIn] = useState<boolean | null>(null);

  const zones = useMemo(() => timezoneOptions(user?.timezone ?? browserTimezone()), [user?.timezone]);

  const passwordForm = useForm<z.input<PasswordSchema>, unknown, z.output<PasswordSchema>>({
    resolver: zodResolver(changePasswordSchema),
    defaultValues: { currentPassword: '', password: '', confirmPassword: '' },
  });

  if (!user) return <LoadingSkeleton rows={6} />;

  const currentZone = timezone ?? user.timezone;
  const currentOptIn = marketingOptIn ?? user.marketingOptIn;
  const preferencesDirty = currentZone !== user.timezone || currentOptIn !== user.marketingOptIn;

  const savePreferences = async () => {
    try {
      const updated = await updateProfile.mutateAsync({ timezone: currentZone, marketingOptIn: currentOptIn });
      setUser(updated);
      setTimezone(null);
      setMarketingOptIn(null);
      toast.success('Preferences saved', 'Session times now display in your chosen timezone.');
    } catch (error) {
      toast.error(
        'Could not save preferences',
        error instanceof ApiError ? error.message : 'Please try again shortly.',
      );
    }
  };

  const submitPassword = passwordForm.handleSubmit(async (values) => {
    try {
      await changePassword.mutateAsync(values);
      passwordForm.reset();
      toast.success('Password changed', 'You have been signed out everywhere. Sign in again to continue.');
      // The API revoked every refresh-token family, so the in-memory access
      // token is the only thing still standing. Clearing it here keeps the UI
      // honest instead of letting it fail on the next request.
      await logout();
    } catch (error) {
      const message = error instanceof ApiError ? error.message : 'Please try again shortly.';
      if (error instanceof ApiError && error.status === 400) {
        passwordForm.setError('currentPassword', { message: 'That password is not correct' });
      }
      toast.error('Could not change your password', message);
    }
  });

  return (
    <>
      <SEO title="Settings" noIndex />
      <PageHeader
        title="Settings"
        description="How your account behaves — times, email, and access."
        breadcrumbs={[{ label: 'Portal', to: '/portal' }, { label: 'Settings' }]}
      />

      <div className="grid gap-6 lg:grid-cols-2">
        <Card>
          <CardTitle className="flex items-center gap-2 text-base">
            <Globe className="size-4 text-muted-foreground" aria-hidden />
            Timezone and email
          </CardTitle>
          <CardDescription className="mt-1">
            Every session time in the portal is converted to this zone.
          </CardDescription>

          <div className="mt-5 space-y-5">
            <Field label="Your timezone" hint={`Detected in this browser: ${zoneLabel(browserTimezone())}`}>
              {({ id }) => (
                <Select id={id} value={currentZone} onChange={(event) => setTimezone(event.target.value)}>
                  {zones.map((zone) => (
                    <option key={zone} value={zone}>
                      {zoneLabel(zone)}
                    </option>
                  ))}
                </Select>
              )}
            </Field>

            <Checkbox
              label="Send me occasional insights and updates"
              description="Booking confirmations, receipts and reminders are always sent — this covers everything else."
              checked={currentOptIn}
              onChange={(event) => setMarketingOptIn(event.target.checked)}
            />

            <Button
              onClick={savePreferences}
              disabled={!preferencesDirty}
              loading={updateProfile.isPending}
              icon={<Check className="size-4" aria-hidden />}
            >
              Save preferences
            </Button>
          </div>
        </Card>

        <Card>
          <CardTitle className="flex items-center gap-2 text-base">
            <KeyRound className="size-4 text-muted-foreground" aria-hidden />
            Change password
          </CardTitle>
          <CardDescription className="mt-1">
            Changing your password signs you out of every device, including this one.
          </CardDescription>

          <form onSubmit={submitPassword} className="mt-5 space-y-5" noValidate>
            <Field label="Current password" required error={passwordForm.formState.errors.currentPassword?.message}>
              {({ id, invalid }) => (
                <Input
                  id={id}
                  type="password"
                  autoComplete="current-password"
                  invalid={invalid}
                  {...passwordForm.register('currentPassword')}
                />
              )}
            </Field>

            <Field
              label="New password"
              required
              hint="At least 12 characters, with an uppercase letter, a lowercase letter and a number."
              error={passwordForm.formState.errors.password?.message}
            >
              {({ id, invalid }) => (
                <Input
                  id={id}
                  type="password"
                  autoComplete="new-password"
                  invalid={invalid}
                  {...passwordForm.register('password')}
                />
              )}
            </Field>

            <Field label="Confirm new password" required error={passwordForm.formState.errors.confirmPassword?.message}>
              {({ id, invalid }) => (
                <Input
                  id={id}
                  type="password"
                  autoComplete="new-password"
                  invalid={invalid}
                  {...passwordForm.register('confirmPassword')}
                />
              )}
            </Field>

            <Button type="submit" loading={changePassword.isPending} icon={<ShieldCheck className="size-4" aria-hidden />}>
              Change password
            </Button>
          </form>
        </Card>

        <Card className="lg:col-span-2">
          <CardTitle className="flex items-center gap-2 text-base">
            <UserRound className="size-4 text-muted-foreground" aria-hidden />
            Your data
          </CardTitle>
          <CardDescription className="mt-1">
            Session records, private notes taken by your consultant, invoices and receipts are retained for as long
            as your account is open. To export or close your account, contact us and a person will handle it.
          </CardDescription>
          <div className="mt-4 flex flex-wrap gap-3">
            <Link to="/contact">
              <Button variant="secondary" size="sm">
                Contact support
              </Button>
            </Link>
            <Link to="/portal/profile">
              <Button variant="ghost" size="sm">
                Edit profile
              </Button>
            </Link>
          </div>
        </Card>
      </div>
    </>
  );
}

/* -------------------------------------------------------------------------- */
/* Notifications                                                              */
/* -------------------------------------------------------------------------- */

export function PortalNotifications() {
  const [unreadOnly, setUnreadOnly] = useState(false);
  const { data, isLoading } = useNotifications(unreadOnly);
  const markRead = useMarkNotificationRead();
  const markAllRead = useMarkAllNotificationsRead();

  const items = data?.items ?? [];

  return (
    <>
      <SEO title="Notifications" noIndex />
      <PageHeader
        title="Notifications"
        description="Confirmations, reminders and receipts, newest first."
        breadcrumbs={[{ label: 'Portal', to: '/portal' }, { label: 'Notifications' }]}
        action={
          (data?.unreadCount ?? 0) > 0 ? (
            <Button
              variant="secondary"
              loading={markAllRead.isPending}
              onClick={() => markAllRead.mutate()}
              icon={<CheckCheck className="size-4" aria-hidden />}
            >
              Mark all read
            </Button>
          ) : null
        }
      />

      <div className="mb-5 flex flex-wrap items-center gap-2">
        {[
          { value: false, label: 'All' },
          { value: true, label: `Unread${data ? ` (${data.unreadCount})` : ''}` },
        ].map((filter) => (
          <button
            key={String(filter.value)}
            type="button"
            aria-pressed={unreadOnly === filter.value}
            onClick={() => setUnreadOnly(filter.value)}
            className={cn(
              'rounded-full px-3.5 py-1.5 text-sm font-medium transition-colors',
              unreadOnly === filter.value
                ? 'bg-foreground text-background'
                : 'bg-surface-2 text-muted-foreground hover:text-foreground',
            )}
          >
            {filter.label}
          </button>
        ))}
      </div>

      {isLoading ? (
        <LoadingSkeleton rows={6} />
      ) : items.length === 0 ? (
        <EmptyState
          icon={<BellRing />}
          title={unreadOnly ? 'Nothing unread' : 'No notifications yet'}
          description={
            unreadOnly
              ? 'You are all caught up.'
              : 'Booking confirmations and session reminders will appear here.'
          }
        />
      ) : (
        <ul className="space-y-2.5">
          {items.map((notification) => {
            const unread = !notification.readAt;

            const body = (
              <div className="flex items-start gap-3.5">
                <span
                  className={cn(
                    'mt-1.5 size-2 shrink-0 rounded-full',
                    unread ? 'bg-accent' : 'bg-border',
                  )}
                  aria-hidden
                />
                <div className="min-w-0 flex-1">
                  <div className="flex flex-wrap items-baseline justify-between gap-x-4 gap-y-1">
                    <p className={cn('text-sm', unread ? 'font-semibold' : 'font-medium text-muted-foreground')}>
                      {notification.title}
                    </p>
                    <time
                      className="shrink-0 text-xs text-muted-foreground"
                      dateTime={notification.createdAt}
                    >
                      {formatRelative(notification.createdAt)}
                    </time>
                  </div>
                  <p className="mt-1 text-sm leading-relaxed text-muted-foreground">{notification.body}</p>
                </div>
              </div>
            );

            return (
              <li key={notification.id}>
                <Card padded={false} className={cn('p-4', unread && 'border-accent/25 bg-accent-soft/40')}>
                  {notification.href ? (
                    <Link
                      to={notification.href}
                      onClick={() => unread && markRead.mutate(notification.id)}
                      className="block rounded-lg outline-none focus-visible:ring-2 focus-visible:ring-ring"
                    >
                      {body}
                    </Link>
                  ) : (
                    body
                  )}

                  {unread && (
                    <div className="mt-3 pl-[26px]">
                      <button
                        type="button"
                        onClick={() => markRead.mutate(notification.id)}
                        className="text-xs font-medium text-muted-foreground underline-offset-4 transition-colors hover:text-foreground hover:underline"
                      >
                        Mark as read
                      </button>
                    </div>
                  )}
                </Card>
              </li>
            );
          })}
        </ul>
      )}
    </>
  );
}
