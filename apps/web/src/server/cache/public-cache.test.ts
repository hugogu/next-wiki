import { afterEach, describe, expect, it, vi } from 'vitest';

const cache = vi.hoisted(() => ({
  revalidatePath: vi.fn(),
  revalidateTag: vi.fn(),
}));

vi.mock('next/cache', () => cache);

import {
  HELP_NAVIGATION_CACHE_TAG,
  PUBLIC_CONTENT_CACHE_TAG,
  invalidateManagedGuideCache,
  invalidatePublicContentCache,
  runWithoutDataCache,
  shouldUseDataCache,
} from './public-cache';

describe('public cache context', () => {
  afterEach(() => {
    cache.revalidatePath.mockReset();
    cache.revalidateTag.mockReset();
    vi.unstubAllEnvs();
  });

  it('disables the Next data cache across an async background operation and restores it afterward', async () => {
    vi.stubEnv('NODE_ENV', 'production');
    vi.stubEnv('NEXT_WIKI_E2E', 'false');

    expect(shouldUseDataCache()).toBe(true);
    await runWithoutDataCache(async () => {
      expect(shouldUseDataCache()).toBe(false);
      await Promise.resolve();
      expect(shouldUseDataCache()).toBe(false);
    });
    expect(shouldUseDataCache()).toBe(true);
  });

  describe('invalidateManagedGuideCache', () => {
    it('revalidates the content and navigation tags without a site-wide layout rebuild', () => {
      vi.stubEnv('NODE_ENV', 'production');
      vi.stubEnv('NEXT_WIKI_E2E', 'false');

      invalidateManagedGuideCache();

      expect(cache.revalidateTag).toHaveBeenCalledWith(PUBLIC_CONTENT_CACHE_TAG, 'max');
      expect(cache.revalidateTag).toHaveBeenCalledWith(HELP_NAVIGATION_CACHE_TAG, 'max');
      // Unlike invalidatePublicContentCache, a managed guide write never forces
      // the full app-shell layout to rebuild.
      expect(cache.revalidatePath).not.toHaveBeenCalled();
    });

    it('is a no-op outside a request context that supports the data cache', () => {
      vi.stubEnv('NODE_ENV', 'test');

      invalidateManagedGuideCache();

      expect(cache.revalidateTag).not.toHaveBeenCalled();
    });
  });

  describe('invalidatePublicContentCache', () => {
    it('still forces the full app-shell layout to rebuild for interactive edits', () => {
      vi.stubEnv('NODE_ENV', 'production');
      vi.stubEnv('NEXT_WIKI_E2E', 'false');

      invalidatePublicContentCache();

      expect(cache.revalidateTag).toHaveBeenCalledWith(PUBLIC_CONTENT_CACHE_TAG, 'max');
      expect(cache.revalidatePath).toHaveBeenCalledWith('/', 'layout');
    });
  });
});
