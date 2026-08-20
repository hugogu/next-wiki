import { afterAll, beforeEach, describe, expect, it } from 'vitest';
import { and, eq } from 'drizzle-orm';
import { db, closeDb } from '@/server/db';
import * as schema from '@/server/db/schema';
import { assertAddressAvailable, setSlug } from '@/server/services/page-addresses';
import { DomainError } from '@/server/errors';

async function ensureSpace(slug: string) {
  let space = await db.query.spaces.findFirst({ where: eq(schema.spaces.slug, slug) });
  if (!space) {
    const [created] = await db
      .insert(schema.spaces)
      .values({ slug, name: slug, anonymousRead: true, routePrefix: slug })
      .returning();
    space = created;
  }
  return space!;
}

async function createUser(email: string) {
  const [user] = await db
    .insert(schema.users)
    .values({ email, passwordHash: 'HASH', role: 'editor', status: 'active' })
    .returning();
  return user!;
}

async function createPage(spaceId: string, authorId: string, opts: { path: string; slug: string; deletedAt?: Date }) {
  const [page] = await db
    .insert(schema.pages)
    .values({
      spaceId,
      authorId,
      path: opts.path,
      slug: opts.slug,
      title: opts.path,
      deletedAt: opts.deletedAt ?? null,
    })
    .returning();
  return page!;
}

async function cleanup() {
  await db.delete(schema.pageAddresses);
  await db.delete(schema.pageRevisions);
  await db.delete(schema.pages);
  await db.delete(schema.sessions);
  await db.delete(schema.users);
}

/** Give a page a minimal published revision, matching `create()`'s invariant. */
async function publishPage(pageId: string, authorId: string) {
  const [revision] = await db
    .insert(schema.pageRevisions)
    .values({
      pageId,
      versionNumber: 1,
      contentHtml: '<p>content</p>',
      contentHash: 'hash',
      authorId,
      status: 'published',
      publishedAt: new Date(),
    })
    .returning();
  await db
    .update(schema.pages)
    .set({ currentPublishedVersionId: revision!.id, latestVersionId: revision!.id })
    .where(eq(schema.pages.id, pageId));
}

