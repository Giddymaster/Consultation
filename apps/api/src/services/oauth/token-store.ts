import type { CalendarProvider } from '@meridian/types';
import { prisma } from '../../lib/prisma.js';
import { env } from '../../config/env.js';
import { decryptSecret, encryptSecret } from '../../lib/crypto.js';
import { integrationFailure, integrationNotConnected } from '../../lib/errors.js';
import { logger } from '../../lib/logger.js';

/**
 * OAuth token custody for the per-consultant Google and Microsoft connections.
 *
 * Both tokens are AES-256-GCM encrypted at rest; plaintext exists only inside
 * this module for the duration of a request. Refresh is transparent to callers:
 * `getAccessToken` returns a token that is valid *now*, renewing it first if
 * the stored one is within the expiry skew.
 */

const EXPIRY_SKEW_MS = 120_000;

export interface StoredConnection {
  id: string;
  provider: CalendarProvider;
  accountEmail: string;
  calendarId: string | null;
}

interface TokenResponse {
  access_token: string;
  refresh_token?: string;
  expires_in?: number;
  scope?: string;
}

const TOKEN_ENDPOINTS: Record<CalendarProvider, string> = {
  GOOGLE: 'https://oauth2.googleapis.com/token',
  MICROSOFT: '', // resolved per-tenant below
};

function microsoftTokenEndpoint(): string {
  return `https://login.microsoftonline.com/${env.MICROSOFT_TENANT_ID}/oauth2/v2.0/token`;
}

function clientCredentials(provider: CalendarProvider): { id: string; secret: string } {
  if (provider === 'GOOGLE') {
    if (!env.GOOGLE_CLIENT_ID || !env.GOOGLE_CLIENT_SECRET) throw integrationNotConnected('Google');
    return { id: env.GOOGLE_CLIENT_ID, secret: env.GOOGLE_CLIENT_SECRET };
  }
  if (!env.MICROSOFT_CLIENT_ID || !env.MICROSOFT_CLIENT_SECRET) throw integrationNotConnected('Microsoft');
  return { id: env.MICROSOFT_CLIENT_ID, secret: env.MICROSOFT_CLIENT_SECRET };
}

/**
 * Returns a currently-valid access token for a connection, refreshing on the
 * way out if needed. A refresh failure marks the connection with `lastError`
 * so Admin → Integrations can show "Connection error" rather than silently
 * returning stale data.
 */
export async function getAccessToken(connectionId: string): Promise<string> {
  const connection = await prisma.calendarConnection.findUnique({
    where: { id: connectionId },
    select: {
      id: true,
      provider: true,
      accessToken: true,
      refreshToken: true,
      expiresAt: true,
      syncEnabled: true,
    },
  });

  if (!connection || !connection.syncEnabled) {
    throw integrationNotConnected(connection?.provider === 'MICROSOFT' ? 'Microsoft' : 'Google');
  }

  const stillValid =
    connection.expiresAt && connection.expiresAt.getTime() - EXPIRY_SKEW_MS > Date.now();
  if (stillValid) return decryptSecret(connection.accessToken);

  if (!connection.refreshToken) {
    await markConnectionError(connection.id, 'No refresh token stored — reconnect required');
    throw integrationNotConnected(connection.provider === 'MICROSOFT' ? 'Microsoft' : 'Google');
  }

  const refreshed = await refreshAccessToken(
    connection.provider,
    decryptSecret(connection.refreshToken),
  ).catch(async (error: unknown) => {
    const message = error instanceof Error ? error.message : 'Token refresh failed';
    await markConnectionError(connection.id, message);
    throw error;
  });

  await prisma.calendarConnection.update({
    where: { id: connection.id },
    data: {
      accessToken: encryptSecret(refreshed.access_token),
      // Google omits refresh_token on refresh; keep the existing one.
      ...(refreshed.refresh_token ? { refreshToken: encryptSecret(refreshed.refresh_token) } : {}),
      expiresAt: new Date(Date.now() + (refreshed.expires_in ?? 3600) * 1000),
      lastError: null,
    },
  });

  return refreshed.access_token;
}

