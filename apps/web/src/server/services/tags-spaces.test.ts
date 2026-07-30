import { randomUUID } from 'node:crypto';
import { and, eq, sql } from 'drizzle-orm';
import { afterAll, beforeEach, describe, expect, it } from 'vitest';
import { db } from '@/server/db';
import * as schema from '@/server/db/schema';
import { buildUserCtx } from '@/server/permissions';
import { DomainError } from '@/server/errors';
import { setModeInternal } from '@/server/services/writing-mode';
import { persistRevisionMetadata } from '@/server/services/page-metadata';
import * as tags from './tags';

/**
 * Frontmatter tags on a page in any space become real tag rows, but in that
 * page's space (persistRevisionMetadata resolves them against `page.spaceId`).
 * The tag list must therefore be able to reach a non-wiki space, or Raw and
 * Generated tags exist while being invisible to an administrator.
 */
const RAW_MD = '---\ntags: [conversation]\n---\n\n# Captured';

type Seed = { adminId: string; wikiSpaceId: string; rawSpaceId: string };

/** Reuse whatever spaces exist instead of truncating them: `spaces` is the root
 * of most foreign keys, so a CASCADE here would wipe unrelated suites' state. */
async function ensureSpace(slug: string, kind: 'wiki' | 'raw'): Promise<string> {
  await db
    .insert(schema.spaces)
    .values({ slug, name: slug, kind, anonymousRead: true })
    .onConflictDoNothing();
  const space = await db.query.spaces.findFirst({ where: eq(schema.spaces.slug, slug) });
  if (!space) throw new Error(`Failed to ensure the ${slug} space`);
  return space.id;
}

async function seed(): Promise<Seed> {
  await db.execute(
    sql.raw(
      'truncate table page_revision_tags, page_revision_metadata, tags, page_revisions, pages restart identity cascade',
    ),
  );
  const adminId = randomUUID();
  await db
    .insert(schema.users)
    .values({ id: adminId, email: `admin-${adminId}@example.com`, passwordHash: 'x', role: 'admin' });
  const wikiSpaceId = await ensureSpace('default', 'wiki');
  const rawSpaceId = await ensureSpace('raw', 'raw');
  await setModeInternal('llm-wiki', adminId);
  return { adminId, wikiSpaceId, rawSpaceId };
}

/** A published page carrying frontmatter tags, written the way every space's
 * writer does it. */
async function seedTaggedPage(spaceId: string, path: string, authorId: string): Promise<void> {
  const pageId = randomUUID();
  const revisionId = randomUUID();
  await db.insert(schema.pages).values({
    id: pageId,
    spaceId,
    slug: path,
    path,
    locale: 'en',
    title: path,
    authorId,
    currentPublishedVersionId: revisionId,
    latestVersionId: revisionId,
  });
  await db.insert(schema.pageRevisions).values({
    id: revisionId,
    pageId,
    versionNumber: 1,
    contentSource: RAW_MD,
    contentHtml: '<h1>Captured</h1>',
    contentHash: `hash-${revisionId}`,
    authorId,
    status: 'published',
    publishedAt: new Date(),
  });
  await db.transaction(async (tx) => {
    await persistRevisionMetadata(tx, {
      revisionId,
      spaceId,
      source: RAW_MD,
      fallbackTitle: path,
    });
  });
}

describe('tag listing across spaces', () => {
  let s: Seed;
  beforeEach(async () => {
    s = await seed();
  });

  // Leave the shared writing-mode singleton as the rest of the suite expects it.
  afterAll(async () => {
    await setModeInternal('copilot', null);
  });

  it('registers a frontmatter tag of a raw page in that page’s space', async () => {
    await seedTaggedPage(s.rawSpaceId, 'conversations/2026-07-30', s.adminId);
    const row = await db.query.tags.findFirst({
      where: eq(schema.tags.normalizedName, 'conversation'),
    });
    expect(row?.spaceId).toBe(s.rawSpaceId);
  });

  it('does not show a raw tag in the default wiki space', async () => {
    await seedTaggedPage(s.rawSpaceId, 'conversations/2026-07-30', s.adminId);
    const ctx = buildUserCtx(s.adminId, 'admin');
    expect((await tags.listTags(ctx)).items).toEqual([]);
    expect((await tags.listTags(ctx, { space: 'raw' })).items).toMatchObject([
      { name: 'conversation', normalizedName: 'conversation' },
    ]);
  });

  it('keeps each space’s tags separate', async () => {
    await seedTaggedPage(s.wikiSpaceId, 'guide', s.adminId);
    await seedTaggedPage(s.rawSpaceId, 'conversations/2026-07-30', s.adminId);
    const ctx = buildUserCtx(s.adminId, 'admin');
    const wiki = await tags.listTags(ctx);
    const raw = await tags.listTags(ctx, { space: 'raw' });
    expect(wiki.items).toHaveLength(1);
    expect(raw.items).toHaveLength(1);
    // Same name, two rows: one per space.
    expect(wiki.items[0]!.normalizedName).toBe(raw.items[0]!.normalizedName);
    expect(wiki.items[0]!.id).not.toBe(raw.items[0]!.id);
    const rows = await db
      .select({ spaceId: schema.tags.spaceId })
      .from(schema.tags)
      .where(and(eq(schema.tags.normalizedName, 'conversation')));
    expect(rows.map((row) => row.spaceId).sort()).toEqual([s.rawSpaceId, s.wikiSpaceId].sort());
  });

  it('refuses a non-wiki space in copilot writing mode', async () => {
    await seedTaggedPage(s.rawSpaceId, 'conversations/2026-07-30', s.adminId);
    await setModeInternal('copilot', s.adminId);
    const ctx = buildUserCtx(s.adminId, 'admin');
    await expect(tags.listTags(ctx, { space: 'raw' })).rejects.toBeInstanceOf(DomainError);
    // The default space is unaffected.
    await expect(tags.listTags(ctx)).resolves.toMatchObject({ items: [] });
  });

  it('returns nothing for an unknown space instead of falling back to wiki', async () => {
    await seedTaggedPage(s.wikiSpaceId, 'guide', s.adminId);
    const ctx = buildUserCtx(s.adminId, 'admin');
    expect((await tags.listTags(ctx, { space: 'nope' })).items).toEqual([]);
  });
});
