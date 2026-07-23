import { describe, expect, it, vi } from 'vitest';

// The read tools delegate to the permission-scoped public-content service and
// must (1) forward the caller's ctx, (2) return exactly what the service — which
// already filters by permission — returns, and (3) turn a not-visible page into
// a safe failure that never leaks the restricted content. Real end-to-end
// projection over seeded pages is covered by the Scenario-2 Playwright e2e.
const content = vi.hoisted(() => ({
  searchPages: vi.fn(),
  getPageById: vi.fn(),
  getPageByPath: vi.fn(),
  listPages: vi.fn(),
  getBacklinks: vi.fn(),
  getNeighborhood: vi.fn(),
  createPage: vi.fn(),
  createDraft: vi.fn(),
  updateProperties: vi.fn(),
  updatePageMetadata: vi.fn(),
  setPageTags: vi.fn(),
}));
vi.mock('@/server/services/public-content', () => content);
vi.mock('@/server/services/tags', () => ({
  listTags: vi.fn(),
  createTag: vi.fn(),
  requestTagMutation: vi.fn(),
  requestTagMerge: vi.fn(),
}));

import { buildUserCtx } from '@/server/permissions';
import { executeTool } from '@/server/services/ai-tool-executors';
import { getToolDefinition } from '@/server/services/ai-tool-registry';

const searchTool = getToolDefinition('search_wiki')!;
const getPageTool = getToolDefinition('get_page')!;
const listPagesTool = getToolDefinition('list_pages')!;
const createPageTool = getToolDefinition('create_page')!;
const saveDraftTool = getToolDefinition('save_draft')!;
const readerCtx = buildUserCtx('reader-1', 'reader');
const adminCtx = buildUserCtx('admin-1', 'admin');
const execCtx = {
  actorUserId: 'reader-1',
  effectiveReview: 'none' as const,
  workflowId: '00000000-0000-0000-0000-000000000000',
  toolCallId: '00000000-0000-0000-0000-000000000000',
  actionId: '00000000-0000-0000-0000-000000000000',
};
const publishedRevision = { id: '11111111-1111-4111-8111-111111111111', contentHash: 'hash-1111' };

