import { beforeEach, describe, expect, it, vi } from 'vitest';
import { NextRequest } from 'next/server';

const session = vi.hoisted(() => ({ createApiContext: vi.fn() }));
const spaces = vi.hoisted(() => ({ updateSpaceConfiguration: vi.fn() }));

vi.mock('@/server/api/session', () => session);
vi.mock('@/server/services/spaces', () => spaces);

import { PUT } from './route';

const spaceId = 'a0eebc99-9c0b-4ef8-bb6d-6bb9bd380a11';

function put(body: unknown) {
  return PUT(
    new NextRequest(`http://localhost/api/settings/spaces/${spaceId}`, {
      method: 'PUT', body: JSON.stringify(body), headers: { 'content-type': 'application/json' },
    }),
    { params: Promise.resolve({ spaceId }) },
  );
}

describe('PUT /api/settings/spaces/[spaceId]', () => {
  beforeEach(() => {
    vi.clearAllMocks();
    session.createApiContext.mockResolvedValue({ actor: { kind: 'user', userId: 'admin', role: 'admin' } });
  });

  it('persists a non-empty prefix and registered default visibility through the service', async () => {
    const input = { routePrefix: 'g', defaultVisibility: 'registered' };
    spaces.updateSpaceConfiguration.mockResolvedValue({ id: spaceId, kind: 'generated', ...input });

    expect((await put(input)).status).toBe(200);
    expect(spaces.updateSpaceConfiguration).toHaveBeenCalledWith(expect.anything(), spaceId, input);
  });

  it('rejects an empty prefix before calling the service', async () => {
    expect((await put({ routePrefix: '', defaultVisibility: 'registered' })).status).toBe(400);
    expect(spaces.updateSpaceConfiguration).not.toHaveBeenCalled();
  });
});
