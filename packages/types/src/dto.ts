import type { PriceBreakdown } from './money.js';
import type {
  BookingStatus,
  ContentStatus,
  Currency,
  MeetingProvider,
  MeetingStatus,
  NotificationType,
  OrderStatus,
  PaymentModel,
  PaymentPurpose,
  PaymentStatus,
  ProductType,
  ReviewStatus,
  Role,
  SessionStatus,
} from './enums.js';
import type { Permission } from './permissions.js';

/** Shape returned by GET /api/auth/me; drives every client-side guard. */
export interface AuthenticatedUser {
  id: string;
  email: string;
  firstName: string;
  lastName: string;
  avatarUrl: string | null;
  phone: string | null;
  company: string | null;
  jobTitle: string | null;
  timezone: string;
  emailVerified: boolean;
  marketingOptIn: boolean;
  roles: Role[];
  permissions: Permission[];
  consultantProfileId: string | null;
  createdAt: string;
}

export interface AuthTokens {
  accessToken: string;
  /** Seconds until accessToken expires. The refresh token is an httpOnly cookie. */
  expiresIn: number;
}

export interface AuthResult {
  user: AuthenticatedUser;
  tokens: AuthTokens;
}

export interface ServiceCategoryDto {
  id: string;
  name: string;
  slug: string;
  description: string | null;
  icon: string | null;
  serviceCount?: number;
}

export interface ServiceDurationDto {
  id: string;
  minutes: number;
  price: number;
  label: string | null;
  isDefault: boolean;
}

export interface ServiceSummaryDto {
  id: string;
  name: string;
  slug: string;
  shortDescription: string;
  category: ServiceCategoryDto;
  currency: Currency;
  /** Lowest configured duration price - the "from" price shown on cards. */
  startingPrice: number;
  defaultDurationMinutes: number;
  durations: ServiceDurationDto[];
  paymentModel: PaymentModel;
  meetingProviders: MeetingProvider[];
  heroImageUrl: string | null;
  icon: string | null;
  isFeatured: boolean;
  averageRating: number | null;
  reviewCount: number;
  consultantCount: number;
}

export interface ServiceDetailDto extends ServiceSummaryDto {
  fullDescription: string;
  preparationNotes: string | null;
  cancellationPolicy: string | null;
  reschedulePolicy: string | null;
  cancellationWindowHours: number;
  rescheduleWindowHours: number;
  leadTimeHours: number;
  bookingHorizonDays: number;
  taxRateBps: number;
  depositAmount: number | null;
  depositPercentBps: number | null;
  status: ContentStatus;
  seoTitle: string | null;
  seoDescription: string | null;
  consultants: ConsultantSummaryDto[];
}

export interface ConsultantSummaryDto {
  id: string;
  userId: string;
  slug: string;
  firstName: string;
  lastName: string;
  fullName: string;
  title: string;
  avatarUrl: string | null;
  specialties: string[];
  yearsExperience: number;
  averageRating: number | null;
  reviewCount: number;
  completedSessions: number;
  timezone: string;
  isAcceptingBookings: boolean;
}

export interface ConsultantDetailDto extends ConsultantSummaryDto {
  biography: string;
  qualifications: string[];
  languages: string[];
  linkedinUrl: string | null;
  websiteUrl: string | null;
  services: ServiceSummaryDto[];
  reviews: ReviewDto[];
}

export interface MeetingDto {
  provider: MeetingProvider;
  status: MeetingStatus;
  /** Participant URL only. Host and start URLs are never serialised here. */
  joinUrl: string | null;
  passcode: string | null;
  dialInNumber: string | null;
  failureReason: string | null;
}

export interface BookingSummaryDto {
  id: string;
  reference: string;
  status: BookingStatus;
  paymentStatus: PaymentStatus;
  startAt: string;
  endAt: string;
  durationMinutes: number;
  timezone: string;
  currency: Currency;
  total: number;
  amountPaid: number;
  balance: number;
  service: { id: string; name: string; slug: string };
  consultant: {
    id: string;
    fullName: string;
    title: string;
    avatarUrl: string | null;
    slug: string;
  };
  client: { id: string; fullName: string; email: string } | null;
  meetingProvider: MeetingProvider;
  createdAt: string;
}

