import { afterEach, describe, expect, it, vi } from 'vitest';
import { MiniMaxAdapter } from './minimax';
import type { ProviderRuntimeConfig } from '../types';

const config: ProviderRuntimeConfig = {
  providerId: '00000000-0000-4000-8000-000000000001',
  name: 'MiniMax',
  type: 'image',
  vendor: 'minimax',
  kind: 'minimax',
  baseUrl: 'https://api.minimaxi.com/v1',
  config: {},
  credentials: { apiKey: 'test-key' },
};

function mockResponse(payload: unknown) {
  vi.stubGlobal(
    'fetch',
    vi.fn(async () => new Response(JSON.stringify(payload), { status: 200, headers: { 'content-type': 'application/json' } })),
  );
}

const generate = (adapter: MiniMaxAdapter) =>
  adapter.generateImage({
    actionId: 'action',
    modelExternalId: 'image-01',
    prompt: 'a cat',
    abortSignal: new AbortController().signal,
  });

describe('MiniMaxAdapter.generateImage', () => {
  afterEach(() => vi.unstubAllGlobals());

  it('surfaces a non-zero base_resp as a meaningful error', async () => {
    mockResponse({ base_resp: { status_code: 1026, status_msg: 'sensitive content' } });
    await expect(generate(new MiniMaxAdapter(config))).rejects.toMatchObject({
      code: 'CONTENT_REJECTED',
      message: expect.stringContaining('sensitive content'),
    });
  });

  it('returns a data url for a base64 response', async () => {
    mockResponse({ base_resp: { status_code: 0 }, data: { image_base64: ['QUFBQQ=='] } });
    await expect(generate(new MiniMaxAdapter(config))).resolves.toEqual({
      kind: 'data_url',
      dataUrl: 'data:image/jpeg;base64,QUFBQQ==',
    });
  });

  it('falls back to image urls when base64 is absent', async () => {
    mockResponse({ base_resp: { status_code: 0 }, data: { image_urls: ['https://img.example/1.png'] } });
    await expect(generate(new MiniMaxAdapter(config))).resolves.toEqual({
      kind: 'url',
      url: 'https://img.example/1.png',
    });
  });
});
