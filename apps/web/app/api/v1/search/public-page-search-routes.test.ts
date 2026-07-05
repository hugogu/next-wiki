import { NextRequest } from 'next/server';
import { describe, expect, it, vi } from 'vitest';

const publicContent = vi.hoisted(() => ({
  searchPages: vi.fn(),
}));

vi.mock('@/server/api/audit-wrapper', () => ({
  withApiAudit: (handler: unknown) => handler,
}));
vi.mock('@/server/api/session', () => ({
  createApiContext: vi.fn(async () => ({ actor: { kind: 'api_key', userId: 'reader', role: 'reader', scopes: ['view'], keyId: 'key' } })),
}));
vi.mock('@/server/services/public-content', () => publicContent);

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
});
