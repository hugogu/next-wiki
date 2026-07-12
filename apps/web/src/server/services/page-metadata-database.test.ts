import { randomUUID } from 'node:crypto';
import { afterAll, beforeAll, describe, expect, it, vi } from 'vitest';
import { eq, sql } from 'drizzle-orm';
import { closeDb, db } from '@/server/db';
import * as schema from '@/server/db/schema';
import { buildUserCtx } from '@/server/permissions';
import * as pages from './pages';

vi.mock('@/server/pipeline', () => ({
  renderMarkdown: (source: string) => ({ html: `<p>${source}</p>`, hash: `hash-${source.length}` }),
}));
vi.mock('@/server/services/content-assets', () => ({ syncRevisionAssetRefs: vi.fn() }));
vi.mock('@/server/services/storage-replication', () => ({ addReplicationTasks: vi.fn(), kickReplication: vi.fn() }));
vi.mock('@/server/services/git-export', () => ({ enqueueGitExport: vi.fn() }));
vi.mock('@/server/services/ai-index', () => ({ reconcilePageAcrossIndexes: vi.fn() }));

const TRUNCATE = 'TRUNCATE TABLE page_revisions, pages, users, spaces RESTART IDENTITY CASCADE';
let userId: string;

beforeAll(async () => {
  await db.execute(sql.raw(TRUNCATE));
  const [space] = await db.insert(schema.spaces).values({ slug: 'default', name: 'Default' }).returning();
  if (!space) throw new Error('missing space');
  const [user] = await db.insert(schema.users).values({
    email: `database-metadata-${randomUUID()}@example.com`, passwordHash: 'HASH', role: 'editor', status: 'active',
  }).returning();
  if (!user) throw new Error('missing user');
  userId = user.id;
});

afterAll(async () => {
  await db.execute(sql.raw(TRUNCATE));
  await closeDb();
});

describe('database-only page metadata', () => {
  it('stores page properties on the revision without changing Markdown', async () => {
    const ctx = buildUserCtx(userId, 'editor');
    const created = await pages.create(ctx, {
      path: 'database-metadata', title: 'Database metadata', contentSource: '# Original body',
    });
    const draft = await pages.newDraft(ctx, 'database-metadata', {
      title: 'Database metadata',
      contentSource: '# Original body',
      baseRevisionId: created.versionId,
      metadata: { date: '2026-07-12', summary: 'Stored outside Markdown', tags: ['DevOps'] },
    });

    const revision = await db.query.pageRevisions.findFirst({ where: eq(schema.pageRevisions.id, draft.versionId) });
    const metadata = await db.query.pageRevisionMetadata.findFirst({ where: eq(schema.pageRevisionMetadata.revisionId, draft.versionId) });
    const assignments = await db.query.pageRevisionTags.findMany({ where: eq(schema.pageRevisionTags.revisionId, draft.versionId) });
    expect(revision?.contentSource).toBe('# Original body');
    expect(metadata).toMatchObject({ title: 'Database metadata', date: '2026-07-12', summary: 'Stored outside Markdown' });
    expect(assignments.map((tag) => tag.normalizedName)).toEqual(['devops']);
  });
});
