import type { Actor } from '@/server/permissions';
import type { PageSummary } from '@next-wiki/shared';

export type PageContext = {
  path: string;
  title: string;
  status: 'draft' | 'published';
  canEdit: boolean;
  canPublish: boolean;
  version: number;
} | null;

export type AppShellProps = {
  user: Actor;
  pages: PageSummary[];
  pageContext?: PageContext;
  admin?: boolean;
  userCenter?: boolean;
  children: React.ReactNode;
};
