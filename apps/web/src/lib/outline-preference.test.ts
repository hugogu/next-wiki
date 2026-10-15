// @vitest-environment jsdom
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import {
  OUTLINE_ATTRIBUTE,
  OUTLINE_STORAGE_KEY,
  outlineBootstrapScript,
  setOutlineCollapsed,
} from './outline-preference';

const collapsedOnPage = () => document.documentElement.hasAttribute(OUTLINE_ATTRIBUTE);

/** What the browser sends to the other tabs when this tab writes to storage. */
const otherTabChanged = (key: string | null) => window.dispatchEvent(new StorageEvent('storage', { key }));

describe('the remembered Outline sidebar state', () => {
  const listeners: EventListenerOrEventListenerObject[] = [];

  /** Run the script as a page load would, and keep hold of the listener it adds. */
  function runBootstrap() {
    const addEventListener = vi.spyOn(window, 'addEventListener');
    new Function(outlineBootstrapScript)();
    for (const [type, listener] of addEventListener.mock.calls) {
      if (type === 'storage') listeners.push(listener);
    }
    addEventListener.mockRestore();
  }

  beforeEach(() => {
    window.localStorage.clear();
    document.documentElement.removeAttribute(OUTLINE_ATTRIBUTE);
  });
  afterEach(() => {
    for (const listener of listeners.splice(0)) window.removeEventListener('storage', listener);
    vi.restoreAllMocks();
  });

  describe('setOutlineCollapsed', () => {
    it('folds the sidebar away on the page and remembers it', () => {
      setOutlineCollapsed(true);
      expect(collapsedOnPage()).toBe(true);
      expect(window.localStorage.getItem(OUTLINE_STORAGE_KEY)).toBe('true');
    });

    it('brings it back on the page and forgets the choice', () => {
      setOutlineCollapsed(true);
      setOutlineCollapsed(false);
      expect(collapsedOnPage()).toBe(false);
      expect(window.localStorage.getItem(OUTLINE_STORAGE_KEY)).toBeNull();
    });

    it('still works for this page when browser storage is blocked', () => {
      const blocked = () => {
        throw new DOMException('blocked', 'SecurityError');
      };
      vi.spyOn(Storage.prototype, 'setItem').mockImplementation(blocked);
      vi.spyOn(Storage.prototype, 'removeItem').mockImplementation(blocked);

      expect(() => setOutlineCollapsed(true)).not.toThrow();
      expect(collapsedOnPage()).toBe(true);
      expect(() => setOutlineCollapsed(false)).not.toThrow();
      expect(collapsedOnPage()).toBe(false);
    });
  });

  describe('the script that runs before the first paint', () => {
    it('leaves the sidebar open when nothing has been chosen', () => {
      runBootstrap();
      expect(collapsedOnPage()).toBe(false);
    });

    it('folds the sidebar away when that was the saved choice', () => {
      window.localStorage.setItem(OUTLINE_STORAGE_KEY, 'true');
      runBootstrap();
      expect(collapsedOnPage()).toBe(true);
    });

    it('reads what setOutlineCollapsed wrote', () => {
      setOutlineCollapsed(true);
      document.documentElement.removeAttribute(OUTLINE_ATTRIBUTE);
      runBootstrap();
      expect(collapsedOnPage()).toBe(true);
    });

    it('ignores a saved value that is not the one it writes', () => {
      for (const value of ['false', '1', 'collapsed', '']) {
        window.localStorage.setItem(OUTLINE_STORAGE_KEY, value);
        runBootstrap();
        expect(collapsedOnPage()).toBe(false);
      }
    });

    it('carries on with the sidebar open when browser storage is blocked', () => {
      vi.spyOn(window, 'localStorage', 'get').mockImplementation(() => {
        throw new DOMException('blocked', 'SecurityError');
      });
      expect(runBootstrap).not.toThrow();
      expect(collapsedOnPage()).toBe(false);
    });

    describe('when another tab changes the choice', () => {
      it('follows it, in both directions', () => {
        runBootstrap();

        window.localStorage.setItem(OUTLINE_STORAGE_KEY, 'true');
        otherTabChanged(OUTLINE_STORAGE_KEY);
        expect(collapsedOnPage()).toBe(true);

        window.localStorage.removeItem(OUTLINE_STORAGE_KEY);
        otherTabChanged(OUTLINE_STORAGE_KEY);
        expect(collapsedOnPage()).toBe(false);
      });

      it('follows storage being cleared altogether', () => {
        window.localStorage.setItem(OUTLINE_STORAGE_KEY, 'true');
        runBootstrap();
        expect(collapsedOnPage()).toBe(true);

        window.localStorage.clear();
        otherTabChanged(null);
        expect(collapsedOnPage()).toBe(false);
      });

      it('ignores changes to anything else in storage', () => {
        runBootstrap();
        window.localStorage.setItem(OUTLINE_STORAGE_KEY, 'true');
        otherTabChanged('next-wiki-theme');
        expect(collapsedOnPage()).toBe(false);
      });
    });
  });
});