async function refreshAccessToken(
  provider: CalendarProvider,
  refreshToken: string,
): Promise<TokenResponse> {
  const credentials = clientCredentials(provider);
  const endpoint = provider === 'GOOGLE' ? TOKEN_ENDPOINTS.GOOGLE : microsoftTokenEndpoint();

  const response = await fetch(endpoint, {
    method: 'POST',
    headers: { 'Content-Type': 'application/x-www-form-urlencoded' },
    body: new URLSearchParams({
      client_id: credentials.id,
      client_secret: credentials.secret,
      refresh_token: refreshToken,
      grant_type: 'refresh_token',
    }),
  });

  if (!response.ok) {
    // The body can echo the refresh token; log only the status.
    logger.error({ provider, status: response.status }, 'OAuth token refresh failed');
    throw integrationFailure(provider === 'GOOGLE' ? 'Google' : 'Microsoft');
  }

  return (await response.json()) as TokenResponse;
}

/** Exchanges an authorization code during the OAuth callback. */
export async function exchangeCodeForTokens(
  provider: CalendarProvider,
  code: string,
  redirectUri: string,
): Promise<TokenResponse> {
  const credentials = clientCredentials(provider);
  const endpoint = provider === 'GOOGLE' ? TOKEN_ENDPOINTS.GOOGLE : microsoftTokenEndpoint();

  const response = await fetch(endpoint, {
    method: 'POST',
    headers: { 'Content-Type': 'application/x-www-form-urlencoded' },
    body: new URLSearchParams({
      client_id: credentials.id,
      client_secret: credentials.secret,
      code,
      grant_type: 'authorization_code',
      redirect_uri: redirectUri,
    }),
  });

  if (!response.ok) {
    logger.error({ provider, status: response.status }, 'OAuth code exchange failed');
    throw integrationFailure(provider === 'GOOGLE' ? 'Google' : 'Microsoft');
  }

  return (await response.json()) as TokenResponse;
}

export async function storeConnection(args: {
  consultantId: string;
  provider: CalendarProvider;
  accountId: string;
  accountEmail: string;
  tokens: TokenResponse;
  calendarId?: string;
}): Promise<string> {
  const data = {
    accessToken: encryptSecret(args.tokens.access_token),
    ...(args.tokens.refresh_token ? { refreshToken: encryptSecret(args.tokens.refresh_token) } : {}),
    expiresAt: new Date(Date.now() + (args.tokens.expires_in ?? 3600) * 1000),
    scope: args.tokens.scope ?? null,
    accountEmail: args.accountEmail,
    syncEnabled: true,
    lastError: null,
    ...(args.calendarId ? { calendarId: args.calendarId } : {}),
  };

  const connection = await prisma.calendarConnection.upsert({
    where: {
      consultantId_provider_accountId: {
        consultantId: args.consultantId,
        provider: args.provider,
        accountId: args.accountId,
      },
    },
    create: {
      consultantId: args.consultantId,
      provider: args.provider,
      accountId: args.accountId,
      ...data,
    },
    update: data,
    select: { id: true },
  });

  return connection.id;
}

export async function markConnectionError(connectionId: string, message: string): Promise<void> {
  await prisma.calendarConnection.update({
    where: { id: connectionId },
    data: { lastError: message.slice(0, 1000), lastCheckedAt: new Date() },
  }).catch(() => undefined);
}

/**
 * The connection a consultant's meetings and calendar events should use for a
 * provider, or null when they have not connected one.
 */
export async function connectionFor(
  consultantId: string,
  provider: CalendarProvider,
): Promise<StoredConnection | null> {
  const connection = await prisma.calendarConnection.findFirst({
    where: { consultantId, provider, syncEnabled: true },
    select: { id: true, provider: true, accountEmail: true, calendarId: true },
    orderBy: { createdAt: 'desc' },
  });
  return connection;
}

export async function disconnect(connectionId: string): Promise<void> {
  await prisma.calendarConnection.delete({ where: { id: connectionId } });
}
