import { beforeEach, describe, expect, it, vi } from 'vitest';

const createApiContext = vi.hoisted(() => vi.fn());
const assertCanManageStaticSite = vi.hoisted(() => vi.fn());
const summarizeEligibility = vi.hoisted(() => vi.fn());

vi.mock('@/server/api/audit-wrapper', () => ({ withApiAudit: (handler: unknown) => handler }));
vi.mock('@/server/api/session', () => ({ createApiContext }));
vi.mock('@/server/services/static-site', () => ({ assertCanManageStaticSite }));
vi.mock('@/server/static-site/eligibility', () => ({ summarizeEligibility }));

import { NextRequest } from 'next/server';
import { DomainError } from '@/server/errors';
import { GET } from './route';

const adminCtx = { actor: { kind: 'user' as const, userId: 'admin-1', role: 'admin' as const } };
const readerCtx = { actor: { kind: 'user' as const, userId: 'reader-1', role: 'reader' as const } };
const routeCtx = { params: Promise.resolve({}) };

beforeEach(() => {
  createApiContext.mockReset().mockResolvedValue(adminCtx);
  assertCanManageStaticSite.mockReset();
  summarizeEligibility.mockReset().mockResolvedValue({
    publishable: 2,
    excluded: 3,
    exclusionsByReason: {
      restricted: 1,
      space_kind_raw: 1,
      space_kind_generated: 1,
    },
  });
});

describe('GET /api/static-site/eligibility', () => {
  it('returns counts and reasons without titles or paths', async () => {
    const response = await GET(
      new NextRequest('http://localhost/api/static-site/eligibility'),
      routeCtx,
    );

    expect(response.status).toBe(200);
    const body = await response.json();
    expect(body).toEqual({
      publishable: 2,
      excluded: 3,
      exclusionsByReason: {
        restricted: 1,
        space_kind_raw: 1,
        space_kind_generated: 1,
      },
    });
    expect(JSON.stringify(body)).not.toMatch(/title|path/i);
    expect(assertCanManageStaticSite).toHaveBeenCalledWith(adminCtx);
  });

  it('is admin-only', async () => {
    createApiContext.mockResolvedValue(readerCtx);
    assertCanManageStaticSite.mockImplementation(() => {
      throw new DomainError('FORBIDDEN', 'No permission');
    });

    const response = await GET(
      new NextRequest('http://localhost/api/static-site/eligibility'),
      routeCtx,
    );

    expect(response.status).toBe(403);
    expect(summarizeEligibility).not.toHaveBeenCalled();
  });
});
