import { EMAIL_TEMPLATE, formatMoney, type Currency, type MeetingProvider } from '@meridian/types';
import { env } from '../../config/env.js';
import { formatFullDateTime } from '../../lib/time.js';
import { sendEmail, type SendEmailResult } from './index.js';

/**
 * One function per transactional message. Keeping the copy here — rather than
 * inline at the call sites — means the wording, the details shown and the
 * call-to-action for each message are reviewable in one place.
 */

const PROVIDER_LABELS: Record<MeetingProvider, string> = {
  ZOOM: 'Zoom',
  GOOGLE_MEET: 'Google Meet',
  MICROSOFT_TEAMS: 'Microsoft Teams',
  IN_PERSON: 'In person',
  PHONE: 'Phone call',
  MANUAL: 'Details to follow',
};

export function meetingProviderLabel(provider: MeetingProvider): string {
  return PROVIDER_LABELS[provider] ?? 'Online';
}

const appUrl = (path: string) => `${env.APP_URL.replace(/\/$/, '')}${path}`;

/* -------------------------------------------------------------------------- */
/* Account                                                                    */
/* -------------------------------------------------------------------------- */

export function sendVerificationEmail(args: {
  to: string;
  firstName: string;
  token: string;
}): Promise<SendEmailResult> {
  const url = appUrl(`/verify-email?token=${encodeURIComponent(args.token)}`);
  return sendEmail({
    to: args.to,
    subject: `Confirm your email address`,
    template: EMAIL_TEMPLATE.ACCOUNT_VERIFICATION,
    layout: {
      preheader: 'One click to confirm your email and activate your account.',
      heading: `Welcome, ${args.firstName}`,
      intro:
        'Confirm your email address to activate your account. You can then book consultations, manage sessions and access your resources.',
      action: { label: 'Confirm email address', url },
      footnote:
        'This link expires in 24 hours. If you did not create an account, you can safely ignore this email.',
    },
  });
}

export function sendPasswordResetEmail(args: {
  to: string;
  firstName: string;
  token: string;
}): Promise<SendEmailResult> {
  const url = appUrl(`/reset-password?token=${encodeURIComponent(args.token)}`);
  return sendEmail({
    to: args.to,
    subject: 'Reset your password',
    template: EMAIL_TEMPLATE.PASSWORD_RESET,
    layout: {
      preheader: 'A link to choose a new password.',
      heading: 'Reset your password',
      intro: `Hello ${args.firstName}, we received a request to reset the password on your account.`,
      action: { label: 'Choose a new password', url },
      footnote:
        'This link expires in one hour and can be used once. If you did not request a reset, no action is needed — your password has not changed.',
    },
  });
}

export function sendWelcomeEmail(args: { to: string; firstName: string }): Promise<SendEmailResult> {
  return sendEmail({
    to: args.to,
    subject: `Welcome to ${env.BUSINESS_NAME}`,
    template: EMAIL_TEMPLATE.WELCOME_EMAIL,
    layout: {
      preheader: 'Your account is ready.',
      heading: 'Your account is ready',
      intro: `${args.firstName}, thank you for joining ${env.BUSINESS_NAME}. Your portal is where your sessions, documents, invoices and purchased resources live.`,
      action: { label: 'Open your portal', url: appUrl('/portal') },
      secondaryAction: { label: 'Browse consultations', url: appUrl('/services') },
      tone: 'success',
    },
  });
}

/* -------------------------------------------------------------------------- */
/* Bookings                                                                   */
/* -------------------------------------------------------------------------- */

export interface BookingEmailContext {
  to: string;
  firstName: string;
  reference: string;
  serviceName: string;
  consultantName: string;
  startAt: Date;
  durationMinutes: number;
  timezone: string;
  currency: Currency;
  total: number;
  amountPaid: number;
  balance: number;
  meetingProvider: MeetingProvider;
  bookingId: string;
}

function bookingDetails(ctx: BookingEmailContext) {
  return [
    { label: 'Reference', value: ctx.reference, emphasis: true },
    { label: 'Consultation', value: ctx.serviceName },
    { label: 'Consultant', value: ctx.consultantName },
    { label: 'Date & time', value: formatFullDateTime(ctx.startAt, ctx.timezone) },
    { label: 'Duration', value: `${ctx.durationMinutes} minutes` },
    { label: 'Meeting', value: meetingProviderLabel(ctx.meetingProvider) },
    { label: 'Total', value: formatMoney(ctx.total, ctx.currency) },
  ];
}

