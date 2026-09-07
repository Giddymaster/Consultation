import { DateTime } from 'luxon';
import { env, integrationsConfigured } from '../../config/env.js';
import { integrationFailure, integrationNotConnected } from '../../lib/errors.js';
import { logger } from '../../lib/logger.js';
import type {
  CreateMeetingArgs,
  MeetingDetails,
  UpdateMeetingArgs,
  VideoMeetingProvider,
} from './types.js';

/**
 * Zoom, via a Server-to-Server OAuth app (account_credentials grant).
 *
 * S2S OAuth is the right fit here: the firm's own Zoom account hosts every
 * consultation, so there is no per-user authorisation step and no refresh
 * token to store — a short-lived access token is fetched as needed.
 */

const ZOOM_API = 'https://api.zoom.us/v2';
const ZOOM_OAUTH = 'https://zoom.us/oauth/token';

interface CachedToken {
  token: string;
  expiresAt: number;
}
let cachedToken: CachedToken | null = null;

async function getAccessToken(): Promise<string> {
  // Zoom tokens live one hour. Re-use until a minute before expiry.
  if (cachedToken && cachedToken.expiresAt > Date.now() + 60_000) return cachedToken.token;

  const basic = Buffer.from(`${env.ZOOM_CLIENT_ID}:${env.ZOOM_CLIENT_SECRET}`).toString('base64');
  const url = `${ZOOM_OAUTH}?grant_type=account_credentials&account_id=${encodeURIComponent(env.ZOOM_ACCOUNT_ID ?? '')}`;

  const response = await fetch(url, {
    method: 'POST',
    headers: { Authorization: `Basic ${basic}`, 'Content-Type': 'application/x-www-form-urlencoded' },
  });

  if (!response.ok) {
    logger.error({ status: response.status }, 'Zoom token request failed');
    throw integrationFailure('Zoom');
  }

  const body = (await response.json()) as { access_token?: string; expires_in?: number };
  if (!body.access_token) throw integrationFailure('Zoom');

  cachedToken = {
    token: body.access_token,
    expiresAt: Date.now() + (body.expires_in ?? 3600) * 1000,
  };
  return cachedToken.token;
}

interface ZoomMeetingResponse {
  id: number;
  join_url: string;
  start_url?: string;
  password?: string;
  start_time?: string;
  duration?: number;
  settings?: { global_dial_in_numbers?: { number?: string }[] };
}

async function zoomRequest<T>(
  path: string,
  init: { method: 'GET' | 'POST' | 'PATCH' | 'DELETE'; body?: unknown },
): Promise<T | null> {
  const token = await getAccessToken();
  const response = await fetch(`${ZOOM_API}${path}`, {
    method: init.method,
    headers: { Authorization: `Bearer ${token}`, 'Content-Type': 'application/json' },
    body: init.body ? JSON.stringify(init.body) : undefined,
  });

  // 204 for PATCH/DELETE, 404 when a meeting has already been removed.
  if (response.status === 204) return null;
  if (response.status === 404) return null;

  if (!response.ok) {
    const detail = await response.text();
    logger.error({ path, status: response.status, detail: detail.slice(0, 400) }, 'Zoom API request failed');
    throw integrationFailure('Zoom');
  }

  return (await response.json()) as T;
}

function toDetails(meeting: ZoomMeetingResponse, durationMinutes: number): MeetingDetails {
  const startTime = meeting.start_time ? new Date(meeting.start_time) : null;
  return {
    provider: 'ZOOM',
    externalMeetingId: String(meeting.id),
    joinUrl: meeting.join_url,
    hostUrl: meeting.start_url ?? null,
    passcode: meeting.password ?? null,
    dialInNumber: meeting.settings?.global_dial_in_numbers?.[0]?.number ?? null,
    startTime,
    endTime: startTime ? new Date(startTime.getTime() + (meeting.duration ?? durationMinutes) * 60_000) : null,
  };
}

export const zoomProvider: VideoMeetingProvider = {
  provider: 'ZOOM',
  name: 'Zoom',

  isConfigured: () => integrationsConfigured.zoom,

  async createMeeting(args: CreateMeetingArgs): Promise<MeetingDetails> {
    if (!integrationsConfigured.zoom) throw integrationNotConnected('Zoom');

    const meeting = await zoomRequest<ZoomMeetingResponse>('/users/me/meetings', {
      method: 'POST',
      body: {
        topic: args.topic.slice(0, 200),
        // 2 = a scheduled meeting with a fixed start time.
        type: 2,
        start_time: DateTime.fromJSDate(args.startAt).toUTC().toFormat("yyyy-MM-dd'T'HH:mm:ss'Z'"),
        duration: args.durationMinutes,
        timezone: args.timezone,
        agenda: args.agenda?.slice(0, 2000),
        settings: {
          join_before_host: false,
          waiting_room: true,
          host_video: true,
          participant_video: true,
          mute_upon_entry: true,
          approval_type: 2,
          audio: 'both',
        },
      },
    });

    if (!meeting) throw integrationFailure('Zoom');
    return toDetails(meeting, args.durationMinutes);
  },

  async updateMeeting(args: UpdateMeetingArgs): Promise<MeetingDetails> {
    if (!integrationsConfigured.zoom) throw integrationNotConnected('Zoom');

    await zoomRequest(`/meetings/${encodeURIComponent(args.externalMeetingId)}`, {
      method: 'PATCH',
      body: {
        start_time: DateTime.fromJSDate(args.startAt).toUTC().toFormat("yyyy-MM-dd'T'HH:mm:ss'Z'"),
        duration: args.durationMinutes,
        timezone: args.timezone,
        ...(args.topic ? { topic: args.topic.slice(0, 200) } : {}),
      },
    });

    // PATCH returns 204, so the updated record is read back.
    const refreshed = await zoomRequest<ZoomMeetingResponse>(
      `/meetings/${encodeURIComponent(args.externalMeetingId)}`,
      { method: 'GET' },
    );
    if (!refreshed) throw integrationFailure('Zoom');
    return toDetails(refreshed, args.durationMinutes);
  },

  async cancelMeeting(externalMeetingId: string): Promise<void> {
    if (!integrationsConfigured.zoom) throw integrationNotConnected('Zoom');
    await zoomRequest(`/meetings/${encodeURIComponent(externalMeetingId)}`, { method: 'DELETE' });
  },

  async getMeeting(externalMeetingId: string): Promise<MeetingDetails | null> {
    if (!integrationsConfigured.zoom) return null;
    const meeting = await zoomRequest<ZoomMeetingResponse>(
      `/meetings/${encodeURIComponent(externalMeetingId)}`,
      { method: 'GET' },
    );
    return meeting ? toDetails(meeting, meeting.duration ?? 60) : null;
  },
};

/** Test seam so the suite can reset the module-level token cache. */
export function __resetZoomTokenCache(): void {
  cachedToken = null;
}
