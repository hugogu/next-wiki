import { NextRequest, NextResponse } from 'next/server';
import { describe, expect, it, vi } from 'vitest';

const getMirrorConnection = vi.hoisted(() => vi.fn());

vi.mock('../../_shared', () => ({
  assertSupportedProvider: vi.fn(),
}));
vi.mock('../../../_shared/route', () => ({
  withPublicApi: (handler: unknown) => handler,
  publicJson: (data: unknown, init?: ResponseInit) => {
    const headers = new Headers(init?.headers);
    headers.set('Cache-Control', 'private, no-store');
    return NextResponse.json(data, { ...init, headers });
  },
}));
vi.mock('@/server/services/agent-memory-documents', () => ({ getMirrorConnection }));

import * as route from './route';

describe('GET /api/v1/memory/wiki/connection', () => {
  it('returns content-free capabilities with private caching disabled', async () => {
    getMirrorConnection.mockResolvedValue({
      apiVersion: 'v1', provider: 'next-wiki', bindingPurpose: 'mirror',
      capabilities: { mirror: true, immutableRevisions: true, currentOnly: true },
    });

    const response = await route.GET(new NextRequest('http://localhost/api/v1/memory/wiki/connection'), { params: Promise.resolve({}) });

    expect(response.status).toBe(200);
    expect(response.headers.get('cache-control')).toBe('private, no-store');
    await expect(response.json()).resolves.toMatchObject({ bindingPurpose: 'mirror', capabilities: { currentOnly: true } });
  });
});
