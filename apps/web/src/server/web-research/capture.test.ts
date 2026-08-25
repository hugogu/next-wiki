import { describe, expect, it, vi } from 'vitest';

const mocks = vi.hoisted(() => ({
  findSource: vi.fn(),
  requireActionAccess: vi.fn(),
  readOpenedWebSource: vi.fn(),
}));

vi.mock('drizzle-orm', () => ({
  and: (...conditions: unknown[]) => conditions,
  eq: (column: unknown, value: unknown) => ({ column, value }),
}));
vi.mock('@/server/db', () => ({
  db: { query: { aiWebSources: { findFirst: mocks.findSource } } },
}));
vi.mock('@/server/db/schema', () => ({
  aiWebSources: { id: 'id', aiActionId: 'aiActionId', status: 'status' },
}));
vi.mock('@/server/permissions', () => ({ getActorUserId: vi.fn(() => 'user-1') }));
vi.mock('@/server/services/ai-actions', () => ({
  recordTerminalAction: vi.fn(),
  requireActionAccess: mocks.requireActionAccess,
}));
vi.mock('@/server/services/ai-tool-evidence', () => ({ ensureToolEvidenceCategory: vi.fn() }));
vi.mock('@/server/services/raw-entries', () => ({ createEntry: vi.fn() }));
vi.mock('./sources', () => ({ readOpenedWebSource: mocks.readOpenedWebSource }));

const { captureWebSource } = await import('./capture');

describe('captureWebSource', () => {
  it('returns the existing Raw evidence when capture is retried after reload', async () => {
    mocks.requireActionAccess.mockResolvedValue({ feature: 'wiki_question' });
    mocks.findSource.mockResolvedValue({
      id: 'source-1',
      status: 'captured',
      capturedRawPageId: 'page-1',
      capturedRawRevisionId: 'revision-1',
    });

    const result = await captureWebSource(
      { actor: { kind: 'user' } } as never,
      { actionId: 'action-1', sourceId: 'source-1' },
    );

    expect(result).toEqual({
      pageId: 'page-1',
      versionId: 'revision-1',
      rawPath: 'web-evidence/source-1',
    });
    expect(mocks.readOpenedWebSource).not.toHaveBeenCalled();
  });
});
