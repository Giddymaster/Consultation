import { createContext, useContext } from 'react';

/**
 * Theme context and its hook.
 *
 * Kept apart from `theme.tsx` so that file exports only a component and keeps
 * React Fast Refresh. A module exporting both a provider and a hook is remounted
 * on every edit, taking the app's state down with it.
 */

export type ThemePreference = 'light' | 'dark' | 'system';

export interface ThemeContextValue {
  preference: ThemePreference;
  /** What is actually on screen once "system" is resolved. */
  resolved: 'light' | 'dark';
  setPreference: (preference: ThemePreference) => void;
  toggle: () => void;
}

export const ThemeContext = createContext<ThemeContextValue | null>(null);

export function useTheme(): ThemeContextValue {
  const context = useContext(ThemeContext);
  if (!context) throw new Error('useTheme must be used inside ThemeProvider');
  return context;
}
