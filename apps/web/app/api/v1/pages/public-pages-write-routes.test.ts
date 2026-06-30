import { randomUUID } from 'node:crypto';
import { NextRequest } from 'next/server';
import { describe, expect, it, vi } from 'vitest';
import { DomainError } from '@/server/errors';

const publicContent = vi.hoisted(() => ({
  createPage: vi.fn(),
  createDraft: vi.fn(),
  updateProperties: vi.fn(),
  listRevisions: vi.fn(),
  getRevision: vi.fn(),
  publishRevision: vi.fn(),
}));

vi.mock('@/server/api/audit-wrapper', () => ({
  withApiAudit: (handler: unknown) => handler,
}));
vi.mock('@/server/api/session', () => ({
  createApiContext: vi.fn(async () => ({ actor: { kind: 'api_key', userId: 'editor', role: 'editor', scopes: ['view', 'create', 'edit'], keyId: 'key' } })),
}));
vi.mock('@/server/services/public-content', () => publicContent);

import * as pagesRoute from './route';
import * as idRoute from './[id]/route';
import * as draftsRoute from './[id]/drafts/route';
import * as revisionsRoute from './[id]/revisions/route';
import * as revisionRoute from './[id]/revisions/[version]/route';
import * as publicationRoute from './[id]/revisions/[version]/publication/route';

function request(method: string, url: string, body?: unknown) {
  return new NextRequest(url, {
    method,
    body: body === undefined ? undefined : JSON.stringify(body),
    headers: { 'content-type': 'application/json' },
  });
}

describe('Public Wiki write routes', () => {
  it('POST /api/v1/pages validates and delegates page creation', async () => {
    publicContent.createPage.mockResolvedValue({ id: randomUUID() });
    const response = await pagesRoute.POST(
      request('POST', 'http://localhost/api/v1/pages', { path: 'docs/new', title: 'New', contentSource: '# New' }),
      { params: Promise.resolve({}) },
    );
    expect(response.status).toBe(201);
    expect(publicContent.createPage).toHaveBeenCalledWith(expect.anything(), { path: 'docs/new', title: 'New', contentSource: '# New' });
  });

  it('drafts and properties routes surface stale conflicts as 409', async () => {
    const id = randomUUID();
    publicContent.createDraft.mockRejectedValueOnce(new DomainError('STALE_REVISION', 'stale'));
    const draft = await draftsRoute.POST(
      request('POST', `http://localhost/api/v1/pages/${id}/drafts`, { title: 'T', contentSource: 'c', baseRevisionId: randomUUID() }),
      { params: Promise.resolve({ id }) },
    );
    expect(draft.status).toBe(409);

    publicContent.updateProperties.mockRejectedValueOnce(new DomainError('STALE_REVISION', 'stale'));
    const properties = await idRoute.PATCH(
      request('PATCH', `http://localhost/api/v1/pages/${id}`, { title: 'T', baseRevisionId: randomUUID() }),
      { params: Promise.resolve({ id }) },
    );
    expect(properties.status).toBe(409);
  });

  it('revision list, detail, and publication routes delegate with parsed params', async () => {
    const id = randomUUID();
    publicContent.listRevisions.mockResolvedValue({ items: [], nextCursor: null });
    publicContent.getRevision.mockResolvedValue({ id: randomUUID() });
    publicContent.publishRevision.mockResolvedValue({ id });

    expect((await revisionsRoute.GET(new NextRequest(`http://localhost/api/v1/pages/${id}/revisions?limit=5`), { params: Promise.resolve({ id }) })).status).toBe(200);
    expect(publicContent.listRevisions).toHaveBeenCalledWith(expect.anything(), id, { limit: 5 });

    expect((await revisionRoute.GET(new NextRequest(`http://localhost/api/v1/pages/${id}/revisions/2`), { params: Promise.resolve({ id, version: '2' }) })).status).toBe(200);
    expect(publicContent.getRevision).toHaveBeenCalledWith(expect.anything(), id, 2);

    expect((await publicationRoute.POST(request('POST', `http://localhost/api/v1/pages/${id}/revisions/2/publication`, {}), { params: Promise.resolve({ id, version: '2' }) })).status).toBe(200);
    expect(publicContent.publishRevision).toHaveBeenCalledWith(expect.anything(), id, 2, {});
  });
});
