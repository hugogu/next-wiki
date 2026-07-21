import { afterAll, beforeEach, describe, expect, it } from 'vitest';
import { eq } from 'drizzle-orm';
import { db, closeDb } from '@/server/db';
import * as schema from '@/server/db/schema';
import * as authService from '@/server/services/auth';
import { buildUserCtx } from '@/server/permissions';
import {
  getActiveAnalyticsScriptContent,
  readAnalyticsSettings,
  upsertAnalyticsProviders,
} from '@/server/services/analytics';

const VALID_BAIDU_ID = 'abcdef0123456789abcdef0123456789';
const VALID_GA_ID = 'G-A1B2C3D4E5';

async function createAdmin() {
  const { userId } = await authService.register({
    email: `analytics-int-${Math.random().toString(36).slice(2)}@example.com`,
    password: 'Password123!',
  });
  await db.update(schema.users).set({ role: 'admin' }).where(eq(schema.users.id, userId));
  return buildUserCtx(userId, 'admin');
}

describe('analytics service (integration)', () => {
  beforeEach(async () => {
    await db.delete(schema.analyticsProviderSettings);
  });

  afterAll(async () => {
    await db.delete(schema.analyticsProviderSettings);
    await closeDb();
  });

  it('round-trips: upsert providers, read the admin view, and read the active script content', async () => {
    const ctx = await createAdmin();

    await expect(getActiveAnalyticsScriptContent()).resolves.toBe('');

    const view = await upsertAnalyticsProviders(ctx, {
      providers: [
        { provider: 'baidu_tongji', enabled: true, trackingId: VALID_BAIDU_ID },
        { provider: 'google_analytics', enabled: false, trackingId: VALID_GA_ID },
      ],
    });

    const baidu = view.providers.find((p) => p.provider === 'baidu_tongji');
    const ga = view.providers.find((p) => p.provider === 'google_analytics');
    expect(baidu).toMatchObject({ enabled: true, trackingId: VALID_BAIDU_ID });
    expect(ga).toMatchObject({ enabled: false, trackingId: VALID_GA_ID });
    expect(view.activeScriptContent).toContain(`hm.baidu.com/hm.js?${VALID_BAIDU_ID}`);
    expect(view.activeScriptContent).not.toContain('googletagmanager.com');

    const scriptContent = await getActiveAnalyticsScriptContent();
    expect(scriptContent).toBe(view.activeScriptContent);

    const readBack = await readAnalyticsSettings(ctx);
    expect(readBack.activeScriptContent).toBe(view.activeScriptContent);
  });

  it('reflects a mutation on the next read (cache invalidation)', async () => {
    const ctx = await createAdmin();

    await upsertAnalyticsProviders(ctx, {
      providers: [{ provider: 'baidu_tongji', enabled: true, trackingId: VALID_BAIDU_ID }],
    });
    await expect(getActiveAnalyticsScriptContent()).resolves.toContain('hm.baidu.com');

    await upsertAnalyticsProviders(ctx, {
      providers: [{ provider: 'baidu_tongji', enabled: false, trackingId: VALID_BAIDU_ID }],
    });
    await expect(getActiveAnalyticsScriptContent()).resolves.not.toContain('hm.baidu.com');
  });

  it('upserts multiple providers independently and invalidates the cache once', async () => {
    const ctx = await createAdmin();
    const view = await upsertAnalyticsProviders(ctx, {
      providers: [
        { provider: 'baidu_tongji', enabled: true, trackingId: VALID_BAIDU_ID },
        { provider: 'google_analytics', enabled: true, trackingId: VALID_GA_ID },
      ],
    });
    expect(view.activeScriptContent).toContain('hm.baidu.com');
    expect(view.activeScriptContent).toContain('googletagmanager.com');
  });
});
