import { DateTime } from 'luxon';
import { prisma } from '../../lib/prisma.js';
import { integrationFailure, integrationNotConnected } from '../../lib/errors.js';
import { logger } from '../../lib/logger.js';
import { integrationsConfigured } from '../../config/env.js';
import { connectionFor, getAccessToken } from '../oauth/token-store.js';
import type {
  CreateMeetingArgs,
  MeetingDetails,
  UpdateMeetingArgs,
  VideoMeetingProvider,
} from './types.js';

/**
 * Microsoft Teams, via Microsoft Graph.
 *
 * Deliberately implemented as a **calendar event with Teams enabled**
 * (`isOnlineMeeting: true`, `onlineMeetingProvider: "teamsForBusiness"`) rather
 * than through the standalone `/onlineMeetings` endpoint.
 *
 * The reason: a standalone online meeting produces a join URL but never appears
 * in the consultant's Outlook calendar, so the consultation would be invisible
 * to the person hosting it and would not block their availability. Creating the
 * event gives us both the Teams link and the calendar entry in a single call —
 * which is also why this provider stores the calendar event id as its meeting
 * identifier.
 */

const GRAPH_API = 'https://graph.microsoft.com/v1.0';

interface GraphEvent {
  id: string;
  webLink?: string;
  iCalUId?: string;
  start?: { dateTime: string; timeZone: string };
  end?: { dateTime: string; timeZone: string };
  onlineMeeting?: {
    joinUrl?: string;
    conferenceId?: string;
    tollNumber?: string;
  } | null;
}

async function resolveConnection(consultantId: string): Promise<{ connectionId: string; calendarId: string | null }> {
  const connection = await connectionFor(consultantId, 'MICROSOFT');
  if (!connection) throw integrationNotConnected('Microsoft Teams');
  return { connectionId: connection.id, calendarId: connection.calendarId };
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
    logger.error({ path, status: response.status, detail: detail.slice(0, 400) }, 'Microsoft Graph request failed');
    throw integrationFailure('Microsoft Teams');
  }

  return (await response.json()) as T;
}

/**
 * Graph wants a naked local datetime plus a separate timeZone field — an
 * offset-bearing ISO string is rejected or silently misread.
 */
function graphDateTime(instant: Date, timezone: string): { dateTime: string; timeZone: string } {
  return {
    dateTime: DateTime.fromJSDate(instant, { zone: timezone }).toFormat("yyyy-MM-dd'T'HH:mm:ss"),
    timeZone: timezone,
  };
}

function toDetails(event: GraphEvent, startAt: Date, durationMinutes: number): MeetingDetails {
  const joinUrl = event.onlineMeeting?.joinUrl;
  if (!joinUrl) {
    // The event exists but Teams did not attach a meeting — usually a licensing
    // problem. Surfaced as a failure rather than a booking with no way to join.
    logger.error({ eventId: event.id }, 'Graph event created without a Teams join URL');
    throw integrationFailure('Microsoft Teams');
  }

  return {
    provider: 'MICROSOFT_TEAMS',
    // The calendar event id: what both reschedule and cancel address.
    externalMeetingId: event.id,
    joinUrl,
    hostUrl: null,
    passcode: event.onlineMeeting?.conferenceId ?? null,
    dialInNumber: event.onlineMeeting?.tollNumber ?? null,
    startTime: startAt,
    endTime: new Date(startAt.getTime() + durationMinutes * 60_000),
  };
}

function eventPath(calendarId: string | null, eventId?: string): string {
  const base = calendarId ? `/me/calendars/${encodeURIComponent(calendarId)}/events` : '/me/events';
  return eventId ? `${base}/${encodeURIComponent(eventId)}` : base;
}

