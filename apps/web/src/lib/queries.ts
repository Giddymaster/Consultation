import { QueryClient, useMutation, useQuery, useQueryClient } from '@tanstack/react-query';
import type {
  AdminDashboardDto,
  AnalyticsDto,
  AuthenticatedUser,
  ArticleDetailDto,
  ArticleSummaryDto,
  AvailabilityResponse,
  BookingDetailDto,
  BookingSummaryDto,
  ClientSessionDto,
  ConsultantDetailDto,
  ConsultantSummaryDto,
  ConsultantSessionDto,
  CreateBookingInput,
  GlobalSearchResultDto,
  IntegrationStatusDto,
  Paginated,
  PaymentInitialization,
  ProductDetailDto,
  ProductSummaryDto,
  ReviewDto,
  ServiceCategoryDto,
  ServiceDetailDto,
  ServiceSummaryDto,
  UpdateProfileInput,
} from '@meridian/types';
import { ApiError, api } from './api';

/**
 * Query layer.
 *
 * Keys are declared once in `keys` so an invalidation after a mutation cannot
 * silently miss a cache entry because a key was retyped slightly differently
 * at the call site.
 */

export const queryClient = new QueryClient({
  defaultOptions: {
    queries: {
      staleTime: 60_000,
      gcTime: 5 * 60_000,
      refetchOnWindowFocus: false,
      retry: (failureCount, error) => {
        // Retrying a 4xx just repeats the same rejection; only transient
        // failures are worth a second attempt.
        if (error instanceof ApiError && error.status < 500) return false;
        return failureCount < 2;
      },
    },
    mutations: { retry: false },
  },
});

export const keys = {
  services: (params?: unknown) => ['services', params] as const,
  service: (slug: string) => ['service', slug] as const,
  serviceCategories: () => ['service-categories'] as const,
  consultants: (params?: unknown) => ['consultants', params] as const,
  consultant: (slug: string) => ['consultant', slug] as const,
  availability: (params: unknown) => ['availability', params] as const,
  reviews: (params?: unknown) => ['reviews', params] as const,

  bookings: (params?: unknown) => ['bookings', params] as const,
  booking: (id: string) => ['booking', id] as const,
  bookingByReference: (reference: string) => ['booking-ref', reference] as const,

  sessions: (params?: unknown) => ['sessions', params] as const,
  session: (id: string) => ['session', id] as const,

  payments: (params?: unknown) => ['payments', params] as const,
  payment: (id: string) => ['payment', id] as const,

  products: (params?: unknown) => ['products', params] as const,
  product: (slug: string) => ['product', slug] as const,
  productCategories: () => ['product-categories'] as const,
  orders: (params?: unknown) => ['orders', params] as const,
  myResources: () => ['my-resources'] as const,

  articles: (params?: unknown) => ['articles', params] as const,
  article: (slug: string) => ['article', slug] as const,
  articleCategories: () => ['article-categories'] as const,

  portalDashboard: () => ['portal-dashboard'] as const,
  portalInvoices: () => ['portal-invoices'] as const,
  consultantDashboard: () => ['consultant-dashboard'] as const,
  consultantAvailability: (id: string) => ['consultant-availability', id] as const,
  consultantClients: (params?: unknown) => ['consultant-clients', params] as const,
  consultantClient: (id: string) => ['consultant-client', id] as const,
  consultantCalendar: (params?: unknown) => ['consultant-calendar', params] as const,
  consultantReviews: (params?: unknown) => ['consultant-reviews', params] as const,
  consultantProfile: () => ['consultant-profile'] as const,
  myReviews: (params?: unknown) => ['my-reviews', params] as const,

  adminDashboard: (params?: unknown) => ['admin-dashboard', params] as const,
  adminAnalytics: (params?: unknown) => ['admin-analytics', params] as const,
  adminClients: (params?: unknown) => ['admin-clients', params] as const,
  adminClient: (id: string) => ['admin-client', id] as const,
  adminUsers: (params?: unknown) => ['admin-users', params] as const,
  auditLogs: (params?: unknown) => ['audit-logs', params] as const,
  emailLogs: (params?: unknown) => ['email-logs', params] as const,
  integrations: () => ['integrations'] as const,
  settings: () => ['settings'] as const,
  publicSettings: () => ['public-settings'] as const,
  pendingReviews: (params?: unknown) => ['pending-reviews', params] as const,

  notifications: (unreadOnly?: boolean) => ['notifications', unreadOnly] as const,
  search: (q: string) => ['search', q] as const,
};

