// @vitest-environment node
import { beforeEach, describe, expect, it, vi } from 'vitest';

const pageService = vi.hoisted(() => ({
  getCachedPublicLivePage: vi.fn(),
  getCachedPublicLiveTranslation: vi.fn(),
  getReaderAccessStatus: vi.fn(),
}));

const publicContent = vi.hoisted(() => ({
  getPageByPath: vi.fn(),
}));

const db = vi.hoisted(() => ({
  query: {
    pageRevisions: { findFirst: vi.fn() },
  },
}));

const readMarkdownFromDatabase = vi.hoisted(() => vi.fn());
const isLlmWikiMode = vi.hoisted(() => vi.fn());
const translationLocales = vi.hoisted(() => ({
  getReservedLocalePrefixes: vi.fn(),
  isReservedLocalePrefix: vi.fn(),
}));
const readerRouting = vi.hoisted(() => ({ resolveReaderPage: vi.fn() }));

vi.mock('@/server/services/pages', () => pageService);
vi.mock('@/server/services/reader-routing', () => readerRouting);
vi.mock('@/server/services/public-content', () => publicContent);
vi.mock('@/server/db', () => ({ default: db, db }));
vi.mock('@/server/content-store/read-router', () => ({ readMarkdownFromDatabase }));
vi.mock('@/server/services/writing-mode', () => ({ isLlmWikiMode }));
vi.mock('@/server/services/translation-locales', () => translationLocales);

import { getSpaceRawMarkdown, getWikiRawMarkdown, MARKDOWN_CONTENT_TYPE_HEADER, UNSUPPORTED_STATUS_CODE } from './raw-markdown-export';

function revision(overrides: { contentType?: string; contentSource?: string | null } = {}) {
  return {
    id: 'rev-1',
    contentType: overrides.contentType ?? 'text/markdown',
    contentSource: overrides.contentSource ?? null,
  };
}

describe('getWikiRawMarkdown by public address (035)', () => {
  const space = { id: 'space-1', slug: 'default', kind: 'wiki', routePrefix: 'wiki' };

  function resolvedOriginal(overrides: { legacy?: boolean } = {}) {
    return {
      kind: 'original',
      page: { revisionId: 'rev-1', title: 'Foo' },
      sourcePath: 'foo',
      space,
      legacy: overrides.legacy ?? false,
    };
  }

  beforeEach(() => {
    vi.clearAllMocks();
    db.query.pageRevisions.findFirst.mockResolvedValue(revision({ contentSource: '# Foo\n' }));
    readMarkdownFromDatabase.mockResolvedValue('# Foo\n');
  });

  it('serves the revision of the page the reader resolves for a space prefix and slug', async () => {
    readerRouting.resolveReaderPage.mockResolvedValue(resolvedOriginal());

    const result = await getWikiRawMarkdown(['wiki', 'foo']);

    expect(result).toEqual({ kind: 'ok', content: '# Foo\n', title: 'Foo' });
    expect(readerRouting.resolveReaderPage).toHaveBeenCalledWith(
      expect.objectContaining({ actor: { kind: 'anonymous' } }),
      ['wiki', 'foo'],
    );
    expect(pageService.getCachedPublicLivePage).not.toHaveBeenCalled();
  });

  it('serves a published translation the reader resolves from a locale and source slug', async () => {
    readerRouting.resolveReaderPage.mockResolvedValue({
      kind: 'translation',
      page: { revisionId: 'rev-zh', title: 'Foo Zh' },
      locale: 'zh',
      sourcePath: 'foo',
      space,
      legacy: false,
    });
    db.query.pageRevisions.findFirst.mockResolvedValue(revision({ contentSource: '# Foo Zh\n' }));
    readMarkdownFromDatabase.mockResolvedValue('# Foo Zh\n');

    await expect(getWikiRawMarkdown(['wiki', 'zh', 'foo'])).resolves.toEqual({
      kind: 'ok',
      content: '# Foo Zh\n',
      title: 'Foo Zh',
    });
    expect(db.query.pageRevisions.findFirst).toHaveBeenCalledTimes(1);
  });

  it('serves the target directly for a retained alias or legacy address instead of redirecting', async () => {
    readerRouting.resolveReaderPage.mockResolvedValue(resolvedOriginal({ legacy: true }));

    await expect(getWikiRawMarkdown(['wiki', 'old-slug'])).resolves.toEqual({
      kind: 'ok',
      content: '# Foo\n',
      title: 'Foo',
    });
  });

  // Next hands the route already-decoded segments and the resolver decodes its
  // input again, so a literal `%` has to be re-encoded or the resolver throws.
  it('re-encodes the already-decoded segments for the reader resolver', async () => {
    readerRouting.resolveReaderPage.mockResolvedValue(resolvedOriginal());

    await getWikiRawMarkdown(['wiki', '100%zz', 'release notes']);

    expect(readerRouting.resolveReaderPage).toHaveBeenCalledWith(expect.anything(), [
      'wiki',
      '100%25zz',
      'release%20notes',
    ]);
  });

  it('answers not found rather than throwing for a literal percent sign that matches no page', async () => {
    // Stand-in for the real resolver, which decodes its input like the reader does.
    readerRouting.resolveReaderPage.mockImplementation(async (_ctx: unknown, segments: string[]) => {
      segments.forEach((segment) => decodeURIComponent(segment));
      return { kind: 'not_found' };
    });
    pageService.getCachedPublicLivePage.mockResolvedValue(null);
    pageService.getReaderAccessStatus.mockResolvedValue(null);

    await expect(getWikiRawMarkdown(['wiki', 'a%zz'])).resolves.toEqual({ kind: 'not_found' });
  });

  it('returns unsupported for a non-markdown revision', async () => {
    readerRouting.resolveReaderPage.mockResolvedValue(resolvedOriginal());
    db.query.pageRevisions.findFirst.mockResolvedValue(revision({ contentType: 'application/json' }));

    await expect(getWikiRawMarkdown(['wiki', 'foo'])).resolves.toEqual({
      kind: 'unsupported',
      contentType: 'application/json',
    });
  });

  it('reports an unpublished translation as unavailable without trying tree-path addresses', async () => {
    readerRouting.resolveReaderPage.mockResolvedValue({
      kind: 'unavailable',
      locale: 'zh',
      sourcePath: 'foo',
      space,
      legacy: false,
    });

    await expect(getWikiRawMarkdown(['wiki', 'zh', 'foo'])).resolves.toEqual({ kind: 'unavailable' });
    expect(pageService.getCachedPublicLivePage).not.toHaveBeenCalled();
    expect(pageService.getCachedPublicLiveTranslation).not.toHaveBeenCalled();
  });

  it('reports a page the anonymous reader may not see as forbidden without trying tree-path addresses', async () => {
    readerRouting.resolveReaderPage.mockResolvedValue({ kind: 'forbidden', visibility: 'registered', legacy: false });

    await expect(getWikiRawMarkdown(['wiki', 'members', 'guide'])).resolves.toEqual({ kind: 'forbidden' });
    expect(pageService.getCachedPublicLivePage).not.toHaveBeenCalled();
    expect(pageService.getReaderAccessStatus).not.toHaveBeenCalled();
  });
});

