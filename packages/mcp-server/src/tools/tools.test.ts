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
      uploadImage: vi.fn(),
      getPageTree: vi.fn(),
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

  it('search_wiki forwards pathPrefix to the client', async () => {
    const searchPages = vi.fn().mockResolvedValue({ items: [], nextCursor: null });
    const client = createClient({ searchPages });

    await searchWiki(client, { query: 'test', pathPrefix: 'docs' });

    expect(searchPages).toHaveBeenCalledWith(expect.objectContaining({ pathPrefix: 'docs' }));
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

  it('find_similar forwards query', async () => {
    const findSimilarClient = vi.fn().mockResolvedValue({ results: [], threshold: 0.5 });
    const client = createClient({ findSimilar: findSimilarClient });
    await findSimilar(client, { title: 'payment', threshold: 0.6 });
    expect(findSimilarClient).toHaveBeenCalledWith({ title: 'payment', threshold: 0.6 });
  });
});
