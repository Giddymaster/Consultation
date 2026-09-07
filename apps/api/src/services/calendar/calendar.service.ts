import { DateTime } from 'luxon';
import type { CalendarProvider } from '@meridian/types';
import { prisma } from '../../lib/prisma.js';
import { logger } from '../../lib/logger.js';
import { integrationsConfigured, env } from '../../config/env.js';
import { integrationFailure } from '../../lib/errors.js';
import { connectionFor, getAccessToken, markConnectionError } from '../oauth/token-store.js';

/**
 * Calendar synchronisation.
 *
 * Two directions:
 *   • **Outbound** — a confirmed consultation becomes an event on the
 *     consultant's connected calendar, updated on reschedule and removed on
 *     cancellation.
 *   • **Inbound** — busy periods are mirrored into `calendar_busy_blocks` so
 *     availability computation can subtract a consultant's existing commitments
 *     without calling the provider on every page load.
 *
 * A consultant with no connected calendar is a supported state, not an error:
 * every function here returns quietly rather than throwing.
 */

const GOOGLE_CALENDAR_API = 'https://www.googleapis.com/calendar/v3';
const GRAPH_API = 'https://graph.microsoft.com/v1.0';

interface EventPayload {
  summary: string;
  description: string;
  startAt: Date;
  endAt: Date;
  timezone: string;
  attendeeEmail: string;
  attendeeName: string;
}

/* -------------------------------------------------------------------------- */
/* Outbound                                                                   */
/* -------------------------------------------------------------------------- */

export async function createCalendarEvent(bookingId: string): Promise<void> {
  const booking = await prisma.booking.findUnique({
    where: { id: bookingId },
    include: {
      service: { select: { name: true } },
      client: { select: { user: { select: { email: true, firstName: true, lastName: true } } } },
      consultant: { select: { id: true } },
      videoMeeting: { select: { joinUrl: true, provider: true } },
      calendarEvents: { select: { id: true, provider: true } },
    },
  });
  if (!booking) return;

  const clientUser = booking.client.user;
  const joinLine = booking.videoMeeting?.joinUrl
    ? `\n\nJoin: ${booking.videoMeeting.joinUrl}`
    : '';

  const payload: EventPayload = {
    summary: `${booking.service.name} — ${clientUser.firstName} ${clientUser.lastName}`,
    description: [
      `Consultation reference ${booking.reference}.`,
      booking.objective ? `\n\nClient objective:\n${booking.objective}` : '',
      joinLine,
      `\n\nManage: ${env.APP_URL}/consultant/sessions?booking=${booking.id}`,
    ].join(''),
    startAt: booking.startAt,
    endAt: booking.endAt,
    timezone: booking.timezone,
    attendeeEmail: clientUser.email,
    attendeeName: `${clientUser.firstName} ${clientUser.lastName}`,
  };

  for (const provider of ['GOOGLE', 'MICROSOFT'] as CalendarProvider[]) {
    // Teams meetings already *are* an Outlook event, created by the video
    // provider. Writing a second one would double-book the consultant.
    if (provider === 'MICROSOFT' && booking.videoMeeting?.provider === 'MICROSOFT_TEAMS') continue;

    const connection = await connectionFor(booking.consultant.id, provider);
    if (!connection) continue;

    // Idempotent: an event already recorded for this provider is left alone.
    if (booking.calendarEvents.some((event) => event.provider === provider)) continue;

    try {
      const created =
        provider === 'GOOGLE'
          ? await createGoogleEvent(connection.id, connection.calendarId, payload)
          : await createMicrosoftEvent(connection.id, connection.calendarId, payload);

      await prisma.calendarEvent.create({
        data: {
          bookingId: booking.id,
          connectionId: connection.id,
          provider,
          externalEventId: created.id,
          htmlLink: created.htmlLink ?? null,
          iCalUid: created.iCalUid ?? null,
        },
      });
    } catch (error) {
      const message = error instanceof Error ? error.message : 'Calendar event creation failed';
      logger.warn({ err: error, bookingId, provider }, 'Could not create calendar event');
      await markConnectionError(connection.id, message);
    }
  }
}

export async function updateCalendarEvent(bookingId: string): Promise<void> {
  const booking = await prisma.booking.findUnique({
    where: { id: bookingId },
    include: {
      service: { select: { name: true } },
      client: { select: { user: { select: { email: true, firstName: true, lastName: true } } } },
      calendarEvents: { include: { connection: { select: { id: true, calendarId: true } } } },
    },
  });
  if (!booking) return;

  for (const event of booking.calendarEvents) {
    try {
      if (event.provider === 'GOOGLE') {
        await googleRequest(event.connection.id, `/calendars/${calendarPath(event.connection.calendarId)}/events/${encodeURIComponent(event.externalEventId)}`, {
          method: 'PATCH',
          body: {
            start: { dateTime: booking.startAt.toISOString(), timeZone: booking.timezone },
            end: { dateTime: booking.endAt.toISOString(), timeZone: booking.timezone },
          },
        });
      } else {
        await graphRequest(event.connection.id, microsoftEventPath(event.connection.calendarId, event.externalEventId), {
          method: 'PATCH',
          body: {
            start: graphDateTime(booking.startAt, booking.timezone),
            end: graphDateTime(booking.endAt, booking.timezone),
          },
        });
      }
    } catch (error) {
      logger.warn({ err: error, bookingId, provider: event.provider }, 'Could not update calendar event');
      await prisma.calendarEvent.update({
        where: { id: event.id },
        data: { lastError: error instanceof Error ? error.message.slice(0, 1000) : 'Update failed' },
      });
    }
  }
}

