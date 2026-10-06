// @vitest-environment jsdom
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { readReadingLanguage, writeReadingLanguage } from './reading-language';

describe('the remembered reading language', () => {
  beforeEach(() => window.localStorage.clear());
  afterEach(() => vi.restoreAllMocks());

  it('is empty until a language has been chosen', () => {
    expect(readReadingLanguage()).toBeNull();
  });

  it('remembers the language that was chosen', () => {
    writeReadingLanguage('en');
    expect(readReadingLanguage()).toBe('en');
    writeReadingLanguage('ja');
    expect(readReadingLanguage()).toBe('ja');
  });

  it('forgets the choice when the original is chosen', () => {
    writeReadingLanguage('en');
    writeReadingLanguage(null);
    expect(readReadingLanguage()).toBeNull();
  });

  it('ignores a stored value that is not a language code', () => {
    for (const value of ['zh-CN', 'EN', '<script>', 'english', '']) {
      window.localStorage.setItem('next-wiki-reading-language', value);
      expect(readReadingLanguage()).toBeNull();
    }
  });

  it('carries on without the choice when storage is unavailable', () => {
    const blocked = () => {
      throw new DOMException('blocked', 'SecurityError');
    };
    vi.spyOn(Storage.prototype, 'getItem').mockImplementation(blocked);
    vi.spyOn(Storage.prototype, 'setItem').mockImplementation(blocked);
    vi.spyOn(Storage.prototype, 'removeItem').mockImplementation(blocked);

    expect(readReadingLanguage()).toBeNull();
    expect(() => writeReadingLanguage('en')).not.toThrow();
    expect(() => writeReadingLanguage(null)).not.toThrow();
  });
});
