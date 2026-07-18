import { createTranslator } from 'next-intl';
import { describe, expect, it } from 'vitest';
import enMessages from '../../messages/en.json';
import zhMessages from '../../messages/zh.json';
import { getMessagePath, flattenMessageKeys } from './catalog';

describe('next-intl message catalogs', () => {
  it('keeps both catalogs key-complete, including legacy collision leaves', () => {
    expect(flattenMessageKeys(enMessages).sort()).toEqual(flattenMessageKeys(zhMessages).sort());
    expect(getMessagePath('admin.ai.providers.empty', enMessages)).toBe('admin.ai.providers.empty.__value');
  });

  it('resolves model-detector labels that regressed as flat dotted keys', () => {
    // These were stored as flat `"source.openrouter"` / `"detector.openrouter"`
    // keys, which next-intl (a nested-path resolver) could not reach, so the
    // admin UI rendered the raw key. They must resolve to real labels in both
    // locales.
    const cases: Array<[string, string]> = [
      ['admin.ai.modelDetector.source.openrouter', 'OpenRouter'],
      ['admin.ai.modelDetector.source.cloudflare', 'Cloudflare Workers AI'],
      ['admin.ai.models.detector.openrouter', 'OpenRouter'],
      ['admin.ai.models.detector.cloudflare', 'Cloudflare'],
    ];
    for (const messages of [enMessages, zhMessages]) {
      const translate = createTranslator({ locale: 'en', messages });
      for (const [key, expected] of cases) {
        const resolved = translate(getMessagePath(key, messages) as never);
        // Regression guard: an unreachable key resolves to the key itself.
        expect(resolved).not.toBe(key);
        expect(resolved).toBe(expected);
      }
    }
  });

  it('formats ICU interpolation, plural and select messages', () => {
    const translate = createTranslator({
      locale: 'en',
      messages: {
        demo: {
          greeting: 'Hello, {name}!',
          items: '{count, plural, =0 {No items} one {# item} other {# items}}',
          role: '{role, select, admin {Administrator} other {Member}}',
        },
      },
    });

    expect(translate('demo.greeting', { name: 'Ada' })).toBe('Hello, Ada!');
    expect(translate('demo.items', { count: 2 })).toBe('2 items');
    expect(translate('demo.role', { role: 'admin' })).toBe('Administrator');
  });
});
