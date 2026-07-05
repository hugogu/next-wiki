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
  frontmatter: z.record(z.unknown()).nullable().optional(),
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
  frontmatter: z.record(z.unknown()).nullable().optional(),
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
  filterTag: z.string().optional(),
  filterStatus: z.string().optional(),
  filterOwner: z.string().optional(),
  filterHasFrontmatter: z.boolean().optional(),
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

export const publicBatchCreateResultSchema = z.object({
  created: z.array(
    z.object({
      id: z.string().uuid(),
      path: pathSchema,
      title: z.string(),
      revisionId: z.string().uuid(),
    }),
  ),
  count: z.number().int().nonnegative(),
});
export type PublicBatchCreateResult = z.infer<typeof publicBatchCreateResultSchema>;

export const publicBacklinkSchema = z.object({
  pageId: z.string().uuid(),
  path: pathSchema,
  title: z.string(),
  linkText: z.string(),
});
export type PublicBacklink = z.infer<typeof publicBacklinkSchema>;

export const publicBacklinksResponseSchema = z.object({
  items: z.array(publicBacklinkSchema),
});
export type PublicBacklinksResponse = z.infer<typeof publicBacklinksResponseSchema>;

export const publicRevisionDiffResponseSchema = z.object({
  fromVersion: z.number().int().min(1),
  toVersion: z.number().int().min(1),
  diff: z.string(),
  additions: z.number().int().nonnegative(),
  deletions: z.number().int().nonnegative(),
});
export type PublicRevisionDiffResponse = z.infer<typeof publicRevisionDiffResponseSchema>;

export const publicStatsResponseSchema = z.object({
  totalPages: z.number().int().nonnegative(),
  publishedPages: z.number().int().nonnegative(),
  draftPages: z.number().int().nonnegative(),
  deletedPages: z.number().int().nonnegative(),
  recentActivity: z.object({
    createdInLast7Days: z.number().int().nonnegative(),
    updatedInLast7Days: z.number().int().nonnegative(),
  }),
  directories: z.array(z.object({ segment: z.string(), pageCount: z.number().int().nonnegative() })),
  orphans: z.array(z.object({ id: z.string().uuid(), path: z.string(), title: z.string() })).optional(),
});
export type PublicStatsResponse = z.infer<typeof publicStatsResponseSchema>;

export const publicSimilarResultSchema = z.object({
  pageId: z.string().uuid(),
  path: z.string(),
  title: z.string(),
  score: z.number().min(0).max(1),
});
export type PublicSimilarResult = z.infer<typeof publicSimilarResultSchema>;

export const publicSimilarResponseSchema = z.object({
  results: z.array(publicSimilarResultSchema),
  threshold: z.number().min(0).max(1),
});
export type PublicSimilarResponse = z.infer<typeof publicSimilarResponseSchema>;

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

// ---- 010: AI Curation API ----

export const publicSemanticSearchSubmitInputSchema = z.object({
  q: z.string().trim().min(1).max(8_000),
  limit: z.number().int().min(1).max(50).default(10),
  pathPrefix: z.string().optional(),
  scope: z.enum(['path', 'title', 'content', 'all']).optional(),
  filterTag: z.union([z.string(), z.array(z.string())]).optional(),
  filterStatus: z.union([z.string(), z.array(z.string())]).optional(),
  filterOwner: z.union([z.string(), z.array(z.string())]).optional(),
  filterHasFrontmatter: z.boolean().optional(),
});
export type PublicSemanticSearchSubmitInput = z.infer<typeof publicSemanticSearchSubmitInputSchema>;

export const publicSemanticSearchCitationSchema = z.object({
  chunkId: z.string().uuid(),
  revisionId: z.string().uuid(),
  contentHash: z.string(),
});
export type PublicSemanticSearchCitation = z.infer<typeof publicSemanticSearchCitationSchema>;

export const publicSemanticSearchResultItemSchema = z.object({
  pageId: z.string().uuid(),
  path: z.string(),
  title: z.string(),
  score: z.number(),
  excerpt: z.string(),
  citations: z.array(publicSemanticSearchCitationSchema),
});
export type PublicSemanticSearchResultItem = z.infer<typeof publicSemanticSearchResultItemSchema>;

