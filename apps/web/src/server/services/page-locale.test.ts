import { describe, expect, it } from 'vitest';
import { routingLocale } from './page-locale';

describe('routingLocale', () => {
  it('routes a translation row by its language', () => {
    expect(routingLocale({ sourcePageId: 'source-1', locale: 'en' })).toBe('en');
    expect(routingLocale({ sourcePageId: 'source-1', locale: 'zh' })).toBe('zh');
  });

  it('never routes an original, whatever language it is written in', () => {
    expect(routingLocale({ sourcePageId: null, locale: 'zh' })).toBeNull();
    expect(routingLocale({ sourcePageId: null, locale: 'en' })).toBeNull();
    expect(routingLocale({ sourcePageId: null, locale: null })).toBeNull();
  });
});
