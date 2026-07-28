import { randomUUID } from 'node:crypto';
import { NextRequest } from 'next/server';
import { describe, expect, it, vi } from 'vitest';

const publicImages = vi.hoisted(() => ({
  submitPublicImageGeneration: vi.fn(),
  getPublicImageGeneration: vi.fn(),
  cancelPublicImageGeneration: vi.fn(),
  getPublicGeneratedArtifact: vi.fn(),
  discardPublicGeneratedArtifact: vi.fn(),
  promotePublicGeneratedArtifact: vi.fn(),
}));

vi.mock('@/server/api/audit-wrapper', () => ({
  withApiAudit: (handler: unknown) => handler,
}));
vi.mock('@/server/api/session', () => ({
  createApiContext: vi.fn(async () => ({
    actor: { kind: 'api_key', userId: 'editor', role: 'editor', scopes: ['edit', 'ai.image'], keyId: 'key' },
  })),
}));
vi.mock('@/server/services/public-ai-images', () => publicImages);

import * as imageRoute from './images/route';
import * as actionRoute from './images/[actionId]/route';
import * as artifactRoute from './generated-artifacts/[artifactId]/route';
import * as promoteRoute from './generated-artifacts/[artifactId]/asset/route';

describe('Public image generation routes', () => {
  const pageId = '11111111-1111-1111-1111-111111111111';
  const revisionId = '22222222-2222-2222-2222-222222222222';

  it('submits a page-bound image action with no-store caching', async () => {
    const actionId = randomUUID();
    publicImages.submitPublicImageGeneration.mockResolvedValueOnce({
      id: actionId,
      feature: 'image_generation',
      status: 'queued',
      createdAt: '2026-07-28T00:00:00.000Z',
      updatedAt: '2026-07-28T00:00:00.000Z',
      pollUrl: `/api/v1/ai/images/${actionId}`,
    });

    const response = await imageRoute.POST(
      new NextRequest('http://localhost/api/v1/ai/images', {
        method: 'POST',
        body: JSON.stringify({ pageId, revisionId, source: { kind: 'page' }, aspectRatio: '16:9' }),
      }),
      { params: Promise.resolve({}) },
    );

    expect(response.status).toBe(202);
    expect(response.headers.get('cache-control')).toBe('private, no-store');
    expect(publicImages.submitPublicImageGeneration).toHaveBeenCalledWith(
      expect.anything(),
      expect.objectContaining({ pageId, revisionId, source: { kind: 'page' }, aspectRatio: '16:9' }),
    );
  });

  it('polls a safe image result and streams preview bytes separately', async () => {
    const actionId = randomUUID();
    const artifactId = randomUUID();
    publicImages.getPublicImageGeneration.mockResolvedValueOnce({
      id: actionId,
      feature: 'image_generation',
      status: 'succeeded',
      createdAt: '2026-07-28T00:00:00.000Z',
      updatedAt: '2026-07-28T00:00:01.000Z',
      pollUrl: `/api/v1/ai/images/${actionId}`,
      artifact: { id: artifactId, contentType: 'image/png', sizeBytes: 4 },
    });
    publicImages.getPublicGeneratedArtifact.mockResolvedValueOnce({ bytes: Buffer.from('png!'), contentType: 'image/png' });

    const status = await actionRoute.GET(
      new NextRequest(`http://localhost/api/v1/ai/images/${actionId}`),
      { params: Promise.resolve({ actionId }) },
    );
    const preview = await artifactRoute.GET(
      new NextRequest(`http://localhost/api/v1/ai/generated-artifacts/${artifactId}`),
      { params: Promise.resolve({ artifactId }) },
    );

    expect(status.status).toBe(200);
    expect((await status.json()).artifact).not.toHaveProperty('bytes');
    expect(preview.headers.get('content-type')).toBe('image/png');
    expect(preview.headers.get('cache-control')).toBe('private, no-store');
    expect(preview.headers.get('x-content-type-options')).toBe('nosniff');
    expect(await preview.text()).toBe('png!');
  });

  it('keeps cancel, discard, and promotion endpoints non-caching', async () => {
    const actionId = randomUUID();
    const artifactId = randomUUID();
    publicImages.promotePublicGeneratedArtifact.mockResolvedValueOnce({
      id: randomUUID(),
      contentType: 'image/png',
      sizeBytes: 4,
      url: '/api/v1/assets/asset/content',
      markdown: '![image](/api/v1/assets/asset/content)',
      createdAt: '2026-07-28T00:00:00.000Z',
    });

    const cancelled = await actionRoute.DELETE(
      new NextRequest(`http://localhost/api/v1/ai/images/${actionId}`, { method: 'DELETE' }),
      { params: Promise.resolve({ actionId }) },
    );
    const discarded = await artifactRoute.DELETE(
      new NextRequest(`http://localhost/api/v1/ai/generated-artifacts/${artifactId}`, { method: 'DELETE' }),
      { params: Promise.resolve({ artifactId }) },
    );
    const promoted = await promoteRoute.POST(
      new NextRequest(`http://localhost/api/v1/ai/generated-artifacts/${artifactId}/asset`, {
        method: 'POST',
        body: JSON.stringify({ pageId }),
      }),
      { params: Promise.resolve({ artifactId }) },
    );

    expect(cancelled.status).toBe(204);
    expect(discarded.status).toBe(204);
    expect(promoted.status).toBe(200);
    expect(cancelled.headers.get('cache-control')).toBe('private, no-store');
    expect(discarded.headers.get('cache-control')).toBe('private, no-store');
    expect(promoted.headers.get('cache-control')).toBe('private, no-store');
    expect(publicImages.cancelPublicImageGeneration).toHaveBeenCalledWith(expect.anything(), actionId);
    expect(publicImages.discardPublicGeneratedArtifact).toHaveBeenCalledWith(expect.anything(), artifactId);
    expect(publicImages.promotePublicGeneratedArtifact).toHaveBeenCalledWith(expect.anything(), artifactId, pageId);
  });

  it('uses a non-caching 404 envelope for malformed private identifiers', async () => {
    const response = await actionRoute.GET(
      new NextRequest('http://localhost/api/v1/ai/images/not-a-uuid'),
      { params: Promise.resolve({ actionId: 'not-a-uuid' }) },
    );

    expect(response.status).toBe(404);
    expect(response.headers.get('cache-control')).toBe('private, no-store');
  });
});
