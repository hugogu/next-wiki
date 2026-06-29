import { randomUUID } from 'node:crypto';
import { NextRequest } from 'next/server';
import { describe, expect, it, vi } from 'vitest';
import { DomainError } from '@/server/errors';

const publicContent = vi.hoisted(() => ({
  uploadAsset: vi.fn(),
  getAsset: vi.fn(),
  getAssetContent: vi.fn(),
}));

vi.mock('@/server/api/audit-wrapper', () => ({
  withApiAudit: (handler: unknown) => handler,
}));
vi.mock('@/server/api/session', () => ({
  createApiContext: vi.fn(async () => ({ actor: { kind: 'api_key', userId: 'editor', role: 'editor', scopes: ['create'], keyId: 'key' } })),
}));
vi.mock('@/server/services/public-content', () => publicContent);

import * as assetsRoute from './route';
import * as assetRoute from './[id]/route';
import * as contentRoute from './[id]/content/route';

describe('Public Wiki asset routes', () => {
  it('POST /api/v1/assets uploads multipart file bytes', async () => {
    const id = randomUUID();
    publicContent.uploadAsset.mockResolvedValue({ id, url: `/api/v1/assets/${id}/content` });
    const form = new FormData();
    form.set('file', new Blob([Buffer.from('bytes')], { type: 'image/png' }), 'pixel.png');

    const response = await assetsRoute.POST(
      new NextRequest('http://localhost/api/v1/assets', { method: 'POST', body: form }),
      { params: Promise.resolve({}) },
    );

    expect(response.status).toBe(201);
    expect(publicContent.uploadAsset).toHaveBeenCalledWith(expect.anything(), Buffer.from('bytes'));
  });

  it('GET /api/v1/assets/[id] hides unreadable assets as 404', async () => {
    const id = randomUUID();
    publicContent.getAsset.mockResolvedValue(null);

    const response = await assetRoute.GET(
      new NextRequest(`http://localhost/api/v1/assets/${id}`),
      { params: Promise.resolve({ id }) },
    );

    expect(response.status).toBe(404);
  });

  it('GET /api/v1/assets/[id]/content streams visible bytes', async () => {
    const id = randomUUID();
    publicContent.getAssetContent.mockResolvedValue({ kind: 'ok', bytes: Buffer.from('png'), contentType: 'image/png' });

    const response = await contentRoute.GET(
      new NextRequest(`http://localhost/api/v1/assets/${id}/content`),
      { params: Promise.resolve({ id }) },
    );

    expect(response.status).toBe(200);
    expect(response.headers.get('content-type')).toBe('image/png');
    expect(await response.text()).toBe('png');
  });

  it('maps unsupported uploads to stable public errors', async () => {
    publicContent.uploadAsset.mockRejectedValueOnce(new DomainError('INVALID_IMAGE', 'Unsupported image type'));
    const form = new FormData();
    form.set('file', new Blob([Buffer.from('bad')]), 'bad.txt');

    const response = await assetsRoute.POST(
      new NextRequest('http://localhost/api/v1/assets', { method: 'POST', body: form }),
      { params: Promise.resolve({}) },
    );

    expect(response.status).toBe(415);
    expect((await response.json()).code).toBe('UNSUPPORTED_ASSET_TYPE');
  });
});
