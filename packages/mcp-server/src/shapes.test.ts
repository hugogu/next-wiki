import { describe, expect, it } from 'vitest';
import {
  listPagesResponse,
  publishPageResponse,
  saveDraftResponse,
  searchWikiResponse,
  uploadImageResponse,
} from './shapes';

describe('shape transformers', () => {
  it('flattens search response', () => {
    const result = searchWikiResponse({
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
            createdAt: '2026-07-01T00:00:00Z',
            updatedAt: '2026-07-01T00:00:00Z',
            links: { self: '', byPath: '', revisions: '', drafts: '' },
          },
          matchType: 'title',
          excerpt: '...',
          score: null,
        },
      ],
      nextCursor: null,
    });

    expect(result.results[0]).toEqual({
      id: 'a0eebc99-9c0b-4ef8-bb6d-6bb9bd380a11',
      path: 'docs/test',
      title: 'Test',
      matchType: 'title',
      excerpt: '...',
    });
    expect(result.hasMore).toBe(false);
  });

  it('flattens page list response', () => {
    const result = listPagesResponse({
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
          createdAt: '2026-07-01T00:00:00Z',
          updatedAt: '2026-07-01T00:00:00Z',
          links: { self: '', byPath: '', revisions: '', drafts: '' },
        },
      ],
      nextCursor: 'cursor-1',
    });

    expect(result.pages[0]).toEqual({
      id: 'a0eebc99-9c0b-4ef8-bb6d-6bb9bd380a11',
      path: 'docs/test',
      title: 'Test',
      status: 'published',
      locale: 'en',
    });
    expect(result.hasMore).toBe(true);
  });

  it('maps revision fields', () => {
    const result = saveDraftResponse({
      id: 'a0eebc99-9c0b-4ef8-bb6d-6bb9bd380a11',
      pageId: 'page-id',
      version: 2,
      status: 'draft',
      contentType: 'text/markdown',
      contentHash: 'abc',
      author: { id: null, displayName: null },
      createdAt: '2026-07-01T00:00:00Z',
      publishedAt: null,
      canPublish: true,
    });

    expect(result).toEqual({
      revisionId: 'a0eebc99-9c0b-4ef8-bb6d-6bb9bd380a11',
      version: 2,
      status: 'draft',
    });
  });

  it('extracts published revision info', () => {
    const result = publishPageResponse({
      id: 'page-id',
      spaceSlug: 'main',
      path: 'docs/test',
      locale: 'en',
      title: 'Test',
      status: 'published',
      author: { id: null, displayName: null },
      latestRevision: null,
      publishedRevision: {
        id: 'rev-id',
        pageId: 'page-id',
        version: 1,
        status: 'published',
        contentType: 'text/markdown',
        contentHash: 'abc',
        author: { id: null, displayName: null },
        createdAt: '2026-07-01T00:00:00Z',
        publishedAt: '2026-07-01T01:00:00Z',
        canPublish: false,
      },
      createdAt: '2026-07-01T00:00:00Z',
      updatedAt: '2026-07-01T01:00:00Z',
      links: { self: '', byPath: '', revisions: '', drafts: '' },
    });

    expect(result.publishedRevisionId).toBe('rev-id');
    expect(result.publishedAt).toBe('2026-07-01T01:00:00Z');
  });

  it('maps asset upload response', () => {
    const result = uploadImageResponse({
      id: 'asset-id',
      contentType: 'image/png',
      sizeBytes: 1234,
      url: '/api/v1/assets/asset-id/content',
      markdown: '![image](/api/v1/assets/asset-id/content)',
      createdAt: '2026-07-01T00:00:00Z',
    });

    expect(result.markdown).toBe('![image](/api/v1/assets/asset-id/content)');
    expect(result.contentType).toBe('image/png');
  });
});
