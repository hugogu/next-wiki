import { afterAll, beforeEach, describe, expect, it } from 'vitest';
import { eq } from 'drizzle-orm';
import { db, closeDb } from '@/server/db';
import * as schema from '@/server/db/schema';
import { buildAnonymousCtx, buildApiKeyCtx, buildUserCtx } from '@/server/permissions';
import * as pages from './public-content';
import { aiContentFilterSql, getAiContentLevel } from './ai-content-level';
import { clearAiAttribution, listAiAttributionClearances } from './ai-attribution-clearances';
import { createPublicApiUser, ensurePublicApiDefaultSpace } from '../../../test/public-wiki-api-fixtures';

async function cleanup() {
  await db.delete(schema.pageAiAttributionClearances);
  await db.delete(schema.apiAuditEntries);
  await db.delete(schema.contentAssetRefs);
  await db.delete(schema.pageRevisions);
  await db.delete(schema.pageAddresses);
  await db.delete(schema.pages);
  await db.delete(schema.users);
}

async function fixture() {
  const owner = await createPublicApiUser('clear-owner@example.com', 'editor');
  const admin = await createPublicApiUser('clear-admin@example.com', 'admin');
  const other = await createPublicApiUser('clear-other@example.com', 'editor');
  const ctx = buildUserCtx(owner.id, 'editor');
  const keyCtx = buildApiKeyCtx(owner.id, 'editor', ['view', 'create', 'edit'], 'key');
  const page = await pages.createPage(keyCtx, {
    path: 'clearance/example', title: 'Clearance example', contentSource: '# Machine draft', nature: 'generated',
  }, ['latestRevision']);
  return { owner, admin, other, ctx, keyCtx, page, input: { expectedRevisionId: page.latestRevision!.id } };
}

describe('human AI attribution declarations', () => {
  beforeEach(async () => { await cleanup(); await ensurePublicApiDefaultSpace(); });
  afterAll(async () => { await cleanup(); await closeDb(); });

  it('allows only the human author or admin and never an API key', async () => {
    const { page, input, owner, admin, other, ctx, keyCtx } = await fixture();
    for (const denied of [buildAnonymousCtx(), buildUserCtx(other.id, 'editor'), keyCtx,
      buildApiKeyCtx(admin.id, 'admin', ['view', 'edit'], 'admin-key')]) {
      await expect(clearAiAttribution(denied, page.id, input)).rejects.toMatchObject({ code: 'FORBIDDEN' });
      await expect(listAiAttributionClearances(denied, page.id)).rejects.toMatchObject({ code: 'FORBIDDEN' });
    }
    const record = await clearAiAttribution(buildUserCtx(owner.id, 'reader'), page.id, input);
    expect(record).toMatchObject({ pageId: page.id, revisionId: input.expectedRevisionId,
      versionNumber: 1, previousLevel: 'generated', clearedByUserId: owner.id });
    expect(Number.isNaN(Date.parse(record.clearedAt))).toBe(false);
    expect(await listAiAttributionClearances(buildUserCtx(admin.id, 'admin'), page.id)).toEqual({ items: [record] });
    expect(await clearAiAttribution(ctx, page.id, input)).toEqual(record);
    expect(await db.select().from(schema.pageAiAttributionClearances)).toHaveLength(1);
    expect(await getAiContentLevel({ id: page.id, nature: 'generated' })).toBeNull();
    expect((await pages.getPageById(ctx, page.id))?.aiContentLevel).toBeNull();
  });

  it('rejects a stale declaration and restores assistance only after a later AI revision', async () => {
    const { page, input, ctx, keyCtx, admin } = await fixture();
    const human = await pages.createDraft(ctx, page.id, { title: 'Clearance example', contentSource: '# Human rewrite', baseRevisionId: input.expectedRevisionId });
    await expect(clearAiAttribution(ctx, page.id, input)).rejects.toMatchObject({ code: 'STALE_REVISION' });
    const record = await clearAiAttribution(ctx, page.id, { expectedRevisionId: human.id });
    expect(record).toMatchObject({ versionNumber: 2, previousLevel: 'assisted' });
    expect(await db.select({ id: schema.pages.id }).from(schema.pages).where(aiContentFilterSql({ includeAiGenerated: false, includeAiAssisted: false }))).toEqual([{ id: page.id }]);
    const humanAgain = await pages.createDraft(ctx, page.id, { title: 'Clearance example', contentSource: '# More human content', baseRevisionId: human.id });
    expect(await getAiContentLevel({ id: page.id, nature: 'generated' })).toBeNull();
    const machine = await pages.createDraft(keyCtx, page.id, { title: 'Clearance example', contentSource: '# AI assistance', baseRevisionId: humanAgain.id });
    expect(await getAiContentLevel({ id: page.id, nature: 'generated' })).toBe('assisted');
    expect(await db.select({ id: schema.pages.id }).from(schema.pages).where(aiContentFilterSql({ includeAiAssisted: false }))).toEqual([]);
    const second = await clearAiAttribution(buildUserCtx(admin.id, 'admin'), page.id, { expectedRevisionId: machine.id });
    expect(second).toMatchObject({ versionNumber: 4, previousLevel: 'assisted', clearedByUserId: admin.id });
    expect((await listAiAttributionClearances(ctx, page.id)).items).toEqual([second, record]);
    await db.update(schema.pages).set({ deletedAt: new Date() }).where(eq(schema.pages.id, page.id));
    expect(await db.select().from(schema.pageAiAttributionClearances)).toHaveLength(2);
    expect((await listAiAttributionClearances(ctx, page.id)).items).toEqual([second, record]);
  });

  it('rejects human-original content without creating a misleading declaration', async () => {
    const { ctx } = await fixture();
    const human = await pages.createPage(ctx, { path: 'clearance/human', title: 'Human', contentSource: '# Human' }, ['latestRevision']);
    await expect(clearAiAttribution(ctx, human.id, { expectedRevisionId: human.latestRevision!.id })).rejects.toMatchObject({ code: 'CONFLICT' });
    expect(await db.select().from(schema.pageAiAttributionClearances)).toHaveLength(0);
  });
});
