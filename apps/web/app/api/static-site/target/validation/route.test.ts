import { beforeEach, describe, expect, it, vi } from 'vitest';

const createApiContext = vi.hoisted(() => vi.fn());
const service = vi.hoisted(() => ({ validateTarget: vi.fn() }));

vi.mock('@/server/api/audit-wrapper', () => ({ withApiAudit: (handler: unknown) => handler }));
vi.mock('@/server/api/session', () => ({ createApiContext }));
vi.mock('@/server/services/static-site', () => service);

import { NextRequest } from 'next/server';
import { DomainError } from '@/server/errors';
import { POST } from './route';

const ctx = { actor: { kind: 'user' as const, userId: 'user-1', role: 'admin' as const } };
const routeCtx = { params: Promise.resolve({}) };
const bare = () =>
  new NextRequest('http://localhost/api/static-site/target/validation', { method: 'POST' });

beforeEach(() => {
  createApiContext.mockReset().mockResolvedValue(ctx);
  service.validateTarget.mockReset();
});

describe('POST /api/static-site/target/validation', () => {
  it('returns the validation result on success', async () => {
    service.validateTarget.mockResolvedValue({ ok: true, message: null });
    const response = await POST(bare(), routeCtx);
    expect(response.status).toBe(200);
    await expect(response.json()).resolves.toEqual({ ok: true, message: null });
  });

  it('returns the failure result without leaking the configured remote', async () => {
    service.validateTarget.mockResolvedValue({
      ok: false,
      message: 'fatal: could not read Username for https://github.com/owner/site.git',
    });
    const response = await POST(bare(), routeCtx);
    expect(response.status).toBe(200);
    await expect(response.json()).resolves.toEqual({
      ok: false,
      message: 'fatal: could not read Username for https://github.com/owner/site.git',
    });
  });

  it('maps a missing target to a 400', async () => {
    service.validateTarget.mockRejectedValue(
      new DomainError('BAD_REQUEST', 'Static site publishing is not configured'),
    );
    const response = await POST(bare(), routeCtx);
    expect(response.status).toBe(400);
  });

  it('maps a missing GitHub integration to a 400', async () => {
    service.validateTarget.mockRejectedValue(
      new DomainError(
        'BAD_REQUEST',
        'The GitHub integration is not configured, so there is no credential to validate with',
      ),
    );
    const response = await POST(bare(), routeCtx);
    expect(response.status).toBe(400);
  });

  it('maps a permission failure to 403 without disclosing configuration', async () => {
    service.validateTarget.mockRejectedValue(new DomainError('FORBIDDEN', 'No permission'));
    const response = await POST(bare(), routeCtx);
    expect(response.status).toBe(403);
  });
});