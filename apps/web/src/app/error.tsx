'use client';

import { useEffect } from 'react';
import Link from 'next/link';

/**
 * App Router global error boundary. Required so Next.js doesn't fall back to
 * the legacy Pages Router /500 page (which has the `<Html>` import issue
 * during static prerender).
 */
export default function GlobalError({
  error,
  reset,
}: {
  error: Error & { digest?: string };
  reset: () => void;
}) {
  useEffect(() => {
    // eslint-disable-next-line no-console
    console.error('Global error:', error);
  }, [error]);

  return (
    <div className="min-h-screen flex items-center justify-center bg-slate-50 p-6">
      <div className="max-w-md text-center">
        <p className="text-6xl font-bold text-rose-600">500</p>
        <h1 className="mt-4 text-2xl font-semibold text-slate-900">Đã xảy ra lỗi</h1>
        <p className="mt-2 text-sm text-slate-600">
          Hệ thống gặp sự cố khi xử lý yêu cầu. Vui lòng thử lại.
        </p>
        {error.digest && (
          <p className="mt-2 text-xs text-slate-400 font-mono">Mã lỗi: {error.digest}</p>
        )}
        <div className="mt-6 flex gap-2 justify-center">
          <button onClick={reset} className="btn-primary">
            Thử lại
          </button>
          <Link href="/" className="btn-secondary">
            Về trang chủ
          </Link>
        </div>
      </div>
    </div>
  );
}
