import { lazy, Suspense, type ReactNode } from 'react';
import { BrowserRouter, Navigate, Route, Routes, useLocation } from 'react-router-dom';
import {
  BadgePercent,
  BarChart3,
  BellRing,
  BookOpen,
  Briefcase,
  CalendarCheck,
  CalendarDays,
  CalendarRange,
  ClipboardList,
  CreditCard,
  FileText,
  LayoutDashboard,
  Mail,
  MessageSquareQuote,
  Package,
  Palette,
  Receipt,
  ScrollText,
  Settings,
  ShieldCheck,
  ShoppingBag,
  Star,
  UserCog,
  UserRound,
  Users,
} from 'lucide-react';
import type { Permission } from '@meridian/types';
import { PublicLayout } from '@/components/layout/PublicLayout';
import { DashboardLayout, type NavSection } from '@/components/layout/DashboardLayout';
import { useAuth } from '@/providers/auth-context';
import { useBrand, useBrandDocument } from '@/lib/brand';
import { LoadingSkeleton } from '@/components/ui';
import { ForbiddenPage, NotFoundPage } from '@/routes/public/Static';

/**
 * Application routing.
 *
 * Public pages are bundled eagerly — they are the first thing most visitors
 * see. The three authenticated areas are lazy-loaded, so a client never
 * downloads the admin dashboard or the charting library.
 */

/* --- Eager: public --------------------------------------------------------- */

import { HomePage } from '@/routes/public/Home';
import { BookPage } from '@/routes/public/Book';
import {
  ConsultantDetailPage,
  ConsultantsPage,
  ReviewsPage,
  ServiceDetailPage,
  ServicesPage,
} from '@/routes/public/Catalog';
import { ArticleDetailPage, InsightsPage, JournalPage } from '@/routes/public/Content';
import { CartPage, ProductDetailPage, ShopPage } from '@/routes/public/Shop';
import { BookingConfirmationPage, OrderConfirmationPage } from '@/routes/public/Confirmation';
import { AboutPage, ContactPage, FaqPage, LegalPage } from '@/routes/public/Static';
import {
  ForgotPasswordPage,
  LoginPage,
  RegisterPage,
  ResetPasswordPage,
  VerifyEmailPage,
} from '@/routes/auth/Auth';

/* --- Lazy: authenticated areas -------------------------------------------- */

const Portal = {
  Dashboard: lazy(() => import('@/routes/portal/Portal').then((m) => ({ default: m.PortalDashboard }))),
  Bookings: lazy(() => import('@/routes/portal/Portal').then((m) => ({ default: m.PortalBookings }))),
  BookingDetail: lazy(() => import('@/routes/portal/Portal').then((m) => ({ default: m.PortalBookingDetail }))),
  Sessions: lazy(() => import('@/routes/portal/Portal').then((m) => ({ default: m.PortalSessions }))),
  SessionDetail: lazy(() => import('@/routes/portal/Portal').then((m) => ({ default: m.PortalSessionDetail }))),
  Invoices: lazy(() => import('@/routes/portal/Portal').then((m) => ({ default: m.PortalInvoices }))),
  Resources: lazy(() => import('@/routes/portal/Portal').then((m) => ({ default: m.PortalResources }))),
  NewReview: lazy(() => import('@/routes/portal/Portal').then((m) => ({ default: m.PortalNewReview }))),
  Payments: lazy(() => import('@/routes/portal/PortalActivity').then((m) => ({ default: m.PortalPayments }))),
  Reviews: lazy(() => import('@/routes/portal/PortalActivity').then((m) => ({ default: m.PortalReviews }))),
  Reschedule: lazy(() => import('@/routes/portal/PortalActivity').then((m) => ({ default: m.PortalReschedule }))),
  Profile: lazy(() => import('@/routes/portal/PortalAccount').then((m) => ({ default: m.PortalProfile }))),
  Settings: lazy(() => import('@/routes/portal/PortalAccount').then((m) => ({ default: m.PortalSettings }))),
  Notifications: lazy(() =>
    import('@/routes/portal/PortalAccount').then((m) => ({ default: m.PortalNotifications })),
  ),
};

