import { describe, expect, it, vi } from 'vitest';

const images = vi.hoisted(() => ({ createImageGeneration: vi.fn() }));
const runner = vi.hoisted(() => ({ runInlineImageGenerationAction: vi.fn() }));
const artifacts = vi.hoisted(() => ({ promoteGeneratedArtifact: vi.fn() }));
const db = vi.hoisted(() => ({
  query: {
    aiGeneratedArtifacts: { findFirst: vi.fn() },
  },
}));

vi.mock('@/server/services/ai-image-generation', () => images);
vi.mock('@/server/services/ai-image-runner', () => runner);
vi.mock('@/server/services/ai-artifacts', () => artifacts);
vi.mock('@/server/db', () => ({ db }));

import { buildUserCtx } from '@/server/permissions';
import { executeTool } from './ai-tool-executors';
import { getToolDefinition } from './ai-tool-registry';

const pageId = '11111111-1111-1111-1111-111111111111';
const revisionId = '22222222-2222-2222-2222-222222222222';
const artifactId = '33333333-3333-3333-3333-333333333333';
const actionId = '44444444-4444-4444-4444-444444444444';
const ctx = buildUserCtx('editor-1', 'editor');
const execCtx = {
  actorUserId: 'editor-1',
  effectiveReview: 'none' as const,
  workflowId: '55555555-5555-5555-5555-555555555555',
  toolCallId: '66666666-6666-6666-6666-666666666666',
  actionId: '77777777-7777-7777-7777-777777777777',
};

describe('Wiki AI media tools', () => {
  it('generates inline from the existing pg-boss worker and returns only safe artifact metadata', async () => {
    images.createImageGeneration.mockResolvedValueOnce({ id: actionId });
    runner.runInlineImageGenerationAction.mockResolvedValueOnce(undefined);
    db.query.aiGeneratedArtifacts.findFirst.mockResolvedValueOnce({
      id: artifactId,
      contentType: 'image/png',
      sizeBytes: 4,
      expiresAt: new Date('2026-07-29T00:00:00.000Z'),
      bytes: Buffer.from('png!'),
    });

    const result = await executeTool(ctx, getToolDefinition('generate_image')!, {
      pageId,
      revisionId,
      source: { kind: 'selection', text: 'Architecture overview', hash: 'a'.repeat(64) },
      aspectRatio: '16:9',
    }, execCtx);

    expect(images.createImageGeneration).toHaveBeenCalledWith(ctx, expect.objectContaining({ pageId, revisionId }), { enqueue: false });
    expect(runner.runInlineImageGenerationAction).toHaveBeenCalledWith(actionId);
    expect(result).toMatchObject({
      ok: true,
      data: { actionId, artifactId, contentType: 'image/png', sizeBytes: 4 },
    });
    expect(JSON.stringify(result)).not.toContain('Architecture overview');
    expect(JSON.stringify(result)).not.toContain('png!');
  });

  it('redacts provider failures and does not disclose provider diagnostics', async () => {
    images.createImageGeneration.mockResolvedValueOnce({ id: actionId });
    runner.runInlineImageGenerationAction.mockRejectedValueOnce(new Error('provider token and raw diagnostic'));

    const result = await executeTool(ctx, getToolDefinition('generate_image')!, {
      pageId,
      revisionId,
      source: { kind: 'page' },
    }, execCtx);

    expect(result).toEqual(expect.objectContaining({ ok: false, errorCode: 'IMAGE_GENERATION_FAILED' }));
    expect(JSON.stringify(result)).not.toContain('provider token');
  });

  it('promotes an artifact without creating or publishing a page revision', async () => {
    artifacts.promoteGeneratedArtifact.mockResolvedValueOnce({
      id: '88888888-8888-8888-8888-888888888888',
      url: '/api/assets/88888888-8888-8888-8888-888888888888',
      contentType: 'image/png',
      sizeBytes: 4,
    });

    const result = await executeTool(ctx, getToolDefinition('promote_generated_image')!, { artifactId, pageId }, execCtx);

    expect(artifacts.promoteGeneratedArtifact).toHaveBeenCalledWith(ctx, artifactId, pageId);
    expect(result).toMatchObject({
      ok: true,
      data: { assetId: '88888888-8888-8888-8888-888888888888', markdown: '![image](/api/assets/88888888-8888-8888-8888-888888888888)' },
    });
  });
});
