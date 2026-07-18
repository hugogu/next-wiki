import { describe, expect, it, vi } from 'vitest';
import { WikiApiClient } from '../api-client';
import { batchCreatePages } from './batch-create-pages';
import { deletePage } from './delete-page';
import { findSimilar } from './find-similar';
import { getBacklinks } from './get-backlinks';
import { getDiff } from './get-diff';
import { getPage } from './get-page';
import { getPageTree } from './get-page-tree';
import { getStats } from './get-stats';
import { listPages } from './list-pages';
import { searchWiki } from './search-wiki';
import { submitSemanticSearch } from './submit-semantic-search';
import { getSemanticSearchResults } from './get-semantic-search-results';
import { getPageOutboundLinks } from './get-page-outbound-links';
import { getNeighborhood } from './get-neighborhood';
import { batchUpdatePages } from './batch-update-pages';
import { batchSoftDeletePages } from './batch-soft-delete-pages';
import { listTags } from './list-tags';
import { mergeTag } from './merge-tag';
import { updatePageMetadata } from './update-page-metadata';
import { appendRawEntry } from './append-raw-entry';
import { createPage } from './create-page';

const metadataFixture = { date: '2026-07-10', summary: 'Summary', tags: [] };

describe('tools', () => {
  function createClient(overrides: Partial<WikiApiClient> = {}): WikiApiClient {
    return {
      searchPages: vi.fn(),
      listPages: vi.fn(),
      getPage: vi.fn(),
      deletePage: vi.fn(),
      getBacklinks: vi.fn(),
      getDiff: vi.fn(),
      batchCreatePages: vi.fn(),
      getStats: vi.fn(),
      findSimilar: vi.fn(),
      createPage: vi.fn(),
      saveDraft: vi.fn(),
      updatePageProperties: vi.fn(),
      publishPage: vi.fn(),
      listRevisions: vi.fn(),
      getRevision: vi.fn(),
      appendRawEntry: vi.fn(),
      uploadImage: vi.fn(),
      getPageTree: vi.fn(),
      submitSemanticSearch: vi.fn(),
      getSemanticSearchResults: vi.fn(),
      getOutboundLinks: vi.fn(),
      getNeighborhood: vi.fn(),
      batchUpdatePages: vi.fn(),
      batchSoftDeletePages: vi.fn(),
      listTags: vi.fn(), createTag: vi.fn(), renameTag: vi.fn(), deleteTag: vi.fn(), mergeTag: vi.fn(), getTagMutation: vi.fn(), updatePageMetadata: vi.fn(),
      ...overrides,
    } as unknown as WikiApiClient;
  }

  it('search_wiki transforms response', async () => {
    const client = createClient({
      searchPages: vi.fn().mockResolvedValue({
        items: [
          {
            page: {
              id: 'a0eebc99-9c0b-4ef8-bb6d-6bb9bd380a11',
              spaceSlug: 'main',
              path: 'docs/test',
              locale: 'en',
              title: 'Test',
              status: 'published',
              author: { id: null, displayName: null },
              latestRevision: null,
              publishedRevision: null,
              createdAt: '',
              updatedAt: '',
              links: { self: '', byPath: '', revisions: '', drafts: '' },
            },
            matchType: 'title',
            excerpt: 'excerpt',
            score: null,
          },
        ],
        nextCursor: null,
      }),
    });

    const result = await searchWiki(client, { query: 'test' });
    expect(result.results[0]?.title).toBe('Test');
  });

  it('search_wiki forwards excerptLength to the client', async () => {
    const searchPages = vi.fn().mockResolvedValue({ items: [], nextCursor: null });
    const client = createClient({ searchPages });

    await searchWiki(client, { query: 'test', excerptLength: 50 });

    expect(searchPages).toHaveBeenCalledWith(expect.objectContaining({ excerptLength: 50 }));
  });

  it('get_page returns content source', async () => {
    const client = createClient({
      getPage: vi.fn().mockResolvedValue({
        id: 'a0eebc99-9c0b-4ef8-bb6d-6bb9bd380a11',
        spaceSlug: 'main',
        path: 'docs/test',
        locale: 'en',
        title: 'Test',
        contentSource: '# Hello',
        status: 'published',
        author: { id: null, displayName: null },
        latestRevision: null,
        publishedRevision: null,
        createdAt: '',
        updatedAt: '',
        links: { self: '', byPath: '', revisions: '', drafts: '' },
      }),
    });

    const result = await getPage(client, { pageId: 'a0eebc99-9c0b-4ef8-bb6d-6bb9bd380a11' });
    expect(result.contentSource).toBe('# Hello');
  });

  it('list_pages forwards pathPrefix to the client', async () => {
    const listPagesClient = vi.fn().mockResolvedValue({ items: [], nextCursor: null });
    const client = createClient({ listPages: listPagesClient });

    await listPages(client, { pathPrefix: 'docs' });

    expect(listPagesClient).toHaveBeenCalledWith(expect.objectContaining({ pathPrefix: 'docs' }));
  });

  it('list_pages forwards writing-space filters to the client', async () => {
    const listPagesClient = vi.fn().mockResolvedValue({ items: [], nextCursor: null });
    const client = createClient({ listPages: listPagesClient });

    await listPages(client, {
      space: 'generated',
      filterType: 'concept',
      filterTag: 'payments',
      createdStart: '2026-07-01T00:00:00.000Z',
      createdEnd: '2026-07-02T00:00:00.000Z',
    });

    expect(listPagesClient).toHaveBeenCalledWith(expect.objectContaining({
      space: 'generated',
      filterType: 'concept',
      filterTag: 'payments',
      createdStart: new Date('2026-07-01T00:00:00.000Z'),
      createdEnd: new Date('2026-07-02T00:00:00.000Z'),
    }));
  });

  it('search_wiki forwards pathPrefix to the client', async () => {
    const searchPages = vi.fn().mockResolvedValue({ items: [], nextCursor: null });
    const client = createClient({ searchPages });

    await searchWiki(client, { query: 'test', pathPrefix: 'docs' });

    expect(searchPages).toHaveBeenCalledWith(expect.objectContaining({ pathPrefix: 'docs' }));
  });

  it('search_wiki forwards writing-space filters to the client', async () => {
    const searchPages = vi.fn().mockResolvedValue({ items: [], nextCursor: null });
    const client = createClient({ searchPages });

    await searchWiki(client, { query: 'payment', space: 'raw', filterType: 'chat-transcript' });

    expect(searchPages).toHaveBeenCalledWith(expect.objectContaining({
      space: 'raw',
      filterType: 'chat-transcript',
    }));
  });

  it('get_page_tree flattens the tree response', async () => {
    const client = createClient({
      getPageTree: vi.fn().mockResolvedValue({
        root: {
          path: '',
          segment: '',
          title: null,
          pageId: null,
          status: null,
          children: [
            {
              path: 'docs',
              segment: 'docs',
              title: 'Docs',
              pageId: 'a0eebc99-9c0b-4ef8-bb6d-6bb9bd380a11',
              status: 'published',
              children: [],
            },
          ],
        },
        pageCount: 1,
      }),
    });

    const result = await getPageTree(client, { pathPrefix: 'docs' });
    expect(result.pageCount).toBe(1);
    expect(result.root.children[0]?.path).toBe('docs');
    expect(result.root.children[0]?.title).toBe('Docs');
    expect(client.getPageTree).toHaveBeenCalledWith(expect.objectContaining({ pathPrefix: 'docs' }));
  });

  it('delete_page returns deleted confirmation', async () => {
    const client = createClient({ deletePage: vi.fn().mockResolvedValue(undefined) });
    const result = await deletePage(client, { pageId: 'a0eebc99-9c0b-4ef8-bb6d-6bb9bd380a11' });
    expect(result.deleted).toBe(true);
    expect(result.id).toBe('a0eebc99-9c0b-4ef8-bb6d-6bb9bd380a11');
  });

  it('get_backlinks flattens response', async () => {
    const client = createClient({
      getBacklinks: vi.fn().mockResolvedValue({
        items: [{ pageId: 'a0eebc99-9c0b-4ef8-bb6d-6bb9bd380a11', path: 'docs/a', title: 'A', linkText: 'link' }],
      }),
    });
    const result = await getBacklinks(client, { pageId: 'a0eebc99-9c0b-4ef8-bb6d-6bb9bd380a11' });
    expect(result.backlinks[0]?.path).toBe('docs/a');
  });

  it('get_diff forwards parameters', async () => {
    const getDiffClient = vi.fn().mockResolvedValue({ fromVersion: 1, toVersion: 2, diff: '', additions: 0, deletions: 0 });
    const client = createClient({ getDiff: getDiffClient });
    await getDiff(client, { pageId: 'a0eebc99-9c0b-4ef8-bb6d-6bb9bd380a11', version: 2, against: 1 });
    expect(getDiffClient).toHaveBeenCalledWith('a0eebc99-9c0b-4ef8-bb6d-6bb9bd380a11', 2, 1);
  });

  it('batch_create_pages forwards pages', async () => {
    const batchCreatePagesClient = vi.fn().mockResolvedValue({ created: [], count: 0 });
    const client = createClient({ batchCreatePages: batchCreatePagesClient });
    await batchCreatePages(client, { pages: [{ path: 'docs/a', title: 'A', contentSource: '# A' }] });
    expect(batchCreatePagesClient).toHaveBeenCalledWith({ pages: [{ path: 'docs/a', title: 'A', contentSource: '# A' }] });
  });

  it('batch_create_pages forwards a per-page content space', async () => {
    const batchCreatePagesClient = vi.fn().mockResolvedValue({ created: [], count: 0 });
    const client = createClient({ batchCreatePages: batchCreatePagesClient });

    await batchCreatePages(client, { pages: [{ path: 'concepts/a', title: 'A', contentSource: '# A', space: 'generated' }] });

    expect(batchCreatePagesClient).toHaveBeenCalledWith({
      pages: [{ path: 'concepts/a', title: 'A', contentSource: '# A', space: 'generated' }],
    });
  });

  it('create_page forwards raw and link creation metadata', async () => {
    const createPageClient = vi.fn().mockResolvedValue({
      id: 'a0eebc99-9c0b-4ef8-bb6d-6bb9bd380a11',
      spaceSlug: 'raw',
      path: 'inputs/case-1',
      locale: 'en',
      title: 'Case 1',
      status: 'published',
      author: { id: null, displayName: null },
      createdAt: '',
      updatedAt: '',
      links: { self: '', byPath: '', revisions: '', drafts: '' },
    });
    const client = createClient({ createPage: createPageClient });

    await createPage(client, {
      path: 'inputs/case-1',
      title: 'Case 1',
      contentSource: 'Original evidence',
      space: 'raw',
      nature: 'original',
      inputKind: 'chat-transcript',
      source: { channel: 'support', sessionId: 'case-1' },
      kind: 'native',
    });

    expect(createPageClient).toHaveBeenCalledWith({
      path: 'inputs/case-1',
      title: 'Case 1',
      contentSource: 'Original evidence',
      locale: undefined,
      space: 'raw',
      nature: 'original',
      inputKind: 'chat-transcript',
      source: { channel: 'support', sessionId: 'case-1' },
      kind: 'native',
      linkTargetPageId: undefined,
    });
  });

  it('get_stats forwards includeOrphans', async () => {
    const getStatsClient = vi.fn().mockResolvedValue({
      totalPages: 1,
      publishedPages: 1,
      draftPages: 0,
      deletedPages: 0,
      recentActivity: { createdInLast7Days: 0, updatedInLast7Days: 0 },
      directories: [],
    });
    const client = createClient({ getStats: getStatsClient });
    await getStats(client, { includeOrphans: true });
    expect(getStatsClient).toHaveBeenCalledWith({ includeOrphans: true });
  });

  it('get_stats forwards space', async () => {
    const getStatsClient = vi.fn().mockResolvedValue({
      totalPages: 0,
      publishedPages: 0,
      draftPages: 0,
      deletedPages: 0,
      recentActivity: { createdInLast7Days: 0, updatedInLast7Days: 0 },
      directories: [],
    });
    const client = createClient({ getStats: getStatsClient });

    await getStats(client, { space: 'generated' });

    expect(getStatsClient).toHaveBeenCalledWith({ includeOrphans: undefined, space: 'generated' });
  });

  it('append_raw_entry forwards an immutable chunk and source metadata', async () => {
    const appendRawEntryClient = vi.fn().mockResolvedValue({
      id: 'a0eebc99-9c0b-4ef8-bb6d-6bb9bd380a11',
      pageId: 'a0eebc99-9c0b-4ef8-bb6d-6bb9bd380a11',
      version: 2,
      status: 'published',
      contentType: 'text/markdown',
      contentHash: 'hash',
      author: { id: null, displayName: null },
      createdAt: '',
      publishedAt: '',
      canPublish: false,
      origin: { actorKind: 'machine', nature: 'original' },
      source: { channel: 'support', sessionId: 'case-1' },
    });
    const client = createClient({ appendRawEntry: appendRawEntryClient });

    const result = await appendRawEntry(client, {
      pageId: 'a0eebc99-9c0b-4ef8-bb6d-6bb9bd380a11',
      content: 'Follow-up',
      source: { channel: 'support', sessionId: 'case-1' },
    });

    expect(appendRawEntryClient).toHaveBeenCalledWith('a0eebc99-9c0b-4ef8-bb6d-6bb9bd380a11', {
      content: 'Follow-up',
      source: { channel: 'support', sessionId: 'case-1' },
    });
    expect(result).toMatchObject({
      revisionId: 'a0eebc99-9c0b-4ef8-bb6d-6bb9bd380a11',
      origin: { actorKind: 'machine', nature: 'original' },
      source: { channel: 'support', sessionId: 'case-1' },
    });
  });

  it('find_similar forwards query', async () => {
    const findSimilarClient = vi.fn().mockResolvedValue({ results: [], threshold: 0.5 });
    const client = createClient({ findSimilar: findSimilarClient });
    await findSimilar(client, { title: 'payment', threshold: 0.6 });
    expect(findSimilarClient).toHaveBeenCalledWith({ title: 'payment', threshold: 0.6 });
  });

  it('submit_semantic_search forwards the query and defaults limit to 10', async () => {
    const submit = vi.fn().mockResolvedValue({
      id: 'a0eebc99-9c0b-4ef8-bb6d-6bb9bd380a11', feature: 'semantic_search', status: 'queued',
      createdAt: '', expiresAt: '', pollUrl: '/api/v1/search/semantic/a0eebc99-9c0b-4ef8-bb6d-6bb9bd380a11',
    });
    const client = createClient({ submitSemanticSearch: submit });

    const result = await submitSemanticSearch(client, { query: 'auth design' });

    expect(submit).toHaveBeenCalledWith(expect.objectContaining({ q: 'auth design', limit: 10 }));
    expect(result.status).toBe('queued');
  });

  it('get_semantic_search_results flattens items, citations, and usage', async () => {
    const client = createClient({
      getSemanticSearchResults: vi.fn().mockResolvedValue({
        id: 'a0eebc99-9c0b-4ef8-bb6d-6bb9bd380a11', feature: 'semantic_search', status: 'succeeded',
        createdAt: '', startedAt: null, finishedAt: null, expiresAt: '',
        items: [{
          pageId: 'a0eebc99-9c0b-4ef8-bb6d-6bb9bd380a11', path: 'docs/a', title: 'A', score: 0.9, excerpt: 'x',
          citations: [{ chunkId: 'a0eebc99-9c0b-4ef8-bb6d-6bb9bd380a11', revisionId: 'a0eebc99-9c0b-4ef8-bb6d-6bb9bd380a11', contentHash: 'hash' }],
        }],
        usage: { inputTokens: 5 },
      }),
    });

    const result = await getSemanticSearchResults(client, { id: 'a0eebc99-9c0b-4ef8-bb6d-6bb9bd380a11' });

    expect(result.items).toHaveLength(1);
    expect(result.items[0]?.citations[0]?.contentHash).toBe('hash');
    expect(result.usage).toEqual({ inputTokens: 5 });
  });

  it('get_page_outbound_links forwards pageId and returns classified buckets', async () => {
    const getOutboundLinksClient = vi.fn().mockResolvedValue({
      pageId: 'a0eebc99-9c0b-4ef8-bb6d-6bb9bd380a11',
      links: [{ source: 'markdown', targetPath: 'docs/b', targetPageId: 'a0eebc99-9c0b-4ef8-bb6d-6bb9bd380a11', targetStatus: 'published', linkText: 'B' }],
      dangling: [],
      external: [],
    });
    const client = createClient({ getOutboundLinks: getOutboundLinksClient });

    const result = await getPageOutboundLinks(client, { pageId: 'a0eebc99-9c0b-4ef8-bb6d-6bb9bd380a11' });

    expect(getOutboundLinksClient).toHaveBeenCalledWith('a0eebc99-9c0b-4ef8-bb6d-6bb9bd380a11');
    expect(result.links).toHaveLength(1);
  });

  it('get_neighborhood forwards node/depth/direction', async () => {
    const getNeighborhoodClient = vi.fn().mockResolvedValue({
      root: { pageId: 'a0eebc99-9c0b-4ef8-bb6d-6bb9bd380a11', path: 'a', title: 'A' },
      tiers: [[{ pageId: 'a0eebc99-9c0b-4ef8-bb6d-6bb9bd380a11', path: 'a', title: 'A' }]],
    });
    const client = createClient({ getNeighborhood: getNeighborhoodClient });

    await getNeighborhood(client, { node: 'a0eebc99-9c0b-4ef8-bb6d-6bb9bd380a11', depth: 2, direction: 'both' });

    expect(getNeighborhoodClient).toHaveBeenCalledWith('a0eebc99-9c0b-4ef8-bb6d-6bb9bd380a11', 2, 'both');
  });

  it('batch_update_pages defaults dryRun to false and forwards items', async () => {
    const batchUpdatePagesClient = vi.fn().mockResolvedValue({ results: [], successCount: 0, failureCount: 0 });
    const client = createClient({ batchUpdatePages: batchUpdatePagesClient });

    await batchUpdatePages(client, {
      items: [{ pageId: 'a0eebc99-9c0b-4ef8-bb6d-6bb9bd380a11', title: 'New', baseRevisionId: 'a0eebc99-9c0b-4ef8-bb6d-6bb9bd380a11' }],
    });

    expect(batchUpdatePagesClient).toHaveBeenCalledWith(
      { items: [{ pageId: 'a0eebc99-9c0b-4ef8-bb6d-6bb9bd380a11', title: 'New', baseRevisionId: 'a0eebc99-9c0b-4ef8-bb6d-6bb9bd380a11' }] },
      { dryRun: false },
    );
  });

  it('batch_soft_delete_pages forwards dryRun and pageIds', async () => {
    const batchSoftDeletePagesClient = vi.fn().mockResolvedValue({ results: [], successCount: 0, failureCount: 0, dryRun: true });
    const client = createClient({ batchSoftDeletePages: batchSoftDeletePagesClient });

    await batchSoftDeletePages(client, { pageIds: ['a0eebc99-9c0b-4ef8-bb6d-6bb9bd380a11'], dryRun: true });

    expect(batchSoftDeletePagesClient).toHaveBeenCalledWith({ pageIds: ['a0eebc99-9c0b-4ef8-bb6d-6bb9bd380a11'] }, { dryRun: true });
  });

  it('forwards typed tag and metadata operations', async () => {
    const list = vi.fn().mockResolvedValue({ items: [], nextCursor: null });
    const merge = vi.fn().mockResolvedValue({ id: 'mutation' });
    const update = vi.fn().mockResolvedValue({ id: 'a0eebc99-9c0b-4ef8-bb6d-6bb9bd380a11', path: 'docs/a', title: 'A', locale: 'en', status: 'draft', author: { id: null, displayName: null }, createdAt: '', updatedAt: '', links: { self: '', byPath: '', revisions: '', drafts: '' }, metadata: metadataFixture });
    const client = createClient({ listTags: list, mergeTag: merge, updatePageMetadata: update });
    await listTags(client, { limit: 10 });
    await mergeTag(client, { tagId: 'a0eebc99-9c0b-4ef8-bb6d-6bb9bd380a11', targetTagId: 'b0eebc99-9c0b-4ef8-bb6d-6bb9bd380a22' });
    await updatePageMetadata(client, { pageId: 'a0eebc99-9c0b-4ef8-bb6d-6bb9bd380a11', baseRevisionId: 'a0eebc99-9c0b-4ef8-bb6d-6bb9bd380a11', tags: ['devops'] });
    expect(list).toHaveBeenCalledWith({ limit: 10 });
    expect(merge).toHaveBeenCalledWith('a0eebc99-9c0b-4ef8-bb6d-6bb9bd380a11', 'b0eebc99-9c0b-4ef8-bb6d-6bb9bd380a22');
    expect(update).toHaveBeenCalledWith('a0eebc99-9c0b-4ef8-bb6d-6bb9bd380a11', expect.objectContaining({ tags: ['devops'] }));
  });
});
