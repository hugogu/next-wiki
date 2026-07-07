import { describe, expect, it } from 'vitest';
import { resolveWikiJsImageUrl } from './transfer-wikijs-assets';

describe('resolveWikiJsImageUrl', () => {
  const baseUrl = 'https://wiki.example.com';

  it('strips locale prefixes from relative page paths and root-relative image URLs', () => {
    const { url, sameOrigin } = resolveWikiJsImageUrl({
      baseUrl,
      pagePath: '/zh/docs/foo',
      imageUrl: '/zh/assets/x.png',
    });
    expect(url.toString()).toBe('https://wiki.example.com/assets/x.png');
    expect(sameOrigin).toBe(true);
  });

  it('strips locale prefixes from absolute same-origin image URLs', () => {
    const { url } = resolveWikiJsImageUrl({
      baseUrl,
      pagePath: '/docs/foo',
      imageUrl: 'https://wiki.example.com/en-US/assets/x.png',
    });
    expect(url.toString()).toBe('https://wiki.example.com/assets/x.png');
  });

  it('does not strip locale prefixes from cross-origin image URLs', () => {
    const { url, sameOrigin } = resolveWikiJsImageUrl({
      baseUrl,
      pagePath: '/docs/foo',
      imageUrl: 'https://cdn.example.com/en/assets/x.png',
    });
    expect(url.toString()).toBe('https://cdn.example.com/en/assets/x.png');
    expect(sameOrigin).toBe(false);
  });

  it('resolves path-relative image URLs against the locale-stripped page path', () => {
    const { url } = resolveWikiJsImageUrl({
      baseUrl,
      pagePath: '/zh/docs/foo',
      imageUrl: './x.png',
    });
    expect(url.toString()).toBe('https://wiki.example.com/docs/x.png');
  });

  it('preserves non-language short segments (false-positive guard)', () => {
    const { url, sameOrigin } = resolveWikiJsImageUrl({
      baseUrl,
      pagePath: '/docs/foo',
      imageUrl: '/us/assets/x.png',
    });
    expect(url.toString()).toBe('https://wiki.example.com/us/assets/x.png');
    expect(sameOrigin).toBe(true);
  });

  it('resolves path-relative URLs correctly under a subpath-mounted wiki', () => {
    const { url } = resolveWikiJsImageUrl({
      baseUrl: 'https://example.com/wiki/',
      pagePath: '/zh/docs/foo',
      imageUrl: '../assets/x.png',
    });
    expect(url.toString()).toBe('https://example.com/wiki/assets/x.png');
  });
});