describe('read tool permission projection (026)', () => {
  it('forwards the caller ctx and returns only the pages the service allowed', async () => {
    content.searchPages.mockResolvedValue({
      items: [{
        page: {
          id: 'p1',
          path: 'docs/public',
          title: 'Public',
          locale: 'en',
          spaceSlug: 'default',
          publishedRevision,
        },
      }],
      nextCursor: null,
    });
    const result = await executeTool(readerCtx, searchTool, { query: 'payment' }, execCtx);
    expect(content.searchPages).toHaveBeenCalledWith(
      readerCtx,
      expect.objectContaining({ q: 'payment', include: ['publishedRevision'] }),
    );
    expect(result.ok).toBe(true);
    expect((result.data as { items: unknown[] }).items).toEqual([
      {
        pageId: 'p1',
        path: 'docs/public',
        title: 'Public',
        locale: 'en',
        spaceSlug: 'default',
        revisionId: publishedRevision.id,
        revisionHash: publishedRevision.contentHash,
      },
    ]);
  });

  it('turns a not-visible page into a safe failure without leaking its content', async () => {
    // The service returns null for a reader who may not read the restricted page.
    content.getPageById.mockResolvedValue(null);
    const result = await executeTool(readerCtx, getPageTool, { pageId: '11111111-1111-1111-1111-111111111111' }, execCtx);
    expect(result.ok).toBe(false);
    expect(result.errorCode).toBe('NOT_FOUND');
    expect(JSON.stringify(result)).not.toContain('Secret');
  });

  it('returns the page to a caller the service allows', async () => {
    content.getPageById.mockResolvedValue({
      id: 'p2',
      path: 'secret',
      title: 'Secret',
      locale: 'en',
      spaceSlug: 'default',
      publishedRevision,
      contentSource: 'body',
    });
    const result = await executeTool(adminCtx, getPageTool, { pageId: '22222222-2222-2222-2222-222222222222' }, execCtx);
    expect(content.getPageById).toHaveBeenCalledWith(adminCtx, '22222222-2222-2222-2222-222222222222', ['publishedRevision']);
    expect(result.ok).toBe(true);
    expect(result.data).toMatchObject({
      title: 'Secret',
      revisionId: publishedRevision.id,
      revisionHash: publishedRevision.contentHash,
    });
  });

  it('accepts path as the list_pages subtree alias', async () => {
    content.listPages.mockResolvedValue({
      items: [{
        id: 'p3',
        path: 'history/china/chronology',
        title: 'Chronology',
        locale: 'en',
        spaceSlug: 'default',
        publishedRevision,
      }],
      nextCursor: null,
    });
    const result = await executeTool(readerCtx, listPagesTool, { path: 'history/china/chronology' }, execCtx);
    expect(content.listPages).toHaveBeenCalledWith(readerCtx, expect.objectContaining({
      pathPrefix: 'history/china/chronology',
      status: 'published',
      include: ['publishedRevision'],
    }));
    expect(result.ok).toBe(true);
    expect((result.data as { items: unknown[] }).items).toEqual([
      {
        pageId: 'p3',
        path: 'history/china/chronology',
        title: 'Chronology',
        locale: 'en',
        spaceSlug: 'default',
        revisionId: publishedRevision.id,
        revisionHash: publishedRevision.contentHash,
      },
    ]);
  });

  it('lists pages when list_pages is called without arguments', async () => {
    content.listPages.mockResolvedValue({ items: [], nextCursor: null });
    const result = await executeTool(readerCtx, listPagesTool, undefined, execCtx);
    expect(content.listPages).toHaveBeenCalledWith(
      readerCtx,
      expect.objectContaining({ limit: 100, include: ['publishedRevision'] }),
    );
    expect(result.ok).toBe(true);
  });

  it('accepts a model-requested page limit above the old 20-item cap', async () => {
    content.listPages.mockResolvedValue({ items: [], nextCursor: null });
    const result = await executeTool(readerCtx, listPagesTool, { pathPrefix: 'history/china', limit: 30 }, execCtx);
    expect(content.listPages).toHaveBeenCalledWith(
      readerCtx,
      expect.objectContaining({ pathPrefix: 'history/china', limit: 30 }),
    );
    expect(result.ok).toBe(true);
  });

  it('accepts content as a create_page alias without creating an empty draft', async () => {
    content.createPage.mockResolvedValue({
      id: 'page-created',
      path: 'history/china/figures/zhang-fei',
      title: '张飞',
    });
    const result = await executeTool(adminCtx, createPageTool, {
      path: 'history/china/figures/zhang-fei',
      title: '张飞',
      content: '# 张飞\n\n蜀汉名将。',
    }, { ...execCtx, actorUserId: 'admin-1', effectiveReview: 'admin_review' });
    expect(content.createPage).toHaveBeenCalledWith(adminCtx, {
      path: 'history/china/figures/zhang-fei',
      title: '张飞',
      contentSource: '# 张飞\n\n蜀汉名将。',
      nature: 'generated',
      space: 'generated',
    });
    expect(result.ok).toBe(true);
  });

  it('falls back to the default space for non-admin actors', async () => {
    const editorCtx = buildUserCtx('editor-1', 'editor');
    content.createPage.mockResolvedValue({
      id: 'page-editor',
      path: 'drafts/test',
      title: 'Test',
    });
    const result = await executeTool(editorCtx, createPageTool, {
      path: 'drafts/test',
      title: 'Test',
      contentSource: '# Test',
    }, { ...execCtx, actorUserId: 'editor-1', effectiveReview: 'none' });
    expect(content.createPage).toHaveBeenCalledWith(editorCtx, expect.objectContaining({
      space: 'default',
      nature: 'generated',
    }));
    expect(result.ok).toBe(true);
  });

  it('keeps the existing page title when a save_draft call supplies only replacement content', async () => {
    content.getPageById.mockResolvedValue({ id: 'page-sun-quan', title: '孙权' });
    content.createDraft.mockResolvedValue({ version: 3 });

    const result = await executeTool(adminCtx, saveDraftTool, {
      pageId: '33333333-3333-4333-8333-333333333333',
      contentSource: '# 孙权\n\nExpanded content.',
    }, { ...execCtx, actorUserId: 'admin-1', effectiveReview: 'none' });

    expect(content.createDraft).toHaveBeenCalledWith(adminCtx, '33333333-3333-4333-8333-333333333333', {
      title: '孙权',
      contentSource: '# 孙权\n\nExpanded content.',
    });
    expect(result).toMatchObject({ ok: true, summary: 'Saved draft revision v3.' });
  });
});
