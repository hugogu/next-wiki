import type { ReactNode } from 'react';
import { Layout } from '@/components/ui/Layout';

export function PublicLayout({ children }: { children: ReactNode }) {
  return <Layout>{children}</Layout>;
}

