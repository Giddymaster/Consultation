import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query';
import type { ArticleSummaryDto, Paginated } from '@meridian/types';
import { api } from './api';
import { keys } from './queries';

/**
 * Query hooks for the administrative surface.
 *
 * Kept separate from `queries.ts` because these are only ever loaded by the
 * lazy admin bundle — a client browsing the public site never downloads them.
 */

type QueryParams = Record<string, string | number | boolean | undefined | null>;

export const adminKeys = {
  services: (params?: unknown) => ['admin-services', params] as const,
  service: (id: string) => ['admin-service', id] as const,
  consultants: (params?: unknown) => ['admin-consultants', params] as const,
  consultant: (id: string) => ['admin-consultant', id] as const,
  products: (params?: unknown) => ['admin-products', params] as const,
  product: (id: string) => ['admin-product', id] as const,
  orders: (params?: unknown) => ['admin-orders', params] as const,
  order: (id: string) => ['admin-order', id] as const,
  invoices: (params?: unknown) => ['admin-invoices', params] as const,
  calendar: (params?: unknown) => ['admin-calendar', params] as const,
};

/* -------------------------------------------------------------------------- */
/* Services                                                                   */
/* -------------------------------------------------------------------------- */

/** Includes drafts and archived records, which the public list excludes. */
export function useAdminServices(params: QueryParams = {}) {
  return useQuery({
    queryKey: adminKeys.services(params),
    queryFn: () => api.get<Paginated<Record<string, unknown>>>('/api/admin/services', params),
  });
}

export function useAdminService(id: string | undefined) {
  return useQuery({
    queryKey: adminKeys.service(id ?? ''),
    queryFn: () => api.get<Record<string, unknown>>(`/api/admin/services/${id}`),
    enabled: Boolean(id),
  });
}

export function useSaveService(id?: string) {
  const client = useQueryClient();
  return useMutation({
    mutationFn: (input: unknown) =>
      id
        ? api.patch<{ id: string }>(`/api/admin/services/${id}`, input)
        : api.post<{ id: string; slug: string }>('/api/admin/services', input),
    onSuccess: () => {
      // The public catalog caches the same records, so both are invalidated.
      void client.invalidateQueries({ queryKey: ['admin-services'] });
      void client.invalidateQueries({ queryKey: ['services'] });
      if (id) void client.invalidateQueries({ queryKey: adminKeys.service(id) });
    },
  });
}

export function useArchiveService() {
  const client = useQueryClient();
  return useMutation({
    mutationFn: (id: string) => api.delete(`/api/admin/services/${id}`),
    onSuccess: () => {
      void client.invalidateQueries({ queryKey: ['admin-services'] });
      void client.invalidateQueries({ queryKey: ['services'] });
    },
  });
}

/* -------------------------------------------------------------------------- */
/* Consultants                                                                */
/* -------------------------------------------------------------------------- */

export function useAdminConsultants(params: QueryParams = {}) {
  return useQuery({
    queryKey: adminKeys.consultants(params),
    queryFn: () => api.get<Paginated<Record<string, unknown>>>('/api/admin/consultants', params),
  });
}

export function useAdminConsultant(id: string | undefined) {
  return useQuery({
    queryKey: adminKeys.consultant(id ?? ''),
    queryFn: () => api.get<Record<string, unknown>>(`/api/admin/consultants/${id}/profile`),
    enabled: Boolean(id),
  });
}

export function useSaveConsultant(id?: string) {
  const client = useQueryClient();
  return useMutation({
    mutationFn: (input: unknown) =>
      id
        ? api.patch<{ id: string }>(`/api/admin/consultants/${id}`, input)
        : api.post<{ id: string; slug: string }>('/api/admin/consultants', input),
    onSuccess: () => {
      void client.invalidateQueries({ queryKey: ['admin-consultants'] });
      void client.invalidateQueries({ queryKey: ['consultants'] });
      if (id) void client.invalidateQueries({ queryKey: adminKeys.consultant(id) });
    },
  });
}

