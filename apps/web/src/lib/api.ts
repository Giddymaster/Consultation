import type { ApiErrorBody, ApiResponse, ErrorCode, FieldIssue } from '@meridian/types';

/**
 * HTTP client for the Meridian API.
 *
 * Responsibilities beyond fetch:
 *   • unwraps the `{ success, data | error }` envelope so callers deal in data;
 *   • holds the short-lived access token in memory only — never localStorage,
 *     which would expose it to any XSS on the page;
 *   • refreshes transparently on a 401 and replays the original request, with
 *     concurrent 401s sharing one refresh rather than stampeding.
 */

/**
 * Empty in development, where Vite proxies `/api`. In a split deployment it
 * is the API's own origin, which is why anything building an API URL outside
 * this module has to prefix it too.
 */
export const API_BASE = import.meta.env.VITE_API_URL ?? '';

/**
 * A production build with no API origin has nowhere to send requests, so every
 * call lands on the site's own host and comes back as the SPA's index.html —
 * which surfaces as an opaque 405 or a JSON parse failure rather than anything
 * a reader could act on. Detected once here so the failure can name itself.
 */
const API_ORIGIN_MISSING = import.meta.env.PROD && !import.meta.env.VITE_API_URL;

const MISCONFIGURED_MESSAGE =
  'This site is not connected to its API. VITE_API_URL was not set when it was built.';

if (API_ORIGIN_MISSING && typeof console !== 'undefined') {
  console.error(
    `[config] ${MISCONFIGURED_MESSAGE} Every request will hit this site's own origin and fail.`,
  );
}

export class ApiError extends Error {
  readonly code: ErrorCode;
  readonly status: number;
  readonly issues?: FieldIssue[];
  readonly requestId?: string;

  constructor(status: number, body: ApiErrorBody) {
    super(body.message);
    this.name = 'ApiError';
    this.status = status;
    this.code = body.code;
    this.issues = body.issues;
    this.requestId = body.requestId;
  }

  /** Field errors keyed by path, ready to hand to react-hook-form. */
  get fieldErrors(): Record<string, string> {
    return Object.fromEntries((this.issues ?? []).map((issue) => [issue.path, issue.message]));
  }
}

/* -------------------------------------------------------------------------- */
/* Access token (in memory)                                                   */
/* -------------------------------------------------------------------------- */

let accessToken: string | null = null;
let onUnauthenticated: (() => void) | null = null;

export function setAccessToken(token: string | null): void {
  accessToken = token;
}

export function getAccessToken(): string | null {
  return accessToken;
}

/** Called when refresh fails, so the auth context can clear its state. */
export function setUnauthenticatedHandler(handler: () => void): void {
  onUnauthenticated = handler;
}

/* -------------------------------------------------------------------------- */
/* Refresh                                                                    */
/* -------------------------------------------------------------------------- */

let refreshInFlight: Promise<boolean> | null = null;

/**
 * Exchanges the refresh cookie for a new access token. Concurrent callers await
 * the same promise, so ten parallel 401s trigger one refresh, not ten — which
 * matters because the server rotates the token and would treat the later
 * attempts as replay of an already-used token.
 */
export async function refreshAccessToken(): Promise<boolean> {
  refreshInFlight ??= (async () => {
    try {
      // No Content-Type header: this request has no body, and declaring JSON
      // on an empty body makes the server's parser reject it before routing.
      const response = await fetch(`${API_BASE}/api/auth/refresh`, {
        method: 'POST',
        credentials: 'include',
        headers: { Accept: 'application/json' },
      });

      if (!response.ok) {
        accessToken = null;
        return false;
      }

      const body = (await response.json()) as ApiResponse<{ tokens: { accessToken: string } }>;
      if (!body.success) {
        accessToken = null;
        return false;
      }

      accessToken = body.data.tokens.accessToken;
      return true;
    } catch {
      accessToken = null;
      return false;
    } finally {
      // Cleared on the next tick so callers already awaiting still see it.
      queueMicrotask(() => {
        refreshInFlight = null;
      });
    }
  })();

  return refreshInFlight;
}

