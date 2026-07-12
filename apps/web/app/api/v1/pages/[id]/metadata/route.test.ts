import { randomUUID } from 'node:crypto';
import { NextRequest } from 'next/server';
import { describe, expect, it, vi } from 'vitest';
import { DomainError } from '@/server/errors';

const publicContent = vi.hoisted(() => ({ updatePageMetadata: vi.fn() }));
vi.mock('@/server/api/audit-wrapper', () => ({ withApiAudit: (handler: unknown) => handler }));
vi.mock('@/server/api/session', () => ({ createApiContext: vi.fn(async () => ({ actor: { kind: 'api_key', userId: 'editor', role: 'editor', scopes: ['edit'], keyId: 'key' } })) }));
vi.mock('@/server/services/public-content', () => publicContent);
import { PATCH } from './route';

describe('PATCH /v1/pages/{id}/metadata', () => {
  const id = randomUUID(); const revision = randomUUID();
  const request = (body: unknown) => new NextRequest(`http://localhost/api/v1/pages/${id}/metadata`, { method: 'PATCH', headers: { 'content-type': 'application/json' }, body: JSON.stringify(body) });
  it('validates and delegates a typed metadata patch', async () => {
    publicContent.updatePageMetadata.mockResolvedValue({ id });
    const response = await PATCH(request({ baseRevisionId: revision, tags: ['devops'], summary: 'Summary' }), { params: Promise.resolve({ id }) });
    expect(response.status).toBe(200);
    expect(publicContent.updatePageMetadata).toHaveBeenCalledWith(expect.anything(), id, expect.objectContaining({ tags: ['devops'] }));
  });
  it('returns a conflict for stale revisions', async () => {
    publicContent.updatePageMetadata.mockRejectedValueOnce(new DomainError('STALE_REVISION', 'stale'));
    expect((await PATCH(request({ baseRevisionId: revision, title: 'New' }), { params: Promise.resolve({ id }) })).status).toBe(409);
  });
});
