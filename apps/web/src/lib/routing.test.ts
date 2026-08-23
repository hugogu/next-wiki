import { describe, expect, it } from 'vitest';
import { isReaderRewritePath, READER_REWRITE_SOURCE, RESERVED_ROUTE_PREFIXES } from './routing';

describe('isReaderRewritePath', () => {
  it('matches public reader addresses in every space', () => {
    expect(isReaderRewritePath('/wiki/welcome')).toBe(true);
    expect(isReaderRewritePath('/raw/a10c107e-a786-488e-a6b5-3e0fcd24c23f')).toBe(true);
    expect(isReaderRewritePath('/generated/reports/q3')).toBe(true);
    expect(isReaderRewritePath('/zh/wiki/welcome')).toBe(true);
    // Legacy prefix-less wiki addresses still resolve through the reader.
    expect(isReaderRewritePath('/welcome')).toBe(true);
  });

  it('leaves application routes to their own handlers', () => {
    expect(isReaderRewritePath('/')).toBe(false);
    for (const prefix of RESERVED_ROUTE_PREFIXES) {
      expect(isReaderRewritePath(`/${prefix}`)).toBe(false);
      expect(isReaderRewritePath(`/${prefix}/nested/path`)).toBe(false);
    }
  });

  it('does not mistake a page whose slug starts with a reserved prefix', () => {
    expect(isReaderRewritePath('/searchable-formats')).toBe(true);
    expect(isReaderRewritePath('/wiki/api-guidelines')).toBe(true);
  });

  it('leaves any address carrying a file extension alone', () => {
    expect(isReaderRewritePath('/sitemap.xml')).toBe(false);
    expect(isReaderRewritePath('/robots.txt')).toBe(false);
    expect(isReaderRewritePath('/wiki/welcome.md')).toBe(false);
    expect(isReaderRewritePath('/logo.png')).toBe(false);
  });

  it('is the pattern next.config.ts rewrites on', () => {
    expect(READER_REWRITE_SOURCE.startsWith('/:readerPath(')).toBe(true);
  });
});
