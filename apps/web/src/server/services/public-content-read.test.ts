import { afterAll, beforeEach, describe, expect, it, vi } from 'vitest';
import { eq } from 'drizzle-orm';
import { db, closeDb } from '@/server/db';
import * as schema from '@/server/db/schema';
import { buildApiKeyCtx, buildUserCtx } from '@/server/permissions';
import * as pageService from '@/server/services/pages';
import * as revisions from '@/server/services/revisions';

const semanticSearch = vi.hoisted(() => ({
  getSemanticSearchResults: vi.fn(),
  submitSemanticSearch: vi.fn(),
}));
const searchAnalytics = vi.hoisted(() => ({
  getOrCreateSearchRecord: vi.fn(),
  getOwnedSearchRecord: vi.fn(),
  updateSearchRecord: vi.fn(),
}));

vi.mock('@/server/services/public-ai', () => semanticSearch);
vi.mock('@/server/services/search-analytics', () => searchAnalytics);

import * as publicContent from '@/server/services/public-content';
import {
  createPublicApiUser,
  ensurePublicApiDefaultSpace,
} from '../../../test/public-wiki-api-fixtures';

const metadataMarkdown = '---\ntags: [DevOps]\nsummary: Public summary\n---\n\n# Readable';

async function cleanup() {
  await db.delete(schema.apiAuditEntries);
  await db.delete(schema.apiKeys);
  await db.delete(schema.contentAssetRefs);
  await db.delete(schema.searchBehaviors);
  await db.delete(schema.searchRecords);
  await db.delete(schema.searchSettings);
  await db.delete(schema.pageRevisions);
  await db.delete(schema.pages);
  await db.delete(schema.sessions);
  await db.delete(schema.users);
}

