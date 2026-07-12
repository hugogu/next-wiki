// @vitest-environment node
import { renderToStaticMarkup } from 'react-dom/server';
import { describe, expect, it, vi } from 'vitest';

vi.mock('./Header', () => ({ Header: () => <header /> }));
vi.mock('./Navigator', () => ({ Navigator: () => <nav /> }));
vi.mock('@/components/ai/AiAvailabilityContext', () => ({ AiAvailabilityProvider: ({ children }: { children: React.ReactNode }) => <>{children}</> }));

import { AppShell } from './AppShell';

describe('AppShell scrolling', () => {
  it('assigns vertical scrolling to one min-height-safe content container', () => {
    const html = renderToStaticMarkup(
      <AppShell user={{ kind: 'anonymous' }} tree={[]} siteName="Wiki" footer={<footer>Footer</footer>}>
        <div className="min-h-full">Page</div>
      </AppShell>,
    );
    expect(html).toContain('min-h-0 flex-1 relative flex flex-col');
    expect(html).toContain('min-h-0 flex-1 overflow-y-auto overscroll-contain flex flex-col');
    expect(html).toContain('class="min-h-0 flex-1"><div class="min-h-full">Page</div></div><footer>Footer</footer>');
    expect(html).not.toContain('flex-1 overflow-auto relative');
  });
});
