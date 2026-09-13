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
    void fetchMe().then((u) => {
      if (u) setUser(u);
    });
  }, [accessToken, setUser]);

  return (
    <QueryClientProvider client={client}>
      <ToastProvider>{children}</ToastProvider>
    </QueryClientProvider>
  );
}
