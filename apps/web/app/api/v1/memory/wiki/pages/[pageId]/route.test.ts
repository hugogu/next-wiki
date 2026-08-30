import { NextRequest, NextResponse } from 'next/server';
import { describe, expect, it, vi } from 'vitest';

const readKnowledgePage = vi.hoisted(() => vi.fn());

vi.mock('../../../_shared', () => ({
  assertSupportedProvider: vi.fn(),
}));
vi.mock('../../../../_shared/route', () => ({
  withPublicApi: (handler: unknown) => handler,
  parsePublicQuery: (request: NextRequest, schema: { safeParse: (value: unknown) => { success: boolean; data?: unknown } }) => {
    const params = new URL(request.url).searchParams;
    const parsed = schema.safeParse({ maxChars: params.get('maxChars') ?? undefined });
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
vi.mock('@/server/services/agent-memory-documents', () => ({ readKnowledgePage }));

import * as route from './route';

describe('GET /api/v1/memory/wiki/pages/:pageId', () => {
  it('passes the selected page and bounded read length to the reauthorizing facade', async () => {
    readKnowledgePage.mockResolvedValue({ pageId: 'page-id', revisionId: 'revision-id', content: '# Profile', truncated: false });

    const response = await route.GET(new NextRequest('http://localhost/api/v1/memory/wiki/pages/page-id?maxChars=1200'), { params: Promise.resolve({ pageId: 'page-id' }) });

    expect(response.status).toBe(200);
    expect(response.headers.get('cache-control')).toBe('private, no-store');
    await expect(response.json()).resolves.toMatchObject({ pageId: 'page-id', content: '# Profile' });
    expect(readKnowledgePage).toHaveBeenCalledWith(expect.anything(), 'page-id', 1200);
  });

  it('rejects an out-of-range read length before invoking the facade', async () => {
    const response = await route.GET(new NextRequest('http://localhost/api/v1/memory/wiki/pages/page-id?maxChars=0'), { params: Promise.resolve({ pageId: 'page-id' }) });

    expect(response.status).toBe(422);
    expect(readKnowledgePage).not.toHaveBeenCalled();
  });
});