/* -------------------------------------------------------------------------- */
/* Request                                                                    */
/* -------------------------------------------------------------------------- */

export interface RequestOptions {
  method?: 'GET' | 'POST' | 'PATCH' | 'PUT' | 'DELETE';
  body?: unknown;
  query?: Record<string, string | number | boolean | undefined | null>;
  signal?: AbortSignal;
  /** Skip the refresh-and-retry dance. Used by the auth endpoints themselves. */
  skipAuthRetry?: boolean;
}

function buildUrl(path: string, query?: RequestOptions['query']): string {
  const url = `${API_BASE}${path}`;
  if (!query) return url;

  const params = new URLSearchParams();
  for (const [key, value] of Object.entries(query)) {
    if (value === undefined || value === null || value === '') continue;
    params.set(key, String(value));
  }
  const search = params.toString();
  return search ? `${url}?${search}` : url;
}

async function execute<T>(path: string, options: RequestOptions, isRetry: boolean): Promise<T> {
  const headers: Record<string, string> = { Accept: 'application/json' };

  // A multipart body must set its own Content-Type, because only the browser
  // knows the boundary it generated. Setting it by hand produces a body the
  // server cannot parse.
  const isMultipart = typeof FormData !== 'undefined' && options.body instanceof FormData;
  if (options.body !== undefined && !isMultipart) headers['Content-Type'] = 'application/json';
  if (accessToken) headers.Authorization = `Bearer ${accessToken}`;

  const response = await fetch(buildUrl(path, options.query), {
    method: options.method ?? 'GET',
    headers,
    // Required so the httpOnly refresh cookie travels with auth requests.
    credentials: 'include',
    body: isMultipart
      ? (options.body as FormData)
      : options.body !== undefined
        ? JSON.stringify(options.body)
        : undefined,
    signal: options.signal,
  });

  if (response.status === 204) return undefined as T;

  let payload: ApiResponse<T>;
  try {
    payload = (await response.json()) as ApiResponse<T>;
  } catch {
    // Reaching here having received HTML is the signature of a missing API
    // origin: the request was served by this site's own SPA fallback.
    throw new ApiError(response.status, {
      code: 'INTERNAL_ERROR',
      message: API_ORIGIN_MISSING
        ? MISCONFIGURED_MESSAGE
        : 'The server returned an unexpected response.',
    });
  }

  if (response.ok && payload.success) return payload.data;

  const error = !payload.success
    ? payload.error
    : { code: 'INTERNAL_ERROR' as ErrorCode, message: 'Unexpected response shape.' };

  // One refresh attempt, then replay. A second 401 means the session is gone.
  if (response.status === 401 && !isRetry && !options.skipAuthRetry) {
    const refreshed = await refreshAccessToken();
    if (refreshed) return execute<T>(path, options, true);
    onUnauthenticated?.();
  }

  throw new ApiError(response.status, error);
}

export function request<T>(path: string, options: RequestOptions = {}): Promise<T> {
  return execute<T>(path, options, false);
}

export const api = {
  get: <T>(path: string, query?: RequestOptions['query'], signal?: AbortSignal) =>
    request<T>(path, { method: 'GET', query, signal }),

  post: <T>(path: string, body?: unknown, options: Omit<RequestOptions, 'method' | 'body'> = {}) =>
    request<T>(path, { ...options, method: 'POST', body }),

  patch: <T>(path: string, body?: unknown) => request<T>(path, { method: 'PATCH', body }),

  put: <T>(path: string, body?: unknown) => request<T>(path, { method: 'PUT', body }),

  delete: <T>(path: string) => request<T>(path, { method: 'DELETE' }),

  /** Multipart POST. Shares the auth-refresh retry with every other call. */
  upload: <T>(path: string, body: FormData) => request<T>(path, { method: 'POST', body }),
};

/** Turns any thrown value into a message safe to show a user. */
export function errorMessage(error: unknown): string {
  if (error instanceof ApiError) return error.message;
  if (error instanceof Error) return error.message;
  return 'Something went wrong. Please try again.';
}

export function isApiError(error: unknown, code?: ErrorCode): error is ApiError {
  return error instanceof ApiError && (code === undefined || error.code === code);
}
