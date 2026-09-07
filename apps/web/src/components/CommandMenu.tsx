import { useCallback, useEffect, useMemo, useRef, useState } from 'react';
import { useNavigate } from 'react-router-dom';
import {
  ArrowRight,
  BarChart3,
  BookOpen,
  CalendarPlus,
  CornerDownLeft,
  FileText,
  Search,
  Settings,
  ShoppingBag,
  Users,
} from 'lucide-react';
import { useGlobalSearch } from '@/lib/queries';
import { useAuth } from '@/providers/auth-context';
import { Kbd } from '@/components/ui';
import { cn } from '@/lib/utils';

/**
 * Command palette (Cmd/Ctrl + K).
 *
 * Combines static navigation actions — filtered by what the signed-in user is
 * actually permitted to reach — with live server-side search across services,
 * consultants, articles and products.
 */

interface CommandItem {
  id: string;
  label: string;
  hint?: string;
  group: string;
  icon: typeof Search;
  action: () => void;
}

export function CommandMenu({ open, onOpenChange }: { open: boolean; onOpenChange: (open: boolean) => void }) {
  const [query, setQuery] = useState('');
  const [activeIndex, setActiveIndex] = useState(0);
  const inputRef = useRef<HTMLInputElement>(null);
  const listRef = useRef<HTMLDivElement>(null);
  const navigate = useNavigate();
  const { user, can } = useAuth();

  const { data: results, isFetching } = useGlobalSearch(query);

  // Global shortcut. Registered once, regardless of where the menu is mounted.
  useEffect(() => {
    const onKeyDown = (event: KeyboardEvent) => {
      if ((event.metaKey || event.ctrlKey) && event.key.toLowerCase() === 'k') {
        event.preventDefault();
        onOpenChange(!open);
      }
      if (event.key === 'Escape' && open) onOpenChange(false);
    };
    document.addEventListener('keydown', onKeyDown);
    return () => document.removeEventListener('keydown', onKeyDown);
  }, [open, onOpenChange]);

  // Clearing the previous search happens during render, so the menu never
  // paints for a frame showing the last query.
  const [wasOpen, setWasOpen] = useState(open);
  if (wasOpen !== open) {
    setWasOpen(open);
    if (open) {
      setQuery('');
      setActiveIndex(0);
    }
  }

  useEffect(() => {
    if (!open) return;
    // Deferred so the input exists before focus is requested, and cancelled on
    // close so a fast open/close cannot pull focus back afterwards.
    const frame = requestAnimationFrame(() => inputRef.current?.focus());
    return () => cancelAnimationFrame(frame);
  }, [open]);

  // Memoised because the two `useMemo` blocks below close over it. Left as a
  // plain function it would change identity every render and rebuild the whole
  // command list each time.
  const go = useCallback(
    (path: string) => {
      onOpenChange(false);
      navigate(path);
    },
    [navigate, onOpenChange],
  );

  const actions = useMemo<CommandItem[]>(() => {
    const items: CommandItem[] = [
      { id: 'book', label: 'Book a consultation', group: 'Actions', icon: CalendarPlus, action: () => go('/book') },
      { id: 'services', label: 'Browse services', group: 'Navigate', icon: FileText, action: () => go('/services') },
      { id: 'consultants', label: 'View consultants', group: 'Navigate', icon: Users, action: () => go('/consultants') },
      { id: 'insights', label: 'Read insights', group: 'Navigate', icon: BookOpen, action: () => go('/insights') },
      { id: 'shop', label: 'Browse resources', group: 'Navigate', icon: ShoppingBag, action: () => go('/shop') },
    ];

    if (user) {
      items.push({ id: 'portal', label: 'My portal', group: 'Navigate', icon: ArrowRight, action: () => go('/portal') });
    }

    // Admin entries appear only when the user actually holds the permission —
    // an option that would 403 on click is worse than no option.
    if (can('analytics.read')) {
      items.push(
        { id: 'admin', label: 'Admin dashboard', group: 'Admin', icon: BarChart3, action: () => go('/admin') },
        { id: 'admin-bookings', label: "Today's bookings", group: 'Admin', icon: CalendarPlus, action: () => go('/admin/bookings') },
      );
    }
    if (can('payments.read')) {
      items.push({ id: 'admin-payments', label: 'Open payments', group: 'Admin', icon: BarChart3, action: () => go('/admin/payments') });
    }
    if (can('clients.read')) {
      items.push({ id: 'admin-clients', label: 'Search clients', group: 'Admin', icon: Users, action: () => go('/admin/clients') });
    }
    if (can('content.create')) {
      items.push({ id: 'admin-article', label: 'Create an article', group: 'Admin', icon: FileText, action: () => go('/admin/articles') });
    }
    if (can('settings.manage')) {
      items.push({ id: 'admin-settings', label: 'Go to settings', group: 'Admin', icon: Settings, action: () => go('/admin/settings') });
    }

    return items;
  }, [user, can, go]);

  const items = useMemo<CommandItem[]>(() => {
    const needle = query.trim().toLowerCase();
    const filteredActions = needle
      ? actions.filter((action) => action.label.toLowerCase().includes(needle))
      : actions;

    if (!results || needle.length < 2) return filteredActions;

    return [
      ...filteredActions,
      ...results.services.map((service) => ({
        id: `service-${service.id}`,
        label: service.name,
        hint: 'Service',
        group: 'Services',
        icon: FileText,
        action: () => go(`/services/${service.slug}`),
      })),
      ...results.consultants.map((consultant) => ({
        id: `consultant-${consultant.id}`,
        label: consultant.fullName,
        hint: consultant.title,
        group: 'Consultants',
        icon: Users,
        action: () => go(`/consultants/${consultant.slug}`),
      })),
      ...results.articles.map((article) => ({
        id: `article-${article.id}`,
        label: article.title,
        hint: article.isJournal ? 'Journal' : 'Article',
        group: 'Insights',
        icon: BookOpen,
        action: () => go(article.isJournal ? `/journal/${article.slug}` : `/insights/${article.slug}`),
      })),
      ...results.products.map((product) => ({
        id: `product-${product.id}`,
        label: product.name,
        hint: 'Resource',
        group: 'Resources',
        icon: ShoppingBag,
        action: () => go(`/shop/${product.slug}`),
      })),
    ];
  }, [actions, results, query, go]);

  // Results arriving can shorten the list under the cursor, so the index is
  // clamped for use rather than corrected afterwards in an effect.
  const activeRow = Math.min(activeIndex, Math.max(0, items.length - 1));

  if (!open) return null;

  const onKeyDown = (event: React.KeyboardEvent) => {
    if (event.key === 'ArrowDown') {
      event.preventDefault();
      setActiveIndex((index) => Math.min(index + 1, items.length - 1));
    } else if (event.key === 'ArrowUp') {
      event.preventDefault();
      setActiveIndex((index) => Math.max(index - 1, 0));
    } else if (event.key === 'Enter') {
      event.preventDefault();
      items[activeRow]?.action();
    }
  };

  // Grouped for display, but the flat `items` array is what arrow keys walk,
  // so the highlighted row always matches the one Enter will activate.
  const grouped = items.reduce<Record<string, { item: CommandItem; index: number }[]>>((acc, item, index) => {
    (acc[item.group] ??= []).push({ item, index });
    return acc;
  }, {});

  return (
    <div className="fixed inset-0 z-[70] flex items-start justify-center p-4 pt-[12vh]">
      <div className="absolute inset-0 bg-[hsl(224_32%_6%_/_0.5)] backdrop-blur-[2px]" onClick={() => onOpenChange(false)} aria-hidden />

      <div
        role="dialog"
        aria-modal="true"
        aria-label="Command menu"
        className="relative w-full max-w-xl overflow-hidden rounded-[var(--radius-card)] bg-card shadow-[var(--shadow-lifted)] hairline"
      >
        <div className="flex items-center gap-3 border-b border-border px-4">
          <Search className="size-4 shrink-0 text-muted-foreground" aria-hidden />
          <input
            ref={inputRef}
            value={query}
            onChange={(event) => {
              setQuery(event.target.value);
              // A new query means a new list; highlight its first row.
              setActiveIndex(0);
            }}
            onKeyDown={onKeyDown}
            placeholder="Search services, consultants, insights…"
            aria-label="Search"
            aria-activedescendant={items[activeRow] ? `command-${items[activeRow].id}` : undefined}
            className="h-14 flex-1 bg-transparent text-[0.9375rem] text-foreground outline-none placeholder:text-muted-foreground"
          />
          {isFetching && <span className="size-3.5 animate-spin rounded-full border-2 border-border border-t-accent" aria-hidden />}
          <Kbd>esc</Kbd>
        </div>

        <div ref={listRef} className="max-h-[52vh] overflow-y-auto scroll-slim p-2">
          {items.length === 0 ? (
            <p className="px-3 py-10 text-center text-sm text-muted-foreground">
              No matches for “{query}”.
            </p>
          ) : (
            Object.entries(grouped).map(([group, entries]) => (
              <div key={group} className="mb-1">
                <p className="px-3 pt-3 pb-1.5 text-eyebrow uppercase text-muted-foreground">{group}</p>
                {entries.map(({ item, index }) => {
                  const Icon = item.icon;
                  const active = index === activeRow;
                  return (
                    <button
                      key={item.id}
                      id={`command-${item.id}`}
                      type="button"
                      onClick={item.action}
                      onMouseEnter={() => setActiveIndex(index)}
                      className={cn(
                        'flex w-full items-center gap-3 rounded-[var(--radius-control)] px-3 py-2.5 text-left text-sm transition-colors',
                        active ? 'bg-muted text-foreground' : 'text-muted-foreground',
                      )}
                    >
                      <Icon className="size-4 shrink-0" aria-hidden />
                      <span className="flex-1 truncate text-foreground">{item.label}</span>
                      {item.hint && <span className="shrink-0 text-xs text-muted-foreground">{item.hint}</span>}
                      {active && <CornerDownLeft className="size-3.5 shrink-0 text-muted-foreground" aria-hidden />}
                    </button>
                  );
                })}
              </div>
            ))
          )}
        </div>

        <div className="flex items-center gap-4 border-t border-border px-4 py-2.5 text-xs text-muted-foreground">
          <span className="flex items-center gap-1.5">
            <Kbd>↑</Kbd>
            <Kbd>↓</Kbd>
            navigate
          </span>
          <span className="flex items-center gap-1.5">
            <Kbd>↵</Kbd>
            open
          </span>
          <span className="ml-auto flex items-center gap-1.5">
            <Kbd>⌘</Kbd>
            <Kbd>K</Kbd>
          </span>
        </div>
      </div>
    </div>
  );
}
