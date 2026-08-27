import { NextRequest, NextResponse } from 'next/server';
import { describe, expect, it, vi } from 'vitest';

const forget = vi.hoisted(() => vi.fn());

vi.mock('../../_shared', () => ({
  assertSupportedProvider: vi.fn(),
  publicJson: (data: unknown, init?: ResponseInit) => NextResponse.json(data, init),
  withPublicApi: (handler: unknown) => handler,
}));
vi.mock('@/server/services/hermes-memory', () => ({ forget }));

import * as route from './route';

describe('DELETE /api/v1/hermes/memory/records/:memoryId', () => {
  it('rejects a non-UUID memory id before reaching the service', async () => {
    const response = await route.DELETE(
      new NextRequest('http://localhost/api/v1/hermes/memory/records/not-a-uuid', {
        method: 'DELETE',
        headers: { 'x-next-wiki-hermes-provider-version': '0.1.0' },
      }),
      { params: Promise.resolve({ memoryId: 'not-a-uuid' }) },
    );

    expect(response.status).toBe(422);
    expect(forget).not.toHaveBeenCalled();
  });

  it('accepts an empty body when the optional reason is omitted', async () => {
    const memoryId = '3d6f0a9b-6a2b-4a9d-9e3e-1ddc7f7a1c12';
    forget.mockResolvedValue({ memoryId, state: 'forgotten', forgottenAt: '2026-08-27T00:00:00.000Z' });
    const response = await route.DELETE(
      new NextRequest(`http://localhost/api/v1/hermes/memory/records/${memoryId}`, {
        method: 'DELETE',
        headers: { 'x-next-wiki-hermes-provider-version': '0.1.0' },
      }),
      { params: Promise.resolve({ memoryId }) },
    );

    expect(response.status).toBe(200);
    expect(forget).toHaveBeenCalledWith(undefined, memoryId);
  });
});
