import { afterAll, beforeEach, describe, expect, it } from 'vitest';
import { eq } from 'drizzle-orm';
import { AI_CONVERSATIONS_SOURCE_KEY, WIKI_AI_CONVERSATIONS_SOURCE_KEY } from '@next-wiki/shared';
import { closeDb, db } from '@/server/db';
import * as schema from '@/server/db/schema';
import { DomainError } from '@/server/errors';
import { buildAnonymousCtx, buildUserCtx } from '@/server/permissions';
import { setModeInternal } from '@/server/services/writing-mode';
import { createAdminUser, resetSetupOnboardingState } from '../../../test/setup-onboarding-fixtures';
import { isDataSourceEnabled, listDataSources, updateDataSource } from './content-data-sources';

describe('content data sources service', () => {
  let adminId: string;

  beforeEach(async () => {
    await resetSetupOnboardingState();
    await db.delete(schema.contentDataSourceSettings);
    await setModeInternal('llm-wiki', null);
    ({ userId: adminId } = await createAdminUser());
  });

  afterAll(async () => {
    await resetSetupOnboardingState();
    await closeDb();
  });

  it('lists the registered source disabled by default', async () => {
    const ctx = buildUserCtx(adminId, 'admin');
    const items = await listDataSources(ctx);
    expect(items).toHaveLength(1);
    expect(items[0]).toMatchObject({
      sourceKey: AI_CONVERSATIONS_SOURCE_KEY,
      enabled: false,
      available: true,
      unavailableReason: null,
    });
  });

  it('reports unavailable outside llm-wiki mode', async () => {
    await setModeInternal('copilot', null);
    const ctx = buildUserCtx(adminId, 'admin');
    const items = await listDataSources(ctx);
    expect(items[0]).toMatchObject({ available: false, unavailableReason: expect.any(String) });
  });

  it('rejects non-Admin callers', async () => {
    const { userId: readerId } = await createAdminUser({ email: 'reader-cds@example.com' });
    await db.update(schema.users).set({ role: 'reader' }).where(eq(schema.users.id, readerId));
    const ctx = buildUserCtx(readerId, 'reader');
    await expect(listDataSources(ctx)).rejects.toThrow(DomainError);
    await expect(
      updateDataSource(ctx, AI_CONVERSATIONS_SOURCE_KEY, { enabled: true }),
    ).rejects.toThrow(DomainError);
  });

  it('rejects anonymous callers', async () => {
    const ctx = buildAnonymousCtx();
    await expect(listDataSources(ctx)).rejects.toThrow(DomainError);
  });

  it('rejects unknown source keys', async () => {
    const ctx = buildUserCtx(adminId, 'admin');
    await expect(updateDataSource(ctx, 'not-a-real-source', { enabled: true })).rejects.toMatchObject({
      code: 'NOT_FOUND',
    });
  });

  it('rejects writes to the legacy key so it never becomes a second writable surface (025)', async () => {
    const ctx = buildUserCtx(adminId, 'admin');
    await expect(
      updateDataSource(ctx, WIKI_AI_CONVERSATIONS_SOURCE_KEY, { enabled: true }),
    ).rejects.toMatchObject({ code: 'NOT_FOUND' });
  });

  it('enables and disables the source, recording the updater and audit fields', async () => {
    const ctx = buildUserCtx(adminId, 'admin');
    const enabled = await updateDataSource(ctx, AI_CONVERSATIONS_SOURCE_KEY, { enabled: true });
    expect(enabled.enabled).toBe(true);
    const row = await db.query.contentDataSourceSettings.findFirst({
      where: eq(schema.contentDataSourceSettings.sourceKey, AI_CONVERSATIONS_SOURCE_KEY),
    });
    expect(row?.updatedBy).toBe(adminId);
    await expect(isDataSourceEnabled(AI_CONVERSATIONS_SOURCE_KEY)).resolves.toBe(true);

    const disabled = await updateDataSource(ctx, AI_CONVERSATIONS_SOURCE_KEY, { enabled: false });
    expect(disabled.enabled).toBe(false);
    await expect(isDataSourceEnabled(AI_CONVERSATIONS_SOURCE_KEY)).resolves.toBe(false);
  });

  it('rejects enabling while the source is unavailable in the current writing mode', async () => {
    await setModeInternal('copilot', null);
    const ctx = buildUserCtx(adminId, 'admin');
    await expect(
      updateDataSource(ctx, AI_CONVERSATIONS_SOURCE_KEY, { enabled: true }),
    ).rejects.toMatchObject({ code: 'DATA_SOURCE_UNAVAILABLE' });
  });

  it('always allows disabling, even when currently unavailable', async () => {
    const ctx = buildUserCtx(adminId, 'admin');
    await updateDataSource(ctx, AI_CONVERSATIONS_SOURCE_KEY, { enabled: true });
    await setModeInternal('copilot', null);
    await expect(
      updateDataSource(ctx, AI_CONVERSATIONS_SOURCE_KEY, { enabled: false }),
    ).resolves.toMatchObject({ enabled: false });
  });

  it('defaults isDataSourceEnabled to false when no row exists at all (fresh deployments)', async () => {
    await expect(isDataSourceEnabled(AI_CONVERSATIONS_SOURCE_KEY)).resolves.toBe(false);
  });

  describe('rename lazy migration (025)', () => {
    it('isDataSourceEnabled migrates a legacy enabled=true row to the new key on first read', async () => {
      await db
        .insert(schema.contentDataSourceSettings)
        .values({ sourceKey: WIKI_AI_CONVERSATIONS_SOURCE_KEY, enabled: true });

      await expect(isDataSourceEnabled(AI_CONVERSATIONS_SOURCE_KEY)).resolves.toBe(true);

      const migrated = await db.query.contentDataSourceSettings.findFirst({
        where: eq(schema.contentDataSourceSettings.sourceKey, AI_CONVERSATIONS_SOURCE_KEY),
      });
      expect(migrated?.enabled).toBe(true);
      // The legacy row is left in place, untouched.
      const legacy = await db.query.contentDataSourceSettings.findFirst({
        where: eq(schema.contentDataSourceSettings.sourceKey, WIKI_AI_CONVERSATIONS_SOURCE_KEY),
      });
      expect(legacy?.enabled).toBe(true);
    });

    it('listDataSources reflects the migrated legacy state immediately, without a duplicate row', async () => {
      await db
        .insert(schema.contentDataSourceSettings)
        .values({ sourceKey: WIKI_AI_CONVERSATIONS_SOURCE_KEY, enabled: true });

      const ctx = buildUserCtx(adminId, 'admin');
      const items = await listDataSources(ctx);
      expect(items).toHaveLength(1);
      expect(items[0]).toMatchObject({ sourceKey: AI_CONVERSATIONS_SOURCE_KEY, enabled: true });
    });

    it('once migrated, a toggle on the new key does not resurrect the legacy value', async () => {
      await db
        .insert(schema.contentDataSourceSettings)
        .values({ sourceKey: WIKI_AI_CONVERSATIONS_SOURCE_KEY, enabled: true });
      await expect(isDataSourceEnabled(AI_CONVERSATIONS_SOURCE_KEY)).resolves.toBe(true);

      const ctx = buildUserCtx(adminId, 'admin');
      await updateDataSource(ctx, AI_CONVERSATIONS_SOURCE_KEY, { enabled: false });
      await expect(isDataSourceEnabled(AI_CONVERSATIONS_SOURCE_KEY)).resolves.toBe(false);
    });

    it('no legacy row means the new key simply defaults to disabled (fresh deployment)', async () => {
      await expect(isDataSourceEnabled(AI_CONVERSATIONS_SOURCE_KEY)).resolves.toBe(false);
      const items = await listDataSources(buildUserCtx(adminId, 'admin'));
      expect(items[0]).toMatchObject({ enabled: false });
    });
  });
});
