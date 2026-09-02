export type ClientOptions = { baseUrl: string; apiKey: string; fetchImpl?: typeof fetch };
export type MirrorResult = { outcome: 'created' | 'updated' | 'unchanged'; sourcePath: string; revisionId: string; pageId: string };

export class NextWikiClient {
  private readonly fetchImpl: typeof fetch;
  constructor(private readonly options: ClientOptions) { this.fetchImpl = options.fetchImpl ?? fetch; }

  private async request<T>(path: string, init: RequestInit): Promise<T> {
    const response = await this.fetchImpl(`${this.options.baseUrl}${path}`, {
      ...init,
      headers: { 'content-type': 'application/json', 'x-next-wiki-memory-provider-version': '1', authorization: `Bearer ${this.options.apiKey}`, ...(init.headers ?? {}) },
    });
    if (!response.ok) {
      const body = await response.json().catch(() => ({})) as { code?: string };
      const error = new Error(body.code || `HTTP_${response.status}`);
      Object.assign(error, { status: response.status, retryable: response.status === 429 || response.status >= 500 });
      throw error;
    }
    return response.json() as Promise<T>;
  }

  async mirror(document: { sourcePath: string; content: string; sourceDigest: string; sourceVersion?: string; idempotencyKey: string }): Promise<MirrorResult> {
    return this.request('/api/v1/memory/wiki/documents', { method: 'PUT', body: JSON.stringify(document) });
  }

  async search(q: string, limit = 8): Promise<unknown> {
    return this.request(`/api/v1/memory/wiki/search?q=${encodeURIComponent(q)}&limit=${limit}`, { method: 'GET' });
  }

  async get(pageId: string, maxChars = 8_000): Promise<unknown> {
    return this.request(`/api/v1/memory/wiki/pages/${encodeURIComponent(pageId)}?maxChars=${maxChars}`, { method: 'GET' });
  }
}