export function sendBookingCreatedEmail(ctx: BookingEmailContext): Promise<SendEmailResult> {
  return sendEmail({
    to: ctx.to,
    subject: `We are holding your booking — ${ctx.reference}`,
    template: EMAIL_TEMPLATE.BOOKING_CREATED,
    relatedEntity: 'Booking',
    relatedEntityId: ctx.bookingId,
    layout: {
      preheader: `Complete payment to confirm ${ctx.serviceName}.`,
      heading: 'Your slot is being held',
      intro: `${ctx.firstName}, we have reserved this time for you. It is confirmed once payment clears.`,
      details: [
        ...bookingDetails(ctx),
        { label: 'Due now', value: formatMoney(ctx.total - ctx.amountPaid, ctx.currency), emphasis: true },
      ],
      action: { label: 'Complete payment', url: appUrl(`/portal/bookings/${ctx.bookingId}`) },
      footnote:
        'Unpaid holds are released automatically so the time becomes available to others. Your meeting link is issued once payment is confirmed.',
      tone: 'warning',
    },
  });
}

export function sendBookingConfirmedEmail(
  ctx: BookingEmailContext & { joinUrl: string | null; preparation?: string | null },
): Promise<SendEmailResult> {
  const details = bookingDetails(ctx);
  if (ctx.balance > 0) {
    details.push({ label: 'Balance due before session', value: formatMoney(ctx.balance, ctx.currency), emphasis: true });
  }

  return sendEmail({
    to: ctx.to,
    subject: `Confirmed: ${ctx.serviceName} on ${formatFullDateTime(ctx.startAt, ctx.timezone)}`,
    template: EMAIL_TEMPLATE.BOOKING_CONFIRMED,
    relatedEntity: 'Booking',
    relatedEntityId: ctx.bookingId,
    layout: {
      preheader: `Your consultation with ${ctx.consultantName} is confirmed.`,
      heading: 'Your consultation is confirmed',
      intro: `${ctx.firstName}, everything is set. A calendar invitation is on its way separately.`,
      details,
      bodyHtml: ctx.preparation
        ? `<p style="margin:0 0 8px;font-weight:600;color:#111827;">Before we meet</p><p style="margin:0;">${ctx.preparation}</p>`
        : undefined,
      action: ctx.joinUrl
        ? { label: 'Join the session', url: ctx.joinUrl }
        : { label: 'View your booking', url: appUrl(`/portal/bookings/${ctx.bookingId}`) },
      secondaryAction: ctx.joinUrl
        ? { label: 'View booking details', url: appUrl(`/portal/bookings/${ctx.bookingId}`) }
        : undefined,
      tone: 'success',
    },
  });
}

export function sendPaymentSuccessEmail(args: {
  to: string;
  firstName: string;
  amount: number;
  currency: Currency;
  reference: string;
  description: string;
  paidAt: Date;
  timezone: string;
  relatedEntityId?: string;
}): Promise<SendEmailResult> {
  return sendEmail({
    to: args.to,
    subject: `Payment received — ${formatMoney(args.amount, args.currency)}`,
    template: EMAIL_TEMPLATE.PAYMENT_SUCCESS,
    relatedEntity: 'Payment',
    relatedEntityId: args.relatedEntityId,
    layout: {
      preheader: 'A receipt for your payment.',
      heading: 'Payment received',
      intro: `Thank you, ${args.firstName}. Here is your receipt.`,
      details: [
        { label: 'Amount', value: formatMoney(args.amount, args.currency), emphasis: true },
        { label: 'For', value: args.description },
        { label: 'Reference', value: args.reference },
        { label: 'Paid on', value: formatFullDateTime(args.paidAt, args.timezone) },
      ],
      action: { label: 'View invoices', url: appUrl('/portal/invoices') },
      tone: 'success',
    },
  });
}

export function sendBookingRescheduledEmail(
  ctx: BookingEmailContext & { previousStartAt: Date; joinUrl: string | null },
): Promise<SendEmailResult> {
  return sendEmail({
    to: ctx.to,
    subject: `Rescheduled: ${ctx.serviceName} — ${ctx.reference}`,
    template: EMAIL_TEMPLATE.BOOKING_RESCHEDULED,
    relatedEntity: 'Booking',
    relatedEntityId: ctx.bookingId,
    layout: {
      preheader: 'Your consultation has moved to a new time.',
      heading: 'Your consultation has moved',
      intro: `${ctx.firstName}, this session has been rescheduled. Your calendar invitation has been updated.`,
      details: [
        { label: 'Previously', value: formatFullDateTime(ctx.previousStartAt, ctx.timezone) },
        { label: 'Now', value: formatFullDateTime(ctx.startAt, ctx.timezone), emphasis: true },
        { label: 'Consultation', value: ctx.serviceName },
        { label: 'Consultant', value: ctx.consultantName },
        { label: 'Reference', value: ctx.reference },
      ],
      action: ctx.joinUrl
        ? { label: 'Join at the new time', url: ctx.joinUrl }
        : { label: 'View your booking', url: appUrl(`/portal/bookings/${ctx.bookingId}`) },
    },
  });
}