/* -------------------------------------------------------------------------- */
/* Products                                                                   */
/* -------------------------------------------------------------------------- */

export function useAdminProducts(params: QueryParams = {}) {
  return useQuery({
    queryKey: adminKeys.products(params),
    queryFn: () => api.get<Paginated<Record<string, unknown>>>('/api/admin/products', params),
  });
}

export function useAdminProduct(id: string | undefined) {
  return useQuery({
    queryKey: adminKeys.product(id ?? ''),
    queryFn: () => api.get<Record<string, unknown>>(`/api/admin/products/${id}`),
    enabled: Boolean(id),
  });
}

export function useSaveProduct(id?: string) {
  const client = useQueryClient();
  return useMutation({
    mutationFn: (input: unknown) =>
      id
        ? api.patch<{ id: string }>(`/api/admin/products/${id}`, input)
        : api.post<{ id: string; slug: string }>('/api/admin/products', input),
    onSuccess: () => {
      void client.invalidateQueries({ queryKey: ['admin-products'] });
      void client.invalidateQueries({ queryKey: ['products'] });
      if (id) void client.invalidateQueries({ queryKey: adminKeys.product(id) });
    },
  });
}

export function useArchiveProduct() {
  const client = useQueryClient();
  return useMutation({
    mutationFn: (id: string) => api.delete(`/api/admin/products/${id}`),
    onSuccess: () => {
      void client.invalidateQueries({ queryKey: ['admin-products'] });
      void client.invalidateQueries({ queryKey: ['products'] });
    },
  });
}

/* -------------------------------------------------------------------------- */
/* Orders and invoices                                                        */
/* -------------------------------------------------------------------------- */

export function useAdminOrders(params: QueryParams = {}) {
  return useQuery({
    queryKey: adminKeys.orders(params),
    queryFn: () =>
      api.get<Paginated<Record<string, unknown>> & { totals: { revenue: number; paidOrders: number } }>(
        '/api/admin/orders',
        params,
      ),
  });
}

export function useAdminOrder(id: string | undefined) {
  return useQuery({
    queryKey: adminKeys.order(id ?? ''),
    queryFn: () => api.get<Record<string, unknown>>(`/api/admin/orders/${id}`),
    enabled: Boolean(id),
  });
}

export function useUpdateOrder(id: string) {
  const client = useQueryClient();
  return useMutation({
    mutationFn: (input: { status: string; note?: string }) => api.patch(`/api/admin/orders/${id}`, input),
    onSuccess: () => {
      void client.invalidateQueries({ queryKey: adminKeys.order(id) });
      void client.invalidateQueries({ queryKey: ['admin-orders'] });
    },
  });
}

export function useAdminInvoices(params: QueryParams = {}) {
  return useQuery({
    queryKey: adminKeys.invoices(params),
    queryFn: () =>
      api.get<
        Paginated<Record<string, unknown>> & {
          totals: { invoiced: number; collected: number; outstanding: number };
        }
      >('/api/admin/invoices', params),
  });
}

/* -------------------------------------------------------------------------- */
/* Calendar                                                                   */
/* -------------------------------------------------------------------------- */

export interface CalendarBooking {
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
  consultantId: string;
  consultantName: string;
  clientName: string;
}

export function useAdminCalendar(params: { from: string; to: string; consultantId?: string }) {
  return useQuery({
    queryKey: adminKeys.calendar(params),
    queryFn: () =>
      api.get<{ bookings: CalendarBooking[]; consultants: { id: string; fullName: string }[] }>(
        '/api/admin/calendar',
        params as unknown as QueryParams,
      ),
  });
}

/* -------------------------------------------------------------------------- */
/* Settings                                                                   */
/* -------------------------------------------------------------------------- */

export interface SettingRow {
  key: string;
  value: unknown;
  description: string | null;
  isPublic: boolean;
  updatedAt: string;
}

export function useSettings() {
  return useQuery({
    queryKey: keys.settings(),
    queryFn: () => api.get<SettingRow[]>('/api/admin/settings'),
  });
}

