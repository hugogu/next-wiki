import { afterAll, beforeEach, describe, expect, it, vi } from 'vitest';
import { eq } from 'drizzle-orm';

const cache = vi.hoisted(() => ({
  invalidatePublicContentCache: vi.fn(),
  invalidatePublicLinkPaths: vi.fn(),
  invalidateSiteShellCache: vi.fn(),
  shouldUseDataCache: () => false,
  PUBLIC_CONTENT_CACHE_TAG: 'public-content',
  SITE_SHELL_CACHE_TAG: 'site-shell',
}));
vi.mock('@/server/cache/public-cache', () => cache);

import { db, closeDb } from '@/server/db';
import * as schema from '@/server/db/schema';
import * as authService from '@/server/services/auth';
import { buildAnonymousCtx, buildUserCtx } from '@/server/permissions';
import { DomainError } from '@/server/errors';
import {
  REGISTERED_ANALYTICS_PROVIDERS,
  buildActiveScriptContent,
  updateAnalyticsProvider,
  upsertAnalyticsProviders,
} from '@/server/services/analytics';

const VALID_BAIDU_ID = 'abcdef0123456789abcdef0123456789';
const VALID_GA_ID = 'G-A1B2C3D4E5';

async function createAdmin() {
  const { userId } = await authService.register({
    email: `analytics-${Math.random().toString(36).slice(2)}@example.com`,
    password: 'Password123!',
  });
  await db.update(schema.users).set({ role: 'admin' }).where(eq(schema.users.id, userId));
  return buildUserCtx(userId, 'admin');
}

async function createReader() {
  const { userId } = await authService.register({
    email: `analytics-r-${Math.random().toString(36).slice(2)}@example.com`,
    password: 'Password123!',
  });
  return buildUserCtx(userId, 'reader');
}

