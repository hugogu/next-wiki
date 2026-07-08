import { describe, expect, it, vi } from 'vitest';

const pagesService = vi.hoisted(() => ({
  listPublished: vi.fn(),
}));
const configModule = vi.hoisted(() => ({
  env: { APP_URL: 'https://wiki.example.test' },
}));

vi.mock('@/server/services/pages', () => pagesService);
vi.mock('@/server/config', () => configModule);

import sitemap, { dynamic } from './sitemap';

describe('sitemap route', () => {
  it('opts out of static prerendering so the route can be built without a database', () => {
    expect(dynamic).toBe('force-dynamic');
  });

  it('emits the homepage and /pages index ahead of every published page', async () => {
    pagesService.listPublished.mockResolvedValue([
      {
        path: 'docs/a',
        title: 'A',
        authorDisplayName: 'Author',
        publishedAt: '2026-06-01T00:00:00.000Z',
        updatedAt: '2026-06-02T00:00:00.000Z',
      },
      {
        path: 'docs/b',
        title: 'B',
        authorDisplayName: 'Author',
        publishedAt: null,
        updatedAt: '2026-06-03T00:00:00.000Z',
      },
    ]);

    const entries = await sitemap();

    expect(entries[0]).toMatchObject({
      url: 'https://wiki.example.test/',
      changeFrequency: 'daily',
      priority: 1.0,
    });
    expect(entries[1]).toMatchObject({
      url: 'https://wiki.example.test/pages',
      changeFrequency: 'daily',
      priority: 0.8,
    });
    expect(entries[2]).toMatchObject({
      url: 'https://wiki.example.test/docs/a',
      lastModified: '2026-06-02T00:00:00.000Z',
      changeFrequency: 'weekly',
      priority: 0.7,
    });
    expect(entries[3]).toMatchObject({
      url: 'https://wiki.example.test/docs/b',
      lastModified: '2026-06-03T00:00:00.000Z',
      changeFrequency: 'weekly',
      priority: 0.7,
    });
  });

  it('still returns the homepage and /pages index when no pages are published', async () => {
    pagesService.listPublished.mockResolvedValue([]);

    const entries = await sitemap();

    expect(entries).toHaveLength(2);
    expect(entries[0]?.url).toBe('https://wiki.example.test/');
    expect(entries[1]?.url).toBe('https://wiki.example.test/pages');
  });
});
