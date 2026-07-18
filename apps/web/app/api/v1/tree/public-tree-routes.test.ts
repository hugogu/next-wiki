import { NextRequest } from 'next/server';
import { describe, expect, it, vi } from 'vitest';

const publicContent = vi.hoisted(() => ({
  getPageTree: vi.fn(),
}));

vi.mock('@/server/api/audit-wrapper', () => ({
  withApiAudit: (handler: unknown) => handler,
}));
vi.mock('@/server/api/session', () => ({
  createApiContext: vi.fn(async () => ({ actor: { kind: 'api_key', userId: 'reader', role: 'reader', scopes: ['view'], keyId: 'key' } })),
}));
vi.mock('@/server/services/public-content', () => publicContent);

import * as treeRoute from './route';

describe('GET /api/v1/tree', () => {
  it('delegates to getPageTree with default published status', async () => {
    publicContent.getPageTree.mockResolvedValue({ root: { path: '', segment: '', title: null, pageId: null, status: null, children: [] }, pageCount: 0 });

    const response = await treeRoute.GET(
      new NextRequest('http://localhost/api/v1/tree'),
      { params: Promise.resolve({}) },
    );

    expect(response.status).toBe(200);
    expect(publicContent.getPageTree).toHaveBeenCalledWith(expect.anything(), { status: 'published' });
  });

  it('forwards status and pathPrefix filters', async () => {
    publicContent.getPageTree.mockResolvedValue({ root: { path: 'docs', segment: 'docs', title: null, pageId: null, status: null, children: [] }, pageCount: 0 });

    const response = await treeRoute.GET(
      new NextRequest('http://localhost/api/v1/tree?status=all&pathPrefix=docs'),
      { params: Promise.resolve({}) },
    );

    expect(response.status).toBe(200);
    expect(publicContent.getPageTree).toHaveBeenCalledWith(expect.anything(), { status: 'all', pathPrefix: 'docs' });
  });

  it('forwards the requested space and frontmatter type filter', async () => {
    publicContent.getPageTree.mockResolvedValue({ root: { path: '', segment: '', title: null, pageId: null, status: null, children: [] }, pageCount: 0 });

    const response = await treeRoute.GET(
      new NextRequest('http://localhost/api/v1/tree?space=raw&filter%5Btype%5D=chat-transcript'),
      { params: Promise.resolve({}) },
    );

    expect(response.status).toBe(200);
    expect(publicContent.getPageTree).toHaveBeenCalledWith(expect.anything(), {
      status: 'published',
      space: 'raw',
      'filter[type]': 'chat-transcript',
    });
  });

  it('rejects invalid pathPrefix values', async () => {
    const response = await treeRoute.GET(
      new NextRequest('http://localhost/api/v1/tree?pathPrefix=UPPERCASE'),
      { params: Promise.resolve({}) },
    );
    expect(response.status).toBe(422);
  });
});