describe('analytics service', () => {
  beforeEach(async () => {
    vi.clearAllMocks();
    await db.delete(schema.analyticsProviderSettings);
  });

  afterAll(async () => {
    await db.delete(schema.analyticsProviderSettings);
    await closeDb();
  });

  describe('buildScriptContent', () => {
    it('interpolates the Tracking ID into the Baidu Tongji loader with no nested <script> tags', () => {
      const baidu = REGISTERED_ANALYTICS_PROVIDERS.find((p) => p.provider === 'baidu_tongji')!;
      const content = baidu.buildScriptContent(VALID_BAIDU_ID);
      expect(content).toContain(`hm.baidu.com/hm.js?${VALID_BAIDU_ID}`);
      expect(content).not.toContain('<script');
    });

    it('interpolates the Tracking ID into the Google Analytics loader with no nested <script> tags', () => {
      const ga = REGISTERED_ANALYTICS_PROVIDERS.find((p) => p.provider === 'google_analytics')!;
      const content = ga.buildScriptContent(VALID_GA_ID);
      expect(content).toContain(`googletagmanager.com/gtag/js?id=${VALID_GA_ID}`);
      expect(content).toContain(`gtag('config', '${VALID_GA_ID}');`);
      expect(content).not.toContain('<script');
    });
  });

  describe('trackingIdPattern', () => {
    it('rejects empty strings, special characters, and out-of-format values for baidu_tongji', () => {
      const baidu = REGISTERED_ANALYTICS_PROVIDERS.find((p) => p.provider === 'baidu_tongji')!;
      expect(baidu.trackingIdPattern.test('')).toBe(false);
      expect(baidu.trackingIdPattern.test('not-hex-chars!!')).toBe(false);
      expect(baidu.trackingIdPattern.test('abc')).toBe(false);
      expect(baidu.trackingIdPattern.test(`${VALID_BAIDU_ID}"</script>`)).toBe(false);
      expect(baidu.trackingIdPattern.test(VALID_BAIDU_ID)).toBe(true);
    });

    it('rejects empty strings, special characters, and out-of-format values for google_analytics', () => {
      const ga = REGISTERED_ANALYTICS_PROVIDERS.find((p) => p.provider === 'google_analytics')!;
      expect(ga.trackingIdPattern.test('')).toBe(false);
      expect(ga.trackingIdPattern.test('UA-12345-1')).toBe(false);
      expect(ga.trackingIdPattern.test('g-a1b2c3')).toBe(false);
      expect(ga.trackingIdPattern.test(VALID_GA_ID)).toBe(true);
    });
  });

  describe('buildActiveScriptContent', () => {
    function row(overrides: Partial<typeof schema.analyticsProviderSettings.$inferSelect>) {
      return {
        provider: 'baidu_tongji',
        enabled: false,
        trackingId: null,
        updatedBy: null,
        createdAt: new Date(),
        updatedAt: new Date(),
        ...overrides,
      } as typeof schema.analyticsProviderSettings.$inferSelect;
    }

    it('skips disabled providers and providers with no Tracking ID', () => {
      const content = buildActiveScriptContent([
        row({ provider: 'baidu_tongji', enabled: false, trackingId: VALID_BAIDU_ID }),
        row({ provider: 'google_analytics', enabled: true, trackingId: null }),
      ]);
      expect(content).toBe('');
    });

    it('wraps each enabled provider block in an independent try/catch', () => {
      const content = buildActiveScriptContent([
        row({ provider: 'baidu_tongji', enabled: true, trackingId: VALID_BAIDU_ID }),
        row({ provider: 'google_analytics', enabled: true, trackingId: VALID_GA_ID }),
      ]);
      const tryBlocks = content.match(/try \{/g) ?? [];
      const catchBlocks = content.match(/\} catch \(e\) \{/g) ?? [];
      expect(tryBlocks).toHaveLength(2);
      expect(catchBlocks).toHaveLength(2);
      expect(content).toContain('hm.baidu.com');
      expect(content).toContain('googletagmanager.com');
    });

    it('returns an empty string when no providers are enabled', () => {
      expect(buildActiveScriptContent([])).toBe('');
      expect(
        buildActiveScriptContent([row({ provider: 'baidu_tongji', enabled: false, trackingId: VALID_BAIDU_ID })]),
      ).toBe('');
    });

    it('defensively skips a stored Tracking ID that fails the regex', () => {
      const spy = vi.spyOn(console, 'error').mockImplementation(() => {});
      const content = buildActiveScriptContent([
        row({ provider: 'baidu_tongji', enabled: true, trackingId: 'not-valid' }),
      ]);
      expect(content).toBe('');
      expect(spy).toHaveBeenCalled();
      spy.mockRestore();
    });
  });

  describe('updateAnalyticsProvider', () => {
    it('rejects enabling with an invalid Tracking ID and preserves prior state', async () => {
      const ctx = await createAdmin();
      await updateAnalyticsProvider(ctx, 'baidu_tongji', { enabled: false, trackingId: VALID_BAIDU_ID });
      await expect(
        updateAnalyticsProvider(ctx, 'baidu_tongji', { enabled: true, trackingId: 'bad-id' }),
      ).rejects.toMatchObject({ code: 'BAD_REQUEST' });

      const row = await db.query.analyticsProviderSettings.findFirst({
        where: eq(schema.analyticsProviderSettings.provider, 'baidu_tongji'),
      });
      expect(row?.enabled).toBe(false);
      expect(row?.trackingId).toBe(VALID_BAIDU_ID);
    });

    it('allows saving a Tracking ID for a disabled provider', async () => {
      const ctx = await createAdmin();
      const item = await updateAnalyticsProvider(ctx, 'google_analytics', {
        enabled: false,
        trackingId: VALID_GA_ID,
      });
      expect(item.enabled).toBe(false);
      expect(item.trackingId).toBe(VALID_GA_ID);
    });

    it('calls invalidateSiteShellCache after the DB write', async () => {
      const ctx = await createAdmin();
      await updateAnalyticsProvider(ctx, 'baidu_tongji', { enabled: true, trackingId: VALID_BAIDU_ID });
      expect(cache.invalidateSiteShellCache).toHaveBeenCalledTimes(1);
    });

    it('does not invalidate the cache when validation rejects the update', async () => {
      const ctx = await createAdmin();
      await expect(
        updateAnalyticsProvider(ctx, 'baidu_tongji', { enabled: true, trackingId: 'bad-id' }),
      ).rejects.toThrow(DomainError);
      expect(cache.invalidateSiteShellCache).not.toHaveBeenCalled();
    });

    it('rejects non-admin callers', async () => {
      const ctx = await createReader();
      await expect(
        updateAnalyticsProvider(ctx, 'baidu_tongji', { enabled: true, trackingId: VALID_BAIDU_ID }),
      ).rejects.toMatchObject({ code: 'FORBIDDEN' });
    });

    it('rejects anonymous callers with UNAUTHORIZED', async () => {
      const ctx = buildAnonymousCtx();
      await expect(
        updateAnalyticsProvider(ctx, 'baidu_tongji', { enabled: true, trackingId: VALID_BAIDU_ID }),
      ).rejects.toMatchObject({ code: 'UNAUTHORIZED' });
    });
  });

  describe('upsertAnalyticsProviders', () => {
    it('invalidates the site-shell cache exactly once after writing every provider', async () => {
      const ctx = await createAdmin();
      await upsertAnalyticsProviders(ctx, {
        providers: [
          { provider: 'baidu_tongji', enabled: true, trackingId: VALID_BAIDU_ID },
          { provider: 'google_analytics', enabled: true, trackingId: VALID_GA_ID },
        ],
      });
      expect(cache.invalidateSiteShellCache).toHaveBeenCalledTimes(1);
    });

    it('does not invalidate the cache when a provider in the batch is rejected', async () => {
      const ctx = await createAdmin();
      await expect(
        upsertAnalyticsProviders(ctx, {
          providers: [{ provider: 'baidu_tongji', enabled: true, trackingId: 'bad-id' }],
        }),
      ).rejects.toThrow(DomainError);
      expect(cache.invalidateSiteShellCache).not.toHaveBeenCalled();
    });
  });
});