describe('public content read facade', () => {
  beforeEach(async () => {
    vi.clearAllMocks();
    await cleanup();
    await ensurePublicApiDefaultSpace();
  });

  afterAll(async () => {
    await cleanup();
    await closeDb();
  });

  it('returns published page metadata and Markdown source to a reader API key', async () => {
    const editor = await createPublicApiUser('public-read-editor@example.com', 'editor');
    const reader = await createPublicApiUser('public-read-reader@example.com', 'reader');
    const editorCtx = buildUserCtx(editor.id, 'editor');

    await pageService.create(editorCtx, {
      path: 'public/readable',
      title: 'Readable',
      contentSource: '# Readable',
    });
    await revisions.publish(editorCtx, { path: 'public/readable', version: 1 });

    const page = await publicContent.getPageByPath(
      buildApiKeyCtx(reader.id, 'reader', ['view'], 'reader-key'),
      'public/readable',
    );

    expect(page?.title).toBe('Readable');
    expect(page?.contentSource).toBe('# Readable');
    expect(page?.publishedRevision).toBeUndefined();
    expect(page?.links.byPath).toBe('/api/v1/pages?path=public/readable');

    const withRevision = await publicContent.getPageByPath(
      buildApiKeyCtx(reader.id, 'reader', ['view'], 'reader-key'),
      'public/readable',
      ['publishedRevision'],
    );
    expect(withRevision?.publishedRevision?.version).toBe(1);
  });

  it('projects frontmatter metadata in read/list responses without removing raw compatibility', async () => {
    const editor = await createPublicApiUser('public-metadata-editor@example.com', 'editor');
    const ctx = buildUserCtx(editor.id, 'editor');
    await pageService.create(ctx, { path: 'public/metadata', title: 'Fallback', contentSource: metadataMarkdown });
    await revisions.publish(ctx, { path: 'public/metadata', version: 1 });
    const page = await publicContent.getPageByPath(ctx, 'public/metadata');
    expect(page?.frontmatter).toMatchObject({ tags: ['DevOps'], summary: 'Public summary' });
    expect(page?.metadata).toMatchObject({ summary: 'Public summary' });
    expect(page?.metadata?.tags[0]?.normalizedName).toBe('devops');
  });

  it('orders the page tree with folders before files, alphabetical within each group', async () => {
    const editor = await createPublicApiUser('public-tree-editor@example.com', 'editor');
    const editorCtx = buildUserCtx(editor.id, 'editor');
    // Insertion order deliberately mixes files and folders so a stable path
    // sort alone would interleave them (apple, beta, mango, zebra).
    for (const path of ['library/mango', 'library/zebra/child', 'library/apple', 'library/beta/child']) {
      await pageService.create(editorCtx, { path, title: path, contentSource: path });
    }

    const { root } = await publicContent.getPageTree(editorCtx, {
      status: 'all',
      pathPrefix: 'library',
    });

    // Folders (beta, zebra) sort ahead of files (apple, mango); each group A→Z.
    expect(root.children.map((child) => child.segment)).toEqual(['beta', 'zebra', 'apple', 'mango']);
    expect(root.children.map((child) => child.pageId === null)).toEqual([true, true, false, false]);
  });

  it('hides draft-only pages from reader API keys', async () => {
    const editor = await createPublicApiUser('public-draft-editor@example.com', 'editor');
    const reader = await createPublicApiUser('public-draft-reader@example.com', 'reader');

    await pageService.create(buildUserCtx(editor.id, 'editor'), {
      path: 'public/draft-only',
      title: 'Draft Only',
      contentSource: 'draft source',
    });

    const page = await publicContent.getPageByPath(
      buildApiKeyCtx(reader.id, 'reader', ['view'], 'reader-key'),
      'public/draft-only',
    );

    expect(page).toBeNull();
  });

  it('lists published pages with bounded pagination', async () => {
    const editor = await createPublicApiUser('public-list-editor@example.com', 'editor');
    const reader = await createPublicApiUser('public-list-reader@example.com', 'reader');
    const editorCtx = buildUserCtx(editor.id, 'editor');

    for (const path of ['public/a', 'public/b']) {
      await pageService.create(editorCtx, { path, title: path, contentSource: path });
      await revisions.publish(editorCtx, { path, version: 1 });
    }

    const readerCtx = buildApiKeyCtx(reader.id, 'reader', ['view'], 'reader-key');
    const first = await publicContent.listPages(readerCtx, { status: 'published', limit: 1, order: 'path', include: [] });

    expect(first.items).toHaveLength(1);
    expect(first.nextCursor).toBeTruthy();
    expect(first.items[0]?.contentSource).toBeUndefined();
    expect(first.items[0]?.latestRevision).toBeUndefined();
    expect(first.items[0]?.publishedRevision).toBeUndefined();

    const withRevisions = await publicContent.listPages(readerCtx, {
      status: 'published',
      limit: 1,
      order: 'path',
      include: ['latestRevision', 'publishedRevision'],
    });
    expect(withRevisions.items[0]?.contentSource).toBeUndefined();
    expect(withRevisions.items[0]?.latestRevision?.version).toBe(1);
    expect(withRevisions.items[0]?.publishedRevision?.version).toBe(1);
  });

  it('keeps contentSource for the path= exact-lookup filter (single-page lookup, not browsing)', async () => {
    const editor = await createPublicApiUser('public-path-editor@example.com', 'editor');
    const reader = await createPublicApiUser('public-path-reader@example.com', 'reader');
    const editorCtx = buildUserCtx(editor.id, 'editor');

    await pageService.create(editorCtx, { path: 'public/by-path', title: 'By Path', contentSource: '# By Path' });
    await revisions.publish(editorCtx, { path: 'public/by-path', version: 1 });

    const result = await publicContent.listPages(
      buildApiKeyCtx(reader.id, 'reader', ['view'], 'reader-key'),
      { status: 'published', path: 'public/by-path', limit: 20, order: 'path', include: [] },
    );

    expect(result.items).toHaveLength(1);
    expect(result.items[0]?.contentSource).toBe('# By Path');
    expect(result.items[0]?.latestRevision).toBeUndefined();
  });

  it('finds a q match outside the default pagination window', async () => {
    const editor = await createPublicApiUser('public-search-editor@example.com', 'editor');
    const reader = await createPublicApiUser('public-search-reader@example.com', 'reader');
    const editorCtx = buildUserCtx(editor.id, 'editor');
    const readerCtx = buildApiKeyCtx(reader.id, 'reader', ['view'], 'reader-key');

    // The match sorts oldest-by-publish-time; create enough newer pages first
    // to push it past a default-sized (limit=20) fetch window.
    await pageService.create(editorCtx, {
      path: 'philosophy/figures/wang-yangming',
      title: '王阳明',
      contentSource: '# 王阳明\n\n王阳明（1472—1529）是明代著名的思想家。',
    });
    await revisions.publish(editorCtx, { path: 'philosophy/figures/wang-yangming', version: 1 });

    for (let i = 0; i < 25; i++) {
      const path = `public/filler-${i}`;
      await pageService.create(editorCtx, { path, title: `Filler ${i}`, contentSource: path });
      await revisions.publish(editorCtx, { path, version: 1 });
    }

    const result = await publicContent.listPages(readerCtx, {
      status: 'published',
      q: '王阳明',
      limit: 20,
      order: 'recent',
      include: [],
    });

    expect(result.items.map((item) => item.path)).toContain('philosophy/figures/wang-yangming');
  });

  it('search results never include contentSource and excerpt is centered on the match', async () => {
    const editor = await createPublicApiUser('public-excerpt-editor@example.com', 'editor');
    const reader = await createPublicApiUser('public-excerpt-reader@example.com', 'reader');
    const editorCtx = buildUserCtx(editor.id, 'editor');
    const readerCtx = buildApiKeyCtx(reader.id, 'reader', ['view'], 'reader-key');

    const filler = 'x'.repeat(80);
    await pageService.create(editorCtx, {
      path: 'docs/haystack',
      title: 'Haystack Doc',
      contentSource: `${filler}NEEDLE${filler}`,
    });
    await revisions.publish(editorCtx, { path: 'docs/haystack', version: 1 });

    const result = await publicContent.searchPages(readerCtx, {
      q: 'NEEDLE',
      scope: 'all',
      status: 'published',
      limit: 20,
      include: [],
      excerptLength: 20,
    });

    const hit = result.items.find((item) => item.page.path === 'docs/haystack');
    expect(hit).toBeDefined();
    expect(hit?.matchType).toBe('content');
    expect(hit?.page.contentSource).toBeUndefined();
    expect(hit?.excerpt).toContain('NEEDLE');
    // Centered window: much shorter than the full 166-char content.
    expect(hit!.excerpt!.length).toBeLessThan(40);
  });

  it('revision list omits contentSource; a single revision fetch includes it', async () => {
    const editor = await createPublicApiUser('public-revlist-editor@example.com', 'editor');
    const reader = await createPublicApiUser('public-revlist-reader@example.com', 'reader');
    const editorCtx = buildUserCtx(editor.id, 'editor');
    const readerCtx = buildApiKeyCtx(reader.id, 'reader', ['view'], 'reader-key');

    await pageService.create(editorCtx, { path: 'docs/revlist', title: 'Rev List', contentSource: '# v1' });
    await revisions.publish(editorCtx, { path: 'docs/revlist', version: 1 });
    const page = await publicContent.getPageByPath(readerCtx, 'docs/revlist');

    const list = await publicContent.listRevisions(readerCtx, page!.id, { limit: 20 });
    expect(list.items).toHaveLength(1);
    expect(list.items[0]?.contentSource).toBeUndefined();

    const single = await publicContent.getRevision(readerCtx, page!.id, 1);
    expect(single?.contentSource).toBe('# v1');
  });

  it('filters search results by createdStart/createdEnd and updatedStart/updatedEnd', async () => {
    const editor = await createPublicApiUser('public-daterange-editor@example.com', 'editor');
    const reader = await createPublicApiUser('public-daterange-reader@example.com', 'reader');
    const editorCtx = buildUserCtx(editor.id, 'editor');
    const readerCtx = buildApiKeyCtx(reader.id, 'reader', ['view'], 'reader-key');

    await pageService.create(editorCtx, { path: 'docs/old-daterange', title: 'DateRangeMatch Old', contentSource: 'x' });
    await revisions.publish(editorCtx, { path: 'docs/old-daterange', version: 1 });
    await pageService.create(editorCtx, { path: 'docs/new-daterange', title: 'DateRangeMatch New', contentSource: 'x' });
    await revisions.publish(editorCtx, { path: 'docs/new-daterange', version: 1 });

    const oldDate = new Date('2020-01-01T00:00:00Z');
    await db
      .update(schema.pages)
      .set({ createdAt: oldDate, updatedAt: oldDate })
      .where(eq(schema.pages.path, 'docs/old-daterange'));

    const boundary = new Date('2020-06-01T00:00:00Z');

    const onlyOld = await publicContent.searchPages(readerCtx, {
      q: 'DateRangeMatch',
      scope: 'title',
      status: 'published',
      limit: 20,
      include: [],
      excerptLength: 100,
      createdEnd: boundary,
    });
    expect(onlyOld.items.map((item) => item.page.path)).toEqual(['docs/old-daterange']);

    const onlyNew = await publicContent.searchPages(readerCtx, {
      q: 'DateRangeMatch',
      scope: 'title',
      status: 'published',
      limit: 20,
      include: [],
      excerptLength: 100,
      createdStart: boundary,
    });
    expect(onlyNew.items.map((item) => item.page.path)).toEqual(['docs/new-daterange']);
  });

  it('scores and sorts results: path > title > content, higher for exact/repeated matches', async () => {
    const editor = await createPublicApiUser('public-score-editor@example.com', 'editor');
    const reader = await createPublicApiUser('public-score-reader@example.com', 'reader');
    const editorCtx = buildUserCtx(editor.id, 'editor');
    const readerCtx = buildApiKeyCtx(reader.id, 'reader', ['view'], 'reader-key');

    await pageService.create(editorCtx, {
      path: 'docs/some-content-page',
      title: 'Unrelated',
      contentSource: 'zeta appears here. zeta again.',
    });
    await revisions.publish(editorCtx, { path: 'docs/some-content-page', version: 1 });

    await pageService.create(editorCtx, {
      path: 'docs/some-title-page',
      title: 'The Zeta Project',
      contentSource: 'no mention',
    });
    await revisions.publish(editorCtx, { path: 'docs/some-title-page', version: 1 });

    await pageService.create(editorCtx, { path: 'zeta', title: 'Something Else', contentSource: 'no mention' });
    await revisions.publish(editorCtx, { path: 'zeta', version: 1 });

    const result = await publicContent.searchPages(readerCtx, {
      q: 'zeta',
      scope: 'all',
      status: 'published',
      limit: 20,
      include: [],
      excerptLength: 100,
    });

    expect(result.items[0]?.matchType).toBe('path');
    expect(result.items[result.items.length - 1]?.matchType).toBe('content');
    for (let i = 1; i < result.items.length; i++) {
      expect(result.items[i - 1]!.score!).toBeGreaterThanOrEqual(result.items[i]!.score!);
    }
    expect(result.items.every((item) => item.score !== null && item.score > 0 && item.score <= 1)).toBe(true);
  });

  it('keyword search never leaks an unreadable (draft-only) page even on content match (FR-009/FR-014)', async () => {
    const editor = await createPublicApiUser('public-leak-editor@example.com', 'editor');
    const reader = await createPublicApiUser('public-leak-reader@example.com', 'reader');
    const editorCtx = buildUserCtx(editor.id, 'editor');
    const readerCtx = buildApiKeyCtx(reader.id, 'reader', ['view'], 'reader-key');

    await pageService.create(editorCtx, {
      path: 'docs/secret-plan',
      title: 'Secret Plan',
      contentSource: 'CONFIDENTIALTOKEN details here',
    });
    // Never published — draft-only, unreadable to a reader.

    const result = await publicContent.searchPages(readerCtx, {
      q: 'CONFIDENTIALTOKEN',
      scope: 'all',
      status: 'all',
      limit: 20,
      include: [],
      excerptLength: 100,
    });

    expect(result.items.map((item) => item.page.path)).not.toContain('docs/secret-plan');
    expect(JSON.stringify(result)).not.toContain('CONFIDENTIALTOKEN');
  });

  it('merges visible semantic candidates with keyword results without duplicate pages or leaked excerpts', async () => {
    const editor = await createPublicApiUser('public-hybrid-editor@example.com', 'editor');
    const reader = await createPublicApiUser('public-hybrid-reader@example.com', 'reader');
    const editorCtx = buildUserCtx(editor.id, 'editor');
    const readerCtx = buildApiKeyCtx(reader.id, 'reader', ['view'], 'reader-key');
    const keyword = await pageService.create(editorCtx, {
      path: 'docs/hybrid-keyword', title: 'Keyword', contentSource: 'hybridtoken keyword excerpt',
    });
    await revisions.publish(editorCtx, { path: 'docs/hybrid-keyword', version: 1 });
    const semantic = await pageService.create(editorCtx, {
      path: 'docs/hybrid-semantic', title: 'Semantic', contentSource: 'related document',
    });
    await revisions.publish(editorCtx, { path: 'docs/hybrid-semantic', version: 1 });
    const hidden = await pageService.create(editorCtx, {
      path: 'docs/hybrid-hidden', title: 'Hidden semantic', contentSource: 'private semantic source',
    });

    searchAnalytics.getOrCreateSearchRecord.mockResolvedValue({
      id: '11111111-1111-4111-8111-111111111111', semanticState: 'pending', semanticActionId: 'action-1',
    });
    semanticSearch.getSemanticSearchResults.mockResolvedValue({
      status: 'succeeded',
      items: [
        { pageId: semantic.pageId, excerpt: 'semantic-only excerpt', score: 0.86 },
        { pageId: keyword.pageId, excerpt: 'semantic duplicate excerpt', score: 0.84 },
        { pageId: hidden.pageId, excerpt: 'hidden semantic excerpt', score: 0.9 },
      ],
    });

    const result = await publicContent.hybridSearchPages(readerCtx, {
      kind: 'query', searchRecordId: '11111111-1111-4111-8111-111111111111',
      searchSessionId: '22222222-2222-4222-8222-222222222222', q: 'hybridtoken', limit: 20,
    });

    expect(result.semanticState).toBe('ready');
    expect(result.items.map((item) => item.page.id)).toEqual([semantic.pageId, keyword.pageId]);
    expect(result.items[0]).toMatchObject({
      excerpt: 'semantic-only excerpt', relevanceScore: 0.86, matchSources: ['semantic'],
    });
    expect(result.items[1]).toMatchObject({
      excerpt: expect.stringContaining('hybridtoken'), relevanceScore: 0.84, matchSources: ['keyword', 'semantic'],
    });
    expect(JSON.stringify(result)).not.toContain('hidden semantic excerpt');
    expect(searchAnalytics.updateSearchRecord).toHaveBeenCalledWith(expect.any(String), expect.objectContaining({
      semanticResultCount: 2, resultCount: 2, semanticState: 'ready',
    }));
  });

  it('honors header search settings for semantic enablement, relevance threshold, and excerpts', async () => {
    const editor = await createPublicApiUser('public-hybrid-settings-editor@example.com', 'editor');
    const reader = await createPublicApiUser('public-hybrid-settings-reader@example.com', 'reader');
    const editorCtx = buildUserCtx(editor.id, 'editor');
    const readerCtx = buildApiKeyCtx(reader.id, 'reader', ['view'], 'reader-key');
    await db.insert(schema.searchSettings).values({
      id: 'default',
      semanticSearchEnabled: false,
      minRelevanceScore: 75,
      showExcerpts: false,
      excerptLength: 60,
    });
    await pageService.create(editorCtx, {
      path: 'docs/low', title: 'Low', contentSource: 'settings low relevance keyword',
    });
    await revisions.publish(editorCtx, { path: 'docs/low', version: 1 });
    await pageService.create(editorCtx, {
      path: 'settings-high', title: 'Settings High', contentSource: 'settingshigh visible page',
    });
    await revisions.publish(editorCtx, { path: 'settings-high', version: 1 });

    searchAnalytics.getOrCreateSearchRecord.mockResolvedValue({
      id: '11111111-1111-4111-8111-111111111111', semanticState: 'skipped', semanticActionId: null,
    });

    const result = await publicContent.hybridSearchPages(readerCtx, {
      kind: 'query', searchRecordId: '11111111-1111-4111-8111-111111111111',
      searchSessionId: '22222222-2222-4222-8222-222222222222', q: 'settings', limit: 20,
    });

    expect(result.semanticState).toBe('skipped');
    expect(semanticSearch.submitSemanticSearch).not.toHaveBeenCalled();
    expect(result.items.map((item) => item.page.path)).toEqual(['settings-high']);
    expect(result.items[0]).toMatchObject({ excerpt: null, relevanceScore: 0.95 });
  });

  it('returns zero results with generic reduced coverage when semantic search cannot start', async () => {
    const reader = await createPublicApiUser('public-hybrid-zero-reader@example.com', 'reader');
    const readerCtx = buildApiKeyCtx(reader.id, 'reader', ['view'], 'reader-key');

    searchAnalytics.getOrCreateSearchRecord.mockResolvedValue({
      id: '11111111-1111-4111-8111-111111111111', semanticState: 'skipped', semanticActionId: null,
    });
    semanticSearch.submitSemanticSearch.mockRejectedValueOnce(new Error('semantic unavailable'));

    const result = await publicContent.hybridSearchPages(readerCtx, {
      kind: 'query', searchRecordId: '11111111-1111-4111-8111-111111111111',
      searchSessionId: '22222222-2222-4222-8222-222222222222', q: 'nomatchtoken', limit: 20,
    });

    expect(result).toEqual({
      searchRecordId: '11111111-1111-4111-8111-111111111111',
      semanticState: 'unavailable',
      items: [],
    });
    expect(searchAnalytics.updateSearchRecord).toHaveBeenCalledWith(expect.any(String), expect.objectContaining({
      keywordResultCount: 0, semanticResultCount: 0, resultCount: 0, semanticState: 'unavailable',
    }));
  });

  it('keeps safe keyword results when semantic coverage fails generically', async () => {
    const editor = await createPublicApiUser('public-hybrid-failed-editor@example.com', 'editor');
    const reader = await createPublicApiUser('public-hybrid-failed-reader@example.com', 'reader');
    const editorCtx = buildUserCtx(editor.id, 'editor');
    const readerCtx = buildApiKeyCtx(reader.id, 'reader', ['view'], 'reader-key');
    await pageService.create(editorCtx, {
      path: 'docs/hybrid-fallback', title: 'Fallback', contentSource: 'fallbacktoken keyword result',
    });
    await revisions.publish(editorCtx, { path: 'docs/hybrid-fallback', version: 1 });

    searchAnalytics.getOrCreateSearchRecord.mockResolvedValue({
      id: '11111111-1111-4111-8111-111111111111', semanticState: 'pending', semanticActionId: 'action-failed',
    });
    semanticSearch.getSemanticSearchResults.mockResolvedValue({
      status: 'failed',
      items: [],
      error: { code: 'PROVIDER_ERROR', message: 'internal detail' },
    });

    const result = await publicContent.hybridSearchPages(readerCtx, {
      kind: 'query', searchRecordId: '11111111-1111-4111-8111-111111111111',
      searchSessionId: '22222222-2222-4222-8222-222222222222', q: 'fallbacktoken', limit: 20,
    });

    expect(result.semanticState).toBe('failed');
    expect(result.items).toHaveLength(1);
    expect(result.items[0]).toMatchObject({ matchSources: ['keyword'] });
    expect(JSON.stringify(result)).not.toContain('PROVIDER_ERROR');
    expect(searchAnalytics.updateSearchRecord).toHaveBeenCalledWith(expect.any(String), expect.objectContaining({
      keywordResultCount: 1, semanticResultCount: 0, resultCount: 1, semanticState: 'failed',
    }));
  });

  it('narrows keyword search results with filter[tag] while keeping the response envelope unchanged (US1)', async () => {
    const editor = await createPublicApiUser('public-fm-search-editor@example.com', 'editor');
    const reader = await createPublicApiUser('public-fm-search-reader@example.com', 'reader');
    const editorCtx = buildUserCtx(editor.id, 'editor');
    const readerCtx = buildApiKeyCtx(reader.id, 'reader', ['view'], 'reader-key');

    await pageService.create(editorCtx, {
      path: 'docs/fm-search-architecture',
      title: 'Architecture Notes',
      contentSource: '---\ntags: [architecture]\n---\n\n# auth design',
    });
    await revisions.publish(editorCtx, { path: 'docs/fm-search-architecture', version: 1 });
    await pageService.create(editorCtx, {
      path: 'docs/fm-search-security',
      title: 'Security Notes',
      contentSource: '---\ntags: [security]\n---\n\n# auth design',
    });
    await revisions.publish(editorCtx, { path: 'docs/fm-search-security', version: 1 });

    const filtered = await publicContent.searchPages(readerCtx, {
      q: 'auth',
      scope: 'all',
      status: 'published',
      limit: 20,
      include: [],
      excerptLength: 100,
      'filter[tag]': ['architecture'],
    });
    expect(filtered.items.map((item) => item.page.path)).toEqual(['docs/fm-search-architecture']);
    expect(Object.keys(filtered).sort()).toEqual(['items', 'nextCursor']);

    const unfiltered = await publicContent.searchPages(readerCtx, {
      q: 'auth',
      scope: 'all',
      status: 'published',
      limit: 20,
      include: [],
      excerptLength: 100,
    });
    expect(unfiltered.items.map((item) => item.page.path).sort()).toEqual([
      'docs/fm-search-architecture',
      'docs/fm-search-security',
    ]);
  });

  it('exposes a parsed frontmatter object consistent with the Markdown source (US2)', async () => {
    const editor = await createPublicApiUser('public-fm-expose-editor@example.com', 'editor');
    const reader = await createPublicApiUser('public-fm-expose-reader@example.com', 'reader');
    const editorCtx = buildUserCtx(editor.id, 'editor');
    const readerCtx = buildApiKeyCtx(reader.id, 'reader', ['view'], 'reader-key');

    await pageService.create(editorCtx, {
      path: 'docs/fm-expose',
      title: 'Frontmatter Expose',
      contentSource: '---\ntags: [a, b]\nstatus: draft\n---\n\n# Body',
    });
    await revisions.publish(editorCtx, { path: 'docs/fm-expose', version: 1 });

    const page = await publicContent.getPageByPath(readerCtx, 'docs/fm-expose');
    expect(page?.frontmatter).toEqual({ tags: ['a', 'b'], status: 'draft' });
    expect(page?.contentSource).toContain('---');

    await pageService.create(editorCtx, {
      path: 'docs/fm-none',
      title: 'No Frontmatter',
      contentSource: '# Just a heading',
    });
    await revisions.publish(editorCtx, { path: 'docs/fm-none', version: 1 });
    const plain = await publicContent.getPageByPath(readerCtx, 'docs/fm-none');
    expect(plain?.frontmatter).toBeNull();
  });

  it('filters pages by structured tags and combines tag filters with frontmatter-presence filters (US2)', async () => {
    const editor = await createPublicApiUser('public-fm-list-editor@example.com', 'editor');
    const reader = await createPublicApiUser('public-fm-list-reader@example.com', 'reader');
    const editorCtx = buildUserCtx(editor.id, 'editor');
    const readerCtx = buildApiKeyCtx(reader.id, 'reader', ['view'], 'reader-key');

    await pageService.create(editorCtx, { path: 'docs/fm-list/none', title: 'None', contentSource: '# no frontmatter' });
    await revisions.publish(editorCtx, { path: 'docs/fm-list/none', version: 1 });
    await pageService.create(editorCtx, {
      path: 'docs/fm-list/a',
      title: 'Tag A',
      contentSource: '---\ntags: [a]\n---\n\n# body',
    });
    await revisions.publish(editorCtx, { path: 'docs/fm-list/a', version: 1 });
    await pageService.create(editorCtx, {
      path: 'docs/fm-list/ab',
      title: 'Tag A and B',
      contentSource: '---\ntags: [a, b]\n---\n\n# body',
    });
    await revisions.publish(editorCtx, { path: 'docs/fm-list/ab', version: 1 });
    const databaseOnly = await pageService.create(editorCtx, {
      path: 'docs/fm-list/database-only',
      title: 'Database-only Tag A',
      contentSource: '# body without frontmatter',
    });
    const databaseOnlyDraft = await pageService.newDraft(editorCtx, 'docs/fm-list/database-only', {
      title: 'Database-only Tag A',
      contentSource: '# body without frontmatter',
      baseRevisionId: databaseOnly.versionId,
      metadata: { date: null, summary: null, tags: ['A'] },
    });
    await revisions.publish(editorCtx, { path: 'docs/fm-list/database-only', version: databaseOnlyDraft.versionNumber });

    const tagOnly = await publicContent.listPages(readerCtx, {
      status: 'published',
      limit: 20,
      order: 'path',
      include: [],
      pathPrefix: 'docs/fm-list',
      'filter[tag]': ['a'],
    });

    expect(tagOnly.items.map((item) => item.path).sort()).toEqual([
      'docs/fm-list/a',
      'docs/fm-list/ab',
      'docs/fm-list/database-only',
    ]);

    const result = await publicContent.listPages(readerCtx, {
      status: 'published',
      limit: 20,
      order: 'path',
      include: [],
      pathPrefix: 'docs/fm-list',
      'filter[tag]': ['a'],
      'filter[has_frontmatter]': true,
    });

    expect(result.items.map((item) => item.path).sort()).toEqual(['docs/fm-list/a', 'docs/fm-list/ab']);
  });

  it('classifies outbound links by source (markdown/wiki/frontmatter) and buckets dangling/external separately (US4)', async () => {
    const editor = await createPublicApiUser('public-links-editor@example.com', 'editor');
    const reader = await createPublicApiUser('public-links-reader@example.com', 'reader');
    const editorCtx = buildUserCtx(editor.id, 'editor');
    const readerCtx = buildApiKeyCtx(reader.id, 'reader', ['view'], 'reader-key');

    await pageService.create(editorCtx, { path: 'graph/b', title: 'B', contentSource: '# B' });
    await revisions.publish(editorCtx, { path: 'graph/b', version: 1 });
    await pageService.create(editorCtx, { path: 'graph/c', title: 'C', contentSource: '# C' });
    await revisions.publish(editorCtx, { path: 'graph/c', version: 1 });
    await pageService.create(editorCtx, { path: 'graph/d', title: 'D', contentSource: '# D' });
    await revisions.publish(editorCtx, { path: 'graph/d', version: 1 });
    // Draft-only: exists but unreadable to the reader.
    await pageService.create(editorCtx, { path: 'graph/secret', title: 'Secret', contentSource: '# Secret' });

    await pageService.create(editorCtx, {
      path: 'graph/a',
      title: 'A',
      contentSource:
        '---\nrelated_pages: [graph/d]\n---\n\n[Markdown Link](graph/b) and [[graph/c]] and [External](https://example.com) and [Missing](graph/missing) and [Secret](graph/secret)',
    });
    await revisions.publish(editorCtx, { path: 'graph/a', version: 1 });

    const a = await publicContent.getPageByPath(readerCtx, 'graph/a');
    const result = await publicContent.getOutboundLinks(readerCtx, a!.id);

    expect(result.pageId).toBe(a!.id);
    expect(result.links).toHaveLength(3);
    expect(result.links.map((l) => l.source).sort()).toEqual(['frontmatter', 'markdown', 'wiki']);
    expect(result.links.find((l) => l.source === 'markdown')).toMatchObject({ targetPath: 'graph/b' });
    expect(result.links.find((l) => l.source === 'wiki')).toMatchObject({ targetPath: 'graph/c' });
    expect(result.links.find((l) => l.source === 'frontmatter')).toMatchObject({ targetPath: 'graph/d' });

    expect(result.external).toEqual([{ source: 'markdown', href: 'https://example.com', linkText: 'External' }]);

    expect(result.dangling).toHaveLength(2);
    expect(result.dangling.find((l) => l.targetPath === 'graph/missing')).toMatchObject({ targetPath: 'graph/missing' });
    const secretDangling = result.dangling.find((l) => l.targetPath === 'graph/secret');
    expect(secretDangling).toBeDefined();
    expect(secretDangling?.targetStatus).toBeUndefined();
  });

  it('traverses the multi-hop neighborhood, stops cycles, and silently omits unreadable targets (US4)', async () => {
    const editor = await createPublicApiUser('public-neighbors-editor@example.com', 'editor');
    const reader = await createPublicApiUser('public-neighbors-reader@example.com', 'reader');
    const editorCtx = buildUserCtx(editor.id, 'editor');
    const readerCtx = buildApiKeyCtx(reader.id, 'reader', ['view'], 'reader-key');

    await pageService.create(editorCtx, { path: 'net/b', title: 'B', contentSource: '# B' });
    await revisions.publish(editorCtx, { path: 'net/b', version: 1 });
    await pageService.create(editorCtx, { path: 'net/c', title: 'C', contentSource: '# C' });
    await revisions.publish(editorCtx, { path: 'net/c', version: 1 });
    await pageService.create(editorCtx, { path: 'net/e', title: 'E', contentSource: '# E' });
    await revisions.publish(editorCtx, { path: 'net/e', version: 1 });
    // Draft-only: exists but unreadable to the reader — must be silently omitted.
    await pageService.create(editorCtx, { path: 'net/secret', title: 'Secret', contentSource: '# Secret' });

    await pageService.create(editorCtx, {
      path: 'net/d',
      title: 'D',
      contentSource: '[Back to A](net/a) and [To E](net/e) and [To Secret](net/secret)',
    });
    await revisions.publish(editorCtx, { path: 'net/d', version: 1 });

    await pageService.create(editorCtx, {
      path: 'net/a',
      title: 'A',
      contentSource: '---\nrelated_pages: [net/d]\n---\n\n[To B](net/b) and [[net/c]]',
    });
    await revisions.publish(editorCtx, { path: 'net/a', version: 1 });

    const a = await publicContent.getPageByPath(readerCtx, 'net/a');
    const result = await publicContent.getNeighborhood(readerCtx, a!.id, 2, 'out');

    expect(result.root).toMatchObject({ path: 'net/a' });
    expect(result.tiers).toHaveLength(3);
    expect(result.tiers[0]).toEqual([{ pageId: a!.id, path: 'net/a', title: 'A' }]);
    expect(result.tiers[1]!.map((n) => n.path).sort()).toEqual(['net/b', 'net/c', 'net/d']);
    // D -> A is a cycle (must not re-enter A); D -> secret is unreadable (silently
    // omitted); only D -> E should surface at tier 2.
    expect(result.tiers[2]!.map((n) => n.path)).toEqual(['net/e']);
  });
});
