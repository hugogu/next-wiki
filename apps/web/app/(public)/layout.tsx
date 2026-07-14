import type { ReactNode } from 'react';
import { PublicI18nBoundary } from '@/components/i18n/PublicI18nBoundary';

export default function PublicLayout({ children }: { children: ReactNode }) {
  return <PublicI18nBoundary>{children}</PublicI18nBoundary>;
}
