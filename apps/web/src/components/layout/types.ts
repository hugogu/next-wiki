import type { Actor } from '@/server/permissions';
import type { AiEntitlementView, PageSummary } from '@next-wiki/shared';

export type PageContext = {
  pageId?: string;
  revisionId?: string;
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
  aiEntitlements?: AiEntitlementView | null;
  footer?: React.ReactNode;
  siteName: string;
  children: React.ReactNode;
};