type QueryParams = Record<string, string | number | boolean | undefined | null>;

/* -------------------------------------------------------------------------- */
/* Public catalog                                                             */
/* -------------------------------------------------------------------------- */

export function useServices(params: QueryParams = {}) {
  return useQuery({
    queryKey: keys.services(params),
    queryFn: () => api.get<Paginated<ServiceSummaryDto>>('/api/services', params),
  });
}

export function useService(slug: string | undefined) {
  return useQuery({
    queryKey: keys.service(slug ?? ''),
    queryFn: () => api.get<ServiceDetailDto>(`/api/services/${slug}`),
    enabled: Boolean(slug),
  });
}

export function useServiceCategories() {
  return useQuery({
    queryKey: keys.serviceCategories(),
    queryFn: () => api.get<ServiceCategoryDto[]>('/api/service-categories'),
    staleTime: 10 * 60_000,
  });
}

export function useConsultants(params: QueryParams = {}) {
  return useQuery({
    queryKey: keys.consultants(params),
    queryFn: () => api.get<Paginated<ConsultantSummaryDto>>('/api/consultants', params),
  });
}

export function useConsultant(slug: string | undefined) {
  return useQuery({
    queryKey: keys.consultant(slug ?? ''),
    queryFn: () => api.get<ConsultantDetailDto>(`/api/consultants/${slug}`),
    enabled: Boolean(slug),
  });
}

export interface AvailabilityParams {
  serviceId?: string;
  consultantId?: string;
  durationMinutes?: number;
  from?: string;
  to?: string;
  timezone: string;
}

export function useAvailability(params: AvailabilityParams) {
  const ready = Boolean(params.serviceId && params.consultantId && params.durationMinutes && params.from && params.to);

  return useQuery({
    queryKey: keys.availability(params),
    queryFn: () => api.get<AvailabilityResponse>('/api/availability', params as unknown as QueryParams),
    enabled: ready,
    // Availability goes stale quickly — someone else may be booking right now.
    staleTime: 20_000,
  });
}

export function usePublicReviews(params: QueryParams = {}) {
  return useQuery({
    queryKey: keys.reviews(params),
    queryFn: () => api.get<Paginated<ReviewDto> & { averageRating: number | null }>('/api/reviews', params),
  });
}

/* -------------------------------------------------------------------------- */
/* Bookings                                                                   */
/* -------------------------------------------------------------------------- */

export function useBookings(params: QueryParams = {}) {
  return useQuery({
    queryKey: keys.bookings(params),
    queryFn: () => api.get<Paginated<BookingSummaryDto>>('/api/bookings', params),
  });
}

export function useBooking(id: string | undefined) {
  return useQuery({
    queryKey: keys.booking(id ?? ''),
    queryFn: () => api.get<BookingDetailDto>(`/api/bookings/${id}`),
    enabled: Boolean(id),
  });
}

export function useBookingByReference(reference: string | undefined) {
  return useQuery({
    queryKey: keys.bookingByReference(reference ?? ''),
    queryFn: () => api.get<BookingDetailDto>(`/api/bookings/by-reference/${reference}`),
    enabled: Boolean(reference),
  });
}

export function useCreateBooking() {
  const client = useQueryClient();
  return useMutation({
    mutationFn: (input: CreateBookingInput) =>
      api.post<{ booking: BookingDetailDto; requiresPayment: boolean }>('/api/bookings', input),
    onSuccess: () => {
      void client.invalidateQueries({ queryKey: ['bookings'] });
      void client.invalidateQueries({ queryKey: ['availability'] });
      void client.invalidateQueries({ queryKey: ['portal-dashboard'] });
    },
  });
}

export function useRescheduleBooking(id: string) {
  const client = useQueryClient();
  return useMutation({
    mutationFn: (input: { startAt: string; timezone: string; reason?: string; consultantId?: string }) =>
      api.post<BookingDetailDto>(`/api/bookings/${id}/reschedule`, input),
    onSuccess: () => {
      void client.invalidateQueries({ queryKey: keys.booking(id) });
      void client.invalidateQueries({ queryKey: ['bookings'] });
      void client.invalidateQueries({ queryKey: ['availability'] });
    },
  });
}

