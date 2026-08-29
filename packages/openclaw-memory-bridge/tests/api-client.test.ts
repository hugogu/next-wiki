import { afterEach, describe, expect, it, vi } from 'vitest';
import { ApiClientError, WikiApiClient } from '../src/api-client';

const CONFIG = { wikiApiBaseUrl: 'https://wiki.example.com/api/v1', credential: 'nwk_test_secret' };

afterEach(() => {
  vi.unstubAllGlobals();
});

describe('WikiApiClient', () => {
  it('sends a Bearer-authenticated request with the provider version header', async () => {
    const fetchMock = vi.fn().mockResolvedValue(new Response(JSON.stringify({ status: 'healthy' }), { status: 200 }));
    vi.stubGlobal('fetch', fetchMock);

    const client = new WikiApiClient(CONFIG);
    const result = await client.diagnostics();

    expect(result).toEqual({ status: 'healthy' });
    const [url, init] = fetchMock.mock.calls[0] as [string, RequestInit];
    expect(url).toBe('https://wiki.example.com/api/v1/memory/diagnostics');
    expect(init.method).toBe('GET');
    const headers = init.headers as Record<string, string>;
    expect(headers.Authorization).toBe('Bearer nwk_test_secret');
    expect(headers['X-Next-Wiki-Memory-Provider-Version']).toBeTruthy();
  });

  it('never puts the credential in the request body', async () => {
    const fetchMock = vi.fn().mockResolvedValue(new Response(JSON.stringify({}), { status: 200 }));
    vi.stubGlobal('fetch', fetchMock);
    const client = new WikiApiClient(CONFIG);
    await client.save({ idempotencyKey: 'k', content: 'note' });
    const [, init] = fetchMock.mock.calls[0] as [string, RequestInit];
    expect(String(init.body)).not.toContain('nwk_test_secret');
  });

  it('maps a 401 to an unauthorized ApiClientError without echoing the response body', async () => {
    const fetchMock = vi.fn().mockImplementation(async () => new Response(JSON.stringify({ secretDetail: 'do-not-leak' }), { status: 401 }));
    vi.stubGlobal('fetch', fetchMock);
    const client = new WikiApiClient(CONFIG);
    await expect(client.diagnostics()).rejects.toMatchObject({ code: 'unauthorized' });
    try {
      await client.diagnostics();
      expect.unreachable();
    } catch (error) {
      expect(error).toBeInstanceOf(ApiClientError);
      expect(String(error)).not.toContain('do-not-leak');
    }
  });

  it('maps a 409 to a not_durable error for capture-status polling', async () => {
    const fetchMock = vi.fn().mockResolvedValue(new Response('{}', { status: 409 }));
    vi.stubGlobal('fetch', fetchMock);
    const client = new WikiApiClient(CONFIG);
    await expect(client.captureStatus('capture-1')).rejects.toMatchObject({ code: 'not_durable' });
  });

  it('rejects an oversized response instead of buffering it fully into a returned object', async () => {
    const oversized = JSON.stringify({ padding: 'x'.repeat(2_000_000) });
    const fetchMock = vi.fn().mockResolvedValue(new Response(oversized, { status: 200 }));
    vi.stubGlobal('fetch', fetchMock);
    const client = new WikiApiClient(CONFIG);
    await expect(client.recall('query', 5)).rejects.toMatchObject({ code: 'invalid_response' });
  });
});
