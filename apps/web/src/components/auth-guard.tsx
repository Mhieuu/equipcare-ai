'use client';

import { useAuth } from '@/lib/auth';
import { AppShell } from './app-shell';

export function AuthGuard({ children }: { children: React.ReactNode }) {
  const accessToken = useAuth((s) => s.accessToken);
  if (!accessToken) return null;
  return <AppShell>{children}</AppShell>;
}
