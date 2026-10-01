import { afterEach, describe, expect, it, vi } from 'vitest';
import { apiPost } from './client';

afterEach(() => {
  vi.unstubAllGlobals();
});

function stubFetch(handler: (init: RequestInit) => Promise<Response>) {
  const fetchMock = vi.fn((_path: string, init: RequestInit) => handler(init));
  vi.stubGlobal('fetch', fetchMock);
  return fetchMock;
}

const json = (body: unknown, status = 200) => new Response(JSON.stringify(body), { status });

describe('apiPost', () => {
  it('posts the input as JSON', async () => {
    const fetchMock = stubFetch(async () => json({ html: '<p>hi</p>' }));

    await expect(apiPost('/api/preview', { contentSource: 'hi' })).resolves.toEqual({ html: '<p>hi</p>' });

    expect(fetchMock).toHaveBeenCalledWith(
      '/api/preview',
      expect.objectContaining({ method: 'POST', body: JSON.stringify({ contentSource: 'hi' }) }),
    );
  });

  it('forwards an abort signal to fetch so a caller can cancel the request', async () => {
    const controller = new AbortController();
    const fetchMock = stubFetch(async () => json({}));

    await apiPost('/api/preview', { contentSource: 'hi' }, { signal: controller.signal });

    expect(fetchMock.mock.calls[0]?.[1].signal).toBe(controller.signal);
  });

  it('rejects once the signal aborts an in-flight request', async () => {
    const controller = new AbortController();
    stubFetch(
      (init) =>
        new Promise((_resolve, reject) => {
          init.signal?.addEventListener('abort', () => reject(new DOMException('aborted', 'AbortError')));
        }),
    );

    const request = apiPost('/api/preview', { contentSource: 'hi' }, { signal: controller.signal });
    controller.abort();

    await expect(request).rejects.toMatchObject({ name: 'AbortError' });
  });

  it('sends no signal when the caller does not supply one', async () => {
    const fetchMock = stubFetch(async () => json({}));

    await apiPost('/api/anything', {});

    expect(fetchMock.mock.calls[0]?.[1].signal).toBeUndefined();
  });

  it('rejects with the API error body on a non-2xx response', async () => {
    stubFetch(async () => json({ code: 'BAD_REQUEST', message: 'Invalid input' }, 400));

    await expect(apiPost('/api/preview', {})).rejects.toEqual({ code: 'BAD_REQUEST', message: 'Invalid input' });
  });
});
