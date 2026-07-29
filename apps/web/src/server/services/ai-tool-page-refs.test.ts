import { describe, expect, it, vi, beforeEach } from 'vitest';

const content = vi.hoisted(() => ({
  getPageByPath: vi.fn(),
  getPageById: vi.fn(),
}));
vi.mock('@/server/services/public-content', () => content);

import { executeTool } from './ai-tool-executors';
import { getToolDefinition } from './ai-tool-registry';

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

  it('advertises the space argument on every path-addressed read tool', () => {
    for (const name of ['get_page', 'get_backlinks', 'get_neighborhood']) {
      const properties = getToolDefinition(name)!.inputSchema.properties;
      expect(Object.keys(properties)).toContain('space');
    }
  });
});
