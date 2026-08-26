import { describe, expect, it, vi } from 'vitest';

// The read tools delegate to permission-scoped services and must (1) forward
// the caller's ctx, (2) return exactly what the service — which already
// filters by permission — returns, and (3) turn a not-visible page into a safe
// failure that never leaks restricted content. Real end-to-end projection over
// seeded pages is covered by the Scenario-2 Playwright e2e.
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
const database = vi.hoisted(() => ({
  query: { pages: { findFirst: vi.fn() } },
  select: vi.fn(),
}));
const spaceService = vi.hoisted(() => ({ listSpaces: vi.fn() }));
const wikiSearch = vi.hoisted(() => ({ searchWikiSources: vi.fn() }));
vi.mock('@/server/services/public-content', () => content);
vi.mock('@/server/ai/retrieval/wiki-question-sources', () => wikiSearch);
vi.mock('@/server/db', () => ({ db: database }));
vi.mock('@/server/services/spaces', () => spaceService);
vi.mock('@/server/services/tags', () => ({
  listTags: vi.fn(),
  createTag: vi.fn(),
  requestTagMutation: vi.fn(),
  requestTagMerge: vi.fn(),
}));

import { buildUserCtx } from '@/server/permissions';
import { executeTool, restoreJsonEscapedBackslashes } from '@/server/services/ai-tool-executors';
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
    wikiSearch.searchWikiSources.mockResolvedValue([
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
    const result = await executeTool(readerCtx, searchTool, { query: 'payment' }, execCtx);
    expect(wikiSearch.searchWikiSources).toHaveBeenCalledWith(
      expect.objectContaining({
        ctx: readerCtx,
        actionId: execCtx.actionId,
        query: 'payment',
        options: expect.objectContaining({ limit: 10 }),
      }),
    );
    expect(result.ok).toBe(true);
    expect((result.data as { items: unknown[] }).items).toEqual([
      {
        pageId: 'p1',
        path: 'docs/public',
        title: 'Public',
        locale: 'en',
        spaceSlug: 'wiki',
        revisionId: publishedRevision.id,
        revisionHash: publishedRevision.contentHash,
      },
    ]);
  });

  it('forwards MCP-compatible search scope and content-space filters', async () => {
    wikiSearch.searchWikiSources.mockResolvedValue([]);

    const result = await executeTool(
      readerCtx,
      searchTool,
      {
        query: 'zhuge-liang',
        scope: 'content',
        space: 'generated',
        createdStart: '2026-07-01T00:00:00.000Z',
        createdEnd: '2026-07-02T00:00:00.000Z',
        order: 'createdAtDesc',
      },
      execCtx,
    );

    expect(result.ok).toBe(true);
    expect(wikiSearch.searchWikiSources).toHaveBeenCalledWith({
      ctx: readerCtx,
      actionId: execCtx.actionId,
      query: 'zhuge-liang',
      options: {
        scope: 'content',
        space: 'generated',
        createdStart: new Date('2026-07-01T00:00:00.000Z'),
        createdEnd: new Date('2026-07-02T00:00:00.000Z'),
        order: 'createdAtDesc',
        limit: 10,
      },
    });
  });

  it('retains the original unexpected error for the expandable tool result', async () => {
    wikiSearch.searchWikiSources.mockRejectedValue(
      new Error('Invariant: static generation store missing'),
    );

    const result = await executeTool(readerCtx, searchTool, { query: 'zhuge-liang' }, execCtx);

    expect(result).toMatchObject({
      ok: false,
      errorCode: 'TOOL_FAILED',
      errorMessage: 'The tool could not complete.',
      errorDetail: 'Error: Invariant: static generation store missing',
    });
  });

  it('turns a not-visible page into a safe failure without leaking its content', async () => {
    // The service returns null for a reader who may not read the restricted page.
    content.getPageById.mockResolvedValue(null);
    const result = await executeTool(
      readerCtx,
      getPageTool,
      { pageId: '11111111-1111-1111-1111-111111111111' },
      execCtx,
    );
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
    const result = await executeTool(
      adminCtx,
      getPageTool,
      { pageId: '22222222-2222-2222-2222-222222222222' },
      execCtx,
    );
    expect(content.getPageById).toHaveBeenCalledWith(
      adminCtx,
      '22222222-2222-2222-2222-222222222222',
      ['publishedRevision'],
    );
    expect(result.ok).toBe(true);
    expect(result.data).toMatchObject({
      title: 'Secret',
      revisionId: publishedRevision.id,
      revisionHash: publishedRevision.contentHash,
    });
  });

  it('accepts path as the list_pages subtree alias', async () => {
    content.listPages.mockResolvedValue({
      items: [
        {
          id: 'p3',
          path: 'history/china/chronology',
          title: 'Chronology',
          locale: 'en',
          spaceSlug: 'wiki',
          publishedRevision,
        },
      ],
      nextCursor: null,
    });
    const result = await executeTool(
      readerCtx,
      listPagesTool,
      { path: 'history/china/chronology' },
      execCtx,
    );
    expect(content.listPages).toHaveBeenCalledWith(
      readerCtx,
      expect.objectContaining({
        pathPrefix: 'history/china/chronology',
        status: 'published',
        include: ['publishedRevision'],
      }),
    );
    expect(result.ok).toBe(true);
    expect((result.data as { items: unknown[] }).items).toEqual([
      {
        pageId: 'p3',
        path: 'history/china/chronology',
        title: 'Chronology',
        locale: 'en',
        spaceSlug: 'wiki',
        revisionId: publishedRevision.id,
        revisionHash: publishedRevision.contentHash,
      },
    ]);
  });

  it('forwards list_pages creation-time filters and chronological order', async () => {
    content.listPages.mockResolvedValue({ items: [], nextCursor: null });

    await executeTool(
      readerCtx,
      listPagesTool,
      {
        space: 'raw',
        createdStart: '2026-07-01T00:00:00.000Z',
        createdEnd: '2026-07-02T00:00:00.000Z',
        order: 'createdAtDesc',
      },
      execCtx,
    );

    expect(content.listPages).toHaveBeenCalledWith(
      readerCtx,
      expect.objectContaining({
        space: 'raw',
        createdStart: new Date('2026-07-01T00:00:00.000Z'),
        createdEnd: new Date('2026-07-02T00:00:00.000Z'),
        order: 'createdAtDesc',
      }),
    );
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
    const result = await executeTool(
      readerCtx,
      listPagesTool,
      { pathPrefix: 'history/china', limit: 30 },
      execCtx,
    );
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
      slug: 'history/china/figures/zhang-fei',
      title: '张飞',
    });
    const result = await executeTool(
      adminCtx,
      createPageTool,
      {
        path: 'history/china/figures/zhang-fei',
        title: '张飞',
        content: '# 张飞\n\n蜀汉名将。',
      },
      { ...execCtx, actorUserId: 'admin-1', effectiveReview: 'admin_review' },
    );
    expect(content.createPage).toHaveBeenCalledWith(adminCtx, {
      path: 'history/china/figures/zhang-fei',
      title: '张飞',
      contentSource: '# 张飞\n\n蜀汉名将。',
      nature: 'generated',
      space: 'generated',
    });
    expect(result.ok).toBe(true);
    expect(result.data).toEqual({
      pageId: 'page-created',
      path: 'history/china/figures/zhang-fei',
      title: '张飞',
      href: '/generated/history/china/figures/zhang-fei',
    });
  });

  it('falls back to the default space for non-admin actors', async () => {
    const editorCtx = buildUserCtx('editor-1', 'editor');
    content.createPage.mockResolvedValue({
      id: 'page-editor',
      path: 'drafts/test',
      slug: 'drafts/test',
      title: 'Test',
    });
    const result = await executeTool(
      editorCtx,
      createPageTool,
      {
        path: 'drafts/test',
        title: 'Test',
        contentSource: '# Test',
      },
      { ...execCtx, actorUserId: 'editor-1', effectiveReview: 'none' },
    );
    expect(content.createPage).toHaveBeenCalledWith(
      editorCtx,
      expect.objectContaining({
        space: 'default',
        nature: 'generated',
      }),
    );
    expect(result.ok).toBe(true);
    expect(result.data).toEqual({
      pageId: 'page-editor',
      path: 'drafts/test',
      title: 'Test',
      href: '/drafts/test',
    });
  });

  it('keeps the existing page title when a save_draft call supplies only replacement content', async () => {
    content.getPageById.mockResolvedValue({ id: 'page-sun-quan', title: '孙权' });
    content.createDraft.mockResolvedValue({ version: 3 });

    const result = await executeTool(
      adminCtx,
      saveDraftTool,
      {
        pageId: '33333333-3333-4333-8333-333333333333',
        contentSource: '# 孙权\n\nExpanded content.',
      },
      { ...execCtx, actorUserId: 'admin-1', effectiveReview: 'none' },
    );

    expect(content.createDraft).toHaveBeenCalledWith(
      adminCtx,
      '33333333-3333-4333-8333-333333333333',
      {
        title: '孙权',
        contentSource: '# 孙权\n\nExpanded content.',
      },
    );
    expect(result).toMatchObject({ ok: true, summary: 'Saved draft revision v3.' });
  });

  it('rejects an edit instruction instead of overwriting a page with it', async () => {
    const pageId = '4a444444-4444-4444-8444-444444444444';
    content.getPageById.mockResolvedValue({
      id: pageId,
      title: '基金',
      contentSource: '# 基金\n\n## 按运作方式分类\n\nExisting content.',
    });
    content.createDraft.mockClear();

    const result = await executeTool(
      adminCtx,
      saveDraftTool,
      {
        pageId,
        contentSource: 'pageSource 全文 + 在 "### 按运作方式分类" 之前插入新增章节',
      },
      { ...execCtx, actorUserId: 'admin-1', effectiveReview: 'none' },
    );

    expect(result).toMatchObject({
      ok: false,
      errorCode: 'BAD_REQUEST',
      errorMessage: expect.stringContaining('complete final Markdown document'),
    });
    expect(content.createDraft).not.toHaveBeenCalled();
  });

  it('restores only unchanged lines whose backslashes were copied from JSON into YAML', () => {
    const current = [
      '# Saturn',
      '',
      '| 轨道倾角 | $2.49^\\circ$ |',
      '| 质量 | $5.683 \\times 10^{26}\\ \\text{kg}$ |',
      '',
      'Original prose.',
    ].join('\n');
    const submitted = [
      '# Saturn',
      '',
      '| 轨道倾角 | $2.49^\\\\circ$ |',
      '| 质量 | $5.683 \\\\times 10^{26}\\\\ \\\\text{kg}$ |',
      '',
      'Original prose.',
      '',
      '![Saturn](/api/assets/image)',
    ].join('\n');

    expect(restoreJsonEscapedBackslashes(current, submitted)).toBe(
      [
        '# Saturn',
        '',
        '| 轨道倾角 | $2.49^\\circ$ |',
        '| 质量 | $5.683 \\times 10^{26}\\ \\text{kg}$ |',
        '',
        'Original prose.',
        '',
        '![Saturn](/api/assets/image)',
      ].join('\n'),
    );
  });

  it('does not reduce a deliberate LaTex double-backslash edit', () => {
    expect(restoreJsonEscapedBackslashes('$a$', '$a\\\\b$')).toBe('$a\\\\b$');
  });

  it('applies the backslash recovery guard to save_draft itself', async () => {
    const pageId = '44444444-4444-4444-8444-444444444444';
    content.getPageById.mockResolvedValue({
      id: pageId,
      title: 'Saturn',
      contentSource: 'Inclination: $2.49^\\circ$.',
    });
    content.createDraft.mockResolvedValue({ version: 4 });

    await executeTool(
      adminCtx,
      saveDraftTool,
      {
        pageId,
        contentSource: 'Inclination: $2.49^\\\\circ$.\n\n![Saturn](/api/assets/image)',
      },
      { ...execCtx, actorUserId: 'admin-1', effectiveReview: 'none' },
    );

    expect(content.createDraft).toHaveBeenCalledWith(adminCtx, pageId, {
      title: 'Saturn',
      contentSource: 'Inclination: $2.49^\\circ$.\n\n![Saturn](/api/assets/image)',
    });
  });

  // 037, US3: save_draft replaces the whole body, so a model that fails to
  // fully reproduce a large page silently drops content with no signal to
  // anyone. This is the defense-in-depth guard for exactly the incident that
  // motivated 037: a large page's save_draft update silently dropped most of
  // the original content.
  describe('content-loss guard (037, US3)', () => {
    const largePageId = '77777777-7777-4777-8777-777777777777';
    const currentSource = 'X'.repeat(1000);

    it('rejects a submission that drops most of the page without acknowledgement', async () => {
      content.getPageById.mockResolvedValue({
        id: largePageId,
        title: 'Large Page',
        contentSource: currentSource,
      });
      content.createDraft.mockClear();

      const result = await executeTool(
        adminCtx,
        saveDraftTool,
        { pageId: largePageId, contentSource: 'Y'.repeat(400) },
        { ...execCtx, actorUserId: 'admin-1', effectiveReview: 'none' },
      );

      expect(result).toMatchObject({ ok: false, errorCode: 'BAD_REQUEST' });
      expect(result.errorMessage).toMatch(/dramatically shorter|content was lost/i);
      expect(content.createDraft).not.toHaveBeenCalled();
    });

    it('accepts the same submission when acknowledgedContentReduction is true', async () => {
      content.getPageById.mockResolvedValue({
        id: largePageId,
        title: 'Large Page',
        contentSource: currentSource,
      });
      content.createDraft.mockClear();
      content.createDraft.mockResolvedValue({ version: 11 });

      const result = await executeTool(
        adminCtx,
        saveDraftTool,
        {
          pageId: largePageId,
          contentSource: 'Y'.repeat(400),
          acknowledgedContentReduction: true,
        },
        { ...execCtx, actorUserId: 'admin-1', effectiveReview: 'none' },
      );

      expect(result.ok).toBe(true);
      expect(content.createDraft).toHaveBeenCalledWith(adminCtx, largePageId, {
        title: 'Large Page',
        contentSource: 'Y'.repeat(400),
      });
    });

    it('succeeds without acknowledgement when the submission is not dramatically shorter', async () => {
      content.getPageById.mockResolvedValue({
        id: largePageId,
        title: 'Large Page',
        contentSource: currentSource,
      });
      content.createDraft.mockClear();
      content.createDraft.mockResolvedValue({ version: 12 });

      const result = await executeTool(
        adminCtx,
        saveDraftTool,
        { pageId: largePageId, contentSource: 'Y'.repeat(900) },
        { ...execCtx, actorUserId: 'admin-1', effectiveReview: 'none' },
      );

      expect(result.ok).toBe(true);
      expect(content.createDraft).toHaveBeenCalledTimes(1);
    });

    it('composes with the existing short-instruction guard instead of replacing it', async () => {
      content.getPageById.mockResolvedValue({
        id: largePageId,
        title: 'Large Page',
        contentSource: currentSource,
      });
      content.createDraft.mockClear();

      const result = await executeTool(
        adminCtx,
        saveDraftTool,
        {
          pageId: largePageId,
          contentSource: 'pagesource full content, insert a new section before the conclusion',
          acknowledgedContentReduction: true,
        },
        { ...execCtx, actorUserId: 'admin-1', effectiveReview: 'none' },
      );

      // acknowledgedContentReduction bypasses only the content-loss guard,
      // never the separate "this looks like an instruction, not a document"
      // guard.
      expect(result).toMatchObject({
        ok: false,
        errorCode: 'BAD_REQUEST',
        errorMessage: expect.stringContaining('complete final Markdown document'),
      });
      expect(content.createDraft).not.toHaveBeenCalled();
    });
  });
});

