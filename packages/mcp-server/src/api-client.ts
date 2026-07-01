import {
  type PublicAssetResource,
  type PublicPageCreateInput,
  type PublicPageListQuery,
  type PublicPagePropertiesInput,
  type PublicPageResource,
  type PublicPageSearchQuery,
  type PublicPageSearchResponse,
  type PublicPublicationInput,
  type PublicRevisionListQuery,
  type PublicRevisionListResponse,
  type PublicRevisionResource,
} from '@next-wiki/shared';

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
