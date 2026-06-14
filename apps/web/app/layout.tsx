import type { Metadata } from 'next';
import type { ReactNode } from 'react';
import { TRPCProvider } from '@/lib/trpc/client';
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
        <TRPCProvider>{children}</TRPCProvider>
      </body>
    </html>
  );
}
