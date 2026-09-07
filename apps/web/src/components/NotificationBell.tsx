import { useEffect, useRef, useState } from 'react';
import { Link } from 'react-router-dom';
import { Bell, CheckCheck } from 'lucide-react';
import { useMarkAllNotificationsRead, useMarkNotificationRead, useNotifications } from '@/lib/queries';
import { formatRelative, cn } from '@/lib/utils';

/**
 * Notification bell with an unread badge and a dropdown panel.
 *
 * The badge count is polled rather than pushed. A websocket would be the right
 * answer at higher volume; at this scale a 90-second poll is far simpler to
 * operate and the latency is imperceptible for the events involved.
 */
export function NotificationBell() {
  const [open, setOpen] = useState(false);
  const containerRef = useRef<HTMLDivElement>(null);

  const { data } = useNotifications();
  const markRead = useMarkNotificationRead();
  const markAllRead = useMarkAllNotificationsRead();

  useEffect(() => {
    if (!open) return;

    const onPointerDown = (event: MouseEvent) => {
      if (!containerRef.current?.contains(event.target as Node)) setOpen(false);
    };
    const onKeyDown = (event: KeyboardEvent) => {
      if (event.key === 'Escape') setOpen(false);
    };

    document.addEventListener('mousedown', onPointerDown);
    document.addEventListener('keydown', onKeyDown);
    return () => {
      document.removeEventListener('mousedown', onPointerDown);
      document.removeEventListener('keydown', onKeyDown);
    };
  }, [open]);

  const unread = data?.unreadCount ?? 0;
  const items = data?.items ?? [];

  return (
    <div ref={containerRef} className="relative">
      <button
        type="button"
        onClick={() => setOpen((value) => !value)}
        aria-label={unread > 0 ? `Notifications, ${unread} unread` : 'Notifications'}
        aria-expanded={open}
        aria-haspopup="true"
        className="relative inline-flex size-9 items-center justify-center rounded-[var(--radius-control)] text-muted-foreground transition-colors hover:bg-muted hover:text-foreground"
      >
        <Bell className="size-4" aria-hidden />
        {unread > 0 && (
          <span
            aria-hidden
            className="absolute top-1 right-1 flex min-w-4 items-center justify-center rounded-full bg-accent px-1 text-[0.5625rem] font-semibold text-accent-foreground"
          >
            {unread > 9 ? '9+' : unread}
          </span>
        )}
      </button>

      {open && (
        <div
          role="dialog"
          aria-label="Notifications"
          className="absolute right-0 z-50 mt-2 w-[min(22rem,calc(100vw-2rem))] overflow-hidden rounded-[var(--radius-panel)] bg-card shadow-[var(--shadow-lifted)] hairline"
        >
          <div className="flex items-center justify-between border-b border-border px-4 py-3">
            <p className="text-sm font-semibold">Notifications</p>
            {unread > 0 && (
              <button
                type="button"
                onClick={() => markAllRead.mutate()}
                className="inline-flex items-center gap-1.5 text-xs font-medium text-accent transition-opacity hover:opacity-80"
              >
                <CheckCheck className="size-3.5" aria-hidden />
                Mark all read
              </button>
            )}
          </div>

          <div className="max-h-[24rem] overflow-y-auto scroll-slim">
            {items.length === 0 ? (
              <p className="px-4 py-10 text-center text-sm text-muted-foreground">
                You are all caught up.
              </p>
            ) : (
              <ul>
                {items.map((notification) => {
                  const body = (
                    <>
                      <span className="flex items-start gap-2.5">
                        {!notification.readAt && (
                          <span className="mt-1.5 size-1.5 shrink-0 rounded-full bg-accent" aria-hidden />
                        )}
                        <span className={cn('min-w-0 flex-1', notification.readAt && 'pl-4')}>
                          <span className="block text-sm font-medium text-foreground">{notification.title}</span>
                          <span className="mt-0.5 block text-xs leading-relaxed text-muted-foreground">
                            {notification.body}
                          </span>
                          <span className="mt-1 block text-[0.6875rem] text-muted-foreground">
                            {formatRelative(notification.createdAt)}
                          </span>
                        </span>
                      </span>
                    </>
                  );

                  return (
                    <li key={notification.id} className="border-b border-border last:border-0">
                      {notification.href ? (
                        <Link
                          to={notification.href}
                          onClick={() => {
                            if (!notification.readAt) markRead.mutate(notification.id);
                            setOpen(false);
                          }}
                          className="block px-4 py-3 transition-colors hover:bg-muted"
                        >
                          {body}
                        </Link>
                      ) : (
                        <button
                          type="button"
                          onClick={() => !notification.readAt && markRead.mutate(notification.id)}
                          className="block w-full px-4 py-3 text-left transition-colors hover:bg-muted"
                        >
                          {body}
                        </button>
                      )}
                    </li>
                  );
                })}
              </ul>
            )}
          </div>
        </div>
      )}
    </div>
  );
}
