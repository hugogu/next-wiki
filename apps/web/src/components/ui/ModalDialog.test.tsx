// @vitest-environment jsdom
import { act } from 'react';
import { createRoot, type Root } from 'react-dom/client';
import { afterEach, describe, expect, it } from 'vitest';
import { ModalDialog } from './ModalDialog';

// Opt into React's act() environment so effects flush synchronously and the
// "not configured to support act(...)" warning is silenced.
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
});

describe('ModalDialog focus', () => {
  it('focuses the first form field on mount, not the close button', () => {
    mount(
      <ModalDialog title="Add source" onClose={() => {}}>
        <input aria-label="name" />
      </ModalDialog>,
    );
    const input = container.querySelector('input');
    const closeButton = container.querySelector('button[aria-label="Close"]');
    expect(document.activeElement).toBe(input);
    expect(document.activeElement).not.toBe(closeButton);
  });

  it('does not steal focus back to the close button when the parent re-renders', () => {
    // The parent passes a fresh inline onClose on every render (as WikiJsSourcePanel
    // does on each keystroke). The focus effect must not re-run and yank focus.
    const render = (n: number) =>
      act(() =>
        root.render(
          <ModalDialog title={`Add source ${n}`} onClose={() => {}}>
            <input aria-label="name" />
          </ModalDialog>,
        ),
      );

    container = document.createElement('div');
    document.body.appendChild(container);
    root = createRoot(container);
    render(0);

    const input = container.querySelector('input')!;
    const closeButton = container.querySelector('button[aria-label="Close"]');
    input.focus(); // user is typing in the field
    expect(document.activeElement).toBe(input);

    render(1); // re-render, e.g. after a keystroke updated parent state

    expect(document.activeElement).toBe(input);
    expect(document.activeElement).not.toBe(closeButton);
  });
});
