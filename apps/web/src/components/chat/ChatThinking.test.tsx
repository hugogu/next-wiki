// @vitest-environment jsdom
import { act } from 'react';
import { createRoot, type Root } from 'react-dom/client';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { renderMarkdown } from '@/server/pipeline';
import { ChatThinking } from './ChatThinking';

const apiPost = vi.hoisted(() => vi.fn());
vi.mock('@/lib/api/client', () => ({ apiPost }));
vi.mock('@/i18n/client', () => ({ useTranslation: () => ({ t: (key: string) => key }) }));
// The island machinery (code blocks, Mermaid) is exercised by the renderer's
// own tests; here we only care that the pipeline HTML reaches the DOM.
vi.mock('@/components/renderer/ContentRenderer', () => ({
  ContentRenderer: ({ html }: { html: string }) => <div dangerouslySetInnerHTML={{ __html: html }} />,
}));

(globalThis as { IS_REACT_ACT_ENVIRONMENT?: boolean }).IS_REACT_ACT_ENVIRONMENT = true;

let container: HTMLDivElement;
let root: Root;

async function mount(ui: React.ReactElement) {
  container = document.createElement('div');
  document.body.appendChild(container);
  root = createRoot(container);
  await act(async () => {
    root.render(ui);
  });
}

beforeEach(() => {
  // Stand in for /api/preview with the pipeline it actually runs, so this
  // asserts real Markdown output rather than a hand-written HTML fixture.
  apiPost.mockImplementation(async (_path: string, input: { contentSource: string }) => ({
    html: renderMarkdown(input.contentSource).html,
  }));
});

afterEach(() => {
  act(() => root.unmount());
  container.remove();
  apiPost.mockReset();
});

const THINKING = 'Checking **deploy** docs:\n\n- read `docker-compose.yml`\n- compare ports';

describe('ChatThinking', () => {
  it('renders the reasoning as Markdown once the stream has settled', async () => {
    await mount(<ChatThinking thinking={THINKING} streaming />);

    // Streaming: raw text, no round trip — half-written Markdown would flicker.
    expect(apiPost).not.toHaveBeenCalled();
    expect(container.textContent).toContain('Checking **deploy** docs:');

    await act(async () => {
      root.render(<ChatThinking thinking={THINKING} streaming={false} />);
    });

    expect(apiPost).toHaveBeenCalledWith('/api/preview', { contentSource: THINKING });
    expect(container.innerHTML).toContain('<strong>deploy</strong>');
    expect(container.innerHTML).toContain('<li');
    expect(container.innerHTML).toContain('<code');
    expect(container.innerHTML).not.toContain('**deploy**');
  });

  it('leaves a collapsed block unrendered until the reader opens it', async () => {
    await mount(<ChatThinking thinking={THINKING} streaming={false} />);

    // A reopened conversation mounts every turn collapsed; rendering them all
    // up front would fire one preview request per turn for unseen content.
    expect(apiPost).not.toHaveBeenCalled();

    const toggle = container.querySelector('button')!;
    await act(async () => {
      toggle.click();
    });

    expect(apiPost).toHaveBeenCalledTimes(1);
    expect(container.innerHTML).toContain('<strong>deploy</strong>');
  });

  it('strips <think> tags before rendering', async () => {
    await mount(<ChatThinking thinking={'<think>plain *reasoning*</think>'} streaming={false} />);
    const toggle = container.querySelector('button')!;
    await act(async () => {
      toggle.click();
    });

    expect(apiPost).toHaveBeenCalledWith('/api/preview', { contentSource: 'plain *reasoning*' });
    expect(container.innerHTML).toContain('<em>reasoning</em>');
  });
});