const Consultant = {
  Dashboard: lazy(() => import('@/routes/consultant/Consultant').then((m) => ({ default: m.ConsultantDashboard }))),
  Sessions: lazy(() => import('@/routes/consultant/Consultant').then((m) => ({ default: m.ConsultantSessions }))),
  SessionDetail: lazy(() =>
    import('@/routes/consultant/Consultant').then((m) => ({ default: m.ConsultantSessionDetail })),
  ),
  Availability: lazy(() =>
    import('@/routes/consultant/Consultant').then((m) => ({ default: m.ConsultantAvailability })),
  ),
  Calendar: lazy(() =>
    import('@/routes/consultant/ConsultantWorkspace').then((m) => ({ default: m.ConsultantCalendar })),
  ),
  Clients: lazy(() =>
    import('@/routes/consultant/ConsultantWorkspace').then((m) => ({ default: m.ConsultantClients })),
  ),
  ClientDetail: lazy(() =>
    import('@/routes/consultant/ConsultantWorkspace').then((m) => ({ default: m.ConsultantClientDetail })),
  ),
  Reviews: lazy(() =>
    import('@/routes/consultant/ConsultantWorkspace').then((m) => ({ default: m.ConsultantReviews })),
  ),
  Settings: lazy(() =>
    import('@/routes/consultant/ConsultantWorkspace').then((m) => ({ default: m.ConsultantSettings })),
  ),
  Reschedule: lazy(() =>
    import('@/routes/portal/PortalActivity').then((m) => ({ default: m.ConsultantReschedule })),
  ),
};

const Admin = {
  Dashboard: lazy(() => import('@/routes/admin/Admin').then((m) => ({ default: m.AdminDashboard }))),
  Branding: lazy(() => import('@/routes/admin/AdminBranding').then((m) => ({ default: m.AdminBranding }))),
  Discounts: lazy(() => import('@/routes/admin/AdminDiscounts').then((m) => ({ default: m.AdminDiscounts }))),
  DiscountEditor: lazy(() =>
    import('@/routes/admin/AdminDiscounts').then((m) => ({ default: m.AdminDiscountEditor })),
  ),
  Bookings: lazy(() => import('@/routes/admin/Admin').then((m) => ({ default: m.AdminBookings }))),
  Payments: lazy(() => import('@/routes/admin/Admin').then((m) => ({ default: m.AdminPayments }))),
  Clients: lazy(() => import('@/routes/admin/Admin').then((m) => ({ default: m.AdminClients }))),
  ClientDetail: lazy(() => import('@/routes/admin/Admin').then((m) => ({ default: m.AdminClientDetail }))),
  Reviews: lazy(() => import('@/routes/admin/Admin').then((m) => ({ default: m.AdminReviews }))),
  Integrations: lazy(() => import('@/routes/admin/Admin').then((m) => ({ default: m.AdminIntegrations }))),
  AuditLogs: lazy(() => import('@/routes/admin/Admin').then((m) => ({ default: m.AdminAuditLogs }))),
  Emails: lazy(() => import('@/routes/admin/Admin').then((m) => ({ default: m.AdminEmails }))),
  Users: lazy(() => import('@/routes/admin/Admin').then((m) => ({ default: m.AdminUsers }))),
  Analytics: lazy(() => import('@/routes/admin/Admin').then((m) => ({ default: m.AdminAnalytics }))),

  // Catalogue management
  Services: lazy(() => import('@/routes/admin/AdminCatalog').then((m) => ({ default: m.AdminServices }))),
  ServiceEditor: lazy(() => import('@/routes/admin/AdminCatalog').then((m) => ({ default: m.AdminServiceEditor }))),
  Consultants: lazy(() => import('@/routes/admin/AdminCatalog').then((m) => ({ default: m.AdminConsultants }))),
  ConsultantEditor: lazy(() =>
    import('@/routes/admin/AdminCatalog').then((m) => ({ default: m.AdminConsultantEditor })),
  ),
  Products: lazy(() => import('@/routes/admin/AdminCatalog').then((m) => ({ default: m.AdminProducts }))),
  ProductEditor: lazy(() => import('@/routes/admin/AdminCatalog').then((m) => ({ default: m.AdminProductEditor }))),

  // Operations
  Calendar: lazy(() => import('@/routes/admin/AdminOperations').then((m) => ({ default: m.AdminCalendar }))),
  BookingDetail: lazy(() =>
    import('@/routes/admin/AdminOperations').then((m) => ({ default: m.AdminBookingDetail })),
  ),
  Sessions: lazy(() => import('@/routes/admin/AdminOperations').then((m) => ({ default: m.AdminSessions }))),
  Orders: lazy(() => import('@/routes/admin/AdminOperations').then((m) => ({ default: m.AdminOrders }))),
  OrderDetail: lazy(() => import('@/routes/admin/AdminOperations').then((m) => ({ default: m.AdminOrderDetail }))),
  Invoices: lazy(() => import('@/routes/admin/AdminOperations').then((m) => ({ default: m.AdminInvoices }))),
  Settings: lazy(() => import('@/routes/admin/AdminOperations').then((m) => ({ default: m.AdminSettings }))),

  // Content
  Articles: lazy(() => import('@/routes/admin/AdminContent').then((m) => ({ default: m.AdminArticles }))),
  Journal: lazy(() => import('@/routes/admin/AdminContent').then((m) => ({ default: m.AdminJournal }))),
  ArticleEditor: lazy(() => import('@/routes/admin/AdminContent').then((m) => ({ default: m.AdminArticleEditor }))),
};

