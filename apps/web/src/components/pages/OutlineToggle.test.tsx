// @vitest-environment jsdom
import { act } from 'react';
import { createRoot, type Root } from 'react-dom/client';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { OUTLINE_ATTRIBUTE, OUTLINE_BODY_ID, OUTLINE_STORAGE_KEY } from '@/lib/outline-preference';
import { OutlineToggle } from './OutlineToggle';

(globalThis as { IS_REACT_ACT_ENVIRONMENT?: boolean }).IS_REACT_ACT_ENVIRONMENT = true;

const collapsedOnPage = () => document.documentElement.hasAttribute(OUTLINE_ATTRIBUTE);

describe('OutlineToggle', () => {
  let container: HTMLDivElement;
  let root: Root;

  beforeEach(() => {
    window.localStorage.clear();
    document.documentElement.removeAttribute(OUTLINE_ATTRIBUTE);
    container = document.createElement('div');
    document.body.appendChild(container);
    root = createRoot(container);
    // The page always has both: the stylesheet decides which one is shown.
    act(() =>
      root.render(
        <>
          <OutlineToggle collapse label="Collapse outline" />
          <OutlineToggle collapse={false} label="Expand outline" />
        </>,
      ),
    );
  });

  afterEach(() => {
    act(() => root.unmount());
    container.remove();
    vi.restoreAllMocks();
  });

  const collapse = () => container.querySelector<HTMLButtonElement>('#outline-collapse')!;
  const expand = () => container.querySelector<HTMLButtonElement>('#outline-expand')!;

  it('names each button for what it does, in words and as a tooltip', () => {
    expect(collapse().getAttribute('aria-label')).toBe('Collapse outline');
    expect(collapse().title).toBe('Collapse outline');
    expect(expand().getAttribute('aria-label')).toBe('Expand outline');
    expect(expand().title).toBe('Expand outline');
  });

  it('tells assistive technology the state each button stands for, and what it controls', () => {
    expect(collapse().getAttribute('aria-expanded')).toBe('true');
    expect(expand().getAttribute('aria-expanded')).toBe('false');
    expect(collapse().getAttribute('aria-controls')).toBe(OUTLINE_BODY_ID);
    expect(expand().getAttribute('aria-controls')).toBe(OUTLINE_BODY_ID);
  });

  it('is not a submit button', () => {
    expect(collapse().type).toBe('button');
    expect(expand().type).toBe('button');
  });

  it('collapses the sidebar, remembers it, and hands focus to the button that is shown next', () => {
    act(() => collapse().click());
    expect(collapsedOnPage()).toBe(true);
    expect(window.localStorage.getItem(OUTLINE_STORAGE_KEY)).toBe('true');
    expect(document.activeElement).toBe(expand());
  });

  it('expands it again, forgets the choice, and hands focus back', () => {
    act(() => collapse().click());
    act(() => expand().click());
    expect(collapsedOnPage()).toBe(false);
    expect(window.localStorage.getItem(OUTLINE_STORAGE_KEY)).toBeNull();
    expect(document.activeElement).toBe(collapse());
  });

  it('still works for this page when browser storage is blocked', () => {
    const blocked = () => {
      throw new DOMException('blocked', 'SecurityError');
    };
    vi.spyOn(Storage.prototype, 'setItem').mockImplementation(blocked);
    vi.spyOn(Storage.prototype, 'removeItem').mockImplementation(blocked);

    act(() => collapse().click());
    expect(collapsedOnPage()).toBe(true);
    act(() => expand().click());
    expect(collapsedOnPage()).toBe(false);
  });
});
