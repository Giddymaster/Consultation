import type { MeetingProvider } from '@meridian/types';

/**
 * The contract every video backend implements.
 *
 * The booking and fulfilment code talks only to this interface — it never
 * knows whether a meeting is a Zoom scheduled meeting, a Google Meet space or
 * a Teams-enabled Outlook event. Adding a provider means adding one file and
 * one registry entry, and changing nothing in the booking flow.
 */

export interface CreateMeetingArgs {
  bookingId: string;
  bookingReference: string;
  topic: string;
  agenda?: string;
  startAt: Date;
  durationMinutes: number;
  /** IANA timezone the meeting should display in for the host. */
  timezone: string;
  hostEmail: string;
  hostName: string;
  attendeeEmail: string;
  attendeeName: string;
}

export interface UpdateMeetingArgs {
  externalMeetingId: string;
  startAt: Date;
  durationMinutes: number;
  timezone: string;
  topic?: string;
  /** Required by providers that address a meeting through a calendar event. */
  hostEmail?: string;
}

export interface MeetingDetails {
  provider: MeetingProvider;
  /**
   * Stable provider-side identifier. For Google Meet this is the space
   * `name` (e.g. `spaces/jQCFfuBOdN5z`) — never the meeting code, which
   * Google documents as reusable and subject to expiry.
   */
  externalMeetingId: string;
  /** The only URL a client is ever shown. */
  joinUrl: string;
  /** Host/start URL. Privileged: excluded from every client-facing serialiser. */
  hostUrl: string | null;
  passcode: string | null;
  dialInNumber: string | null;
  startTime: Date | null;
  endTime: Date | null;
}

export interface VideoMeetingProvider {
  readonly provider: MeetingProvider;
  readonly name: string;

  /**
   * False when credentials are absent. The platform reports "Not connected"
   * and refuses to confirm the meeting rather than inventing a join URL.
   */
  isConfigured(): boolean;

  createMeeting(args: CreateMeetingArgs): Promise<MeetingDetails>;
  updateMeeting(args: UpdateMeetingArgs): Promise<MeetingDetails>;
  cancelMeeting(externalMeetingId: string, hostEmail?: string): Promise<void>;
  getMeeting(externalMeetingId: string, hostEmail?: string): Promise<MeetingDetails | null>;
}

/** Providers that need no external call — the platform stores only intent. */
export const OFFLINE_PROVIDERS: MeetingProvider[] = ['IN_PERSON', 'PHONE', 'MANUAL'];

export function isOfflineProvider(provider: MeetingProvider): boolean {
  return OFFLINE_PROVIDERS.includes(provider);
}
