import { NextRequest } from 'next/server';
import { describe, expect, it, vi } from 'vitest';

const publicContent = vi.hoisted(() => ({
  listPages: vi.fn(),
  getPageById: vi.fn(),
}));

vi.mock('@/server/api/audit-wrapper', () => ({
  withApiAudit: (handler: unknown) => handler,
}));
vi.mock('@/server/api/session', () => ({
  createApiContext: vi.fn(async () => ({ actor: { kind: 'api_key', userId: 'reader', role: 'reader', scopes: ['view'], keyId: 'key' } })),
}));
vi.mock('@/server/services/public-content', () => publicContent);

import * as listRoute from './route';
import * as idRoute from './[id]/route';

describe('Public Wiki read routes', () => {
  it('GET /api/v1/pages validates query and delegates to the public content service', async () => {
    publicContent.listPages.mockResolvedValue({ items: [], nextCursor: null });

    const response = await listRoute.GET(
      new NextRequest('http://localhost/api/v1/pages?limit=10&order=recent'),
      { params: Promise.resolve({}) },
    );

    expect(response.status).toBe(200);
    expect(publicContent.listPages).toHaveBeenCalledWith(expect.anything(), {
      status: 'published',
      limit: 10,
      order: 'recent',
      include: [],
    });
  });

  it('GET /api/v1/pages/[id] rejects invalid ids and returns hidden pages as 404', async () => {
    const invalid = await idRoute.GET(
      new NextRequest('http://localhost/api/v1/pages/not-a-uuid'),
      { params: Promise.resolve({ id: 'not-a-uuid' }) },
    );
    expect(invalid.status).toBe(422);

    publicContent.getPageById.mockResolvedValue(null);
    const missing = await idRoute.GET(
      new NextRequest('http://localhost/api/v1/pages/00000000-0000-0000-0000-000000000000'),
      { params: Promise.resolve({ id: '00000000-0000-0000-0000-000000000000' }) },
    );
    expect(missing.status).toBe(404);
  });

  it('GET /api/v1/pages?path= delegates the exact path filter to listPages', async () => {
    publicContent.listPages.mockResolvedValue({ items: [], nextCursor: null });

    const response = await listRoute.GET(
      new NextRequest('http://localhost/api/v1/pages?path=docs/intro'),
      { params: Promise.resolve({}) },
    );

    expect(response.status).toBe(200);
    expect(publicContent.listPages).toHaveBeenCalledWith(expect.anything(), {
      status: 'published',
      path: 'docs/intro',
      limit: 20,
      order: 'path',
      include: [],
    });
  });

  it('GET /api/v1/pages?pathPrefix= delegates the subtree filter to listPages', async () => {
    publicContent.listPages.mockResolvedValue({ items: [], nextCursor: null });

    const response = await listRoute.GET(
      new NextRequest('http://localhost/api/v1/pages?pathPrefix=docs'),
      { params: Promise.resolve({}) },
    );

    expect(response.status).toBe(200);
    expect(publicContent.listPages).toHaveBeenCalledWith(expect.anything(), {
      status: 'published',
      pathPrefix: 'docs',
      limit: 20,
      order: 'path',
      include: [],
    });
  });

  it('forwards space, type, tag, and creation-range filters', async () => {
    publicContent.listPages.mockResolvedValue({ items: [], nextCursor: null });

    const response = await listRoute.GET(
      new NextRequest(
        'http://localhost/api/v1/pages?space=generated&filter%5Btype%5D=Playbook&filter%5Btag%5D=incident&createdStart=2026-07-01T00%3A00%3A00.000Z&createdEnd=2026-07-31T00%3A00%3A00.000Z',
      ),
      { params: Promise.resolve({}) },
    );

    expect(response.status).toBe(200);
    expect(publicContent.listPages).toHaveBeenCalledWith(expect.anything(), expect.objectContaining({
      space: 'generated',
      'filter[type]': 'Playbook',
      'filter[tag]': ['incident'],
      createdStart: new Date('2026-07-01T00:00:00.000Z'),
      createdEnd: new Date('2026-07-31T00:00:00.000Z'),
    }));
  });

  it('rejects an inverted creation range', async () => {
    const response = await listRoute.GET(
      new NextRequest('http://localhost/api/v1/pages?createdStart=2026-08-01T00%3A00%3A00.000Z&createdEnd=2026-07-01T00%3A00%3A00.000Z'),
      { params: Promise.resolve({}) },
    );

    expect(response.status).toBe(422);
  });
});
