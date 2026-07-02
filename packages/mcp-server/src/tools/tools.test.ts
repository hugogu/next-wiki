import { describe, expect, it, vi } from 'vitest';
import { WikiApiClient } from '../api-client';
import { getPage } from './get-page';
import { getPageTree } from './get-page-tree';
import { listPages } from './list-pages';
import { searchWiki } from './search-wiki';

describe('tools', () => {
  function createClient(overrides: Partial<WikiApiClient> = {}): WikiApiClient {
    return {
      searchPages: vi.fn(),
      listPages: vi.fn(),
      getPage: vi.fn(),
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
});
