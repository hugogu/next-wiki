import { NextRequest, NextResponse } from 'next/server';
import { describe, expect, it, vi } from 'vitest';

const getEvidenceCapture = vi.hoisted(() => vi.fn());

vi.mock('../../_shared', () => ({
  assertSupportedProvider: vi.fn(),
  publicJson: (data: unknown, init?: ResponseInit) => NextResponse.json(data, init),
  withPublicApi: (handler: unknown) => handler,
}));
vi.mock('@/server/services/hermes-memory', () => ({ getEvidenceCapture }));

import * as route from './route';

describe('GET /api/v1/hermes/memory/evidence/:captureId', () => {
  it('rejects a non-UUID capture id before reaching the service', async () => {
    const response = await route.GET(
      new NextRequest('http://localhost/api/v1/hermes/memory/evidence/not-a-uuid', {
        headers: { 'x-next-wiki-hermes-provider-version': '0.1.0' },
      }),
      { params: Promise.resolve({ captureId: 'not-a-uuid' }) },
    );

    expect(response.status).toBe(422);
    expect(getEvidenceCapture).not.toHaveBeenCalled();
  });
});