export function useCancelBooking(id: string) {
  const client = useQueryClient();
  return useMutation({
    mutationFn: (input: { reason?: string; requestRefund?: boolean }) =>
      api.post<BookingDetailDto>(`/api/bookings/${id}/cancel`, input),
    onSuccess: () => {
      void client.invalidateQueries({ queryKey: keys.booking(id) });
      void client.invalidateQueries({ queryKey: ['bookings'] });
      void client.invalidateQueries({ queryKey: ['availability'] });
      void client.invalidateQueries({ queryKey: ['portal-dashboard'] });
    },
  });
}

/* -------------------------------------------------------------------------- */
/* Payments                                                                   */
/* -------------------------------------------------------------------------- */

export function useInitializePayment() {
  return useMutation({
    mutationFn: (input: {
      purpose: 'FULL_PAYMENT' | 'DEPOSIT' | 'BALANCE_PAYMENT' | 'PRODUCT_ORDER';
      bookingId?: string;
      orderId?: string;
      callbackPath?: string;
    }) => api.post<PaymentInitialization>('/api/payments/initialize', input),
  });
}

/**
 * Asks the server to verify a transaction with Paystack. Called from the
 * confirmation screen — the browser reaching that page is not itself proof of
 * payment, so the server re-checks with the provider.
 */
export function useVerifyPayment() {
  const client = useQueryClient();
  return useMutation({
    mutationFn: (reference: string) =>
      api.post<{ status: string; bookingId: string | null; orderId: string | null }>('/api/payments/verify', {
        reference,
      }),
    onSuccess: () => {
      void client.invalidateQueries({ queryKey: ['bookings'] });
      void client.invalidateQueries({ queryKey: ['orders'] });
      void client.invalidateQueries({ queryKey: ['portal-dashboard'] });
    },
  });
}

export function usePayments(params: QueryParams = {}) {
  return useQuery({
    queryKey: keys.payments(params),
    queryFn: () =>
      api.get<
        Paginated<Record<string, unknown>> & { totals: { collected: number; refunded: number; fees: number } }
      >('/api/payments', params),
  });
}

/* -------------------------------------------------------------------------- */
/* Sessions                                                                   */
/* -------------------------------------------------------------------------- */

export function useSessions(params: QueryParams = {}) {
  return useQuery({
    queryKey: keys.sessions(params),
    queryFn: () => api.get<Paginated<ClientSessionDto | ConsultantSessionDto>>('/api/sessions', params),
  });
}

export function useSession(id: string | undefined) {
  return useQuery({
    queryKey: keys.session(id ?? ''),
    queryFn: () => api.get<ClientSessionDto | ConsultantSessionDto>(`/api/sessions/${id}`),
    enabled: Boolean(id),
  });
}

export function useSaveSessionNotes(sessionId: string) {
  const client = useQueryClient();
  return useMutation({
    mutationFn: (input: unknown) => api.put<ConsultantSessionDto>(`/api/sessions/${sessionId}/notes`, input),
    onSuccess: (data) => {
      // Written straight into the cache so autosave does not cause a refetch
      // that could clobber what the consultant is still typing.
      client.setQueryData(keys.session(sessionId), data);
    },
  });
}

export function useSubmitReview() {
  const client = useQueryClient();
  return useMutation({
    mutationFn: (input: unknown) => api.post<ReviewDto>('/api/sessions/reviews', input),
    onSuccess: () => {
      void client.invalidateQueries({ queryKey: ['portal-dashboard'] });
      void client.invalidateQueries({ queryKey: ['bookings'] });
    },
  });
}

/* -------------------------------------------------------------------------- */
/* Shop                                                                       */
/* -------------------------------------------------------------------------- */

export function useProducts(params: QueryParams = {}) {
  return useQuery({
    queryKey: keys.products(params),
    queryFn: () => api.get<Paginated<ProductSummaryDto>>('/api/products', params),
  });
}

export function useProduct(slug: string | undefined) {
  return useQuery({
    queryKey: keys.product(slug ?? ''),
    queryFn: () => api.get<ProductDetailDto>(`/api/products/${slug}`),
    enabled: Boolean(slug),
  });
}

