import { z } from 'zod';

export const publicPageStatusSchema = z.enum(['draft', 'published', 'deleted']);
export type PublicPageStatus = z.infer<typeof publicPageStatusSchema>;

export const publicRevisionStatusSchema = z.enum(['draft', 'published']);
export type PublicRevisionStatus = z.infer<typeof publicRevisionStatusSchema>;

export const publicAuthorSchema = z.object({
  id: z.string().uuid().nullable(),
  displayName: z.string().nullable(),
});
export type PublicAuthor = z.infer<typeof publicAuthorSchema>;

export const publicRevisionSummarySchema = z.object({
  id: z.string().uuid(),
  pageId: z.string().uuid(),
  version: z.number().int().min(1),
  status: publicRevisionStatusSchema,
  contentType: z.literal('text/markdown'),
  contentHash: z.string(),
  author: publicAuthorSchema,
  createdAt: z.string(),
  publishedAt: z.string().nullable(),
  canPublish: z.boolean(),
});
export type PublicRevisionSummary = z.infer<typeof publicRevisionSummarySchema>;

export const publicRevisionResourceSchema = publicRevisionSummarySchema.extend({
  contentSource: z.string().optional(),
});
export type PublicRevisionResource = z.infer<typeof publicRevisionResourceSchema>;

export const pathSchema = z
  .string()
  .min(1)
  .max(200)
  .regex(/^[a-z0-9]([a-z0-9-/]*[a-z0-9])?$/, {
    message: 'Path must be lowercase letters, numbers, hyphens and slashes, with no leading/trailing/consecutive slashes',
  })
  .refine((value) => !value.includes('//'), {
    message: 'Path cannot contain consecutive slashes',
  });

export const publicPageIncludeSchema = z.enum(['latestRevision', 'publishedRevision']);
export type PublicPageInclude = z.infer<typeof publicPageIncludeSchema>;

export const publicPageResourceSchema = z.object({
  id: z.string().uuid(),
  spaceSlug: z.string(),
  path: pathSchema,
  locale: z.string(),
  title: z.string(),
  // Omitted by the API for list/search results; present for single-page reads and writes.
  contentSource: z.string().optional(),
  status: publicPageStatusSchema,
  author: publicAuthorSchema,
  // Omitted by the API unless requested via ?include=latestRevision.
  latestRevision: publicRevisionSummarySchema.nullable().optional(),
  // Omitted by the API unless requested via ?include=publishedRevision.
  publishedRevision: publicRevisionSummarySchema.nullable().optional(),
  createdAt: z.string(),
  updatedAt: z.string(),
  links: z.object({
    self: z.string(),
    byPath: z.string(),
    revisions: z.string(),
    drafts: z.string(),
  }),
});
export type PublicPageResource = z.infer<typeof publicPageResourceSchema>;

export const publicPageListQuerySchema = z.object({
  status: z.enum(['published', 'draft', 'all']).default('published'),
  q: z.string().min(1).max(200).optional(),
  path: pathSchema.optional(),
  pathPrefix: pathSchema.optional(),
  limit: z.coerce.number().int().min(1).max(100).default(20),
  cursor: z.string().optional(),
  order: z.enum(['path', 'recent']).default('path'),
  include: z.array(publicPageIncludeSchema).default([]),
});
export type PublicPageListQuery = z.infer<typeof publicPageListQuerySchema>;

export const publicPageListResponseSchema = z.object({
  items: z.array(publicPageResourceSchema),
  nextCursor: z.string().nullable(),
});
export type PublicPageListResponse = z.infer<typeof publicPageListResponseSchema>;

export const publicPageCreateInputSchema = z.object({
  path: pathSchema,
  locale: z.string().min(1).max(20).optional(),
  title: z.string().min(1).max(200),
  contentSource: z.string().min(1),
});
export type PublicPageCreateInput = z.infer<typeof publicPageCreateInputSchema>;

export const publicPagePropertiesInputSchema = z.object({
  path: pathSchema.optional(),
  title: z.string().min(1).max(200).optional(),
  baseRevisionId: z.string().uuid().optional(),
}).refine((value) => value.path || value.title, {
  message: 'Provide path or title',
});
export type PublicPagePropertiesInput = z.infer<typeof publicPagePropertiesInputSchema>;

export const publicRevisionListQuerySchema = z.object({
  status: z.enum(['published', 'draft', 'all']).optional(),
  limit: z.coerce.number().int().min(1).max(100).default(20),
  cursor: z.string().optional(),
});
export type PublicRevisionListQuery = z.infer<typeof publicRevisionListQuerySchema>;

