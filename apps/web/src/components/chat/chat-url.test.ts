import { describe, expect, it } from 'vitest';
import { chatUrlWithKey, readChatKeyFromUrl } from './chat-url';

describe('readChatKeyFromUrl', () => {
  it('reads the selected conversation, treating an empty value as none', () => {
    expect(readChatKeyFromUrl('?chat=legacy%3Aabc')).toBe('legacy:abc');
    expect(readChatKeyFromUrl('?lang=zh&chat=abc')).toBe('abc');
    expect(readChatKeyFromUrl('?chat=')).toBeNull();
    expect(readChatKeyFromUrl('')).toBeNull();
  });
});

describe('chatUrlWithKey', () => {
  it('stamps the conversation onto the page address without disturbing it', () => {
    expect(chatUrlWithKey('https://wiki.example/wiki/welcome', 'abc')).toBe('/wiki/welcome?chat=abc');
    expect(chatUrlWithKey('https://wiki.example/wiki/welcome?lang=zh#top', 'abc')).toBe(
      '/wiki/welcome?lang=zh&chat=abc#top',
    );
  });

  it('encodes a key that is not URL-safe', () => {
    expect(chatUrlWithKey('https://wiki.example/w', 'legacy:abc')).toBe('/w?chat=legacy%3Aabc');
  });

  it('replaces a previous selection rather than appending to it', () => {
    expect(chatUrlWithKey('https://wiki.example/w?chat=old', 'new')).toBe('/w?chat=new');
  });

  it('drops the parameter when no conversation is loaded', () => {
    expect(chatUrlWithKey('https://wiki.example/w?chat=old&lang=zh', null)).toBe('/w?lang=zh');
    expect(chatUrlWithKey('https://wiki.example/w?chat=old', null)).toBe('/w');
  });
});
