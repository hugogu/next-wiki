import { NextRequest } from 'next/server';
import { describe, expect, it, vi } from 'vitest';

const publicContent = vi.hoisted(() => ({
  batchUpdatePages: vi.fn(),
}));

vi.mock('@/server/api/audit-wrapper', () => ({
  withApiAudit: (handler: unknown) => handler,
}));
vi.mock('@/server/api/session', () => ({
  createApiContext: vi.fn(async () => ({ actor: { kind: 'api_key', userId: 'editor', role: 'editor', scopes: ['view', 'edit'], keyId: 'key' } })),
}));
vi.mock('@/server/services/public-content', () => publicContent);

import * as batchUpdateRoute from './batch/update/route';

const pageId = '11111111-1111-1111-1111-111111111111';
const revisionId = '22222222-2222-2222-2222-222222222222';

describe('Public wiki batch update route', () => {
  it('parses dry_run=true and forwards it to batchUpdatePages', async () => {
    publicContent.batchUpdatePages.mockResolvedValue({ results: [], successCount: 0, failureCount: 0, dryRun: true });

    const response = await batchUpdateRoute.POST(
      new NextRequest('http://localhost/api/v1/pages/batch/update?dry_run=true', {
        method: 'POST',
        body: JSON.stringify({ items: [{ pageId, title: 'New title', baseRevisionId: revisionId }] }),
      }),
      { params: Promise.resolve({}) },
    );
    const body = await response.json();

    expect(response.status).toBe(200);
    expect(publicContent.batchUpdatePages).toHaveBeenCalledWith(
      expect.anything(),
      { items: [{ pageId, title: 'New title', baseRevisionId: revisionId }] },
      { dryRun: true },
    );
    expect(body.dryRun).toBe(true);
  });

  it('defaults dry_run to false when absent', async () => {
    publicContent.batchUpdatePages.mockResolvedValue({ results: [], successCount: 0, failureCount: 0 });

    await batchUpdateRoute.POST(
      new NextRequest('http://localhost/api/v1/pages/batch/update', {
        method: 'POST',
        body: JSON.stringify({ items: [{ pageId, baseRevisionId: revisionId }] }),
      }),
      { params: Promise.resolve({}) },
    );

    expect(publicContent.batchUpdatePages).toHaveBeenCalledWith(expect.anything(), expect.anything(), { dryRun: false });
  });

  it('rejects more than 50 items as a validation failure', async () => {
    const items = Array.from({ length: 51 }, () => ({ pageId, baseRevisionId: revisionId }));
    const response = await batchUpdateRoute.POST(
      new NextRequest('http://localhost/api/v1/pages/batch/update', {
        method: 'POST',
        body: JSON.stringify({ items }),
      }),
      { params: Promise.resolve({}) },
    );
    expect(response.status).toBe(422);
  });

  it('rejects an empty items array as a validation failure', async () => {
    const response = await batchUpdateRoute.POST(
      new NextRequest('http://localhost/api/v1/pages/batch/update', {
        method: 'POST',
        body: JSON.stringify({ items: [] }),
      }),
      { params: Promise.resolve({}) },
    );
    expect(response.status).toBe(422);
  });
});
