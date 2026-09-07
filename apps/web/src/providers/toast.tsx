import { useCallback, useMemo, useState, type ReactNode } from 'react';
import { AlertTriangle, CheckCircle2, Info, X, XCircle } from 'lucide-react';

import { ToastContext, type Toast, type ToastContextValue, type ToastTone } from './toast-context';
import { cn } from '@/lib/utils';

/**
 * Toasts.
 *
 * Used for confirmation of an action the user just took. Anything the user
 * must not miss — a payment failure, a booking conflict — is *also* rendered
 * inline on the page; a toast is never the only place critical information
 * appears, because it disappears.
 */

const TONE_CONFIG: Record<ToastTone, { icon: typeof Info; className: string; duration: number }> = {
  success: { icon: CheckCircle2, className: 'text-success', duration: 4500 },
  // Errors linger: the user may need to read a reason before it goes.
  error: { icon: XCircle, className: 'text-destructive', duration: 9000 },
  warning: { icon: AlertTriangle, className: 'text-warning', duration: 7000 },
  info: { icon: Info, className: 'text-info', duration: 5000 },
};

export function ToastProvider({ children }: { children: ReactNode }) {
  const [toasts, setToasts] = useState<Toast[]>([]);

  const dismiss = useCallback((id: string) => {
    setToasts((current) => current.filter((toast) => toast.id !== id));
  }, []);

  const toast = useCallback(
    (input: Omit<Toast, 'id'>) => {
      const id = crypto.randomUUID();
      // Cap the stack so a burst of failures cannot cover the page.
      setToasts((current) => [...current.slice(-3), { ...input, id }]);
      window.setTimeout(() => dismiss(id), TONE_CONFIG[input.tone].duration);
    },
    [dismiss],
  );

  const value = useMemo<ToastContextValue>(
    () => ({
      toast,
      dismiss,
      success: (title, description) => toast({ tone: 'success', title, description }),
      error: (title, description) => toast({ tone: 'error', title, description }),
      warning: (title, description) => toast({ tone: 'warning', title, description }),
      info: (title, description) => toast({ tone: 'info', title, description }),
    }),
    [toast, dismiss],
  );

  return (
    <ToastContext.Provider value={value}>
      {children}

      <div
        // Announced politely so a success message does not interrupt whatever
        // a screen-reader user is currently reading.
        role="region"
        aria-live="polite"
        aria-label="Notifications"
        className="pointer-events-none fixed inset-x-4 bottom-4 z-[100] flex flex-col items-center gap-2 sm:inset-x-auto sm:right-6 sm:bottom-6 sm:items-end"
      >
        {toasts.map((item) => {
          const config = TONE_CONFIG[item.tone];
          const Icon = config.icon;

          return (
            <div
              key={item.id}
              className="pointer-events-auto flex w-full max-w-sm items-start gap-3 rounded-[var(--radius-panel)] bg-card p-4 shadow-[var(--shadow-lifted)] hairline"
              style={{ animation: 'toast-in 0.28s var(--ease-out-quint)' }}
            >
              <Icon className={cn('mt-0.5 size-5 shrink-0', config.className)} aria-hidden />
              <div className="min-w-0 flex-1">
                <p className="text-sm font-semibold text-foreground">{item.title}</p>
                {item.description && (
                  <p className="mt-0.5 text-xs leading-relaxed text-muted-foreground">{item.description}</p>
                )}
              </div>
              <button
                type="button"
                onClick={() => dismiss(item.id)}
                aria-label="Dismiss notification"
                className="-mt-1 -mr-1 rounded p-1 text-muted-foreground transition-colors hover:bg-muted hover:text-foreground"
              >
                <X className="size-3.5" aria-hidden />
              </button>
            </div>
          );
        })}
      </div>
    </ToastContext.Provider>
  );
}
