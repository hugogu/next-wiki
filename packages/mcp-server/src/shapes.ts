import type {
  PublicAssetResource,
  PublicNeighborhoodResponse,
  PublicOutboundLinksResponse,
  PublicPageBatchDeleteResult,
  PublicPageBatchUpdateResult,
  PublicPageResource,
  PublicPageSearchResponse,
  PublicPageTreeNode,
  PublicPageTreeResponse,
  PublicRevisionResource,
  PublicSemanticSearchAction,
} from './api-client';

export type SearchWikiResult = {
  id: string;
  path: string;
  title: string;
  matchType: 'path' | 'title' | 'content';
  excerpt: string | null;
  score: number | null;
  frontmatter: Record<string, unknown> | null;
};

export function searchWikiResponse(source: PublicPageSearchResponse): {
  results: SearchWikiResult[];
  hasMore: boolean;
} {
  return {
    results: source.items.map((item) => ({
      id: item.page.id,
      path: item.page.path,
      title: item.page.title,
      matchType: item.matchType,
      excerpt: item.excerpt,
      score: item.score,
      frontmatter: item.page.frontmatter ?? null,
    })),
    hasMore: source.nextCursor !== null,
  };
}

export type PageListItem = {
  id: string;
  path: string;
  title: string;
  status: string;
  locale: string;
  metadata?: PublicPageResource['metadata'];
};

export function listPagesResponse(source: { items: PublicPageResource[]; nextCursor: string | null }): {
  pages: PageListItem[];
  hasMore: boolean;
  nextCursor: string | null;
} {
  return {
    pages: source.items.map((page) => ({
      id: page.id,
      path: page.path,
      title: page.title,
      status: page.status,
      locale: page.locale,
      metadata: page.metadata,
    })),
    hasMore: source.nextCursor !== null,
    nextCursor: source.nextCursor,
  };
}

export function getPageResponse(source: PublicPageResource): {
  id: string;
  path: string;
  title: string;
  locale: string;
  status: string;
  contentSource?: string;
  latestRevisionId?: string;
  publishedRevisionId?: string;
  updatedAt: string;
  metadata?: PublicPageResource['metadata'];
} {
  return {
    id: source.id,
    path: source.path,
    title: source.title,
    locale: source.locale,
    status: source.status,
    contentSource: source.contentSource,
    latestRevisionId: source.latestRevision?.id,
    publishedRevisionId: source.publishedRevision?.id,
    updatedAt: source.updatedAt,
    metadata: source.metadata,
  };
}

export function createPageResponse(source: PublicPageResource): {
  id: string;
  path: string;
  title: string;
  status: string;
  revisionId?: string;
} {
  return {
    id: source.id,
    path: source.path,
    title: source.title,
    status: source.status,
    revisionId: source.latestRevision?.id,
  };
}

export function saveDraftResponse(source: PublicRevisionResource): {
  revisionId: string;
  version: number;
  status: string;
} {
  return {
    revisionId: source.id,
    version: source.version,
    status: source.status,
  };
}

export function updatePropertiesResponse(source: PublicPageResource): {
  id: string;
  path: string;
  title: string;
  updatedAt: string;
} {
  return {
    id: source.id,
    path: source.path,
    title: source.title,
    updatedAt: source.updatedAt,
  };
}

export function publishPageResponse(source: PublicPageResource): {
  id: string;
  path: string;
  title: string;
  status: string;
  publishedRevisionId?: string;
  publishedAt?: string;
} {
  return {
    id: source.id,
    path: source.path,
    title: source.title,
    status: source.status,
    publishedRevisionId: source.publishedRevision?.id,
    publishedAt: source.publishedRevision?.publishedAt ?? undefined,
  };
}

export type RevisionListItem = {
  id: string;
  version: number;
  status: string;
  author: { id: string | null; displayName: string | null };
  createdAt: string;
  publishedAt: string | null;
};

