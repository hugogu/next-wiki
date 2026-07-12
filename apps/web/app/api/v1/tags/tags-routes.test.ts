import { NextRequest } from 'next/server';
import { describe, expect, it, vi } from 'vitest';
const service = vi.hoisted(() => ({ listTags: vi.fn(), createTag: vi.fn(), requestTagMutation: vi.fn() }));
vi.mock('@/server/api/audit-wrapper', () => ({ withApiAudit: (handler: unknown) => handler }));
vi.mock('@/server/api/session', () => ({ createApiContext: vi.fn(async () => ({ actor: { kind: 'api_key', userId: 'editor', role: 'editor', scopes: ['view', 'manage_tags'], keyId: 'key' } })) }));
vi.mock('@/server/services/tags', () => service);
import { GET, POST } from './route';
describe('tag collection routes', () => {
  it('lists tags and creates normalized resources', async () => {
    service.listTags.mockResolvedValue({ items: [], nextCursor: null });
    expect((await GET(new NextRequest('http://localhost/api/v1/tags?limit=5'), { params: Promise.resolve({}) })).status).toBe(200);
    service.createTag.mockResolvedValue({ id: 'tag' });
    expect((await POST(new NextRequest('http://localhost/api/v1/tags', { method: 'POST', headers: { 'content-type': 'application/json' }, body: JSON.stringify({ name: 'DevOps' }) }), { params: Promise.resolve({}) })).status).toBe(201);
  });
});
