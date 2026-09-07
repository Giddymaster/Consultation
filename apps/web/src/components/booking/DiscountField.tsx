import { BadgeCheck, X } from 'lucide-react';
import { Button, Input } from '@/components/ui';
import { money } from '@/lib/utils';

/**
 * The discount code entry on the booking summary.
 *
 * Deliberately not part of the step flow: a code is optional, and putting it on
 * its own step would ask every client whether they have one. It sits with the
 * price, where someone who has a code is already looking.
 *
 * The figure shown here comes from the server's preview. It is a *quote*, and
 * the booking request sends only the code — the amount charged is recalculated
 * at checkout from the same rule.
 */

export interface DiscountFieldProps {
  code: string;
  onCodeChange: (code: string) => void;
  applied: { code: string; amount: number } | null;
  error: string | null;
  currency: string;
  busy: boolean;
  onApply: () => void;
  onClear: () => void;
  /** Hidden until a duration is chosen; there is no price to discount before that. */
  disabled?: boolean;
}

export function DiscountField({
  code,
  onCodeChange,
  applied,
  error,
  currency,
  busy,
  onApply,
  onClear,
  disabled,
}: DiscountFieldProps) {
  if (applied) {
    return (
      <div className="mt-4 flex items-center justify-between gap-3 rounded-[var(--radius-control)] bg-success-soft px-3.5 py-2.5">
        <span className="flex min-w-0 items-center gap-2 text-sm text-success">
          <BadgeCheck className="size-4 shrink-0" aria-hidden />
          <span className="tabular truncate font-medium">{applied.code}</span>
          <span className="shrink-0">−{money(applied.amount, currency)}</span>
        </span>
        <button
          type="button"
          onClick={onClear}
          aria-label={`Remove discount code ${applied.code}`}
          className="shrink-0 rounded-md p-1 text-success/70 transition-colors hover:bg-success/10 hover:text-success"
        >
          <X className="size-4" aria-hidden />
        </button>
      </div>
    );
  }

  return (
    <div className="mt-4">
      <div className="flex gap-2">
        <Input
          value={code}
          onChange={(event) => onCodeChange(event.target.value)}
          placeholder="Discount code"
          aria-label="Discount code"
          disabled={disabled}
          invalid={Boolean(error)}
          className="tabular uppercase"
          onKeyDown={(event) => {
            if (event.key !== 'Enter') return;
            // The summary sits inside the booking form; Enter here must not
            // submit the booking.
            event.preventDefault();
            if (code.trim()) onApply();
          }}
        />
        <Button
          type="button"
          variant="secondary"
          loading={busy}
          disabled={disabled || !code.trim()}
          onClick={onApply}
        >
          Apply
        </Button>
      </div>

      {error && (
        <p role="alert" className="mt-1.5 text-xs font-medium text-destructive">
          {error}
        </p>
      )}
    </div>
  );
}
