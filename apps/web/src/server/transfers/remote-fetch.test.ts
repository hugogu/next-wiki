import { afterEach, describe, expect, it } from 'vitest';
import { startWikiJsFixture } from '../../../test/wikijs-fixture';
import { fetchRemote } from './remote-fetch';

const close: (() => Promise<void>)[] = [];
afterEach(async () => {
  await Promise.all(close.splice(0).map((fn) => fn()));
});

describe('safe remote fetch', () => {
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
});
