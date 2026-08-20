import { mkdtemp, readFile, rm } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { afterAll, afterEach, beforeAll, describe, expect, it } from 'vitest';
import { createHash } from 'node:crypto';
import { eq } from 'drizzle-orm';
import { db, closeDb } from '@/server/db';
import * as schema from '@/server/db/schema';
import type { PublishablePage, PublishableSet } from './eligibility';
import { addressKey, buildPublishableSet } from './eligibility';
import { rewriteLinks, type LinkRewriteResult } from './links';
import { buildSnapshot } from './snapshot';

/**
 * Link rewriting for the published site.
 *
 * The contract is two-part:
 *  1. A link to an ineligible page must become plain text carrying no address,
 *     so the artifact cannot even hint at a path the wiki chose not to publish.
 *  2. A link to an eligible page must resolve against the configured base path
 *     the same way the snapshot does, for both root and sub-path hosting.
 *
 * The unit-level tests give precise control over the input HTML and base URL;
 * the snapshot-level test then proves the rewriting survives the full pipeline
 * (Markdown → HTML → link rewrite → base-path resolution).
 */

const ROOT_BASE_URL = 'https://wiki.example.com/';
const SUB_PATH_BASE_URL = 'https://owner.github.io/repo/';

let authorId: string;
const dirs: string[] = [];

async function stage(): Promise<string> {
  const dir = await mkdtemp(join(tmpdir(), 'static-site-links-'));
  dirs.push(dir);
  return dir;
}

function page(overrides: Partial<PublishablePage> & { path: string }): PublishablePage {
  return {
    id: `id-${overrides.path}-${overrides.locale ?? 'en'}`,
    spaceId: 'space',
    title: overrides.path,
    slug: overrides.path,
    locale: 'en',
    translationGroupId: null,
    revisionId: 'rev',
    versionNumber: 1,
    contentSource: '',
    publishedAt: new Date('2026-01-01T00:00:00.000Z'),
    ...overrides,
  };
}

function setFrom(pages: PublishablePage[], defaultLocale = 'en'): PublishableSet {
  const pageIdsByAddress = new Map<string, string>();
  const slugByAddress = new Map<string, string>();
  const translationGroups = new Map<string, Map<string, string>>();
  for (const p of pages) {
    const key = addressKey(p.locale, p.path);
    pageIdsByAddress.set(key, p.id);
    slugByAddress.set(key, p.slug);
    if (p.translationGroupId) {
      const group = translationGroups.get(p.translationGroupId) ?? new Map();
      group.set(p.locale, p.slug);
      translationGroups.set(p.translationGroupId, group);
    }
  }
  return {
    pages,
    pageIdsByAddress,
    slugByAddress,
    translationGroups,
    aliasesByPageId: new Map(),
    assetIds: new Set(),
    exclusions: {},
    defaultLocale,
  };
}

async function makeSpace() {
  const [space] = await db
    .insert(schema.spaces)
    .values({ slug: 'wiki-links', name: 'wiki', kind: 'wiki', anonymousRead: true })
    .returning();
  return space!.id;
}

async function makePage(options: {
  spaceId: string;
  path: string;
  title: string;
  body: string;
  locale?: string;
  visibility?: 'public' | 'restricted';
}) {
  const [page] = await db
    .insert(schema.pages)
    .values({
      spaceId: options.spaceId,
      // 035: default slug is the full tree path (FR-004).
      slug: options.path,
      path: options.path,
      locale: options.locale ?? 'en',
      title: options.title,
      authorId,
      visibility: options.visibility ?? 'public',
    })
    .returning();
  const [revision] = await db
    .insert(schema.pageRevisions)
    .values({
      pageId: page!.id,
      versionNumber: 1,
      contentSource: options.body,
      contentHtml: '<p>placeholder</p>',
      contentHash: createHash('sha256').update(options.body).digest('hex'),
      status: 'published',
      publishedAt: new Date(),
      authorId,
    })
    .returning();
  await db
    .update(schema.pages)
    .set({ latestVersionId: revision!.id, currentPublishedVersionId: revision!.id })
    .where(eq(schema.pages.id, page!.id));
  return { pageId: page!.id, revisionId: revision!.id };
}

