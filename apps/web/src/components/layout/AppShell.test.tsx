// @vitest-environment node
import { renderToStaticMarkup } from 'react-dom/server';
import { describe, expect, it, vi } from 'vitest';

vi.mock('./Header', () => ({ Header: () => <header /> }));
vi.mock('./Navigator', () => ({ Navigator: () => <nav /> }));
vi.mock('@/components/ai/AiAvailabilityContext', () => ({ AiAvailabilityProvider: ({ children }: { children: React.ReactNode }) => <>{children}</> }));

import { AppShell } from './AppShell';

describe('AppShell scrolling', () => {
  it('assigns vertical scrolling to one min-width-safe content container', () => {
    const html = renderToStaticMarkup(
      <AppShell user={{ kind: 'anonymous' }} tree={[]} siteName="Wiki" footer={<footer>Footer</footer>}>
        <div className="min-h-full">Page</div>
      </AppShell>,
    );
    // The single scroll container carries min-w-0 so wide content (e.g. a
    // non-wrapping code block) cannot blow the column out and push the
    // vertical scrollbar off-screen.
    expect(html).toContain('min-h-0 min-w-0 flex-1 relative flex flex-col');
    expect(html).toContain('min-h-0 min-w-0 flex-1 overflow-y-auto overscroll-contain flex flex-col');
    expect(html).not.toContain('flex-1 overflow-auto relative');
  });

  it('uses a sticky-footer content wrapper for document pages by default', () => {
    const html = renderToStaticMarkup(
      <AppShell user={{ kind: 'anonymous' }} tree={[]} siteName="Wiki" footer={<footer>Footer</footer>}>
        <div className="min-h-full">Page</div>
      </AppShell>,
    );
    // grow shrink-0 basis-auto (flex: 1 0 auto) keeps the footer at the very
    // bottom of the flow: pinned to the viewport on short pages, below the
    // content on long ones.
    expect(html).toContain('class="grow shrink-0 basis-auto"><div class="min-h-full">Page</div></div><footer>Footer</footer>');
  });

  it('locks the content wrapper to the viewport when fitViewport is set', () => {
    const html = renderToStaticMarkup(
      <AppShell user={{ kind: 'anonymous' }} tree={[]} siteName="Wiki" fitViewport footer={<footer>Footer</footer>}>
        <div className="h-full">Editor</div>
      </AppShell>,
    );
    // A full scroll-viewport height (h-full) lets an h-full app page (the
    // split editor) fill the screen and own its internal scrollbars, while
    // the footer is pushed below the fold and only appears on scroll.
    expect(html).toContain('class="h-full min-w-0 shrink-0"><div class="h-full">Editor</div></div><footer>Footer</footer>');
    expect(html).not.toContain('grow shrink-0 basis-auto');
  });
});
