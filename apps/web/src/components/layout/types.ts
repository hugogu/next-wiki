import type { Actor } from '@/server/permissions';
import type { AiEntitlementView } from '@next-wiki/shared';
import type { LazyPublicPageTreeNode } from '@/lib/page-tree';
import type { ReaderSpace } from '@/lib/path';
import type { WritingMode } from '@next-wiki/shared';

export type PageContext = {
  pageId?: string;
  revisionId?: string;
  path: string;
  /** 035: the page's canonical public address, distinct from `path`. */
  slug?: string;
  title: string;
  status: 'draft' | 'published';
  canEdit: boolean;
  canPublish: boolean;
  version: number;
  /** Source (original) path of the page, without any locale prefix. */
  sourcePath?: string;
  /** Locale codes of published translations available for this page. */
  translationLocales?: string[];
  /** The locale currently being viewed, or null when viewing the original. */
  currentLocale?: string | null;
  /** Content space that owns the reader/editor route. */
  space?: ReaderSpace;
  /** Resolved public prefix for this page's space. */
  routePrefix?: string;
  /** Frontmatter date (YYYY-MM-DD) used to seed the properties dialog. */
  date?: string | null;
  /** Page summary used to seed the properties dialog. */
  summary?: string | null;
  /** Current tags used to seed the shared properties dialog. */
  tags?: string[];
  /** Administrator-controlled anonymous-read setting. */
  visibility?: 'public' | 'registered' | 'restricted';
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
  /** NEXT_WIKI_DEMO_READONLY (see server/permissions). Shows a banner in the admin shell; enforcement itself lives in the permission chokepoint. */
  demoReadOnly?: boolean;
  userCenter?: boolean;
  /**
   * When true, the content region is locked to the viewport height so an
   * app-like page (e.g. the split editor) can own its internal scrollbars,
   * instead of the document-style sticky-footer flow used by reader pages.
   */
  fitViewport?: boolean;
  aiEntitlements?: AiEntitlementView | null;
  /**
   * True exactly when this render used a placeholder anonymous actor because
   * the document is a shared, cached (staticPublic/ISR) page (see
   * Layout.tsx) — the one case where the client must independently resolve
   * the real session, since the server-rendered actor is known-unreliable
   * for this specific visitor.
   */
  staticPublic?: boolean;
  space?: ReaderSpace;
  routePrefix?: string;
  writingMode?: WritingMode;
  footer?: React.ReactNode;
  siteName: string;
  children: React.ReactNode;
};
