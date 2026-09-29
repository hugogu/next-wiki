import { beforeEach, describe, expect, it, vi } from 'vitest';

const pagesService = vi.hoisted(() => ({
  listPublished: vi.fn(),
}));
const configModule = vi.hoisted(() => ({
  env: { APP_URL: 'https://wiki.example.test' },
}));
// 035: sitemap.ts now iterates every space via listSpaces() and addresses
// each page by its canonical slug (canonicalSpacePath), not just the
// default wiki space's bare path.
const spacesService = vi.hoisted(() => ({
  listSpaces: vi.fn(),
}));
const socialImageService = vi.hoisted(() => ({ resolvePageSocialImage: vi.fn() }));

vi.mock('@/server/services/pages', () => pagesService);
vi.mock('@/server/config', () => configModule);
vi.mock('@/server/services/spaces', () => spacesService);
vi.mock('@/server/services/social-image', () => socialImageService);

import sitemap, { dynamic } from './sitemap';

const DEFAULT_SPACE = { id: 'space-1', kind: 'wiki' as const, routePrefix: null, slug: 'default' };

describe('sitemap route', () => {
  beforeEach(() => {
    socialImageService.resolvePageSocialImage.mockResolvedValue(null);
  });
  it('opts out of static prerendering so the route can be built without a database', () => {
    expect(dynamic).toBe('force-dynamic');
  });

  it('emits the homepage and /pages index ahead of every published page', async () => {
    spacesService.listSpaces.mockResolvedValue([DEFAULT_SPACE]);
    pagesService.listPublished.mockResolvedValue([
      {
        path: 'docs/a',
        slug: 'docs/a',
        title: 'A',
        authorDisplayName: 'Author',
        publishedAt: '2026-06-01T00:00:00.000Z',
        updatedAt: '2026-06-02T00:00:00.000Z',
        contentHtml: '<img src="/api/assets/first">',
      },
      {
        path: 'docs/b',
        slug: 'docs/b',
        title: 'B',
        authorDisplayName: 'Author',
        publishedAt: null,
        updatedAt: '2026-06-03T00:00:00.000Z',
        contentHtml: '<p>No image</p>',
      },
    ]);
    socialImageService.resolvePageSocialImage.mockResolvedValueOnce({
      url: 'https://wiki.example.test/api/assets/first', kind: 'content', alt: null,
    });

    const entries = await sitemap();

    expect(entries[0]).toMatchObject({
      url: 'https://wiki.example.test/',
      lastModified: '2026-06-03T00:00:00.000Z',
    });
    expect(entries[1]).toMatchObject({
      url: 'https://wiki.example.test/pages',
      lastModified: '2026-06-03T00:00:00.000Z',
    });
    // Addressed by the space's resolved route prefix ("wiki" — the default
    // space's own no-prefix fallback), not a bare path.
    expect(entries[2]).toMatchObject({
      url: 'https://wiki.example.test/wiki/docs/a',
      lastModified: '2026-06-02T00:00:00.000Z',
      images: ['https://wiki.example.test/api/assets/first'],
    });
    expect(entries[3]).toMatchObject({
      url: 'https://wiki.example.test/wiki/docs/b',
      lastModified: '2026-06-03T00:00:00.000Z',
    });
    expect(entries[3]).not.toHaveProperty('images');
    expect(pagesService.listPublished).toHaveBeenCalledWith(expect.anything(), {
      spaceSlug: 'default', includeContentHtml: true,
    });
  });

  it('still returns the homepage and /pages index when no pages are published', async () => {
    spacesService.listSpaces.mockResolvedValue([DEFAULT_SPACE]);
    pagesService.listPublished.mockResolvedValue([]);

    const entries = await sitemap();

    expect(entries).toHaveLength(2);
    expect(entries[0]?.url).toBe('https://wiki.example.test/');
    expect(entries[1]?.url).toBe('https://wiki.example.test/pages');
  });

  it('bounds concurrent image resolution and preserves published page order', async () => {
    spacesService.listSpaces.mockResolvedValue([DEFAULT_SPACE]);
    const pages = Array.from({ length: 9 }, (_, index) => ({
      path: `page-${index}`,
      slug: `page-${index}`,
      title: `Page ${index}`,
      authorDisplayName: 'Author',
      publishedAt: null,
      updatedAt: null,
      contentHtml: '<p>Page content</p>',
    }));
    pagesService.listPublished.mockResolvedValue(pages);

    let inFlight = 0;
    let maxInFlight = 0;
    socialImageService.resolvePageSocialImage.mockImplementation(async () => {
      inFlight += 1;
      maxInFlight = Math.max(maxInFlight, inFlight);
      await new Promise<void>((resolve) => setTimeout(resolve, 0));
      inFlight -= 1;
      return null;
    });

    const entries = await sitemap();

    expect(maxInFlight).toBe(4);
    expect(entries.slice(2).map((entry) => entry.url)).toEqual(
      pages.map((page) => `https://wiki.example.test/wiki/${page.slug}`),
    );
  });
});
