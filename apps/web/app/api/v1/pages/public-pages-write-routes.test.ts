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
  deletePage: vi.fn(),
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
    expect(publicContent.createPage).toHaveBeenCalledWith(expect.anything(), { path: 'docs/new', title: 'New', contentSource: '# New' }, []);
  });

  it('accepts raw page creation fields and maps raw-space errors', async () => {
    const input = {
      path: 'raw/transcript',
      title: 'Transcript',
      contentSource: 'Hello from the chat.',
      space: 'raw',
      inputKind: 'chat-transcript',
      source: { channel: 'support', sessionId: 'session-1' },
    };
    publicContent.createPage.mockResolvedValueOnce({ id: randomUUID() });
    const created = await pagesRoute.POST(
      request('POST', 'http://localhost/api/v1/pages', input),
      { params: Promise.resolve({}) },
    );
    expect(created.status).toBe(201);
    expect(publicContent.createPage).toHaveBeenCalledWith(expect.anything(), input, []);

    publicContent.createPage.mockRejectedValueOnce(new DomainError('SPACE_UNAVAILABLE', 'raw unavailable'));
    const unavailable = await pagesRoute.POST(
      request('POST', 'http://localhost/api/v1/pages', input),
      { params: Promise.resolve({}) },
    );
    expect(unavailable.status).toBe(403);
    await expect(unavailable.json()).resolves.toMatchObject({ code: 'SPACE_UNAVAILABLE' });
  });

  it('accepts link creation and retarget inputs', async () => {
    const id = randomUUID();
    const targetPageId = randomUUID();
    const nextTargetPageId = randomUUID();
    const createInput = {
      path: 'docs/payments', title: 'Payments', kind: 'link', linkTargetPageId: targetPageId,
    };
    publicContent.createPage.mockResolvedValueOnce({ id });
    const created = await pagesRoute.POST(
      request('POST', 'http://localhost/api/v1/pages', createInput),
      { params: Promise.resolve({}) },
    );
    expect(created.status).toBe(201);
    expect(publicContent.createPage).toHaveBeenCalledWith(
      expect.anything(), { ...createInput, contentSource: '' }, [],
    );

    publicContent.updateProperties.mockResolvedValueOnce({ id });
    const retargeted = await idRoute.PATCH(
      request('PATCH', `http://localhost/api/v1/pages/${id}`, { linkTargetPageId: nextTargetPageId }),
      { params: Promise.resolve({ id }) },
    );
    expect(retargeted.status).toBe(200);
    expect(publicContent.updateProperties).toHaveBeenCalledWith(
      expect.anything(), id, { linkTargetPageId: nextTargetPageId }, [],
    );
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

  it('maps raw immutability from draft, property, delete, and publication routes', async () => {
    const id = randomUUID();
    publicContent.createDraft.mockRejectedValueOnce(new DomainError('RAW_SPACE_IMMUTABLE', 'raw entry'));
    const draft = await draftsRoute.POST(
      request('POST', `http://localhost/api/v1/pages/${id}/drafts`, { title: 'T', contentSource: 'c' }),
      { params: Promise.resolve({ id }) },
    );

    publicContent.updateProperties.mockRejectedValueOnce(new DomainError('RAW_SPACE_IMMUTABLE', 'raw entry'));
    const properties = await idRoute.PATCH(
      request('PATCH', `http://localhost/api/v1/pages/${id}`, { title: 'T' }),
      { params: Promise.resolve({ id }) },
    );

    publicContent.deletePage.mockRejectedValueOnce(new DomainError('RAW_SPACE_IMMUTABLE', 'raw entry'));
    const deleted = await idRoute.DELETE(
      request('DELETE', `http://localhost/api/v1/pages/${id}`),
      { params: Promise.resolve({ id }) },
    );

    publicContent.publishRevision.mockRejectedValueOnce(new DomainError('RAW_SPACE_IMMUTABLE', 'raw entry'));
    const publication = await publicationRoute.POST(
      request('POST', `http://localhost/api/v1/pages/${id}/revisions/1/publication`, {}),
      { params: Promise.resolve({ id, version: '1' }) },
    );

    for (const response of [draft, properties, deleted, publication]) {
      expect(response.status).toBe(403);
      await expect(response.json()).resolves.toMatchObject({ code: 'RAW_SPACE_IMMUTABLE' });
    }
  });

  it('accepts a database-only metadata override when creating a draft', async () => {
    const id = randomUUID();
    const baseRevisionId = randomUUID();
    const input = {
      title: 'Database metadata',
      contentSource: '# Body',
      baseRevisionId,
      metadata: { date: '2026-07-12', summary: 'Summary', tags: ['devops'] },
    };
    publicContent.createDraft.mockResolvedValue({ id: randomUUID() });

    const response = await draftsRoute.POST(
      request('POST', `http://localhost/api/v1/pages/${id}/drafts`, input),
      { params: Promise.resolve({ id }) },
    );

    expect(response.status).toBe(201);
    expect(publicContent.createDraft).toHaveBeenCalledWith(expect.anything(), id, input);
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
    expect(publicContent.publishRevision).toHaveBeenCalledWith(expect.anything(), id, 2, {}, []);
  });
});
