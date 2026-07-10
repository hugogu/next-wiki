import { NextRequest } from 'next/server';
import { describe, expect, it, vi } from 'vitest';

const publicContent = vi.hoisted(() => ({
  searchPages: vi.fn(),
  hybridSearchPages: vi.fn(),
  getPageById: vi.fn(),
}));
const searchAnalytics = vi.hoisted(() => ({ recordSearchBehavior: vi.fn() }));

vi.mock('@/server/api/audit-wrapper', () => ({
  withApiAudit: (handler: unknown) => handler,
}));
vi.mock('@/server/api/session', () => ({
  createApiContext: vi.fn(async () => ({ actor: { kind: 'api_key', userId: 'reader', role: 'reader', scopes: ['view'], keyId: 'key' } })),
}));
vi.mock('@/server/services/public-content', () => publicContent);
vi.mock('@/server/services/search-analytics', () => searchAnalytics);

import * as searchRoute from './pages/route';

describe('Public Wiki page search route', () => {
  it('validates query and delegates to public content search', async () => {
    publicContent.searchPages.mockResolvedValue({ items: [], nextCursor: null });

    const response = await searchRoute.GET(
      new NextRequest('http://localhost/api/v1/search/pages?q=hello&scope=title&limit=5'),
      { params: Promise.resolve({}) },
    );

    expect(response.status).toBe(200);
    expect(publicContent.searchPages).toHaveBeenCalledWith(expect.anything(), {
      q: 'hello',
      scope: 'title',
      status: 'published',
      limit: 5,
      include: [],
      excerptLength: 100,
    });
  });

  it('rejects missing q as validation failure', async () => {
    const response = await searchRoute.GET(
      new NextRequest('http://localhost/api/v1/search/pages'),
      { params: Promise.resolve({}) },
    );
    expect(response.status).toBe(422);
  });

  it('parses filter[tag] and forwards it while leaving the response envelope unchanged', async () => {
    publicContent.searchPages.mockResolvedValue({
      items: [{ page: { id: 'p1', path: 'docs/a', title: 'A' }, matchType: 'content', excerpt: 'x', score: 1 }],
      nextCursor: null,
    });

    const response = await searchRoute.GET(
      new NextRequest('http://localhost/api/v1/search/pages?q=auth&filter%5Btag%5D=architecture'),
      { params: Promise.resolve({}) },
    );
    const body = await response.json();

    expect(response.status).toBe(200);
    expect(publicContent.searchPages).toHaveBeenCalledWith(expect.anything(), expect.objectContaining({
      q: 'auth',
      'filter[tag]': ['architecture'],
    }));
    expect(body).toEqual({ items: expect.any(Array), nextCursor: null });
    expect(Object.keys(body).sort()).toEqual(['items', 'nextCursor']);
  });

  it('runs the idempotent hybrid query through the existing search resource', async () => {
    const payload = {
      searchRecordId: '11111111-1111-4111-8111-111111111111',
      searchSessionId: '22222222-2222-4222-8222-222222222222',
      semanticState: 'unavailable', items: [],
    };
    publicContent.hybridSearchPages.mockResolvedValue(payload);
    const response = await searchRoute.POST(new NextRequest('http://localhost/api/v1/search/pages', {
      method: 'POST', headers: { 'content-type': 'application/json' },
      body: JSON.stringify({ kind: 'query', searchRecordId: payload.searchRecordId, searchSessionId: payload.searchSessionId, q: 'auth' }),
    }), { params: Promise.resolve({}) });
    expect(response.status).toBe(200);
    expect(publicContent.hybridSearchPages).toHaveBeenCalledWith(expect.anything(), expect.objectContaining({ q: 'auth', limit: 20 }));
  });

  it('records an Escape behavior exactly through the existing search resource', async () => {
    const response = await searchRoute.POST(new NextRequest('http://localhost/api/v1/search/pages', {
      method: 'POST', headers: { 'content-type': 'application/json' },
      body: JSON.stringify({ kind: 'behavior', eventId: '33333333-3333-4333-8333-333333333333', searchRecordId: '11111111-1111-4111-8111-111111111111', searchSessionId: '22222222-2222-4222-8222-222222222222', action: 'escape' }),
    }), { params: Promise.resolve({}) });
    expect(response.status).toBe(204);
    expect(searchAnalytics.recordSearchBehavior).toHaveBeenCalledWith(expect.anything(), expect.objectContaining({ action: 'escape' }));
  });
});
