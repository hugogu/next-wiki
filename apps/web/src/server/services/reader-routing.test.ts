// @vitest-environment node
import { beforeEach, describe, expect, it, vi } from 'vitest';
import type { LivePage } from '@next-wiki/shared';
import type { SpaceRow } from '@/server/services/spaces';
import type { ServerTranslate } from '@/i18n/server';

const pages = vi.hoisted(() => ({
  getCachedPublicLiveBySlug: vi.fn(),
  getCachedPublicLiveTranslationBySlug: vi.fn(),
  getLiveBySlug: vi.fn(),
  getLiveTranslationBySlug: vi.fn(),
  getReaderAccessStatusBySlug: vi.fn(),
  getCachedPublishedTranslationLocales: vi.fn(),
}));
const spaces = vi.hoisted(() => ({ resolveSpace: vi.fn() }));
const routes = vi.hoisted(() => ({
  resolveSpacePrefix: vi.fn(),
  canonicalSpacePath: vi.fn(),
}));
const addresses = vi.hoisted(() => ({ resolveAddressTarget: vi.fn() }));
const links = vi.hoisted(() => ({ findRetiredLinkTarget: vi.fn() }));

vi.mock('@/server/services/pages', () => pages);
vi.mock('@/server/services/spaces', () => spaces);
vi.mock('@/server/services/space-routes', () => routes);
vi.mock('@/server/services/page-addresses', () => addresses);
vi.mock('@/server/services/link-pages', () => links);

import { buildReaderMetadata, resolveReaderPage, type ResolvedReaderPage } from './reader-routing';

const wiki = { id: 'space-1', slug: 'default', kind: 'wiki', routePrefix: 'wiki' };

