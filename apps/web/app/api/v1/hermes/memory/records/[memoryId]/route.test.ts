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
});
