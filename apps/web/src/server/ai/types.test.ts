import { AiProviderError, isContextLengthExceededError, normalizeProviderError } from './types';

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
