import { beforeEach, describe, expect, it, vi } from 'vitest';

const createApiContext = vi.hoisted(() => vi.fn());
const service = vi.hoisted(() => ({
  getTarget: vi.fn(),
  configureTarget: vi.fn(),
  deleteTarget: vi.fn(),
}));

// The audit wrapper reads request headers, which have no scope outside a real
// request; the established convention in this suite is to unwrap it.
vi.mock('@/server/api/audit-wrapper', () => ({ withApiAudit: (handler: unknown) => handler }));
vi.mock('@/server/api/session', () => ({ createApiContext }));
vi.mock('@/server/services/static-site', () => service);

import { NextRequest } from 'next/server';
import { DomainError } from '@/server/errors';
import { DELETE, GET, PUT } from './route';

const ctx = { actor: { kind: 'user' as const, userId: 'user-1', role: 'admin' as const } };

const view = {
  id: 'target-1',
  isEnabled: false,
  remoteUrl: 'https://github.com/owner/site.git',
  branch: 'gh-pages',
  baseUrl: 'https://owner.github.io/site/',
  authMode: 'https_token' as const,
  username: null,
  hasSecret: true,
  publicKey: null,
  fingerprint: null,
  autoPublishOnChange: false,
  scheduledPublishEnabled: false,
  scheduledIntervalMinutes: 60,
  isStale: false,
  lastPublication: null,
};

function body(overrides: Record<string, unknown> = {}) {
  return {
    isEnabled: false,
    remoteUrl: 'https://github.com/owner/site.git',
    branch: 'gh-pages',
    baseUrl: 'https://owner.github.io/site/',
    authMode: 'https_token',
    ...overrides,
  };
}

function put(payload: unknown): NextRequest {
  return new NextRequest('http://localhost/api/static-site/target', {
    method: 'PUT',
    body: JSON.stringify(payload),
    headers: { 'content-type': 'application/json' },
  });
}

// The exported handlers carry the wrapper's RouteHandler signature even though
// the wrapper is mocked away, so calls supply both arguments.
const routeCtx = { params: Promise.resolve({}) };
const bare = () => new NextRequest('http://localhost/api/static-site/target');

beforeEach(() => {
  createApiContext.mockReset().mockResolvedValue(ctx);
  service.getTarget.mockReset().mockResolvedValue(view);
  service.configureTarget.mockReset().mockResolvedValue({ view, queuedPublicationId: null });
  service.deleteTarget.mockReset().mockResolvedValue(undefined);
});

describe('GET /api/static-site/target', () => {
  it('returns the masked view', async () => {
    const response = await GET(bare(), routeCtx);
    expect(response.status).toBe(200);
    await expect(response.json()).resolves.toEqual(view);
  });

  it('returns null when unconfigured', async () => {
    service.getTarget.mockResolvedValue(null);
    await expect((await GET(bare(), routeCtx)).json()).resolves.toBeNull();
  });

  it('maps a permission failure to its domain status without leaking configuration', async () => {
    service.getTarget.mockRejectedValue(new DomainError('FORBIDDEN', 'No permission'));
    const response = await GET(bare(), routeCtx);
    expect(response.status).toBe(403);
    expect(JSON.stringify(await response.json())).not.toContain('github.com');
  });
});

describe('PUT /api/static-site/target', () => {
  it('saves a disabled target with 200', async () => {
    const response = await PUT(put(body()), routeCtx);
    expect(response.status).toBe(200);
  });

  it('returns 202 when enabling, because the publish is queued rather than done', async () => {
    service.configureTarget.mockResolvedValue({ view, queuedPublicationId: 'run-1' });
    const response = await PUT(put(body({ isEnabled: true, secret: 'token' })), routeCtx);
    expect(response.status).toBe(202);
  });

  it('rejects a remote with embedded credentials', async () => {
    const response = await PUT(put(body({ remoteUrl: 'https://u:p@github.com/o/r.git' })), routeCtx);
    expect(response.status).toBe(400);
    expect(service.configureTarget).not.toHaveBeenCalled();
  });

  it('rejects a base address that is not an absolute http(s) URL', async () => {
    const response = await PUT(put(body({ baseUrl: '/site/' })), routeCtx);
    expect(response.status).toBe(400);
    expect(service.configureTarget).not.toHaveBeenCalled();
  });

  it('rejects an invalid branch name', async () => {
    const response = await PUT(put(body({ branch: 'bad branch' })), routeCtx);
    expect(response.status).toBe(400);
  });

  it('rejects a malformed body', async () => {
    const response = await PUT(put({ nonsense: true }), routeCtx);
    expect(response.status).toBe(400);
  });

  it('never echoes the submitted secret back', async () => {
    const response = await PUT(put(body({ secret: 'ghp_do_not_echo' })), routeCtx);
    expect(JSON.stringify(await response.json())).not.toContain('ghp_do_not_echo');
  });
});

describe('DELETE /api/static-site/target', () => {
  it('returns 204 and destroys the configuration', async () => {
    const response = await DELETE(bare(), routeCtx);
    expect(response.status).toBe(204);
    expect(service.deleteTarget).toHaveBeenCalledWith(ctx);
  });

  it('maps a permission failure', async () => {
    service.deleteTarget.mockRejectedValue(new DomainError('FORBIDDEN', 'No permission'));
    expect((await DELETE(bare(), routeCtx)).status).toBe(403);
  });
});
