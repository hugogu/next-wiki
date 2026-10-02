import { afterAll, beforeEach, describe, expect, it } from 'vitest';
import { eq } from 'drizzle-orm';
import { db, closeDb } from '@/server/db';
import * as schema from '@/server/db/schema';
import { buildAnonymousCtx, buildApiKeyCtx, buildUserCtx } from '@/server/permissions';
import * as pages from './public-content';
import { aiContentFilterSql, getAiContentLevel } from './ai-content-level';
import { clearAiAttribution, listAiAttributionClearances, setAiAttribution } from './ai-attribution-clearances';
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
    expect(await getAiContentLevel({ id: page.id })).toBeNull();
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
    expect(await getAiContentLevel({ id: page.id })).toBeNull();
    const machine = await pages.createDraft(keyCtx, page.id, { title: 'Clearance example', contentSource: '# AI assistance', baseRevisionId: humanAgain.id });
    expect(await getAiContentLevel({ id: page.id })).toBe('assisted');
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

  it('lets the author set an explicit label and records the declaration revision', async () => {
    const { page, input, ctx, owner } = await fixture();
    const record = await setAiAttribution(ctx, page.id, { ...input, level: 'assisted' });
    expect(record).toMatchObject({ operation: 'set', level: 'assisted', previousLevel: 'generated',
      clearedByUserId: owner.id, versionNumber: 1, revisionId: input.expectedRevisionId });
    expect(await getAiContentLevel({ id: page.id })).toBe('assisted');
    const current = await pages.getPageById(ctx, page.id);
    const humanEdit = await pages.createDraft(ctx, page.id, { title: 'Clearance example', contentSource: '# Human', baseRevisionId: input.expectedRevisionId });
    expect(await getAiContentLevel({ id: page.id })).toBe('assisted');
    const clear = await clearAiAttribution(ctx, page.id, { expectedRevisionId: humanEdit.id });
    expect(clear).toMatchObject({ operation: 'clear', level: null, previousLevel: 'assisted', versionNumber: 2 });
    expect(current?.aiContentLevel).toBe('assisted');
    expect(await getAiContentLevel({ id: page.id })).toBeNull();
  });

  // The page resource and reader take their label from getAiContentLevel while
  // search and filters use the SQL directly, so a shortcut for human-authored
  // pages in the former hid a declared label that the latter honoured.
  it('reports a declared label on human-authored content, like the SQL does', async () => {
    const { ctx } = await fixture();
    const human = await pages.createPage(ctx, { path: 'clearance/declared', title: 'Declared', contentSource: '# Human' }, ['latestRevision']);
    expect(await getAiContentLevel({ id: human.id })).toBeNull();

    await setAiAttribution(ctx, human.id, { expectedRevisionId: human.latestRevision!.id, level: 'generated' });

    expect(await getAiContentLevel({ id: human.id })).toBe('generated');
    expect((await pages.getPageById(ctx, human.id))?.aiContentLevel).toBe('generated');
    expect(await db.select({ id: schema.pages.id }).from(schema.pages).where(aiContentFilterSql({ includeAiGenerated: false }))).not.toContainEqual({ id: human.id });

    await pages.createDraft(ctx, human.id, { title: 'Declared', contentSource: '# Human edit', baseRevisionId: human.latestRevision!.id });
    expect(await getAiContentLevel({ id: human.id })).toBe('assisted');
  });
});
