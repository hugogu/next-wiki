import { createHash } from 'node:crypto';
import { NextRequest, NextResponse } from 'next/server';
import { describe, expect, it, vi } from 'vitest';

const upsertSourceDocument = vi.hoisted(() => vi.fn());

vi.mock('../../_shared', () => ({
  assertSupportedProvider: vi.fn(),
}));
vi.mock('../../../_shared/route', () => ({
  withPublicApi: (handler: unknown) => handler,
  parsePublicJson: async (request: NextRequest, schema: { safeParse: (value: unknown) => { success: boolean; data?: unknown } }) => {
    const parsed = schema.safeParse(await request.json());
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
vi.mock('@/server/services/agent-memory-documents', () => ({ upsertSourceDocument }));

import * as route from './route';

describe('PUT /api/v1/memory/wiki/documents', () => {
  it('validates a complete snapshot and returns an uncached outcome', async () => {
    const content = '---\ntags: [personal]\n---\n\n# Profile\n';
    const sourceDigest = createHash('sha256').update(content).digest('hex');
    upsertSourceDocument.mockResolvedValue({
      outcome: 'created',
      sourcePath: 'entities/alex.md',
      pageId: 'page-id',
      revisionId: 'revision-id',
    });

    const response = await route.PUT(new NextRequest('http://localhost/api/v1/memory/wiki/documents', {
      method: 'PUT',
      headers: { 'content-type': 'application/json', 'x-next-wiki-memory-provider-version': '1' },
      body: JSON.stringify({ sourcePath: 'entities/alex.md', content, sourceDigest, idempotencyKey: 'entities/alex.md:' + sourceDigest }),
    }), { params: Promise.resolve({}) });

    expect(response.status).toBe(201);
    expect(response.headers.get('cache-control')).toBe('private, no-store');
    await expect(response.json()).resolves.toMatchObject({ outcome: 'created', pageId: 'page-id' });
    expect(upsertSourceDocument).toHaveBeenCalledWith(expect.anything(), expect.objectContaining({ sourcePath: 'entities/alex.md', content, sourceDigest }));
  });

  it('rejects malformed input before calling the mirror service', async () => {
    const response = await route.PUT(new NextRequest('http://localhost/api/v1/memory/wiki/documents', {
      method: 'PUT',
      headers: { 'content-type': 'application/json', 'x-next-wiki-memory-provider-version': '1' },
      body: JSON.stringify({ sourcePath: '../secrets.txt', content: 'secret' }),
    }), { params: Promise.resolve({}) });

    expect(response.status).toBe(422);
    expect(upsertSourceDocument).not.toHaveBeenCalled();
  });
});
