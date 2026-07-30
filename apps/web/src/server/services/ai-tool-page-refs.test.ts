import { describe, expect, it, vi, beforeEach } from 'vitest';

const content = vi.hoisted(() => ({
  getPageByPath: vi.fn(),
  getPageById: vi.fn(),
}));
vi.mock('@/server/services/public-content', () => content);

import { executeTool } from './ai-tool-executors';
import { getToolDefinition } from './ai-tool-registry';
import { MAX_TOOL_RESULT_CHARS, formatToolResultForModel } from './ai-tool-runtime';

const ctx = { actor: { kind: 'user' as const, userId: 'u1', role: 'admin' as const } };
const execCtx = {
  actorUserId: 'u1',
  effectiveReview: 'none' as const,
  workflowId: '00000000-0000-4000-8000-000000000001',
  toolCallId: '00000000-0000-4000-8000-000000000002',
  actionId: '00000000-0000-4000-8000-000000000003',
};

const page = {
  id: '00000000-0000-4000-8000-00000000000a',
  path: 'games/reversi',
  title: 'Reversi',
  locale: 'en',
  spaceSlug: 'generated',
  contentSource: '# Reversi',
  publishedRevision: { id: 'rev-1', contentHash: 'hash-1' },
};

function getPage(args: Record<string, unknown>) {
  return executeTool(ctx, getToolDefinition('get_page')!, args, execCtx);
}

/**
 * A path-addressed read could only ever see the wiki space, while search and
 * list report a `spaceSlug` per result and `create_page` writes into
 * `generated` — so the model could find or create a page it then could not
 * read back.
 */
describe('get_page across spaces', () => {
  beforeEach(() => {
    content.getPageByPath.mockReset();
    content.getPageById.mockReset();
  });

  it('reads a path in the space the caller names', async () => {
    content.getPageByPath.mockResolvedValue(page);

    const result = await getPage({ path: 'games/reversi', space: 'generated' });

    expect(result.ok).toBe(true);
    expect(content.getPageByPath).toHaveBeenCalledWith(ctx, 'games/reversi', expect.anything(), 'generated');
  });

  it('reads a generated page when the model provides its explicit space', async () => {
    content.getPageByPath.mockResolvedValue(page);

    const result = await getPage({ path: 'zhuge-liang', space: 'generated' });

    expect(result.ok).toBe(true);
    expect(content.getPageByPath).toHaveBeenNthCalledWith(
      1,
      ctx,
      'zhuge-liang',
      expect.anything(),
      'generated',
    );
  });

  it('reports the searched content space and the MCP-compatible discovery flow', async () => {
    content.getPageByPath.mockResolvedValue(null);

    const result = await getPage({ path: 'zhuge-liang' });

    expect(result).toMatchObject({ ok: false, errorCode: 'NOT_FOUND' });
    expect(result.summary).toContain('wiki space');
    expect(result.summary).toContain('scope: "all"');
    expect(result.summary).toContain('space to generated or raw');
    expect(content.getPageByPath).toHaveBeenCalledTimes(1);
  });

  it('does not override an explicitly selected wiki space', async () => {
    content.getPageByPath.mockResolvedValue(null);

    const result = await getPage({ path: 'zhuge-liang', space: 'wiki' });

    expect(result).toMatchObject({ ok: false, errorCode: 'NOT_FOUND' });
    expect(content.getPageByPath).toHaveBeenCalledTimes(1);
  });

  it('accepts the legacy default-space alias and presents it as wiki', async () => {
    content.getPageByPath.mockResolvedValue({ ...page, spaceSlug: 'default' });

    const result = await getPage({ path: 'games/reversi', space: 'default' });

    expect(result.ok).toBe(true);
    expect(content.getPageByPath).toHaveBeenCalledWith(ctx, 'games/reversi', expect.anything(), 'wiki');
    expect((result.data as { spaceSlug: string }).spaceSlug).toBe('wiki');
  });

  it('accepts a reader URL the model copied out of a create_page href', async () => {
    // Literal path first (wiki space) — miss — then the space parsed off the URL.
    content.getPageByPath.mockResolvedValueOnce(null).mockResolvedValueOnce(page);

    const result = await getPage({ path: '/spaces/generated/games/reversi' });

    expect(result.ok).toBe(true);
    expect(content.getPageByPath).toHaveBeenLastCalledWith(
      ctx,
      'games/reversi',
      expect.anything(),
      'generated',
    );
  });

  it('prefers a real page whose path happens to start with spaces/', async () => {
    content.getPageByPath.mockResolvedValue({ ...page, path: 'spaces/generated/games', spaceSlug: 'default' });

    const result = await getPage({ path: 'spaces/generated/games' });

    expect(result.ok).toBe(true);
    expect(content.getPageByPath).toHaveBeenCalledTimes(1);
  });

  it('still fails when neither reading finds a page', async () => {
    content.getPageByPath.mockResolvedValue(null);

    const result = await getPage({ path: '/spaces/generated/games/nope' });

    expect(result).toMatchObject({ ok: false, errorCode: 'NOT_FOUND' });
  });

  it('advertises the MCP page-reference fields', () => {
    expect(Object.keys(getToolDefinition('get_page')!.inputSchema.properties)).toContain('pageId');
    expect(Object.keys(getToolDefinition('get_backlinks')!.inputSchema.properties)).toContain('pageId');
    expect(getToolDefinition('get_neighborhood')!.inputSchema.properties).toMatchObject({
      node: expect.any(Object),
      depth: { minimum: 1, maximum: 3 },
      direction: { enum: ['out', 'in', 'both'] },
    });
  });
});

