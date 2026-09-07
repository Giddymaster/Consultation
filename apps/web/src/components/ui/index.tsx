import {
  createContext,
  forwardRef,
  useContext,
  useEffect,
  useId,
  useRef,
  useState,
  type ButtonHTMLAttributes,
  type HTMLAttributes,
  type InputHTMLAttributes,
  type ReactNode,
  type SelectHTMLAttributes,
  type TextareaHTMLAttributes,
} from 'react';
import { Check, ChevronDown, Loader2, X } from 'lucide-react';
import { cn, type StatusTone } from '@/lib/utils';

/**
 * Design-system primitives.
 *
 * Every variant is expressed in tokens (`bg-accent`, `text-muted-foreground`)
 * rather than literal colours, so light and dark are handled by the theme
 * definition and never by component-level branching.
 */

/* -------------------------------------------------------------------------- */
/* Button                                                                     */
/* -------------------------------------------------------------------------- */

type ButtonVariant = 'primary' | 'accent' | 'secondary' | 'ghost' | 'destructive' | 'link';
type ButtonSize = 'sm' | 'md' | 'lg' | 'icon';

const BUTTON_VARIANTS: Record<ButtonVariant, string> = {
  primary:
    'bg-primary text-primary-foreground hover:bg-primary/90 active:bg-primary shadow-[var(--shadow-subtle)]',
  accent:
    'bg-accent text-accent-foreground hover:bg-accent/90 active:bg-accent shadow-[var(--shadow-subtle)]',
  secondary:
    'bg-card text-foreground hairline hover:bg-muted active:bg-muted',
  ghost: 'text-foreground hover:bg-muted active:bg-muted/80',
  destructive: 'bg-destructive text-destructive-foreground hover:bg-destructive/90',
  link: 'text-accent underline-offset-4 hover:underline p-0 h-auto',
};

const BUTTON_SIZES: Record<ButtonSize, string> = {
  sm: 'h-9 px-3.5 text-[0.8125rem] gap-1.5',
  md: 'h-11 px-5 text-sm gap-2',
  lg: 'h-13 px-7 text-[0.9375rem] gap-2.5',
  icon: 'h-10 w-10 p-0',
};

export interface ButtonProps extends ButtonHTMLAttributes<HTMLButtonElement> {
  variant?: ButtonVariant;
  size?: ButtonSize;
  loading?: boolean;
  icon?: ReactNode;
  iconRight?: ReactNode;
}

export const Button = forwardRef<HTMLButtonElement, ButtonProps>(function Button(
  { className, variant = 'primary', size = 'md', loading, icon, iconRight, children, disabled, ...props },
  ref,
) {
  return (
    <button
      ref={ref}
      // A loading button stays disabled so a double-click cannot double-submit.
      disabled={disabled || loading}
      // Communicates the busy state to screen readers, not just visually.
      aria-busy={loading || undefined}
      className={cn(
        'inline-flex items-center justify-center rounded-[var(--radius-control)] font-medium whitespace-nowrap',
        'transition-[background-color,color,box-shadow,transform] duration-200 ease-[var(--ease-out-quint)]',
        'disabled:pointer-events-none disabled:opacity-50',
        'active:translate-y-px motion-reduce:active:translate-y-0',
        BUTTON_VARIANTS[variant],
        variant !== 'link' && BUTTON_SIZES[size],
        className,
      )}
      {...props}
    >
      {loading ? <Loader2 className="size-4 animate-spin" aria-hidden /> : icon}
      {children}
      {!loading && iconRight}
    </button>
  );
});

/* -------------------------------------------------------------------------- */
/* Card                                                                       */
/* -------------------------------------------------------------------------- */

export interface CardProps extends HTMLAttributes<HTMLDivElement> {
  /** Adds a hover lift. Only for cards that are themselves a link or action. */
  interactive?: boolean;
  padded?: boolean;
}

