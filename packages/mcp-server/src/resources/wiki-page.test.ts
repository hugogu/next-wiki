import { describe, expect, it, vi } from 'vitest';
import { WikiApiClient } from '../api-client';
import { listWikiResources, readWikiResource } from './wiki-page';

describe('wiki-page resources', () => {
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

  it('lists readable pages as resources', async () => {
    const client = createClient({
      listPages: vi.fn().mockResolvedValue({
        items: [
          {
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
        ],
        nextCursor: null,
      }),
    });

    const resources = await listWikiResources(client);
    expect(resources).toHaveLength(1);
    expect(resources[0]?.uri).toBe('wiki://pages/a0eebc99-9c0b-4ef8-bb6d-6bb9bd380a11');
    expect(resources[0]?.mimeType).toBe('text/markdown');
  });

  it('reads page markdown source', async () => {
    const client = createClient({
      getPage: vi.fn().mockResolvedValue({
        id: 'a0eebc99-9c0b-4ef8-bb6d-6bb9bd380a11',
        spaceSlug: 'main',
        path: 'docs/test',
        locale: 'en',
        title: 'Test',
        contentSource: '# Hello World',
        status: 'published',
        author: { id: null, displayName: null },
        latestRevision: null,
        publishedRevision: null,
        createdAt: '',
        updatedAt: '',
        links: { self: '', byPath: '', revisions: '', drafts: '' },
      }),
    });

    const resource = await readWikiResource(client, 'wiki://pages/a0eebc99-9c0b-4ef8-bb6d-6bb9bd380a11');
    expect(resource.text).toBe('# Hello World');
    expect(resource.mimeType).toBe('text/markdown');
  });

  it('rejects invalid resource URI', async () => {
    const client = createClient();
    await expect(readWikiResource(client, 'wiki://invalid')).rejects.toThrow('Invalid wiki resource URI');
  });
});
