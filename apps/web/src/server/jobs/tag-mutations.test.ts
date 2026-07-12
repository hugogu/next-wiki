import { afterAll, beforeEach, describe, expect, it } from 'vitest';
import { eq } from 'drizzle-orm';
import { closeDb, db } from '@/server/db';
import * as schema from '@/server/db/schema';
import { buildUserCtx } from '@/server/permissions';
import * as pages from '@/server/services/pages';
import * as tags from '@/server/services/tags';
import { runTagMutation } from './tag-mutations';

async function reset() {
  await db.delete(schema.pageRevisions); await db.delete(schema.pages);
  await db.delete(schema.tagMutations); await db.delete(schema.tags); await db.delete(schema.users);
  if (!await db.query.spaces.findFirst({ where: eq(schema.spaces.slug, 'default') })) {
    await db.insert(schema.spaces).values({ slug: 'default', name: 'Default', anonymousRead: true });
  }
  const [user] = await db.insert(schema.users).values({ email: `mutation-${Date.now()}@example.com`, passwordHash: 'HASH', role: 'editor', status: 'active' }).returning();
  if (!user) throw new Error('missing user');
  return { ctx: buildUserCtx(user.id, 'editor') };
}

describe('tag mutation worker', () => {
  beforeEach(reset);
  afterAll(closeDb);

  it('moves queued mutations through succeeded and updates 100 active page heads', async () => {
    const { ctx } = await reset();
    const tag = await tags.createTag(ctx, 'shared');
    for (let index = 0; index < 100; index++) {
      await pages.create(ctx, { path: `fanout-${index}`, title: `Page ${index}`, contentSource: `---\ntags: [shared]\n---\n\n# ${index}` });
    }
    const operation = await tags.requestTagMutation(ctx, tag.id, 'rename', 'renamed');
    expect(operation.status).toBe('queued');
    await runTagMutation(operation.id);
    expect(await tags.getTagMutation(ctx, operation.id)).toMatchObject({ status: 'succeeded', affectedPageCount: 100 });
    const latest = await db.query.pages.findFirst({ where: eq(schema.pages.path, 'fanout-42') });
    const tagsOnPage = await db.select().from(schema.pageRevisionTags).where(eq(schema.pageRevisionTags.revisionId, latest!.latestVersionId!));
    expect(tagsOnPage[0]?.tagName).toBe('renamed');
  });

  it('records a failed operation when the target tag disappears before the worker starts', async () => {
    const { ctx } = await reset();
    const tag = await tags.createTag(ctx, 'ephemeral');
    const operation = await tags.requestTagMutation(ctx, tag.id, 'delete');
    await db.update(schema.tags).set({ deletedAt: new Date() }).where(eq(schema.tags.id, tag.id));
    await runTagMutation(operation.id);
    expect(await tags.getTagMutation(ctx, operation.id)).toMatchObject({ status: 'failed' });
  });
});
