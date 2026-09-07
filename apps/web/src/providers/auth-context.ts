import { createContext, useContext } from 'react';
import type { AuthenticatedUser, LoginInput, Permission, RegisterInput, Role } from '@meridian/types';

/**
 * Authentication context and its hook.
 *
 * Kept apart from `auth.tsx` so that file exports only a component and keeps
 * React Fast Refresh. A module exporting both a provider and a hook is remounted
 * on every edit, which here would sign the developer out on each save.
 *
 * `can()` checks a permission, never a role. Client-side gating is a UX
 * convenience only: every one of these checks is enforced again server-side.
 */

export interface AuthContextValue {
  user: AuthenticatedUser | null;
  /** True until the initial refresh attempt settles. */
  loading: boolean;
  login: (input: LoginInput) => Promise<AuthenticatedUser>;
  register: (input: RegisterInput) => Promise<AuthenticatedUser>;
  logout: () => Promise<void>;
  refresh: () => Promise<void>;
  can: (...permissions: Permission[]) => boolean;
  canAny: (...permissions: Permission[]) => boolean;
  hasRole: (...roles: Role[]) => boolean;
  setUser: (user: AuthenticatedUser | null) => void;
}

export const AuthContext = createContext<AuthContextValue | null>(null);

export function useAuth(): AuthContextValue {
  const context = useContext(AuthContext);
  if (!context) throw new Error('useAuth must be used inside AuthProvider');
  return context;
}