export const publicSemanticSearchActionSchema = z.object({
  id: z.string().uuid(),
  feature: z.literal('semantic_search'),
  status: z.enum(['queued', 'running', 'succeeded', 'failed', 'expired']),
  createdAt: z.string(),
  startedAt: z.string().nullable().optional(),
  finishedAt: z.string().nullable().optional(),
  expiresAt: z.string(),
  pollUrl: z.string().optional(),
  items: z.array(publicSemanticSearchResultItemSchema).optional(),
  error: z.object({ code: z.string().optional(), message: z.string().optional() }).optional(),
  usage: z.object({ inputTokens: z.number().optional(), requestId: z.string().optional() }).optional(),
});
export type PublicSemanticSearchAction = z.infer<typeof publicSemanticSearchActionSchema>;

export const publicLinkSourceSchema = z.enum(['markdown', 'wiki', 'frontmatter']);
export type PublicLinkSource = z.infer<typeof publicLinkSourceSchema>;

export const publicOutboundLinkSchema = z.object({
  source: publicLinkSourceSchema,
  targetPath: z.string(),
  targetPageId: z.string().uuid(),
  targetStatus: publicPageStatusSchema,
  linkText: z.string(),
});
export type PublicOutboundLink = z.infer<typeof publicOutboundLinkSchema>;

export const publicDanglingLinkSchema = z.object({
  source: publicLinkSourceSchema,
  targetPath: z.string(),
  targetStatus: publicPageStatusSchema.optional(),
  linkText: z.string(),
});
export type PublicDanglingLink = z.infer<typeof publicDanglingLinkSchema>;

export const publicExternalLinkSchema = z.object({
  source: z.literal('markdown'),
  href: z.string(),
  linkText: z.string(),
});
export type PublicExternalLink = z.infer<typeof publicExternalLinkSchema>;

export const publicOutboundLinksResponseSchema = z.object({
  pageId: z.string().uuid(),
  links: z.array(publicOutboundLinkSchema),
  dangling: z.array(publicDanglingLinkSchema),
  external: z.array(publicExternalLinkSchema),
});
export type PublicOutboundLinksResponse = z.infer<typeof publicOutboundLinksResponseSchema>;

export const publicNeighborNodeSchema = z.object({
  pageId: z.string().uuid(),
  path: z.string(),
  title: z.string(),
  viaLinkSource: z.enum(['markdown', 'wiki', 'frontmatter', 'backlink']).optional(),
});
export type PublicNeighborNode = z.infer<typeof publicNeighborNodeSchema>;

export const publicNeighborhoodResponseSchema = z.object({
  root: z.object({ pageId: z.string().uuid(), path: z.string(), title: z.string() }),
  tiers: z.array(z.array(publicNeighborNodeSchema)),
});
export type PublicNeighborhoodResponse = z.infer<typeof publicNeighborhoodResponseSchema>;

export const publicBatchItemResultSchema = z.object({
  pageId: z.string().uuid(),
  status: z.enum(['success', 'failed']),
  revisionId: z.string().uuid().optional(),
  preview: z.record(z.unknown()).optional(),
  error: z.object({ code: z.string(), message: z.string() }).optional(),
});
export type PublicBatchItemResult = z.infer<typeof publicBatchItemResultSchema>;

export const publicPageBatchUpdateItemInputSchema = z.object({
  pageId: z.string().uuid(),
  title: z.string().min(1).max(200).optional(),
  path: pathSchema.optional(),
  frontmatter: z.record(z.unknown().nullable()).optional(),
  baseRevisionId: z.string().uuid(),
});
export type PublicPageBatchUpdateItemInput = z.infer<typeof publicPageBatchUpdateItemInputSchema>;

export const publicPageBatchUpdateResultSchema = z.object({
  results: z.array(publicBatchItemResultSchema),
  successCount: z.number().int().nonnegative(),
  failureCount: z.number().int().nonnegative(),
  dryRun: z.boolean().optional(),
});
export type PublicPageBatchUpdateResult = z.infer<typeof publicPageBatchUpdateResultSchema>;