export function Card({ className, interactive, padded = true, ...props }: CardProps) {
  return (
    <div
      className={cn(
        'rounded-[var(--radius-card)] bg-card text-card-foreground hairline',
        padded && 'p-6',
        interactive &&
          'transition-[transform,box-shadow] duration-300 ease-[var(--ease-out-quint)] hover:-translate-y-1 hover:shadow-[var(--shadow-lifted)] motion-reduce:hover:translate-y-0',
        className,
      )}
      {...props}
    />
  );
}

export function CardHeader({ className, ...props }: HTMLAttributes<HTMLDivElement>) {
  return <div className={cn('mb-4 flex items-start justify-between gap-4', className)} {...props} />;
}

export function CardTitle({ className, ...props }: HTMLAttributes<HTMLHeadingElement>) {
  return <h3 className={cn('text-h3', className)} {...props} />;
}

export function CardDescription({ className, ...props }: HTMLAttributes<HTMLParagraphElement>) {
  return <p className={cn('text-sm leading-relaxed text-muted-foreground', className)} {...props} />;
}

/* -------------------------------------------------------------------------- */
/* Badge                                                                      */
/* -------------------------------------------------------------------------- */

const BADGE_TONES: Record<StatusTone, string> = {
  neutral: 'bg-muted text-muted-foreground',
  accent: 'bg-accent-soft text-accent',
  success: 'bg-success-soft text-success',
  warning: 'bg-warning-soft text-warning',
  destructive: 'bg-destructive-soft text-destructive',
  info: 'bg-info-soft text-info',
};

export interface BadgeProps extends HTMLAttributes<HTMLSpanElement> {
  tone?: StatusTone;
  dot?: boolean;
}

export function Badge({ className, tone = 'neutral', dot, children, ...props }: BadgeProps) {
  return (
    <span
      className={cn(
        'inline-flex items-center gap-1.5 rounded-full px-2.5 py-1 text-xs font-medium whitespace-nowrap',
        BADGE_TONES[tone],
        className,
      )}
      {...props}
    >
      {dot && <span className="size-1.5 rounded-full bg-current" aria-hidden />}
      {children}
    </span>
  );
}

/** Status pill used across bookings, payments and orders. */
export function StatusBadge({ label, tone }: { label: string; tone: StatusTone }) {
  return (
    <Badge tone={tone} dot>
      {label}
    </Badge>
  );
}

/* -------------------------------------------------------------------------- */
/* Form fields                                                                */
/* -------------------------------------------------------------------------- */

const FIELD_BASE =
  'w-full rounded-[var(--radius-control)] bg-card px-3.5 text-sm text-foreground ' +
  'placeholder:text-muted-foreground/70 hairline ' +
  'transition-[box-shadow,background-color] duration-200 ' +
  'focus:outline-none focus-visible:ring-2 focus-visible:ring-ring focus-visible:ring-offset-1 focus-visible:ring-offset-background ' +
  'disabled:cursor-not-allowed disabled:opacity-60';

export interface FieldProps {
  label: string;
  hint?: string;
  error?: string;
  required?: boolean;
  children: (props: { id: string; describedBy: string | undefined; invalid: boolean }) => ReactNode;
}

/**
 * Wraps a control with its label, hint and error, wiring `aria-describedby` and
 * `aria-invalid` so the relationship is available to assistive technology and
 * not merely visual.
 */
export function Field({ label, hint, error, required, children }: FieldProps) {
  const id = useId();
  const hintId = hint ? `${id}-hint` : undefined;
  const errorId = error ? `${id}-error` : undefined;
  const describedBy = [errorId, hintId].filter(Boolean).join(' ') || undefined;

  return (
    <div className="space-y-1.5">
      <label htmlFor={id} className="block text-sm font-medium text-foreground">
        {label}
        {required && (
          <span className="ml-1 text-destructive" aria-label="required">
            *
          </span>
        )}
      </label>

      {children({ id, describedBy, invalid: Boolean(error) })}

      {error ? (
        <p id={errorId} role="alert" className="text-xs font-medium text-destructive">
          {error}
        </p>
      ) : hint ? (
        <p id={hintId} className="text-xs text-muted-foreground">
          {hint}
        </p>
      ) : null}
    </div>
  );
}

