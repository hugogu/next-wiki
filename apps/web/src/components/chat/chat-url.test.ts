// @vitest-environment jsdom
import { describe, expect, it, vi } from 'vitest';
import { chatUrlWithKey, readChatKeyFromUrl, syncChatKeyToUrl, takeArrivalChatKey } from './chat-url';

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

describe('takeArrivalChatKey', () => {
  it('hands out the arrival key once, so a remount cannot replay it', () => {
    window.history.replaceState(null, '', '/wiki/welcome?chat=abc');

    expect(takeArrivalChatKey()).toBe('abc');
    // The pane remounts whenever the layout switches between docked and
    // maximized; replaying the arrival there would reopen a collapsed pane.
    expect(takeArrivalChatKey()).toBeNull();
  });
});

describe('syncChatKeyToUrl', () => {
  it('rewrites the address in place, without a navigation or a history entry', () => {
    window.history.replaceState(null, '', '/wiki/welcome');
    const pushState = vi.spyOn(window.history, 'pushState');

    syncChatKeyToUrl('abc');
    expect(window.location.pathname + window.location.search).toBe('/wiki/welcome?chat=abc');

    syncChatKeyToUrl(null);
    expect(window.location.pathname + window.location.search).toBe('/wiki/welcome');
    expect(pushState).not.toHaveBeenCalled();
    pushState.mockRestore();
  });

  it('leaves an already-correct address untouched', () => {
    window.history.replaceState(null, '', '/wiki/welcome?chat=abc');
    const replaceState = vi.spyOn(window.history, 'replaceState');

    syncChatKeyToUrl('abc');

    expect(replaceState).not.toHaveBeenCalled();
    replaceState.mockRestore();
  });
});
