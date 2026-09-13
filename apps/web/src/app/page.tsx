'use client';

import { useEffect } from 'react';
import { useRouter } from 'next/navigation';
import { useAuth } from '@/lib/auth';

export default function HomePage() {
  const router = useRouter();
  const accessToken = useAuth((s) => s.accessToken);
  useEffect(() => {
    router.replace(accessToken ? '/dashboard' : '/login');
  }, [accessToken, router]);
  return (
    <div className="min-h-screen flex items-center justify-center text-slate-500">
      Đang chuyển hướng...
    </div>
  );
}
