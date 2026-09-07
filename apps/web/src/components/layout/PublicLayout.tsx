import { useEffect, useState } from 'react';
import { Link, NavLink, Outlet, useLocation } from 'react-router-dom';
import {
  ArrowRight,
  BookOpen,
  ChevronRight,
  LayoutDashboard,
  Mail,
  MapPin,
  Menu,
  Moon,
  Phone,
  Search,
  Sun,
  X,
} from 'lucide-react';
import { Button } from '@/components/ui';
import { LinkedInIcon, XIcon } from '@/components/BrandIcons';
import { CommandMenu } from '@/components/CommandMenu';
import { useAuth } from '@/providers/auth-context';
import { useTheme } from '@/providers/theme-context';
import { BrandMark } from '@/components/BrandMark';
import { useBrand } from '@/lib/brand';
import { cn } from '@/lib/utils';

/**
 * Public site chrome.
 *
 * The header is transparent over the hero and gains a glass surface once the
 * page scrolls, so the aura gradient reads as a single continuous field at the
 * top of the page rather than being cut by a hard bar.
 */

const NAV_LINKS = [
  { to: '/services', label: 'Services' },
  { to: '/consultants', label: 'Consultants' },
  { to: '/insights', label: 'Insights' },
  { to: '/shop', label: 'Resources' },
  { to: '/about', label: 'About' },
];

function ThemeToggle({ className }: { className?: string }) {
  const { resolved, toggle } = useTheme();

  return (
    <button
      type="button"
      onClick={toggle}
      aria-label={`Switch to ${resolved === 'dark' ? 'light' : 'dark'} theme`}
      className={cn(
        'inline-flex size-9 items-center justify-center rounded-[var(--radius-control)] text-muted-foreground transition-colors hover:bg-muted hover:text-foreground',
        className,
      )}
    >
      {resolved === 'dark' ? <Sun className="size-4" aria-hidden /> : <Moon className="size-4" aria-hidden />}
    </button>
  );
}

/**
 * Kept as a named export because several layouts already import `Logo` from
 * here; the mark itself now lives in one place and reads the configured brand.
 */
function Logo({ className }: { className?: string }) {
  return <BrandMark className={className} />;
}