/**
 * A page longer than one result window used to be unreadable past its head:
 * every call returned the same truncated slice, so a rewrite silently dropped
 * whatever the model never saw.
 */
describe('get_page on a page longer than one result window', () => {
  const long = 'A'.repeat(7_000) + 'TAIL-MARKER' + 'B'.repeat(7_000);

  beforeEach(() => {
    content.getPageByPath.mockReset();
    content.getPageById.mockReset();
    content.getPageByPath.mockResolvedValue({ ...page, contentSource: long });
  });

  it('reports the window it returned and where the rest starts', async () => {
    const result = await getPage({ path: 'games/reversi' });
    const data = result.data as { contentSource: string; contentOffset: number; contentLength: number; hasMore: boolean; nextContentOffset: number };

    expect(data.contentOffset).toBe(0);
    expect(data.contentLength).toBe(long.length);
    expect(data.hasMore).toBe(true);
    expect(data.nextContentOffset).toBe(data.contentSource.length);
    expect(long.startsWith(data.contentSource)).toBe(true);
    // Stated in the summary too: that is what survives into the durable record.
    expect(result.summary).toContain(String(long.length));
  });

  it('returns the remainder from the offset it handed back', async () => {
    const first = (await getPage({ path: 'games/reversi' })).data as { nextContentOffset: number; contentSource: string };
    const second = await getPage({ path: 'games/reversi', contentOffset: first.nextContentOffset });
    const data = second.data as { contentSource: string; hasMore: boolean };

    expect(first.contentSource + data.contentSource).toBe(long.slice(0, first.contentSource.length + data.contentSource.length));
    expect(`${first.contentSource}${data.contentSource}`).toContain('TAIL-MARKER');
    expect(data.hasMore).toBe(true);
  });

  it('walks the whole page in a bounded number of windows and ends cleanly', async () => {
    let offset = 0;
    let assembled = '';
    for (let call = 0; call < 10; call += 1) {
      const data = (await getPage({ path: 'games/reversi', contentOffset: offset })).data as {
        contentSource: string; hasMore: boolean; nextContentOffset?: number;
      };
      assembled += data.contentSource;
      if (!data.hasMore) break;
      offset = data.nextContentOffset!;
    }
    expect(assembled).toBe(long);
  });

  it('keeps every window under the runtime cap that would truncate it', async () => {
    const result = await getPage({ path: 'games/reversi' });
    const rendered = formatToolResultForModel('get_page', result);
    expect(rendered.truncated).toBe(false);
    expect(rendered.text.length).toBeLessThanOrEqual(MAX_TOOL_RESULT_CHARS + 'TOOL get_page -> '.length);
  });

  it('clamps an offset past the end instead of looping', async () => {
    const data = (await getPage({ path: 'games/reversi', contentOffset: 999_999 })).data as {
      contentSource: string; hasMore: boolean;
    };
    expect(data.contentSource).toBe('');
    expect(data.hasMore).toBe(false);
  });
});
