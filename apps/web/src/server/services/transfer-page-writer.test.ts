import { randomUUID } from 'node:crypto';
import { afterAll, beforeAll, describe, expect, it, vi } from 'vitest';
import { eq, sql } from 'drizzle-orm';
import { db, closeDb } from '@/server/db';
import * as schema from '@/server/db/schema';
import {
  writeImportedPage,
  writeImportedPageWithHistory,
  writeImportedRawEntryWithHistory,
  writeImportedGeneratedPageWithHistory,
} from './transfer-page-writer';

vi.mock('@/server/pipeline', () => ({
  renderMarkdown: (source: string) => ({ html: `<p>${source}</p>`, hash: `hash-${source.length}` }),
}));
vi.mock('./content-assets', () => ({ syncRevisionAssetRefs: vi.fn() }));
vi.mock('./storage-replication', () => ({ addReplicationTasks: vi.fn(), kickReplication: vi.fn() }));
vi.mock('./ai-index', () => ({ reconcilePageAcrossIndexes: vi.fn() }));

const TRUNCATE =
  'TRUNCATE TABLE content_asset_refs, storage_replication_tasks, ai_page_index_states, ai_index_generations, ai_models, ai_providers, storage_backends, ai_actions, page_revisions, pages, raw_categories, translation_languages, users, spaces RESTART IDENTITY CASCADE';

let adminId: string;
let spaceId: string;
let rawSpaceId: string;
let generatedSpaceId: string;
// Fixtures a real (unmocked) import would have created rows against — used to
// prove writeImportedPageWithHistory's full-rebuild cleanup does not trip the
// FK on ai_page_index_states or leave orphaned storage_replication_tasks rows.
let backendId: string;
let generationId: string;

beforeAll(async () => {
  await db.execute(sql.raw(TRUNCATE));
  const [admin] = await db
    .insert(schema.users)
    .values({
      email: `transfer-page-writer-${randomUUID()}@example.com`,
      passwordHash: 'TEST',
      role: 'admin',
    })
    .returning();
  adminId = admin!.id;

  const [space] = await db
    .insert(schema.spaces)
    .values({ slug: 'default', name: 'Default' })
    .returning();
  spaceId = space!.id;

  const [rawSpace] = await db
    .insert(schema.spaces)
    .values({ slug: 'raw', name: 'Raw', kind: 'raw' })
    .returning();
  rawSpaceId = rawSpace!.id;

  const [generatedSpace] = await db
    .insert(schema.spaces)
    .values({ slug: 'generated', name: 'Generated', kind: 'generated' })
    .returning();
  generatedSpaceId = generatedSpace!.id;

  await db.insert(schema.rawCategories).values({ name: 'General', slug: 'general', isDefault: true });

  const [backend] = await db.insert(schema.storageBackends).values({ type: 'local' }).returning();
  backendId = backend!.id;

  const [provider] = await db
    .insert(schema.aiProviders)
    .values({ name: 'test-provider', kind: 'openai_compatible', baseUrl: 'https://example.test', credentialsEncrypted: 'enc:test' })
    .returning();
  const [model] = await db
    .insert(schema.aiModels)
    .values({ providerId: provider!.id, externalId: 'test-model', displayName: 'Test Model' })
    .returning();
  const [generation] = await db
    .insert(schema.aiIndexGenerations)
    .values({ modelId: model!.id, embeddingDimensions: 8, chunkerVersion: 'v1' })
    .returning();
  generationId = generation!.id;
});

afterAll(async () => {
  await db.execute(sql.raw(TRUNCATE));
  await closeDb();
});

