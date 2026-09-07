import { useMemo } from 'react';
import { DateTime } from 'luxon';
import { ChevronLeft, ChevronRight, Loader2 } from 'lucide-react';
import type { AvailabilityResponse, DayAvailability, TimeSlot } from '@meridian/types';
import { cn, formatDuration } from '@/lib/utils';

/**
 * Month calendar for slot selection.
 *
 * Day states are visually and semantically distinct: available, fully booked,
 * outside availability, today, and selected. "Fully booked" is deliberately
 * different from "not working" — a client should be able to tell whether a
 * consultant works Fridays at all, or simply has no room this Friday.
 *
 * The grid never reports availability of its own: `days` comes from the server,
 * which is the only thing that knows what is bookable.
 */

export interface BookingCalendarProps {
  availability: AvailabilityResponse | undefined;
  loading: boolean;
  selectedDate: string | null;
  onSelectDate: (date: string) => void;
  /** Anchor month, `YYYY-MM-01`. Controlled so the parent can refetch a window. */
  month: string;
  onMonthChange: (month: string) => void;
  timezone: string;
  minDate?: string;
  maxDate?: string;
}

const WEEKDAY_LABELS = ['Mon', 'Tue', 'Wed', 'Thu', 'Fri', 'Sat', 'Sun'];

export function BookingCalendar({
  availability,
  loading,
  selectedDate,
  onSelectDate,
  month,
  onMonthChange,
  timezone,
  minDate,
  maxDate,
}: BookingCalendarProps) {
  const anchor = DateTime.fromISO(month, { zone: timezone });
  const today = DateTime.now().setZone(timezone).startOf('day');

  const dayMap = useMemo(() => {
    const map = new Map<string, DayAvailability>();
    for (const day of availability?.days ?? []) map.set(day.date, day);
    return map;
  }, [availability]);

  // A leading offset so the first of the month lands under the right weekday.
  const grid = useMemo(() => {
    const start = anchor.startOf('month');
    const end = anchor.endOf('month');
    const leading = (start.weekday + 6) % 7;

    const cells: (DateTime | null)[] = Array.from({ length: leading }, () => null);
    for (let day = 1; day <= end.day; day += 1) {
      cells.push(start.set({ day }));
    }
    while (cells.length % 7 !== 0) cells.push(null);
    return cells;
  }, [anchor]);

  const canGoBack = anchor.startOf('month') > today.startOf('month');
  const maxMonth = maxDate ? DateTime.fromISO(maxDate, { zone: timezone }).startOf('month') : null;
  const canGoForward = !maxMonth || anchor.startOf('month') < maxMonth;

  return (
    <div>
      <div className="mb-5 flex items-center justify-between">
        <h3 className="text-[0.9375rem] font-semibold">{anchor.toFormat('LLLL yyyy')}</h3>

        <div className="flex items-center gap-1">
          {loading && <Loader2 className="mr-1.5 size-3.5 animate-spin text-muted-foreground" aria-hidden />}
          <button
            type="button"
            onClick={() => onMonthChange(anchor.minus({ months: 1 }).toFormat('yyyy-MM-01'))}
            disabled={!canGoBack}
            aria-label="Previous month"
            className="inline-flex size-8 items-center justify-center rounded-[var(--radius-control)] text-muted-foreground transition-colors hover:bg-muted hover:text-foreground disabled:pointer-events-none disabled:opacity-35"
          >
            <ChevronLeft className="size-4" aria-hidden />
          </button>
          <button
            type="button"
            onClick={() => onMonthChange(anchor.plus({ months: 1 }).toFormat('yyyy-MM-01'))}
            disabled={!canGoForward}
            aria-label="Next month"
            className="inline-flex size-8 items-center justify-center rounded-[var(--radius-control)] text-muted-foreground transition-colors hover:bg-muted hover:text-foreground disabled:pointer-events-none disabled:opacity-35"
          >
            <ChevronRight className="size-4" aria-hidden />
          </button>
        </div>
      </div>

      <div className="grid grid-cols-7 gap-1" role="grid" aria-label="Choose a date">
        {WEEKDAY_LABELS.map((label) => (
          <div
            key={label}
            role="columnheader"
            className="pb-2 text-center text-[0.6875rem] font-medium text-muted-foreground"
          >
            <span aria-hidden>{label.charAt(0)}</span>
            <span className="sr-only">{label}</span>
          </div>
        ))}

        {grid.map((date, index) => {
          if (!date) return <div key={`empty-${index}`} role="gridcell" />;

          const iso = date.toISODate()!;
          const day = dayMap.get(iso);
          const isPast = date < today;
          const beforeMin = minDate ? iso < minDate : false;
          const afterMax = maxDate ? iso > maxDate : false;
          const isToday = date.hasSame(today, 'day');
          const isSelected = selectedDate === iso;

          const available = Boolean(day?.hasAvailability) && !isPast && !beforeMin && !afterMax;
          const fullyBooked = Boolean(day?.isFullyBooked) && !isPast;

          const stateLabel = available
            ? `${day?.slots.length} time${day?.slots.length === 1 ? '' : 's'} available`
            : fullyBooked
              ? 'fully booked'
              : 'unavailable';

          return (
            <div key={iso} role="gridcell">
              <button
                type="button"
                disabled={!available}
                onClick={() => onSelectDate(iso)}
                aria-label={`${date.toFormat('cccc d LLLL')} — ${stateLabel}`}
                aria-current={isToday ? 'date' : undefined}
                aria-pressed={isSelected}
                className={cn(
                  'relative flex aspect-square w-full flex-col items-center justify-center rounded-[var(--radius-control)] text-sm font-medium',
                  'transition-[background-color,color,transform] duration-200 ease-[var(--ease-out-quint)]',
                  isSelected && 'scale-[1.04] bg-accent text-accent-foreground shadow-[var(--shadow-raised)] motion-reduce:scale-100',
                  !isSelected && available && 'bg-muted/70 text-foreground hover:bg-accent-soft hover:text-accent',
                  !isSelected && !available && fullyBooked && 'text-muted-foreground/50 line-through',
                  !isSelected && !available && !fullyBooked && 'text-muted-foreground/30',
                  !available && 'cursor-not-allowed',
                )}
              >
                <span className="tabular">{date.day}</span>

                {/* Availability dot: a second, non-colour cue so the state does
                    not rely on colour perception alone. */}
                {available && !isSelected && (
                  <span className="absolute bottom-1.5 size-1 rounded-full bg-accent" aria-hidden />
                )}
                {isToday && !isSelected && (
                  <span className="absolute inset-x-2 bottom-0.5 h-px bg-foreground/40" aria-hidden />
                )}
              </button>
            </div>
          );
        })}
      </div>

      <ul className="mt-5 flex flex-wrap gap-x-4 gap-y-2 text-[0.6875rem] text-muted-foreground">
        <li className="flex items-center gap-1.5">
          <span className="size-2 rounded-full bg-accent" aria-hidden /> Available
        </li>
        <li className="flex items-center gap-1.5">
          <span className="size-2 rounded-full bg-muted-foreground/40" aria-hidden /> Fully booked
        </li>
        <li className="flex items-center gap-1.5">
          <span className="size-2 rounded-full bg-border" aria-hidden /> Unavailable
        </li>
      </ul>
    </div>
  );
}

