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
 * Google Meet, via the Meet REST API (v2 spaces).
 *
 * Two points the Google documentation is explicit about, and this file honours:
 *
 *   • A space is created with an empty body — the API does not accept a start
 *     time. The consultation's schedule lives on the calendar event that
 *     accompanies it, created separately by the calendar service.
 *
 *   • `meetingCode` must NOT be treated as a durable identifier: Google
 *     documents that it can be dissociated from a space and reused, and that
 *     it expires roughly 365 days after last use. So the stable `name`
 *     (`spaces/<id>`) is what gets stored as externalMeetingId.
 */

const MEET_API = 'https://meet.googleapis.com/v2';

interface MeetSpace {
  name: string;
  meetingUri?: string;
  meetingCode?: string;
}

/**
 * Resolves the Google connection to act through. Meet spaces are created in
 * the consultant's own Google account so the meeting belongs to the person
 * hosting it.
 */
async function resolveConnection(bookingId: string): Promise<{ connectionId: string }> {
  const booking = await prisma.booking.findUnique({
    where: { id: bookingId },
    select: { consultantId: true },
  });
  if (!booking) throw integrationNotConnected('Google Meet');

  const connection = await connectionFor(booking.consultantId, 'GOOGLE');
  if (!connection) throw integrationNotConnected('Google Meet');
  return { connectionId: connection.id };
}

async function meetRequest<T>(
  connectionId: string,
  path: string,
  init: { method: 'GET' | 'POST' | 'PATCH'; body?: unknown },
): Promise<T | null> {
  const token = await getAccessToken(connectionId);

  const response = await fetch(`${MEET_API}${path}`, {
    method: init.method,
    headers: { Authorization: `Bearer ${token}`, 'Content-Type': 'application/json' },
    body: init.body !== undefined ? JSON.stringify(init.body) : undefined,
  });

  if (response.status === 404) return null;

  if (!response.ok) {
    const detail = await response.text();
    logger.error({ path, status: response.status, detail: detail.slice(0, 400) }, 'Google Meet API request failed');
    throw integrationFailure('Google Meet');
  }

  return (await response.json()) as T;
}

function toDetails(space: MeetSpace, startAt: Date | null, durationMinutes: number): MeetingDetails {
  if (!space.meetingUri) throw integrationFailure('Google Meet');
  return {
    provider: 'GOOGLE_MEET',
    // The space resource name — stable, unlike meetingCode.
    externalMeetingId: space.name,
    joinUrl: space.meetingUri,
    // Meet has no separate host URL; the organiser joins through the same link.
    hostUrl: null,
    passcode: null,
    dialInNumber: null,
    startTime: startAt,
    endTime: startAt ? new Date(startAt.getTime() + durationMinutes * 60_000) : null,
  };
}

export const googleMeetProvider: VideoMeetingProvider = {
  provider: 'GOOGLE_MEET',
  name: 'Google Meet',

  isConfigured: () => integrationsConfigured.google,

  async createMeeting(args: CreateMeetingArgs): Promise<MeetingDetails> {
    if (!integrationsConfigured.google) throw integrationNotConnected('Google Meet');
    const { connectionId } = await resolveConnection(args.bookingId);

    // The Meet API takes an empty space; scheduling is the calendar's job.
    const space = await meetRequest<MeetSpace>(connectionId, '/spaces', {
      method: 'POST',
      body: {},
    });

    if (!space) throw integrationFailure('Google Meet');
    return toDetails(space, args.startAt, args.durationMinutes);
  },

  /**
   * A Meet space has no schedule of its own, so there is nothing to move: the
   * existing space stays valid and the calendar event carries the new time.
   * Returning the current space keeps the interface uniform.
   */
  async updateMeeting(args: UpdateMeetingArgs): Promise<MeetingDetails> {
    if (!integrationsConfigured.google) throw integrationNotConnected('Google Meet');

    const meeting = await prisma.videoMeeting.findFirst({
      where: { externalMeetingId: args.externalMeetingId },
      select: { booking: { select: { consultantId: true } }, joinUrl: true },
    });
    if (!meeting?.joinUrl) throw integrationFailure('Google Meet');

    return {
      provider: 'GOOGLE_MEET',
      externalMeetingId: args.externalMeetingId,
      joinUrl: meeting.joinUrl,
      hostUrl: null,
      passcode: null,
      dialInNumber: null,
      startTime: args.startAt,
      endTime: new Date(args.startAt.getTime() + args.durationMinutes * 60_000),
    };
  },

  /**
   * Ends any active conference in the space. Meet spaces are not deleted
   * through the API; removing the calendar event is what withdraws access.
   */
  async cancelMeeting(externalMeetingId: string): Promise<void> {
    const meeting = await prisma.videoMeeting.findFirst({
      where: { externalMeetingId },
      select: { booking: { select: { consultantId: true } } },
    });
    if (!meeting) return;

    const connection = await connectionFor(meeting.booking.consultantId, 'GOOGLE');
    if (!connection) return;

    await meetRequest(connection.id, `/${externalMeetingId}:endActiveConference`, {
      method: 'POST',
      body: {},
    }).catch((error: unknown) => {
      // A space with no active conference is the normal case, not a failure.
      logger.debug({ err: error, externalMeetingId }, 'No active Google Meet conference to end');
      return null;
    });
  },

  async getMeeting(externalMeetingId: string): Promise<MeetingDetails | null> {
    if (!integrationsConfigured.google) return null;

    const meeting = await prisma.videoMeeting.findFirst({
      where: { externalMeetingId },
      select: { booking: { select: { consultantId: true } }, startTime: true },
    });
    if (!meeting) return null;

    const connection = await connectionFor(meeting.booking.consultantId, 'GOOGLE');
    if (!connection) return null;

    const space = await meetRequest<MeetSpace>(connection.id, `/${externalMeetingId}`, { method: 'GET' });
    return space ? toDetails(space, meeting.startTime, 60) : null;
  },
};