describe('writeImportedPage', () => {
  it('skips an active page when the stale import plan still says create', async () => {
    const [activePage] = await db
      .insert(schema.pages)
      .values({
        spaceId,
        slug: 'active-conflict',
        path: 'docs/active-conflict',
        locale: 'en',
        title: 'Active Import Target',
        authorId: adminId,
      })
      .returning();

    const result = await writeImportedPage({
      actorUserId: adminId,
      path: 'docs/active-conflict',
      locale: 'en',
      title: 'Should Not Overwrite',
      markdown: '# Should Not Overwrite',
      action: 'create',
    });

    expect(result).toEqual({ pageId: activePage!.id, revisionId: null, action: 'skip' });

    const revisions = await db.query.pageRevisions.findMany({
      where: eq(schema.pageRevisions.pageId, activePage!.id),
    });
    expect(revisions).toHaveLength(0);

    const page = await db.query.pages.findFirst({
      where: eq(schema.pages.id, activePage!.id),
    });
    expect(page?.title).toBe('Active Import Target');
  });

  it('restores a soft-deleted page instead of inserting a duplicate canonical page', async () => {
    const [deletedPage] = await db
      .insert(schema.pages)
      .values({
        spaceId,
        slug: 'restored',
        path: 'docs/restored',
        locale: 'en',
        title: 'Deleted Import Target',
        authorId: adminId,
        deletedAt: new Date('2026-06-01T00:00:00.000Z'),
      })
      .returning();

    const result = await writeImportedPage({
      actorUserId: adminId,
      path: 'docs/restored',
      locale: 'en',
      title: 'Restored Import Target',
      markdown: '# Restored',
      action: 'replace',
    });

    expect(result.pageId).toBe(deletedPage!.id);
    expect(result.action).toBe('replace');
    expect(result.revisionId).toBeTruthy();

    const pages = await db.query.pages.findMany({
      where: eq(schema.pages.path, 'docs/restored'),
    });
    expect(pages).toHaveLength(1);
    expect(pages[0]?.deletedAt).toBeNull();
    expect(pages[0]?.title).toBe('Restored Import Target');
    expect(pages[0]?.currentPublishedVersionId).toBe(result.revisionId);

    const revision = await db.query.pageRevisions.findFirst({
      where: eq(schema.pageRevisions.id, result.revisionId!),
    });
    expect(revision?.pageId).toBe(deletedPage!.id);
    expect(revision?.versionNumber).toBe(1);
    expect(revision?.status).toBe('published');
  });

  it('persists imported frontmatter tags as revision metadata and registry assignments', async () => {
    const result = await writeImportedPage({
      actorUserId: adminId,
      path: 'docs/tagged-import',
      locale: 'en',
      title: 'Tagged import',
      markdown: '---\ntitle: Tagged import\ntags: [DevOps, Docker]\n---\n\n# Tagged',
      action: 'create',
    });

    const metadata = await db.query.pageRevisionMetadata.findFirst({
      where: eq(schema.pageRevisionMetadata.revisionId, result.revisionId!),
    });
    const assignments = await db.query.pageRevisionTags.findMany({
      where: eq(schema.pageRevisionTags.revisionId, result.revisionId!),
    });
    expect(metadata?.title).toBe('Tagged import');
    expect(assignments.map((tag) => tag.normalizedName).sort()).toEqual(['devops', 'docker']);
  });

  it('gives a new page the source path as its address when free (FR-025)', async () => {
    const result = await writeImportedPage({
      actorUserId: adminId,
      path: 'docs/address-free',
      locale: 'en',
      title: 'Address Free',
      markdown: '# Address Free',
      action: 'create',
    });

    expect(result.address).toBe('docs/address-free');
    expect(result.addressAdjustmentReason).toBeNull();

    const page = await db.query.pages.findFirst({ where: eq(schema.pages.id, result.pageId!) });
    expect(page?.slug).toBe('docs/address-free');
  });

  it('adjusts a new page\'s address with a numeric suffix when the source path is already taken (FR-025/FR-026)', async () => {
    await db.insert(schema.pages).values({
      spaceId,
      slug: 'docs/address-taken',
      path: 'docs/address-taken-holder',
      locale: 'en',
      title: 'Existing Holder',
      authorId: adminId,
    });

    const result = await writeImportedPage({
      actorUserId: adminId,
      path: 'docs/address-taken',
      locale: 'fr',
      title: 'Address Taken',
      markdown: '# Address Taken',
      action: 'create',
    });

    expect(result.address).not.toBe('docs/address-taken');
    expect(result.address).toMatch(/^docs\/address-taken-\d+$/);
    expect(result.addressAdjustmentReason).toBe('taken');

    const page = await db.query.pages.findFirst({ where: eq(schema.pages.id, result.pageId!) });
    expect(page?.slug).toBe(result.address);
    // The existing holder's own address is untouched (FR-026).
    const holder = await db.query.pages.findFirst({ where: eq(schema.pages.path, 'docs/address-taken-holder') });
    expect(holder?.slug).toBe('docs/address-taken');
  });
});

