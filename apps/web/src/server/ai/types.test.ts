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

describe('streamTextWithRetry repetition guard', () => {
  /** Streams one phrase until its request is aborted, the way a looping model does. */
  function loopingModel(type: 'reasoning_delta' | 'delta') {
    const seen: { signal?: AbortSignal; calls: number } = { calls: 0 };
    const invoke = (signal: AbortSignal) => {
      seen.signal = signal;
      seen.calls += 1;
      return (async function* (): AsyncGenerator<TextGenerationEvent> {
        for (let i = 0; i < 50_000 && !signal.aborted; i += 1) yield { type, text: 'Thus answer.\n\n' };
      })();
    };
    return { invoke, seen };
  }

  async function drain(stream: AsyncIterable<TextGenerationEvent>): Promise<TextGenerationEvent[]> {
    const events: TextGenerationEvent[] = [];
    for await (const event of stream) events.push(event);
    return events;
  }

  it.each(['reasoning_delta', 'delta'] as const)(
    'stops a model looping in %s, closes its request, and does not retry',
    async (type) => {
      const { invoke, seen } = loopingModel(type);
      const streamed: TextGenerationEvent[] = [];
      const error = await (async () => {
        try {
          for await (const event of streamTextWithRetry(invoke, { maxRetries: 2, baseDelayMs: 0 })) streamed.push(event);
        } catch (caught) {
          return caught;
        }
        return null;
      })();

      expect(error).toMatchObject({
        name: 'AiProviderError',
        code: 'RESPONSE_LOOP',
        retryable: false,
        detail: { repetition: { channel: type === 'delta' ? 'content' : 'reasoning', windowBytes: 2_048 } },
      });
      // Retrying the same prompt would most likely loop again.
      expect(seen.calls).toBe(1);
      expect(seen.signal?.aborted).toBe(true);
      // Stopped within a few KB, long before the provider would have finished.
      expect(streamed.length).toBeLessThan(400);
    },
  );

  it('records metrics for diagnosis but never the repeated text', async () => {
    const { invoke } = loopingModel('reasoning_delta');
    const error = (await drain(streamTextWithRetry(invoke)).catch((caught) => caught)) as AiProviderError;
    expect(error.detail).toEqual({
      repetition: { channel: 'reasoning', windowBytes: 2_048, coverage: expect.any(Number), streamedBytes: expect.any(Number) },
    });
    expect(JSON.stringify(error.detail)).not.toContain('Thus answer');
  });

  it('starts a retried attempt with a fresh guard', async () => {
    // 1.4 KB of looping text per attempt is under every window; summed across
    // attempts it would trip the smallest one.
    const phrase = 'Thus answer.\n\n';
    let attempt = 0;
    const events = await drain(
      streamTextWithRetry(
        () => {
          attempt += 1;
          return (async function* (): AsyncGenerator<TextGenerationEvent> {
            for (let i = 0; i < 100; i += 1) yield { type: 'reasoning_delta', text: phrase };
            if (attempt === 1) throw new AiProviderError('PROVIDER_UNAVAILABLE', 'connection reset', true);
          })();
        },
        { maxRetries: 1, baseDelayMs: 0 },
      ),
    );
    expect(attempt).toBe(2);
    expect(events).toHaveLength(200);
  });

  it('leaves an ordinary long answer alone', async () => {
    const answer = Array.from({ length: 4_000 }, (_, i) => ((i + 1) * 2654435761 >>> 0).toString(36)).join(' ');
    const events = await drain(
      streamTextWithRetry(() =>
        (async function* (): AsyncGenerator<TextGenerationEvent> {
          for (let offset = 0; offset < answer.length; offset += 24) {
            yield { type: 'delta', text: answer.slice(offset, offset + 24) };
          }
          yield { type: 'done', finishReason: 'stop' };
        })(),
      ),
    );
    expect(events.at(-1)).toEqual({ type: 'done', finishReason: 'stop' });
    expect(events.filter((event) => event.type === 'delta').map((event) => (event as { text: string }).text).join('')).toBe(answer);
  });

  it('closes the request when the caller aborts too', async () => {
    const controller = new AbortController();
    let requestSignal: AbortSignal | undefined;
    const iterator = streamTextWithRetry(
      (signal) => {
        requestSignal = signal;
        return (async function* (): AsyncGenerator<TextGenerationEvent> {
          yield { type: 'delta', text: 'partial' };
          await new Promise(() => undefined);
        })();
      },
      { signal: controller.signal },
    )[Symbol.asyncIterator]();
    await iterator.next();
    expect(requestSignal?.aborted).toBe(false);
    controller.abort();
    expect(requestSignal?.aborted).toBe(true);
  });
});
