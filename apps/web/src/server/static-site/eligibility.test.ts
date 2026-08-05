import { afterAll, afterEach, beforeAll, describe, expect, it } from 'vitest';
import { createHash, randomUUID } from 'node:crypto';
import { eq } from 'drizzle-orm';
import { db, closeDb } from '@/server/db';
import * as schema from '@/server/db/schema';
import { addressKey, buildPublishableSet, summarizeEligibility } from './eligibility';

/**
 * FR-007's five conditions, each verified in isolation. A page that fails any
 * one of them must not appear, and the negative cases matter more than the
 * positive one: this is the filter the whole feature's safety rests on.
 */

let authorId: string;
const spaceIds: Record<string, string> = {};

async function makeSpace(
  slug: string,
  kind: 'wiki' | 'raw' | 'generated',
  anonymousRead: boolean,
): Promise<string> {
  const [space] = await db
    .insert(schema.spaces)
    .values({ slug, name: slug, kind, anonymousRead })
    .returning();
  spaceIds[slug] = space!.id;
  return space!.id;
}

async function makePage(options: {
  spaceId: string;
  path: string;
  title?: string;
  locale?: string;
  visibility?: 'public' | 'restricted';
  kind?: 'native' | 'link';
  linkTargetPageId?: string;
  published?: boolean;
  deleted?: boolean;
  translationGroupId?: string | null;
  body?: string;
}): Promise<string> {
  const [page] = await db
    .insert(schema.pages)
    .values({
      spaceId: options.spaceId,
      slug: options.path.split('/').pop()!,
      path: options.path,
      locale: options.locale ?? 'en',
      title: options.title ?? options.path,
      authorId,
      visibility: options.visibility ?? 'public',
      kind: options.kind ?? 'native',
      linkTargetPageId: options.linkTargetPageId,
      translationGroupId: options.translationGroupId ?? null,
      deletedAt: options.deleted ? new Date() : null,
    })
    .returning();

  const [revision] = await db
    .insert(schema.pageRevisions)
    .values({
      pageId: page!.id,
      versionNumber: 1,
      contentSource: options.body ?? `# ${options.title ?? options.path}`,
      contentHtml: `<h1>${options.title ?? options.path}</h1>`,
      contentHash: createHash('sha256')
        .update(options.body ?? options.path)
        .digest('hex'),
      status: options.published === false ? 'draft' : 'published',
      publishedAt: options.published === false ? null : new Date(),
      authorId,
    })
    .returning();

  await db
    .update(schema.pages)
    .set({
      latestVersionId: revision!.id,
      currentPublishedVersionId: options.published === false ? null : revision!.id,
    })
    .where(eq(schema.pages.id, page!.id));

  return page!.id;
}

async function clearContent(): Promise<void> {
  // pages and page_revisions reference each other, so the pointers back into
  // revisions are cleared before the revisions themselves are removed.
  await db.update(schema.pages).set({ currentPublishedVersionId: null, latestVersionId: null });
  await db.delete(schema.pageRevisions);
  await db.delete(schema.pages);
  await db.delete(schema.spaces);
}

beforeAll(async () => {
  await clearContent();
  await db.delete(schema.users);
  const [author] = await db
    .insert(schema.users)
    .values({ email: 'elig@example.com', passwordHash: 'HASH', role: 'admin' })
    .returning();
  authorId = author!.id;
});

afterEach(async () => {
  await clearContent();
});

afterAll(async () => {
  await db.delete(schema.users);
  await closeDb();
});