export function PublicLayout() {
  const [scrolled, setScrolled] = useState(false);
  const [mobileOpen, setMobileOpen] = useState(false);
  const [searchOpen, setSearchOpen] = useState(false);
  const { user } = useAuth();
  const location = useLocation();

  useEffect(() => {
    const onScroll = () => setScrolled(window.scrollY > 12);
    onScroll();
    window.addEventListener('scroll', onScroll, { passive: true });
    return () => window.removeEventListener('scroll', onScroll);
  }, []);

  // Closing the drawer is a state adjustment and happens during render, so the
  // new route never paints with the old drawer still open.
  const [drawerPath, setDrawerPath] = useState(location.pathname);
  if (drawerPath !== location.pathname) {
    setDrawerPath(location.pathname);
    setMobileOpen(false);
  }

  // Scrolling the window is a side effect on an external system, which is what
  // an effect is actually for.
  useEffect(() => {
    window.scrollTo({ top: 0, behavior: 'instant' as ScrollBehavior });
  }, [location.pathname]);

  useEffect(() => {
    document.body.style.overflow = mobileOpen ? 'hidden' : '';
    return () => {
      document.body.style.overflow = '';
    };
  }, [mobileOpen]);

  return (
    <div className="flex min-h-dvh flex-col">
      <a
        href="#main"
        className="sr-only focus:not-sr-only focus:absolute focus:top-4 focus:left-4 focus:z-[60] focus:rounded-lg focus:bg-card focus:px-4 focus:py-2 focus:text-sm focus:font-medium focus:shadow-[var(--shadow-lifted)]"
      >
        Skip to content
      </a>

      <header
        className={cn(
          'sticky top-0 z-40 transition-[background-color,box-shadow,border-color] duration-300',
          scrolled ? 'glass border-b border-border' : 'border-b border-transparent bg-transparent',
        )}
      >
        <div className="mx-auto flex h-16 max-w-7xl items-center gap-6 px-5 sm:px-8">
          <Logo />

          <nav aria-label="Main" className="hidden flex-1 items-center gap-1 lg:flex">
            {NAV_LINKS.map((link) => (
              <NavLink
                key={link.to}
                to={link.to}
                className={({ isActive }) =>
                  cn(
                    'rounded-[var(--radius-control)] px-3.5 py-2 text-sm font-medium transition-colors',
                    isActive ? 'text-foreground' : 'text-muted-foreground hover:text-foreground',
                  )
                }
              >
                {link.label}
              </NavLink>
            ))}
          </nav>

          <div className="ml-auto flex items-center gap-1.5 lg:ml-0">
            <button
              type="button"
              onClick={() => setSearchOpen(true)}
              aria-label="Search"
              className="inline-flex size-9 items-center justify-center rounded-[var(--radius-control)] text-muted-foreground transition-colors hover:bg-muted hover:text-foreground"
            >
              <Search className="size-4" aria-hidden />
            </button>

            <ThemeToggle />

            {user ? (
              <Button
                size="sm"
                variant="secondary"
                className="hidden sm:inline-flex"
                icon={<LayoutDashboard className="size-4" aria-hidden />}
                onClick={() => {
                  window.location.href = user.consultantProfileId
                    ? '/consultant'
                    : user.permissions.includes('analytics.read')
                      ? '/admin'
                      : '/portal';
                }}
              >
                Dashboard
              </Button>
            ) : (
              <Link to="/login" className="hidden sm:block">
                <Button size="sm" variant="ghost">
                  Sign in
                </Button>
              </Link>
            )}

            <Link to="/book" className="hidden sm:block">
              <Button size="sm" variant="primary" iconRight={<ArrowRight className="size-3.5" aria-hidden />}>
                Book a consultation
              </Button>
            </Link>

            <button
              type="button"
              onClick={() => setMobileOpen((open) => !open)}
              aria-label={mobileOpen ? 'Close menu' : 'Open menu'}
              aria-expanded={mobileOpen}
              className="inline-flex size-9 items-center justify-center rounded-[var(--radius-control)] text-foreground transition-colors hover:bg-muted lg:hidden"
            >
              {mobileOpen ? <X className="size-5" aria-hidden /> : <Menu className="size-5" aria-hidden />}
            </button>
          </div>
        </div>

        {mobileOpen && (
          <div className="border-t border-border bg-card lg:hidden">
            <nav aria-label="Mobile" className="mx-auto max-w-7xl px-5 py-4">
              {NAV_LINKS.map((link) => (
                <NavLink
                  key={link.to}
                  to={link.to}
                  className={({ isActive }) =>
                    cn(
                      'flex items-center justify-between rounded-[var(--radius-control)] px-3 py-3 text-[0.9375rem] font-medium transition-colors',
                      isActive ? 'bg-muted text-foreground' : 'text-muted-foreground hover:bg-muted',
                    )
                  }
                >
                  {link.label}
                  <ChevronRight className="size-4" aria-hidden />
                </NavLink>
              ))}

              <div className="mt-4 grid gap-2 border-t border-border pt-4">
                <Link to="/book">
                  <Button className="w-full" iconRight={<ArrowRight className="size-4" aria-hidden />}>
                    Book a consultation
                  </Button>
                </Link>
                <Link to={user ? '/portal' : '/login'}>
                  <Button variant="secondary" className="w-full">
                    {user ? 'Go to your portal' : 'Sign in'}
                  </Button>
                </Link>
              </div>
            </nav>
          </div>
        )}
      </header>

      <main id="main" className="flex-1">
        <Outlet />
      </main>

      <SiteFooter />
      <CommandMenu open={searchOpen} onOpenChange={setSearchOpen} />
    </div>
  );
}

const FOOTER_COLUMNS = [
  {
    title: 'Company',
    links: [
      { to: '/about', label: 'About us' },
      { to: '/consultants', label: 'Our consultants' },
      { to: '/reviews', label: 'Client reviews' },
      { to: '/contact', label: 'Contact' },
    ],
  },
  {
    title: 'Services',
    links: [
      { to: '/services', label: 'All services' },
      { to: '/services/business-strategy-consultation', label: 'Business strategy' },
      { to: '/services/fundraising-readiness-review', label: 'Fundraising readiness' },
      { to: '/services/operating-model-review', label: 'Operating model' },
    ],
  },
  {
    title: 'Resources',
    links: [
      { to: '/insights', label: 'Insights' },
      { to: '/journal', label: 'Research journal' },
      { to: '/shop', label: 'Books & reports' },
      { to: '/shop?category=templates', label: 'Templates' },
    ],
  },
  {
    title: 'Support',
    links: [
      { to: '/contact', label: 'Get in touch' },
      { to: '/portal', label: 'Client portal' },
      { to: '/faq', label: 'Frequently asked' },
    ],
  },
  {
    title: 'Legal',
    links: [
      { to: '/legal/privacy', label: 'Privacy policy' },
      { to: '/legal/terms', label: 'Terms of service' },
      { to: '/legal/refunds', label: 'Refund policy' },
      { to: '/legal/cancellation', label: 'Cancellation policy' },
    ],
  },
];