export function useUpdateSetting() {
  const client = useQueryClient();
  return useMutation({
    mutationFn: ({ key, value }: { key: string; value: unknown }) =>
      api.put<{ key: string; value: unknown }>(`/api/admin/settings/${key}`, { value }),
    onSuccess: () => {
      void client.invalidateQueries({ queryKey: keys.settings() });
      // The public settings feed the storefront, so it must be refreshed too.
      void client.invalidateQueries({ queryKey: keys.publicSettings() });
    },
  });
}

/* -------------------------------------------------------------------------- */
/* Content authoring                                                          */
/* -------------------------------------------------------------------------- */

/**
 * Loads an article for editing by its id.
 *
 * The public detail route is addressed by slug, which is correct for a URL but
 * wrong for an editor: a draft's slug can change under you, and resolving an id
 * through a list would silently fail once the list outgrew a page.
 */
export function useAdminArticle(id: string | undefined) {
  return useQuery({
    queryKey: ['admin-article', id] as const,
    queryFn: () => api.get<Record<string, unknown>>(`/api/admin/articles/${id}`),
    enabled: Boolean(id),
  });
}

export function useSaveArticle(id?: string) {
  const client = useQueryClient();
  return useMutation({
    mutationFn: (input: unknown) =>
      id
        ? api.patch<ArticleSummaryDto>(`/api/articles/${id}`, input)
        : api.post<ArticleSummaryDto>('/api/articles', input),
    onSuccess: () => {
      void client.invalidateQueries({ queryKey: ['articles'] });
      void client.invalidateQueries({ queryKey: ['article'] });
      if (id) void client.invalidateQueries({ queryKey: ['admin-article', id] });
    },
  });
}

export function useArchiveArticle() {
  const client = useQueryClient();
  return useMutation({
    mutationFn: (id: string) => api.delete(`/api/articles/${id}`),
    onSuccess: () => void client.invalidateQueries({ queryKey: ['articles'] }),
  });
}

/* -------------------------------------------------------------------------- */
/* Branding                                                                   */
/* -------------------------------------------------------------------------- */

export interface BrandAssetSummary {
  fileName: string;
  mimeType: string;
  updatedAt: string;
}

export interface BrandingState {
  'brand.logoUrl': string | null;
  'brand.logoDarkUrl': string | null;
  'brand.faviconUrl': string | null;
  assets: Record<'logo' | 'logoDark' | 'favicon', BrandAssetSummary | null>;
  maxBytes: number;
  acceptedTypes: string[];
}

export type BrandAsset = 'logo' | 'logoDark' | 'favicon';

export function useBranding() {
  return useQuery({
    queryKey: ['admin-branding'] as const,
    queryFn: () => api.get<BrandingState>('/api/admin/branding'),
  });
}

/**
 * Uploads through `fetch` directly rather than the JSON client: a multipart body
 * must set its own boundary, and the shared client always sends JSON.
 */
export function useUploadBrandAsset() {
  const client = useQueryClient();
  return useMutation({
    mutationFn: ({ asset, file }: { asset: BrandAsset; file: File }) => {
      const body = new FormData();
      body.append('file', file);
      return api.upload<Record<string, string | null>>(`/api/admin/branding/${asset}`, body);
    },
    onSuccess: () => {
      void client.invalidateQueries({ queryKey: ['admin-branding'] });
      // The header, footer and favicon all read the public settings.
      void client.invalidateQueries({ queryKey: keys.publicSettings() });
    },
  });
}

export function useRemoveBrandAsset() {
  const client = useQueryClient();
  return useMutation({
    mutationFn: (asset: BrandAsset) => api.delete(`/api/admin/branding/${asset}`),
    onSuccess: () => {
      void client.invalidateQueries({ queryKey: ['admin-branding'] });
      void client.invalidateQueries({ queryKey: keys.publicSettings() });
    },
  });
}

/* -------------------------------------------------------------------------- */
/* Discounts                                                                  */
/* -------------------------------------------------------------------------- */