export interface BookingDetailDto extends BookingSummaryDto {
  pricing: PriceBreakdown;
  objective: string | null;
  notes: string | null;
  preparationNotes: string | null;
  cancellationPolicy: string | null;
  cancellationWindowHours: number;
  rescheduleWindowHours: number;
  canCancel: boolean;
  canReschedule: boolean;
  canPayBalance: boolean;
  /** Present only once payment is confirmed and the meeting was created. */
  meeting: MeetingDto | null;
  sessionId: string | null;
  reviewId: string | null;
  payments: PaymentSummaryDto[];
}

export interface PaymentSummaryDto {
  id: string;
  reference: string;
  amount: number;
  currency: Currency;
  status: PaymentStatus;
  purpose: PaymentPurpose;
  channel: string | null;
  paidAt: string | null;
  createdAt: string;
  refundedAmount: number;
}

export interface InvoiceDto {
  id: string;
  number: string;
  status: string;
  currency: Currency;
  subtotal: number;
  tax: number;
  discount: number;
  total: number;
  amountPaid: number;
  balance: number;
  issuedAt: string | null;
  dueAt: string | null;
  bookingId: string | null;
  orderId: string | null;
  lines: { description: string; quantity: number; unitAmount: number; amount: number }[];
}

export interface SharedSessionNotesDto {
  objective: string | null;
  discussionSummary: string | null;
  keyFindings: string | null;
  recommendations: string | null;
  actionItems: {
    description: string;
    owner: string;
    dueDate: string | null;
    completed: boolean;
  }[];
  followUpDate: string | null;
  updatedAt: string;
}

/** Client-safe session view. Private consultant notes are absent by construction. */
export interface ClientSessionDto {
  id: string;
  bookingId: string;
  status: SessionStatus;
  startedAt: string | null;
  endedAt: string | null;
  booking: BookingSummaryDto;
  /** Populated only once the consultant has explicitly shared the write-up. */
  sharedNotes: SharedSessionNotesDto | null;
  attachments: AttachmentDto[];
}

/** Consultant/admin view. Adds the private note body and client contact details. */
export interface ConsultantSessionDto extends ClientSessionDto {
  privateNotes: string | null;
  clientContact: { email: string; phone: string | null; company: string | null };
  notesUpdatedAt: string | null;
}

export interface AttachmentDto {
  id: string;
  fileName: string;
  mimeType: string;
  sizeBytes: number;
  /** Short-lived signed URL, regenerated per request. Never a raw bucket path. */
  downloadUrl: string | null;
  uploadedAt: string;
  visibleToClient: boolean;
}

export interface ReviewDto {
  id: string;
  rating: number;
  title: string | null;
  body: string;
  serviceRating: number | null;
  consultantRating: number | null;
  communicationRating: number | null;
  valueRating: number | null;
  authorName: string;
  isVerified: boolean;
  status: ReviewStatus;
  serviceName: string | null;
  consultantName: string | null;
  createdAt: string;
}

export interface ProductSummaryDto {
  id: string;
  name: string;
  slug: string;
  shortDescription: string | null;
  coverImageUrl: string | null;
  author: string | null;
  category: { id: string; name: string; slug: string };
  price: number;
  compareAtPrice: number | null;
  currency: Currency;
  type: ProductType;
  inStock: boolean;
  isFeatured: boolean;
  averageRating: number | null;
}

export interface ProductDetailDto extends ProductSummaryDto {
  description: string;
  galleryUrls: string[];
  sku: string | null;
  stock: number | null;
  isbn: string | null;
  pages: number | null;
  publishedYear: number | null;
  seoTitle: string | null;
  seoDescription: string | null;
}