describe('resolveReaderPage access outcomes', () => {
  beforeEach(() => {
    vi.clearAllMocks();
    routes.resolveSpacePrefix.mockResolvedValue({ space: wiki, isAlias: false });
    addresses.resolveAddressTarget.mockResolvedValue(null);
    links.findRetiredLinkTarget.mockResolvedValue(null);
  });

  it('reports a published registered page as forbidden to an anonymous visitor', async () => {
    pages.getCachedPublicLiveBySlug.mockResolvedValue(null);
    pages.getReaderAccessStatusBySlug.mockResolvedValue({ kind: 'forbidden', visibility: 'registered' });

    await expect(resolveReaderPage({ actor: { kind: 'anonymous' } }, ['wiki', 'members', 'guide']))
      .resolves.toEqual({ kind: 'forbidden', visibility: 'registered', legacy: false });
  });

  it('reports a protected translation as forbidden instead of falling through to a 404', async () => {
    pages.getCachedPublicLiveTranslationBySlug.mockResolvedValue({ kind: 'forbidden', visibility: 'restricted' });

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
    slug: 'welcome',
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

describe('resolveReaderPage canonical resolution by slug (035)', () => {
  beforeEach(() => {
    vi.clearAllMocks();
    routes.resolveSpacePrefix.mockResolvedValue({ space: wiki, isAlias: false });
    addresses.resolveAddressTarget.mockResolvedValue(null);
    links.findRetiredLinkTarget.mockResolvedValue(null);
  });

  it('resolves an original page by its canonical slug, not its tree path', async () => {
    const page = { pageId: 'p1', slug: 'faq', path: 'support/frequently-asked-questions' };
    pages.getCachedPublicLiveBySlug.mockResolvedValue(page);

    const result = await resolveReaderPage({ actor: { kind: 'anonymous' } }, ['wiki', 'faq']);

    expect(pages.getCachedPublicLiveBySlug).toHaveBeenCalledWith('faq', 'default');
    expect(result).toEqual({ kind: 'original', page, sourcePath: 'faq', space: wiki, legacy: false });
  });

  it('resolves a translation as {locale}/{source-slug}, looking up by the source slug', async () => {
    const translation = { pageId: 'p2', slug: 'faq', path: 'support/frequently-asked-questions' };
    pages.getCachedPublicLiveTranslationBySlug.mockResolvedValue({ kind: 'page', page: translation });

    const result = await resolveReaderPage({ actor: { kind: 'anonymous' } }, ['wiki', 'zh', 'faq']);

    expect(pages.getCachedPublicLiveTranslationBySlug).toHaveBeenCalledWith('zh', 'faq', 'default');
    expect(result).toEqual({ kind: 'translation', page: translation, locale: 'zh', sourcePath: 'faq', space: wiki, legacy: false });
  });

  it('uses a signed-in lookup instead of the cached anonymous one for a non-anonymous actor', async () => {
    const page = { pageId: 'p1', slug: 'faq', path: 'support/faq' };
    pages.getLiveBySlug.mockResolvedValue(page);

    await resolveReaderPage({ actor: { kind: 'user', userId: 'u1', role: 'reader' } }, ['wiki', 'faq']);

    expect(pages.getLiveBySlug).toHaveBeenCalledWith(
      { actor: { kind: 'user', userId: 'u1', role: 'reader' } },
      'faq',
      'default',
    );
    expect(pages.getCachedPublicLiveBySlug).not.toHaveBeenCalled();
  });

  it('returns not_found when no page matches the slug and no legacy fallback resolves', async () => {
    pages.getCachedPublicLiveBySlug.mockResolvedValue(null);
    pages.getReaderAccessStatusBySlug.mockResolvedValue(null);
    addresses.resolveAddressTarget.mockResolvedValue(null);
    links.findRetiredLinkTarget.mockResolvedValue(null);

    await expect(resolveReaderPage({ actor: { kind: 'anonymous' } }, ['wiki', 'unknown-address']))
      .resolves.toEqual({ kind: 'not_found' });
  });
});

describe('resolveReaderPage alias resolution (035, US2)', () => {
  beforeEach(() => {
    vi.clearAllMocks();
    routes.resolveSpacePrefix.mockResolvedValue({ space: wiki, isAlias: false });
    links.findRetiredLinkTarget.mockResolvedValue(null);
  });

  it('301s a retained alias to the page current canonical slug, marked legacy', async () => {
    pages.getCachedPublicLiveBySlug.mockResolvedValue(null);
    pages.getReaderAccessStatusBySlug.mockResolvedValue(null);
    addresses.resolveAddressTarget.mockResolvedValue({ slug: 'faq', locale: null });
    const page = { pageId: 'p1', slug: 'faq', path: 'support/faq' };
    // Re-run of the canonical lookup against the *current* slug.
    pages.getCachedPublicLiveBySlug.mockImplementation((slug: string) => (slug === 'faq' ? page : null));

    const result = await resolveReaderPage({ actor: { kind: 'anonymous' } }, ['wiki', 'old-faq-address']);

    expect(addresses.resolveAddressTarget).toHaveBeenCalledWith('space-1', 'old-faq-address');
    expect(result).toEqual({ kind: 'original', page, sourcePath: 'faq', space: wiki, legacy: true });
  });

  it('301s a locale-prefixed alias to the translation current address', async () => {
    pages.getCachedPublicLiveBySlug.mockResolvedValue(null);
    pages.getReaderAccessStatusBySlug.mockResolvedValue(null);
    addresses.resolveAddressTarget.mockResolvedValue({ slug: 'faq', locale: 'zh' });
    const translation = { pageId: 'p2', slug: 'faq', path: 'support/faq' };
    // Step 2 (the direct lookup) runs first, against the *stale* address
    // segment, and must miss (not_found — no source page has that slug) so
    // the alias fallback below is what resolves.
    pages.getCachedPublicLiveTranslationBySlug.mockImplementation((locale: string, sourceSlug: string) =>
      locale === 'zh' && sourceSlug === 'faq' ? { kind: 'page', page: translation } : { kind: 'not_found' },
    );

    const result = await resolveReaderPage({ actor: { kind: 'anonymous' } }, ['wiki', 'zh', 'old-faq-address']);

    expect(pages.getCachedPublicLiveTranslationBySlug).toHaveBeenCalledWith('zh', 'faq', 'default');
    expect(result).toEqual({ kind: 'translation', page: translation, locale: 'zh', sourcePath: 'faq', space: wiki, legacy: true });
  });

  it('never redirects an alias whose target the caller cannot read — same response as a direct request', async () => {
    pages.getCachedPublicLiveBySlug.mockResolvedValue(null);
    pages.getReaderAccessStatusBySlug.mockResolvedValue(null);
    addresses.resolveAddressTarget.mockResolvedValue({ slug: 'private-doc', locale: null });
    pages.getReaderAccessStatusBySlug.mockImplementation((_ctx: unknown, slug: string) =>
      slug === 'private-doc' ? { kind: 'forbidden', visibility: 'restricted' } : null,
    );

    const result = await resolveReaderPage({ actor: { kind: 'anonymous' } }, ['wiki', 'old-private-address']);

    // No 301 (no `sourcePath`/canonical address disclosed): exactly the
    // forbidden surface a direct request for the target would produce.
    expect(result).toEqual({ kind: 'forbidden', visibility: 'restricted', legacy: true });
  });
});
