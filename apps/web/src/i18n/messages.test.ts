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
