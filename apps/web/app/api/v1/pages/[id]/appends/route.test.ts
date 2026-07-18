import { randomUUID } from 'node:crypto';
import { NextRequest } from 'next/server';
import { beforeEach, describe, expect, it, vi } from 'vitest';
import { DomainError } from '@/server/errors';

const publicContent = vi.hoisted(() => ({ appendRawEntry: vi.fn() }));
vi.mock('@/server/api/audit-wrapper', () => ({ withApiAudit: (handler: unknown) => handler }));
vi.mock('@/server/api/session', () => ({
  createApiContext: vi.fn(async () => ({ actor: { kind: 'api_key', userId: 'admin', role: 'admin', scopes: ['view', 'create'], keyId: 'key' } })),
}));
vi.mock('@/server/services/public-content', () => publicContent);

import { POST } from './route';

const id = randomUUID();

function request(body: unknown) {
  return new NextRequest(`http://localhost/api/v1/pages/${id}/appends`, {
    method: 'POST',
    headers: { 'content-type': 'application/json' },
    body: JSON.stringify(body),
  });
}

describe('POST /v1/pages/{id}/appends', () => {
  beforeEach(() => {
    vi.clearAllMocks();
  });

  it('returns the complete published revision resource', async () => {
    const revision = {
      id: randomUUID(),
      pageId: id,
      version: 2,
      status: 'published',
      origin: { actorKind: 'machine', nature: 'original' },
      source: { channel: 'support', sessionId: 'session-1' },
    };
    publicContent.appendRawEntry.mockResolvedValueOnce(revision);

    const response = await POST(request({ content: 'Follow-up', source: revision.source }), { params: Promise.resolve({ id }) });

    expect(response.status).toBe(201);
    await expect(response.json()).resolves.toMatchObject(revision);
    expect(publicContent.appendRawEntry).toHaveBeenCalledWith(expect.anything(), id, {
      content: 'Follow-up', source: revision.source,
    });
  });

  it('validates the append body before invoking the service', async () => {
    const response = await POST(request({ content: '' }), { params: Promise.resolve({ id }) });
    expect(response.status).toBe(422);
    expect(publicContent.appendRawEntry).not.toHaveBeenCalled();
  });

  it.each([
    ['SPACE_FORBIDDEN', 403],
    ['MODE_SWITCH_IN_PROGRESS', 409],
  ] as const)('maps %s errors', async (code, status) => {
    publicContent.appendRawEntry.mockRejectedValueOnce(new DomainError(code, code));
    const response = await POST(request({ content: 'Chunk' }), { params: Promise.resolve({ id }) });
    expect(response.status).toBe(status);
    await expect(response.json()).resolves.toMatchObject({ code });
  });
});
