// @vitest-environment jsdom
import { act } from 'react';
import { createRoot, type Root } from 'react-dom/client';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import type { WikijsSourcePage } from '@next-wiki/shared';

const mocks = vi.hoisted(() => ({ apiGet: vi.fn() }));

vi.mock('@/i18n/client', () => ({
  useTranslation: () => ({ t: (key: string, params?: Record<string, unknown>) => (params ? `${key}:${JSON.stringify(params)}` : key) }),
}));
vi.mock('@/lib/api/client', () => ({ apiGet: mocks.apiGet }));

import { WikiJsPagePicker } from './WikiJsPagePicker';

(globalThis as { IS_REACT_ACT_ENVIRONMENT?: boolean }).IS_REACT_ACT_ENVIRONMENT = true;

let container: HTMLDivElement;
let root: Root;

function page(id: number, path: string, title = path): WikijsSourcePage {
  return { id, path, title, locale: 'en', contentType: 'text/markdown', updatedAt: null };
}

async function mount(ui: React.ReactElement) {
  container = document.createElement('div');
  document.body.appendChild(container);
  root = createRoot(container);
  await act(async () => {
    root.render(ui);
  });
}

function checkboxes(): HTMLInputElement[] {
  return [...container.querySelectorAll<HTMLInputElement>('li input[type="checkbox"]')];
}

/** Set a controlled input's value the way a user would. Assigning `.value`
 * directly bypasses React's value tracker, so the change event is swallowed. */
async function typeInto(input: HTMLInputElement, value: string) {
  const setter = Object.getOwnPropertyDescriptor(window.HTMLInputElement.prototype, 'value')!.set!;
  await act(async () => {
    setter.call(input, value);
    input.dispatchEvent(new Event('input', { bubbles: true }));
  });
}

function buttonLabelled(text: string): HTMLButtonElement {
  const match = [...container.querySelectorAll('button')].find((button) => button.textContent?.includes(text));
  if (!match) throw new Error(`No button matching ${text}`);
  return match;
}

beforeEach(() => {
  mocks.apiGet.mockReset();
});

afterEach(() => {
  act(() => root.unmount());
  container.remove();
});

describe('WikiJsPagePicker', () => {
  it('lists the source inventory and applies the pages the user checks', async () => {
    mocks.apiGet.mockResolvedValue({ items: [page(1, 'docs/a'), page(2, 'docs/b')] });
    const onApply = vi.fn();
    await mount(<WikiJsPagePicker sourceId="s-1" selected={[]} onApply={onApply} onClose={() => {}} />);

    expect(mocks.apiGet).toHaveBeenCalledWith('/api/transfer-sources/s-1/pages');
    expect(checkboxes()).toHaveLength(2);

    await act(async () => {
      checkboxes()[1]!.click();
    });
    await act(async () => {
      buttonLabelled('pickerApply').click();
    });

    expect(onApply).toHaveBeenCalledWith([2]);
  });

  it('filters the list by path or title without changing the selection', async () => {
    mocks.apiGet.mockResolvedValue({ items: [page(1, 'docs/alpha'), page(2, 'guide/beta', 'Beta guide')] });
    const onApply = vi.fn();
    await mount(<WikiJsPagePicker sourceId="s-1" selected={[1]} onApply={onApply} onClose={() => {}} />);

    await typeInto(container.querySelector('input:not([type])') as HTMLInputElement, 'beta');

    expect(checkboxes()).toHaveLength(1);
    await act(async () => {
      buttonLabelled('pickerApply').click();
    });
    expect(onApply).toHaveBeenCalledWith([1]);
  });

  it('drops a stored selection the source no longer publishes, and says so', async () => {
    mocks.apiGet.mockResolvedValue({ items: [page(1, 'docs/a')] });
    const onApply = vi.fn();
    await mount(<WikiJsPagePicker sourceId="s-1" selected={[1, 77]} onApply={onApply} onClose={() => {}} />);

    expect(container.textContent).toContain('pickerStalePruned');
    await act(async () => {
      buttonLabelled('pickerApply').click();
    });
    expect(onApply).toHaveBeenCalledWith([1]);
  });

  it('surfaces a load failure instead of rendering an empty list', async () => {
    mocks.apiGet.mockRejectedValue({ message: 'Wiki.js is unreachable' });
    await mount(<WikiJsPagePicker sourceId="s-1" selected={[]} onApply={() => {}} onClose={() => {}} />);

    expect(container.textContent).toContain('Wiki.js is unreachable');
    expect(checkboxes()).toHaveLength(0);
  });
});
