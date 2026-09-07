import type {
  ArticleSummaryDto,
  BookingDetailDto,
  BookingSummaryDto,
  ClientSessionDto,
  ConsultantSessionDto,
  ConsultantSummaryDto,
  MeetingDto,
  PaymentSummaryDto,
  ProductSummaryDto,
  ReviewDto,
  ServiceSummaryDto,
  SharedSessionNotesDto,
} from '@meridian/types';
import { bookingCapabilities } from '../services/booking.service.js';

/**
 * Row → DTO conversion.
 *
 * Serialisation is centralised here rather than inlined in routes for one
 * reason above all: it is the layer that decides what a client is allowed to
 * see. `toMeetingDto` drops the host URL. `toClientSession` cannot return
 * private notes because it never receives them in its input type. Keeping that
 * in one file makes the boundary auditable instead of scattered across handlers.
 */

/* -------------------------------------------------------------------------- */
/* Catalog                                                                    */
/* -------------------------------------------------------------------------- */

interface ServiceRow {
  id: string;
  name: string;
  slug: string;
  shortDescription: string;
  currency: string;
  paymentModel: string;
  meetingProviders: string[];
  heroImageUrl: string | null;
  icon: string | null;
  isFeatured: boolean;
  category: { id: string; name: string; slug: string; description: string | null; icon: string | null };
  durations: { id: string; minutes: number; price: number; label: string | null; isDefault: boolean }[];
  consultants?: unknown[];
  _count?: { consultants?: number };
}

export function toServiceSummary(
  service: ServiceRow,
  stats?: { averageRating: number | null; reviewCount: number },
): ServiceSummaryDto {
  const sorted = [...service.durations].sort((a, b) => a.minutes - b.minutes);
  const defaultDuration = sorted.find((d) => d.isDefault) ?? sorted[0];

  return {
    id: service.id,
    name: service.name,
    slug: service.slug,
    shortDescription: service.shortDescription,
    category: {
      id: service.category.id,
      name: service.category.name,
      slug: service.category.slug,
      description: service.category.description,
      icon: service.category.icon,
    },
    currency: service.currency as ServiceSummaryDto['currency'],
    startingPrice: sorted.length > 0 ? Math.min(...sorted.map((d) => d.price)) : 0,
    defaultDurationMinutes: defaultDuration?.minutes ?? 0,
    durations: sorted.map((d) => ({
      id: d.id,
      minutes: d.minutes,
      price: d.price,
      label: d.label,
      isDefault: d.isDefault,
    })),
    paymentModel: service.paymentModel as ServiceSummaryDto['paymentModel'],
    meetingProviders: service.meetingProviders as ServiceSummaryDto['meetingProviders'],
    heroImageUrl: service.heroImageUrl,
    icon: service.icon,
    isFeatured: service.isFeatured,
    averageRating: stats?.averageRating ?? null,
    reviewCount: stats?.reviewCount ?? 0,
    consultantCount: service._count?.consultants ?? service.consultants?.length ?? 0,
  };
}

interface ConsultantRow {
  id: string;
  userId: string;
  slug: string;
  title: string;
  specialties: string[];
  yearsExperience: number;
  averageRating: number | null;
  reviewCount: number;
  completedSessions: number;
  timezone: string;
  isAcceptingBookings: boolean;
  user: { firstName: string; lastName: string; avatarUrl: string | null };
}

export function toConsultantSummary(consultant: ConsultantRow): ConsultantSummaryDto {
  return {
    id: consultant.id,
    userId: consultant.userId,
    slug: consultant.slug,
    firstName: consultant.user.firstName,
    lastName: consultant.user.lastName,
    fullName: `${consultant.user.firstName} ${consultant.user.lastName}`,
    title: consultant.title,
    avatarUrl: consultant.user.avatarUrl,
    specialties: consultant.specialties,
    yearsExperience: consultant.yearsExperience,
    averageRating: consultant.averageRating,
    reviewCount: consultant.reviewCount,
    completedSessions: consultant.completedSessions,
    timezone: consultant.timezone,
    isAcceptingBookings: consultant.isAcceptingBookings,
  };
}

/* -------------------------------------------------------------------------- */
/* Bookings                                                                   */
/* -------------------------------------------------------------------------- */

interface MeetingRow {
  provider: string;
  status: string;
  joinUrl: string | null;
  hostUrl?: string | null;
  passcode: string | null;
  dialInNumber: string | null;
  failureReason: string | null;
}