export const publicRevisionListResponseSchema = z.object({
  items: z.array(publicRevisionResourceSchema),
  nextCursor: z.string().nullable(),
});
export type PublicRevisionListResponse = z.infer<typeof publicRevisionListResponseSchema>;

export const publicPublicationInputSchema = z.object({
  expectedRevisionId: z.string().uuid().optional(),
});
export type PublicPublicationInput = z.infer<typeof publicPublicationInputSchema>;

export const publicPageSearchQuerySchema = z.object({
  q: z.string().min(1).max(200),
  scope: z.enum(['path', 'title', 'content', 'all']).default('all'),
  status: z.enum(['published', 'draft', 'all']).default('published'),
  pathPrefix: pathSchema.optional(),
  limit: z.coerce.number().int().min(1).max(100).default(20),
  cursor: z.string().optional(),
  include: z.array(publicPageIncludeSchema).default([]),
  excerptLength: z.coerce.number().int().min(20).max(500).default(100),
  createdStart: z.coerce.date().optional(),
  createdEnd: z.coerce.date().optional(),
  updatedStart: z.coerce.date().optional(),
  updatedEnd: z.coerce.date().optional(),
});
export type PublicPageSearchQuery = z.infer<typeof publicPageSearchQuerySchema>;

export const publicSearchResultSchema = z.object({
  page: publicPageResourceSchema,
  matchType: z.enum(['path', 'title', 'content']),
  excerpt: z.string().nullable(),
  score: z.number().nullable(),
});
export type PublicSearchResult = z.infer<typeof publicSearchResultSchema>;

export const publicPageSearchResponseSchema = z.object({
  items: z.array(publicSearchResultSchema),
  nextCursor: z.string().nullable(),
});
export type PublicPageSearchResponse = z.infer<typeof publicPageSearchResponseSchema>;

export const publicPageTreeNodeSchema: z.ZodType<PublicPageTreeNode> = z.object({
  path: z.string(),
  segment: z.string(),
  title: z.string().nullable(),
  pageId: z.string().uuid().nullable(),
  status: publicPageStatusSchema.nullable(),
  children: z.lazy(() => z.array(publicPageTreeNodeSchema)),
});
export type PublicPageTreeNode = {
  path: string;
  segment: string;
  title: string | null;
  pageId: string | null;
  status: PublicPageStatus | null;
  children: PublicPageTreeNode[];
};

export const publicPageTreeResponseSchema = z.object({
  root: publicPageTreeNodeSchema,
  pageCount: z.number().int().nonnegative(),
});
export type PublicPageTreeResponse = z.infer<typeof publicPageTreeResponseSchema>;

export const publicAssetResourceSchema = z.object({
  id: z.string().uuid(),
  contentType: z.enum(['image/png', 'image/jpeg', 'image/gif', 'image/webp', 'image/svg+xml']),
  sizeBytes: z.number().int().nonnegative(),
  url: z.string(),
  markdown: z.string(),
  createdAt: z.string(),
});
export type PublicAssetResource = z.infer<typeof publicAssetResourceSchema>;

export type WikiApiError = {
  code: string;
  message: string;
};

export class WikiApiClientError extends Error {
  constructor(
    message: string,
    public readonly statusCode: number,
    public readonly code: string,
  ) {
    super(message);
    this.name = 'WikiApiClientError';
  }
}

function joinUrl(baseUrl: string, path: string): URL {
  const normalizedBase = baseUrl.endsWith('/') ? baseUrl : `${baseUrl}/`;
  const normalizedPath = path.startsWith('/') ? path.slice(1) : path;
  return new URL(normalizedPath, normalizedBase);
}

export class WikiApiClient {
  constructor(
    private readonly baseUrl: string,
    private readonly apiKey: string,
  ) {}

  private async request<T>(path: string, init: RequestInit = {}): Promise<T> {
    const url = joinUrl(this.baseUrl, path);
    const headers = new Headers(init.headers);
    headers.set('Authorization', `Bearer ${this.apiKey}`);
    if (init.body && !(init.body instanceof FormData) && !headers.has('Content-Type')) {
      headers.set('Content-Type', 'application/json');
    }

    const response = await fetch(url, { ...init, headers });
    if (!response.ok) {
      const body = (await response.json().catch(() => ({}))) as WikiApiError | Record<string, never>;
      throw new WikiApiClientError(
        'message' in body ? body.message : `HTTP ${response.status}`,
        response.status,
        'code' in body ? body.code : `HTTP_${response.status}`,
      );
    }

    if (response.status === 204) {
      return undefined as T;
    }

    return (await response.json()) as T;
  }

