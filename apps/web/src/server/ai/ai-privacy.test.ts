import { sanitizeProviderMessage } from './types';

describe('AI privacy redaction', () => {
  it('redacts bearer credentials and bounded content-bearing fields', () => {
    const sanitized = sanitizeProviderMessage(
      'Authorization: Bearer secret-token api_key="secret" prompt="private question"',
    );
    expect(sanitized).not.toContain('secret-token');
    expect(sanitized).not.toContain('private question');
    expect(sanitized.length).toBeLessThanOrEqual(500);
  });

  it.each([
    ['question', 'question="How do private deployments work?"'],
    ['selection', 'input="selected confidential paragraph"'],
    ['response', 'prompt="generated private response"'],
    ['provider body', 'authorization="provider raw body"'],
    ['image data', 'input="data:image/png;base64,private-image-data"'],
  ])('redacts %s content-bearing values', (_label, value) => {
    const sanitized = sanitizeProviderMessage(value);
    expect(sanitized).toContain('[REDACTED]');
    expect(sanitized).not.toContain(value.split('="')[1]?.replace(/"$/, ''));
  });
});