describe('writeImportedPageWithHistory', () => {
  it('creates a page with a full, ordered, all-published revision history', async () => {
    const result = await writeImportedPageWithHistory({
      actorUserId: adminId,
      path: 'docs/history-create',
      locale: 'en',
      versions: [
        { markdown: '# v1', title: 'V1', createdAt: new Date('2026-01-01T00:00:00.000Z'), sourceMetadata: { wikijsVersionId: 1 } },
        { markdown: '# v2', title: 'V2', createdAt: new Date('2026-02-01T00:00:00.000Z'), sourceMetadata: { wikijsVersionId: 2 } },
        { markdown: '# v3 current', title: 'V3 current', createdAt: new Date('2026-03-01T00:00:00.000Z'), sourceMetadata: { isCurrent: true } },
      ],
      action: 'create',
    });

    expect(result.action).toBe('create');
    expect(result.revisionIds).toHaveLength(3);

    const revisions = await db.query.pageRevisions.findMany({
      where: eq(schema.pageRevisions.pageId, result.pageId!),
      orderBy: (r, { asc }) => asc(r.versionNumber),
    });
    expect(revisions.map((r) => r.versionNumber)).toEqual([1, 2, 3]);
    expect(revisions.map((r) => r.id)).toEqual(result.revisionIds);
    expect(revisions.every((r) => r.status === 'published')).toBe(true);
    expect(revisions[0]?.createdAt.toISOString()).toBe('2026-01-01T00:00:00.000Z');

    const page = await db.query.pages.findFirst({ where: eq(schema.pages.id, result.pageId!) });
    expect(page?.currentPublishedVersionId).toBe(result.revisionIds.at(-1));
    expect(page?.latestVersionId).toBe(result.revisionIds.at(-1));
    expect(page?.title).toBe('V3 current');
  });

  it('wipes existing revisions and orphaned replication/index rows on a full re-import replace', async () => {
    const [page] = await db
      .insert(schema.pages)
      .values({ spaceId, slug: 'history-replace', path: 'docs/history-replace', locale: 'en', title: 'Old title', authorId: adminId })
      .returning();
    const [oldRevision] = await db
      .insert(schema.pageRevisions)
      .values({
        pageId: page!.id,
        versionNumber: 1,
        contentType: 'text/markdown',
        contentSource: '# old',
        contentHtml: '<p># old</p>',
        contentHash: 'old-hash',
        authorId: adminId,
        status: 'published',
        publishedAt: new Date(),
        actorKind: 'machine',
      })
      .returning();
    await db
      .update(schema.pages)
      .set({ currentPublishedVersionId: oldRevision!.id, latestVersionId: oldRevision!.id })
      .where(eq(schema.pages.id, page!.id));

    // Rows a prior real (unmocked) import would have left behind for the old
    // revision — proves the cleanup order in writeImportedPageWithHistory
    // avoids the ai_page_index_states FK violation and doesn't orphan
    // storage_replication_tasks.
    await db.insert(schema.storageReplicationTasks).values({
      backendId,
      objectKind: 'markdown',
      objectId: oldRevision!.id,
      expectedHash: 'old-hash',
    });
    await db.insert(schema.aiPageIndexStates).values({
      generationId,
      pageId: page!.id,
      targetRevisionId: oldRevision!.id,
      status: 'completed',
    });

    const result = await writeImportedPageWithHistory({
      actorUserId: adminId,
      path: 'docs/history-replace',
      locale: 'en',
      versions: [
        { markdown: '# new v1', title: 'New V1', createdAt: new Date('2026-01-01T00:00:00.000Z'), sourceMetadata: {} },
        { markdown: '# new v2 current', title: 'New V2', createdAt: new Date('2026-02-01T00:00:00.000Z'), sourceMetadata: { isCurrent: true } },
      ],
      action: 'replace',
    });

    expect(result.pageId).toBe(page!.id);
    expect(result.action).toBe('replace');
    expect(result.revisionIds).toHaveLength(2);

    const oldRevisionRow = await db.query.pageRevisions.findFirst({ where: eq(schema.pageRevisions.id, oldRevision!.id) });
    expect(oldRevisionRow).toBeUndefined();

    const remainingReplicationTasks = await db.query.storageReplicationTasks.findMany({
      where: eq(schema.storageReplicationTasks.objectId, oldRevision!.id),
    });
    expect(remainingReplicationTasks).toHaveLength(0);

    const remainingIndexStates = await db.query.aiPageIndexStates.findMany({
      where: eq(schema.aiPageIndexStates.pageId, page!.id),
    });
    expect(remainingIndexStates).toHaveLength(0);

    const newRevisions = await db.query.pageRevisions.findMany({
      where: eq(schema.pageRevisions.pageId, page!.id),
      orderBy: (r, { asc }) => asc(r.versionNumber),
    });
    expect(newRevisions.map((r) => r.versionNumber)).toEqual([1, 2]);

    const updatedPage = await db.query.pages.findFirst({ where: eq(schema.pages.id, page!.id) });
    expect(updatedPage?.currentPublishedVersionId).toBe(result.revisionIds.at(-1));
    expect(updatedPage?.title).toBe('New V2');
  });

  it('returns early without writing when action is skip', async () => {
    const result = await writeImportedPageWithHistory({
      actorUserId: adminId,
      path: 'docs/history-skip',
      locale: 'en',
      versions: [{ markdown: '# skip', title: 'Skip', createdAt: new Date(), sourceMetadata: {} }],
      action: 'skip',
    });
    expect(result).toEqual({ pageId: null, revisionIds: [], action: 'skip' });
  });

  it('reports action "create" (not "replace") when restoring a soft-deleted page', async () => {
    const [deletedPage] = await db
      .insert(schema.pages)
      .values({
        spaceId,
        slug: 'history-restore',
        path: 'docs/history-restore',
        locale: 'en',
        title: 'Deleted title',
        authorId: adminId,
        deletedAt: new Date('2026-06-01T00:00:00.000Z'),
      })
      .returning();

    const result = await writeImportedPageWithHistory({
      actorUserId: adminId,
      path: 'docs/history-restore',
      locale: 'en',
      versions: [{ markdown: '# restored', title: 'Restored', createdAt: new Date('2026-07-01T00:00:00.000Z'), sourceMetadata: {} }],
      action: 'create',
    });

    expect(result.pageId).toBe(deletedPage!.id);
    // Restoring a soft-deleted page isn't overwriting live content, so this
    // must read as 'create' — matching writeImportedPage's behavior.
    expect(result.action).toBe('create');

    const restoredPage = await db.query.pages.findFirst({ where: eq(schema.pages.id, deletedPage!.id) });
    expect(restoredPage?.deletedAt).toBeNull();
    expect(restoredPage?.title).toBe('Restored');
  });

  it('adjusts a new page\'s address with a numeric suffix when the source path is already taken (FR-025/FR-026)', async () => {
    await db.insert(schema.pages).values({
      spaceId,
      slug: 'docs/history-address-taken',
      path: 'docs/history-address-taken-holder',
      locale: 'en',
      title: 'Existing Holder',
      authorId: adminId,
    });

    const result = await writeImportedPageWithHistory({
      actorUserId: adminId,
      path: 'docs/history-address-taken',
      locale: 'fr',
      versions: [{ markdown: '# v1', title: 'V1', createdAt: new Date('2026-01-01T00:00:00.000Z'), sourceMetadata: { isCurrent: true } }],
      action: 'create',
    });

    expect(result.address).not.toBe('docs/history-address-taken');
    expect(result.address).toMatch(/^docs\/history-address-taken-\d+$/);
    expect(result.addressAdjustmentReason).toBe('taken');

    const page = await db.query.pages.findFirst({ where: eq(schema.pages.id, result.pageId!) });
    expect(page?.slug).toBe(result.address);
    const holder = await db.query.pages.findFirst({ where: eq(schema.pages.path, 'docs/history-address-taken-holder') });
    expect(holder?.slug).toBe('docs/history-address-taken');
  });
});

