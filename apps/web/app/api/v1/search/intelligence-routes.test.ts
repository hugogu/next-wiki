import { NextRequest } from 'next/server';
import { describe, expect, it, vi } from 'vitest';

const publicContent = vi.hoisted(() => ({
  getStats: vi.fn(),
  findSimilar: vi.fn(),
}));

vi.mock('@/server/api/audit-wrapper', () => ({
  withApiAudit: (handler: unknown) => handler,
}));
vi.mock('@/server/api/session', () => ({
  createApiContext: vi.fn(async () => ({ actor: { kind: 'api_key', userId: 'editor', role: 'editor', scopes: ['view', 'create', 'edit', 'delete'], keyId: 'key' } })),
}));
vi.mock('@/server/services/public-content', () => publicContent);

import * as statsRoute from '../stats/route';
import * as similarRoute from './similar/route';

describe('Public Wiki intelligence routes', () => {
  it('GET /api/v1/stats delegates to getStats', async () => {
    publicContent.getStats.mockResolvedValue({
      totalPages: 10,
      publishedPages: 8,
      draftPages: 1,
      deletedPages: 1,
      recentActivity: { createdInLast7Days: 1, updatedInLast7Days: 2 },
      directories: [{ segment: 'docs', pageCount: 5 }],
    });

    const response = await statsRoute.GET(
      new NextRequest('http://localhost/api/v1/stats'),
      { params: Promise.resolve({}) },
    );

    expect(response.status).toBe(200);
    expect(publicContent.getStats).toHaveBeenCalledWith(expect.anything(), { includeOrphans: false });
  });

  it('GET /api/v1/stats?include=orphans requests orphan detection', async () => {
    publicContent.getStats.mockResolvedValue({
      totalPages: 10,
      publishedPages: 8,
      draftPages: 1,
      deletedPages: 1,
      recentActivity: { createdInLast7Days: 1, updatedInLast7Days: 2 },
      directories: [{ segment: 'docs', pageCount: 5 }],
      orphans: [],
    });

    const response = await statsRoute.GET(
      new NextRequest('http://localhost/api/v1/stats?include=orphans'),
      { params: Promise.resolve({}) },
    );

    expect(response.status).toBe(200);
    expect(publicContent.getStats).toHaveBeenCalledWith(expect.anything(), { includeOrphans: true });
  });

  it('POST /api/v1/search/similar delegates to findSimilar', async () => {
    publicContent.findSimilar.mockResolvedValue({ results: [], threshold: 0.5 });

    const response = await similarRoute.POST(
      new NextRequest('http://localhost/api/v1/search/similar', {
        method: 'POST',
        body: JSON.stringify({ title: 'payment', threshold: 0.6 }),
      }),
      { params: Promise.resolve({}) },
    );

    expect(response.status).toBe(200);
    expect(publicContent.findSimilar).toHaveBeenCalledWith(expect.anything(), { title: 'payment', threshold: 0.6 });
  });
});