export const teamsProvider: VideoMeetingProvider = {
  provider: 'MICROSOFT_TEAMS',
  name: 'Microsoft Teams',

  isConfigured: () => integrationsConfigured.microsoft,

  async createMeeting(args: CreateMeetingArgs): Promise<MeetingDetails> {
    if (!integrationsConfigured.microsoft) throw integrationNotConnected('Microsoft Teams');

    const booking = await prisma.booking.findUnique({
      where: { id: args.bookingId },
      select: { consultantId: true },
    });
    if (!booking) throw integrationNotConnected('Microsoft Teams');

    const { connectionId, calendarId } = await resolveConnection(booking.consultantId);
    const endAt = new Date(args.startAt.getTime() + args.durationMinutes * 60_000);

    const event = await graphRequest<GraphEvent>(connectionId, eventPath(calendarId), {
      method: 'POST',
      body: {
        subject: args.topic.slice(0, 255),
        body: {
          contentType: 'HTML',
          content: args.agenda ?? `Consultation ${args.bookingReference}`,
        },
        start: graphDateTime(args.startAt, args.timezone),
        end: graphDateTime(endAt, args.timezone),
        attendees: [
          {
            emailAddress: { address: args.attendeeEmail, name: args.attendeeName },
            type: 'required',
          },
        ],
        isOnlineMeeting: true,
        onlineMeetingProvider: 'teamsForBusiness',
        // Graph deduplicates on transactionId, so a retried create after a
        // timeout cannot leave two calendar events for one booking.
        transactionId: args.bookingId,
      },
    });

    if (!event) throw integrationFailure('Microsoft Teams');
    return toDetails(event, args.startAt, args.durationMinutes);
  },

  async updateMeeting(args: UpdateMeetingArgs): Promise<MeetingDetails> {
    if (!integrationsConfigured.microsoft) throw integrationNotConnected('Microsoft Teams');

    const meeting = await prisma.videoMeeting.findFirst({
      where: { externalMeetingId: args.externalMeetingId },
      select: { booking: { select: { consultantId: true } } },
    });
    if (!meeting) throw integrationFailure('Microsoft Teams');

    const { connectionId, calendarId } = await resolveConnection(meeting.booking.consultantId);
    const endAt = new Date(args.startAt.getTime() + args.durationMinutes * 60_000);

    const event = await graphRequest<GraphEvent>(
      connectionId,
      eventPath(calendarId, args.externalMeetingId),
      {
        method: 'PATCH',
        body: {
          start: graphDateTime(args.startAt, args.timezone),
          end: graphDateTime(endAt, args.timezone),
          ...(args.topic ? { subject: args.topic.slice(0, 255) } : {}),
        },
      },
    );

    if (!event) throw integrationFailure('Microsoft Teams');
    return toDetails(event, args.startAt, args.durationMinutes);
  },

  async cancelMeeting(externalMeetingId: string): Promise<void> {
    if (!integrationsConfigured.microsoft) return;

    const meeting = await prisma.videoMeeting.findFirst({
      where: { externalMeetingId },
      select: { booking: { select: { consultantId: true } } },
    });
    if (!meeting) return;

    const { connectionId, calendarId } = await resolveConnection(meeting.booking.consultantId);
    await graphRequest(connectionId, eventPath(calendarId, externalMeetingId), { method: 'DELETE' });
  },

  async getMeeting(externalMeetingId: string): Promise<MeetingDetails | null> {
    if (!integrationsConfigured.microsoft) return null;

    const meeting = await prisma.videoMeeting.findFirst({
      where: { externalMeetingId },
      select: { booking: { select: { consultantId: true, durationMinutes: true } }, startTime: true },
    });
    if (!meeting) return null;

    const connection = await connectionFor(meeting.booking.consultantId, 'MICROSOFT');
    if (!connection) return null;

    const event = await graphRequest<GraphEvent>(
      connection.id,
      eventPath(connection.calendarId, externalMeetingId),
      { method: 'GET' },
    );
    if (!event) return null;

    return toDetails(event, meeting.startTime ?? new Date(), meeting.booking.durationMinutes);
  },
};
