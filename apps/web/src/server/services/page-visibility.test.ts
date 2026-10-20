import { randomUUID } from 'node:crypto';
import { afterAll, beforeEach, describe, expect, it, vi } from 'vitest';
import { eq, inArray, like } from 'drizzle-orm';
import { MAX_BULK_VISIBILITY_PAGES, type PageVisibility } from '@next-wiki/shared';
import { db, closeDb } from '@/server/db';
import * as schema from '@/server/db/schema';
import { buildAnonymousCtx, buildApiKeyCtx, buildUserCtx } from '@/server/permissions';
import { setPagesVisibility } from '@/server/services/page-visibility';
import { createAdminUser, resetSetupOnboardingState } from '../../../test/setup-onboarding-fixtures';
import { createPublicApiUser } from '../../../test/public-wiki-api-fixtures';

const events = vi.hoisted(() => ({ notifyPublicContentChanged: vi.fn().mockResolvedValue(undefined) }));
vi.mock('@/server/services/public-content-events', () => events);
const cache = vi.hoisted(() => ({ invalidatePublicContentCache: vi.fn() }));
vi.mock('@/server/cache/public-cache', async (importOriginal) => ({
  ...(await importOriginal<typeof import('@/server/cache/public-cache')>()),
  ...cache,
}));

let adminId: string;
let defaultSpaceId: string;

async function insertPage(input: {
  path: string;
  visibility: PageVisibility;
  published?: boolean;
  spaceId?: string;
  deleted?: boolean;
}): Promise<string> {
  const [page] = await db
    .insert(schema.pages)
    .values({
      spaceId: input.spaceId ?? defaultSpaceId,
      slug: input.path,
      path: input.path,
      title: input.path,
      authorId: adminId,
      visibility: input.visibility,
      deletedAt: input.deleted ? new Date() : null,
      updatedAt: new Date('2026-01-01T00:00:00.000Z'),
    })
    .returning({ id: schema.pages.id });
  if (input.published !== false) {
    const [revision] = await db
      .insert(schema.pageRevisions)
      .values({
        pageId: page!.id,
        versionNumber: 1,
        contentSource: `# ${input.path}`,
        contentHtml: `<h1>${input.path}</h1>`,
        contentHash: randomUUID(),
        authorId: adminId,
        status: 'published',
        publishedAt: new Date(),
      })
      .returning({ id: schema.pageRevisions.id });
    await db
      .update(schema.pages)
      .set({ currentPublishedVersionId: revision!.id, latestVersionId: revision!.id })
      .where(eq(schema.pages.id, page!.id));
  }
  return page!.id;
}

async function visibilityOf(pageId: string) {
  const page = await db.query.pages.findFirst({ where: eq(schema.pages.id, pageId) });
  return page?.visibility;
}

async function visibilityAuditPaths() {
  const rows = await db
    .select({ path: schema.apiAuditEntries.path, userId: schema.apiAuditEntries.userId })
    .from(schema.apiAuditEntries)
    .where(like(schema.apiAuditEntries.path, '/pages/%/visibility%'));
  return rows;
}

