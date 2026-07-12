import type { Actor } from '@/server/permissions';
import type { AiEntitlementView } from '@next-wiki/shared';
import type { LazyPublicPageTreeNode } from '@/lib/page-tree';

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
  /**
   * Top-level sidebar entries, each carrying `hasChildren` to indicate
   * whether the node has descendants on the server. The current page's
   * ancestor chain is pre-expanded; other branches are empty arrays that the
   * Navigator hydrates lazily via `/api/v1/tree?pathPrefix=…`.
   */
  tree: LazyPublicPageTreeNode[];
  pageContext?: PageContext;
  admin?: boolean;
  userCenter?: boolean;
  /**
   * When true, the content region is locked to the viewport height so an
   * app-like page (e.g. the split editor) can own its internal scrollbars,
   * instead of the document-style sticky-footer flow used by reader pages.
   */
  fitViewport?: boolean;
  aiEntitlements?: AiEntitlementView | null;
  footer?: React.ReactNode;
  siteName: string;
  children: React.ReactNode;
};
