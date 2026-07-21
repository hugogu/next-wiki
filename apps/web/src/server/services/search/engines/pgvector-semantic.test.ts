import { describe, expect, it, vi, beforeEach } from 'vitest';

const publicAi = vi.hoisted(() => ({
  submitSemanticSearch: vi.fn(),
  getSemanticSearchResults: vi.fn(),
}));
vi.mock('@/server/services/public-ai', () => publicAi);

import { buildAnonymousCtx } from '@/server/permissions';
import { createSemanticEngine } from './pgvector-semantic';

const engine = createSemanticEngine();
const ctx = buildAnonymousCtx();

function query(overrides: { continuationRef?: string | null; attempt?: boolean; spaceIds?: string[]; spaceSlugs?: string[] } = {}) {
  const withAttempt = overrides.attempt ?? true;
  return {
    q: 'conceptual paraphrase',
    limit: 20,
    deadlineMs: 400,
    // Two spaces by default: the common "no explicit space" coordinator
    // scope, which must never resolve to a single slug filter (023).
    spaceIds: overrides.spaceIds ?? ['space-default', 'space-raw'],
    spaceSlugs: overrides.spaceSlugs ?? ['default', 'raw'],
    attempt: withAttempt
      ? { searchRecordId: '11111111-1111-4111-8111-111111111111', continuationRef: overrides.continuationRef ?? null }
      : undefined,
  };
}

beforeEach(() => {
  vi.clearAllMocks();
});

describe('semantic engine (pgvector + AI action lifecycle)', () => {
  it('contributes ranked candidates from a completed semantic action', async () => {
    publicAi.getSemanticSearchResults.mockResolvedValue({
      status: 'succeeded',
      items: [
        { pageId: 'page-1', path: 'a', title: 'A', score: 0.91, excerpt: 'first excerpt', citations: [{ chunkId: 'c1', revisionId: 'r1', contentHash: 'h1' }] },
        { pageId: 'page-2', path: 'b', title: 'B', score: 0.72, excerpt: 'second excerpt', citations: [] },
      ],
    });

    const outcome = await engine.run(ctx, query({ continuationRef: 'action-1' }));

    expect(outcome).toMatchObject({ state: 'ready', continuationRef: 'action-1' });
    if (outcome.state !== 'ready') return;
    expect(outcome.candidates).toEqual([
      expect.objectContaining({ pageId: 'page-1', rank: 0, revisionId: 'r1', excerpt: 'first excerpt', compatRelevance: 0.91 }),
      expect.objectContaining({ pageId: 'page-2', rank: 1, compatRelevance: 0.72 }),
    ]);
    expect(publicAi.submitSemanticSearch).not.toHaveBeenCalled();
  });

  it('starts the existing asynchronous action lifecycle for a durable attempt and reports pending', async () => {
    publicAi.submitSemanticSearch.mockResolvedValue({ id: 'action-new' });

    const outcome = await engine.run(ctx, query());

    expect(outcome).toEqual({ state: 'pending', continuationRef: 'action-new' });
    expect(publicAi.submitSemanticSearch).toHaveBeenCalledWith(ctx, { q: 'conceptual paraphrase', limit: 20, scope: 'all' });
  });

  it('forwards a single coordinator-resolved space slug when the scope is exactly one space (023 Raw semantic search)', async () => {
    publicAi.submitSemanticSearch.mockResolvedValue({ id: 'action-raw' });

    await engine.run(ctx, query({ spaceIds: ['space-raw'], spaceSlugs: ['raw'] }));

    expect(publicAi.submitSemanticSearch).toHaveBeenCalledWith(
      ctx,
      expect.objectContaining({ space: 'raw' }),
    );
  });

  it('omits the space filter (searches every readable space in one action) when the scope covers multiple spaces (023)', async () => {
    publicAi.submitSemanticSearch.mockResolvedValue({ id: 'action-multi' });

    await engine.run(ctx, query({ spaceIds: ['space-default', 'space-raw', 'space-generated'], spaceSlugs: ['default', 'raw', 'generated'] }));

    // A single submission covering every space — never one submission per
    // space — relies on ai-retrieval.ts's existing all-readable-spaces path.
    expect(publicAi.submitSemanticSearch).toHaveBeenCalledTimes(1);
    const [, submitted] = publicAi.submitSemanticSearch.mock.calls[0]!;
    expect(submitted).toMatchObject({ q: 'conceptual paraphrase', limit: 20, scope: 'all' });
    expect(submitted.space).toBeUndefined();
  });

  it('continues reporting pending while the action is still running', async () => {
    publicAi.getSemanticSearchResults.mockResolvedValue({ status: 'running', items: [] });
    const outcome = await engine.run(ctx, query({ continuationRef: 'action-run' }));
    expect(outcome).toEqual({ state: 'pending', continuationRef: 'action-run' });
  });

  it('maps a failed action to a generic failed state without diagnostics', async () => {
    publicAi.getSemanticSearchResults.mockResolvedValue({
      status: 'failed',
      items: [],
      error: { code: 'PROVIDER_ERROR', message: 'internal detail' },
    });
    const outcome = await engine.run(ctx, query({ continuationRef: 'action-bad' }));
    expect(outcome).toEqual({ state: 'failed' });
    expect(JSON.stringify(outcome)).not.toContain('PROVIDER_ERROR');
  });

  it('maps an expired action to timed_out (feature-013 clients see failed)', async () => {
    publicAi.getSemanticSearchResults.mockResolvedValue({ status: 'expired', items: [] });
    const outcome = await engine.run(ctx, query({ continuationRef: 'action-old' }));
    expect(outcome).toEqual({ state: 'timed_out' });
  });

  it('is unavailable when submission is rejected (AI disabled, anonymous, or non-entitled)', async () => {
    publicAi.submitSemanticSearch.mockRejectedValue(new Error('AI disabled'));
    const outcome = await engine.run(ctx, query());
    expect(outcome).toEqual({ state: 'unavailable' });
  });

  it('never starts provider work without a durable attempt to resume', async () => {
    const outcome = await engine.run(ctx, query({ attempt: false }));
    expect(outcome).toEqual({ state: 'unavailable' });
    expect(publicAi.submitSemanticSearch).not.toHaveBeenCalled();
  });
});
