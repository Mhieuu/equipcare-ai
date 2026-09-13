import type { ReactNode } from 'react';
import './globals.css';
import { Providers } from '@/components/providers';

export const metadata = {
  title: 'EquipCare AI',
  description: 'Equipment maintenance & incident management',
};

export default function RootLayout({ children }: { children: ReactNode }) {
  return (
    <html lang="vi">
      <body className="min-h-screen">
        <Providers>{children}</Providers>
      </body>
    </html>
  );
}
