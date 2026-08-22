// @vitest-environment jsdom
import { act } from 'react';
import { createRoot, type Root } from 'react-dom/client';
import { afterEach, describe, expect, it, vi } from 'vitest';
import { ThemeProvider, useTheme } from './ThemeProvider';

vi.mock('next/navigation', () => ({ useSearchParams: () => new URLSearchParams() }));

(globalThis as { IS_REACT_ACT_ENVIRONMENT?: boolean }).IS_REACT_ACT_ENVIRONMENT = true;

let container: HTMLDivElement;
let root: Root;

function mount(ui: React.ReactElement) {
  container = document.createElement('div');
  document.body.appendChild(container);
  root = createRoot(container);
  act(() => root.render(ui));
}

afterEach(() => {
  act(() => root.unmount());
  container.remove();
  document.documentElement.classList.remove('light', 'dark');
  localStorage.clear();
});

function Probe() {
  const { resolved } = useTheme();
  return <span data-testid="resolved">{resolved}</span>;
}

describe('ThemeProvider', () => {
  it('does not crash mounting where window.matchMedia is unavailable (e.g. jsdom)', () => {
    // jsdom does not implement matchMedia at all. The change-listener effect
    // used to call it unconditionally, crashing the whole app on mount in
    // any such environment (also plausible in some embedded webviews).
    expect(() =>
      mount(
        <ThemeProvider>
          <Probe />
        </ThemeProvider>,
      ),
    ).not.toThrow();
    expect(container.querySelector('[data-testid="resolved"]')?.textContent).toBe('light');
  });
});
