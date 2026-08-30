import { NextRequest, NextResponse } from 'next/server';
import { describe, expect, it, vi } from 'vitest';

const searchKnowledge = vi.hoisted(() => vi.fn());

vi.mock('../../_shared', () => ({
  assertSupportedProvider: vi.fn(),
}));
vi.mock('../../../_shared/route', () => ({
  withPublicApi: (handler: unknown) => handler,
  parsePublicQuery: (request: NextRequest, schema: { safeParse: (value: unknown) => { success: boolean; data?: unknown } }) => {
    const params = new URL(request.url).searchParams;
    const parsed = schema.safeParse({ q: params.get('q'), limit: params.get('limit') ?? undefined });
    return parsed.success
      ? { ok: true, data: parsed.data }
      : { ok: false, response: NextResponse.json({ error: 'VALIDATION_FAILED' }, { status: 422 }) };
  },
  publicJson: (data: unknown, init?: ResponseInit) => {
    const headers = new Headers(init?.headers);
    headers.set('Cache-Control', 'private, no-store');
    return NextResponse.json(data, { ...init, headers });
  },
}));
vi.mock('@/server/services/agent-memory-documents', () => ({ searchKnowledge }));

import * as route from './route';

describe('GET /api/v1/memory/wiki/search', () => {
  it('returns current readable results and safe coverage without caching', async () => {
    searchKnowledge.mockResolvedValue({
      results: [{ pageId: 'page-id', revisionId: 'revision-id', revisionHash: 'a'.repeat(64), space: 'wiki', title: 'Profile', path: 'profile', excerpt: '...', score: 1, canonicalUrl: 'https://wiki.example/profile' }],
      coverage: { wiki: true, raw: false, generated: false, complete: false },
    });

    const response = await route.GET(new NextRequest('http://localhost/api/v1/memory/wiki/search?q=profile&limit=5'), { params: Promise.resolve({}) });

    expect(response.status).toBe(200);
    expect(response.headers.get('cache-control')).toBe('private, no-store');
    await expect(response.json()).resolves.toMatchObject({ coverage: { complete: false }, results: [{ pageId: 'page-id' }] });
    expect(searchKnowledge).toHaveBeenCalledWith(expect.anything(), 'profile', 5);
  });

  it('rejects an empty query before invoking the knowledge service', async () => {
    const response = await route.GET(new NextRequest('http://localhost/api/v1/memory/wiki/search?q='), { params: Promise.resolve({}) });

    expect(response.status).toBe(422);
    expect(searchKnowledge).not.toHaveBeenCalled();
  });
});