// Before slug routing (035) a page's `.md` address was its tree path. When the
// reader resolves nothing for an address, those older links must keep working.
describe('getWikiRawMarkdown legacy tree-path fallback', () => {
  beforeEach(() => {
    vi.clearAllMocks();
    translationLocales.getReservedLocalePrefixes.mockResolvedValue(new Set(['zh']));
    translationLocales.isReservedLocalePrefix.mockImplementation((_, segment) => segment === 'zh');
    readerRouting.resolveReaderPage.mockResolvedValue({ kind: 'not_found' });
  });

  it('returns 404 when the page does not exist', async () => {
    pageService.getCachedPublicLivePage.mockResolvedValue(null);
    pageService.getReaderAccessStatus.mockResolvedValue(null);
    const result = await getWikiRawMarkdown(['foo']);
    expect(result).toEqual({ kind: 'not_found' });
  });

  it('returns markdown for a published original page', async () => {
    pageService.getCachedPublicLivePage.mockResolvedValue({
      revisionId: 'rev-1',
      title: 'Foo',
    });
    db.query.pageRevisions.findFirst.mockResolvedValue(revision({ contentSource: '# Foo\n' }));
    readMarkdownFromDatabase.mockResolvedValue('# Foo\n');

    const result = await getWikiRawMarkdown(['foo']);
    expect(result).toEqual({ kind: 'ok', content: '# Foo\n', title: 'Foo' });
  });

  it('prefers a published translation when the first segment is a locale', async () => {
    pageService.getCachedPublicLiveTranslation.mockResolvedValue({
      kind: 'page',
      page: { revisionId: 'rev-zh', title: 'Foo Zh' },
    });
    db.query.pageRevisions.findFirst.mockResolvedValue(revision({ contentSource: '# Foo Zh\n' }));
    readMarkdownFromDatabase.mockResolvedValue('# Foo Zh\n');

    const result = await getWikiRawMarkdown(['zh', 'foo']);
    expect(result).toEqual({ kind: 'ok', content: '# Foo Zh\n', title: 'Foo Zh' });
    expect(pageService.getCachedPublicLivePage).not.toHaveBeenCalled();
  });

  it('falls back to original resolution when translation is not found', async () => {
    pageService.getCachedPublicLiveTranslation.mockResolvedValue({ kind: 'not_found' });
    pageService.getCachedPublicLivePage.mockResolvedValue({
      revisionId: 'rev-1',
      title: 'Foo',
    });
    db.query.pageRevisions.findFirst.mockResolvedValue(revision({ contentSource: '# Foo\n' }));
    readMarkdownFromDatabase.mockResolvedValue('# Foo\n');

    const result = await getWikiRawMarkdown(['zh', 'foo']);
    expect(result).toEqual({ kind: 'ok', content: '# Foo\n', title: 'Foo' });
    expect(pageService.getCachedPublicLivePage).toHaveBeenCalledWith('zh/foo');
  });

  it('returns unavailable when a translation exists but is not published', async () => {
    pageService.getCachedPublicLiveTranslation.mockResolvedValue({ kind: 'unavailable', sourcePath: 'foo' });
    const result = await getWikiRawMarkdown(['zh', 'foo']);
    expect(result).toEqual({ kind: 'unavailable' });
  });

  it('returns forbidden when an anonymous reader requests a registered page', async () => {
    pageService.getCachedPublicLivePage.mockResolvedValue(null);
    pageService.getReaderAccessStatus.mockResolvedValue({ kind: 'forbidden', visibility: 'registered' });

    await expect(getWikiRawMarkdown(['members', 'guide'])).resolves.toEqual({ kind: 'forbidden' });
  });

  it('returns unsupported for a non-markdown revision', async () => {
    pageService.getCachedPublicLivePage.mockResolvedValue({
      revisionId: 'rev-1',
      title: 'Foo',
    });
    db.query.pageRevisions.findFirst.mockResolvedValue(revision({ contentType: 'application/json' }));

    const result = await getWikiRawMarkdown(['foo']);
    expect(result).toEqual({ kind: 'unsupported', contentType: 'application/json' });
  });

  it('looks the tree path up with the segments as received, without decoding them again', async () => {
    pageService.getCachedPublicLivePage.mockResolvedValue(null);
    pageService.getReaderAccessStatus.mockResolvedValue(null);

    await getWikiRawMarkdown(['docs', '100%zz']);

    expect(pageService.getCachedPublicLivePage).toHaveBeenCalledWith('docs/100%zz');
  });
});