export const Input = forwardRef<HTMLInputElement, InputHTMLAttributes<HTMLInputElement> & { invalid?: boolean }>(
  function Input({ className, invalid, ...props }, ref) {
    return (
      <input
        ref={ref}
        aria-invalid={invalid || undefined}
        className={cn(FIELD_BASE, 'h-11', invalid && 'ring-1 ring-destructive', className)}
        {...props}
      />
    );
  },
);

export const Textarea = forwardRef<
  HTMLTextAreaElement,
  TextareaHTMLAttributes<HTMLTextAreaElement> & { invalid?: boolean }
>(function Textarea({ className, invalid, ...props }, ref) {
  return (
    <textarea
      ref={ref}
      aria-invalid={invalid || undefined}
      className={cn(FIELD_BASE, 'min-h-28 resize-y py-3 leading-relaxed', invalid && 'ring-1 ring-destructive', className)}
      {...props}
    />
  );
});

export const Select = forwardRef<
  HTMLSelectElement,
  SelectHTMLAttributes<HTMLSelectElement> & { invalid?: boolean }
>(function Select({ className, invalid, children, ...props }, ref) {
  return (
    <div className="relative">
      <select
        ref={ref}
        aria-invalid={invalid || undefined}
        className={cn(FIELD_BASE, 'h-11 appearance-none pr-10', invalid && 'ring-1 ring-destructive', className)}
        {...props}
      >
        {children}
      </select>
      <ChevronDown
        className="pointer-events-none absolute top-1/2 right-3.5 size-4 -translate-y-1/2 text-muted-foreground"
        aria-hidden
      />
    </div>
  );
});

export interface CheckboxProps extends Omit<InputHTMLAttributes<HTMLInputElement>, 'type'> {
  label: ReactNode;
  description?: string;
}

export const Checkbox = forwardRef<HTMLInputElement, CheckboxProps>(function Checkbox(
  { label, description, className, ...props },
  ref,
) {
  const id = useId();
  return (
    <div className={cn('flex gap-3', className)}>
      <input
        ref={ref}
        id={id}
        type="checkbox"
        className="mt-0.5 size-4 shrink-0 cursor-pointer rounded-[4px] border-input accent-[hsl(var(--accent))]"
        {...props}
      />
      <div className="space-y-0.5">
        <label htmlFor={id} className="cursor-pointer text-sm leading-snug text-foreground">
          {label}
        </label>
        {description && <p className="text-xs text-muted-foreground">{description}</p>}
      </div>
    </div>
  );
});

/**
 * Error summary shown above a failed form. Focusing it on mount takes a screen
 * reader straight to what went wrong rather than leaving them to hunt.
 */
export function ErrorSummary({ errors, title = 'Please check the following' }: { errors: string[]; title?: string }) {
  const ref = useRef<HTMLDivElement>(null);

  useEffect(() => {
    if (errors.length > 0) ref.current?.focus();
  }, [errors.length]);

  if (errors.length === 0) return null;

  return (
    <div
      ref={ref}
      tabIndex={-1}
      role="alert"
      className="rounded-[var(--radius-panel)] bg-destructive-soft p-4 text-sm text-destructive outline-none"
    >
      <p className="mb-1.5 font-semibold">{title}</p>
      <ul className="list-inside list-disc space-y-1">
        {errors.map((error) => (
          <li key={error}>{error}</li>
        ))}
      </ul>
    </div>
  );
}

/* -------------------------------------------------------------------------- */
/* Skeletons and states                                                       */
/* -------------------------------------------------------------------------- */

export function Skeleton({ className }: { className?: string }) {
  return <div className={cn('skeleton', className)} aria-hidden />;
}

export function LoadingSkeleton({ rows = 3, className }: { rows?: number; className?: string }) {
  return (
    <div className={cn('space-y-3', className)} role="status" aria-label="Loading">
      {Array.from({ length: rows }).map((_, index) => (
        <Skeleton key={index} className={cn('h-4', index === rows - 1 ? 'w-2/3' : 'w-full')} />
      ))}
      <span className="sr-only">Loading</span>
    </div>
  );
}

