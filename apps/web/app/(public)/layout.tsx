import type { ReactNode } from 'react';
import { PublicI18nBoundary } from '@/components/i18n/PublicI18nBoundary';

export const dynamic = 'force-static';
export const revalidate = 300;

export default function PublicLayout({ children }: { children: ReactNode }) {
  return <PublicI18nBoundary>{children}</PublicI18nBoundary>;
}
