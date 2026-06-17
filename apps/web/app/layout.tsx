import type { Metadata } from 'next';
import type { ReactNode } from 'react';
import { ApiProvider } from '@/lib/api/provider';
import './globals.css';

export const metadata: Metadata = {
  title: {
    default: 'next-wiki',
    template: '%s | next-wiki',
  },
  description: 'An open-source, self-hosted wiki system.',
};

export default function RootLayout({ children }: { children: ReactNode }) {
  return (
    <html lang="en">
      <body className="antialiased">
        <ApiProvider>{children}</ApiProvider>
      </body>
    </html>
  );
}
