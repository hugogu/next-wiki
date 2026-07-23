import { afterEach, describe, expect, it, vi } from 'vitest';
import { normalizeAiRequestError, requestAiAction } from './use-ai-action';

describe('requestAiAction', () => {
  afterEach(() => {
    vi.unstubAllGlobals();
  });

  it('preserves structured API errors returned before an action is created', async () => {
    vi.stubGlobal('fetch', vi.fn(async () => new Response(
      JSON.stringify({ code: 'UNAUTHORIZED', message: 'Sign in to use AI' }),
      { status: 401, headers: { 'content-type': 'application/json' } },
    )));

    await expect(requestAiAction('/api/ai/questions', {})).rejects.toEqual({
      code: 'UNAUTHORIZED',
      message: 'Sign in to use AI',
    });
  });

  it('distinguishes an unstructured HTTP failure from a network failure', async () => {
    vi.stubGlobal('fetch', vi.fn(async () => new Response('upstream failed', {
      status: 502,
      headers: { 'content-type': 'text/plain' },
    })));

    await expect(requestAiAction('/api/ai/questions', {})).rejects.toEqual({
      code: 'HTTP_ERROR',
      message: 'Wiki AI request failed with status 502',
    });
  });

  it('normalizes network failures so callers can leave the running state', async () => {
    vi.stubGlobal('fetch', vi.fn(async () => {
      throw new TypeError('Failed to fetch');
    }));

    await expect(requestAiAction('/api/ai/questions', {})).rejects.toEqual({
      code: 'NETWORK_ERROR',
      message: 'Failed to fetch',
    });
  });

  it('rejects a malformed successful response instead of opening an invalid event stream', async () => {
    vi.stubGlobal('fetch', vi.fn(async () => new Response('{}', {
      status: 202,
      headers: { 'content-type': 'application/json' },
    })));

    await expect(requestAiAction('/api/ai/questions', {})).rejects.toMatchObject({
      code: 'INVALID_RESPONSE',
    });
  });

});

describe('normalizeAiRequestError', () => {
  it('uses a bounded generic network error for non-error values', () => {
    expect(normalizeAiRequestError(null)).toEqual({
      code: 'NETWORK_ERROR',
      message: 'Unable to reach Wiki AI',
    });
  });
});
