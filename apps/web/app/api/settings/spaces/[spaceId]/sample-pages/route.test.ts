import { beforeEach, describe, expect, it, vi } from 'vitest';
import { NextRequest } from 'next/server';

const session = vi.hoisted(() => ({ createApiContext: vi.fn() }));
const samplePages = vi.hoisted(() => ({ reinitializeSamplePages: vi.fn() }));

vi.mock('@/server/api/session', () => session);
vi.mock('@/server/services/setup-sample-pages', () => samplePages);

import { POST } from './route';

const spaceId = 'a0eebc99-9c0b-4ef8-bb6d-6bb9bd380a11';

function post() {
  return POST(
    new NextRequest(`http://localhost/api/settings/spaces/${spaceId}/sample-pages`, { method: 'POST' }),
    { params: Promise.resolve({ spaceId }) },
  );
}

describe('POST /api/settings/spaces/[spaceId]/sample-pages', () => {
  beforeEach(() => {
    vi.clearAllMocks();
    session.createApiContext.mockResolvedValue({ actor: { kind: 'user', userId: 'admin', role: 'admin' } });
  });

  it('reinitializes sample pages through the service', async () => {
    const result = { status: 'completed', pages: [], nextStep: 'summary' };
    samplePages.reinitializeSamplePages.mockResolvedValue(result);

    const response = await post();

    expect(response.status).toBe(200);
    expect(await response.json()).toEqual(result);
    expect(samplePages.reinitializeSamplePages).toHaveBeenCalledWith(expect.anything(), spaceId);
  });

  it('rejects malformed space ids before calling the service', async () => {
    const response = await POST(
      new NextRequest('http://localhost/api/settings/spaces/not-a-uuid/sample-pages', { method: 'POST' }),
      { params: Promise.resolve({ spaceId: 'not-a-uuid' }) },
    );

    expect(response.status).toBe(400);
    expect(samplePages.reinitializeSamplePages).not.toHaveBeenCalled();
  });
});