export interface DiscountRow {
  id: string;
  code: string;
  description: string | null;
  type: 'PERCENTAGE' | 'FIXED_AMOUNT';
  value: number;
  currency: string | null;
  appliesTo: 'EVERYTHING' | 'SERVICES' | 'PRODUCTS';
  serviceIds: string[];
  productIds: string[];
  minSubtotal: number;
  maxDiscount: number;
  maxRedemptions: number | null;
  redeemedCount: number;
  perClientLimit: number | null;
  startsAt: string | null;
  endsAt: string | null;
  isActive: boolean;
  createdAt: string;
  state: 'ACTIVE' | 'SCHEDULED' | 'EXPIRED' | 'EXHAUSTED' | 'WITHDRAWN';
}

export interface DiscountDetail extends DiscountRow {
  redemptions: {
    id: string;
    amount: number;
    currency: string;
    bookingId: string | null;
    orderId: string | null;
    clientName: string;
    createdAt: string;
  }[];
}

export function useDiscounts(params: QueryParams = {}) {
  return useQuery({
    queryKey: ['admin-discounts', params] as const,
    queryFn: () =>
      api.get<Paginated<DiscountRow> & { totals: { redemptions: number; discounted: number } }>(
        '/api/admin/discounts',
        params,
      ),
  });
}

export function useDiscount(id: string | undefined) {
  return useQuery({
    queryKey: ['admin-discount', id] as const,
    queryFn: () => api.get<DiscountDetail>(`/api/admin/discounts/${id}`),
    enabled: Boolean(id),
  });
}

export function useSaveDiscount(id?: string) {
  const client = useQueryClient();
  return useMutation({
    mutationFn: (input: unknown) =>
      id
        ? api.patch<DiscountRow>(`/api/admin/discounts/${id}`, input)
        : api.post<DiscountRow>('/api/admin/discounts', input),
    onSuccess: () => {
      void client.invalidateQueries({ queryKey: ['admin-discounts'] });
      if (id) void client.invalidateQueries({ queryKey: ['admin-discount', id] });
    },
  });
}

export function useWithdrawDiscount() {
  const client = useQueryClient();
  return useMutation({
    mutationFn: (id: string) =>
      api.delete<{ deleted: boolean; withdrawn: boolean }>(`/api/admin/discounts/${id}`),
    onSuccess: () => void client.invalidateQueries({ queryKey: ['admin-discounts'] }),
  });
}

/* -------------------------------------------------------------------------- */
/* Permanent deletion                                                         */
/* -------------------------------------------------------------------------- */

/**
 * Deleting outright, as opposed to archiving.
 *
 * The API refuses when the record is referenced by a booking or an order, so the
 * error message is the useful part of the response and callers surface it.
 */
export function useDeletePermanently() {
  const client = useQueryClient();
  return useMutation({
    mutationFn: ({ kind, id }: { kind: 'services' | 'products' | 'articles'; id: string }) =>
      api.delete(`/api/admin/${kind}/${id}/permanent`),
    onSuccess: (_data, { kind }) => {
      void client.invalidateQueries({ queryKey: [`admin-${kind}`] });
      void client.invalidateQueries({ queryKey: [kind] });
    },
  });
}

export function useDeleteReview() {
  const client = useQueryClient();
  return useMutation({
    mutationFn: (id: string) => api.delete(`/api/admin/reviews/${id}`),
    onSuccess: () => {
      void client.invalidateQueries({ queryKey: ['pending-reviews'] });
      void client.invalidateQueries({ queryKey: ['reviews'] });
    },
  });
}

export function useUpdateContactMessage() {
  const client = useQueryClient();
  return useMutation({
    mutationFn: ({ id, status }: { id: string; status: string }) =>
      api.patch(`/api/admin/contact-messages/${id}`, { status }),
    onSuccess: () => void client.invalidateQueries({ queryKey: ['contact-messages'] }),
  });
}

export function useDeleteContactMessage() {
  const client = useQueryClient();
  return useMutation({
    mutationFn: (id: string) => api.delete(`/api/admin/contact-messages/${id}`),
    onSuccess: () => void client.invalidateQueries({ queryKey: ['contact-messages'] }),
  });
}
