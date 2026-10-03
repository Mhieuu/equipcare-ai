'use client';

import { QueryClient, QueryClientProvider } from '@tanstack/react-query';
import { useEffect, useState } from 'react';
import { useAuth } from '@/lib/auth';
import { apiGet } from '@/lib/api';
import { ToastProvider } from '@/components/toast';

async function fetchMe() {
  try {
    const res = await apiGet<{
      user: { id: string; loginName: string; fullName: string; email: string | null };
      roles: Array<{ code: string; name: string }>;
      permissions: string[];
    }>('/iam/me/permissions');
    return {
      id: res.user.id,
      loginName: res.user.loginName,
      fullName: res.user.fullName,
      email: res.user.email,
      roles: res.roles,
      permissions: res.permissions,
    };
  } catch {
    return null;
  }
}

// Routes the user is most likely to visit first. Pinging them as soon as the
// access token is known lets Next.js dev server compile them in the background
// so navigation doesn't have to wait for the first compile (can be 1-8s).
const WARMUP_ROUTES = [
  '/dashboard',
  '/incidents',
  '/work-orders',
  '/assets',
  '/approvals',
  '/inventory/parts',
];

export function Providers({ children }: { children: React.ReactNode }) {
  const [client] = useState(
    () =>
      new QueryClient({
        defaultOptions: {
          queries: {
            staleTime: 30_000,
            refetchOnWindowFocus: false,
            retry: 1,
          },
        },
      }),
  );

  const setUser = useAuth((s) => s.setUser);
  const accessToken = useAuth((s) => s.accessToken);

  useEffect(() => {
    if (!accessToken) {
      setUser(null);
      return;
    }
    // Kick off user fetch in the background.
    void fetchMe().then((u) => {
      if (u) setUser(u);
    });
    // Warm up server-side compilation for common routes. Done as fire-and-forget
    // GETs so the dev server pre-compiles them in the background while the user
    // is still on the current page.
    if (typeof window !== 'undefined') {
      const base = window.location.origin;
      for (const route of WARMUP_ROUTES) {
        fetch(base + route, { credentials: 'include', cache: 'no-store' }).catch(
          () => undefined,
        );
      }
    }
  }, [accessToken, setUser]);

  return (
    <QueryClientProvider client={client}>
      <ToastProvider>{children}</ToastProvider>
    </QueryClientProvider>
  );
}