export interface EmptyStateProps {
  icon?: ReactNode;
  title: string;
  description?: string;
  action?: ReactNode;
  className?: string;
}

export function EmptyState({ icon, title, description, action, className }: EmptyStateProps) {
  return (
    <div
      className={cn(
        'aura flex flex-col items-center justify-center rounded-[var(--radius-card)] bg-muted/40 px-6 py-14 text-center',
        className,
      )}
    >
      {icon && (
        <div className="mb-4 flex size-12 items-center justify-center rounded-full bg-card text-muted-foreground hairline">
          {icon}
        </div>
      )}
      <p className="text-base font-semibold text-foreground">{title}</p>
      {description && <p className="mt-1.5 max-w-sm text-sm leading-relaxed text-muted-foreground">{description}</p>}
      {action && <div className="mt-6">{action}</div>}
    </div>
  );
}

/* -------------------------------------------------------------------------- */
/* Dialog                                                                     */
/* -------------------------------------------------------------------------- */

export interface DialogProps {
  open: boolean;
  onClose: () => void;
  title: string;
  description?: string;
  children?: ReactNode;
  footer?: ReactNode;
  size?: 'sm' | 'md' | 'lg';
}

/**
 * Modal dialog with the accessibility behaviour a dialog actually needs:
 * Escape closes, focus moves in on open and returns to the trigger on close,
 * Tab is trapped inside, and background scroll is locked.
 */
export function Dialog({ open, onClose, title, description, children, footer, size = 'md' }: DialogProps) {
  const panelRef = useRef<HTMLDivElement>(null);
  const previouslyFocused = useRef<HTMLElement | null>(null);
  const titleId = useId();
  const descriptionId = useId();

  useEffect(() => {
    if (!open) return;

    previouslyFocused.current = document.activeElement as HTMLElement | null;
    const { overflow } = document.body.style;
    document.body.style.overflow = 'hidden';

    const focusable = () =>
      Array.from(
        panelRef.current?.querySelectorAll<HTMLElement>(
          'a[href], button:not([disabled]), textarea, input, select, [tabindex]:not([tabindex="-1"])',
        ) ?? [],
      );

    focusable()[0]?.focus();

    const onKeyDown = (event: KeyboardEvent) => {
      if (event.key === 'Escape') {
        event.preventDefault();
        onClose();
        return;
      }
      if (event.key !== 'Tab') return;

      const elements = focusable();
      if (elements.length === 0) return;
      const first = elements[0]!;
      const last = elements[elements.length - 1]!;

      if (event.shiftKey && document.activeElement === first) {
        event.preventDefault();
        last.focus();
      } else if (!event.shiftKey && document.activeElement === last) {
        event.preventDefault();
        first.focus();
      }
    };

    document.addEventListener('keydown', onKeyDown);
    return () => {
      document.removeEventListener('keydown', onKeyDown);
      document.body.style.overflow = overflow;
      previouslyFocused.current?.focus();
    };
  }, [open, onClose]);

  if (!open) return null;

  const width = size === 'sm' ? 'max-w-md' : size === 'lg' ? 'max-w-3xl' : 'max-w-xl';

  return (
    <div className="fixed inset-0 z-50 flex items-end justify-center p-0 sm:items-center sm:p-4">
      <div
        className="absolute inset-0 bg-[hsl(224_32%_6%_/_0.55)] backdrop-blur-[2px]"
        onClick={onClose}
        aria-hidden
      />
      <div
        ref={panelRef}
        role="dialog"
        aria-modal="true"
        aria-labelledby={titleId}
        aria-describedby={description ? descriptionId : undefined}
        className={cn(
          'relative w-full rounded-t-[var(--radius-card)] bg-card shadow-[var(--shadow-lifted)] sm:rounded-[var(--radius-card)]',
          'max-h-[92dvh] overflow-y-auto scroll-slim',
          width,
        )}
      >
        <div className="flex items-start justify-between gap-4 p-6 pb-0">
          <div>
            <h2 id={titleId} className="text-h3">
              {title}
            </h2>
            {description && (
              <p id={descriptionId} className="mt-1.5 text-sm leading-relaxed text-muted-foreground">
                {description}
              </p>
            )}
          </div>
          <button
            type="button"
            onClick={onClose}
            aria-label="Close dialog"
            className="-mt-1 -mr-1 rounded-lg p-2 text-muted-foreground transition-colors hover:bg-muted hover:text-foreground"
          >
            <X className="size-4" aria-hidden />
          </button>
        </div>

        {children && <div className="p-6">{children}</div>}
        {footer && <div className="flex flex-wrap justify-end gap-3 border-t border-border p-6">{footer}</div>}
      </div>
    </div>
  );
}