export function sendBookingCancelledEmail(
  ctx: BookingEmailContext & { reason?: string | null; refundNote?: string | null },
): Promise<SendEmailResult> {
  return sendEmail({
    to: ctx.to,
    subject: `Cancelled: ${ctx.serviceName} — ${ctx.reference}`,
    template: EMAIL_TEMPLATE.BOOKING_CANCELLED,
    relatedEntity: 'Booking',
    relatedEntityId: ctx.bookingId,
    layout: {
      preheader: 'This consultation has been cancelled.',
      heading: 'Your consultation was cancelled',
      intro: `${ctx.firstName}, the following session has been cancelled${
        ctx.reason ? `: ${ctx.reason}` : '.'
      }`,
      details: [
        { label: 'Consultation', value: ctx.serviceName },
        { label: 'Was scheduled for', value: formatFullDateTime(ctx.startAt, ctx.timezone) },
        { label: 'Reference', value: ctx.reference },
      ],
      bodyHtml: ctx.refundNote ? `<p style="margin:0;">${ctx.refundNote}</p>` : undefined,
      action: { label: 'Book another time', url: appUrl('/book') },
    },
  });
}

export function sendSessionReminderEmail(
  ctx: BookingEmailContext & { joinUrl: string | null; hoursAhead: 24 | 1 },
): Promise<SendEmailResult> {
  const when = ctx.hoursAhead === 24 ? 'tomorrow' : 'in one hour';
  return sendEmail({
    to: ctx.to,
    subject: `Reminder: ${ctx.serviceName} ${when}`,
    template:
      ctx.hoursAhead === 24 ? EMAIL_TEMPLATE.SESSION_REMINDER_24H : EMAIL_TEMPLATE.SESSION_REMINDER_1H,
    relatedEntity: 'Booking',
    relatedEntityId: ctx.bookingId,
    layout: {
      preheader: `Your consultation with ${ctx.consultantName} starts ${when}.`,
      heading: `Your consultation is ${when}`,
      intro: `${ctx.firstName}, a quick reminder about your upcoming session.`,
      details: bookingDetails(ctx),
      action: ctx.joinUrl
        ? { label: 'Join the session', url: ctx.joinUrl }
        : { label: 'View your booking', url: appUrl(`/portal/bookings/${ctx.bookingId}`) },
      footnote:
        ctx.balance > 0
          ? `A balance of ${formatMoney(ctx.balance, ctx.currency)} is outstanding on this booking.`
          : undefined,
    },
  });
}

export function sendBalanceDueEmail(ctx: BookingEmailContext): Promise<SendEmailResult> {
  return sendEmail({
    to: ctx.to,
    subject: `Balance due for ${ctx.serviceName} — ${formatMoney(ctx.balance, ctx.currency)}`,
    template: EMAIL_TEMPLATE.BALANCE_DUE,
    relatedEntity: 'Booking',
    relatedEntityId: ctx.bookingId,
    layout: {
      preheader: 'Settle the balance before your session.',
      heading: 'A balance is outstanding',
      intro: `${ctx.firstName}, your deposit is received. Please settle the balance before the session begins.`,
      details: [
        { label: 'Consultation', value: ctx.serviceName },
        { label: 'Date & time', value: formatFullDateTime(ctx.startAt, ctx.timezone) },
        { label: 'Paid so far', value: formatMoney(ctx.amountPaid, ctx.currency) },
        { label: 'Balance due', value: formatMoney(ctx.balance, ctx.currency), emphasis: true },
      ],
      action: { label: 'Pay the balance', url: appUrl(`/portal/bookings/${ctx.bookingId}`) },
      tone: 'warning',
    },
  });
}

