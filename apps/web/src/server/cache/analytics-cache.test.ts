import { afterAll, beforeEach, describe, expect, it, vi } from 'vitest';
import { eq } from 'drizzle-orm';

/**
 * `unstable_cache`/`revalidateTag` throw ("incrementalCache missing" /
 * "static generation store missing") outside a real Next.js request scope,
 * so they cannot run against vitest directly (confirmed by probing both
 * directly). This test stands in a minimal in-memory memoizer for
 * `unstable_cache`, wired so the mocked `invalidateSiteShellCache` clears it
 * — reproducing the cache-hit / cache-invalidation contract without the
 * unavailable Next.js runtime machinery.
 */
const cacheStore = vi.hoisted(() => new Map<string, unknown>());

vi.mock('next/cache', () => ({
  unstable_cache:
    (fn: (...args: unknown[]) => Promise<unknown>, keyParts: string[]) =>
    async (...args: unknown[]) => {
      const key = keyParts.join(':');
      if (!cacheStore.has(key)) cacheStore.set(key, await fn(...args));
      return cacheStore.get(key);
    },
}));

const publicCache = vi.hoisted(() => ({
  SITE_SHELL_CACHE_TAG: 'site-shell',
  PUBLIC_CONTENT_CACHE_TAG: 'public-content',
  shouldUseDataCache: () => true,
  invalidateSiteShellCache: vi.fn(() => cacheStore.clear()),
  invalidatePublicContentCache: vi.fn(),
  invalidatePublicLinkPaths: vi.fn(),
}));
vi.mock('@/server/cache/public-cache', () => publicCache);

import { db, closeDb } from '@/server/db';
import * as schema from '@/server/db/schema';
import * as authService from '@/server/services/auth';
import { buildUserCtx } from '@/server/permissions';
import { getActiveAnalyticsScriptContent, updateAnalyticsProvider } from '@/server/services/analytics';

const VALID_BAIDU_ID = 'abcdef0123456789abcdef0123456789';

async function createAdmin() {
  const { userId } = await authService.register({
    email: `analytics-cache-${Math.random().toString(36).slice(2)}@example.com`,
    password: 'Password123!',
  });
  await db.update(schema.users).set({ role: 'admin' }).where(eq(schema.users.id, userId));
  return buildUserCtx(userId, 'admin');
}

describe('analytics script content cache', () => {
  beforeEach(async () => {
    cacheStore.clear();
    vi.clearAllMocks();
    await db.delete(schema.analyticsProviderSettings);
  });

  afterAll(async () => {
    await db.delete(schema.analyticsProviderSettings);
    await closeDb();
  });

  it('serves the second read from cache (no second DB query), then reflects a mutation after invalidation', async () => {
    const ctx = await createAdmin();
    await updateAnalyticsProvider(ctx, 'baidu_tongji', { enabled: true, trackingId: VALID_BAIDU_ID });
    cacheStore.clear(); // the write above invalidates as a side effect; start the read-cache measurement fresh.

    const findManySpy = vi.spyOn(db.query.analyticsProviderSettings, 'findMany');

    const first = await getActiveAnalyticsScriptContent();
    const second = await getActiveAnalyticsScriptContent();
    expect(second).toBe(first);
    expect(findManySpy).toHaveBeenCalledTimes(1);
    expect(first).toContain('hm.baidu.com');

    await updateAnalyticsProvider(ctx, 'baidu_tongji', { enabled: false, trackingId: VALID_BAIDU_ID });
    expect(publicCache.invalidateSiteShellCache).toHaveBeenCalled();

    const afterDisable = await getActiveAnalyticsScriptContent();
    expect(afterDisable).not.toContain('hm.baidu.com');

    findManySpy.mockRestore();
  });
});
