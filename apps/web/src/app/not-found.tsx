import Link from 'next/link';

/**
 * App Router not-found page. Replaces the legacy Pages Router auto-generated
 * /404 that was causing `<Html>` import errors during static prerender.
 *
 * Root `app/layout.tsx` forces dynamic rendering, but Next.js still attempts
 * to generate a static 404 fallback for every route — providing this file
 * keeps that prerender pass inside the App Router context (which has its own
 * `<html>` from root layout) and avoids the Pages Router fallback entirely.
 */
export default function NotFound() {
  return (
    <div className="min-h-screen flex items-center justify-center bg-slate-50 p-6">
      <div className="max-w-md text-center">
        <p className="text-6xl font-bold text-brand-600">404</p>
        <h1 className="mt-4 text-2xl font-semibold text-slate-900">Không tìm thấy trang</h1>
        <p className="mt-2 text-sm text-slate-600">
          Trang bạn yêu cầu không tồn tại hoặc đã được di chuyển.
        </p>
        <Link href="/" className="btn-primary mt-6 inline-flex">
          Về trang chủ
        </Link>
      </div>
    </div>
  );
}
