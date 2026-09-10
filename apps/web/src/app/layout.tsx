import type { ReactNode } from 'react';

export const metadata = {
  title: 'EquipCare AI',
  description: 'Equipment maintenance & incident management',
};

export default function RootLayout({ children }: { children: ReactNode }) {
  return (
    <html lang="vi">
      <body style={{ fontFamily: 'system-ui, sans-serif', margin: 0 }}>
        {children}
      </body>
    </html>
  );
}
