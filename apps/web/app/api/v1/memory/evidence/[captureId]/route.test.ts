import { NextRequest, NextResponse } from 'next/server';
import { describe, expect, it, vi } from 'vitest';

const getEvidenceCapture = vi.hoisted(() => vi.fn());

vi.mock('../../_shared', () => ({
  assertSupportedProvider: vi.fn(),
  publicJson: (data: unknown, init?: ResponseInit) => NextResponse.json(data, init),
  withPublicApi: (handler: unknown) => handler,
}));
vi.mock('@/server/services/agent-memory-captures', () => ({ getEvidenceCapture }));

import * as route from './route';

describe('GET /api/v1/memory/evidence/:captureId', () => {
  it('rejects a non-UUID capture id before reaching the service', async () => {
    const response = await route.GET(
      new NextRequest('http://localhost/api/v1/memory/evidence/not-a-uuid', {
        headers: { 'x-next-wiki-memory-provider-version': '0.1.0' },
      }),
      { params: Promise.resolve({ captureId: 'not-a-uuid' }) },
    );

    expect(response.status).toBe(422);
    expect(getEvidenceCapture).not.toHaveBeenCalled();
  });

  it('returns the service result for a valid capture id', async () => {
    const captureId = '3d6f0a9b-6a2b-4a9d-9e3e-1ddc7f7a1c12';
    getEvidenceCapture.mockResolvedValue({ captureId, status: 'durable', durable: true });
    const response = await route.GET(
      new NextRequest(`http://localhost/api/v1/memory/evidence/${captureId}`, {
        headers: { 'x-next-wiki-memory-provider-version': '0.1.0' },
      }),
      { params: Promise.resolve({ captureId }) },
    );

    expect(response.status).toBe(200);
    expect(getEvidenceCapture).toHaveBeenCalledWith(undefined, captureId);
  });
});
