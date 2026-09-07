import { useState } from 'react';
import { DateTime } from 'luxon';

/**
 * Local state for a month calendar's anchor, seeded to the current month in the
 * given zone and formatted as `YYYY-MM-01`.
 *
 * A separate module from `BookingCalendar` so that file exports only components
 * and keeps React Fast Refresh; a hook alongside them would disable it for the
 * whole calendar.
 */
export function useCalendarMonth(timezone: string): [string, (month: string) => void] {
  const [month, setMonth] = useState(() => DateTime.now().setZone(timezone).toFormat('yyyy-MM-01'));
  return [month, setMonth];
}