/* -------------------------------------------------------------------------- */
/* Time slot picker                                                           */
/* -------------------------------------------------------------------------- */

export interface TimeSlotPickerProps {
  slots: TimeSlot[];
  selected: string | null;
  onSelect: (startAt: string) => void;
  loading?: boolean;
  timezone: string;
  durationMinutes: number;
}

/**
 * Slots are grouped into morning/afternoon/evening. A flat list of twenty
 * times is hard to scan; the grouping matches how people actually think about
 * their day.
 */
export function TimeSlotPicker({
  slots,
  selected,
  onSelect,
  loading,
  timezone,
  durationMinutes,
}: TimeSlotPickerProps) {
  const groups = useMemo(() => {
    const morning: TimeSlot[] = [];
    const afternoon: TimeSlot[] = [];
    const evening: TimeSlot[] = [];

    for (const slot of slots) {
      const hour = DateTime.fromISO(slot.startAt).setZone(timezone).hour;
      if (hour < 12) morning.push(slot);
      else if (hour < 17) afternoon.push(slot);
      else evening.push(slot);
    }

    return [
      { label: 'Morning', slots: morning },
      { label: 'Afternoon', slots: afternoon },
      { label: 'Evening', slots: evening },
    ].filter((group) => group.slots.length > 0);
  }, [slots, timezone]);

  if (loading) {
    return (
      <div className="grid grid-cols-3 gap-2 sm:grid-cols-4">
        {Array.from({ length: 8 }).map((_, index) => (
          <div key={index} className="skeleton h-10" aria-hidden />
        ))}
        <span className="sr-only">Loading available times</span>
      </div>
    );
  }

  if (slots.length === 0) {
    return (
      <p className="rounded-[var(--radius-panel)] bg-muted/60 px-4 py-8 text-center text-sm text-muted-foreground">
        No times available on this date. Try another day.
      </p>
    );
  }

  return (
    <div className="space-y-5">
      <p className="text-xs text-muted-foreground">
        Times shown in {timezone.replace(/_/g, ' ')} · each session runs {formatDuration(durationMinutes)}
      </p>

      {groups.map((group) => (
        <fieldset key={group.label}>
          <legend className="mb-2.5 text-eyebrow uppercase text-muted-foreground">{group.label}</legend>
          <div className="grid grid-cols-3 gap-2 sm:grid-cols-4">
            {group.slots.map((slot) => {
              const isSelected = selected === slot.startAt;
              return (
                <button
                  key={slot.startAt}
                  type="button"
                  onClick={() => onSelect(slot.startAt)}
                  aria-pressed={isSelected}
                  className={cn(
                    'tabular rounded-[var(--radius-control)] px-2 py-2.5 text-sm font-medium',
                    'transition-[background-color,color,box-shadow,transform] duration-200 ease-[var(--ease-out-quint)]',
                    isSelected
                      ? 'scale-[1.03] bg-accent text-accent-foreground shadow-[var(--shadow-raised)] motion-reduce:scale-100'
                      : 'bg-muted/70 text-foreground hover:bg-accent-soft hover:text-accent',
                  )}
                >
                  {slot.label}
                </button>
              );
            })}
          </div>
        </fieldset>
      ))}
    </div>
  );
}