/**
 * Meeting view for a client.
 *
 * `hostUrl` is accepted in the input type but deliberately never copied to the
 * output — a Zoom start URL grants host control of the meeting and must not
 * leave the server. The join URL is withheld until the meeting is CREATED, so
 * an unpaid or failed booking exposes nothing to join.
 */
export function toMeetingDto(meeting: MeetingRow | null): MeetingDto | null {
  if (!meeting) return null;
  return {
    provider: meeting.provider as MeetingDto['provider'],
    status: meeting.status as MeetingDto['status'],
    joinUrl: meeting.status === 'CREATED' ? meeting.joinUrl : null,
    passcode: meeting.status === 'CREATED' ? meeting.passcode : null,
    dialInNumber: meeting.status === 'CREATED' ? meeting.dialInNumber : null,
    failureReason: meeting.status === 'FAILED' ? 'The meeting link could not be created. Our team has been alerted.' : null,
  };
}

interface BookingRow {
  id: string;
  reference: string;
  status: string;
  paymentStatus: string;
  startAt: Date;
  endAt: Date;
  durationMinutes: number;
  timezone: string;
  currency: string;
  total: number;
  amountPaid: number;
  meetingProvider: string;
  createdAt: Date;
  service: { id: string; name: string; slug: string };
  consultant: {
    id: string;
    slug: string;
    title: string;
    user: { firstName: string; lastName: string; avatarUrl: string | null };
  };
  client?: {
    id: string;
    user: { firstName: string; lastName: string; email: string };
  } | null;
}

export function toBookingSummary(booking: BookingRow): BookingSummaryDto {
  return {
    id: booking.id,
    reference: booking.reference,
    status: booking.status as BookingSummaryDto['status'],
    paymentStatus: booking.paymentStatus as BookingSummaryDto['paymentStatus'],
    startAt: booking.startAt.toISOString(),
    endAt: booking.endAt.toISOString(),
    durationMinutes: booking.durationMinutes,
    timezone: booking.timezone,
    currency: booking.currency as BookingSummaryDto['currency'],
    total: booking.total,
    amountPaid: booking.amountPaid,
    balance: booking.total - booking.amountPaid,
    service: booking.service,
    consultant: {
      id: booking.consultant.id,
      slug: booking.consultant.slug,
      fullName: `${booking.consultant.user.firstName} ${booking.consultant.user.lastName}`,
      title: booking.consultant.title,
      avatarUrl: booking.consultant.user.avatarUrl,
    },
    client: booking.client
      ? {
          id: booking.client.id,
          fullName: `${booking.client.user.firstName} ${booking.client.user.lastName}`,
          email: booking.client.user.email,
        }
      : null,
    meetingProvider: booking.meetingProvider as BookingSummaryDto['meetingProvider'],
    createdAt: booking.createdAt.toISOString(),
  };
}

interface BookingDetailRow extends BookingRow {
  subtotal: number;
  discount: number;
  tax: number;
  taxRateBps: number;
  amountDueNow: number;
  objective: string | null;
  notes: string | null;
  service: BookingRow['service'] & {
    preparationNotes?: string | null;
    cancellationPolicy?: string | null;
    cancellationWindowHours: number;
    rescheduleWindowHours: number;
  };
  videoMeeting?: MeetingRow | null;
  session?: { id: string } | null;
  review?: { id: string } | null;
  payments?: PaymentRow[];
}

export function toBookingDetail(booking: BookingDetailRow): BookingDetailDto {
  const capabilities = bookingCapabilities({
    status: booking.status as BookingDetailDto['status'],
    startAt: booking.startAt,
    total: booking.total,
    amountPaid: booking.amountPaid,
    service: {
      cancellationWindowHours: booking.service.cancellationWindowHours,
      rescheduleWindowHours: booking.service.rescheduleWindowHours,
    },
  });

  return {
    ...toBookingSummary(booking),
    pricing: {
      currency: booking.currency as BookingDetailDto['currency'],
      subtotal: booking.subtotal,
      discount: booking.discount,
      tax: booking.tax,
      taxRateBps: booking.taxRateBps,
      total: booking.total,
      amountDueNow: booking.amountDueNow,
      balance: booking.total - booking.amountDueNow,
      requiresDeposit: booking.amountDueNow < booking.total,
    },
    objective: booking.objective,
    notes: booking.notes,
    preparationNotes: booking.service.preparationNotes ?? null,
    cancellationPolicy: booking.service.cancellationPolicy ?? null,
    cancellationWindowHours: booking.service.cancellationWindowHours,
    rescheduleWindowHours: booking.service.rescheduleWindowHours,
    ...capabilities,
    meeting: toMeetingDto(booking.videoMeeting ?? null),
    sessionId: booking.session?.id ?? null,
    reviewId: booking.review?.id ?? null,
    payments: (booking.payments ?? []).map(toPaymentSummary),
  };
}

