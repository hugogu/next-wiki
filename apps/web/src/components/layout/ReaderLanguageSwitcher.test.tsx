// @vitest-environment jsdom
import { act } from 'react';
import { createRoot, type Root } from 'react-dom/client';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import type { PageContext } from './types';

// One router object for every render, as Next's `useRouter()` gives.
const router = vi.hoisted(() => ({ replace: vi.fn() }));
const replace = router.replace;
vi.mock('next/navigation', () => ({ useRouter: () => router }));
vi.mock('next/link', () => ({
  default: ({
    href,
    children,
    onClick,
    ...props
  }: {
    href: string;
    children: React.ReactNode;
    onClick?: (event: React.MouseEvent) => void;
  }) => (
    <a
      href={href}
      onClick={(event) => {
        // jsdom cannot navigate; the click handler is what is under test.
        event.preventDefault();
        onClick?.(event);
      }}
      {...props}
    >
      {children}
    </a>
  ),
}));
vi.mock('@/i18n/client', () => ({ useTranslation: () => ({ t: (key: string) => key }) }));

import { readReadingLanguage, writeReadingLanguage } from '@/lib/reading-language';
import { ReaderLanguageSwitcher } from './ReaderLanguageSwitcher';

(globalThis as { IS_REACT_ACT_ENVIRONMENT?: boolean }).IS_REACT_ACT_ENVIRONMENT = true;

type Context = NonNullable<PageContext>;

function pageContext(overrides: Partial<Context> = {}): Context {
  return {
    pageId: 'page-1',
    path: 'history/zhuge-liang',
    slug: 'zhuge-liang',
    sourcePath: 'zhuge-liang',
    routePrefix: 'wiki',
    title: 'Zhuge Liang',
    status: 'published',
    canEdit: false,
    canPublish: false,
    version: 1,
    space: 'wiki',
    translationLocales: ['en', 'ja'],
    currentLocale: null,
    ...overrides,
  };
}

describe('ReaderLanguageSwitcher', () => {
  let container: HTMLDivElement;
  let root: Root;

  beforeEach(() => {
    replace.mockReset();
    window.localStorage.clear();
    window.history.replaceState(null, '', '/wiki/zhuge-liang');
    container = document.createElement('div');
    document.body.appendChild(container);
    root = createRoot(container);
  });

  afterEach(() => {
    act(() => root.unmount());
    container.remove();
  });

  const mount = (context: Context = pageContext()) =>
    act(() => root.render(<ReaderLanguageSwitcher pageContext={context} />));
  const link = (label: string) =>
    [...container.querySelectorAll('a')].find((candidate) => candidate.textContent?.startsWith(label));

  describe('the button', () => {
    it('is not there for a page that has no translations', () => {
      mount(pageContext({ translationLocales: [] }));
      expect(container.innerHTML).toBe('');
      mount(pageContext({ translationLocales: undefined }));
      expect(container.innerHTML).toBe('');
    });

    it('lists the original and each language at its reader address', () => {
      mount();
      expect(container.querySelector('button')?.getAttribute('aria-label')).toBe('page.header.language');
      expect(link('page.header.original')?.getAttribute('href')).toBe('/wiki/zhuge-liang');
      expect(link('English')?.getAttribute('href')).toBe('/wiki/en/zhuge-liang');
      expect(link('Japanese')?.getAttribute('href')).toBe('/wiki/ja/zhuge-liang');
    });

    it('marks the version being read', () => {
      mount();
      expect(link('page.header.original')?.getAttribute('aria-current')).toBe('page');
      expect(link('English')?.getAttribute('aria-current')).toBeNull();

      mount(pageContext({ currentLocale: 'ja' }));
      expect(link('page.header.original')?.getAttribute('aria-current')).toBeNull();
      expect(link('Japanese')?.getAttribute('aria-current')).toBe('page');
    });

    it('remembers the language that is picked, and forgets it when the original is', () => {
      mount();
      act(() => link('English')!.click());
      expect(readReadingLanguage()).toBe('en');
      act(() => link('Japanese')!.click());
      expect(readReadingLanguage()).toBe('ja');
      act(() => link('page.header.original')!.click());
      expect(readReadingLanguage()).toBeNull();
    });
  });

  describe('opening a page in the language chosen last', () => {
    it('switches the original to the remembered language when the page has it', () => {
      writeReadingLanguage('en');
      mount();
      expect(replace).toHaveBeenCalledTimes(1);
      expect(replace).toHaveBeenCalledWith('/wiki/en/zhuge-liang');
    });

    it('keeps the query string and anchor the reader arrived with', () => {
      window.history.replaceState(null, '', '/wiki/zhuge-liang?ref=feed#background');
      writeReadingLanguage('ja');
      mount();
      expect(replace).toHaveBeenCalledWith('/wiki/ja/zhuge-liang?ref=feed#background');
    });

    it('leaves the original when the page has no version in that language', () => {
      writeReadingLanguage('fr');
      mount();
      expect(replace).not.toHaveBeenCalled();
    });

    it('leaves the original when no language was chosen, or the original was', () => {
      mount();
      expect(replace).not.toHaveBeenCalled();

      writeReadingLanguage('en');
      writeReadingLanguage(null);
      mount(pageContext({ translationLocales: ['en', 'ja', 'fr'] }));
      expect(replace).not.toHaveBeenCalled();
    });

    it('does not move a reader who opened a language directly', () => {
      writeReadingLanguage('en');
      mount(pageContext({ currentLocale: 'ja' }));
      expect(replace).not.toHaveBeenCalled();
    });

    it('does nothing for a page that has no translations at all', () => {
      writeReadingLanguage('en');
      mount(pageContext({ translationLocales: [] }));
      expect(replace).not.toHaveBeenCalled();
    });

    it('does not repeat itself when the same page renders again', () => {
      writeReadingLanguage('en');
      mount();
      // The same list as a new array, as a re-render of the header would give.
      mount(pageContext({ translationLocales: ['en', 'ja'] }));
      expect(replace).toHaveBeenCalledTimes(1);
    });

    it('applies again for the next page the reader opens', () => {
      writeReadingLanguage('en');
      mount();
      mount(pageContext({ sourcePath: 'liu-bei', translationLocales: ['en'] }));
      expect(replace).toHaveBeenLastCalledWith('/wiki/en/liu-bei');
      expect(replace).toHaveBeenCalledTimes(2);
    });

    it('addresses a space without a route prefix the way the reader does', () => {
      writeReadingLanguage('en');
      mount(pageContext({ routePrefix: undefined }));
      expect(replace).toHaveBeenCalledWith('/en/zhuge-liang');
    });
  });
});
