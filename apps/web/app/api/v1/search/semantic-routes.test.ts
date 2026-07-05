import { NextRequest } from 'next/server';
import { describe, expect, it, vi } from 'vitest';

const publicAi = vi.hoisted(() => ({
  submitSemanticSearch: vi.fn(),
  getSemanticSearchResults: vi.fn(),
}));

vi.mock('@/server/api/audit-wrapper', () => ({
  withApiAudit: (handler: unknown) => handler,
}));
vi.mock('@/server/api/session', () => ({
  createApiContext: vi.fn(async () => ({ actor: { kind: 'api_key', userId: 'editor', role: 'editor', scopes: ['view', 'ai.read'], keyId: 'key' } })),
}));
vi.mock('@/server/services/public-ai', () => publicAi);

import * as submitRoute from './semantic/route';
import * as pollRoute from './semantic/[id]/route';

describe('Public semantic search routes', () => {
  it('submits and returns HTTP 202 with the queued action shape', async () => {
    publicAi.submitSemanticSearch.mockResolvedValue({
      id: '11111111-1111-1111-1111-111111111111',
      feature: 'semantic_search',
      status: 'queued',
      createdAt: '2026-01-01T00:00:00.000Z',
      expiresAt: '2026-01-02T00:00:00.000Z',
      pollUrl: '/api/v1/search/semantic/11111111-1111-1111-1111-111111111111',
    });

    const response = await submitRoute.POST(
      new NextRequest('http://localhost/api/v1/search/semantic', {
        method: 'POST',
        body: JSON.stringify({ q: 'auth design', limit: 5 }),
      }),
      { params: Promise.resolve({}) },
    );
    const body = await response.json();

    expect(response.status).toBe(202);
    expect(publicAi.submitSemanticSearch).toHaveBeenCalledWith(expect.anything(), expect.objectContaining({ q: 'auth design', limit: 5 }));
    expect(body).toMatchObject({ feature: 'semantic_search', status: 'queued' });
  });

  it('rejects an empty q with a validation failure', async () => {
    const response = await submitRoute.POST(
      new NextRequest('http://localhost/api/v1/search/semantic', {
        method: 'POST',
        body: JSON.stringify({ q: '' }),
      }),
      { params: Promise.resolve({}) },
    );
    expect(response.status).toBe(422);
  });

  it('polls and returns the succeeded action shape with items and citations', async () => {
    const actionId = '22222222-2222-2222-2222-222222222222';
    publicAi.getSemanticSearchResults.mockResolvedValue({
      id: actionId,
      feature: 'semantic_search',
      status: 'succeeded',
      createdAt: '2026-01-01T00:00:00.000Z',
      startedAt: '2026-01-01T00:00:01.000Z',
      finishedAt: '2026-01-01T00:00:02.000Z',
      expiresAt: '2026-01-02T00:00:00.000Z',
      pollUrl: `/api/v1/search/semantic/${actionId}`,
      items: [{
        pageId: '33333333-3333-3333-3333-333333333333',
        path: 'docs/auth',
        title: 'Auth Design',
        score: 0.9,
        excerpt: 'auth design details',
        citations: [{ chunkId: '44444444-4444-4444-4444-444444444444', revisionId: '55555555-5555-5555-5555-555555555555', contentHash: 'hash' }],
      }],
    });

    const response = await pollRoute.GET(
      new NextRequest(`http://localhost/api/v1/search/semantic/${actionId}`),
      { params: Promise.resolve({ id: actionId }) },
    );
    const body = await response.json();

    expect(response.status).toBe(200);
    expect(publicAi.getSemanticSearchResults).toHaveBeenCalledWith(expect.anything(), actionId);
    expect(body.status).toBe('succeeded');
    expect(body.items).toHaveLength(1);
    expect(body.items[0].citations[0]).toMatchObject({ chunkId: expect.any(String), revisionId: expect.any(String), contentHash: 'hash' });
  });

  it('rejects a non-uuid action id as a validation failure', async () => {
    const response = await pollRoute.GET(
      new NextRequest('http://localhost/api/v1/search/semantic/not-a-uuid'),
      { params: Promise.resolve({ id: 'not-a-uuid' }) },
    );
    expect(response.status).toBe(422);
  });
});