/* -------------------------------------------------------------------------- */
/* Guards                                                                     */
/* -------------------------------------------------------------------------- */

function RouteFallback() {
  return (
    <div className="mx-auto max-w-4xl px-5 py-12">
      <LoadingSkeleton rows={6} />
    </div>
  );
}

/**
 * Requires a signed-in user, and optionally a permission.
 *
 * This is a UX guard, not a security boundary: the API enforces the same rules
 * independently. Its job is to avoid showing a screen that would fail, and to
 * bounce an unauthenticated user to sign-in with their destination preserved.
 */
function RequireAuth({
  children,
  permission,
  requireConsultant,
}: {
  children: ReactNode;
  permission?: Permission;
  requireConsultant?: boolean;
}) {
  const { user, loading, can } = useAuth();
  const location = useLocation();

  // Waiting for the initial refresh — rendering a redirect here would sign out
  // anyone who reloads the page.
  if (loading) return <RouteFallback />;

  if (!user) {
    const next = `${location.pathname}${location.search}`;
    return <Navigate to={`/login?next=${encodeURIComponent(next)}`} replace />;
  }

  if (requireConsultant && !user.consultantProfileId) return <ForbiddenPage />;
  if (permission && !can(permission)) return <ForbiddenPage />;

  return <>{children}</>;
}

/* -------------------------------------------------------------------------- */
/* Navigation definitions                                                     */
/* -------------------------------------------------------------------------- */

const PORTAL_NAV: NavSection[] = [
  {
    items: [
      { to: '/portal', label: 'Dashboard', icon: <LayoutDashboard />, end: true },
      { to: '/portal/bookings', label: 'My bookings', icon: <CalendarDays /> },
      { to: '/portal/sessions', label: 'Session records', icon: <ClipboardList /> },
      { to: '/portal/notifications', label: 'Notifications', icon: <BellRing /> },
    ],
  },
  {
    title: 'Billing',
    items: [
      { to: '/portal/invoices', label: 'Invoices', icon: <Receipt /> },
      { to: '/portal/payments', label: 'Payments', icon: <CreditCard /> },
      { to: '/portal/resources', label: 'My resources', icon: <BookOpen /> },
    ],
  },
  {
    title: 'Account',
    items: [
      { to: '/portal/reviews', label: 'My reviews', icon: <Star /> },
      { to: '/portal/profile', label: 'Profile', icon: <UserRound /> },
      { to: '/portal/settings', label: 'Settings', icon: <Settings /> },
    ],
  },
];

const CONSULTANT_NAV: NavSection[] = [
  {
    items: [
      { to: '/consultant', label: 'Workspace', icon: <LayoutDashboard />, end: true },
      { to: '/consultant/calendar', label: 'Calendar', icon: <CalendarCheck /> },
      { to: '/consultant/sessions', label: 'Sessions', icon: <ClipboardList /> },
      { to: '/consultant/clients', label: 'Clients', icon: <Users /> },
    ],
  },
  {
    title: 'Your practice',
    items: [
      { to: '/consultant/availability', label: 'Availability', icon: <CalendarRange /> },
      { to: '/consultant/reviews', label: 'Reviews', icon: <MessageSquareQuote /> },
      { to: '/consultant/settings', label: 'Profile', icon: <Settings /> },
    ],
  },
];