describe('buildPublishableSet', () => {
  it('includes a published, public page in an anonymous-readable wiki space', async () => {
    const space = await makeSpace('wiki-open', 'wiki', true);
    await makePage({ spaceId: space, path: 'guides/setup', title: 'Setup' });

    const set = await buildPublishableSet();
    expect(set.pages.map((p) => p.path)).toEqual(['guides/setup']);
    expect(set.pageIdsByAddress.has(addressKey('en', 'guides/setup'))).toBe(true);
  });

  it('excludes a soft-deleted page', async () => {
    const space = await makeSpace('wiki-open', 'wiki', true);
    await makePage({ spaceId: space, path: 'gone', title: 'Gone', deleted: true });

    const set = await buildPublishableSet();
    expect(set.pages).toHaveLength(0);
    expect(set.exclusions.deleted).toBe(1);
  });

  it('excludes a page with no published revision', async () => {
    const space = await makeSpace('wiki-open', 'wiki', true);
    await makePage({ spaceId: space, path: 'draft', title: 'Draft', published: false });

    const set = await buildPublishableSet();
    expect(set.pages).toHaveLength(0);
    expect(set.exclusions.not_published).toBe(1);
  });

  it('excludes a restricted page', async () => {
    const space = await makeSpace('wiki-open', 'wiki', true);
    await makePage({ spaceId: space, path: 'internal', title: 'Internal', visibility: 'restricted' });

    const set = await buildPublishableSet();
    expect(set.pages).toHaveLength(0);
    expect(set.exclusions.restricted).toBe(1);
  });

  it('excludes every page in a space that disallows anonymous reading', async () => {
    const space = await makeSpace('wiki-closed', 'wiki', false);
    await makePage({ spaceId: space, path: 'a', title: 'A' });
    await makePage({ spaceId: space, path: 'b', title: 'B' });

    const set = await buildPublishableSet();
    expect(set.pages).toHaveLength(0);
    expect(set.exclusions.space_not_anonymous).toBe(2);
  });

  it('excludes a raw-capture space even when the page looks publishable', async () => {
    // Raw evidence is preserved for grounding, not for readers. Its visibility
    // flag must not be able to put it on the public internet.
    const space = await makeSpace('raw-space', 'raw', true);
    await makePage({ spaceId: space, path: 'conversation-1', title: 'Chat log' });

    const set = await buildPublishableSet();
    expect(set.pages).toHaveLength(0);
    expect(set.exclusions.space_kind_raw).toBe(1);
  });

  it('excludes a generated-knowledge space even when the page looks publishable', async () => {
    const space = await makeSpace('generated-space', 'generated', true);
    await makePage({ spaceId: space, path: 'summary', title: 'AI summary' });

    const set = await buildPublishableSet();
    expect(set.pages).toHaveLength(0);
    expect(set.exclusions.space_kind_generated).toBe(1);
  });

  it('excludes historical link pages even when their target is publishable', async () => {
    const space = await makeSpace('wiki-open', 'wiki', true);
    const target = await makePage({ spaceId: space, path: 'guides/setup', title: 'Setup' });
    await makePage({
      spaceId: space,
      path: 'legacy-setup',
      title: 'Legacy setup',
      kind: 'link',
      linkTargetPageId: target,
    });

    const set = await buildPublishableSet();
    expect(set.pages.map((page) => page.path)).toEqual(['guides/setup']);
  });

  it('publishes only the eligible pages from a mixed wiki', async () => {
    const open = await makeSpace('wiki-open', 'wiki', true);
    const closed = await makeSpace('wiki-closed', 'wiki', false);
    const raw = await makeSpace('raw-space', 'raw', true);

    await makePage({ spaceId: open, path: 'public-a', title: 'Public A' });
    await makePage({ spaceId: open, path: 'public-b', title: 'Public B' });
    await makePage({ spaceId: open, path: 'secret', title: 'Secret', visibility: 'restricted' });
    await makePage({ spaceId: open, path: 'draft', title: 'Draft', published: false });
    await makePage({ spaceId: closed, path: 'internal', title: 'Internal' });
    await makePage({ spaceId: raw, path: 'chat', title: 'Chat' });

    const set = await buildPublishableSet();
    expect(set.pages.map((p) => p.path).sort()).toEqual(['public-a', 'public-b']);

    // Nothing about the excluded pages leaks into the set.
    const serialized = JSON.stringify([...set.pageIdsByAddress.keys()]);
    expect(serialized).not.toContain('secret');
    expect(serialized).not.toContain('internal');
    expect(serialized).not.toContain('chat');
  });

  it('groups translations so the language switcher only offers what exists', async () => {
    const space = await makeSpace('wiki-open', 'wiki', true);
    const group = randomUUID();
    await makePage({ spaceId: space, path: 'guides/setup', title: 'Setup', locale: 'en', translationGroupId: group });
    await makePage({ spaceId: space, path: 'guides/setup', title: '安装', locale: 'zh', translationGroupId: group });

    const set = await buildPublishableSet();
    expect(set.translationGroups.get(group)?.get('en')).toBe('guides/setup');
    expect(set.translationGroups.get(group)?.get('zh')).toBe('guides/setup');
  });

  it('does not group a translation whose sibling is not publishable', async () => {
    const space = await makeSpace('wiki-open', 'wiki', true);
    const group = randomUUID();
    await makePage({ spaceId: space, path: 'p', title: 'EN', locale: 'en', translationGroupId: group });
    await makePage({
      spaceId: space,
      path: 'p',
      title: 'ZH',
      locale: 'zh',
      translationGroupId: group,
      visibility: 'restricted',
    });

    const set = await buildPublishableSet();
    expect([...(set.translationGroups.get(group)?.keys() ?? [])]).toEqual(['en']);
  });

  it('returns an empty set rather than throwing when the wiki has nothing publishable', async () => {
    await makeSpace('wiki-closed', 'wiki', false);
    const set = await buildPublishableSet();
    expect(set.pages).toEqual([]);
    expect(set.assetIds.size).toBe(0);
  });
});

describe('summarizeEligibility', () => {
  it('reports counts grouped by reason without naming any page', async () => {
    const open = await makeSpace('wiki-open', 'wiki', true);
    const raw = await makeSpace('raw-space', 'raw', true);
    await makePage({ spaceId: open, path: 'public', title: 'Public' });
    await makePage({ spaceId: open, path: 'secret', title: 'Secret', visibility: 'restricted' });
    await makePage({ spaceId: raw, path: 'chat', title: 'Chat log' });

    const summary = await summarizeEligibility();
    expect(summary.publishable).toBe(1);
    expect(summary.excluded).toBe(2);
    expect(summary.exclusionsByReason.restricted).toBe(1);
    expect(summary.exclusionsByReason.space_kind_raw).toBe(1);

    // The summary is shown in the admin UI and must not become a side channel
    // for the titles it is counting.
    const serialized = JSON.stringify(summary);
    expect(serialized).not.toContain('Secret');
    expect(serialized).not.toContain('Chat log');
  });

  it('counts each excluded page exactly once, so the totals add up', async () => {
    const raw = await makeSpace('raw-space', 'raw', true);
    // Deleted AND restricted AND in a raw space: still one excluded page.
    await makePage({
      spaceId: raw,
      path: 'x',
      title: 'X',
      visibility: 'restricted',
      deleted: true,
    });

    const summary = await summarizeEligibility();
    const sum = Object.values(summary.exclusionsByReason).reduce((a, b) => a + b, 0);
    expect(sum).toBe(summary.excluded);
    expect(summary.excluded).toBe(1);
  });
});
