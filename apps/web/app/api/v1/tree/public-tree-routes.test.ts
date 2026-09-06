import { NextRequest } from 'next/server';
import { describe, expect, it, vi } from 'vitest';

const publicContent = vi.hoisted(() => ({
  getPageTree: vi.fn(),
  deleteFolder: vi.fn(),
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

describe('DELETE /api/v1/tree', () => {
  it('delegates to deleteFolder with the parsed pathPrefix and space', async () => {
    publicContent.deleteFolder.mockResolvedValue({ deletedCount: 3 });

    const response = await treeRoute.DELETE(
      new NextRequest('http://localhost/api/v1/tree?space=raw&pathPrefix=conversations/feishu'),
      { params: Promise.resolve({}) },
    );

    expect(response.status).toBe(200);
    expect(publicContent.deleteFolder).toHaveBeenCalledWith(
      expect.anything(),
      { pathPrefix: 'conversations/feishu', space: 'raw', dry_run: false },
    );
  });

  it('forwards dry_run previews without writing', async () => {
    publicContent.deleteFolder.mockResolvedValue({ deletedCount: 7, dryRun: true });

    const response = await treeRoute.DELETE(
      new NextRequest('http://localhost/api/v1/tree?pathPrefix=imports&dry_run=true'),
      { params: Promise.resolve({}) },
    );

    expect(response.status).toBe(200);
    expect(publicContent.deleteFolder).toHaveBeenCalledWith(
      expect.anything(),
      { pathPrefix: 'imports', dry_run: true },
    );
    await expect(response.json()).resolves.toMatchObject({ deletedCount: 7, dryRun: true });
  });

  it('rejects a missing or invalid pathPrefix', async () => {
    publicContent.deleteFolder.mockClear();
    const missing = await treeRoute.DELETE(
      new NextRequest('http://localhost/api/v1/tree'),
      { params: Promise.resolve({}) },
    );
    const invalid = await treeRoute.DELETE(
      new NextRequest('http://localhost/api/v1/tree?pathPrefix=UPPERCASE'),
      { params: Promise.resolve({}) },
    );

    expect(missing.status).toBe(422);
    expect(invalid.status).toBe(422);
    expect(publicContent.deleteFolder).not.toHaveBeenCalled();
  });
});