describe('assertAddressAvailable', () => {
  let spaceA: string;
  let spaceB: string;
  let authorId: string;

  beforeEach(async () => {
    await cleanup();
    spaceA = (await ensureSpace('addr-space-a')).id;
    spaceB = (await ensureSpace('addr-space-b')).id;
    authorId = (await createUser(`addr-author-${Date.now()}@example.com`)).id;
  });

  afterAll(async () => {
    await cleanup();
  });

  it('accepts a well-formed, unclaimed address', async () => {
    await expect(db.transaction((tx) => assertAddressAvailable(tx, spaceA, 'guides/deployment'))).resolves.toBeUndefined();
  });

  it('rejects malformed addresses with PAGE_SLUG_INVALID', async () => {
    for (const bad of ['', 'Has-Uppercase', 'has_ünïcode', '/leading-slash', 'trailing-slash/', 'double//slash', 'a'.repeat(201)]) {
      await expect(db.transaction((tx) => assertAddressAvailable(tx, spaceA, bad)))
        .rejects.toMatchObject({ code: 'PAGE_SLUG_INVALID' } satisfies Partial<DomainError>);
    }
  });

  it('rejects a built-in route segment with PAGE_SLUG_RESERVED', async () => {
    await expect(db.transaction((tx) => assertAddressAvailable(tx, spaceA, 'admin/users')))
      .rejects.toMatchObject({ code: 'PAGE_SLUG_RESERVED' } satisfies Partial<DomainError>);
  });

  it('rejects a two-letter locale segment with PAGE_SLUG_RESERVED', async () => {
    await expect(db.transaction((tx) => assertAddressAvailable(tx, spaceA, 'zh/tutorial')))
      .rejects.toMatchObject({ code: 'PAGE_SLUG_RESERVED' } satisfies Partial<DomainError>);
  });

  it('rejects a static-site reserved prefix with PAGE_SLUG_RESERVED', async () => {
    // '_static' and '_assets' start with '_', which pageAddressSchema (like
    // pathSchema) already disallows as a leading character — so those two
    // fail PAGE_SLUG_INVALID before ever reaching the reservation check,
    // which is fine (still rejected, more specific reason). 'pagefind' has
    // no such leading character and exercises the reservation check itself.
    await expect(db.transaction((tx) => assertAddressAvailable(tx, spaceA, 'pagefind/index')))
      .rejects.toMatchObject({ code: 'PAGE_SLUG_RESERVED' } satisfies Partial<DomainError>);
    await expect(db.transaction((tx) => assertAddressAvailable(tx, spaceA, '_static/bundle')))
      .rejects.toMatchObject({ code: 'PAGE_SLUG_INVALID' } satisfies Partial<DomainError>);
  });

  it('does not treat a prefix relationship as a conflict', async () => {
    await createPage(spaceA, authorId, { path: 'guides/deployment', slug: 'guides/deployment' });
    await expect(
      db.transaction((tx) => assertAddressAvailable(tx, spaceA, 'guides/deployment/kubernetes')),
    ).resolves.toBeUndefined();
  });

  it('allows the same slug in two different spaces', async () => {
    await createPage(spaceA, authorId, { path: 'faq', slug: 'faq' });
    await expect(db.transaction((tx) => assertAddressAvailable(tx, spaceB, 'faq'))).resolves.toBeUndefined();
  });

  it('rejects an address already owned by another page\'s canonical slug', async () => {
    await createPage(spaceA, authorId, { path: 'faq', slug: 'faq' });
    await expect(db.transaction((tx) => assertAddressAvailable(tx, spaceA, 'faq')))
      .rejects.toMatchObject({ code: 'PAGE_SLUG_TAKEN' } satisfies Partial<DomainError>);
  });

  it('rejects an address owned by a soft-deleted page (FR-014a)', async () => {
    await createPage(spaceA, authorId, { path: 'retired', slug: 'retired', deletedAt: new Date() });
    await expect(db.transaction((tx) => assertAddressAvailable(tx, spaceA, 'retired')))
      .rejects.toMatchObject({ code: 'PAGE_SLUG_TAKEN' } satisfies Partial<DomainError>);
  });

  it('exempts the page\'s own current slug when selfPageId is supplied', async () => {
    const page = await createPage(spaceA, authorId, { path: 'faq', slug: 'faq' });
    await expect(
      db.transaction((tx) => assertAddressAvailable(tx, spaceA, 'faq', page.id)),
    ).resolves.toBeUndefined();
  });

  it('rejects an address already claimed as another page\'s alias', async () => {
    const holder = await createPage(spaceA, authorId, { path: 'faq', slug: 'faq' });
    await db.insert(schema.pageAddresses).values({
      spaceId: spaceA,
      address: 'support/faq',
      pageId: holder.id,
      kind: 'manual',
    });
    await expect(db.transaction((tx) => assertAddressAvailable(tx, spaceA, 'support/faq')))
      .rejects.toMatchObject({ code: 'PAGE_ADDRESS_TAKEN' } satisfies Partial<DomainError>);
  });

  it('exempts the page\'s own alias when selfPageId matches its owner', async () => {
    const holder = await createPage(spaceA, authorId, { path: 'faq', slug: 'faq' });
    await db.insert(schema.pageAddresses).values({
      spaceId: spaceA,
      address: 'support/faq',
      pageId: holder.id,
      kind: 'manual',
    });
    await expect(
      db.transaction((tx) => assertAddressAvailable(tx, spaceA, 'support/faq', holder.id)),
    ).resolves.toBeUndefined();
  });

  it('has no side effects: it writes no page revision and reads only', async () => {
    const before = await db.select().from(schema.pageRevisions);
    await db.transaction((tx) => assertAddressAvailable(tx, spaceA, 'no-side-effects'));
    const after = await db.select().from(schema.pageRevisions);
    expect(after.length).toBe(before.length);
  });

  it('lets the database unique index catch a race the app-level check alone would miss', async () => {
    // Two transactions both pass assertAddressAvailable for the same
    // still-unclaimed address, then both attempt to insert a page holding it.
    // Only one may win; the loser's transaction must fail on the unique index,
    // and neither leaves a partial (uncommitted-but-visible) row.
    const address = 'race-condition-address';

    const attempt = async (path: string) =>
      db.transaction(async (tx) => {
        await assertAddressAvailable(tx, spaceA, address);
        const [page] = await tx
          .insert(schema.pages)
          .values({ spaceId: spaceA, authorId, path, slug: address, title: path })
          .returning();
        return page!;
      });

    const results = await Promise.allSettled([attempt('race-a'), attempt('race-b')]);
    const fulfilled = results.filter((r) => r.status === 'fulfilled');
    const rejected = results.filter((r) => r.status === 'rejected');
    expect(fulfilled).toHaveLength(1);
    expect(rejected).toHaveLength(1);

    const rows = await db.query.pages.findMany({ where: eq(schema.pages.slug, address) });
    expect(rows).toHaveLength(1);
  });
});

