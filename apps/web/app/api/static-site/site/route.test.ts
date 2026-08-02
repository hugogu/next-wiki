import { beforeEach, describe, expect, it, vi } from 'vitest';

const createApiContext = vi.hoisted(() => vi.fn());
const service = vi.hoisted(() => ({ takeDownSite: vi.fn() }));

vi.mock('@/server/api/audit-wrapper', () => ({ withApiAudit: (handler: unknown) => handler }));
vi.mock('@/server/api/session', () => ({ createApiContext }));
vi.mock('@/server/services/static-site', () => service);

import { NextRequest } from 'next/server';
import { DomainError } from '@/server/errors';
import { DELETE } from './route';

const ctx = { actor: { kind: 'user' as const, userId: 'u1', role: 'admin' as const } };
const routeCtx = { params: Promise.resolve({}) };
const run = {
  id: 'run-1',
  status: 'queued' as const,
  trigger: 'takedown' as const,
  startedAt: null,
  completedAt: null,
  pagesPublished: 0,
  assetsPublished: 0,
  pagesExcluded: 0,
  exclusionsByReason: {},
  bytesTotal: 0,
  commitSha: null,
  forcedPush: false,
  errorMessage: null,
};

const del = (body: unknown) =>
  DELETE(
    new NextRequest('http://localhost/api/static-site/site', {
      method: 'DELETE',
      body: JSON.stringify(body),
      headers: { 'content-type': 'application/json' },
    }),
    routeCtx,
  );

beforeEach(() => {
  createApiContext.mockReset().mockResolvedValue(ctx);
  service.takeDownSite.mockReset().mockResolvedValue(run);
});

describe('DELETE /api/static-site/site', () => {
  it('queues the takedown and returns 202, because removal is background work', async () => {
    const response = await del({ confirm: 'gh-pages' });
    expect(response.status).toBe(202);
    expect(service.takeDownSite).toHaveBeenCalledWith(ctx, 'gh-pages');
  });

  it('rejects a request with no confirmation', async () => {
    // A stray or replayed DELETE must not be able to unpublish a live site.
    const response = await del({});
    expect(response.status).toBe(400);
    expect(service.takeDownSite).not.toHaveBeenCalled();
  });

  it('rejects an empty confirmation string', async () => {
    expect((await del({ confirm: '' })).status).toBe(400);
    expect(service.takeDownSite).not.toHaveBeenCalled();
  });

  it('maps a wrong confirmation to the service error', async () => {
    service.takeDownSite.mockRejectedValue(new DomainError('BAD_REQUEST', 'Type the branch name'));
    expect((await del({ confirm: 'nope' })).status).toBe(400);
  });

  it('maps a permission failure', async () => {
    service.takeDownSite.mockRejectedValue(new DomainError('FORBIDDEN', 'No permission'));
    expect((await del({ confirm: 'gh-pages' })).status).toBe(403);
  });
});