describe('insert_page_content (037, US1/US2)', () => {
  const insertPageContentTool = getToolDefinition('insert_page_content')!;
  const pageId = '55555555-5555-4555-8555-555555555555';
  const revisionId = '66666666-6666-4666-8666-666666666666';

  it('applies a single anchored edit and creates one new draft revision', async () => {
    content.getPageById.mockResolvedValue({
      id: pageId,
      title: 'Saturn',
      contentSource: 'Intro paragraph.\n\nSecond paragraph.\n',
      latestRevision: { id: revisionId },
    });
    content.createDraft.mockResolvedValue({ version: 5 });

    const result = await executeTool(
      adminCtx,
      insertPageContentTool,
      {
        pageId,
        revisionId,
        edits: [
          { anchor: 'Intro paragraph.', mode: 'insertAfter', text: '\n\nInserted paragraph.' },
        ],
      },
      { ...execCtx, actorUserId: 'admin-1', effectiveReview: 'none' },
    );

    expect(content.createDraft).toHaveBeenCalledWith(adminCtx, pageId, {
      title: 'Saturn',
      contentSource: 'Intro paragraph.\n\nInserted paragraph.\n\nSecond paragraph.\n',
      baseRevisionId: revisionId,
    });
    expect(result).toMatchObject({
      ok: true,
      data: { pageId, version: 5, editsApplied: 1 },
    });
  });

  it('never echoes the full page body back in the result', async () => {
    content.getPageById.mockResolvedValue({
      id: pageId,
      title: 'Saturn',
      contentSource: 'Some fairly long page content that must not be echoed back verbatim.',
      latestRevision: { id: revisionId },
    });
    content.createDraft.mockResolvedValue({ version: 2 });

    const result = await executeTool(
      adminCtx,
      insertPageContentTool,
      {
        pageId,
        revisionId,
        edits: [{ anchor: 'long page content', mode: 'replace', text: 'short content' }],
      },
      { ...execCtx, actorUserId: 'admin-1', effectiveReview: 'none' },
    );

    expect(JSON.stringify(result)).not.toContain('must not be echoed back verbatim');
  });

  it('rejects a stale revisionId before changing anything', async () => {
    content.getPageById.mockResolvedValue({
      id: pageId,
      title: 'Saturn',
      contentSource: 'Intro paragraph.\n',
      latestRevision: { id: 'a-different-revision' },
    });
    content.createDraft.mockClear();

    const result = await executeTool(
      adminCtx,
      insertPageContentTool,
      {
        pageId,
        revisionId,
        edits: [{ anchor: 'Intro paragraph.', mode: 'insertAfter', text: ' more' }],
      },
      { ...execCtx, actorUserId: 'admin-1', effectiveReview: 'none' },
    );

    expect(result).toMatchObject({ ok: false, errorCode: 'STALE_REVISION' });
    expect(content.createDraft).not.toHaveBeenCalled();
  });

  it('forwards the caller ctx to the page lookup and draft creation', async () => {
    content.getPageById.mockResolvedValue({
      id: pageId,
      title: 'Saturn',
      contentSource: 'Intro paragraph.\n',
      latestRevision: { id: revisionId },
    });
    content.createDraft.mockResolvedValue({ version: 1 });

    await executeTool(
      readerCtx,
      insertPageContentTool,
      {
        pageId,
        revisionId,
        edits: [{ anchor: 'Intro paragraph.', mode: 'insertAfter', text: ' more' }],
      },
      { ...execCtx, actorUserId: 'reader-1', effectiveReview: 'none' },
    );

    expect(content.getPageById).toHaveBeenCalledWith(readerCtx, pageId, ['latestRevision']);
    expect(content.createDraft).toHaveBeenCalledWith(readerCtx, pageId, expect.anything());
  });

  it('applies several anchored edits together as exactly one new draft revision', async () => {
    content.getPageById.mockResolvedValue({
      id: pageId,
      title: 'Saturn',
      contentSource: 'Alpha.\n\nBeta.\n\nGamma.\n',
      latestRevision: { id: revisionId },
    });
    content.createDraft.mockClear();
    content.createDraft.mockResolvedValue({ version: 9 });

    const result = await executeTool(
      adminCtx,
      insertPageContentTool,
      {
        pageId,
        revisionId,
        edits: [
          { anchor: 'Alpha.', mode: 'replace', text: 'Alpha updated.' },
          { anchor: 'Gamma.', mode: 'replace', text: 'Gamma updated.' },
        ],
      },
      { ...execCtx, actorUserId: 'admin-1', effectiveReview: 'none' },
    );

    expect(content.createDraft).toHaveBeenCalledTimes(1);
    expect(content.createDraft).toHaveBeenCalledWith(adminCtx, pageId, {
      title: 'Saturn',
      contentSource: 'Alpha updated.\n\nBeta.\n\nGamma updated.\n',
      baseRevisionId: revisionId,
    });
    expect(result).toMatchObject({ data: { editsApplied: 2 } });
  });

  it('applies none of the edits and names the failing anchor when one anchor cannot be found', async () => {
    content.getPageById.mockResolvedValue({
      id: pageId,
      title: 'Saturn',
      contentSource: 'Alpha.\n\nBeta.\n',
      latestRevision: { id: revisionId },
    });
    content.createDraft.mockClear();

    const result = await executeTool(
      adminCtx,
      insertPageContentTool,
      {
        pageId,
        revisionId,
        edits: [
          { anchor: 'Alpha.', mode: 'replace', text: 'Alpha updated.' },
          { anchor: 'This text does not exist.', mode: 'replace', text: 'x' },
        ],
      },
      { ...execCtx, actorUserId: 'admin-1', effectiveReview: 'none' },
    );

    expect(result.ok).toBe(false);
    expect(result.errorMessage).toContain('This text does not exist.');
    expect(content.createDraft).not.toHaveBeenCalled();
  });

  it('rejects overlapping anchor spans within one batch instead of applying either', async () => {
    content.getPageById.mockResolvedValue({
      id: pageId,
      title: 'Saturn',
      contentSource: 'The quick brown fox jumps.\n',
      latestRevision: { id: revisionId },
    });
    content.createDraft.mockClear();

    const result = await executeTool(
      adminCtx,
      insertPageContentTool,
      {
        pageId,
        revisionId,
        edits: [
          { anchor: 'quick brown fox', mode: 'replace', text: 'slow red fox' },
          { anchor: 'brown fox jumps', mode: 'replace', text: 'x' },
        ],
      },
      { ...execCtx, actorUserId: 'admin-1', effectiveReview: 'none' },
    );

    expect(result.ok).toBe(false);
    expect(result.errorMessage).toMatch(/overlap/i);
    expect(content.createDraft).not.toHaveBeenCalled();
  });
});