function SiteFooter() {
  const brand = useBrand();

  return (
    <footer className="mt-24 border-t border-border bg-card">
      <div className="mx-auto max-w-7xl px-5 py-16 sm:px-8">
        <div className="grid gap-12 lg:grid-cols-[1.4fr_3fr]">
          <div>
            <Logo />
            <p className="mt-4 max-w-xs text-sm leading-relaxed text-muted-foreground">
              Strategy, finance and operations advisory for organisations at an inflection point. Nairobi, working
              across East and West Africa.
            </p>

            <address className="mt-6 space-y-2.5 text-sm text-muted-foreground not-italic">
              <a
                href={`mailto:${brand.email ?? 'hello@meridianadvisory.co.ke'}`}
                className="flex items-center gap-2.5 transition-colors hover:text-foreground"
              >
                <Mail className="size-4 shrink-0" aria-hidden />
                {brand.email ?? 'hello@meridianadvisory.co.ke'}
              </a>
              <a
                href={`tel:${(brand.phone ?? '+254 20 271 4400').replace(/[^+\d]/g, '')}`}
                className="flex items-center gap-2.5 transition-colors hover:text-foreground"
              >
                <Phone className="size-4 shrink-0" aria-hidden />
                {brand.phone ?? '+254 20 271 4400'}
              </a>
              <span className="flex items-start gap-2.5">
                <MapPin className="mt-0.5 size-4 shrink-0" aria-hidden />
                Riverside Square, Riverside Drive
                <br />
                Nairobi, Kenya
              </span>
            </address>

            <div className="mt-6 flex gap-2">
              <a
                href="https://www.linkedin.com/company/meridian-advisory"
                aria-label={`${brand.name} on LinkedIn`}
                rel="noopener noreferrer"
                target="_blank"
                className="inline-flex size-9 items-center justify-center rounded-[var(--radius-control)] text-muted-foreground transition-colors hover:bg-muted hover:text-foreground"
              >
                <LinkedInIcon className="size-4" />
              </a>
              <a
                href="https://twitter.com/meridianadvisory"
                aria-label={`${brand.name} on X`}
                rel="noopener noreferrer"
                target="_blank"
                className="inline-flex size-9 items-center justify-center rounded-[var(--radius-control)] text-muted-foreground transition-colors hover:bg-muted hover:text-foreground"
              >
                <XIcon className="size-4" />
              </a>
              <Link
                to="/journal"
                aria-label="Meridian research journal"
                className="inline-flex size-9 items-center justify-center rounded-[var(--radius-control)] text-muted-foreground transition-colors hover:bg-muted hover:text-foreground"
              >
                <BookOpen className="size-4" aria-hidden />
              </Link>
            </div>
          </div>

          <div className="grid grid-cols-2 gap-8 sm:grid-cols-3 lg:grid-cols-5">
            {FOOTER_COLUMNS.map((column) => (
              <nav key={column.title} aria-label={column.title}>
                <h2 className="text-eyebrow uppercase text-muted-foreground">{column.title}</h2>
                <ul className="mt-4 space-y-2.5">
                  {column.links.map((link) => (
                    <li key={link.to + link.label}>
                      <Link
                        to={link.to}
                        className="text-sm text-muted-foreground transition-colors hover:text-foreground"
                      >
                        {link.label}
                      </Link>
                    </li>
                  ))}
                </ul>
              </nav>
            ))}
          </div>
        </div>

        <div className="mt-14 flex flex-col gap-4 border-t border-border pt-8 text-xs text-muted-foreground sm:flex-row sm:items-center sm:justify-between">
          <p>
            © {new Date().getFullYear()} {brand.name}. All rights reserved.
          </p>
          <p>Registered in Kenya · Company No. PVT-4KDNXYZ</p>
        </div>
      </div>
    </footer>
  );
}

export { Logo, ThemeToggle };
