/**
 * Auth store (Zustand) - token storage with localStorage persistence.
 *
 * - `accessToken` / `refreshToken`: JWT pair
 * - `user`: AuthenticatedUser profile from /auth/me
 *
 * Token refresh handled by api.ts interceptor.
 */
'use client';

import { create } from 'zustand';
import { persist } from 'zustand/middleware';

export interface AuthUser {
  id: string;
  loginName: string;
  fullName: string;
  email: string | null;
  roles: Array<{ code: string; name: string }>;
  permissions: string[];
}

interface AuthState {
  accessToken: string | null;
  refreshToken: string | null;
  user: AuthUser | null;
  setTokens: (access: string, refresh: string) => void;
  setUser: (u: AuthUser | null) => void;
  hasRole: (code: string | string[]) => boolean;
  hasPermission: (code: string | string[]) => boolean;
  logout: () => void;
}

export const useAuth = create<AuthState>()(
  persist(
    (set, get) => ({
      accessToken: null,
      refreshToken: null,
      user: null,
      setTokens: (access, refresh) => set({ accessToken: access, refreshToken: refresh }),
      setUser: (user) => set({ user }),
      hasRole: (code) => {
        const u = get().user;
        if (!u) return false;
        const codes = Array.isArray(code) ? code : [code];
        return codes.some((c) => u.roles.some((r) => r.code === c));
      },
      hasPermission: (code) => {
        const u = get().user;
        if (!u) return false;
        const codes = Array.isArray(code) ? code : [code];
        return codes.some((c) => u.permissions.includes(c));
      },
      logout: () => {
        set({ accessToken: null, refreshToken: null, user: null });
        if (typeof window !== 'undefined') {
          window.location.href = '/login';
        }
      },
    }),
    {
      name: 'equipcare.auth',
    },
  ),
);