/* -------------------------------------------------------------------------- */
/* Payments                                                                   */
/* -------------------------------------------------------------------------- */

interface PaymentRow {
  id: string;
  reference: string;
  amount: number;
  currency: string;
  status: string;
  purpose: string;
  channel: string | null;
  paidAt: Date | null;
  createdAt: Date;
  refundedAmount: number;
}

export function toPaymentSummary(payment: PaymentRow): PaymentSummaryDto {
  return {
    id: payment.id,
    reference: payment.reference,
    amount: payment.amount,
    currency: payment.currency as PaymentSummaryDto['currency'],
    status: payment.status as PaymentSummaryDto['status'],
    purpose: payment.purpose as PaymentSummaryDto['purpose'],
    channel: payment.channel,
    paidAt: payment.paidAt?.toISOString() ?? null,
    createdAt: payment.createdAt.toISOString(),
    refundedAmount: payment.refundedAmount,
  };
}

/* -------------------------------------------------------------------------- */
/* Sessions and notes                                                         */
/* -------------------------------------------------------------------------- */

interface NoteRow {
  objective: string | null;
  discussionSummary: string | null;
  keyFindings: string | null;
  recommendations: string | null;
  actionItems: unknown;
  followUpDate: Date | null;
  sharedWithClient: boolean;
  privateNotes: string | null;
  updatedAt: Date;
}

interface SessionRow {
  id: string;
  bookingId: string;
  status: string;
  startedAt: Date | null;
  endedAt: Date | null;
  booking: BookingRow;
  note?: NoteRow | null;
  attachments?: {
    id: string;
    fileName: string;
    mimeType: string;
    sizeBytes: number;
    visibleToClient: boolean;
    createdAt: Date;
  }[];
}

function toSharedNotes(note: NoteRow | null | undefined): SharedSessionNotesDto | null {
  // Two gates: the note must exist, and the consultant must have shared it.
  if (!note || !note.sharedWithClient) return null;
  return {
    objective: note.objective,
    discussionSummary: note.discussionSummary,
    keyFindings: note.keyFindings,
    recommendations: note.recommendations,
    actionItems: Array.isArray(note.actionItems)
      ? (note.actionItems as SharedSessionNotesDto['actionItems'])
      : [],
    followUpDate: note.followUpDate?.toISOString().slice(0, 10) ?? null,
    updatedAt: note.updatedAt.toISOString(),
  };
}

/**
 * Client view of a session. There is no code path from this function to
 * `note.privateNotes` — the field is read from the row and discarded.
 */
export function toClientSession(session: SessionRow): ClientSessionDto {
  return {
    id: session.id,
    bookingId: session.bookingId,
    status: session.status as ClientSessionDto['status'],
    startedAt: session.startedAt?.toISOString() ?? null,
    endedAt: session.endedAt?.toISOString() ?? null,
    booking: toBookingSummary(session.booking),
    sharedNotes: toSharedNotes(session.note),
    attachments: (session.attachments ?? [])
      // A client sees only attachments explicitly marked visible to them.
      .filter((attachment) => attachment.visibleToClient)
      .map((attachment) => ({
        id: attachment.id,
        fileName: attachment.fileName,
        mimeType: attachment.mimeType,
        sizeBytes: attachment.sizeBytes,
        // Populated per-request by the storage service as a signed URL.
        downloadUrl: null,
        uploadedAt: attachment.createdAt.toISOString(),
        visibleToClient: true,
      })),
  };
}

