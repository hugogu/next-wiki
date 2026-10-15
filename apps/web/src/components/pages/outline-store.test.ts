// @vitest-environment jsdom
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';

const KEY = 'next-wiki-outline';
const saved = (collapsed: boolean) => JSON.stringify({ state: { collapsed }, version: 0 });

describe('the remembered Outline state', () => {
  beforeEach(() => {
    window.localStorage.clear();
    vi.resetModules();
  });
  afterEach(() => vi.restoreAllMocks());

  // Every import is a page load: the store reads the browser's storage as it is created.
  async function openPage() {
    return (await import('./outline-store')).useOutlineStore;
  }

  it('starts open until the reader folds it away', async () => {
    const outline = await openPage();
    expect(outline.getState().collapsed).toBe(false);
  });

  it('opens the next page folded away once the reader has folded it away', async () => {
    const outline = await openPage();
    outline.getState().setCollapsed(true);
    expect(JSON.parse(window.localStorage.getItem(KEY)!).state.collapsed).toBe(true);

    vi.resetModules();
    const nextPage = await openPage();
    expect(nextPage.getState().collapsed).toBe(true);
  });

  it('opens the next page open again once the reader has opened it again', async () => {
    window.localStorage.setItem(KEY, saved(true));
    const outline = await openPage();
    expect(outline.getState().collapsed).toBe(true);
    outline.getState().setCollapsed(false);

    vi.resetModules();
    const nextPage = await openPage();
    expect(nextPage.getState().collapsed).toBe(false);
  });

  it('picks up a choice that was saved after the page loaded', async () => {
    const outline = await openPage();
    window.localStorage.setItem(KEY, saved(true));
    await outline.persist.rehydrate();
    expect(outline.getState().collapsed).toBe(true);
  });

  it('stays open when the saved value cannot be read', async () => {
    window.localStorage.setItem(KEY, 'not json');
    const outline = await openPage();
    expect(outline.getState().collapsed).toBe(false);
  });

  it('still folds away for this page when browser storage is blocked', async () => {
    vi.spyOn(console, 'warn').mockImplementation(() => {});
    vi.spyOn(window, 'localStorage', 'get').mockImplementation(() => {
      throw new DOMException('blocked', 'SecurityError');
    });
    const outline = await openPage();
    expect(() => outline.getState().setCollapsed(true)).not.toThrow();
    expect(outline.getState().collapsed).toBe(true);
  });
});
