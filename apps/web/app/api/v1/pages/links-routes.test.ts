import { NextRequest } from 'next/server';
import { describe, expect, it, vi } from 'vitest';

const publicContent = vi.hoisted(() => ({
  getOutboundLinks: vi.fn(),
}));

vi.mock('@/server/api/audit-wrapper', () => ({
  withApiAudit: (handler: unknown) => handler,
}));
vi.mock('@/server/api/session', () => ({
  createApiContext: vi.fn(async () => ({ actor: { kind: 'api_key', userId: 'reader', role: 'reader', scopes: ['view'], keyId: 'key' } })),
}));
vi.mock('@/server/services/public-content', () => publicContent);

import * as linksRoute from './[id]/links/route';

describe('Public wiki page outbound links route', () => {
  it('delegates to getOutboundLinks and returns the classified link buckets', async () => {
    const pageId = '11111111-1111-1111-1111-111111111111';
    publicContent.getOutboundLinks.mockResolvedValue({ pageId, links: [], dangling: [], external: [] });

    const response = await linksRoute.GET(
      new NextRequest(`http://localhost/api/v1/pages/${pageId}/links`),
      { params: Promise.resolve({ id: pageId }) },
    );
    const body = await response.json();

    expect(response.status).toBe(200);
    expect(publicContent.getOutboundLinks).toHaveBeenCalledWith(expect.anything(), pageId);
    expect(body).toEqual({ pageId, links: [], dangling: [], external: [] });
  });

  it('rejects a non-uuid id as a validation failure', async () => {
    const response = await linksRoute.GET(
      new NextRequest('http://localhost/api/v1/pages/not-a-uuid/links'),
      { params: Promise.resolve({ id: 'not-a-uuid' }) },
    );
    expect(response.status).toBe(422);
  });
});
