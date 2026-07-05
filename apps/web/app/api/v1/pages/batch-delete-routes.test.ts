import { NextRequest } from 'next/server';
import { describe, expect, it, vi } from 'vitest';

const publicContent = vi.hoisted(() => ({
  batchSoftDeletePages: vi.fn(),
}));

vi.mock('@/server/api/audit-wrapper', () => ({
  withApiAudit: (handler: unknown) => handler,
}));
vi.mock('@/server/api/session', () => ({
  createApiContext: vi.fn(async () => ({ actor: { kind: 'api_key', userId: 'editor', role: 'editor', scopes: ['view', 'delete'], keyId: 'key' } })),
}));
vi.mock('@/server/services/public-content', () => publicContent);

import * as batchDeleteRoute from './batch/delete/route';

const pageId = '11111111-1111-1111-1111-111111111111';

describe('Public wiki batch delete route', () => {
  it('parses dry_run=true and forwards it to batchSoftDeletePages', async () => {
    publicContent.batchSoftDeletePages.mockResolvedValue({ results: [], successCount: 0, failureCount: 0, dryRun: true });

    const response = await batchDeleteRoute.POST(
      new NextRequest('http://localhost/api/v1/pages/batch/delete?dry_run=true', {
        method: 'POST',
        body: JSON.stringify({ pageIds: [pageId] }),
      }),
      { params: Promise.resolve({}) },
    );
    const body = await response.json();

    expect(response.status).toBe(200);
    expect(publicContent.batchSoftDeletePages).toHaveBeenCalledWith(expect.anything(), { pageIds: [pageId] }, { dryRun: true });
    expect(body.dryRun).toBe(true);
  });

  it('rejects more than 50 pageIds as a validation failure', async () => {
    const pageIds = Array.from({ length: 51 }, () => pageId);
    const response = await batchDeleteRoute.POST(
      new NextRequest('http://localhost/api/v1/pages/batch/delete', {
        method: 'POST',
        body: JSON.stringify({ pageIds }),
      }),
      { params: Promise.resolve({}) },
    );
    expect(response.status).toBe(422);
  });
});