export function useProductCategories() {
  return useQuery({
    queryKey: keys.productCategories(),
    queryFn: () => api.get<{ id: string; name: string; slug: string; productCount: number }[]>('/api/product-categories'),
    staleTime: 10 * 60_000,
  });
}

export function useCreateOrder() {
  const client = useQueryClient();
  return useMutation({
    mutationFn: (input: unknown) =>
      api.post<{ id: string; reference: string; total: number; currency: string }>('/api/orders', input),
    onSuccess: () => void client.invalidateQueries({ queryKey: ['orders'] }),
  });
}

export function useOrders(params: QueryParams = {}) {
  return useQuery({
    queryKey: keys.orders(params),
    queryFn: () => api.get<Paginated<Record<string, unknown>>>('/api/orders', params),
  });
}

export function useMyResources() {
  return useQuery({
    queryKey: keys.myResources(),
    queryFn: () =>
      api.get<
        {
          entitlementId: string;
          product: ProductSummaryDto;
          orderReference: string;
          purchasedAt: string;
          downloadCount: number;
          fileName: string | null;
          sizeBytes: number | null;
        }[]
      >('/api/my-resources'),
  });
}

export function useRequestDownload() {
  return useMutation({
    mutationFn: (entitlementId: string) =>
      api.post<{ url: string; fileName: string; expiresInSeconds: number }>(`/api/downloads/${entitlementId}`),
  });
}

/* -------------------------------------------------------------------------- */
/* Content                                                                    */
/* -------------------------------------------------------------------------- */

export function useArticles(params: QueryParams = {}) {
  return useQuery({
    queryKey: keys.articles(params),
    queryFn: () => api.get<Paginated<ArticleSummaryDto>>('/api/articles', params),
  });
}

export function useArticle(slug: string | undefined) {
  return useQuery({
    queryKey: keys.article(slug ?? ''),
    queryFn: () => api.get<ArticleDetailDto>(`/api/articles/${slug}`),
    enabled: Boolean(slug),
  });
}

export function useArticleCategories() {
  return useQuery({
    queryKey: keys.articleCategories(),
    queryFn: () => api.get<{ id: string; name: string; slug: string; articleCount: number }[]>('/api/article-categories'),
    staleTime: 10 * 60_000,
  });
}

/* -------------------------------------------------------------------------- */
/* Portals                                                                    */
/* -------------------------------------------------------------------------- */

export interface PortalDashboard {
  nextSession: BookingSummaryDto | null;
  upcoming: BookingSummaryDto[];
  upcomingCount: number;
  totalSessions: number;
  outstandingBalance: number;
  outstandingBookings: { id: string; reference: string; balance: number; currency: string; startAt: string }[];
  currency: string;
  recentPurchases: { id: string; reference: string; total: number; currency: string; itemCount: number; paidAt: string | null }[];
  unreadNotifications: number;
  pendingReviews: { bookingId: string; reference: string; serviceName: string; consultantName: string }[];
}

export function usePortalDashboard() {
  return useQuery({
    queryKey: keys.portalDashboard(),
    queryFn: () => api.get<PortalDashboard>('/api/portal/dashboard'),
  });
}

export function usePortalInvoices() {
  return useQuery({
    queryKey: keys.portalInvoices(),
    queryFn: () => api.get<Record<string, unknown>[]>('/api/portal/invoices'),
  });
}

export interface ConsultantDashboard {
  today: BookingSummaryDto[];
  upcoming: BookingSummaryDto[];
  completedSessions: number;
  revenueThisMonth: number;
  currency: string;
  clientCount: number;
  pendingBalance: number;
  pendingBalanceCount: number;
  averageRating: number | null;
  reviewCount: number;
  isAcceptingBookings: boolean;
  unreadNotifications: number;
}

export function useConsultantDashboard(enabled = true) {
  return useQuery({
    queryKey: keys.consultantDashboard(),
    queryFn: () => api.get<ConsultantDashboard>('/api/consultant/dashboard'),
    enabled,
  });
}

export interface AvailabilityConfig {
  timezone: string;
  slotIntervalMinutes: number;
  isAcceptingBookings: boolean;
  rules: { id: string; weekday: number; startTime: string; endTime: string; isActive: boolean }[];
  blackouts: { id: string; startAt: string; endAt: string; reason: string | null }[];
  calendarConnections: {
    id: string;
    provider: string;
    accountEmail: string;
    syncEnabled: boolean;
    lastSyncedAt: string | null;
    state: string;
    detail: string | null;
  }[];
}