export function ConfirmDialog({
  open,
  onClose,
  onConfirm,
  title,
  description,
  confirmLabel = 'Confirm',
  tone = 'primary',
  loading,
}: {
  open: boolean;
  onClose: () => void;
  onConfirm: () => void;
  title: string;
  description: string;
  confirmLabel?: string;
  tone?: 'primary' | 'destructive';
  loading?: boolean;
}) {
  return (
    <Dialog
      open={open}
      onClose={onClose}
      title={title}
      description={description}
      size="sm"
      footer={
        <>
          <Button variant="secondary" onClick={onClose} disabled={loading}>
            Cancel
          </Button>
          <Button variant={tone === 'destructive' ? 'destructive' : 'primary'} onClick={onConfirm} loading={loading}>
            {confirmLabel}
          </Button>
        </>
      }
    />
  );
}

/* -------------------------------------------------------------------------- */
/* Tabs                                                                       */
/* -------------------------------------------------------------------------- */

interface TabsContextValue {
  value: string;
  setValue: (value: string) => void;
  baseId: string;
}
const TabsContext = createContext<TabsContextValue | null>(null);

export function Tabs({
  defaultValue,
  value: controlled,
  onValueChange,
  children,
  className,
}: {
  defaultValue: string;
  value?: string;
  onValueChange?: (value: string) => void;
  children: ReactNode;
  className?: string;
}) {
  const [internal, setInternal] = useState(defaultValue);
  const baseId = useId();
  const value = controlled ?? internal;

  const setValue = (next: string) => {
    if (controlled === undefined) setInternal(next);
    onValueChange?.(next);
  };

  return (
    <TabsContext.Provider value={{ value, setValue, baseId }}>
      <div className={className}>{children}</div>
    </TabsContext.Provider>
  );
}

export function TabList({ children, className }: { children: ReactNode; className?: string }) {
  return (
    <div
      role="tablist"
      className={cn('flex gap-1 overflow-x-auto border-b border-border scroll-slim', className)}
    >
      {children}
    </div>
  );
}

export function Tab({ value, children }: { value: string; children: ReactNode }) {
  const context = useContext(TabsContext);
  if (!context) throw new Error('Tab must be used inside Tabs');
  const active = context.value === value;

  return (
    <button
      type="button"
      role="tab"
      id={`${context.baseId}-tab-${value}`}
      aria-selected={active}
      aria-controls={`${context.baseId}-panel-${value}`}
      onClick={() => context.setValue(value)}
      className={cn(
        'relative -mb-px shrink-0 border-b-2 px-4 py-2.5 text-sm font-medium transition-colors',
        active
          ? 'border-accent text-foreground'
          : 'border-transparent text-muted-foreground hover:text-foreground',
      )}
    >
      {children}
    </button>
  );
}

export function TabPanel({ value, children }: { value: string; children: ReactNode }) {
  const context = useContext(TabsContext);
  if (!context) throw new Error('TabPanel must be used inside Tabs');
  if (context.value !== value) return null;

  return (
    <div
      role="tabpanel"
      id={`${context.baseId}-panel-${value}`}
      aria-labelledby={`${context.baseId}-tab-${value}`}
      tabIndex={0}
      className="pt-6 outline-none"
    >
      {children}
    </div>
  );
}

