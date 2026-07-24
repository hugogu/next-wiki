// @vitest-environment node
import { beforeEach, describe, expect, it, vi } from 'vitest';

const pageService = vi.hoisted(() => ({
  getCachedPublicLivePage: vi.fn(),
  getCachedPublicLiveTranslation: vi.fn(),
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

vi.mock('@/server/services/pages', () => pageService);
vi.mock('@/server/services/public-content', () => publicContent);
vi.mock('@/server/db', () => ({ default: db, db }));
vi.mock('@/server/content-store/read-router', () => ({ readMarkdownFromDatabase }));
vi.mock('@/server/services/writing-mode', () => ({ isLlmWikiMode }));

import { getSpaceRawMarkdown, getWikiRawMarkdown, MARKDOWN_CONTENT_TYPE_HEADER } from './raw-markdown-export';

function revision(overrides: { contentType?: string; contentSource?: string | null } = {}) {
  return {
    id: 'rev-1',
    contentType: overrides.contentType ?? 'text/markdown',
    contentSource: overrides.contentSource ?? null,
  };
}

describe('getWikiRawMarkdown', () => {
  beforeEach(() => {
    vi.clearAllMocks();
  });

  it('returns 404 when the page does not exist', async () => {
    pageService.getCachedPublicLivePage.mockResolvedValue(null);
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

  it('returns unsupported for a non-markdown revision', async () => {
    pageService.getCachedPublicLivePage.mockResolvedValue({
      revisionId: 'rev-1',
      title: 'Foo',
    });
    db.query.pageRevisions.findFirst.mockResolvedValue(revision({ contentType: 'application/json' }));

    const result = await getWikiRawMarkdown(['foo']);
    expect(result).toEqual({ kind: 'unsupported', contentType: 'application/json' });
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
    expect(MARKDOWN_CONTENT_TYPE_HEADER).toBe('text/markdown; charset=utf-8');
  });
});
