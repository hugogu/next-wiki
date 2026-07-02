import { NextRequest } from 'next/server';
import { describe, expect, it, vi } from 'vitest';

const publicContent = vi.hoisted(() => ({
  deletePage: vi.fn(),
  getBacklinks: vi.fn(),
  getDiff: vi.fn(),
  batchCreatePages: vi.fn(),
  getStats: vi.fn(),
  findSimilar: vi.fn(),
}));

vi.mock('@/server/api/audit-wrapper', () => ({
  withApiAudit: (handler: unknown) => handler,
}));
vi.mock('@/server/api/session', () => ({
  createApiContext: vi.fn(async () => ({ actor: { kind: 'api_key', userId: 'editor', role: 'editor', scopes: ['view', 'create', 'edit', 'delete'], keyId: 'key' } })),
}));
vi.mock('@/server/services/public-content', () => publicContent);

import * as pageRoute from './[id]/route';
import * as backlinksRoute from './[id]/backlinks/route';
import * as diffRoute from './[id]/revisions/[version]/diff/route';
import * as batchRoute from './batch/route';

describe('Public Wiki maintenance routes', () => {
  it('DELETE /api/v1/pages/{id} soft-deletes and returns 204', async () => {
    publicContent.deletePage.mockResolvedValue(undefined);

    const response = await pageRoute.DELETE(
      new NextRequest('http://localhost/api/v1/pages/00000000-0000-0000-0000-000000000000'),
      { params: Promise.resolve({ id: '00000000-0000-0000-0000-000000000000' }) },
    );

    expect(response.status).toBe(204);
    expect(publicContent.deletePage).toHaveBeenCalledWith(expect.anything(), '00000000-0000-0000-0000-000000000000');
  });

  it('GET /api/v1/pages/{id}/backlinks delegates to getBacklinks', async () => {
    publicContent.getBacklinks.mockResolvedValue({ items: [] });

    const response = await backlinksRoute.GET(
      new NextRequest('http://localhost/api/v1/pages/00000000-0000-0000-0000-000000000000/backlinks'),
      { params: Promise.resolve({ id: '00000000-0000-0000-0000-000000000000' }) },
    );

    expect(response.status).toBe(200);
    expect(publicContent.getBacklinks).toHaveBeenCalledWith(expect.anything(), '00000000-0000-0000-0000-000000000000');
  });

  it('GET /api/v1/pages/{id}/revisions/{v}/diff parses query and delegates', async () => {
    publicContent.getDiff.mockResolvedValue({ fromVersion: 1, toVersion: 2, diff: '', additions: 0, deletions: 0 });

    const response = await diffRoute.GET(
      new NextRequest('http://localhost/api/v1/pages/00000000-0000-0000-0000-000000000000/revisions/2/diff?against=1'),
      { params: Promise.resolve({ id: '00000000-0000-0000-0000-000000000000', version: '2' }) },
    );

    expect(response.status).toBe(200);
    expect(publicContent.getDiff).toHaveBeenCalledWith(expect.anything(), '00000000-0000-0000-0000-000000000000', 2, 1);
  });

  it('POST /api/v1/pages/batch delegates to batchCreatePages', async () => {
    publicContent.batchCreatePages.mockResolvedValue({ created: [], count: 0 });

    const response = await batchRoute.POST(
      new NextRequest('http://localhost/api/v1/pages/batch', {
        method: 'POST',
        body: JSON.stringify({ pages: [{ path: 'docs/a', title: 'A', contentSource: '# A' }] }),
      }),
      { params: Promise.resolve({}) },
    );

    expect(response.status).toBe(201);
    expect(publicContent.batchCreatePages).toHaveBeenCalledWith(expect.anything(), {
      pages: [{ path: 'docs/a', title: 'A', contentSource: '# A' }],
    });
  });
});
