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

  it.each(['unavailable', 'failed'] as const)('returns generic %s semantic coverage on the existing search resource', async (semanticState) => {
    const payload = {
      searchRecordId: '11111111-1111-4111-8111-111111111111',
      semanticState,
      items: [{ page: { id: 'p1', path: 'docs/auth', title: 'Auth' }, excerpt: 'auth', score: 0.1, matchSources: ['keyword'] }],
    };
    publicContent.hybridSearchPages.mockResolvedValue(payload);

    const response = await searchRoute.POST(new NextRequest('http://localhost/api/v1/search/pages', {
      method: 'POST', headers: { 'content-type': 'application/json' },
      body: JSON.stringify({ kind: 'query', searchRecordId: payload.searchRecordId, searchSessionId: '22222222-2222-4222-8222-222222222222', q: 'auth' }),
    }), { params: Promise.resolve({}) });
    const body = await response.json();

    expect(response.status).toBe(200);
    expect(body.semanticState).toBe(semanticState);
    expect(body).not.toHaveProperty('error');
    expect(Object.keys(body).sort()).toEqual(['items', 'searchRecordId', 'semanticState']);
  });

  it('records an Escape behavior exactly through the existing search resource', async () => {
    const response = await searchRoute.POST(new NextRequest('http://localhost/api/v1/search/pages', {
      method: 'POST', headers: { 'content-type': 'application/json' },
      body: JSON.stringify({ kind: 'behavior', eventId: '33333333-3333-4333-8333-333333333333', searchRecordId: '11111111-1111-4111-8111-111111111111', searchSessionId: '22222222-2222-4222-8222-222222222222', action: 'escape' }),
    }), { params: Promise.resolve({}) });
    expect(response.status).toBe(204);
    expect(searchAnalytics.recordSearchBehavior).toHaveBeenCalledWith(expect.anything(), expect.objectContaining({ action: 'escape' }));
  });

  it('rejects invalid behavior shapes before they reach analytics', async () => {
    const response = await searchRoute.POST(new NextRequest('http://localhost/api/v1/search/pages', {
      method: 'POST', headers: { 'content-type': 'application/json' },
      body: JSON.stringify({ kind: 'behavior', eventId: '77777777-7777-4777-8777-777777777777', searchRecordId: '11111111-1111-4111-8111-111111111111', searchSessionId: '22222222-2222-4222-8222-222222222222', action: 'result_open' }),
    }), { params: Promise.resolve({}) });

    expect(response.status).toBe(422);
  });

  it('accepts a behavior when best-effort analytics persistence fails', async () => {
    searchAnalytics.recordSearchBehavior.mockRejectedValueOnce(new Error('database unavailable'));
    const response = await searchRoute.POST(new NextRequest('http://localhost/api/v1/search/pages', {
      method: 'POST', headers: { 'content-type': 'application/json' },
      body: JSON.stringify({ kind: 'behavior', eventId: '44444444-4444-4444-8444-444444444444', searchRecordId: '11111111-1111-4111-8111-111111111111', searchSessionId: '22222222-2222-4222-8222-222222222222', action: 'escape' }),
    }), { params: Promise.resolve({}) });

    expect(response.status).toBe(204);
  });

  it('does not disclose an unreadable selected page', async () => {
    publicContent.getPageById.mockResolvedValueOnce(null);
    const response = await searchRoute.POST(new NextRequest('http://localhost/api/v1/search/pages', {
      method: 'POST', headers: { 'content-type': 'application/json' },
      body: JSON.stringify({ kind: 'behavior', eventId: '55555555-5555-4555-8555-555555555555', searchRecordId: '11111111-1111-4111-8111-111111111111', searchSessionId: '22222222-2222-4222-8222-222222222222', action: 'result_open', pageId: '66666666-6666-4666-8666-666666666666' }),
    }), { params: Promise.resolve({}) });

    expect(response.status).toBe(204);
    expect(searchAnalytics.recordSearchBehavior).not.toHaveBeenCalledWith(expect.anything(), expect.objectContaining({ eventId: '55555555-5555-4555-8555-555555555555' }));
  });

  it('revalidates readable result opens while allowing idempotent retries', async () => {
    publicContent.getPageById.mockResolvedValue({ id: '66666666-6666-4666-8666-666666666666' });
    const body = { kind: 'behavior', eventId: '88888888-8888-4888-8888-888888888888', searchRecordId: '11111111-1111-4111-8111-111111111111', searchSessionId: '22222222-2222-4222-8222-222222222222', action: 'result_open', pageId: '66666666-6666-4666-8666-666666666666' };
    const first = await searchRoute.POST(new NextRequest('http://localhost/api/v1/search/pages', {
      method: 'POST', headers: { 'content-type': 'application/json' }, body: JSON.stringify(body),
    }), { params: Promise.resolve({}) });
    const retry = await searchRoute.POST(new NextRequest('http://localhost/api/v1/search/pages', {
      method: 'POST', headers: { 'content-type': 'application/json' }, body: JSON.stringify(body),
    }), { params: Promise.resolve({}) });

    expect(first.status).toBe(204);
    expect(retry.status).toBe(204);
    expect(searchAnalytics.recordSearchBehavior).toHaveBeenCalledWith(expect.anything(), expect.objectContaining({ action: 'result_open', pageId: body.pageId }));
  });
});