describe('setSlug (035, US2)', () => {
  let spaceA: string;
  let authorId: string;

  beforeEach(async () => {
    await cleanup();
    spaceA = (await ensureSpace('addr-space-setslug')).id;
    authorId = (await createUser(`setslug-author-${Date.now()}@example.com`)).id;
  });

  afterAll(async () => {
    await cleanup();
    await closeDb();
  });

  it('retains the former address as an alias when renaming a published page', async () => {
    const page = await createPage(spaceA, authorId, { path: 'guides/a', slug: 'guide-a' });
    await publishPage(page.id, authorId);

    const result = await db.transaction((tx) => setSlug(tx, spaceA, page.id, 'guide-b'));
    expect(result).toEqual({ slug: 'guide-b', retainedAlias: 'guide-a', affectedTranslationLocales: [] });

    const updated = await db.query.pages.findFirst({ where: eq(schema.pages.id, page.id) });
    expect(updated?.slug).toBe('guide-b');
    const alias = await db.query.pageAddresses.findFirst({
      where: and(eq(schema.pageAddresses.spaceId, spaceA), eq(schema.pageAddresses.address, 'guide-a')),
    });
    expect(alias).toMatchObject({ pageId: page.id, kind: 'retained', reason: 'slug_change' });
  });

  it('retains no alias when renaming an unpublished page, freeing the old address', async () => {
    const page = await createPage(spaceA, authorId, { path: 'guides/draft', slug: 'draft-a' });

    const result = await db.transaction((tx) => setSlug(tx, spaceA, page.id, 'draft-b'));
    expect(result).toEqual({ slug: 'draft-b', retainedAlias: null, affectedTranslationLocales: [] });

    const alias = await db.query.pageAddresses.findFirst({
      where: and(eq(schema.pageAddresses.spaceId, spaceA), eq(schema.pageAddresses.address, 'draft-a')),
    });
    expect(alias).toBeUndefined();
    // The freed address is immediately claimable by another page.
    await expect(db.transaction((tx) => assertAddressAvailable(tx, spaceA, 'draft-a'))).resolves.toBeUndefined();
  });

  it('retains one locale-prefixed alias per published translation when the source slug changes', async () => {
    const source = await createPage(spaceA, authorId, { path: 'guides/multi', slug: 'multi-a' });
    await publishPage(source.id, authorId);
    // Translation rows are excluded from `pages_space_slug_unique` (which
    // applies only where translation_group_id is null) — set one per the
    // 015/035 invariant (source row: translationGroupId null; translation
    // row: translationGroupId + sourcePageId both set).
    const [group] = await db.insert(schema.translationGroups).values({ sourcePageId: source.id }).returning();

    const [zhTranslation] = await db
      .insert(schema.pages)
      .values({
        spaceId: spaceA,
        authorId,
        path: source.path,
        slug: '',
        title: source.path,
        locale: 'zh',
        translationGroupId: group!.id,
        sourcePageId: source.id,
      })
      .returning();
    await publishPage(zhTranslation!.id, authorId);
    // An unpublished translation (draft) must NOT get a retained alias.
    await db.insert(schema.pages).values({
      spaceId: spaceA,
      authorId,
      path: source.path,
      slug: '',
      title: source.path,
      locale: 'fr',
      translationGroupId: group!.id,
      sourcePageId: source.id,
    });

    const result = await db.transaction((tx) => setSlug(tx, spaceA, source.id, 'multi-b'));
    expect(result.affectedTranslationLocales).toEqual(['zh']);

    const zhAlias = await db.query.pageAddresses.findFirst({
      where: and(eq(schema.pageAddresses.spaceId, spaceA), eq(schema.pageAddresses.address, 'zh/multi-a')),
    });
    expect(zhAlias).toMatchObject({ pageId: zhTranslation!.id, kind: 'retained', reason: 'slug_change' });

    const frAlias = await db.query.pageAddresses.findFirst({
      where: and(eq(schema.pageAddresses.spaceId, spaceA), eq(schema.pageAddresses.address, 'fr/multi-a')),
    });
    expect(frAlias).toBeUndefined();
  });

  it('collapses an A -> B -> C rename chain so both A and B stay one hop from the page', async () => {
    const page = await createPage(spaceA, authorId, { path: 'guides/chain', slug: 'chain-a' });
    await publishPage(page.id, authorId);

    await db.transaction((tx) => setSlug(tx, spaceA, page.id, 'chain-b'));
    await db.transaction((tx) => setSlug(tx, spaceA, page.id, 'chain-c'));

    const rows = await db.query.pageAddresses.findMany({ where: eq(schema.pageAddresses.spaceId, spaceA) });
    const byAddress = Object.fromEntries(rows.map((row) => [row.address, row.pageId]));
    // Both stale addresses point directly at the page — never at each other
    // or at the intermediate address — so a resolver always arrives at the
    // current canonical slug in a single hop.
    expect(byAddress['chain-a']).toBe(page.id);
    expect(byAddress['chain-b']).toBe(page.id);
    const updated = await db.query.pages.findFirst({ where: eq(schema.pages.id, page.id) });
    expect(updated?.slug).toBe('chain-c');
  });

  it('is a no-op when the new slug equals the current one', async () => {
    const page = await createPage(spaceA, authorId, { path: 'guides/same', slug: 'same' });
    await publishPage(page.id, authorId);

    const result = await db.transaction((tx) => setSlug(tx, spaceA, page.id, 'same'));
    expect(result).toEqual({ slug: 'same', retainedAlias: null, affectedTranslationLocales: [] });
    const rows = await db.query.pageAddresses.findMany({ where: eq(schema.pageAddresses.pageId, page.id) });
    expect(rows).toHaveLength(0);
  });

  it('rejects renaming to an address already taken by another page', async () => {
    await createPage(spaceA, authorId, { path: 'guides/taken', slug: 'taken' });
    const page = await createPage(spaceA, authorId, { path: 'guides/mover', slug: 'mover' });

    await expect(db.transaction((tx) => setSlug(tx, spaceA, page.id, 'taken')))
      .rejects.toMatchObject({ code: 'PAGE_SLUG_TAKEN' } satisfies Partial<DomainError>);
  });
});