const ADMIN_NAV: NavSection[] = [
  {
    items: [
      { to: '/admin', label: 'Dashboard', icon: <LayoutDashboard />, end: true, permission: 'analytics.read' },
      { to: '/admin/analytics', label: 'Analytics', icon: <BarChart3 />, permission: 'analytics.read' },
    ],
  },
  {
    title: 'Operations',
    items: [
      { to: '/admin/bookings', label: 'Bookings', icon: <CalendarDays />, permission: 'appointments.read' },
      { to: '/admin/calendar', label: 'Calendar', icon: <CalendarRange />, permission: 'appointments.read' },
      { to: '/admin/sessions', label: 'Sessions', icon: <ClipboardList />, permission: 'sessions.read' },
      { to: '/admin/clients', label: 'Clients', icon: <Users />, permission: 'clients.read' },
      { to: '/admin/reviews', label: 'Reviews', icon: <Star />, permission: 'reviews.moderate' },
    ],
  },
  {
    title: 'Catalogue',
    items: [
      { to: '/admin/services', label: 'Services', icon: <Briefcase />, permission: 'services.read' },
      { to: '/admin/consultants', label: 'Consultants', icon: <UserCog />, permission: 'consultants.read' },
      { to: '/admin/products', label: 'Products', icon: <Package />, permission: 'products.read' },
    ],
  },
  {
    title: 'Finance',
    items: [
      { to: '/admin/payments', label: 'Payments', icon: <CreditCard />, permission: 'payments.read' },
      { to: '/admin/invoices', label: 'Invoices', icon: <Receipt />, permission: 'invoices.read' },
      { to: '/admin/discounts', label: 'Discounts', icon: <BadgePercent />, permission: 'discounts.read' },
      { to: '/admin/orders', label: 'Orders', icon: <ShoppingBag />, permission: 'orders.read' },
    ],
  },
  {
    title: 'Content',
    items: [
      { to: '/admin/articles', label: 'Articles', icon: <FileText />, permission: 'content.read' },
      { to: '/admin/journal', label: 'Journal', icon: <BookOpen />, permission: 'content.read' },
    ],
  },
  {
    title: 'System',
    items: [
      { to: '/admin/users', label: 'Users', icon: <ShieldCheck />, permission: 'users.manage' },
      { to: '/admin/branding', label: 'Branding', icon: <Palette />, permission: 'branding.manage' },
      { to: '/admin/integrations', label: 'Integrations', icon: <Settings />, permission: 'integrations.manage' },
      { to: '/admin/emails', label: 'Email log', icon: <Mail />, permission: 'emails.read' },
      { to: '/admin/audit-logs', label: 'Audit log', icon: <ScrollText />, permission: 'audit.read' },
    ],
  },
];

/* -------------------------------------------------------------------------- */
/* Router                                                                     */
/* -------------------------------------------------------------------------- */

