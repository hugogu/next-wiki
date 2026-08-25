import { afterEach, describe, expect, it, vi } from 'vitest';

const { beginOutboundRequestCapture } = vi.hoisted(() => ({
  beginOutboundRequestCapture: vi.fn().mockResolvedValue(undefined),
}));

vi.mock('@/server/services/request-log', () => ({ beginOutboundRequestCapture }));

import { tavilyConnector } from './tavily';

afterEach(() => {
  vi.unstubAllGlobals();
  beginOutboundRequestCapture.mockClear();
});

describe('Tavily web research connector', () => {
  it('uses bounded citation-first search parameters', async () => {
    const fetchMock = vi.fn().mockResolvedValue(new Response(JSON.stringify({
      request_id: 'request-1',
      usage: { credits: 1 },
      results: [{ url: 'https://docs.example.com/a', title: 'Source', content: 'Snippet', score: 0.9 }],
    })));
    vi.stubGlobal('fetch', fetchMock);

    const result = await tavilyConnector.search({
      query: 'question', maxResults: 5, allowedDomains: ['docs.example.com'], blockedDomains: [], timeoutMs: 1_000,
    }, 'test-key');

    expect(fetchMock).toHaveBeenCalledWith('https://api.tavily.com/search', expect.objectContaining({ method: 'POST' }));
    const body = JSON.parse((fetchMock.mock.calls[0]![1] as RequestInit).body as string);
    expect(body).toMatchObject({
      search_depth: 'basic', max_results: 5, chunks_per_source: 1,
      include_answer: false, include_raw_content: false, include_images: false, auto_parameters: false,
      include_domains: ['docs.example.com'],
    });
    expect(result.candidates).toEqual([expect.objectContaining({ canonicalUrl: 'https://docs.example.com/a', title: 'Source' })]);
    expect(result.creditsUsed).toBe(1);
    expect(beginOutboundRequestCapture).toHaveBeenCalledWith(expect.objectContaining({
      source: expect.objectContaining({ sourceType: 'web_research', operation: 'search' }),
      safeMetadataOnly: true,
    }));
  });

  it('extracts bounded Markdown from one selected URL', async () => {
    const fetchMock = vi.fn().mockResolvedValue(new Response(JSON.stringify({
      results: [{ url: 'https://docs.example.com/a', raw_content: 'Extracted evidence' }],
    })));
    vi.stubGlobal('fetch', fetchMock);

    const result = await tavilyConnector.open({
      url: 'https://docs.example.com/a', query: 'question', timeoutMs: 1_000, maxChars: 8,
    }, 'test-key');

    const body = JSON.parse((fetchMock.mock.calls[0]![1] as RequestInit).body as string);
    expect(body).toMatchObject({ urls: ['https://docs.example.com/a'], extract_depth: 'basic', format: 'markdown', chunks_per_source: 1 });
    expect(result.content).toBe('Extracte');
    expect(result.contentHash).toHaveLength(64);
  });

  it('maps provider throttling and rejects malformed extraction results', async () => {
    vi.stubGlobal('fetch', vi.fn().mockResolvedValue(new Response('busy', { status: 429 })));
    await expect(tavilyConnector.search({
      query: 'question', maxResults: 1, allowedDomains: [], blockedDomains: [], timeoutMs: 1_000,
    }, 'test-key')).rejects.toThrow('WEB_RESEARCH_RATE_LIMITED');

    vi.stubGlobal('fetch', vi.fn().mockResolvedValue(new Response(JSON.stringify({ results: [{}] }))));
    await expect(tavilyConnector.open({
      url: 'https://docs.example.com/a', query: 'question', timeoutMs: 1_000, maxChars: 100,
    }, 'test-key')).rejects.toThrow('WEB_RESEARCH_EMPTY_SOURCE');
  });

  it('passes a deadline to fetch and preserves timeout failures for the call boundary', async () => {
    const timeout = new DOMException('Timed out', 'TimeoutError');
    const fetchMock = vi.fn().mockRejectedValue(timeout);
    vi.stubGlobal('fetch', fetchMock);

    await expect(tavilyConnector.search({
      query: 'question', maxResults: 1, allowedDomains: [], blockedDomains: [], timeoutMs: 1_234,
    }, 'test-key')).rejects.toBe(timeout);

    expect(fetchMock.mock.calls[0]![1]).toMatchObject({ signal: expect.any(AbortSignal) });
  });
});