describe('writeImportedRawEntryWithHistory', () => {
  it('creates a raw page with a full, ordered, all-published revision history', async () => {
    const result = await writeImportedRawEntryWithHistory({
      actorUserId: adminId,
      path: 'raw/history-create',
      locale: 'en',
      title: 'Raw history',
      versions: [
        { body: 'v1 body', contentType: 'text/plain', createdAt: new Date('2026-01-01T00:00:00.000Z'), sourceMetadata: { archiveVersionNumber: 1 } },
        { body: 'v2 current body', contentType: 'text/plain', createdAt: new Date('2026-02-01T00:00:00.000Z'), sourceMetadata: { isCurrent: true } },
      ],
      action: 'create',
    });

    expect(result.action).toBe('create');
    expect(result.revisionIds).toHaveLength(2);

    const revisions = await db.query.pageRevisions.findMany({
      where: eq(schema.pageRevisions.pageId, result.pageId!),
      orderBy: (r, { asc }) => asc(r.versionNumber),
    });
    expect(revisions.map((r) => r.versionNumber)).toEqual([1, 2]);
    expect(revisions.every((r) => r.status === 'published')).toBe(true);

    // Raw revisions never get a page_revision_metadata row.
    const metadataRows = await db.query.pageRevisionMetadata.findMany({
      where: eq(schema.pageRevisionMetadata.revisionId, revisions[0]!.id),
    });
    expect(metadataRows).toHaveLength(0);

    const page = await db.query.pages.findFirst({ where: eq(schema.pages.id, result.pageId!) });
    expect(page?.spaceId).toBe(rawSpaceId);
    expect(page?.title).toBe('Raw history');
    expect(page?.rawCategoryId).toBeTruthy();
  });

  it('wipes existing revisions on replace and leaves rawCategoryId untouched', async () => {
    const category = await db.query.rawCategories.findFirst({ where: eq(schema.rawCategories.isDefault, true) });
    const [page] = await db
      .insert(schema.pages)
      .values({
        spaceId: rawSpaceId,
        slug: 'history-replace',
        path: 'raw/history-replace',
        locale: 'en',
        title: 'Old raw title',
        authorId: adminId,
        nature: 'original',
        visibility: 'restricted',
        rawCategoryId: category!.id,
      })
      .returning();
    const [oldRevision] = await db
      .insert(schema.pageRevisions)
      .values({
        pageId: page!.id,
        versionNumber: 1,
        contentType: 'text/plain',
        contentSource: 'old body',
        contentHtml: '<p>old body</p>',
        contentHash: 'old-hash',
        authorId: adminId,
        status: 'published',
        publishedAt: new Date(),
        actorKind: 'machine',
      })
      .returning();
    await db
      .update(schema.pages)
      .set({ currentPublishedVersionId: oldRevision!.id, latestVersionId: oldRevision!.id })
      .where(eq(schema.pages.id, page!.id));

    const result = await writeImportedRawEntryWithHistory({
      actorUserId: adminId,
      path: 'raw/history-replace',
      locale: 'en',
      title: 'Old raw title',
      versions: [
        { body: 'new v1', contentType: 'text/plain', createdAt: new Date('2026-01-01T00:00:00.000Z'), sourceMetadata: {} },
        { body: 'new v2 current', contentType: 'text/plain', createdAt: new Date('2026-02-01T00:00:00.000Z'), sourceMetadata: { isCurrent: true } },
      ],
      action: 'replace',
    });

    expect(result.pageId).toBe(page!.id);
    expect(result.action).toBe('replace');
    expect(result.revisionIds).toHaveLength(2);

    const oldRevisionRow = await db.query.pageRevisions.findFirst({ where: eq(schema.pageRevisions.id, oldRevision!.id) });
    expect(oldRevisionRow).toBeUndefined();

    const updatedPage = await db.query.pages.findFirst({ where: eq(schema.pages.id, page!.id) });
    expect(updatedPage?.rawCategoryId).toBe(category!.id);
    expect(updatedPage?.currentPublishedVersionId).toBe(result.revisionIds.at(-1));
  });
});

