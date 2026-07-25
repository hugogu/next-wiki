// @vitest-environment jsdom

import { act, useState } from 'react';
import { createRoot, type Root } from 'react-dom/client';
import { afterEach, describe, expect, it, vi } from 'vitest';

(globalThis as { IS_REACT_ACT_ENVIRONMENT?: boolean }).IS_REACT_ACT_ENVIRONMENT = true;

vi.mock('mermaid', () => ({
  default: {
    initialize: vi.fn(),
    render: vi.fn(),
  },
}));

vi.mock('./mermaid-theme', () => ({
  mermaidThemeVariables: () => ({}),
}));

vi.mock('@/i18n/client', () => ({
  useTranslation: () => ({ t: (key: string) => key }),
}));

vi.mock('@/components/theme/ThemeProvider', () => ({
  useTheme: () => ({ resolved: 'light' }),
}));

vi.mock('./CodeBlock', () => ({
  CodeBlock: ({ children }: { children: React.ReactNode }) => <div data-testid="code-block">{children}</div>,
}));

vi.mock('./MermaidZoomModal', () => ({
  MermaidZoomModal: () => <div data-testid="zoom-modal" />,
}));

vi.mock('@/components/icons', () => ({
  ExpandIcon: () => <svg data-testid="expand-icon" />,
}));

import { MermaidBlock } from './MermaidBlock';
import mermaid from 'mermaid';

const renderMock = vi.mocked(mermaid.render);

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
  renderMock.mockClear();
});

describe('MermaidBlock', () => {
  it('renders the mermaid diagram after the source is rendered', async () => {
    renderMock.mockResolvedValue({
      svg: '<svg data-testid="mermaid-svg"><text>Diagram</text></svg>',
      diagramType: 'flowchart',
    });

    mount(<MermaidBlock source="graph TD; A --> B" />);

    // Initially shows the raw source while the async render is in flight.
    const preText = container.querySelector('pre.mermaid')?.textContent ?? '';
    expect(preText).toContain('graph TD');
    expect(preText).toContain('A --> B');

    await act(async () => {
      await Promise.resolve();
    });

    expect(renderMock).toHaveBeenCalledWith(expect.any(String), 'graph TD; A --> B');
    expect(container.querySelector('svg[data-testid="mermaid-svg"]')).not.toBeNull();
    expect(container.querySelector('pre.mermaid')).toBeNull();
  });

  it('keeps the rendered SVG when the parent re-renders', async () => {
    renderMock.mockResolvedValue({
      svg: '<svg data-testid="mermaid-svg"><text>Diagram</text></svg>',
      diagramType: 'flowchart',
    });

    function Parent() {
      const [tick, setTick] = useState(0);
      return (
        <div>
          <button data-testid="rerender" onClick={() => setTick((n) => n + 1)}>{tick}</button>
          <MermaidBlock source="graph TD; A --> B" />
        </div>
      );
    }

    mount(<Parent />);

    await act(async () => {
      await Promise.resolve();
    });

    expect(container.querySelector('svg[data-testid="mermaid-svg"]')).not.toBeNull();
    expect(container.querySelector('pre.mermaid')).toBeNull();
    expect(renderMock).toHaveBeenCalledTimes(1);

    const button = container.querySelector('[data-testid="rerender"]') as HTMLButtonElement;
    act(() => button.click());

    await act(async () => {
      await Promise.resolve();
    });

    expect(container.querySelector('svg[data-testid="mermaid-svg"]')).not.toBeNull();
    expect(container.querySelector('pre.mermaid')).toBeNull();
    expect(renderMock).toHaveBeenCalledTimes(1);
  });

  it('falls back to the code view when mermaid.render fails', async () => {
    renderMock.mockRejectedValue(new Error('parse error'));

    mount(<MermaidBlock source="invalid" />);

    await act(async () => {
      await Promise.resolve();
    });

    expect(container.querySelector('svg[data-testid="mermaid-svg"]')).toBeNull();
    expect(container.querySelector('[data-testid="code-block"]')).not.toBeNull();
    expect(container.textContent).toContain('invalid');
  });
});
