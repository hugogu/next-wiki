import { afterAll, beforeAll, describe, expect, it } from 'vitest';
import { eq } from 'drizzle-orm';
import { closeDb, db } from '@/server/db';
import * as schema from '@/server/db/schema';
import { buildUserCtx } from '@/server/permissions';
import * as pages from './pages';
import * as tags from './tags';
import { runTagMutation } from '@/server/jobs/tag-mutations';
import { readMarkdownFromDatabase } from '@/server/content-store/read-router';

async function setup() {
  await db.delete(schema.pageRevisions);
  await db.delete(schema.pages);
  await db.delete(schema.tagMutations);
  await db.delete(schema.tags);
  await db.delete(schema.users);
  const space = await db.query.spaces.findFirst({ where: eq(schema.spaces.slug, 'default') });
  if (!space) await db.insert(schema.spaces).values({ slug: 'default', name: 'Default', anonymousRead: true });
  const [editor] = await db.insert(schema.users).values({
    email: 'tag-editor@example.com', passwordHash: 'HASH', role: 'editor', status: 'active',
  }).returning();
  if (!editor) throw new Error('Failed to create editor');
  return { editor, ctx: buildUserCtx(editor.id, 'editor') };
}

describe('tag lifecycle', () => {
  beforeAll(async () => { await setup(); });
  afterAll(async () => { await closeDb(); });

  it('normalizes registry names and synchronizes a rename to the active page revision', async () => {
    const { editor, ctx } = await setup();
    const tag = await tags.createTag(ctx, ' DevOps ');
    await expect(tags.createTag(ctx, 'devops')).rejects.toThrow('already exists');
    const created = await pages.create(ctx, {
      path: 'tagged-page',
      title: 'Tagged page',
      contentSource: '---\ntags: [devops]\nsummary: A summary\n---\n\n# Body',
    });
    const mutation = await tags.requestTagMutation(ctx, tag.id, 'rename', 'Platform');
    await runTagMutation(mutation.id);

    const page = await db.query.pages.findFirst({ where: eq(schema.pages.id, created.pageId) });
    expect(page?.latestVersionId).not.toBe(created.versionId);
    const latest = await db.query.pageRevisions.findFirst({ where: eq(schema.pageRevisions.id, page!.latestVersionId!) });
    expect(await readMarkdownFromDatabase(latest!)).toContain('Platform');
    const metadata = await db.query.pageRevisionMetadata.findFirst({ where: eq(schema.pageRevisionMetadata.revisionId, latest!.id) });
    expect(metadata?.summary).toBe('A summary');
    const status = await tags.getTagMutation(buildUserCtx(editor.id, 'editor'), mutation.id);
    expect(status).toMatchObject({ status: 'succeeded', affectedPageCount: 1 });
  });
});