describe('setPagesVisibility', () => {
  beforeEach(async () => {
    vi.clearAllMocks();
    await resetSetupOnboardingState();
    adminId = (await createAdminUser({ email: 'bulk-visibility-admin@example.com' })).userId;
    const space = await db.query.spaces.findFirst({ where: eq(schema.spaces.slug, 'default') });
    defaultSpaceId = space!.id;
  });

  afterAll(async () => {
    await resetSetupOnboardingState();
    await closeDb();
  });

  it('refuses anyone but an administrator session, including an administrator API key', async () => {
    const pageId = await insertPage({ path: 'guarded', visibility: 'public' });
    const editor = await createPublicApiUser('bulk-visibility-editor@example.com', 'editor');
    const input = { scope: { kind: 'pages' as const, pageIds: [pageId] }, visibility: 'restricted' as const };

    for (const ctx of [
      buildUserCtx(editor.id, 'editor'),
      buildApiKeyCtx(adminId, 'admin', ['view', 'create', 'edit', 'delete'], randomUUID()),
      buildAnonymousCtx(),
    ]) {
      await expect(setPagesVisibility(ctx, input)).rejects.toMatchObject({ code: 'FORBIDDEN' });
    }
    expect(await visibilityOf(pageId)).toBe('public');
    expect(await visibilityAuditPaths()).toEqual([]);
  });

  it('reports each chosen page’s outcome and audits only the pages that changed', async () => {
    const changing = await insertPage({ path: 'news/changing', visibility: 'public' });
    const already = await insertPage({ path: 'news/already', visibility: 'restricted' });
    const deleted = await insertPage({ path: 'news/deleted', visibility: 'public', deleted: true });
    const unknown = randomUUID();

    const result = await setPagesVisibility(buildUserCtx(adminId, 'admin'), {
      scope: { kind: 'pages', pageIds: [changing, already, deleted, unknown, changing] },
      visibility: 'restricted',
    });

    expect(result).toMatchObject({
      visibility: 'restricted',
      dryRun: false,
      matched: 2,
      pending: { total: 1, public: 1, registered: 0, restricted: 0, unpublished: 0 },
      changed: 1,
      remaining: 0,
    });
    expect(result.results).toEqual([
      { pageId: changing, outcome: 'changed', previousVisibility: 'public' },
      { pageId: already, outcome: 'unchanged', previousVisibility: 'restricted' },
      { pageId: deleted, outcome: 'not_found', previousVisibility: null },
      { pageId: unknown, outcome: 'not_found', previousVisibility: null },
    ]);

    const changedPage = await db.query.pages.findFirst({ where: eq(schema.pages.id, changing) });
    expect(changedPage).toMatchObject({ visibility: 'restricted', deletedAt: null });
    expect(changedPage!.updatedAt.getTime()).toBeGreaterThan(new Date('2026-01-01T00:00:00.000Z').getTime());
    expect((await db.query.pages.findFirst({ where: eq(schema.pages.id, already) }))!.updatedAt.toISOString())
      .toBe('2026-01-01T00:00:00.000Z');
    expect(await visibilityOf(deleted)).toBe('public');
    expect(await visibilityAuditPaths()).toEqual([
      { path: `/pages/${changing}/visibility?from=public&to=restricted`, userId: adminId },
    ]);
    expect(cache.invalidatePublicContentCache).toHaveBeenCalledTimes(1);
    expect(events.notifyPublicContentChanged).toHaveBeenCalledTimes(1);
  });

  it('counts what a dry run would make public without changing or auditing anything', async () => {
    const pageIds = await Promise.all([
      insertPage({ path: 'curated/public', visibility: 'public' }),
      insertPage({ path: 'curated/registered', visibility: 'registered' }),
      insertPage({ path: 'curated/restricted', visibility: 'restricted' }),
      insertPage({ path: 'curated/draft', visibility: 'restricted', published: false }),
    ]);

    const result = await setPagesVisibility(buildUserCtx(adminId, 'admin'), {
      scope: { kind: 'folder', pathPrefix: 'curated' },
      visibility: 'public',
      dryRun: true,
    });

    expect(result).toEqual({
      visibility: 'public',
      dryRun: true,
      matched: 4,
      pending: { total: 3, public: 0, registered: 1, restricted: 2, unpublished: 1 },
      changed: 0,
      remaining: 3,
      results: [],
    });
    const rows = await db.select({ visibility: schema.pages.visibility }).from(schema.pages).where(inArray(schema.pages.id, pageIds));
    expect(rows.map((row) => row.visibility).sort()).toEqual(['public', 'registered', 'restricted', 'restricted']);
    expect(await visibilityAuditPaths()).toEqual([]);
    expect(cache.invalidatePublicContentCache).not.toHaveBeenCalled();
    expect(events.notifyPublicContentChanged).not.toHaveBeenCalled();
  });

  it('covers a folder’s own page and everything below it, and nothing else', async () => {
    const [generated] = await db
      .insert(schema.spaces)
      .values({ slug: 'generated', name: 'Generated', kind: 'generated', anonymousRead: false })
      .returning({ id: schema.spaces.id });
    const inFolder = await Promise.all([
      insertPage({ path: 'news', visibility: 'public' }),
      insertPage({ path: 'news/a', visibility: 'public' }),
      insertPage({ path: 'news/b/c', visibility: 'registered', published: false }),
    ]);
    const outside = await Promise.all([
      insertPage({ path: 'newsletter', visibility: 'public' }),
      insertPage({ path: 'other/news', visibility: 'public' }),
      insertPage({ path: 'news/gone', visibility: 'public', deleted: true }),
      insertPage({ path: 'news/a', visibility: 'public', spaceId: generated!.id }),
    ]);
    const [group] = await db.insert(schema.translationGroups).values({ sourcePageId: inFolder[1]! }).returning();
    const [translation] = await db
      .insert(schema.pages)
      .values({
        spaceId: defaultSpaceId,
        slug: 'news/a',
        path: 'news/a',
        locale: 'zh',
        title: 'news/a (zh)',
        authorId: adminId,
        visibility: 'public',
        translationGroupId: group!.id,
        sourcePageId: inFolder[1]!,
      })
      .returning({ id: schema.pages.id });

    const result = await setPagesVisibility(buildUserCtx(adminId, 'admin'), {
      scope: { kind: 'folder', space: 'default', pathPrefix: 'news' },
      visibility: 'restricted',
    });

    expect(result).toMatchObject({ matched: 3, changed: 3, remaining: 0 });
    expect(result.results.map((row) => row.pageId).sort()).toEqual([...inFolder].sort());
    expect(result.results.every((row) => row.outcome === 'changed')).toBe(true);
    for (const pageId of inFolder) expect(await visibilityOf(pageId)).toBe('restricted');
    for (const pageId of [...outside, translation!.id]) expect(await visibilityOf(pageId)).toBe('public');
  });

  it('covers the whole space when the folder is left out', async () => {
    const [generated] = await db
      .insert(schema.spaces)
      .values({ slug: 'generated', name: 'Generated', kind: 'generated', anonymousRead: false })
      .returning({ id: schema.spaces.id });
    const wikiPages = await Promise.all([
      insertPage({ path: 'root-page', visibility: 'public' }),
      insertPage({ path: 'deep/er/page', visibility: 'registered' }),
    ]);
    const generatedPage = await insertPage({ path: 'root-page', visibility: 'public', spaceId: generated!.id });

    const result = await setPagesVisibility(buildUserCtx(adminId, 'admin'), {
      scope: { kind: 'folder' },
      visibility: 'restricted',
    });

    expect(result).toMatchObject({ matched: 2, changed: 2, remaining: 0 });
    for (const pageId of wikiPages) expect(await visibilityOf(pageId)).toBe('restricted');
    expect(await visibilityOf(generatedPage)).toBe('public');
  });

  it(`changes at most ${MAX_BULK_VISIBILITY_PAGES} pages per request and reports the rest as remaining`, async () => {
    const total = MAX_BULK_VISIBILITY_PAGES + 1;
    await db.insert(schema.pages).values(Array.from({ length: total }, (_, index) => {
      const path = `feeds/day-${String(index).padStart(4, '0')}`;
      return { spaceId: defaultSpaceId, slug: path, path, title: path, authorId: adminId, visibility: 'public' as const };
    }));
    const ctx = buildUserCtx(adminId, 'admin');
    const input = { scope: { kind: 'folder' as const, pathPrefix: 'feeds' }, visibility: 'registered' as const };

    const first = await setPagesVisibility(ctx, input);
    expect(first).toMatchObject({
      matched: total,
      pending: { total, public: total, unpublished: total },
      changed: MAX_BULK_VISIBILITY_PAGES,
      remaining: 1,
    });
    expect(first.results).toHaveLength(MAX_BULK_VISIBILITY_PAGES);

    const second = await setPagesVisibility(ctx, input);
    expect(second).toMatchObject({ pending: { total: 1 }, changed: 1, remaining: 0 });
    const [last] = second.results;
    expect((await db.query.pages.findFirst({ where: eq(schema.pages.id, last!.pageId) }))!.path).toBe('feeds/day-0500');

    const third = await setPagesVisibility(ctx, input);
    expect(third).toMatchObject({ pending: { total: 0 }, changed: 0, remaining: 0, results: [] });
    expect(await visibilityAuditPaths()).toHaveLength(total);
    expect(events.notifyPublicContentChanged).toHaveBeenCalledTimes(2);
  });

  it('refuses a folder in a space that does not exist', async () => {
    await expect(setPagesVisibility(buildUserCtx(adminId, 'admin'), {
      scope: { kind: 'folder', space: 'nowhere', pathPrefix: 'news' },
      visibility: 'restricted',
    })).rejects.toMatchObject({ code: 'NOT_FOUND' });
  });
});