export function listRevisionsResponse(source: { items: PublicRevisionResource[]; nextCursor: string | null }): {
  revisions: RevisionListItem[];
  hasMore: boolean;
  nextCursor: string | null;
} {
  return {
    revisions: source.items.map((revision) => ({
      id: revision.id,
      version: revision.version,
      status: revision.status,
      author: revision.author,
      createdAt: revision.createdAt,
      publishedAt: revision.publishedAt,
    })),
    hasMore: source.nextCursor !== null,
    nextCursor: source.nextCursor,
  };
}

export function getRevisionResponse(source: PublicRevisionResource): {
  id: string;
  version: number;
  status: string;
  contentType: string;
  contentSource?: string;
  author: { id: string | null; displayName: string | null };
  createdAt: string;
  publishedAt: string | null;
  canPublish: boolean;
} {
  return {
    id: source.id,
    version: source.version,
    status: source.status,
    contentType: source.contentType,
    contentSource: source.contentSource,
    author: source.author,
    createdAt: source.createdAt,
    publishedAt: source.publishedAt,
    canPublish: source.canPublish,
  };
}

export function uploadImageResponse(source: PublicAssetResource): {
  id: string;
  url: string;
  markdown: string;
  contentType: string;
  sizeBytes: number;
} {
  return {
    id: source.id,
    url: source.url,
    markdown: source.markdown,
    contentType: source.contentType,
    sizeBytes: source.sizeBytes,
  };
}

export type TreeNode = {
  path: string;
  segment: string;
  title: string | null;
  pageId: string | null;
  status: string | null;
  children: TreeNode[];
};

function flattenTree(node: PublicPageTreeNode): TreeNode {
  return {
    path: node.path,
    segment: node.segment,
    title: node.title,
    pageId: node.pageId,
    status: node.status,
    children: node.children.map(flattenTree),
  };
}

export function pageTreeResponse(source: PublicPageTreeResponse): {
  root: TreeNode;
  pageCount: number;
} {
  return {
    root: flattenTree(source.root),
    pageCount: source.pageCount,
  };
}

// ---- 010: AI Curation API ----

export type SemanticSearchUsage = { inputTokens?: number; requestId?: string };

export function submitSemanticSearchResponse(source: PublicSemanticSearchAction): {
  id: string;
  status: string;
  createdAt: string;
  expiresAt: string;
  pollUrl?: string;
} {
  return {
    id: source.id,
    status: source.status,
    createdAt: source.createdAt,
    expiresAt: source.expiresAt,
    pollUrl: source.pollUrl,
  };
}

export type SemanticSearchResultItem = {
  pageId: string;
  path: string;
  title: string;
  score: number;
  excerpt: string;
  citations: Array<{ chunkId: string; revisionId: string; contentHash: string }>;
};

export function getSemanticSearchResultsResponse(source: PublicSemanticSearchAction): {
  id: string;
  status: string;
  createdAt: string;
  startedAt: string | null;
  finishedAt: string | null;
  expiresAt: string;
  items: SemanticSearchResultItem[];
  error: { code?: string; message?: string } | null;
  usage?: SemanticSearchUsage;
} {
  return {
    id: source.id,
    status: source.status,
    createdAt: source.createdAt,
    startedAt: source.startedAt ?? null,
    finishedAt: source.finishedAt ?? null,
    expiresAt: source.expiresAt,
    items: source.items ?? [],
    error: source.error ?? null,
    usage: source.usage,
  };
}

export function getOutboundLinksResponse(source: PublicOutboundLinksResponse): PublicOutboundLinksResponse {
  return source;
}

export function getNeighborhoodResponse(source: PublicNeighborhoodResponse): PublicNeighborhoodResponse {
  return source;
}

export function batchUpdatePagesResponse(source: PublicPageBatchUpdateResult): PublicPageBatchUpdateResult {
  return source;
}

export function batchSoftDeletePagesResponse(source: PublicPageBatchDeleteResult): PublicPageBatchDeleteResult {
  return source;
}
