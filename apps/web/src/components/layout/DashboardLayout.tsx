import { useEffect, useState, type ReactNode } from 'react';
import { Link, NavLink, Outlet, useLocation } from 'react-router-dom';
import { Bell, ChevronRight, LogOut, Menu, Search, X } from 'lucide-react';
import type { Permission } from '@meridian/types';
import { Avatar, Badge } from '@/components/ui';
import { CommandMenu } from '@/components/CommandMenu';
import { NotificationBell } from '@/components/NotificationBell';
import { Logo, ThemeToggle } from '@/components/layout/PublicLayout';
import { useAuth } from '@/providers/auth-context';
import { cn } from '@/lib/utils';

/**
 * Shared chrome for the three authenticated areas.
 *
 * A single shell rather than three keeps the sidebar, header and responsive
 * behaviour consistent; each area supplies its own navigation and accent.
 */

export interface NavItem {
  to: string;
  label: string;
  icon: ReactNode;
  end?: boolean;
  /** Hidden unless the signed-in user holds this permission. */
  permission?: Permission;
  badge?: number;
}

export interface NavSection {
  title?: string;
  items: NavItem[];
}

export interface DashboardLayoutProps {
  area: 'portal' | 'consultant' | 'admin';
  areaLabel: string;
  sections: NavSection[];
}

export function DashboardLayout({ area, areaLabel, sections }: DashboardLayoutProps) {
  const [sidebarOpen, setSidebarOpen] = useState(false);
  const [searchOpen, setSearchOpen] = useState(false);
  const { user, logout, can } = useAuth();
  const location = useLocation();

  // Adjusted during render, not in an effect: an effect would paint the drawer
  // once at the new route before closing it.
  const [drawerPath, setDrawerPath] = useState(location.pathname);
  if (drawerPath !== location.pathname) {
    setDrawerPath(location.pathname);
    setSidebarOpen(false);
  }

  useEffect(() => {
    document.body.style.overflow = sidebarOpen ? 'hidden' : '';
    return () => {
      document.body.style.overflow = '';
    };
  }, [sidebarOpen]);

  const visibleSections = sections
    .map((section) => ({
      ...section,
      items: section.items.filter((item) => !item.permission || can(item.permission)),
    }))
    .filter((section) => section.items.length > 0);

  const sidebar = (
    <nav aria-label={`${areaLabel} navigation`} className="flex h-full flex-col gap-6 overflow-y-auto scroll-slim px-3 py-5">
      {visibleSections.map((section, index) => (
        <div key={section.title ?? index}>
          {section.title && (
            <p className="px-3 pb-2 text-eyebrow uppercase text-muted-foreground">{section.title}</p>
          )}
          <ul className="space-y-0.5">
            {section.items.map((item) => (
              <li key={item.to}>
                <NavLink
                  to={item.to}
                  end={item.end}
                  className={({ isActive }) =>
                    cn(
                      'group flex items-center gap-3 rounded-[var(--radius-control)] px-3 py-2.5 text-sm font-medium transition-colors',
                      isActive
                        ? 'bg-accent-soft text-accent'
                        : 'text-muted-foreground hover:bg-muted hover:text-foreground',
                    )
                  }
                >
                  <span className="shrink-0 [&>svg]:size-[1.125rem]" aria-hidden>
                    {item.icon}
                  </span>
                  <span className="flex-1 truncate">{item.label}</span>
                  {item.badge !== undefined && item.badge > 0 && (
                    <Badge tone="accent" className="px-1.5 py-0 text-[0.6875rem]">
                      {item.badge > 99 ? '99+' : item.badge}
                    </Badge>
                  )}
                </NavLink>
              </li>
            ))}
          </ul>
        </div>
      ))}

      <div className="mt-auto space-y-1 border-t border-border pt-4">
        <Link
          to="/"
          className="flex items-center gap-3 rounded-[var(--radius-control)] px-3 py-2.5 text-sm font-medium text-muted-foreground transition-colors hover:bg-muted hover:text-foreground"
        >
          <ChevronRight className="size-[1.125rem] rotate-180" aria-hidden />
          Back to website
        </Link>
        <button
          type="button"
          onClick={() => void logout()}
          className="flex w-full items-center gap-3 rounded-[var(--radius-control)] px-3 py-2.5 text-sm font-medium text-muted-foreground transition-colors hover:bg-muted hover:text-foreground"
        >
          <LogOut className="size-[1.125rem]" aria-hidden />
          Sign out
        </button>
      </div>
    </nav>
  );

  return (
    <div className="min-h-dvh bg-background">
      <a
        href="#dashboard-main"
        className="sr-only focus:not-sr-only focus:absolute focus:top-4 focus:left-4 focus:z-[60] focus:rounded-lg focus:bg-card focus:px-4 focus:py-2 focus:text-sm focus:shadow-[var(--shadow-lifted)]"
      >
        Skip to content
      </a>

      {/* Desktop sidebar */}
      <aside className="fixed inset-y-0 left-0 z-30 hidden w-64 border-r border-border bg-card lg:flex lg:flex-col">
        <div className="flex h-16 shrink-0 items-center gap-2 border-b border-border px-5">
          <Logo />
          <Badge tone="neutral" className="ml-1 px-2 py-0.5 text-[0.625rem] uppercase tracking-wider">
            {areaLabel}
          </Badge>
        </div>
        {sidebar}
      </aside>

      {/* Mobile drawer */}
      {sidebarOpen && (
        <div className="fixed inset-0 z-50 lg:hidden">
          <div className="absolute inset-0 bg-[hsl(224_32%_6%_/_0.5)]" onClick={() => setSidebarOpen(false)} aria-hidden />
          <aside className="relative flex h-full w-[17rem] flex-col bg-card shadow-[var(--shadow-lifted)]">
            <div className="flex h-16 shrink-0 items-center justify-between border-b border-border px-5">
              <Logo />
              <button
                type="button"
                onClick={() => setSidebarOpen(false)}
                aria-label="Close navigation"
                className="rounded-lg p-2 text-muted-foreground hover:bg-muted"
              >
                <X className="size-4" aria-hidden />
              </button>
            </div>
            {sidebar}
          </aside>
        </div>
      )}

      <div className="lg:pl-64">
        <header className="sticky top-0 z-20 flex h-16 items-center gap-3 border-b border-border glass px-4 sm:px-6">
          <button
            type="button"
            onClick={() => setSidebarOpen(true)}
            aria-label="Open navigation"
            className="inline-flex size-9 items-center justify-center rounded-[var(--radius-control)] text-foreground hover:bg-muted lg:hidden"
          >
            <Menu className="size-5" aria-hidden />
          </button>

          <button
            type="button"
            onClick={() => setSearchOpen(true)}
            className="hidden items-center gap-2.5 rounded-[var(--radius-control)] bg-muted/60 px-3 py-2 text-sm text-muted-foreground transition-colors hover:bg-muted sm:flex"
          >
            <Search className="size-4" aria-hidden />
            <span>Search…</span>
            <kbd className="ml-6 rounded border border-border bg-card px-1.5 text-[0.6875rem] font-medium">⌘K</kbd>
          </button>

          <button
            type="button"
            onClick={() => setSearchOpen(true)}
            aria-label="Search"
            className="inline-flex size-9 items-center justify-center rounded-[var(--radius-control)] text-muted-foreground hover:bg-muted sm:hidden"
          >
            <Search className="size-4" aria-hidden />
          </button>

          <div className="ml-auto flex items-center gap-1.5">
            <ThemeToggle />
            <NotificationBell />

            <Link
              to={area === 'admin' ? '/admin/settings' : area === 'consultant' ? '/consultant/settings' : '/portal/profile'}
              className="ml-1 flex items-center gap-2.5 rounded-[var(--radius-control)] p-1 transition-colors hover:bg-muted"
            >
              <Avatar name={`${user?.firstName ?? ''} ${user?.lastName ?? ''}`} src={user?.avatarUrl} size="sm" />
              <span className="hidden pr-2 text-left sm:block">
                <span className="block text-xs font-medium text-foreground">
                  {user?.firstName} {user?.lastName}
                </span>
                <span className="block text-[0.6875rem] text-muted-foreground">{user?.email}</span>
              </span>
            </Link>
          </div>
        </header>

        <main id="dashboard-main" className="px-4 py-6 sm:px-6 lg:px-8 lg:py-8">
          <Outlet />
        </main>
      </div>

      <CommandMenu open={searchOpen} onOpenChange={setSearchOpen} />
    </div>
  );
}

