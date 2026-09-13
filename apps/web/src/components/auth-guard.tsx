'use client';

import { useEffect, useState } from 'react';
import { useAuth } from '@/lib/auth';
import { AppShell } from './app-shell';

export function AuthGuard({ children }: { children: React.ReactNode }) {
  const accessToken = useAuth((s) => s.accessToken);
  const [hydrated, setHydrated] = useState(false);

  useEffect(() => {
    setHydrated(true);
  }, []);

  // First paint: render nothing while persist hydrates.
  if (!hydrated) return null;

  // Not authenticated → redirect to login (avoid flashing UI).
  if (!accessToken) {
    if (typeof window !== 'undefined' && window.location.pathname !== '/login') {
      window.location.href = '/login';
    }
    return null;
  }

  return <AppShell>{children}</AppShell>;
}
