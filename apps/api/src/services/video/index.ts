import type { MeetingProvider } from '@meridian/types';
import { env, isProduction } from '../../config/env.js';
import { zoomProvider } from './zoom.provider.js';
import { googleMeetProvider } from './google-meet.provider.js';
import { teamsProvider } from './teams.provider.js';
import { mockVideoProvider } from './mock.provider.js';
import { isOfflineProvider, type VideoMeetingProvider } from './types.js';

/**
 * Provider registry. The booking flow asks for a provider by enum value and
 * receives something implementing VideoMeetingProvider — it never branches on
 * which one it got.
 */

const REGISTRY: Partial<Record<MeetingProvider, VideoMeetingProvider>> = {
  ZOOM: zoomProvider,
  GOOGLE_MEET: googleMeetProvider,
  MICROSOFT_TEAMS: teamsProvider,
};

/**
 * Returns the adapter for a provider, or null for the offline options
 * (in person, phone, manual) which need no external call.
 *
 * MOCK_VIDEO substitutes a recording adapter for automated tests. env.ts
 * refuses to boot with it enabled under NODE_ENV=production, and the guard is
 * repeated here so the substitution cannot happen even if that check were
 * somehow bypassed.
 */
export function getVideoProvider(provider: MeetingProvider): VideoMeetingProvider | null {
  if (isOfflineProvider(provider)) return null;
  if (env.MOCK_VIDEO && !isProduction) return mockVideoProvider(provider);
  return REGISTRY[provider] ?? null;
}

/** Whether a provider could actually create a meeting right now. */
export function isProviderReady(provider: MeetingProvider): boolean {
  if (isOfflineProvider(provider)) return true;
  if (env.MOCK_VIDEO && !isProduction) return true;
  return REGISTRY[provider]?.isConfigured() ?? false;
}

export function providerStatuses(): { provider: MeetingProvider; name: string; configured: boolean }[] {
  return (Object.keys(REGISTRY) as MeetingProvider[]).map((provider) => ({
    provider,
    name: REGISTRY[provider]!.name,
    configured: REGISTRY[provider]!.isConfigured(),
  }));
}

export * from './types.js';
