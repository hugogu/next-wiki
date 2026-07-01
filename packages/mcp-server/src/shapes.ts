import type {
  PublicAssetResource,
  PublicPageResource,
  PublicPageSearchResponse,
  PublicRevisionResource,
} from './api-client';

export type SearchWikiResult = {
  id: string;
  path: string;
  title: string;
  matchType: 'path' | 'title' | 'content';
  excerpt: string | null;
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
