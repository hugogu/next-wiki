import { beforeEach, describe, expect, it, vi } from 'vitest';
import { NextRequest } from 'next/server';
import { DomainError } from '@/server/errors';

const session = vi.hoisted(() => ({ createApiContext: vi.fn() }));
const service = vi.hoisted(() => ({ moveToSpace: vi.fn() }));

vi.mock('@/server/api/audit-wrapper', () => ({ withApiAudit: (handler: unknown) => handler }));
vi.mock('@/server/api/session', () => session);
vi.mock('@/server/services/pages', () => service);

import { POST } from './route';

const VALID_ID = 'a0eebc99-9c0b-4ef8-bb6d-6bb9bd380a11';
const context = { params: Promise.resolve({ id: VALID_ID }) };
const post = (body: unknown, id = VALID_ID) =>
  POST(
    new NextRequest(`http://localhost/api/admin/pages/${id}/move`, {
      method: 'POST', body: JSON.stringify(body), headers: { 'content-type': 'application/json' },
    }),
    { params: Promise.resolve({ id }) },
  );

describe('POST /api/admin/pages/[id]/move', () => {
  beforeEach(() => {
    vi.clearAllMocks();
    session.createApiContext.mockResolvedValue({ actor: { kind: 'user', userId: 'admin', role: 'admin' } });
  });

  it('moves the page for an admin', async () => {
    service.moveToSpace.mockResolvedValue({ pageId: VALID_ID, targetSpace: 'generated', path: 'imported/x' });
    const response = await POST(new NextRequest('http://localhost/x', {
      method: 'POST', body: JSON.stringify({ targetSpace: 'generated', visibility: 'restricted' }), headers: { 'content-type': 'application/json' },
    }), context);
    expect(response.status).toBe(200);
    expect(service.moveToSpace).toHaveBeenCalledWith(expect.anything(), VALID_ID, { targetSpace: 'generated', visibility: 'restricted' });
  });

  it('rejects non-admin callers', async () => {
    session.createApiContext.mockResolvedValue({ actor: { kind: 'user', userId: 'e', role: 'editor' } });
    expect((await post({ targetSpace: 'generated' })).status).toBe(403);
    expect(service.moveToSpace).not.toHaveBeenCalled();
  });

  it('rejects an invalid id and an invalid target space', async () => {
    expect((await post({ targetSpace: 'generated' }, 'not-a-uuid')).status).toBe(400);
    expect((await post({ targetSpace: 'raw' })).status).toBe(400);
  });

  it('maps move errors', async () => {
    service.moveToSpace.mockRejectedValueOnce(new DomainError('PAGE_SPACE_MOVE_INVALID', 'nope'));
    expect((await post({ targetSpace: 'generated' })).status).toBe(422);
    service.moveToSpace.mockRejectedValueOnce(new DomainError('PAGE_PATH_CONFLICT', 'dup'));
    expect((await post({ targetSpace: 'generated' })).status).toBe(409);
  });
});
