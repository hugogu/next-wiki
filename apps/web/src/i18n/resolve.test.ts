import { describe, expect, it } from 'vitest';
import { parseAcceptLanguage, resolveUiLocale } from './resolve';

describe('resolveUiLocale', () => {
  it('lets a valid URL language override every stored or browser preference', () => {
    expect(resolveUiLocale({ urlValue: 'en', persistedPreference: 'zh', cookieValue: 'zh', acceptLanguage: 'zh-CN' })).toBe('en');
  });

  it('uses persisted preference before cookie and browser signals', () => {
    expect(
      resolveUiLocale({ persistedPreference: 'zh', cookieValue: 'en', acceptLanguage: 'en-US' }),
    ).toBe('zh');
  });

  it('ignores invalid persisted and cookie values', () => {
    expect(
      resolveUiLocale({ persistedPreference: 'fr', cookieValue: 'obsolete', acceptLanguage: 'zh-CN' }),
    ).toBe('en');
  });

  it('uses English by default instead of inferring a browser language', () => {
    expect(resolveUiLocale({ acceptLanguage: 'zh-CN' })).toBe('en');
    expect(resolveUiLocale({ acceptLanguage: 'en;q=0.2, zh-CN;q=0.9' })).toBe('en');
  });

  it('falls back safely when no supported signal exists', () => {
    expect(resolveUiLocale()).toBe('en');
    expect(resolveUiLocale({ acceptLanguage: '*;q=0' })).toBe('en');
  });
});

describe('parseAcceptLanguage', () => {
  it('sorts language ranges by quality while preserving ties', () => {
    expect(parseAcceptLanguage('en;q=0.5, zh-CN, fr;q=0.5')).toEqual(['zh-CN', 'en', 'fr']);
  });
});