export async function deleteCalendarEvent(bookingId: string): Promise<void> {
  const events = await prisma.calendarEvent.findMany({
    where: { bookingId },
    include: { connection: { select: { id: true, calendarId: true } } },
  });

  for (const event of events) {
    try {
      if (event.provider === 'GOOGLE') {
        await googleRequest(
          event.connection.id,
          `/calendars/${calendarPath(event.connection.calendarId)}/events/${encodeURIComponent(event.externalEventId)}`,
          { method: 'DELETE' },
        );
      } else {
        await graphRequest(
          event.connection.id,
          microsoftEventPath(event.connection.calendarId, event.externalEventId),
          { method: 'DELETE' },
        );
      }
      await prisma.calendarEvent.delete({ where: { id: event.id } });
    } catch (error) {
      logger.warn({ err: error, bookingId }, 'Could not delete calendar event');
    }
  }
}

/* -------------------------------------------------------------------------- */
/* Inbound busy-period mirroring                                              */
/* -------------------------------------------------------------------------- */

/**
 * Refreshes a consultant's mirrored busy periods. Replaces the window wholesale
 * rather than merging, so an appointment deleted in the provider disappears
 * here too.
 */
export async function syncBusyPeriods(consultantId: string, daysAhead = 60): Promise<number> {
  const windowStart = new Date();
  const windowEnd = new Date(Date.now() + daysAhead * 86_400_000);
  let total = 0;

  for (const provider of ['GOOGLE', 'MICROSOFT'] as CalendarProvider[]) {
    const connection = await connectionFor(consultantId, provider);
    if (!connection) continue;

    try {
      const busy =
        provider === 'GOOGLE'
          ? await fetchGoogleBusy(connection.id, connection.calendarId, windowStart, windowEnd)
          : await fetchMicrosoftBusy(connection.id, windowStart, windowEnd);

      await prisma.$transaction(async (tx) => {
        await tx.calendarBusyBlock.deleteMany({
          where: { connectionId: connection.id, startAt: { gte: windowStart }, endAt: { lte: windowEnd } },
        });
        if (busy.length > 0) {
          await tx.calendarBusyBlock.createMany({
            data: busy.map((block) => ({
              connectionId: connection.id,
              consultantId,
              startAt: block.start,
              endAt: block.end,
            })),
          });
        }
      });

      await prisma.calendarConnection.update({
        where: { id: connection.id },
        data: { lastSyncedAt: new Date(), lastError: null },
      });

      total += busy.length;
    } catch (error) {
      const message = error instanceof Error ? error.message : 'Busy period sync failed';
      logger.warn({ err: error, consultantId, provider }, 'Calendar busy sync failed');
      await markConnectionError(connection.id, message);
    }
  }

  return total;
}

/* -------------------------------------------------------------------------- */
/* Google                                                                     */
/* -------------------------------------------------------------------------- */

function calendarPath(calendarId: string | null): string {
  return encodeURIComponent(calendarId ?? 'primary');
}

async function googleRequest<T>(
  connectionId: string,
  path: string,
  init: { method: 'GET' | 'POST' | 'PATCH' | 'DELETE'; body?: unknown },
): Promise<T | null> {
  const token = await getAccessToken(connectionId);
  const response = await fetch(`${GOOGLE_CALENDAR_API}${path}`, {
    method: init.method,
    headers: { Authorization: `Bearer ${token}`, 'Content-Type': 'application/json' },
    body: init.body ? JSON.stringify(init.body) : undefined,
  });

  if (response.status === 204 || response.status === 404 || response.status === 410) return null;
  if (!response.ok) {
    const detail = await response.text();
    logger.error({ path, status: response.status, detail: detail.slice(0, 300) }, 'Google Calendar request failed');
    throw integrationFailure('Google Calendar');
  }
  return (await response.json()) as T;
}

async function createGoogleEvent(
  connectionId: string,
  calendarId: string | null,
  payload: EventPayload,
): Promise<{ id: string; htmlLink?: string; iCalUid?: string }> {
  const event = await googleRequest<{ id: string; htmlLink?: string; iCalUID?: string }>(
    connectionId,
    `/calendars/${calendarPath(calendarId)}/events?sendUpdates=all`,
    {
      method: 'POST',
      body: {
        summary: payload.summary,
        description: payload.description,
        start: { dateTime: payload.startAt.toISOString(), timeZone: payload.timezone },
        end: { dateTime: payload.endAt.toISOString(), timeZone: payload.timezone },
        attendees: [{ email: payload.attendeeEmail, displayName: payload.attendeeName }],
        reminders: {
          useDefault: false,
          overrides: [
            { method: 'email', minutes: 24 * 60 },
            { method: 'popup', minutes: 15 },
          ],
        },
      },
    },
  );

  if (!event) throw integrationFailure('Google Calendar');
  return { id: event.id, htmlLink: event.htmlLink, iCalUid: event.iCalUID };
}

