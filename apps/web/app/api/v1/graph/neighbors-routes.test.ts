import { NextRequest } from 'next/server';
import { describe, expect, it, vi } from 'vitest';

const publicContent = vi.hoisted(() => ({
  getNeighborhood: vi.fn(),
}));

vi.mock('@/server/api/audit-wrapper', () => ({
  withApiAudit: (handler: unknown) => handler,
}));
vi.mock('@/server/api/session', () => ({
  createApiContext: vi.fn(async () => ({ actor: { kind: 'api_key', userId: 'reader', role: 'reader', scopes: ['view'], keyId: 'key' } })),
}));
vi.mock('@/server/services/public-content', () => publicContent);

import * as neighborsRoute from './neighbors/route';

describe('Public wiki page graph neighbors route', () => {
  const nodeId = '11111111-1111-1111-1111-111111111111';

  it('parses node/depth/direction and delegates to getNeighborhood', async () => {
    publicContent.getNeighborhood.mockResolvedValue({
      root: { pageId: nodeId, path: 'a', title: 'A' },
      tiers: [[{ pageId: nodeId, path: 'a', title: 'A' }]],
    });

    const response = await neighborsRoute.GET(
      new NextRequest(`http://localhost/api/v1/graph/neighbors?node=${nodeId}&depth=2&direction=both`),
      { params: Promise.resolve({}) },
    );
    const body = await response.json();

    expect(response.status).toBe(200);
    expect(publicContent.getNeighborhood).toHaveBeenCalledWith(expect.anything(), nodeId, 2, 'both');
    expect(body.root).toMatchObject({ path: 'a' });
  });

  it('defaults depth to 1 and direction to out', async () => {
    publicContent.getNeighborhood.mockResolvedValue({ root: { pageId: nodeId, path: 'a', title: 'A' }, tiers: [] });

    await neighborsRoute.GET(
      new NextRequest(`http://localhost/api/v1/graph/neighbors?node=${nodeId}`),
      { params: Promise.resolve({}) },
    );

    expect(publicContent.getNeighborhood).toHaveBeenCalledWith(expect.anything(), nodeId, 1, 'out');
  });

  it('rejects depth=4 as a validation failure (out of the 1-3 bound)', async () => {
    const response = await neighborsRoute.GET(
      new NextRequest(`http://localhost/api/v1/graph/neighbors?node=${nodeId}&depth=4`),
      { params: Promise.resolve({}) },
    );
    expect(response.status).toBe(422);
  });

  it('rejects a missing node param as a validation failure', async () => {
    const response = await neighborsRoute.GET(
      new NextRequest('http://localhost/api/v1/graph/neighbors'),
      { params: Promise.resolve({}) },
    );
    expect(response.status).toBe(422);
  });
});