export const publicPageBatchDeleteResultSchema = publicPageBatchUpdateResultSchema;
export type PublicPageBatchDeleteResult = z.infer<typeof publicPageBatchDeleteResultSchema>;

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
    if (query.filterTag) params.set('filter[tag]', query.filterTag);
    if (query.filterStatus) params.set('filter[status]', query.filterStatus);
    if (query.filterOwner) params.set('filter[owner]', query.filterOwner);
    if (query.filterHasFrontmatter !== undefined) params.set('filter[has_frontmatter]', String(query.filterHasFrontmatter));
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

  async deletePage(pageId: string): Promise<void> {
    return this.request<void>(`/pages/${pageId}`, { method: 'DELETE' });
  }

  async getBacklinks(pageId: string): Promise<PublicBacklinksResponse> {
    return this.request<PublicBacklinksResponse>(`/pages/${pageId}/backlinks`);
  }

  async getDiff(pageId: string, version: number, against: number): Promise<PublicRevisionDiffResponse> {
    return this.request<PublicRevisionDiffResponse>(`/pages/${pageId}/revisions/${version}/diff?against=${against}`);
  }

  async batchCreatePages(input: { pages: PublicPageCreateInput[] }): Promise<PublicBatchCreateResult> {
    return this.request<PublicBatchCreateResult>('/pages/batch', {
      method: 'POST',
      body: JSON.stringify(input),
    });
  }

  async getStats(options?: { includeOrphans?: boolean }): Promise<PublicStatsResponse> {
    const params = new URLSearchParams();
    if (options?.includeOrphans) params.set('include', 'orphans');
    return this.request<PublicStatsResponse>(`/stats?${params.toString()}`);
  }

  async findSimilar(input: { title?: string; path?: string; threshold?: number }): Promise<PublicSimilarResponse> {
    return this.request<PublicSimilarResponse>('/search/similar', {
      method: 'POST',
      body: JSON.stringify(input),
    });
  }

  async uploadImage(file: File | Blob): Promise<PublicAssetResource> {
    const formData = new FormData();
    formData.set('file', file);

    return this.request<PublicAssetResource>('/assets', {
      method: 'POST',
      body: formData,
    });
  }

  async submitSemanticSearch(input: PublicSemanticSearchSubmitInput): Promise<PublicSemanticSearchAction> {
    return this.request<PublicSemanticSearchAction>('/search/semantic', {
      method: 'POST',
      body: JSON.stringify(input),
    });
  }

  async getSemanticSearchResults(id: string): Promise<PublicSemanticSearchAction> {
    return this.request<PublicSemanticSearchAction>(`/search/semantic/${id}`);
  }

  async getOutboundLinks(pageId: string): Promise<PublicOutboundLinksResponse> {
    return this.request<PublicOutboundLinksResponse>(`/pages/${pageId}/links`);
  }

  async getNeighborhood(node: string, depth?: number, direction?: 'out' | 'in' | 'both'): Promise<PublicNeighborhoodResponse> {
    const params = new URLSearchParams();
    params.set('node', node);
    if (depth) params.set('depth', String(depth));
    if (direction) params.set('direction', direction);
    return this.request<PublicNeighborhoodResponse>(`/graph/neighbors?${params.toString()}`);
  }

  async batchUpdatePages(
    input: { items: PublicPageBatchUpdateItemInput[] },
    options?: { dryRun?: boolean },
  ): Promise<PublicPageBatchUpdateResult> {
    const query = options?.dryRun ? '?dry_run=true' : '';
    return this.request<PublicPageBatchUpdateResult>(`/pages/batch/update${query}`, {
      method: 'POST',
      body: JSON.stringify(input),
    });
  }

  async batchSoftDeletePages(
    input: { pageIds: string[] },
    options?: { dryRun?: boolean },
  ): Promise<PublicPageBatchDeleteResult> {
    const query = options?.dryRun ? '?dry_run=true' : '';
    return this.request<PublicPageBatchDeleteResult>(`/pages/batch/delete${query}`, {
      method: 'POST',
      body: JSON.stringify(input),
    });
  }
}