/* -------------------------------------------------------------------------- */
/* Misc                                                                       */
/* -------------------------------------------------------------------------- */

export function Avatar({
  src,
  name,
  size = 'md',
  className,
}: {
  src?: string | null;
  name: string;
  size?: 'xs' | 'sm' | 'md' | 'lg' | 'xl';
  className?: string;
}) {
  const sizes = {
    xs: 'size-7 text-[0.625rem]',
    sm: 'size-9 text-xs',
    md: 'size-11 text-sm',
    lg: 'size-16 text-lg',
    xl: 'size-24 text-2xl',
  };

  const letters = name
    .split(/\s+/)
    .filter(Boolean)
    .slice(0, 2)
    .map((part) => part.charAt(0).toUpperCase())
    .join('');

  if (src) {
    return (
      <img
        src={src}
        alt=""
        loading="lazy"
        className={cn('shrink-0 rounded-full object-cover hairline', sizes[size], className)}
      />
    );
  }

  return (
    <div
      aria-hidden
      className={cn(
        'flex shrink-0 items-center justify-center rounded-full bg-accent-soft font-semibold text-accent select-none',
        sizes[size],
        className,
      )}
    >
      {letters}
    </div>
  );
}

export function Separator({ className }: { className?: string }) {
  return <hr className={cn('border-0 border-t border-border', className)} role="presentation" />;
}

export function Progress({ value, label }: { value: number; label?: string }) {
  const clamped = Math.min(100, Math.max(0, value));
  return (
    <div
      role="progressbar"
      aria-valuenow={Math.round(clamped)}
      aria-valuemin={0}
      aria-valuemax={100}
      aria-label={label}
      className="h-1.5 w-full overflow-hidden rounded-full bg-muted"
    >
      <div
        className="h-full rounded-full bg-accent transition-[width] duration-500 ease-[var(--ease-out-quint)]"
        style={{ width: `${clamped}%` }}
      />
    </div>
  );
}

/** Star rating. Renders as text for assistive technology, stars for everyone else. */
export function Rating({ value, count, size = 'sm' }: { value: number | null; count?: number; size?: 'sm' | 'md' }) {
  if (value === null) {
    return <span className="text-xs text-muted-foreground">No reviews yet</span>;
  }

  const starSize = size === 'md' ? 'size-4' : 'size-3.5';

  return (
    <span className="inline-flex items-center gap-1.5">
      <span className="flex" aria-hidden>
        {[1, 2, 3, 4, 5].map((star) => (
          <svg
            key={star}
            viewBox="0 0 20 20"
            className={cn(starSize, star <= Math.round(value) ? 'text-warning' : 'text-border')}
            fill="currentColor"
          >
            <path d="M10 1.5l2.6 5.3 5.9.9-4.3 4.1 1 5.8-5.2-2.7-5.2 2.7 1-5.8L1.5 7.7l5.9-.9L10 1.5z" />
          </svg>
        ))}
      </span>
      <span className="tabular text-xs font-medium text-foreground">{value.toFixed(1)}</span>
      {count !== undefined && <span className="text-xs text-muted-foreground">({count})</span>}
      <span className="sr-only">
        {value.toFixed(1)} out of 5
        {count !== undefined ? ` from ${count} review${count === 1 ? '' : 's'}` : ''}
      </span>
    </span>
  );
}

export function Kbd({ children }: { children: ReactNode }) {
  return (
    <kbd className="inline-flex h-5 min-w-5 items-center justify-center rounded border border-border bg-muted px-1.5 font-sans text-[0.6875rem] font-medium text-muted-foreground">
      {children}
    </kbd>
  );
}

export function InlineCheck({ children }: { children: ReactNode }) {
  return (
    <span className="inline-flex items-center gap-2 text-sm text-muted-foreground">
      <Check className="size-4 shrink-0 text-success" aria-hidden />
      {children}
    </span>
  );
}