export function App() {
  // Applied at the root rather than per layout: the sign-in pages sit
  // outside both layouts and still belong to the same platform.
  useBrandDocument(useBrand());

  return (
    <BrowserRouter>
      <Suspense fallback={<RouteFallback />}>
        <Routes>
          {/* --- Auth (own layout) -------------------------------------- */}
          <Route path="/login" element={<LoginPage />} />
          <Route path="/register" element={<RegisterPage />} />
          <Route path="/forgot-password" element={<ForgotPasswordPage />} />
          <Route path="/reset-password" element={<ResetPasswordPage />} />
          <Route path="/verify-email" element={<VerifyEmailPage />} />

          {/* --- Public -------------------------------------------------- */}
          <Route element={<PublicLayout />}>
            <Route index element={<HomePage />} />
            <Route path="about" element={<AboutPage />} />
            <Route path="contact" element={<ContactPage />} />
            <Route path="faq" element={<FaqPage />} />
            <Route path="reviews" element={<ReviewsPage />} />

            <Route path="services" element={<ServicesPage />} />
            <Route path="services/:slug" element={<ServiceDetailPage />} />
            <Route path="consultants" element={<ConsultantsPage />} />
            <Route path="consultants/:slug" element={<ConsultantDetailPage />} />

            <Route path="book" element={<BookPage />} />
            <Route path="book/confirmation" element={<BookingConfirmationPage />} />

            <Route path="insights" element={<InsightsPage />} />
            <Route path="insights/:slug" element={<ArticleDetailPage />} />
            <Route path="journal" element={<JournalPage />} />
            <Route path="journal/:slug" element={<ArticleDetailPage journal />} />
            {/* Legacy path kept so older links keep working. */}
            <Route path="articles" element={<Navigate to="/insights" replace />} />
            <Route path="articles/:slug" element={<ArticleDetailPage />} />

            <Route path="shop" element={<ShopPage />} />
            <Route path="shop/confirmation" element={<OrderConfirmationPage />} />
            <Route path="shop/:slug" element={<ProductDetailPage />} />
            <Route path="resources" element={<Navigate to="/shop" replace />} />
            <Route path="cart" element={<CartPage />} />

            <Route path="legal/:document" element={<LegalPage />} />
            <Route path="*" element={<NotFoundPage />} />
          </Route>

          {/* --- Client portal ------------------------------------------- */}
          <Route
            path="/portal"
            element={
              <RequireAuth>
                <DashboardLayout area="portal" areaLabel="Portal" sections={PORTAL_NAV} />
              </RequireAuth>
            }
          >
            <Route index element={<Portal.Dashboard />} />
            <Route path="bookings" element={<Portal.Bookings />} />
            <Route path="bookings/:id" element={<Portal.BookingDetail />} />
            <Route path="sessions" element={<Portal.Sessions />} />
            <Route path="sessions/:id" element={<Portal.SessionDetail />} />
            <Route path="bookings/:id/reschedule" element={<Portal.Reschedule />} />
            <Route path="invoices" element={<Portal.Invoices />} />
            <Route path="payments" element={<Portal.Payments />} />
            <Route path="resources" element={<Portal.Resources />} />
            <Route path="reviews" element={<Portal.Reviews />} />
            <Route path="reviews/new" element={<Portal.NewReview />} />
            <Route path="notifications" element={<Portal.Notifications />} />
            <Route path="profile" element={<Portal.Profile />} />
            <Route path="settings" element={<Portal.Settings />} />
            <Route path="*" element={<NotFoundPage />} />
          </Route>

          {/* --- Consultant portal --------------------------------------- */}
          <Route
            path="/consultant"
            element={
              <RequireAuth requireConsultant>
                <DashboardLayout area="consultant" areaLabel="Consultant" sections={CONSULTANT_NAV} />
              </RequireAuth>
            }
          >
            <Route index element={<Consultant.Dashboard />} />
            <Route path="sessions" element={<Consultant.Sessions />} />
            <Route path="sessions/:id" element={<Consultant.SessionDetail />} />
            <Route path="availability" element={<Consultant.Availability />} />
            <Route path="calendar" element={<Consultant.Calendar />} />
            <Route path="clients" element={<Consultant.Clients />} />
            <Route path="clients/:id" element={<Consultant.ClientDetail />} />
            <Route path="bookings/:id/reschedule" element={<Consultant.Reschedule />} />
            <Route path="reviews" element={<Consultant.Reviews />} />
            <Route path="settings" element={<Consultant.Settings />} />
            <Route path="*" element={<NotFoundPage />} />
          </Route>

          {/* --- Admin ---------------------------------------------------- */}
          <Route
            path="/admin"
            element={
              <RequireAuth permission="analytics.read">
                <DashboardLayout area="admin" areaLabel="Admin" sections={ADMIN_NAV} />
              </RequireAuth>
            }
          >
            <Route index element={<Admin.Dashboard />} />
            <Route path="analytics" element={<Admin.Analytics />} />
            <Route path="bookings" element={<Admin.Bookings />} />
            <Route path="bookings/:id" element={<Admin.BookingDetail />} />
            <Route path="calendar" element={<Admin.Calendar />} />
            <Route path="sessions" element={<Admin.Sessions />} />
            <Route path="clients" element={<Admin.Clients />} />
            <Route path="clients/:id" element={<Admin.ClientDetail />} />
            <Route path="consultants" element={<Admin.Consultants />} />
            <Route path="consultants/:id" element={<Admin.ConsultantEditor />} />
            <Route path="services" element={<Admin.Services />} />
            <Route path="services/:id" element={<Admin.ServiceEditor />} />
            <Route path="reviews" element={<Admin.Reviews />} />

            <Route path="payments" element={<Admin.Payments />} />
            <Route path="invoices" element={<Admin.Invoices />} />
            <Route path="orders" element={<Admin.Orders />} />
            <Route path="orders/:id" element={<Admin.OrderDetail />} />
            <Route path="products" element={<Admin.Products />} />
            <Route path="products/:id" element={<Admin.ProductEditor />} />

            <Route path="articles" element={<Admin.Articles />} />
            <Route path="articles/:id" element={<Admin.ArticleEditor />} />
            <Route path="journal" element={<Admin.Journal />} />

            <Route path="users" element={<Admin.Users />} />
            <Route path="integrations" element={<Admin.Integrations />} />
            <Route path="emails" element={<Admin.Emails />} />
            <Route path="audit-logs" element={<Admin.AuditLogs />} />
            <Route path="settings" element={<Admin.Settings />} />
            <Route path="branding" element={<Admin.Branding />} />
            <Route path="discounts" element={<Admin.Discounts />} />
            <Route path="discounts/new" element={<Admin.DiscountEditor />} />
            <Route path="discounts/:id" element={<Admin.DiscountEditor />} />
            <Route path="*" element={<NotFoundPage />} />
          </Route>
        </Routes>
      </Suspense>
    </BrowserRouter>
  );
}

