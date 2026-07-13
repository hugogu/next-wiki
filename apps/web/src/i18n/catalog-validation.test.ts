import { describe, expect, it } from 'vitest';
import enMessages from '../../messages/en.json';
import zhMessages from '../../messages/zh.json';
import { flattenMessageKeys } from './catalog';

describe('catalog validation fixtures', () => {
  it('detects missing keys in a deliberately incomplete fixture', () => {
    const complete = flattenMessageKeys(enMessages).sort();
    const incomplete = flattenMessageKeys({ common: { brand: 'next-wiki' } }).sort();
    expect(incomplete).not.toEqual(complete);
    expect(complete).toContain('site.description');
    expect(incomplete).not.toContain('site.description');
  });

  it('ships the same catalog surface for every supported locale', () => {
    expect(flattenMessageKeys(zhMessages).sort()).toEqual(flattenMessageKeys(enMessages).sort());
  });
});
