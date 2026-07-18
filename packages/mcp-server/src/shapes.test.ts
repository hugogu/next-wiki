import { describe, expect, it } from 'vitest';
import {
  listPagesResponse,
  publishPageResponse,
  saveDraftResponse,
  searchWikiResponse,
  uploadImageResponse,
} from './shapes';

describe('shape transformers', () => {
  it('preserves typed metadata on page-list items', () => {
    const result = listPagesResponse({ items: [{
      id: 'a0eebc99-9c0b-4ef8-bb6d-6bb9bd380a11', spaceSlug: 'main', path: 'docs/meta', locale: 'en', title: 'Meta', status: 'published',
      author: { id: null, displayName: null }, latestRevision: null, publishedRevision: null, createdAt: '', updatedAt: '',
      metadata: { date: '2026-07-10', summary: 'Summary', tags: [] }, links: { self: '', byPath: '', revisions: '', drafts: '' },
    }], nextCursor: null });
    expect(result.pages[0]?.metadata?.summary).toBe('Summary');
  });
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
          score: 0.8,
        },
      ],
      nextCursor: null,
    });

    expect(result.results[0]).toEqual({
      id: 'a0eebc99-9c0b-4ef8-bb6d-6bb9bd380a11',
      space: 'main',
      path: 'docs/test',
      title: 'Test',
      matchType: 'title',
      excerpt: '...',
      score: 0.8,
      frontmatter: null,
    });
    expect(result.hasMore).toBe(false);
  });

  it('flattens search response frontmatter when present', () => {
    const result = searchWikiResponse({
      items: [
        {
          page: {
            id: 'a0eebc99-9c0b-4ef8-bb6d-6bb9bd380a11',
            spaceSlug: 'main',
            path: 'docs/test',
            locale: 'en',
            title: 'Test',
            frontmatter: { tags: ['a'] },
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
          score: 0.8,
        },
      ],
      nextCursor: null,
    });

    expect(result.results[0]?.frontmatter).toEqual({ tags: ['a'] });
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
      space: 'main',
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

  it('preserves page and revision provenance, link targets, and raw source metadata', async () => {
    const { getPageResponse, getRevisionResponse } = await import('./shapes');
    const page = getPageResponse({
      id: 'a0eebc99-9c0b-4ef8-bb6d-6bb9bd380a11',
      spaceSlug: 'generated',
      path: 'concepts/payment',
      locale: 'en',
      title: 'Payment',
      kind: 'link',
      linkTarget: { pageId: 'b0eebc99-9c0b-4ef8-bb6d-6bb9bd380a11', path: 'concepts/source', title: 'Source' },
      origin: { actorKind: 'machine', nature: 'generated' },
      humanModified: true,
      status: 'published',
      author: { id: null, displayName: null },
      createdAt: '',
      updatedAt: '',
      links: { self: '', byPath: '', revisions: '', drafts: '' },
    });
    const revision = getRevisionResponse({
      id: 'c0eebc99-9c0b-4ef8-bb6d-6bb9bd380a11',
      pageId: page.id,
      version: 2,
      status: 'published',
      contentType: 'text/markdown',
      contentHash: 'hash',
      author: { id: null, displayName: null },
      createdAt: '',
      publishedAt: '',
      canPublish: false,
      origin: { actorKind: 'human', nature: 'generated' },
      linkTargetPageId: 'b0eebc99-9c0b-4ef8-bb6d-6bb9bd380a11',
      source: { channel: 'support', occurredAt: '2026-07-18T00:00:00.000Z' },
    });

    expect(page).toMatchObject({
      space: 'generated',
      kind: 'link',
      linkTarget: { pageId: 'b0eebc99-9c0b-4ef8-bb6d-6bb9bd380a11' },
      origin: { actorKind: 'machine', nature: 'generated' },
      humanModified: true,
    });
    expect(revision).toMatchObject({
      origin: { actorKind: 'human', nature: 'generated' },
      linkTargetPageId: 'b0eebc99-9c0b-4ef8-bb6d-6bb9bd380a11',
      source: { channel: 'support' },
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
