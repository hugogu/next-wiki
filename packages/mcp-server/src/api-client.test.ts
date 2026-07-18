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

  it('encodes writing-space and type filters for collection queries', async () => {
    const fetchMock = vi.fn().mockResolvedValue(
      new Response(JSON.stringify({ items: [], nextCursor: null }), { status: 200 }),
    );
    globalThis.fetch = fetchMock;
    const client = createClient();

    await client.listPages({
      space: 'generated',
      filterType: 'concept',
      filterTag: 'payments',
      createdStart: new Date('2026-07-01T00:00:00.000Z'),
      createdEnd: new Date('2026-07-02T00:00:00.000Z'),
    });

    const [url] = fetchMock.mock.calls[0] as [URL];
    expect(url.toString()).toContain('space=generated');
    expect(url.toString()).toContain('filter%5Btype%5D=concept');
    expect(url.toString()).toContain('filter%5Btag%5D=payments');
    expect(url.toString()).toContain('createdStart=2026-07-01T00%3A00%3A00.000Z');
    expect(url.toString()).toContain('createdEnd=2026-07-02T00%3A00%3A00.000Z');
  });

  it('preserves the base URL path prefix when building request URLs', async () => {
    const fetchMock = vi.fn().mockResolvedValue(
      new Response(JSON.stringify({ items: [], nextCursor: null }), { status: 200 }),
    );
    globalThis.fetch = fetchMock;

    const client = createClient();
    await client.listPages({});

    const [url] = fetchMock.mock.calls[0] as [URL];
    expect(url.toString()).toBe('http://localhost:3000/api/v1/pages?');
  });

  it('requests both revision relations when fetching a single page', async () => {
    const fetchMock = vi.fn().mockResolvedValue(new Response(JSON.stringify({}), { status: 200 }));
    globalThis.fetch = fetchMock;

    const client = createClient();
    await client.getPage('page-id');

    const [url] = fetchMock.mock.calls[0] as [URL];
    expect(url.toString()).toBe('http://localhost:3000/api/v1/pages/page-id?include=latestRevision,publishedRevision');
  });

  it('requests latestRevision when creating a page', async () => {
    const fetchMock = vi.fn().mockResolvedValue(new Response(JSON.stringify({}), { status: 201 }));
    globalThis.fetch = fetchMock;

    const client = createClient();
    await client.createPage({ path: 'docs/new', title: 'New', contentSource: '# New' });

    const [url] = fetchMock.mock.calls[0] as [URL];
    expect(url.toString()).toBe('http://localhost:3000/api/v1/pages?include=latestRevision');
  });

  it('requests publishedRevision when publishing a page', async () => {
    const fetchMock = vi.fn().mockResolvedValue(new Response(JSON.stringify({}), { status: 200 }));
    globalThis.fetch = fetchMock;

    const client = createClient();
    await client.publishPage('page-id', 2, {});

    const [url] = fetchMock.mock.calls[0] as [URL];
    expect(url.toString()).toBe('http://localhost:3000/api/v1/pages/page-id/revisions/2/publication?include=publishedRevision');
  });

  it('passes include and excerptLength through to search', async () => {
    const fetchMock = vi.fn().mockImplementation(async () => new Response(JSON.stringify({ items: [], nextCursor: null }), { status: 200 }));
    globalThis.fetch = fetchMock;

    const client = createClient();
    await client.searchPages({ q: 'hello', include: ['latestRevision'], excerptLength: 50 });

    const [url] = fetchMock.mock.calls[0] as [URL];
    expect(url.toString()).toContain('include=latestRevision');
    expect(url.toString()).toContain('excerptLength=50');
  });

  it('encodes the selected space and type filter for search and trees', async () => {
    const fetchMock = vi.fn().mockImplementation(async () => new Response(JSON.stringify({ items: [], nextCursor: null }), { status: 200 }));
    globalThis.fetch = fetchMock;
    const client = createClient();

    await client.searchPages({ q: 'payment', space: 'raw', filterType: 'chat-transcript' });
    await client.getPageTree({ space: 'generated', filterType: 'concept' });

    const [searchUrl] = fetchMock.mock.calls[0] as [URL];
    const [treeUrl] = fetchMock.mock.calls[1] as [URL];
    expect(searchUrl.toString()).toContain('space=raw');
    expect(searchUrl.toString()).toContain('filter%5Btype%5D=chat-transcript');
    expect(treeUrl.toString()).toContain('space=generated');
    expect(treeUrl.toString()).toContain('filter%5Btype%5D=concept');
  });

  it('posts raw appends and scopes stats to the requested space', async () => {
    const fetchMock = vi.fn().mockImplementation(async () => new Response(JSON.stringify({}), { status: 201 }));
    globalThis.fetch = fetchMock;
    const client = createClient();

    await client.appendRawEntry('page-id', { content: 'Follow-up', source: { channel: 'support' } });
    await client.getStats({ space: 'raw' });

    const [appendUrl, appendInit] = fetchMock.mock.calls[0] as [URL, RequestInit];
    const [statsUrl] = fetchMock.mock.calls[1] as [URL];
    expect(appendUrl.toString()).toBe('http://localhost:3000/api/v1/pages/page-id/appends');
    expect(appendInit.method).toBe('POST');
    expect(appendInit.body).toBe(JSON.stringify({ content: 'Follow-up', source: { channel: 'support' } }));
    expect(statsUrl.toString()).toContain('space=raw');
  });

  it('passes created/updated date range filters through to search', async () => {
    const fetchMock = vi.fn().mockResolvedValue(new Response(JSON.stringify({ items: [], nextCursor: null }), { status: 200 }));
    globalThis.fetch = fetchMock;

    const client = createClient();
    await client.searchPages({
      q: 'hello',
      createdStart: new Date('2026-01-01T00:00:00.000Z'),
      updatedEnd: new Date('2026-06-01T00:00:00.000Z'),
    });

    const [url] = fetchMock.mock.calls[0] as [URL];
    expect(url.toString()).toContain('createdStart=2026-01-01T00%3A00%3A00.000Z');
    expect(url.toString()).toContain('updatedEnd=2026-06-01T00%3A00%3A00.000Z');
    expect(url.toString()).not.toContain('createdEnd=');
    expect(url.toString()).not.toContain('updatedStart=');
  });

  it('uploads images without dropping the base URL path prefix', async () => {
    const fetchMock = vi.fn().mockResolvedValue(
      new Response(JSON.stringify({ id: 'asset-id' }), { status: 200 }),
    );
    globalThis.fetch = fetchMock;

    const client = createClient();
    await client.uploadImage(new Blob(['data'], { type: 'image/png' }));

    const [url, init] = fetchMock.mock.calls[0] as [URL, RequestInit];
    expect(url.toString()).toBe('http://localhost:3000/api/v1/assets');
    expect(init.body).toBeInstanceOf(FormData);
    expect((init.headers as Headers).has('Content-Type')).toBe(false);
  });
});