async function clearContent() {
  await db.update(schema.pages).set({ currentPublishedVersionId: null, latestVersionId: null });
  await db.delete(schema.contentAssetRefs);
  await db.delete(schema.pageRevisions);
  await db.delete(schema.pages);
  await db.delete(schema.spaces);
}

beforeAll(async () => {
  await clearContent();
  await db.delete(schema.users);
  const [author] = await db
    .insert(schema.users)
    .values({ email: 'links@example.com', passwordHash: 'HASH', role: 'admin' })
    .returning();
  authorId = author!.id;
});

afterEach(async () => {
  await clearContent();
  await Promise.all(dirs.splice(0).map((dir) => rm(dir, { recursive: true, force: true })));
});

afterAll(async () => {
  await db.delete(schema.users);
  await closeDb();
});

describe('rewriteLinks — ineligible targets', () => {
  const set = setFrom([page({ path: 'public', title: 'Public' })]);

  it('downgrades a link to a page outside the publishable set to plain text', () => {
    const html = '<p>See <a href="/hidden">the handbook</a> for details.</p>';
    const result = rewriteLinks(html, set, SUB_PATH_BASE_URL, 'en');

    // No href survives; only the visible text remains inside the inert span.
    expect(result.html).not.toContain('href="/hidden"');
    expect(result.html).not.toContain('href=');
    expect(result.html).toContain('>the handbook</span>');
    expect(result.html).toContain('data-unpublished-link');
    expect(result.downgraded).toBe(1);
  });

  it('downgrades a link to a non-existent path the same way', () => {
    // A 404-shaped link is not a soft failure: it is a path the wiki chose not
    // to publish, and treating it differently would create a side channel for
    // paths that just happen to not exist today.
    const html = '<p>Try <a href="/does-not-exist">this</a>.</p>';
    const result = rewriteLinks(html, set, SUB_PATH_BASE_URL, 'en');
    expect(result.html).not.toContain('href=');
    expect(result.html).toContain('>this</span>');
    expect(result.downgraded).toBe(1);
  });

  it('leaves external links untouched, including anchors and mailtos', () => {
    const html =
      '<p><a href="https://example.com">x</a> <a href="https://x.test/a#frag">y</a> ' +
      '<a href="mailto:a@b.test">m</a> <a href="#section">a</a></p>';
    const result = rewriteLinks(html, set, SUB_PATH_BASE_URL, 'en');
    expect(result.html).toContain('href="https://example.com"');
    expect(result.html).toContain('href="https://x.test/a#frag"');
    expect(result.html).toContain('href="mailto:a@b.test"');
    expect(result.html).toContain('href="#section"');
    expect(result.downgraded).toBe(0);
  });

  it('strips HTML from a downgraded link but keeps its visible text', () => {
    // A link with inline markup would otherwise smuggle the original href
    // through a data-attribute or title the reader could not see but the
    // markup would still carry.
    const html = '<a href="/hidden" title="hint" data-x="1"><strong>the</strong> handbook</a>';
    const result = rewriteLinks(html, set, SUB_PATH_BASE_URL, 'en');
    expect(result.html).not.toContain('href=');
    expect(result.html).not.toContain('title=');
    expect(result.html).not.toContain('data-x');
    expect(result.html).toContain('>the handbook</span>');
  });
});

