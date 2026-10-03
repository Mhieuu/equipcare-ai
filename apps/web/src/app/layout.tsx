import type { ReactNode } from 'react';
import './globals.css';
import { Providers } from '@/components/providers';

export const metadata = {
  title: 'EquipCare AI',
  description: 'Equipment maintenance & incident management',
};

// The entire app is client-driven (Zustand auth, Socket.IO, TanStack Query).
// Without this, Next.js attempts a static prerender of every page at build
// time, which fails with `Cannot read properties of null (reading
// 'useContext')` because client components can't access the React context
// tree during build-time prerender. Forcing dynamic rendering makes every
// page SSR-on-demand and skips the prerender pass.
export const dynamic = 'force-dynamic';

export default function RootLayout({ children }: { children: ReactNode }) {
  return (
    <html lang="vi">
      <body className="min-h-screen">
        <Providers>{children}</Providers>
      </body>
    </html>
  );
}