export function useAvailabilityConfig(consultantId: string | null | undefined) {
  return useQuery({
    queryKey: keys.consultantAvailability(consultantId ?? ''),
    queryFn: () => api.get<AvailabilityConfig>(`/api/admin/consultants/${consultantId}/availability`),
    enabled: Boolean(consultantId),
  });
}

export function useSaveAvailability(consultantId: string) {
  const client = useQueryClient();
  return useMutation({
    mutationFn: (input: unknown) => api.put(`/api/admin/consultants/${consultantId}/availability`, input),
    onSuccess: () => {
      void client.invalidateQueries({ queryKey: keys.consultantAvailability(consultantId) });
      void client.invalidateQueries({ queryKey: ['availability'] });
    },
  });
}

/* -------------------------------------------------------------------------- */
/* Admin                                                                      */
/* -------------------------------------------------------------------------- */

export function useAdminDashboard(params: QueryParams = {}) {
  return useQuery({
    queryKey: keys.adminDashboard(params),
    queryFn: () => api.get<AdminDashboardDto>('/api/admin/dashboard', params),
  });
}

export function useAdminAnalytics(params: QueryParams = {}) {
  return useQuery({
    queryKey: keys.adminAnalytics(params),
    queryFn: () => api.get<AnalyticsDto>('/api/admin/analytics', params),
  });
}

export function useAdminClients(params: QueryParams = {}) {
  return useQuery({
    queryKey: keys.adminClients(params),
    queryFn: () => api.get<Paginated<Record<string, unknown>>>('/api/admin/clients', params),
  });
}

export function useAdminClient(id: string | undefined) {
  return useQuery({
    queryKey: keys.adminClient(id ?? ''),
    queryFn: () => api.get<Record<string, unknown>>(`/api/admin/clients/${id}`),
    enabled: Boolean(id),
  });
}

export function useAdminUsers(params: QueryParams = {}) {
  return useQuery({
    queryKey: keys.adminUsers(params),
    queryFn: () => api.get<Paginated<Record<string, unknown>>>('/api/admin/users', params),
  });
}

export function useAuditLogs(params: QueryParams = {}) {
  return useQuery({
    queryKey: keys.auditLogs(params),
    queryFn: () => api.get<Paginated<Record<string, unknown>>>('/api/admin/audit-logs', params),
  });
}

export function useEmailLogs(params: QueryParams = {}) {
  return useQuery({
    queryKey: keys.emailLogs(params),
    queryFn: () =>
      api.get<Paginated<Record<string, unknown>> & { failedCount: number }>('/api/admin/email-logs', params),
  });
}

export function useIntegrations() {
  return useQuery({
    queryKey: keys.integrations(),
    queryFn: () => api.get<(IntegrationStatusDto & { linkedAccounts: number })[]>('/api/admin/integrations'),
  });
}

export function usePendingReviews(params: QueryParams = {}) {
  return useQuery({
    queryKey: keys.pendingReviews(params),
    queryFn: () => api.get<Paginated<Record<string, unknown>>>('/api/sessions/reviews/pending', params),
  });
}

export function useModerateReview() {
  const client = useQueryClient();
  return useMutation({
    mutationFn: ({ id, status, note }: { id: string; status: 'APPROVED' | 'REJECTED'; note?: string }) =>
      api.patch(`/api/sessions/reviews/${id}/moderate`, { status, moderationNote: note }),
    onSuccess: () => {
      void client.invalidateQueries({ queryKey: ['pending-reviews'] });
      void client.invalidateQueries({ queryKey: ['reviews'] });
    },
  });
}

export function useRetryMeeting() {
  const client = useQueryClient();
  return useMutation({
    mutationFn: (bookingId: string) =>
      api.post<{ ok: boolean; reason: string | null }>(`/api/admin/bookings/${bookingId}/retry-meeting`),
    onSuccess: (_data, bookingId) => {
      void client.invalidateQueries({ queryKey: keys.booking(bookingId) });
    },
  });
}

/* -------------------------------------------------------------------------- */
/* Platform                                                                   */
/* -------------------------------------------------------------------------- */

