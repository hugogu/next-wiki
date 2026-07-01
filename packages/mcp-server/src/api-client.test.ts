import { describe, expect, it, vi } from 'vitest';
import { WikiApiClient, WikiApiClientError } from './api-client';

describe('WikiApiClient', () => {
  const baseUrl = 'http://localhost:3000/api/v1';
  const apiKey = 'test-key';

  function createClient() {
    return new WikiApiClient(baseUrl, apiKey);
  }

  it('adds authorization header', async () => {
    const fetchMock = vi.fn().mockResolvedValue(
      new Response(JSON.stringify({ items: [], nextCursor: null }), { status: 200 }),
    );
    globalThis.fetch = fetchMock;

    const client = createClient();
    await client.listPages({});

    expect(fetchMock).toHaveBeenCalledTimes(1);
    const [, init] = fetchMock.mock.calls[0] as [unknown, RequestInit];
    expect((init.headers as Headers).get('Authorization')).toBe('Bearer test-key');
  });

  it('throws WikiApiClientError on error response', async () => {
    globalThis.fetch = vi.fn().mockResolvedValue(
      new Response(JSON.stringify({ code: 'FORBIDDEN', message: 'No access' }), { status: 403 }),
    );

    const client = createClient();
    await expect(client.getPage('page-id')).rejects.toSatisfy((error: unknown) => {
      return (
        error instanceof WikiApiClientError &&
        error.message === 'No access' &&
        error.code === 'FORBIDDEN' &&
        error.statusCode === 403
      );
    });
  });

  it('encodes search query parameters', async () => {
    const fetchMock = vi.fn().mockResolvedValue(
      new Response(JSON.stringify({ items: [], nextCursor: null }), { status: 200 }),
    );
    globalThis.fetch = fetchMock;

    const client = createClient();
    await client.searchPages({ q: 'hello world', scope: 'title', limit: 10 });

    expect(fetchMock).toHaveBeenCalledTimes(1);
    const [url] = fetchMock.mock.calls[0] as [URL];
    expect(url.toString()).toContain('q=hello+world');
    expect(url.toString()).toContain('scope=title');
    expect(url.toString()).toContain('limit=10');
  });
});
