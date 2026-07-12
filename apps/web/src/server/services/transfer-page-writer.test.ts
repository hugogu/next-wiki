import { randomUUID } from 'node:crypto';
import { afterAll, beforeAll, describe, expect, it, vi } from 'vitest';
import { eq, sql } from 'drizzle-orm';
import { db, closeDb } from '@/server/db';
import * as schema from '@/server/db/schema';
import { writeImportedPage } from './transfer-page-writer';

vi.mock('@/server/pipeline', () => ({
  renderMarkdown: (source: string) => ({ html: `<p>${source}</p>`, hash: `hash-${source.length}` }),
}));
vi.mock('./content-assets', () => ({ syncRevisionAssetRefs: vi.fn() }));
vi.mock('./storage-replication', () => ({ addReplicationTasks: vi.fn(), kickReplication: vi.fn() }));
vi.mock('./ai-index', () => ({ reconcilePageAcrossIndexes: vi.fn() }));

const TRUNCATE =
  'TRUNCATE TABLE content_asset_refs, storage_replication_tasks, ai_page_index_states, ai_index_generations, ai_actions, page_revisions, pages, users, spaces RESTART IDENTITY CASCADE';

let adminId: string;
let spaceId: string;

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
});