export function useNotifications(unreadOnly = false) {
  return useQuery({
    queryKey: keys.notifications(unreadOnly),
    queryFn: () =>
      api.get<{
        items: { id: string; type: string; title: string; body: string; href: string | null; readAt: string | null; createdAt: string }[];
        unreadCount: number;
      }>('/api/notifications', { unreadOnly }),
    refetchInterval: 90_000,
  });
}

export function useMarkNotificationRead() {
  const client = useQueryClient();
  return useMutation({
    mutationFn: (id: string) => api.post(`/api/notifications/${id}/read`),
    onSuccess: () => void client.invalidateQueries({ queryKey: ['notifications'] }),
  });
}

export function useMarkAllNotificationsRead() {
  const client = useQueryClient();
  return useMutation({
    mutationFn: () => api.post<{ marked: number }>('/api/notifications/read-all'),
    onSuccess: () => void client.invalidateQueries({ queryKey: ['notifications'] }),
  });
}

export function usePublicSettings() {
  return useQuery({
    queryKey: keys.publicSettings(),
    queryFn: () => api.get<Record<string, unknown>>('/api/settings/public'),
    staleTime: 15 * 60_000,
  });
}

export function useGlobalSearch(query: string) {
  return useQuery({
    queryKey: keys.search(query),
    queryFn: () => api.get<GlobalSearchResultDto>('/api/search', { q: query }),
    enabled: query.trim().length >= 2,
    staleTime: 30_000,
  });
}

export function useContactForm() {
  return useMutation({
    mutationFn: (input: unknown) => api.post<{ id: string; received: boolean }>('/api/contact', input),
  });
}

/* -------------------------------------------------------------------------- */
/* Account                                                                    */
/* -------------------------------------------------------------------------- */

/**
 * Profile edits return the refreshed identity, which the caller writes straight
 * back into the auth context — otherwise the header would keep rendering the
 * old name until the next page load.
 */
export function useUpdateProfile() {
  const client = useQueryClient();
  return useMutation({
    mutationFn: (input: UpdateProfileInput) => api.patch<AuthenticatedUser>('/api/auth/profile', input),
    onSuccess: () => {
      void client.invalidateQueries({ queryKey: keys.portalDashboard() });
    },
  });
}

/**
 * Changing a password revokes every refresh-token family server-side, so the
 * caller must sign in again. That is deliberate: a password change is the one
 * lever a user has when they think someone else is in their account.
 */
export function useChangePassword() {
  return useMutation({
    mutationFn: (input: { currentPassword: string; password: string; confirmPassword: string }) =>
      api.post('/api/auth/change-password', input),
  });
}

export function useResendVerification() {
  return useMutation({
    mutationFn: (email: string) => api.post('/api/auth/resend-verification', { email }),
  });
}

/* -------------------------------------------------------------------------- */
/* Client portal                                                              */
/* -------------------------------------------------------------------------- */

export interface MyReview {
  id: string;
  rating: number;
  title: string | null;
  body: string;
  status: 'PENDING' | 'APPROVED' | 'REJECTED';
  serviceName: string | null;
  consultantName: string | null;
  isAnonymous: boolean;
  bookingId: string;
  moderationNote: string | null;
  moderatedAt: string | null;
  createdAt: string;
}

export function useMyReviews(params: QueryParams = {}) {
  return useQuery({
    queryKey: keys.myReviews(params),
    queryFn: () => api.get<Paginated<MyReview>>('/api/portal/reviews', params),
  });
}

/* -------------------------------------------------------------------------- */
/* Consultant workspace                                                       */
/* -------------------------------------------------------------------------- */

export interface ConsultantClient {
  id: string;
  clientCode: string;
  fullName: string;
  email: string;
  phone: string | null;
  company: string | null;
  jobTitle: string | null;
  avatarUrl: string | null;
  industry: string | null;
  city: string | null;
  sessionCount: number;
  lastSessionAt: string | null;
  nextSessionAt: string | null;
}

export function useConsultantClients(params: QueryParams = {}) {
  return useQuery({
    queryKey: keys.consultantClients(params),
    queryFn: () => api.get<Paginated<ConsultantClient>>('/api/consultant/clients', params),
  });
}

export interface ConsultantClientDetail extends Omit<ConsultantClient, 'lastSessionAt' | 'nextSessionAt'> {
  timezone: string;
  country: string | null;
  companySize: string | null;
  clientSince: string;
  totalPaid: number;
  currency: string;
  bookings: (BookingSummaryDto & { sessionId: string | null })[];
}

