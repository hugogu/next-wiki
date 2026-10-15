// @vitest-environment jsdom
import { act } from 'react';
import { createRoot, type Root } from 'react-dom/client';
import { renderToString } from 'react-dom/server';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import type { Heading } from '@/lib/html';
import { OUTLINE_ATTRIBUTE, OUTLINE_BODY_ID, OUTLINE_STORAGE_KEY } from '@/lib/outline-preference';
import { PageSidebar } from './PageSidebar';

vi.mock('./ReaderTags', () => ({ ReaderTags: () => <ul data-testid="tags" /> }));

(globalThis as { IS_REACT_ACT_ENVIRONMENT?: boolean }).IS_REACT_ACT_ENVIRONMENT = true;

const headings: Heading[] = [
  { level: 2, text: 'Overview', id: 'overview' },
  { level: 3, text: 'Details', id: 'details' },
];
const tags = [{ id: 'tag-1', name: 'Guides', normalizedName: 'guides' }];

type Props = Parameters<typeof PageSidebar>[0];
const props = (overrides: Partial<Props> = {}): Props => ({
  headings,
  tags: [],
  tagsLabel: 'Tags',
  outlineLabel: 'Outline',
  outlineCollapseLabel: 'Collapse outline',
  outlineExpandLabel: 'Expand outline',
  ...overrides,
});

describe('PageSidebar', () => {
  let container: HTMLDivElement;
  let root: Root;

  beforeEach(() => {
    window.localStorage.clear();
    document.documentElement.removeAttribute(OUTLINE_ATTRIBUTE);
    container = document.createElement('div');
    document.body.appendChild(container);
    root = createRoot(container);
  });

  afterEach(() => {
    act(() => root.unmount());
    container.remove();
  });

  const mount = (overrides: Partial<Props> = {}) => act(() => root.render(<PageSidebar {...props(overrides)} />));
  const button = (name: string) => container.querySelector<HTMLButtonElement>(`button[aria-label="${name}"]`);

  it('renders nothing for a page with neither headings nor tags', () => {
    mount({ headings: [] });
    expect(container.innerHTML).toBe('');
  });

  describe('a page with an outline', () => {
    it('shows it in a landmark named after it, as links to the sections', () => {
      mount();
      expect(container.querySelector('aside')?.getAttribute('aria-label')).toBe('Outline');
      const links = [...container.querySelectorAll('nav a')];
      expect(links.map((link) => link.textContent)).toEqual(['Overview', 'Details']);
      expect(links.map((link) => link.getAttribute('href'))).toEqual(['#overview', '#details']);
      expect(links.map((link) => (link as HTMLElement).style.paddingLeft)).toEqual(['0.5rem', '1.25rem']);
    });

    it('can be collapsed from a button in the outline header', () => {
      mount();
      const collapse = button('Collapse outline')!;
      expect(collapse.closest('nav')).not.toBeNull();
      expect(collapse.parentElement?.textContent).toContain('Outline');
      expect(collapse.getAttribute('aria-expanded')).toBe('true');
    });

    it('has a rail, outside the sidebar body, with the button that expands it again', () => {
      mount();
      const expand = button('Expand outline')!;
      const rail = expand.closest('.reader-sidebar-rail');
      expect(rail).not.toBeNull();
      expect(rail?.closest('.reader-sidebar-body')).toBeNull();
      expect(expand.getAttribute('aria-expanded')).toBe('false');
    });

    it('lets both buttons point at the part of the sidebar they show and hide', () => {
      mount();
      const body = container.querySelector(`#${OUTLINE_BODY_ID}`);
      expect(body?.classList.contains('reader-sidebar-body')).toBe(true);
      expect(button('Collapse outline')?.getAttribute('aria-controls')).toBe(OUTLINE_BODY_ID);
      expect(button('Expand outline')?.getAttribute('aria-controls')).toBe(OUTLINE_BODY_ID);
    });

    it('is marked as collapsible, which is what the stylesheet looks for', () => {
      mount();
      expect(container.querySelector('aside')?.getAttribute('data-collapsible')).toBe('true');
    });

    it('is the same markup whatever this browser has saved', () => {
      const delivered = () => renderToString(<PageSidebar {...props({ tags })} />);
      const before = delivered();
      window.localStorage.setItem(OUTLINE_STORAGE_KEY, 'true');
      document.documentElement.setAttribute(OUTLINE_ATTRIBUTE, '');
      expect(delivered()).toBe(before);
    });
  });

  describe('a page with tags', () => {
    it('keeps them above the outline, inside the part that folds away', () => {
      mount({ tags });
      const body = container.querySelector(`#${OUTLINE_BODY_ID}`)!;
      expect(body.firstElementChild?.textContent).toContain('Tags');
      expect(body.querySelector('[data-testid="tags"]')).not.toBeNull();
      expect(body.querySelector('nav')).not.toBeNull();
    });
  });

  describe('a page whose sidebar only carries tags', () => {
    it('has nothing to collapse, so it has no rail, no buttons and is not marked collapsible', () => {
      mount({ headings: [], tags });
      expect(container.querySelector('[data-testid="tags"]')).not.toBeNull();
      expect(container.querySelector('button')).toBeNull();
      expect(container.querySelector('.reader-sidebar-rail')).toBeNull();
      expect(container.querySelector('aside')?.hasAttribute('data-collapsible')).toBe(false);
    });
  });
});