export function sendReviewRequestEmail(args: {
  to: string;
  firstName: string;
  bookingId: string;
  serviceName: string;
  consultantName: string;
}): Promise<SendEmailResult> {
  return sendEmail({
    to: args.to,
    subject: `How was your session with ${args.consultantName}?`,
    template: EMAIL_TEMPLATE.REVIEW_REQUEST,
    relatedEntity: 'Booking',
    relatedEntityId: args.bookingId,
    layout: {
      preheader: 'Two minutes to share your experience.',
      heading: 'How did we do?',
      intro: `${args.firstName}, thank you for meeting with ${args.consultantName} for your ${args.serviceName}. Your feedback helps other clients choose well — and helps us improve.`,
      action: { label: 'Leave a review', url: appUrl(`/portal/reviews/new?booking=${args.bookingId}`) },
      footnote: 'Reviews are published only after moderation, and you can choose to stay anonymous.',
    },
  });
}

/* -------------------------------------------------------------------------- */
/* Commerce                                                                   */
/* -------------------------------------------------------------------------- */

export function sendResourcePurchaseEmail(args: {
  to: string;
  firstName: string;
  orderReference: string;
  orderId: string;
  items: string[];
  total: number;
  currency: Currency;
  hasDigital: boolean;
}): Promise<SendEmailResult> {
  return sendEmail({
    to: args.to,
    subject: `Your order ${args.orderReference} is confirmed`,
    template: EMAIL_TEMPLATE.RESOURCE_PURCHASE,
    relatedEntity: 'Order',
    relatedEntityId: args.orderId,
    layout: {
      preheader: 'Your resources are ready.',
      heading: 'Thank you for your order',
      intro: `${args.firstName}, your payment has been received.`,
      details: [
        { label: 'Order', value: args.orderReference, emphasis: true },
        { label: 'Items', value: args.items.join(', ') },
        { label: 'Total', value: formatMoney(args.total, args.currency) },
      ],
      bodyHtml: args.hasDigital
        ? '<p style="margin:0;">Your digital files are available in your portal. Download links are generated fresh each time and expire shortly after issue, so open them from the portal when you need them.</p>'
        : undefined,
      action: { label: 'Open My Resources', url: appUrl('/portal/resources') },
      tone: 'success',
    },
  });
}

export function sendRefundConfirmationEmail(args: {
  to: string;
  firstName: string;
  amount: number;
  currency: Currency;
  reference: string;
  reason: string;
  paymentId: string;
}): Promise<SendEmailResult> {
  return sendEmail({
    to: args.to,
    subject: `Refund issued — ${formatMoney(args.amount, args.currency)}`,
    template: EMAIL_TEMPLATE.REFUND_CONFIRMATION,
    relatedEntity: 'Payment',
    relatedEntityId: args.paymentId,
    layout: {
      preheader: 'Your refund is on its way.',
      heading: 'Your refund has been issued',
      intro: `${args.firstName}, we have processed a refund on your payment.`,
      details: [
        { label: 'Amount refunded', value: formatMoney(args.amount, args.currency), emphasis: true },
        { label: 'Original reference', value: args.reference },
        { label: 'Reason', value: args.reason },
      ],
      footnote:
        'Depending on your bank, refunds usually appear within 5–10 working days. Contact us if it has not arrived by then.',
    },
  });
}

/* -------------------------------------------------------------------------- */
/* Operations                                                                 */
/* -------------------------------------------------------------------------- */

/**
 * Sent to administrators when a meeting could not be created for a paid
 * booking. The client is never told the booking is complete in this state.
 */
export function sendMeetingFailureAlert(args: {
  to: string;
  bookingReference: string;
  bookingId: string;
  provider: MeetingProvider;
  clientName: string;
  startAt: Date;
  timezone: string;
  failureReason: string;
}): Promise<SendEmailResult> {
  return sendEmail({
    to: args.to,
    subject: `Action needed: meeting link failed for ${args.bookingReference}`,
    template: EMAIL_TEMPLATE.MEETING_CREATION_FAILED,
    relatedEntity: 'Booking',
    relatedEntityId: args.bookingId,
    layout: {
      preheader: 'A paid booking has no meeting link.',
      heading: 'A meeting link could not be created',
      intro:
        'This booking is paid and confirmed, but the video meeting could not be created. The client has not been given a join link.',
      details: [
        { label: 'Booking', value: args.bookingReference, emphasis: true },
        { label: 'Client', value: args.clientName },
        { label: 'Starts', value: formatFullDateTime(args.startAt, args.timezone) },
        { label: 'Provider', value: meetingProviderLabel(args.provider) },
        { label: 'Error', value: args.failureReason.slice(0, 200) },
      ],
      action: { label: 'Open in admin', url: appUrl(`/admin/bookings/${args.bookingId}`) },
      tone: 'warning',
    },
  });
}