export function useConsultantClient(id: string | undefined) {
  return useQuery({
    queryKey: keys.consultantClient(id ?? ''),
    queryFn: () => api.get<ConsultantClientDetail>(`/api/consultant/clients/${id}`),
    enabled: Boolean(id),
  });
}

export interface ConsultantCalendarBooking {
  id: string;
  reference: string;
  status: string;
  paymentStatus: string;
  startAt: string;
  endAt: string;
  durationMinutes: number;
  timezone: string;
  meetingProvider: string;
  serviceName: string;
  clientName: string;
  sessionId: string | null;
}

export interface ConsultantCalendar {
  timezone: string;
  bookings: ConsultantCalendarBooking[];
  blackouts: { id: string; startAt: string; endAt: string; reason: string | null }[];
}

export function useConsultantCalendar(params: { from: string; to: string }) {
  return useQuery({
    queryKey: keys.consultantCalendar(params),
    queryFn: () => api.get<ConsultantCalendar>('/api/consultant/calendar', params),
  });
}

export interface ConsultantReviews extends Paginated<ReviewDto> {
  averageRating: number | null;
  reviewCount: number;
  distribution: { rating: number; count: number }[];
}

export function useConsultantReviews(params: QueryParams = {}) {
  return useQuery({
    queryKey: keys.consultantReviews(params),
    queryFn: () => api.get<ConsultantReviews>('/api/consultant/reviews', params),
  });
}

export interface ConsultantProfile {
  id: string;
  slug: string;
  title: string;
  biography: string;
  specialties: string[];
  qualifications: string[];
  languages: string[];
  yearsExperience: number;
  linkedinUrl: string | null;
  websiteUrl: string | null;
  isPublished: boolean;
  isAcceptingBookings: boolean;
  timezone: string;
  slotIntervalMinutes: number;
  services: { id: string; name: string; slug: string }[];
}

export function useConsultantProfile(enabled = true) {
  return useQuery({
    queryKey: keys.consultantProfile(),
    queryFn: () => api.get<ConsultantProfile>('/api/consultant/profile'),
    enabled,
  });
}

export function useSaveConsultantProfile() {
  const client = useQueryClient();
  return useMutation({
    mutationFn: (input: Record<string, unknown>) =>
      api.patch<Omit<ConsultantProfile, 'services'>>('/api/consultant/profile', input),
    onSuccess: () => {
      void client.invalidateQueries({ queryKey: keys.consultantProfile() });
      // The public directory renders the same record.
      void client.invalidateQueries({ queryKey: ['consultants'] });
      void client.invalidateQueries({ queryKey: ['consultant'] });
    },
  });
}

export function useSetBookingAcceptance() {
  const client = useQueryClient();
  return useMutation({
    mutationFn: (isAcceptingBookings: boolean) =>
      api.patch<{ isAcceptingBookings: boolean }>('/api/consultant/booking-status', { isAcceptingBookings }),
    onSuccess: () => {
      void client.invalidateQueries({ queryKey: keys.consultantDashboard() });
      void client.invalidateQueries({ queryKey: keys.consultantProfile() });
    },
  });
}

/**
 * Asks the client to settle an outstanding balance.
 *
 * This only queues a reminder — it never marks anything paid. `queued: false`
 * means one already went out today, which is a success, not a failure.
 */
export function useRequestBalancePayment(bookingId: string) {
  const client = useQueryClient();
  return useMutation({
    mutationFn: () =>
      api.post<{ queued: boolean; balance: number; currency: string }>(
        `/api/consultant/bookings/${bookingId}/request-payment`,
      ),
    onSuccess: () => void client.invalidateQueries({ queryKey: keys.consultantDashboard() }),
  });
}

/**
 * Asks the server what a discount code is worth for this basket.
 *
 * A preview only: nothing is reserved, no redemption is consumed, and the
 * booking request carries the code rather than this amount.
 */
export function usePreviewDiscount() {
  return useMutation({
    mutationFn: (input: { code: string; serviceId?: string; durationMinutes?: number; productIds?: string[] }) =>
      api.post<{
        discountId: string;
        code: string;
        description: string | null;
        amount: number;
        currency: string;
        subtotal: number;
      }>('/api/discounts/preview', input),
  });
}
