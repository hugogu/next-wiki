import { describe, expect, it } from 'vitest';
import { isExternalReaderPath } from './proxy';

describe('isExternalReaderPath', () => {
  it('only identifies routable public page paths', () => {
    expect(isExternalReaderPath('/wiki/welcome')).toBe(true);
    expect(isExternalReaderPath('/sitemap.xml')).toBe(false);
    expect(isExternalReaderPath('/robots.txt')).toBe(false);
    expect(isExternalReaderPath('/_next/data/build-id/wiki/welcome.json')).toBe(false);
    expect(isExternalReaderPath('/api/health')).toBe(false);
  });
});
