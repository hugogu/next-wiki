import { beforeAll, afterAll, describe, it, expect } from 'vitest';
import { randomUUID } from 'node:crypto';
import { readFile } from 'node:fs/promises';
import path from 'node:path';
import { eq } from 'drizzle-orm';
import { db, closeDb } from '@/server/db';
import * as schema from '@/server/db/schema';
import { buildUserCtx, type PermCtx } from '@/server/permissions';
import * as pageService from '@/server/services/pages';
import { withTempDir } from '../../../test/content-storage-fixtures';

let editorCtx: PermCtx;
let temp: { dir: string; cleanup: () => Promise<void> };

async function cleanup() {
  await db.delete(schema.contentAssetRefs);
  await db.delete(schema.pageRevisions);
  await db.delete(schema.pages);
  await db.delete(schema.storageBackends);
  await db.delete(schema.users);
  await db.delete(schema.spaces);
}

beforeAll(async () => {
  await cleanup();
  await db
    .insert(schema.spaces)
    .values({ slug: 'default', name: 'Default', anonymousRead: true });
  const [editor] = await db
    .insert(schema.users)
    .values({ email: 'md-editor@example.com', passwordHash: 'HASH', role: 'editor' })
    .returning();
  editorCtx = buildUserCtx(editor!.id, 'editor');

  temp = await withTempDir();
  // Make Local the active authoritative backend.
  await db.insert(schema.storageBackends).values({
    type: 'local',
    purpose: 'primary',
    isActive: true,
    config: { basePath: temp.dir },
  });
});

afterAll(async () => {
  await temp.cleanup();
  await cleanup();
  await closeDb();
});

describe('markdown indirection through the active store', () => {
  it('stores new-page markdown externally and reads it back', async () => {
    const source = `# External ${randomUUID()}\n\nstored on disk`;
    const { versionId } = await pageService.create(editorCtx, {
      path: `ext/${randomUUID()}`,
      title: 'External',
      contentSource: source,
    });

    // content_source stays null for external backends.
    const revision = await db.query.pageRevisions.findFirst({
      where: eq(schema.pageRevisions.id, versionId),
    });
    expect(revision!.contentSource).toBeNull();

    // The markdown bytes live on disk under the managed namespace.
    const onDisk = await readFile(path.join(temp.dir, 'markdown', `${versionId}.md`), 'utf8');
    expect(onDisk).toBe(source);
  });

  it('getForEdit and getRevision resolve external markdown', async () => {
    const source = `body ${randomUUID()}`;
    const pagePath = `ext/${randomUUID()}`;
    await pageService.create(editorCtx, { path: pagePath, title: 'R', contentSource: source });

    const edit = await pageService.getForEdit(editorCtx, pagePath);
    expect(edit?.contentSource).toBe(source);

    const rev = await pageService.getRevision(editorCtx, pagePath, 1);
    expect(rev?.contentSource).toBe(source);
  });
});