describe('scheduled Job read/write boundary', () => {
  const spaces = [
    { id: 'raw-id', name: 'Raw entries', slug: 'raw' },
    { id: 'generated-id', name: 'Generated pages', slug: 'generated' },
  ];

  it('allows an explicit read outside the write scope', async () => {
    content.listPages.mockResolvedValue({ items: [], nextCursor: null });

    const result = await executeTool(
      readerCtx,
      listPagesTool,
      { space: 'generated', limit: 100 },
      {
        ...execCtx,
        scheduledScope: { spaceIds: [spaces[0]!.id], skillNames: [] },
      },
    );

    expect(result).toMatchObject({ ok: true, summary: '0 readable page(s) listed.' });
    expect(content.listPages).toHaveBeenCalledWith(
      readerCtx,
      expect.objectContaining({ space: 'generated', limit: 100 }),
    );
  });

  it('searches all execution-owner-readable spaces when no space is specified', async () => {
    spaceService.listSpaces.mockResolvedValue(spaces);
    wikiSearch.searchWikiSources.mockResolvedValue([]);

    const result = await executeTool(
      readerCtx,
      searchTool,
      { query: '诸葛亮', scope: 'all' },
      {
        ...execCtx,
        scheduledScope: { spaceIds: [], skillNames: [] },
      },
    );

    expect(result).toMatchObject({
      ok: true,
      summary: '0 readable page(s) matched across 2 readable space(s).',
    });
    expect(
      wikiSearch.searchWikiSources.mock.calls.slice(-2).map(([query]) => query.options.space),
    ).toEqual(['raw', 'generated']);
  });

  it('requires the generated write space before an admin Job creates a page', async () => {
    database.select.mockReturnValue({
      from: vi.fn().mockReturnValue({
        where: vi.fn().mockResolvedValue([spaces[0]]),
      }),
    });

    const result = await executeTool(
      adminCtx,
      createPageTool,
      { path: 'notes/zhuge-liang', title: '诸葛亮', contentSource: '# 诸葛亮' },
      {
        ...execCtx,
        actorUserId: 'admin-1',
        scheduledScope: { spaceIds: [spaces[0]!.id], skillNames: [] },
      },
    );

    expect(result).toMatchObject({
      ok: false,
      errorCode: 'SCHEDULED_SCOPE_VIOLATION',
      errorMessage: 'Creating a page requires the generated space to be selected for this Job.',
    });
  });
});