/** Consultant/admin view. Adds the private note and the client's contact details. */
export function toConsultantSession(
  session: SessionRow & {
    booking: BookingRow & {
      client: { id: string; user: { firstName: string; lastName: string; email: string; phone: string | null; company: string | null } };
    };
  },
): ConsultantSessionDto {
  const client = session.booking.client.user;

  return {
    ...toClientSession(session),
    // Consultant view shows every attachment, not only the shared ones.
    attachments: (session.attachments ?? []).map((attachment) => ({
      id: attachment.id,
      fileName: attachment.fileName,
      mimeType: attachment.mimeType,
      sizeBytes: attachment.sizeBytes,
      downloadUrl: null,
      uploadedAt: attachment.createdAt.toISOString(),
      visibleToClient: attachment.visibleToClient,
    })),
    // The consultant also sees the write-up before it has been shared.
    sharedNotes: session.note
      ? {
          objective: session.note.objective,
          discussionSummary: session.note.discussionSummary,
          keyFindings: session.note.keyFindings,
          recommendations: session.note.recommendations,
          actionItems: Array.isArray(session.note.actionItems)
            ? (session.note.actionItems as SharedSessionNotesDto['actionItems'])
            : [],
          followUpDate: session.note.followUpDate?.toISOString().slice(0, 10) ?? null,
          updatedAt: session.note.updatedAt.toISOString(),
        }
      : null,
    privateNotes: session.note?.privateNotes ?? null,
    clientContact: {
      email: client.email,
      phone: client.phone,
      company: client.company,
    },
    notesUpdatedAt: session.note?.updatedAt.toISOString() ?? null,
  };
}

/* -------------------------------------------------------------------------- */
/* Reviews, products, articles                                                */
/* -------------------------------------------------------------------------- */

interface ReviewRow {
  id: string;
  rating: number;
  title: string | null;
  body: string;
  serviceRating: number | null;
  consultantRating: number | null;
  communicationRating: number | null;
  valueRating: number | null;
  displayName: string | null;
  isAnonymous: boolean;
  isVerified: boolean;
  status: string;
  createdAt: Date;
  user?: { firstName: string; lastName: string } | null;
  service?: { name: string } | null;
  consultant?: { user: { firstName: string; lastName: string } } | null;
}

export function toReviewDto(review: ReviewRow): ReviewDto {
  // An anonymous review must not leak the author's name, even to admins
  // browsing the public list — admin has a separate view for that.
  const authorName = review.isAnonymous
    ? 'Verified client'
    : review.displayName ??
      (review.user ? `${review.user.firstName} ${review.user.lastName.charAt(0)}.` : 'Verified client');

  return {
    id: review.id,
    rating: review.rating,
    title: review.title,
    body: review.body,
    serviceRating: review.serviceRating,
    consultantRating: review.consultantRating,
    communicationRating: review.communicationRating,
    valueRating: review.valueRating,
    authorName,
    isVerified: review.isVerified,
    status: review.status as ReviewDto['status'],
    serviceName: review.service?.name ?? null,
    consultantName: review.consultant
      ? `${review.consultant.user.firstName} ${review.consultant.user.lastName}`
      : null,
    createdAt: review.createdAt.toISOString(),
  };
}

interface ProductRow {
  id: string;
  name: string;
  slug: string;
  shortDescription: string | null;
  coverImageUrl: string | null;
  author: string | null;
  price: number;
  compareAtPrice: number | null;
  currency: string;
  type: string;
  stock: number | null;
  isFeatured: boolean;
  category: { id: string; name: string; slug: string };
}

export function toProductSummary(product: ProductRow): ProductSummaryDto {
  return {
    id: product.id,
    name: product.name,
    slug: product.slug,
    shortDescription: product.shortDescription,
    coverImageUrl: product.coverImageUrl,
    author: product.author,
    category: product.category,
    price: product.price,
    compareAtPrice: product.compareAtPrice,
    currency: product.currency as ProductSummaryDto['currency'],
    type: product.type as ProductSummaryDto['type'],
    // Digital goods never run out; physical stock of null means untracked.
    inStock: product.type === 'DIGITAL' || product.stock === null || product.stock > 0,
    isFeatured: product.isFeatured,
    averageRating: null,
  };
}

interface ArticleRow {
  id: string;
  title: string;
  slug: string;
  excerpt: string;
  featuredImageUrl: string | null;
  tags: string[];
  readingMinutes: number;
  publishedAt: Date | null;
  isJournal: boolean;
  category: { id: string; name: string; slug: string };
  author: { id: string; firstName: string; lastName: string; jobTitle: string | null; avatarUrl: string | null } | null;
}

export function toArticleSummary(article: ArticleRow): ArticleSummaryDto {
  return {
    id: article.id,
    title: article.title,
    slug: article.slug,
    excerpt: article.excerpt,
    featuredImageUrl: article.featuredImageUrl,
    category: article.category,
    tags: article.tags,
    author: article.author
      ? {
          id: article.author.id,
          fullName: `${article.author.firstName} ${article.author.lastName}`,
          title: article.author.jobTitle,
          avatarUrl: article.author.avatarUrl,
        }
      : null,
    readingMinutes: article.readingMinutes,
    publishedAt: article.publishedAt?.toISOString() ?? null,
    isJournal: article.isJournal,
  };
}
