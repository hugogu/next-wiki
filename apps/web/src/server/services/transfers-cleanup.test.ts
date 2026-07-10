import { randomUUID } from 'node:crypto';
import { afterAll, beforeEach, describe, expect, it } from 'vitest';
import { eq, sql } from 'drizzle-orm';
import { db, closeDb } from '@/server/db';
import * as schema from '@/server/db/schema';
import { buildUserCtx } from '@/server/permissions';
import { cleanupRun } from './transfers';

const TRUNCATE =
  'TRUNCATE TABLE transfer_items, transfer_runs, page_revisions, pages, users, spaces RESTART IDENTITY CASCADE';

async function seedRun(status: 'completed' | 'running', kind: 'wikijs_import' | 'site_export' = 'wikijs_import') {
  const [admin] = await db
    .insert(schema.users)
    .values({ email: `cleanup-${randomUUID()}@example.com`, passwordHash: 'TEST', role: 'admin' })
    .returning();
  const [space] = await db.insert(schema.spaces).values({ slug: `sp-${randomUUID()}`, name: 'Default' }).returning();
  const [createdPage] = await db
    .insert(schema.pages)
    .values({ spaceId: space!.id, slug: 'created', path: 'imp/created', title: 'Created', authorId: admin!.id })
    .returning();
  const [replacedPage] = await db
    .insert(schema.pages)
    .values({ spaceId: space!.id, slug: 'replaced', path: 'imp/replaced', title: 'Replaced', authorId: admin!.id })
    .returning();
  const [skippedPage] = await db
    .insert(schema.pages)
    .values({ spaceId: space!.id, slug: 'skipped', path: 'imp/skipped', title: 'Skipped', authorId: admin!.id })
    .returning();
  const [run] = await db
    .insert(schema.transferRuns)
    .values({
      kind,
      status,
      actorUserId: admin!.id,
      createdItems: 1,
      replacedItems: 1,
      skippedItems: 1,
      options: {},
      expiresAt: new Date(Date.now() + 3_600_000),
    })
    .returning();
  await db.insert(schema.transferItems).values([
    { runId: run!.id, kind: 'page', sourceKey: '1', displayName: 'created', targetKey: createdPage!.id, action: 'create', status: 'completed', metadata: {} },
    { runId: run!.id, kind: 'page', sourceKey: '2', displayName: 'replaced', targetKey: replacedPage!.id, action: 'replace', status: 'completed', metadata: {} },
    // Skips point at an existing page the import deliberately left alone.
    { runId: run!.id, kind: 'page', sourceKey: '3', displayName: 'skipped', targetKey: skippedPage!.id, action: 'skip', status: 'completed', metadata: {} },
  ]);
  return {
    adminId: admin!.id,
    runId: run!.id,
    createdPageId: createdPage!.id,
    replacedPageId: replacedPage!.id,
    skippedPageId: skippedPage!.id,
  };
}

describe('transfer run cleanup', () => {
  beforeEach(async () => {
    await db.execute(sql.raw(TRUNCATE));
  });
  afterAll(async () => {
    await db.execute(sql.raw(TRUNCATE));
    await closeDb();
  });

  it('soft-deletes the pages the run wrote (not skips), and is idempotent', async () => {
    const { adminId, runId, createdPageId, replacedPageId, skippedPageId } = await seedRun('completed');
    const ctx = buildUserCtx(adminId, 'admin');

    const result = await cleanupRun(ctx, runId);
    expect(result.deletedPages).toBe(2);

    const created = await db.query.pages.findFirst({ where: eq(schema.pages.id, createdPageId) });
    const replaced = await db.query.pages.findFirst({ where: eq(schema.pages.id, replacedPageId) });
    const skipped = await db.query.pages.findFirst({ where: eq(schema.pages.id, skippedPageId) });
    expect(created?.deletedAt).not.toBeNull(); // created page removed
    expect(replaced?.deletedAt).not.toBeNull(); // replaced page removed too
    expect(skipped?.deletedAt).toBeNull(); // skipped page left untouched

    // Re-running deletes nothing more.
    expect((await cleanupRun(ctx, runId)).deletedPages).toBe(0);
  });

  it('refuses to clean up a run that is not a finished import', async () => {
    const running = await seedRun('running');
    await expect(cleanupRun(buildUserCtx(running.adminId, 'admin'), running.runId)).rejects.toMatchObject({
      code: 'RUN_NOT_CLEANABLE',
    });

    const exportRun = await seedRun('completed', 'site_export');
    await expect(cleanupRun(buildUserCtx(exportRun.adminId, 'admin'), exportRun.runId)).rejects.toMatchObject({
      code: 'RUN_NOT_CLEANABLE',
    });
  });
});
