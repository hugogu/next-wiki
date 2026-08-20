// @vitest-environment node
import { beforeEach, describe, expect, it, vi } from 'vitest';
import type { LivePage } from '@next-wiki/shared';
import type { SpaceRow } from '@/server/services/spaces';
import type { ServerTranslate } from '@/i18n/server';

const pages = vi.hoisted(() => ({
  getCachedPublicLivePage: vi.fn(),
  getCachedPublicLiveTranslation: vi.fn(),
  getLive: vi.fn(),
  getLiveTranslation: vi.fn(),
  getReaderAccessStatus: vi.fn(),
  getCachedPublishedTranslationLocales: vi.fn(),
}));
const spaces = vi.hoisted(() => ({ resolveSpace: vi.fn() }));
const routes = vi.hoisted(() => ({
  resolveSpacePrefix: vi.fn(),
  findPageRouteRedirectTarget: vi.fn(),
  canonicalSpacePath: vi.fn(),
}));
const links = vi.hoisted(() => ({ findRetiredLinkTarget: vi.fn() }));

vi.mock('@/server/services/pages', () => pages);
vi.mock('@/server/services/spaces', () => spaces);
vi.mock('@/server/services/space-routes', () => routes);
vi.mock('@/server/services/link-pages', () => links);

import { buildReaderMetadata, resolveReaderPage, type ResolvedReaderPage } from './reader-routing';

const wiki = { id: 'space-1', slug: 'default', kind: 'wiki', routePrefix: 'wiki' };

describe('resolveReaderPage access outcomes', () => {
  beforeEach(() => {
    vi.clearAllMocks();
    routes.resolveSpacePrefix.mockResolvedValue({ space: wiki, isAlias: false });
    routes.findPageRouteRedirectTarget.mockResolvedValue(null);
    links.findRetiredLinkTarget.mockResolvedValue(null);
  });

  it('reports a published registered page as forbidden to an anonymous visitor', async () => {
    pages.getCachedPublicLivePage.mockResolvedValue(null);
    pages.getReaderAccessStatus.mockResolvedValue({ kind: 'forbidden', visibility: 'registered' });

    await expect(resolveReaderPage({ actor: { kind: 'anonymous' } }, ['wiki', 'members', 'guide']))
      .resolves.toEqual({ kind: 'forbidden', visibility: 'registered', legacy: false });
  });

  it('reports a protected translation as forbidden instead of falling through to a 404', async () => {
    pages.getCachedPublicLiveTranslation.mockResolvedValue({ kind: 'forbidden', visibility: 'restricted' });

    await expect(resolveReaderPage({ actor: { kind: 'anonymous' } }, ['wiki', 'zh', 'members', 'guide']))
      .resolves.toEqual({ kind: 'forbidden', visibility: 'restricted', legacy: false });
  });
});

describe('buildReaderMetadata', () => {
  const t = ((key: string) => key) as unknown as ServerTranslate;
  const baseOptions = { siteUrl: 'https://wiki.example', locale: 'en', t, fallbackTitle: 'wiki/missing', indexable: true };
  const page: LivePage = {
    pageId: 'page-1',
    revisionId: 'rev-1',
    path: 'welcome',
    title: 'Welcome',
    contentHtml: '<p>Hello world.</p>',
    contentHash: 'hash',
    version: 1,
    publishedAt: '2026-01-01T00:00:00.000Z',
    authorDisplayName: 'Ada',
    authorId: 'user-1',
    visibility: 'public',
    status: 'published',
    createdAt: '2026-01-01T00:00:00.000Z',
    metadata: { date: null, summary: null, tags: [] },
  };
  const resolvedOriginal: ResolvedReaderPage = {
    kind: 'original',
    page,
    sourcePath: 'welcome',
    space: wiki as unknown as SpaceRow,
    legacy: false,
  };

  beforeEach(() => {
    vi.clearAllMocks();
    routes.canonicalSpacePath.mockImplementation((_space: unknown, path?: string, locale?: string | null) =>
      `/${['wiki', locale, path].filter(Boolean).join('/')}`);
    pages.getCachedPublishedTranslationLocales.mockResolvedValue([]);
  });

  it('falls back to the route-derived title and keeps the page unindexed when the page cannot be resolved', async () => {
    const metadata = await buildReaderMetadata({ kind: 'not_found' }, baseOptions);
    expect(metadata).toEqual({ title: 'wiki/missing', robots: { index: false, follow: true } });
  });

  it('does not set a canonical for a page that has no published revision yet', async () => {
    const metadata = await buildReaderMetadata(
      { ...resolvedOriginal, page: { ...page, status: 'draft' } },
      baseOptions,
    );
    expect(metadata).toEqual({ title: 'Welcome', robots: { index: false, follow: true } });
  });

  it('builds a page-specific canonical URL, title, and description for a published page', async () => {
    const metadata = await buildReaderMetadata(resolvedOriginal, baseOptions);

    expect(metadata.title).toBe('Welcome');
    expect(metadata.description).toBe('Hello world.');
    expect(metadata.alternates?.canonical).toBe('https://wiki.example/wiki/welcome');
    expect(metadata.openGraph).toMatchObject({ url: 'https://wiki.example/wiki/welcome', title: 'Welcome' });
    expect(metadata.robots).toEqual({ index: true, follow: true });
  });

  // Regression test: the authenticated-user proxy route (registered-reader)
  // must still get the real page's canonical/title/description even though
  // its metadata always stays noindex — see apps/web/app/(user)/registered-reader.
  it('keeps robots noindex,nofollow for a non-indexable route while still populating the real canonical URL', async () => {
    const metadata = await buildReaderMetadata(resolvedOriginal, { ...baseOptions, indexable: false });

    expect(metadata.alternates?.canonical).toBe('https://wiki.example/wiki/welcome');
    expect(metadata.title).toBe('Welcome');
    expect(metadata.robots).toEqual({ index: false, follow: false });
  });
});
