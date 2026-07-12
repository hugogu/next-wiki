import { randomUUID } from 'node:crypto';
import { NextRequest } from 'next/server';
import { describe, expect, it, vi } from 'vitest';
const service = vi.hoisted(() => ({ getTagMutation: vi.fn() }));
vi.mock('@/server/api/audit-wrapper', () => ({ withApiAudit: (handler: unknown) => handler }));
vi.mock('@/server/api/session', () => ({ createApiContext: vi.fn(async () => ({ actor: { kind: 'api_key', userId: 'editor', role: 'editor', scopes: ['view', 'manage_tags'], keyId: 'key' } })) }));
vi.mock('@/server/services/tags', () => service);
import { GET } from './[id]/route';
describe('tag mutation route', () => {
  it('returns requester-visible operation state', async () => {
    const id = randomUUID(); service.getTagMutation.mockResolvedValue({ id, status: 'succeeded', affectedPageCount: 0 });
    expect((await GET(new NextRequest(`http://localhost/api/v1/tag-mutations/${id}`), { params: Promise.resolve({ id }) })).status).toBe(200);
  });
});
