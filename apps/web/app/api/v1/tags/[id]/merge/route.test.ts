import { NextRequest } from 'next/server';
import { describe, expect, it, vi } from 'vitest';

const service = vi.hoisted(() => ({ requestTagMerge: vi.fn() }));
vi.mock('@/server/api/audit-wrapper', () => ({ withApiAudit: (handler: unknown) => handler }));
vi.mock('@/server/api/session', () => ({ createApiContext: vi.fn(async () => ({ actor: { kind: 'api_key', userId: 'editor', role: 'editor', scopes: ['manage_tags'], keyId: 'key' } })) }));
vi.mock('@/server/services/tags', () => service);

import { POST } from './route';

describe('tag merge route', () => {
  it('queues a merge into an existing target tag', async () => {
    const sourceId = 'a0eebc99-9c0b-4ef8-bb6d-6bb9bd380a11';
    const targetTagId = 'b0eebc99-9c0b-4ef8-bb6d-6bb9bd380a22';
    service.requestTagMerge.mockResolvedValue({ id: 'mutation', status: 'queued' });
    const response = await POST(new NextRequest(`http://localhost/api/v1/tags/${sourceId}/merge`, {
      method: 'POST',
      headers: { 'content-type': 'application/json' },
      body: JSON.stringify({ targetTagId }),
    }), { params: Promise.resolve({ id: sourceId }) });
    expect(response.status).toBe(202);
    expect(service.requestTagMerge).toHaveBeenCalledWith(expect.anything(), sourceId, targetTagId);
  });
});
