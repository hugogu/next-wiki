import { beforeEach, describe, expect, it, vi } from 'vitest';
import { NextRequest } from 'next/server';

const session = vi.hoisted(() => ({ createApiContext: vi.fn() }));
const pages = vi.hoisted(() => ({ setVisibility: vi.fn() }));

vi.mock('@/server/api/session', () => session);
vi.mock('@/server/services/pages', () => pages);

import { PUT } from './route';

const pageId = 'a0eebc99-9c0b-4ef8-bb6d-6bb9bd380a11';

function put(visibility: unknown) {
  return PUT(
    new NextRequest(`http://localhost/api/pages/${pageId}/visibility`, {
      method: 'PUT',
      body: JSON.stringify({ visibility }),
      headers: { 'content-type': 'application/json' },
    }),
    { params: Promise.resolve({ pageId }) },
  );
}

describe('PUT /api/pages/[pageId]/visibility', () => {
  beforeEach(() => {
    vi.clearAllMocks();
    session.createApiContext.mockResolvedValue({ actor: { kind: 'user', userId: 'admin', role: 'admin' } });
  });

  it('accepts registered visibility and delegates authorization to the page service', async () => {
    pages.setVisibility.mockResolvedValue('registered');

    const response = await put('registered');

    expect(response.status).toBe(200);
    await expect(response.json()).resolves.toEqual({ visibility: 'registered' });
    expect(pages.setVisibility).toHaveBeenCalledWith(expect.anything(), pageId, 'registered');
  });

  it('rejects unknown visibility values before mutating a page', async () => {
    expect((await put('internal')).status).toBe(400);
    expect(pages.setVisibility).not.toHaveBeenCalled();
  });
});
