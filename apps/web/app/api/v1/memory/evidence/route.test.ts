import { NextRequest, NextResponse } from 'next/server';
import { describe, expect, it, vi } from 'vitest';

const submitEvidenceCapture = vi.hoisted(() => vi.fn());

vi.mock('../_shared', () => ({
  assertSupportedProvider: vi.fn(),
  publicJson: (data: unknown, init?: ResponseInit) => NextResponse.json(data, init),
  withPublicApi: (handler: unknown) => handler,
}));
vi.mock('@/server/services/agent-memory-captures', () => ({ submitEvidenceCapture }));

import * as route from './route';

describe('POST /api/v1/memory/evidence', () => {
  it('returns an origin-relative poll URL for the versioned API', async () => {
    const captureId = '3d6f0a9b-6a2b-4a9d-9e3e-1ddc7f7a1c12';
    submitEvidenceCapture.mockResolvedValue({ captureId, status: 'queued', idempotent: false });
    const response = await route.POST(
      new NextRequest('http://localhost/api/v1/memory/evidence', {
        method: 'POST',
        headers: { 'content-type': 'application/json' },
        body: JSON.stringify({
          idempotencyKey: 'capture-1',
          sessionDigest: 'a'.repeat(64),
          checkpoint: false,
          messages: [{ role: 'user', content: 'Remember this.' }],
        }),
      }),
      { params: Promise.resolve({}) },
    );

    expect(response.status).toBe(202);
    await expect(response.json()).resolves.toMatchObject({
      captureId,
      pollUrl: `/api/v1/memory/evidence/${captureId}`,
    });
  });
});