/** Standard page heading used across the dashboards. */
export function PageHeader({
  title,
  description,
  action,
  breadcrumbs,
}: {
  title: string;
  description?: string;
  action?: ReactNode;
  breadcrumbs?: { label: string; to?: string }[];
}) {
  return (
    <header className="mb-7">
      {breadcrumbs && breadcrumbs.length > 0 && (
        <nav aria-label="Breadcrumb" className="mb-2.5">
          <ol className="flex flex-wrap items-center gap-1.5 text-xs text-muted-foreground">
            {breadcrumbs.map((crumb, index) => (
              <li key={crumb.label} className="flex items-center gap-1.5">
                {index > 0 && <ChevronRight className="size-3" aria-hidden />}
                {crumb.to ? (
                  <Link to={crumb.to} className="transition-colors hover:text-foreground">
                    {crumb.label}
                  </Link>
                ) : (
                  <span aria-current="page" className="text-foreground">
                    {crumb.label}
                  </span>
                )}
              </li>
            ))}
          </ol>
        </nav>
      )}

      <div className="flex flex-wrap items-start justify-between gap-4">
        <div className="min-w-0">
          <h1 className="text-h2">{title}</h1>
          {description && <p className="mt-1.5 max-w-2xl text-sm leading-relaxed text-muted-foreground">{description}</p>}
        </div>
        {action && <div className="flex shrink-0 flex-wrap gap-2">{action}</div>}
      </div>
    </header>
  );
}

export { Bell };
