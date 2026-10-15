// @vitest-environment jsdom
import { act } from 'react';
import { createRoot, type Root } from 'react-dom/client';
import { afterEach, beforeEach, describe, expect, it } from 'vitest';
import type { Heading } from '@/lib/html';
import { PageSidebar } from './PageSidebar';
import { useOutlineStore } from './outline-store';

(globalThis as { IS_REACT_ACT_ENVIRONMENT?: boolean }).IS_REACT_ACT_ENVIRONMENT = true;

const headings: Heading[] = [
  { level: 2, text: 'Overview', id: 'overview' },
  { level: 3, text: 'Details', id: 'details' },
];

describe('PageSidebar', () => {
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
  });

  const mount = (props: Partial<Parameters<typeof PageSidebar>[0]> = {}) =>
    act(() =>
      root.render(
        <PageSidebar
          headings={headings}
          tags={[]}
          tagsLabel="Tags"
          outlineLabel="Outline"
          outlineCollapseLabel="Collapse outline"
          outlineExpandLabel="Expand outline"
          {...props}
        />,
      ),
    );

  it('renders nothing for a page with neither headings nor tags', () => {
    mount({ headings: [] });
    expect(container.innerHTML).toBe('');
  });

  it('shows the outline in a landmark named after it, with the collapse button', () => {
    mount();
    expect(container.querySelector('aside')?.getAttribute('aria-label')).toBe('Outline');
    expect([...container.querySelectorAll('li a')].map((link) => link.textContent)).toEqual(['Overview', 'Details']);
    expect(container.querySelector('button')?.getAttribute('aria-label')).toBe('Collapse outline');
  });

  it('passes the expand label through once the outline is collapsed', () => {
    mount();
    act(() => container.querySelector('button')!.click());
    expect(container.querySelector('button')?.getAttribute('aria-label')).toBe('Expand outline');
  });
});
