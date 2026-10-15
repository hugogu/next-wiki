// @vitest-environment jsdom
import { act } from 'react';
import { createRoot, hydrateRoot, type Root } from 'react-dom/client';
import { renderToString } from 'react-dom/server';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import type { Heading } from '@/lib/html';
import { OutlineNav } from './OutlineNav';
import { OUTLINE_STORAGE_KEY, useOutlineStore } from './outline-store';

(globalThis as { IS_REACT_ACT_ENVIRONMENT?: boolean }).IS_REACT_ACT_ENVIRONMENT = true;

const headings: Heading[] = [
  { level: 2, text: 'Overview', id: 'overview' },
  { level: 3, text: 'Details', id: 'details' },
  { level: 2, text: 'Summary', id: 'summary' },
];
const labels = { label: 'Outline', collapseLabel: 'Collapse outline', expandLabel: 'Expand outline' };
const saved = (collapsed: boolean) => JSON.stringify({ state: { collapsed }, version: 0 });

describe('OutlineNav', () => {
  let container: HTMLDivElement;
  let root: Root;

  beforeEach(() => {
    act(() => useOutlineStore.setState({ collapsed: false }));
    window.localStorage.clear();
    container = document.createElement('div');
    document.body.appendChild(container);
    root = createRoot(container);
  });

  afterEach(() => {
    act(() => root.unmount());
    container.remove();
    vi.restoreAllMocks();
  });

  const mount = () => act(() => root.render(<OutlineNav headings={headings} {...labels} />));
  const toggle = () => container.querySelector('button')!;
  const list = () => container.querySelector('ul')!;
  const header = () => toggle().parentElement!;

  it('lists the headings as links to their sections, indented by level', () => {
    mount();
    const links = [...list().querySelectorAll('a')];
    expect(links.map((link) => link.textContent)).toEqual(['Overview', 'Details', 'Summary']);
    expect(links.map((link) => link.getAttribute('href'))).toEqual(['#overview', '#details', '#summary']);
    expect(links.map((link) => link.style.paddingLeft)).toEqual(['0.5rem', '1.25rem', '0.5rem']);
    expect(container.querySelector('p')?.textContent).toBe('Outline');
  });

  it('is open by default, with a button that offers to collapse it', () => {
    mount();
    expect(list().hidden).toBe(false);
    expect(toggle().getAttribute('aria-expanded')).toBe('true');
    expect(toggle().getAttribute('aria-label')).toBe('Collapse outline');
    expect(toggle().title).toBe('Collapse outline');
    expect(toggle().getAttribute('aria-controls')).toBe(list().id);
    expect(header().className).toContain('border-b');
  });

  it('folds the list away and offers to expand it', () => {
    mount();
    act(() => toggle().click());
    expect(list().hidden).toBe(true);
    expect(toggle().getAttribute('aria-expanded')).toBe('false');
    expect(toggle().getAttribute('aria-label')).toBe('Expand outline');
    expect(toggle().title).toBe('Expand outline');
    // The header is the whole card now, so it must not draw a rule above nothing.
    expect(header().className).not.toContain('border-b');
  });

  it('opens the list again from the collapsed state', () => {
    mount();
    act(() => toggle().click());
    act(() => toggle().click());
    expect(list().hidden).toBe(false);
    expect(toggle().getAttribute('aria-expanded')).toBe('true');
    expect(toggle().getAttribute('aria-label')).toBe('Collapse outline');
  });

  it('remembers the choice in the browser', () => {
    mount();
    act(() => toggle().click());
    expect(JSON.parse(window.localStorage.getItem(OUTLINE_STORAGE_KEY)!).state.collapsed).toBe(true);
    act(() => toggle().click());
    expect(JSON.parse(window.localStorage.getItem(OUTLINE_STORAGE_KEY)!).state.collapsed).toBe(false);
  });

  it('shows the remembered choice on the first render of a page opened from inside the app', () => {
    act(() => useOutlineStore.setState({ collapsed: true }));
    mount();
    expect(list().hidden).toBe(true);
    expect(toggle().getAttribute('aria-label')).toBe('Expand outline');
  });

  it('keeps two outlines on one page in step', () => {
    const other = document.createElement('div');
    document.body.appendChild(other);
    const otherRoot = createRoot(other);
    try {
      mount();
      act(() => otherRoot.render(<OutlineNav headings={headings} {...labels} />));
      act(() => toggle().click());
      expect(other.querySelector('ul')!.hidden).toBe(true);
    } finally {
      act(() => otherRoot.unmount());
      other.remove();
    }
  });

  describe('when another tab changes the choice', () => {
    const otherTab = (key: string | null = OUTLINE_STORAGE_KEY) =>
      act(() => {
        window.dispatchEvent(new StorageEvent('storage', { key }));
      });

    it('follows it, in both directions', () => {
      mount();
      window.localStorage.setItem(OUTLINE_STORAGE_KEY, saved(true));
      otherTab();
      expect(list().hidden).toBe(true);

      window.localStorage.setItem(OUTLINE_STORAGE_KEY, saved(false));
      otherTab();
      expect(list().hidden).toBe(false);
    });

    it('ignores changes to anything else in storage', () => {
      mount();
      window.localStorage.setItem(OUTLINE_STORAGE_KEY, saved(true));
      otherTab('next-wiki-theme');
      otherTab(null);
      expect(list().hidden).toBe(false);
    });

    it('stops listening once the outline is gone', () => {
      const rehydrate = vi.spyOn(useOutlineStore.persist, 'rehydrate');
      mount();
      act(() => root.render(null));
      otherTab();
      expect(rehydrate).not.toHaveBeenCalled();
    });
  });

  describe('as a cached public page', () => {
    // The page is rendered once for everyone, by a server that knows nothing a browser has saved.
    let delivered: HTMLDivElement;

    beforeEach(() => {
      delivered = document.createElement('div');
      document.body.appendChild(delivered);
      delivered.innerHTML = renderToString(<OutlineNav headings={headings} {...labels} />);
    });

    afterEach(() => delivered.remove());

    it('is delivered open', () => {
      expect(delivered.querySelector('ul')!.hidden).toBe(false);
      expect(delivered.querySelector('button')!.getAttribute('aria-expanded')).toBe('true');
    });

    it('is rendered open from the start even when a saved choice is already loaded', () => {
      act(() => useOutlineStore.setState({ collapsed: true }));
      const html = document.createElement('div');
      html.innerHTML = renderToString(<OutlineNav headings={headings} {...labels} />);
      expect(html.querySelector('ul')!.hidden).toBe(false);
    });

    it('hydrates without a mismatch and then applies what this browser has saved', () => {
      // The browser has read its saved choice by the time React hydrates the delivered page.
      act(() => useOutlineStore.setState({ collapsed: true }));
      const problems = vi.spyOn(console, 'error').mockImplementation(() => {});
      const onRecoverableError = vi.fn();

      let hydrated!: Root;
      act(() => {
        hydrated = hydrateRoot(delivered, <OutlineNav headings={headings} {...labels} />, { onRecoverableError });
      });

      expect(problems).not.toHaveBeenCalled();
      expect(onRecoverableError).not.toHaveBeenCalled();
      expect(delivered.querySelector('ul')!.hidden).toBe(true);
      expect(delivered.querySelector('button')!.getAttribute('aria-expanded')).toBe('false');
      act(() => hydrated.unmount());
    });
  });
});