async function fetchGoogleBusy(
  connectionId: string,
  calendarId: string | null,
  from: Date,
  to: Date,
): Promise<{ start: Date; end: Date }[]> {
  const token = await getAccessToken(connectionId);
  const response = await fetch(`${GOOGLE_CALENDAR_API}/freeBusy`, {
    method: 'POST',
    headers: { Authorization: `Bearer ${token}`, 'Content-Type': 'application/json' },
    body: JSON.stringify({
      timeMin: from.toISOString(),
      timeMax: to.toISOString(),
      items: [{ id: calendarId ?? 'primary' }],
    }),
  });

  if (!response.ok) throw integrationFailure('Google Calendar');

  const body = (await response.json()) as {
    calendars?: Record<string, { busy?: { start: string; end: string }[] }>;
  };

  const entries = Object.values(body.calendars ?? {}).flatMap((cal) => cal.busy ?? []);
  return entries.map((block) => ({ start: new Date(block.start), end: new Date(block.end) }));
}

/* -------------------------------------------------------------------------- */
/* Microsoft                                                                  */
/* -------------------------------------------------------------------------- */

function graphDateTime(instant: Date, timezone: string): { dateTime: string; timeZone: string } {
  return {
    dateTime: DateTime.fromJSDate(instant, { zone: timezone }).toFormat("yyyy-MM-dd'T'HH:mm:ss"),
    timeZone: timezone,
  };
}

function microsoftEventPath(calendarId: string | null, eventId?: string): string {
  const base = calendarId ? `/me/calendars/${encodeURIComponent(calendarId)}/events` : '/me/events';
  return eventId ? `${base}/${encodeURIComponent(eventId)}` : base;
}

async function graphRequest<T>(
  connectionId: string,
  path: string,
  init: { method: 'GET' | 'POST' | 'PATCH' | 'DELETE'; body?: unknown },
): Promise<T | null> {
  const token = await getAccessToken(connectionId);
  const response = await fetch(`${GRAPH_API}${path}`, {
    method: init.method,
    headers: { Authorization: `Bearer ${token}`, 'Content-Type': 'application/json' },
    body: init.body ? JSON.stringify(init.body) : undefined,
  });

  if (response.status === 204 || response.status === 404) return null;
  if (!response.ok) {
    const detail = await response.text();
    logger.error({ path, status: response.status, detail: detail.slice(0, 300) }, 'Microsoft Graph calendar request failed');
    throw integrationFailure('Microsoft Calendar');
  }
  return (await response.json()) as T;
}

async function createMicrosoftEvent(
  connectionId: string,
  calendarId: string | null,
  payload: EventPayload,
): Promise<{ id: string; htmlLink?: string; iCalUid?: string }> {
  const event = await graphRequest<{ id: string; webLink?: string; iCalUId?: string }>(
    connectionId,
    microsoftEventPath(calendarId),
    {
      method: 'POST',
      body: {
        subject: payload.summary,
        body: { contentType: 'HTML', content: payload.description.replace(/\n/g, '<br />') },
        start: graphDateTime(payload.startAt, payload.timezone),
        end: graphDateTime(payload.endAt, payload.timezone),
        attendees: [
          {
            emailAddress: { address: payload.attendeeEmail, name: payload.attendeeName },
            type: 'required',
          },
        ],
      },
    },
  );

  if (!event) throw integrationFailure('Microsoft Calendar');
  return { id: event.id, htmlLink: event.webLink, iCalUid: event.iCalUId };
}

async function fetchMicrosoftBusy(
  connectionId: string,
  from: Date,
  to: Date,
): Promise<{ start: Date; end: Date }[]> {
  const view = await graphRequest<{ value?: { start: { dateTime: string }; end: { dateTime: string }; showAs?: string }[] }>(
    connectionId,
    `/me/calendarView?startDateTime=${from.toISOString()}&endDateTime=${to.toISOString()}&$top=250&$select=start,end,showAs`,
    { method: 'GET' },
  );

  return (view?.value ?? [])
    // "free" and tentative entries should not block a consultation.
    .filter((event) => event.showAs !== 'free')
    .map((event) => ({
      // Graph returns UTC in calendarView unless a Prefer header asks otherwise.
      start: new Date(`${event.start.dateTime}Z`),
      end: new Date(`${event.end.dateTime}Z`),
    }));
}

export function calendarProvidersConfigured(): { google: boolean; microsoft: boolean } {
  return { google: integrationsConfigured.google, microsoft: integrationsConfigured.microsoft };
}
