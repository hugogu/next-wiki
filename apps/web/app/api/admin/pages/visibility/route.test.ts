import { randomUUID } from 'node:crypto';
import { beforeEach, describe, expect, it, vi } from 'vitest';
import { NextRequest } from 'next/server';
import { MAX_BULK_VISIBILITY_PAGES, type BulkPageVisibilityResult } from '@next-wiki/shared';
import { DomainError } from '@/server/errors';

const session = vi.hoisted(() => ({ createApiContext: vi.fn() }));
const service = vi.hoisted(() => ({ setPagesVisibility: vi.fn() }));

vi.mock('@/server/api/audit-wrapper', () => ({ withApiAudit: (handler: unknown) => handler }));
vi.mock('@/server/api/session', () => session);
vi.mock('@/server/services/page-visibility', () => service);

import { POST } from './route';

const adminCtx = { actor: { kind: 'user', userId: 'admin', role: 'admin' } };
const pageIds = [randomUUID(), randomUUID(), randomUUID()];

const post = (body: unknown) =>
  POST(
    new NextRequest('http://localhost/api/admin/pages/visibility', {
      method: 'POST',
      body: JSON.stringify(body),
      headers: { 'content-type': 'application/json' },
    }),
    { params: Promise.resolve({}) },
  );

describe('POST /api/admin/pages/visibility', () => {
  beforeEach(() => {
    vi.clearAllMocks();
    session.createApiContext.mockResolvedValue(adminCtx);
  });

  it('returns each page’s outcome for an administrator session', async () => {
    const result: BulkPageVisibilityResult = {
      visibility: 'restricted',
      dryRun: false,
      matched: 2,
      pending: { total: 1, public: 1, registered: 0, restricted: 0, unpublished: 0 },
      changed: 1,
      remaining: 0,
      results: [
        { pageId: pageIds[0]!, outcome: 'changed', previousVisibility: 'public' },
        { pageId: pageIds[1]!, outcome: 'unchanged', previousVisibility: 'restricted' },
        { pageId: pageIds[2]!, outcome: 'not_found', previousVisibility: null },
      ],
    };
    service.setPagesVisibility.mockResolvedValue(result);
    const body = { scope: { kind: 'pages', pageIds }, visibility: 'restricted' };

    const response = await post(body);

    expect(response.status).toBe(200);
    await expect(response.json()).resolves.toEqual(result);
    expect(service.setPagesVisibility).toHaveBeenCalledWith(adminCtx, body);
  });

  it('accepts a folder scope and a dry run', async () => {
    service.setPagesVisibility.mockResolvedValue({});
    const body = { scope: { kind: 'folder', space: 'default', pathPrefix: 'news/2026' }, visibility: 'public', dryRun: true };

    expect((await post(body)).status).toBe(200);
    expect(service.setPagesVisibility).toHaveBeenCalledWith(adminCtx, body);
  });

  it.each([
    ['a non-admin user', { actor: { kind: 'user', userId: 'editor', role: 'editor' } }],
    ['an administrator API key', {
      actor: { kind: 'api_key', userId: 'admin', role: 'admin', scopes: ['view', 'create', 'edit', 'delete'], keyId: 'key', spaceAccess: ['wiki'] },
    }],
    ['an anonymous visitor', { actor: { kind: 'anonymous' } }],
  ])('refuses %s', async (_name, ctx) => {
    session.createApiContext.mockResolvedValue(ctx);

    const response = await post({ scope: { kind: 'pages', pageIds }, visibility: 'public' });

    expect(response.status).toBe(403);
    expect(service.setPagesVisibility).not.toHaveBeenCalled();
  });

  it(`refuses more than ${MAX_BULK_VISIBILITY_PAGES} pages in one request`, async () => {
    const tooMany = Array.from({ length: MAX_BULK_VISIBILITY_PAGES + 1 }, () => randomUUID());

    const response = await post({ scope: { kind: 'pages', pageIds: tooMany }, visibility: 'restricted' });

    expect(response.status).toBe(400);
    expect(service.setPagesVisibility).not.toHaveBeenCalled();
    service.setPagesVisibility.mockResolvedValue({});
    expect((await post({ scope: { kind: 'pages', pageIds: tooMany.slice(1) }, visibility: 'restricted' })).status).toBe(200);
  });

  it.each([
    ['an unknown visibility', { scope: { kind: 'pages', pageIds }, visibility: 'internal' }],
    ['no pages', { scope: { kind: 'pages', pageIds: [] }, visibility: 'public' }],
    ['a malformed page id', { scope: { kind: 'pages', pageIds: ['not-a-uuid'] }, visibility: 'public' }],
    ['a malformed folder', { scope: { kind: 'folder', pathPrefix: '/News/' }, visibility: 'public' }],
    ['an unknown field', { scope: { kind: 'pages', pageIds }, visibility: 'public', dry_run: true }],
  ])('rejects %s before changing anything', async (_name, body) => {
    expect((await post(body)).status).toBe(400);
    expect(service.setPagesVisibility).not.toHaveBeenCalled();
  });

  it('maps service errors', async () => {
    service.setPagesVisibility.mockRejectedValueOnce(new DomainError('NOT_FOUND', 'Space not found'));

    const response = await post({ scope: { kind: 'folder', space: 'nowhere' }, visibility: 'public' });

    expect(response.status).toBe(404);
  });
});
