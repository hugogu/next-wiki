import { NextRequest } from 'next/server';
import { vi } from 'vitest';

const indexServices = vi.hoisted(() => ({
  listIndexes: vi.fn(),
  createIndexRebuild: vi.fn(),
}));
const retrievalServices = vi.hoisted(() => ({
  createSemanticSearch: vi.fn(),
}));
vi.mock('@/server/api/session', () => ({
  createApiContext: vi.fn(async () => ({ actor: { kind: 'user', userId: 'user', role: 'reader' } })),
}));
vi.mock('@/server/services/ai-index', () => indexServices);
vi.mock('@/server/services/ai-retrieval', () => retrievalServices);

import * as indexesRoute from './indexes/route';
import * as searchesRoute from './searches/route';

describe('AI index/search REST routes', () => {
  it('returns accepted rebuild and semantic search actions', async () => {
    indexServices.createIndexRebuild.mockResolvedValue({ action: { id: 'index-action' } });
    const rebuild = await indexesRoute.POST(new NextRequest('http://localhost/api/ai/indexes', {
      method: 'POST', body: JSON.stringify({ reason: 'test' }),
    }));
    expect(rebuild.status).toBe(202);

    retrievalServices.createSemanticSearch.mockResolvedValue({ id: 'search-action', status: 'queued' });
    const search = await searchesRoute.POST(new NextRequest('http://localhost/api/ai/searches', {
      method: 'POST', body: JSON.stringify({ query: 'meaning', limit: 5 }),
    }));
    expect(search.status).toBe(202);
    expect(retrievalServices.createSemanticSearch).toHaveBeenCalledWith(expect.anything(), { query: 'meaning', limit: 5 });
  });

  it('rejects malformed requests before service calls', async () => {
    const response = await searchesRoute.POST(new NextRequest('http://localhost/api/ai/searches', {
      method: 'POST', body: JSON.stringify({ query: '' }),
    }));
    expect(response.status).toBe(400);
  });
});
