import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { startWikiJsFixture } from '../../../test/wikijs-fixture';
import { fetchRemote } from './remote-fetch';

const close: (() => Promise<void>)[] = [];
afterEach(async () => {
  await Promise.all(close.splice(0).map((fn) => fn()));
});

const lookupMock = vi.hoisted(() => vi.fn());
vi.mock('node:dns/promises', async () => {
  const actual = await vi.importActual<typeof import('node:dns/promises')>('node:dns/promises');
  return { ...actual, lookup: lookupMock };
});

describe('safe remote fetch', () => {
  beforeEach(async () => {
    lookupMock.mockReset();
    const { lookup: realLookup } = await vi.importActual<typeof import('node:dns/promises')>('node:dns/promises');
    lookupMock.mockImplementation(realLookup);
  });

  it('blocks loopback unless the exact trusted origin is opted in', async () => {
    const fixture = await startWikiJsFixture((_request, response) => {
      response.setHeader('Content-Type', 'image/png');
      response.end('ok');
    });
    close.push(fixture.close);
    await expect(fetchRemote({ url: fixture.url })).rejects.toMatchObject({
      code: 'SOURCE_UNAVAILABLE',
    });
    const result = await fetchRemote({
      url: fixture.url,
      allowedPrivateOrigin: fixture.url,
    });
    expect(result.bytes.toString()).toBe('ok');
  });

  it('enforces response byte limits', async () => {
    const fixture = await startWikiJsFixture((_request, response) => response.end('12345'));
    close.push(fixture.close);
    await expect(fetchRemote({
      url: fixture.url,
      allowedPrivateOrigin: fixture.url,
      maxBytes: 2,
    })).rejects.toMatchObject({ code: 'INPUT_TOO_LARGE' });
  });

  describe('DNS resolution', () => {
    beforeEach(() => {
      lookupMock.mockReset();
    });

    it('retries transient DNS failures and eventually succeeds', async () => {
      const fixture = await startWikiJsFixture((_request, response) => {
        response.setHeader('Content-Type', 'image/png');
        response.end('ok');
      });
      close.push(fixture.close);
      const url = new URL(fixture.url);
      lookupMock
        .mockRejectedValueOnce(Object.assign(new Error('timeout'), { code: 'ETIMEOUT' }))
        .mockRejectedValueOnce(Object.assign(new Error('temporary failure'), { code: 'EAI_AGAIN' }))
        .mockResolvedValueOnce([{ address: url.hostname, family: 4 }]);

      const result = await fetchRemote({
        url: fixture.url,
        allowedPrivateOrigin: fixture.url,
      });
      expect(result.bytes.toString()).toBe('ok');
      expect(lookupMock).toHaveBeenCalledTimes(3);
    });

    it('does not retry permanent DNS failures', async () => {
      lookupMock.mockRejectedValue(Object.assign(new Error('not found'), { code: 'ENOTFOUND' }));
      await expect(fetchRemote({ url: 'https://wiki.example.com/page' })).rejects.toMatchObject({
        code: 'SOURCE_UNAVAILABLE',
        message: 'Remote host cannot be resolved',
      });
      expect(lookupMock).toHaveBeenCalledTimes(1);
    });
  });
});
