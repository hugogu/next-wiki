import { afterEach, describe, expect, it, vi } from 'vitest';
import { buildPublicWarmupUrl, runPublicPageWarmup } from './public-page-warmup';

afterEach(() => {
  vi.unstubAllGlobals();
});

describe('public page ISR warmup', () => {
  it('keeps queued paths on the configured internal origin', () => {
    expect(buildPublicWarmupUrl('/guides/intro', 'http://127.0.0.1:3000')).toBe(
      'http://127.0.0.1:3000/guides/intro',
    );
    expect(() => buildPublicWarmupUrl('//external.example')).toThrow('absolute-path');
  });

  it('requests and drains the local ISR response', async () => {
    const fetchMock = vi.fn().mockResolvedValue(new Response('cached page', { status: 200 }));
    vi.stubGlobal('fetch', fetchMock);

    await runPublicPageWarmup('/guides/intro');

    expect(fetchMock).toHaveBeenCalledWith(
      expect.stringContaining('/guides/intro'),
      expect.objectContaining({ cache: 'no-store' }),
    );
  });
});