  async searchPages(query: Partial<PublicPageSearchQuery>): Promise<PublicPageSearchResponse> {
    const params = new URLSearchParams();
    params.set('q', query.q ?? '');
    if (query.scope) params.set('scope', query.scope);
    if (query.status) params.set('status', query.status);
    if (query.pathPrefix) params.set('pathPrefix', query.pathPrefix);
    if (query.limit) params.set('limit', String(query.limit));
    if (query.cursor) params.set('cursor', query.cursor);
    if (query.include?.length) params.set('include', query.include.join(','));
    if (query.excerptLength) params.set('excerptLength', String(query.excerptLength));
    if (query.createdStart) params.set('createdStart', query.createdStart.toISOString());
    if (query.createdEnd) params.set('createdEnd', query.createdEnd.toISOString());
    if (query.updatedStart) params.set('updatedStart', query.updatedStart.toISOString());
    if (query.updatedEnd) params.set('updatedEnd', query.updatedEnd.toISOString());
    return this.request<PublicPageSearchResponse>(`/search/pages?${params.toString()}`);
  }

  async listPages(query: Partial<PublicPageListQuery>): Promise<{ items: PublicPageResource[]; nextCursor: string | null }> {
    const params = new URLSearchParams();
    if (query.status) params.set('status', query.status);
    if (query.q) params.set('q', query.q);
    if (query.path) params.set('path', query.path);
    if (query.pathPrefix) params.set('pathPrefix', query.pathPrefix);
    if (query.limit) params.set('limit', String(query.limit));
    if (query.cursor) params.set('cursor', query.cursor);
    if (query.order) params.set('order', query.order);
    if (query.include?.length) params.set('include', query.include.join(','));
    return this.request<{ items: PublicPageResource[]; nextCursor: string | null }>(`/pages?${params.toString()}`);
  }

  async getPageTree(query: { status?: 'published' | 'draft' | 'all'; pathPrefix?: string }): Promise<PublicPageTreeResponse> {
    const params = new URLSearchParams();
    if (query.status) params.set('status', query.status);
    if (query.pathPrefix) params.set('pathPrefix', query.pathPrefix);
    return this.request<PublicPageTreeResponse>(`/tree?${params.toString()}`);
  }

  // Always requests both revision relations: get_page surfaces latestRevisionId/
  // publishedRevisionId, which the API omits by default (see shapes.ts getPageResponse).
  async getPage(id: string): Promise<PublicPageResource> {
    return this.request<PublicPageResource>(`/pages/${id}?include=latestRevision,publishedRevision`);
  }

  // include=latestRevision so the response carries the initial draft's revisionId.
  async createPage(input: PublicPageCreateInput): Promise<PublicPageResource> {
    return this.request<PublicPageResource>('/pages?include=latestRevision', {
      method: 'POST',
      body: JSON.stringify(input),
    });
  }

  async saveDraft(pageId: string, input: { title: string; contentSource: string; baseRevisionId?: string }): Promise<PublicRevisionResource> {
    return this.request<PublicRevisionResource>(`/pages/${pageId}/drafts`, {
      method: 'POST',
      body: JSON.stringify(input),
    });
  }

  async updatePageProperties(pageId: string, input: PublicPagePropertiesInput): Promise<PublicPageResource> {
    return this.request<PublicPageResource>(`/pages/${pageId}`, {
      method: 'PATCH',
      body: JSON.stringify(input),
    });
  }

  // include=publishedRevision so the response carries the new published revision's id/publishedAt.
  async publishPage(pageId: string, version: number, input: PublicPublicationInput): Promise<PublicPageResource> {
    return this.request<PublicPageResource>(`/pages/${pageId}/revisions/${version}/publication?include=publishedRevision`, {
      method: 'POST',
      body: JSON.stringify(input),
    });
  }

  async listRevisions(pageId: string, query: Partial<PublicRevisionListQuery>): Promise<PublicRevisionListResponse> {
    const params = new URLSearchParams();
    if (query.status) params.set('status', query.status);
    if (query.limit) params.set('limit', String(query.limit));
    if (query.cursor) params.set('cursor', query.cursor);
    return this.request<PublicRevisionListResponse>(`/pages/${pageId}/revisions?${params.toString()}`);
  }

  async getRevision(pageId: string, version: number): Promise<PublicRevisionResource> {
    return this.request<PublicRevisionResource>(`/pages/${pageId}/revisions/${version}`);
  }

  async uploadImage(file: File | Blob): Promise<PublicAssetResource> {
    const formData = new FormData();
    formData.set('file', file);

    return this.request<PublicAssetResource>('/assets', {
      method: 'POST',
      body: formData,
    });
  }
}
