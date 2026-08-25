import { describe, expect, it } from 'vitest';
import { isAllowedWebUrl, normalizeDomains, validateDomains } from './url-policy';

describe('web research URL policy', () => {
  it('normalizes configured host names without accepting URL-shaped values', () => {
    expect(normalizeDomains([' Docs.Example.com ', '.example.org', 'https://bad.example', 'docs.example.com'])).toEqual([
      'docs.example.com',
      'example.org',
    ]);
  });

  it('allows only HTTP(S) hosts permitted by the allowlist and always honors blocks', () => {
    expect(isAllowedWebUrl('https://docs.example.com/start', ['example.com'], [])).toBe(true);
    expect(isAllowedWebUrl('https://example.com/start', ['example.com'], [])).toBe(true);
    expect(isAllowedWebUrl('https://private.example.com/start', ['example.com'], ['private.example.com'])).toBe(false);
    expect(isAllowedWebUrl('https://unrelated.example.net/start', ['example.com'], [])).toBe(false);
    expect(isAllowedWebUrl('file:///etc/passwd', [], [])).toBe(false);
    expect(isAllowedWebUrl('https://user:pass@example.com/start', [], [])).toBe(false);
  });

  it('rejects malformed configured domains instead of silently ignoring them', () => {
    expect(() => validateDomains(['docs.example.com', 'https://bad.example'])).toThrow('Invalid domain');
    expect(validateDomains(['docs.example.com', 'docs.example.com'])).toEqual(['docs.example.com']);
  });
});
