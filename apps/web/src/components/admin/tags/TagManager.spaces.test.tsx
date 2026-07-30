// @vitest-environment jsdom
import { act } from 'react';
import { createRoot, type Root } from 'react-dom/client';
import { afterEach, describe, expect, it, vi } from 'vitest';

// One stable object, because TagManager's load effects list `t` in their
// dependency array: a fresh `t` per render would re-run them forever. The real
// `t` is memoized (see i18n/client.tsx), so this matches production.
const i18n = vi.hoisted(() => ({ t: (key: string) => key }));
vi.mock('@/i18n/client', () => ({ useTranslation: () => i18n }));

import { TagManager } from './TagManager';

(globalThis as { IS_REACT_ACT_ENVIRONMENT?: boolean }).IS_REACT_ACT_ENVIRONMENT = true;

let container: HTMLDivElement;
let root: Root;

afterEach(() => {
  act(() => root.unmount());
  container.remove();
  vi.unstubAllGlobals();
});

/** Record every request path so the space scoping can be asserted. */
function stubFetch(): string[] {
  const calls: string[] = [];
  vi.stubGlobal(
    'fetch',
    vi.fn((input: RequestInfo | URL) => {
      const url = String(input);
      calls.push(url);
      // The related-pages lookup has its own shape; only the tag list returns tags.
      const items = url.includes('/api/v1/tags')
        ? [{ id: 'tag-1', name: 'conversation', normalizedName: 'conversation', createdAt: '', updatedAt: '' }]
        : [];
      return Promise.resolve({ ok: true, json: () => Promise.resolve({ items }) } as Response);
    }),
  );
  return calls;
}

function mount(spaceFilterEnabled: boolean) {
  container = document.createElement('div');
  document.body.appendChild(container);
  root = createRoot(container);
  act(() => root.render(<TagManager spaceFilterEnabled={spaceFilterEnabled} />));
}

async function flush() {
  for (let i = 0; i < 8; i++) await act(async () => {});
}

describe('TagManager space scoping', () => {
  it('asks for no space at all when the filter is off', async () => {
    const calls = stubFetch();
    mount(false);
    await flush();

    expect(container.textContent).not.toContain('admin.tags.spaceFilter');
    expect(calls.some((url) => url.includes('space='))).toBe(false);
  });

  it('scopes both the tag list and its related pages to the chosen space', async () => {
    const calls = stubFetch();
    mount(true);
    await flush();
    // The wiki space is the API's default, so it travels as no parameter.
    expect(calls.some((url) => url.includes('/api/v1/tags') && url.includes('space='))).toBe(false);

    const rawChip = [...container.querySelectorAll('button')].find(
      (button) => button.textContent === 'admin.tags.spaces.raw',
    );
    expect(rawChip).toBeDefined();
    calls.length = 0;
    await act(async () => {
      rawChip!.dispatchEvent(new MouseEvent('click', { bubbles: true }));
    });
    await flush();

    expect(calls.some((url) => url.includes('/api/v1/tags') && url.includes('space=raw'))).toBe(true);
    // A raw tag only ever matches raw pages, so the page lookup carries it too.
    expect(calls.some((url) => url.includes('/api/v1/pages') && url.includes('space=raw'))).toBe(true);
  });
});
