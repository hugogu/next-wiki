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

const pathSchema = z
  .string()
  .min(1)
  .max(200)
  .regex(/^[a-z0-9]([a-z0-9-/]*[a-z0-9])?$/, {
    message: 'Path must be lowercase letters, numbers, hyphens and slashes, with no leading/trailing/consecutive slashes',
  })
  .refine((value) => !value.includes('//'), {
    message: 'Path cannot contain consecutive slashes',
  });

export const publicPageResourceSchema = z.object({
  id: z.string().uuid(),
  spaceSlug: z.string(),
  path: pathSchema,
  locale: z.string(),
  title: z.string(),
  contentSource: z.string().optional(),
  status: publicPageStatusSchema,
  author: publicAuthorSchema,
  latestRevision: publicRevisionSummarySchema.nullable(),
  publishedRevision: publicRevisionSummarySchema.nullable(),
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
  limit: z.coerce.number().int().min(1).max(100).default(20),
  cursor: z.string().optional(),
  order: z.enum(['path', 'recent']).default('path'),
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
  limit: z.coerce.number().int().min(1).max(100).default(20),
  cursor: z.string().optional(),
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

export class WikiApiClient {
  constructor(
    private readonly baseUrl: string,
    private readonly apiKey: string,
  ) {}

  private async request<T>(path: string, init: RequestInit = {}): Promise<T> {
    const url = new URL(path, this.baseUrl);
    const headers = new Headers(init.headers);
    headers.set('Authorization', `Bearer ${this.apiKey}`);
    if (init.body && !headers.has('Content-Type')) {
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
    if (query.limit) params.set('limit', String(query.limit));
    if (query.cursor) params.set('cursor', query.cursor);
    return this.request<PublicPageSearchResponse>(`/search/pages?${params.toString()}`);
  }

  async listPages(query: Partial<PublicPageListQuery>): Promise<{ items: PublicPageResource[]; nextCursor: string | null }> {
    const params = new URLSearchParams();
    if (query.status) params.set('status', query.status);
    if (query.q) params.set('q', query.q);
    if (query.path) params.set('path', query.path);
    if (query.limit) params.set('limit', String(query.limit));
    if (query.cursor) params.set('cursor', query.cursor);
    if (query.order) params.set('order', query.order);
    return this.request<{ items: PublicPageResource[]; nextCursor: string | null }>(`/pages?${params.toString()}`);
  }

  async getPage(id: string): Promise<PublicPageResource> {
    return this.request<PublicPageResource>(`/pages/${id}`);
  }

  async createPage(input: PublicPageCreateInput): Promise<PublicPageResource> {
    return this.request<PublicPageResource>('/pages', {
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

  async publishPage(pageId: string, version: number, input: PublicPublicationInput): Promise<PublicPageResource> {
    return this.request<PublicPageResource>(`/pages/${pageId}/revisions/${version}/publication`, {
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

    const url = new URL('/assets', this.baseUrl);
    const headers = new Headers();
    headers.set('Authorization', `Bearer ${this.apiKey}`);

    const response = await fetch(url, { method: 'POST', headers, body: formData });
    if (!response.ok) {
      const body = (await response.json().catch(() => ({}))) as WikiApiError | Record<string, never>;
      throw new WikiApiClientError(
        'message' in body ? body.message : `HTTP ${response.status}`,
        response.status,
        'code' in body ? body.code : `HTTP_${response.status}`,
      );
    }

    return (await response.json()) as PublicAssetResource;
  }
}
