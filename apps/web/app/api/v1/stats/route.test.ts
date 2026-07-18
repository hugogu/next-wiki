import { NextRequest } from 'next/server';
import { describe, expect, it, vi } from 'vitest';

const publicContent = vi.hoisted(() => ({ getStats: vi.fn() }));

vi.mock('@/server/api/audit-wrapper', () => ({
  withApiAudit: (handler: unknown) => handler,
}));
vi.mock('@/server/api/session', () => ({
  createApiContext: vi.fn(async () => ({ actor: { kind: 'api_key', userId: 'admin', role: 'admin', scopes: ['view'], keyId: 'key' } })),
}));
vi.mock('@/server/services/public-content', () => publicContent);

import * as statsRoute from './route';

describe('GET /api/v1/stats', () => {
  it('forwards the requested space with the orphan option', async () => {
    publicContent.getStats.mockResolvedValue({
      totalPages: 0,
      publishedPages: 0,
      draftPages: 0,
      deletedPages: 0,
      recentActivity: { createdInLast7Days: 0, updatedInLast7Days: 0 },
      directories: [],
    });

    const response = await statsRoute.GET(
      new NextRequest('http://localhost/api/v1/stats?space=generated&include=orphans'),
      { params: Promise.resolve({}) },
    );

    expect(response.status).toBe(200);
    expect(publicContent.getStats).toHaveBeenCalledWith(expect.anything(), {
      space: 'generated',
      includeOrphans: true,
    });
  });
});
