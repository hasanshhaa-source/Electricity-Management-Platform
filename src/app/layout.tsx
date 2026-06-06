import type { Metadata } from 'next';
import './globals.css';

export const metadata: Metadata = {
  title: 'ElectroManage — Electricity Bills Management',
  description: 'Multi-building electricity bills management platform',
};

export default function RootLayout({ children }: { children: React.ReactNode }) {
  return (
    <html lang="en" className="h-full">
      <body className="h-full antialiased">{children}</body>
    </html>
  );
}
