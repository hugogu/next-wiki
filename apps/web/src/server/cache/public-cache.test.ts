import { afterEach, describe, expect, it, vi } from 'vitest';

const cache = vi.hoisted(() => ({
  revalidatePath: vi.fn(),
  revalidateTag: vi.fn(),
}));

vi.mock('next/cache', () => cache);

import { runWithoutDataCache, shouldUseDataCache } from './public-cache';

describe('public cache context', () => {
  afterEach(() => {
    cache.revalidatePath.mockReset();
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
});
