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

/**
 * The credential probe must not look like a failed image generation.
 *
 * MiniMax has no health endpoint, so testConnection POSTs the image endpoint
 * with an empty prompt and reads base_resp: 1004/2049 mean the key was
 * rejected, anything else means it was accepted. The provider answers the empty
 * prompt with `2013 invalid params, prompt are required` — which is the
 * *success* signal, but reads like a broken feature to anyone who finds it in
 * the request log. It cost real debugging time once already.
 */
describe('MiniMaxAdapter.testConnection', () => {
  afterEach(() => vi.unstubAllGlobals());

  it('treats an invalid-parameter answer as proof the key was accepted', async () => {
    mockResponse({
      id: 'x',
      data: null,
      base_resp: { status_code: 2013, status_msg: 'invalid params, prompt are required' },
    });
    const health = await new MiniMaxAdapter(config).testConnection();
    expect(health.ok).toBe(true);
    // The alarming provider text must not be surfaced as an error.
    expect(health.errorMessage).toBeUndefined();
  });

  it.each([1004, 2049])('reports a rejected key (%i) as a failure', async (status) => {
    mockResponse({ base_resp: { status_code: status, status_msg: 'invalid api key' } });
    const health = await new MiniMaxAdapter(config).testConnection();
    expect(health.ok).toBe(false);
    expect(health.errorCode).toBe('PROVIDER_UNAVAILABLE');
  });

  it('probes with an empty prompt and no generation parameters', async () => {
    // The empty prompt is the point: it proves the credential without paying
    // for an image. Its shape is what distinguishes the probe from a real
    // generation in the request log.
    mockResponse({ base_resp: { status_code: 2013, status_msg: 'invalid params, prompt are required' } });
    await new MiniMaxAdapter(config).testConnection();
    const call = vi.mocked(fetch).mock.calls.at(-1);
    const body = JSON.parse(String((call?.[1] as RequestInit).body));
    expect(body).toEqual({ model: 'image-01', prompt: '' });
    expect(body).not.toHaveProperty('response_format');
  });
});
