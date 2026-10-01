import { afterEach, describe, expect, it, vi } from 'vitest';

const cache = vi.hoisted(() => ({
  revalidatePath: vi.fn(),
  revalidateTag: vi.fn(),
}));

vi.mock('next/cache', () => cache);

import { invalidatePublicContentCache, runWithoutDataCache, shouldUseDataCache } from './public-cache';

describe('public cache context', () => {
  afterEach(() => {
    cache.revalidatePath.mockReset();
    cache.revalidateTag.mockReset();
    vi.unstubAllEnvs();
  });

  it('invalidates static reader documents even when E2E bypasses cached data reads', () => {
    vi.stubEnv('NODE_ENV', 'production');
    vi.stubEnv('NEXT_WIKI_E2E', 'true');
    expect(shouldUseDataCache()).toBe(false);
    invalidatePublicContentCache();
    expect(cache.revalidatePath).toHaveBeenCalledWith('/', 'layout');
    expect(cache.revalidateTag).toHaveBeenCalledWith('public-content', 'max');
  });

  it('avoids invalidation without a Next request context', () => {
    invalidatePublicContentCache();
    expect(cache.revalidatePath).not.toHaveBeenCalled();
    vi.stubEnv('NODE_ENV', 'production');
    runWithoutDataCache(() => invalidatePublicContentCache());
    expect(cache.revalidatePath).not.toHaveBeenCalled();
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
});
