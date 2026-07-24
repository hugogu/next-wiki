import { AiProviderError, isContextLengthExceededError, normalizeProviderError, streamTextWithRetry, type TextGenerationEvent } from './types';

describe('isContextLengthExceededError', () => {
  it('recognizes the OpenRouter maximum-context-length 400', () => {
    const error = new AiProviderError(
      'INVALID_RESPONSE',
      "This endpoint's maximum context length is 262144 tokens. However, you requested about 266324 tokens (4180 of text input, 262144 in the output). Please reduce the length of either one.",
    );
    expect(isContextLengthExceededError(error)).toBe(true);
  });

  it('recognizes the OpenAI-style context_length_exceeded phrasing', () => {
    const error = new AiProviderError(
      'INVALID_RESPONSE',
      "This model's maximum context length is 8192 tokens (context_length_exceeded).",
    );
    expect(isContextLengthExceededError(error)).toBe(true);
  });

  it('ignores unrelated provider errors', () => {
    expect(
      isContextLengthExceededError(new AiProviderError('RATE_LIMITED', 'Too many requests')),
    ).toBe(false);
  });

  it('ignores non-provider errors', () => {
    expect(isContextLengthExceededError(new Error('maximum context length'))).toBe(false);
  });
});

describe('normalizeProviderError', () => {
  it('recognizes a timeout raised while reading a response stream', () => {
    const error = new Error('The operation was aborted due to timeout');
    error.name = 'TimeoutError';

    expect(normalizeProviderError(error)).toMatchObject({
      code: 'TIMEOUT',
      message: 'AI provider response timed out',
      retryable: true,
    });
  });
});

describe('streamTextWithRetry', () => {
  async function collect(
    factory: () => AsyncIterable<TextGenerationEvent>,
    opts: Parameters<typeof streamTextWithRetry>[1] = {},
  ): Promise<{ events: TextGenerationEvent[]; calls: number }> {
    const calls = { n: 0 };
    const wrapped = () => {
      calls.n += 1;
      return factory();
    };
    const events: TextGenerationEvent[] = [];
    for await (const ev of streamTextWithRetry(wrapped, opts)) events.push(ev);
    return { events, calls: calls.n };
  }

  it('retries a retryable mid-stream error that happens before any answer delta', async () => {
    let attempt = 0;
    const { events, calls } = await collect(
      () => {
        attempt += 1;
        return (async function* () {
          if (attempt === 1) {
            yield { type: 'reasoning_delta', text: 'thinking...' };
            throw new AiProviderError('PROVIDER_UNAVAILABLE', 'connection reset', true);
          }
          yield { type: 'reasoning_delta', text: 'redo...' };
          yield { type: 'delta', text: 'final answer' };
        })();
      },
      { maxRetries: 2, baseDelayMs: 0 },
    );
    expect(calls).toBe(2);
    expect(events.map((e) => (e as { type: string }).type)).toEqual(['reasoning_delta', 'reasoning_delta', 'delta']);
  });

  it('does NOT retry once an answer delta has been committed (avoids duplicating partial output)', async () => {
    const calls = { n: 0 };
    await expect(
      (async () => {
        for await (const _ of streamTextWithRetry(
          () => {
            calls.n += 1;
            return (async function* () {
              yield { type: 'delta', text: 'partial' };
              throw new AiProviderError('PROVIDER_UNAVAILABLE', 'connection reset', true);
            })();
          },
          { maxRetries: 2, baseDelayMs: 0 },
        )) void _;
      })(),
    ).rejects.toMatchObject({ code: 'PROVIDER_UNAVAILABLE' });
    expect(calls.n).toBe(1);
  });

  it('does NOT retry a non-retryable provider error', async () => {
    await expect(
      collect(
        () =>
          (async function* () {
            throw new AiProviderError('CONTENT_REJECTED', 'blocked', false);
          })(),
        { maxRetries: 2, baseDelayMs: 0 },
      ),
    ).rejects.toMatchObject({ code: 'CONTENT_REJECTED' });
  });

  it('respects maxRetries and surfaces the normalized error after exhausting attempts', async () => {
    let calls = 0;
    const iter = streamTextWithRetry(
      () => {
        calls += 1;
        return (async function* () {
          throw new AiProviderError('PROVIDER_UNAVAILABLE', 'flaky', true);
        })();
      },
      { maxRetries: 2, baseDelayMs: 0 },
    );
    await expect((async () => {
      for await (const _ of iter) void _;
    })()).rejects.toMatchObject({ code: 'PROVIDER_UNAVAILABLE' });
    // initial attempt + 2 retries = 3 invocations
    expect(calls).toBe(3);
  });

  it('aborts promptly when the abort signal fires during the backoff wait', async () => {
    const controller = new AbortController();
    const promise = (async () => {
      for await (const _ of streamTextWithRetry(
        () =>
          (async function* () {
            throw new AiProviderError('PROVIDER_UNAVAILABLE', 'flaky', true);
          })(),
        { maxRetries: 5, baseDelayMs: 5_000, signal: controller.signal },
      )) void _;
    })();
    setTimeout(() => controller.abort(), 10);
    await expect(promise).rejects.toMatchObject({ code: 'CANCELLED' });
  });
});