describe('writeImportedGeneratedPageWithHistory', () => {
  it('creates a generated page with OKF-conformant history and per-version metadata', async () => {
    const result = await writeImportedGeneratedPageWithHistory({
      actorUserId: adminId,
      path: 'concepts/history-create',
      locale: 'en',
      versions: [
        { markdown: '# v1 body', title: 'V1', createdAt: new Date('2026-01-01T00:00:00.000Z') },
        { markdown: '# v2 current body', title: 'V2 current', createdAt: new Date('2026-02-01T00:00:00.000Z') },
      ],
      action: 'create',
    });

    expect(result.action).toBe('create');
    expect(result.revisionIds).toHaveLength(2);

    const revisions = await db.query.pageRevisions.findMany({
      where: eq(schema.pageRevisions.pageId, result.pageId!),
      orderBy: (r, { asc }) => asc(r.versionNumber),
    });
    expect(revisions.map((r) => r.versionNumber)).toEqual([1, 2]);
    expect(revisions.every((r) => r.status === 'published')).toBe(true);
    // ensureOkfConformance must have added YAML frontmatter to each version.
    expect(revisions.every((r) => r.contentSource?.startsWith('---\n'))).toBe(true);

    const metadataRows = await db.query.pageRevisionMetadata.findMany({
      where: eq(schema.pageRevisionMetadata.revisionId, revisions[0]!.id),
    });
    expect(metadataRows).toHaveLength(1);

    const page = await db.query.pages.findFirst({ where: eq(schema.pages.id, result.pageId!) });
    expect(page?.spaceId).toBe(generatedSpaceId);
    expect(page?.title).toBe('V2 current');
  });

  it('wipes existing revisions on replace', async () => {
    const [page] = await db
      .insert(schema.pages)
      .values({
        spaceId: generatedSpaceId,
        slug: 'history-replace',
        path: 'concepts/history-replace',
        locale: 'en',
        title: 'Old generated title',
        authorId: adminId,
        nature: 'generated',
      })
      .returning();
    const [oldRevision] = await db
      .insert(schema.pageRevisions)
      .values({
        pageId: page!.id,
        versionNumber: 1,
        contentType: 'text/markdown',
        contentSource: '---\ntype: Note\ntitle: Old\n---\n\nold body',
        contentHtml: '<p>old body</p>',
        contentHash: 'old-hash',
        authorId: adminId,
        status: 'published',
        publishedAt: new Date(),
        actorKind: 'machine',
      })
      .returning();
    await db
      .update(schema.pages)
      .set({ currentPublishedVersionId: oldRevision!.id, latestVersionId: oldRevision!.id })
      .where(eq(schema.pages.id, page!.id));

    const result = await writeImportedGeneratedPageWithHistory({
      actorUserId: adminId,
      path: 'concepts/history-replace',
      locale: 'en',
      versions: [
        { markdown: '# new v1', title: 'New V1', createdAt: new Date('2026-01-01T00:00:00.000Z') },
        { markdown: '# new v2 current', title: 'New V2', createdAt: new Date('2026-02-01T00:00:00.000Z') },
      ],
      action: 'replace',
    });

    expect(result.pageId).toBe(page!.id);
    expect(result.action).toBe('replace');

    const oldRevisionRow = await db.query.pageRevisions.findFirst({ where: eq(schema.pageRevisions.id, oldRevision!.id) });
    expect(oldRevisionRow).toBeUndefined();

    const updatedPage = await db.query.pages.findFirst({ where: eq(schema.pages.id, page!.id) });
    expect(updatedPage?.title).toBe('New V2');
  });
});
