import { useCallback, useEffect, useMemo, useState, type ReactNode } from 'react';

import { ThemeContext, type ThemeContextValue, type ThemePreference } from './theme-context';

/**
 * Theme preference: light, dark, or follow the operating system.
 *
 * "system" is the default and is genuinely live — the media query listener
 * keeps the page in step if the OS switches at sunset while the tab is open.
 */

const STORAGE_KEY = 'meridian:theme';

function readStoredPreference(): ThemePreference {
  try {
    const stored = localStorage.getItem(STORAGE_KEY);
    if (stored === 'light' || stored === 'dark' || stored === 'system') return stored;
  } catch {
    /* Storage can be unavailable in private browsing; fall through. */
  }
  return 'system';
}

function systemTheme(): 'light' | 'dark' {
  return window.matchMedia('(prefers-color-scheme: dark)').matches ? 'dark' : 'light';
}

export function ThemeProvider({ children }: { children: ReactNode }) {
  const [preference, setPreferenceState] = useState<ThemePreference>(readStoredPreference);

  // Only the *system* answer is state. What is on screen is derived from it and
  // the stored preference, so there is nothing to keep in sync — an earlier
  // version held `resolved` in state and recomputed it in an effect, which meant
  // every preference change rendered twice and the DOM writes existed twice.
  const [systemPreference, setSystemPreference] = useState<'light' | 'dark'>(systemTheme);
  const resolved: 'light' | 'dark' = preference === 'system' ? systemPreference : preference;

  // The listener runs regardless of preference. It is one media query, and
  // tracking it continuously means switching back to "system" is correct
  // immediately rather than one OS change behind.
  useEffect(() => {
    const media = window.matchMedia('(prefers-color-scheme: dark)');
    const onChange = () => setSystemPreference(media.matches ? 'dark' : 'light');

    media.addEventListener('change', onChange);
    return () => media.removeEventListener('change', onChange);
  }, []);

  // The document element is an external system, which is what an effect is for.
  useEffect(() => {
    document.documentElement.classList.toggle('dark', resolved === 'dark');
    document.documentElement.style.colorScheme = resolved;
  }, [resolved]);

  const setPreference = useCallback((next: ThemePreference) => {
    setPreferenceState(next);
    try {
      localStorage.setItem(STORAGE_KEY, next);
    } catch {
      /* Preference simply will not persist; the session still honours it. */
    }
  }, []);

  const value = useMemo<ThemeContextValue>(
    () => ({
      preference,
      resolved,
      setPreference,
      toggle: () => setPreference(resolved === 'dark' ? 'light' : 'dark'),
    }),
    [preference, resolved, setPreference],
  );

  return <ThemeContext.Provider value={value}>{children}</ThemeContext.Provider>;
}