describe('rewriteLinks — eligible targets', () => {
  const set = setFrom([
    page({ path: 'guides/setup', title: 'Setup' }),
    page({ path: 'about', title: 'About' }),
  ]);

  it('resolves a link to a published page against a domain root', () => {
    const html = '<a href="/about">about</a>';
    const result = rewriteLinks(html, set, ROOT_BASE_URL, 'en');
    expect(result.html).toContain('href="/about/"');
    expect(result.downgraded).toBe(0);
  });

  it('resolves a link to a published page against a sub-path base', () => {
    const html = '<a href="/guides/setup">setup</a>';
    const result = rewriteLinks(html, set, SUB_PATH_BASE_URL, 'en');
    expect(result.html).toContain('href="/repo/guides/setup/"');
    expect(result.downgraded).toBe(0);
  });

  it('preserves a hash fragment on an eligible link under a sub-path', () => {
    const html = '<a href="/about#team">about</a>';
    const result = rewriteLinks(html, set, SUB_PATH_BASE_URL, 'en');
    expect(result.html).toContain('href="/repo/about/#team"');
  });

  it('honors an explicit locale prefix on the link', () => {
    // Reader URLs are locale-prefixed, and a link written that way must still
    // resolve when its target is publishable in that locale.
    const set = setFrom([page({ path: 'guides/setup', title: 'Setup', locale: 'zh' })]);
    const result = rewriteLinks('<a href="/zh/guides/setup">z</a>', set, ROOT_BASE_URL, 'zh');
    expect(result.html).toContain('href="/zh/guides/setup/"');
  });

  it('downgrades a link carrying a query string to a non-publishable target', () => {
    // The rewriter does not interpret query strings, so an unknown target with
    // one behaves like an unknown target without one: inert text, no href.
    const result = rewriteLinks(
      '<a href="/missing?ref=home">about</a>',
      set,
      ROOT_BASE_URL,
      'en',
    );
    expect(result.html).not.toContain('href=');
    expect(result.html).toContain('>about</span>');
  });

  it('counts downgrades accurately across a mixed input', () => {
    const html =
      '<a href="/about">ok</a> <a href="/secret">bad</a> ' +
      '<a href="/guides/setup">also ok</a> <a href="/missing">nope</a>';
    const result: LinkRewriteResult = rewriteLinks(html, set, SUB_PATH_BASE_URL, 'en');
    expect(result.downgraded).toBe(2);
    expect(result.html).toContain('href="/repo/about/"');
    expect(result.html).toContain('href="/repo/guides/setup/"');
    expect(result.html).toContain('data-unpublished-link');
  });
});

describe('snapshot integration — link rewriting under the full pipeline', () => {
  it('downgrades ineligible links inside a generated snapshot at a sub-path base', async () => {
    const spaceId = await makeSpace();
    await makePage({
      spaceId,
      path: 'public',
      title: 'Public',
      body: '# Public\n\n[p](/public) [h](/hidden)\n',
    });
    await makePage({
      spaceId,
      path: 'hidden',
      title: 'Hidden',
      body: '# Hidden\n',
      visibility: 'restricted',
    });

    const set = await buildPublishableSet();
    const root = await stage();
    await buildSnapshot({
      rootDir: root,
      baseUrl: SUB_PATH_BASE_URL,
      siteName: 'Links Test',
      themeCss: '',
      publishableSet: set,
      skipSearchIndex: true,
    });
    const html = await readFile(join(root, 'public', 'index.html'), 'utf8');

    // Eligible link resolved against the sub-path.
    expect(html).toContain('href="/repo/public/"');
    // Ineligible link has no href, no address leaked into any attribute.
    expect(html).not.toContain('href="/hidden"');
    expect(html).not.toContain('href="/repo/hidden"');
    expect(html).toContain('>h</span>');
    expect(html).toContain('data-unpublished-link');
  });

  it('rewrites eligible links at a domain root with no base-path prefix', async () => {
    const spaceId = await makeSpace();
    await makePage({
      spaceId,
      path: 'public',
      title: 'Public',
      body: '# Public\n\n[p](/public) [h](/hidden)\n',
    });
    await makePage({
      spaceId,
      path: 'hidden',
      title: 'Hidden',
      body: '# Hidden\n',
      visibility: 'restricted',
    });

    const set = await buildPublishableSet();
    const root = await stage();
    await buildSnapshot({
      rootDir: root,
      baseUrl: ROOT_BASE_URL,
      siteName: 'Links Test',
      themeCss: '',
      publishableSet: set,
      skipSearchIndex: true,
    });
    const html = await readFile(join(root, 'public', 'index.html'), 'utf8');

    // The root base URL does not insert a sub-path segment, and the eligible
    // link still resolves; the ineligible one still has no address.
    expect(html).toContain('href="/public/"');
    expect(html).not.toContain('href="/hidden"');
    expect(html).toContain('data-unpublished-link');
  });
});
