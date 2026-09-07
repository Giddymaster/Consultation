import type { MeetingProvider } from '@meridian/types';
import { isProduction } from '../../config/env.js';
import type {
  CreateMeetingArgs,
  MeetingDetails,
  UpdateMeetingArgs,
  VideoMeetingProvider,
} from './types.js';

/**
 * Test-only video adapter.
 *
 * This exists so the booking, payment and fulfilment suites can exercise the
 * full confirmed-booking path without network access. It is **not** a
 * development convenience for pretending an integration works: the URLs it
 * returns are obviously fake (`mock-meeting.invalid`, a reserved TLD that can
 * never resolve) precisely so one cannot be mistaken for a real link if it
 * escapes into a database or an email.
 *
 * Constructing it under NODE_ENV=production throws.
 */

interface MockMeeting {
  id: string;
  startAt: Date;
  durationMinutes: number;
}

const meetings = new Map<string, MockMeeting>();
let sequence = 0;

export function mockVideoProvider(provider: MeetingProvider): VideoMeetingProvider {
  if (isProduction) {
    throw new Error('The mock video provider must never be constructed in production.');
  }

  const build = (meeting: MockMeeting): MeetingDetails => ({
    provider,
    externalMeetingId: meeting.id,
    joinUrl: `https://mock-meeting.invalid/join/${meeting.id}`,
    hostUrl: `https://mock-meeting.invalid/host/${meeting.id}`,
    passcode: '000000',
    dialInNumber: null,
    startTime: meeting.startAt,
    endTime: new Date(meeting.startAt.getTime() + meeting.durationMinutes * 60_000),
  });

  return {
    provider,
    name: `${provider} (mock)`,
    isConfigured: () => true,

    async createMeeting(args: CreateMeetingArgs): Promise<MeetingDetails> {
      sequence += 1;
      const meeting: MockMeeting = {
        id: `mock-${provider.toLowerCase()}-${sequence}`,
        startAt: args.startAt,
        durationMinutes: args.durationMinutes,
      };
      meetings.set(meeting.id, meeting);
      return build(meeting);
    },

    async updateMeeting(args: UpdateMeetingArgs): Promise<MeetingDetails> {
      const meeting: MockMeeting = {
        id: args.externalMeetingId,
        startAt: args.startAt,
        durationMinutes: args.durationMinutes,
      };
      meetings.set(meeting.id, meeting);
      return build(meeting);
    },

    async cancelMeeting(externalMeetingId: string): Promise<void> {
      meetings.delete(externalMeetingId);
    },

    async getMeeting(externalMeetingId: string): Promise<MeetingDetails | null> {
      const meeting = meetings.get(externalMeetingId);
      return meeting ? build(meeting) : null;
    },
  };
}

/** Lets a suite assert on, or clear, what the mock recorded. */
export function __mockMeetings(): Map<string, MockMeeting> {
  return meetings;
}
