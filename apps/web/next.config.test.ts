import { describe, expect, it } from 'vitest';
import nextConfig from './next.config';

describe('reader page cache configuration', () => {
  // Next persists every distinct anonymous URL (404s included) as ~10 files that
  // it never evicts, which filled a production container with 14 GB. Re-enabling
  // the flush silently restores that unbounded growth.
  it('keeps rendered reader pages out of the container filesystem', () => {
    expect(nextConfig.experimental?.isrFlushToDisk).toBe(false);
  });

  // With nothing written to disk the memory cache is the only cache: a zero
  // budget would turn caching off entirely and re-render every reader request.
  it('keeps a non-empty memory cache so reader pages stay cached', () => {
    expect(nextConfig.cacheMaxMemorySize ?? 1).toBeGreaterThan(0);
  });
});