export interface OrderDto {
  id: string;
  reference: string;
  status: OrderStatus;
  currency: Currency;
  subtotal: number;
  tax: number;
  shipping: number;
  total: number;
  amountPaid: number;
  items: {
    id: string;
    productId: string;
    name: string;
    slug: string;
    coverImageUrl: string | null;
    quantity: number;
    unitAmount: number;
    amount: number;
    type: ProductType;
    /** Non-null only once the order is paid and the product is digital. */
    downloadUrl: string | null;
  }[];
  createdAt: string;
  paidAt: string | null;
}

export interface ArticleSummaryDto {
  id: string;
  title: string;
  slug: string;
  excerpt: string;
  featuredImageUrl: string | null;
  category: { id: string; name: string; slug: string };
  tags: string[];
  author: {
    id: string;
    fullName: string;
    title: string | null;
    avatarUrl: string | null;
  } | null;
  readingMinutes: number;
  publishedAt: string | null;
  isJournal: boolean;
}

export interface ArticleDetailDto extends ArticleSummaryDto {
  content: string;
  status: ContentStatus;
  seoTitle: string | null;
  seoDescription: string | null;
  journalVolume: string | null;
  journalIssue: string | null;
  doi: string | null;
  related: ArticleSummaryDto[];
}

export interface NotificationDto {
  id: string;
  type: NotificationType;
  title: string;
  body: string;
  href: string | null;
  readAt: string | null;
  createdAt: string;
}

export interface IntegrationStatusDto {
  key: string;
  name: string;
  category: 'calendar' | 'video' | 'payments' | 'email' | 'storage';
  /** not_connected when credentials are absent - never a fabricated success. */
  state: 'connected' | 'not_connected' | 'error' | 'mocked';
  detail: string | null;
  connectedAt: string | null;
  accountLabel: string | null;
}

export interface StatDelta {
  value: number;
  /** Percentage change against the preceding period of equal length. */
  changePercent: number | null;
}

export interface AdminDashboardDto {
  currency: Currency;
  totalRevenue: StatDelta;
  revenueThisMonth: StatDelta;
  bookings: StatDelta;
  completedSessions: StatDelta;
  pendingSessions: number;
  activeClients: StatDelta;
  newClients: StatDelta;
  averageSessionValue: StatDelta;
  averageRating: number | null;
  outstandingBalance: number;
  productSales: StatDelta;
  conversionRatePercent: number | null;
  cancellationRatePercent: number | null;
  noShowRatePercent: number | null;
  repeatClientRatePercent: number | null;
  consultantUtilisationPercent: number | null;
}

export interface TimeSeriesPoint {
  date: string;
  value: number;
  secondaryValue?: number;
}

export interface BreakdownPoint {
  label: string;
  value: number;
  count?: number;
}

export interface AnalyticsDto {
  dashboard: AdminDashboardDto;
  revenueOverTime: TimeSeriesPoint[];
  bookingsOverTime: TimeSeriesPoint[];
  sessionsByService: BreakdownPoint[];
  revenueByService: BreakdownPoint[];
  consultantPerformance: BreakdownPoint[];
  paymentChannels: BreakdownPoint[];
  newVsReturning: BreakdownPoint[];
}

export interface AuditLogDto {
  id: string;
  action: string;
  entity: string;
  entityId: string | null;
  actor: { id: string; fullName: string; email: string } | null;
  ip: string | null;
  userAgent: string | null;
  metadata: Record<string, unknown> | null;
  createdAt: string;
}

export interface ActivityEventDto {
  id: string;
  type: string;
  title: string;
  description: string | null;
  occurredAt: string;
  href: string | null;
}

export interface GlobalSearchResultDto {
  services: { id: string; name: string; slug: string; description: string }[];
  consultants: {
    id: string;
    fullName: string;
    slug: string;
    title: string;
    avatarUrl: string | null;
  }[];
  articles: { id: string; title: string; slug: string; excerpt: string; isJournal: boolean }[];
  products: {
    id: string;
    name: string;
    slug: string;
    coverImageUrl: string | null;
    type: ProductType;
  }[];
}
