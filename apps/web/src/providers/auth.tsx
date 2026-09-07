import { useCallback, useEffect, useMemo, useState, type ReactNode } from 'react';
import type { AuthResult, AuthenticatedUser, LoginInput, RegisterInput } from '@meridian/types';

import { AuthContext, type AuthContextValue } from './auth-context';
import { api, refreshAccessToken, setAccessToken, setUnauthenticatedHandler } from '@/lib/api';
import { clearServiceWorkerCaches } from '@/lib/pwa';

/**
 * Authentication state.
 *
 * The access token lives in memory in the API client and is never persisted —
 * a refresh of the tab re-establishes the session from the httpOnly cookie
 * instead. That costs one request on boot and means no token is sitting in
 * localStorage for a script to read.
 *
 * `can()` checks a permission, never a role. Client-side gating is a UX
 * convenience only: every one of these checks is enforced again server-side.
 */

export function AuthProvider({ children }: { children: ReactNode }) {
  const [user, setUser] = useState<AuthenticatedUser | null>(null);
  const [loading, setLoading] = useState(true);

  // A failed refresh inside the API client clears the user here too, so a
  // revoked session cannot leave a stale identity rendered on screen.
  useEffect(() => {
    setUnauthenticatedHandler(() => setUser(null));
  }, []);

  useEffect(() => {
    let cancelled = false;

    void (async () => {
      const refreshed = await refreshAccessToken();
      if (cancelled) return;

      if (!refreshed) {
        setLoading(false);
        return;
      }

      try {
        const me = await api.get<AuthenticatedUser>('/api/auth/me');
        if (!cancelled) setUser(me);
      } catch {
        if (!cancelled) setUser(null);
      } finally {
        if (!cancelled) setLoading(false);
      }
    })();

    return () => {
      cancelled = true;
    };
  }, []);

  const login = useCallback(async (input: LoginInput) => {
    const result = await api.post<AuthResult>('/api/auth/login', input, { skipAuthRetry: true });
    setAccessToken(result.tokens.accessToken);
    setUser(result.user);
    return result.user;
  }, []);

  const register = useCallback(async (input: RegisterInput) => {
    const result = await api.post<AuthResult>('/api/auth/register', input, { skipAuthRetry: true });
    setAccessToken(result.tokens.accessToken);
    setUser(result.user);
    return result.user;
  }, []);

  const logout = useCallback(async () => {
    try {
      await api.post('/api/auth/logout');
    } finally {
      // Local state is cleared even if the network call fails — the user asked
      // to be signed out and the UI must reflect that immediately.
      setAccessToken(null);
      setUser(null);
      void clearServiceWorkerCaches();
    }
  }, []);

  const refresh = useCallback(async () => {
    try {
      setUser(await api.get<AuthenticatedUser>('/api/auth/me'));
    } catch {
      setUser(null);
    }
  }, []);

  const value = useMemo<AuthContextValue>(
    () => ({
      user,
      loading,
      login,
      register,
      logout,
      refresh,
      setUser,
      can: (...permissions) => permissions.every((p) => user?.permissions.includes(p) ?? false),
      canAny: (...permissions) => permissions.some((p) => user?.permissions.includes(p) ?? false),
      hasRole: (...roles) => roles.some((r) => user?.roles.includes(r) ?? false),
    }),
    [user, loading, login, register, logout, refresh],
  );

  return <AuthContext.Provider value={value}>{children}</AuthContext.Provider>;
}