describe('getSpaceRawMarkdown', () => {
  beforeEach(() => {
    vi.clearAllMocks();
    isLlmWikiMode.mockResolvedValue(true);
  });

  const adminActor = { kind: 'user' as const, userId: 'admin-1', role: 'admin' as const };
  const editorActor = { kind: 'user' as const, userId: 'editor-1', role: 'editor' as const };
  const anonymousActor = { kind: 'anonymous' as const };

  it('returns 404 for the wiki space pseudo-path', async () => {
    const result = await getSpaceRawMarkdown('wiki', 'foo', adminActor);
    expect(result).toEqual({ kind: 'not_found' });
  });

  it('returns forbidden for non-admin users', async () => {
    const result = await getSpaceRawMarkdown('generated', 'foo', editorActor);
    expect(result).toEqual({ kind: 'forbidden' });
  });

  it('returns forbidden for anonymous users', async () => {
    const result = await getSpaceRawMarkdown('generated', 'foo', anonymousActor);
    expect(result).toEqual({ kind: 'forbidden' });
  });

  it('returns forbidden when LLM Wiki mode is off', async () => {
    isLlmWikiMode.mockResolvedValue(false);
    const result = await getSpaceRawMarkdown('generated', 'foo', adminActor);
    expect(result).toEqual({ kind: 'forbidden' });
  });

  it('returns markdown for a generated page', async () => {
    publicContent.getPageByPath.mockResolvedValue({
      status: 'published',
      title: 'Generated Foo',
      contentSource: '# Generated\n',
      latestRevision: { contentType: 'text/markdown' },
    });
    const result = await getSpaceRawMarkdown('generated', 'foo', adminActor);
    expect(result).toEqual({ kind: 'ok', content: '# Generated\n', title: 'Generated Foo' });
  });

  it('returns markdown for a raw markdown entry', async () => {
    publicContent.getPageByPath.mockResolvedValue({
      status: 'published',
      title: 'Raw Foo',
      contentSource: '# Raw\n',
      latestRevision: { contentType: 'text/markdown' },
    });
    const result = await getSpaceRawMarkdown('raw', 'foo', adminActor);
    expect(result).toEqual({ kind: 'ok', content: '# Raw\n', title: 'Raw Foo' });
  });

  it('returns unsupported for a raw non-markdown entry', async () => {
    publicContent.getPageByPath.mockResolvedValue({
      status: 'published',
      title: 'Raw Image',
      contentSource: '',
      latestRevision: { contentType: 'image/png' },
    });
    const result = await getSpaceRawMarkdown('raw', 'image', adminActor);
    expect(result).toEqual({ kind: 'unsupported', contentType: 'image/png' });
  });

  it('returns 404 when the page does not exist', async () => {
    publicContent.getPageByPath.mockResolvedValue(null);
    const result = await getSpaceRawMarkdown('generated', 'missing', adminActor);
    expect(result).toEqual({ kind: 'not_found' });
  });

  it('returns 404 when the page is deleted', async () => {
    publicContent.getPageByPath.mockResolvedValue({ status: 'deleted' });
    const result = await getSpaceRawMarkdown('generated', 'deleted', adminActor);
    expect(result).toEqual({ kind: 'not_found' });
  });
});

describe('raw-markdown-export constants', () => {
  it('uses 415 for unsupported content type', () => {
    expect(UNSUPPORTED_STATUS_CODE).toBe(415);
  });

  it('sets the markdown content type header', () => {
    expect(MARKDOWN_CONTENT_TYPE_HEADER).toBe('text/markdown; charset=utf-8');
  });
});
