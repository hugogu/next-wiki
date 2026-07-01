import { describe, expect, it, vi } from 'vitest';
import { WikiApiClient } from '../api-client';
import { getPage } from './get-page';
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
});
