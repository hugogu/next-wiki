// @vitest-environment jsdom
import { act } from 'react';
import { createRoot, type Root } from 'react-dom/client';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';

vi.mock('@/i18n/client', () => ({
  useTranslation: () => ({ t: (key: string) => key }),
}));

const api = vi.hoisted(() => ({ apiPatch: vi.fn(), apiPost: vi.fn(), apiPut: vi.fn() }));
vi.mock('@/lib/api/client', async (importOriginal) => ({
  ...(await importOriginal<typeof import('@/lib/api/client')>()),
  ...api,
}));
vi.mock('@/lib/api/addresses', () => ({
  listAddresses: vi.fn(async () => ({ canonical: { address: 'docs/guide', url: '/docs/guide' }, aliases: [] })),
  addAddressAlias: vi.fn(),
  removeAddressAlias: vi.fn(),
}));

import { PagePropertiesDialog } from './PagePropertiesDialog';

(globalThis as { IS_REACT_ACT_ENVIRONMENT?: boolean }).IS_REACT_ACT_ENVIRONMENT = true;

const PAGE_ID = '00000000-0000-4000-8000-000000000001';
const REVISION_ID = '00000000-0000-4000-8000-000000000002';
const PAGE_URL = `/api/v1/pages/${PAGE_ID}`;
const METADATA_URL = `/api/v1/pages/${PAGE_ID}/metadata?include=latestRevision`;

describe('PagePropertiesDialog language', () => {
  let container: HTMLDivElement;
  let root: Root;
  const onSaved = vi.fn();
  const onClose = vi.fn();

  beforeEach(() => {
    api.apiPatch.mockReset().mockResolvedValue({});
    api.apiPost.mockReset().mockResolvedValue({});
    api.apiPut.mockReset().mockResolvedValue({});
    onSaved.mockReset();
    onClose.mockReset();
  });

  afterEach(() => {
    act(() => root.unmount());
    container.remove();
  });

  function mount(props: Partial<React.ComponentProps<typeof PagePropertiesDialog>> = {}) {
    container = document.createElement('div');
    document.body.appendChild(container);
    root = createRoot(container);
    act(() =>
      root.render(
        <PagePropertiesDialog
          pageId={PAGE_ID}
          revisionId={REVISION_ID}
          initialTitle="Guide"
          initialPath="docs/guide"
          initialSlug="docs/guide"
          initialDate={null}
          initialTags={[]}
          initialSummary={null}
          initialLocale={null}
          onSaved={onSaved}
          onClose={onClose}
          {...props}
        />,
      ),
    );
  }

  const languageSelect = () => container.querySelector<HTMLSelectElement>('#prop-locale');

  function chooseLanguage(value: string) {
    act(() => {
      const select = languageSelect()!;
      select.value = value;
      select.dispatchEvent(new Event('change', { bubbles: true }));
    });
  }

  function typeTitle(value: string) {
    const input = container.querySelector<HTMLInputElement>('#prop-title')!;
    const setValue = Object.getOwnPropertyDescriptor(HTMLInputElement.prototype, 'value')!.set!;
    act(() => {
      setValue.call(input, value);
      input.dispatchEvent(new Event('input', { bubbles: true }));
    });
  }

  async function save() {
    const button = [...container.querySelectorAll('button')].find(
      (candidate) => candidate.textContent === 'page.properties.button.submit',
    );
    await act(async () => {
      button!.click();
    });
    // Let the sequential requests and their state updates settle.
    for (let i = 0; i < 8; i++) await act(async () => {});
  }

  it('has no language field for a translation, whose language is the one it was translated into', () => {
    mount({ initialLocale: undefined });
    expect(languageSelect()).toBeNull();
  });

  it('closes without calling the API when nothing was changed', async () => {
    mount({ initialLocale: 'en' });
    await save();

    expect(onClose).toHaveBeenCalledTimes(1);
    expect(api.apiPatch).not.toHaveBeenCalled();
    expect(onSaved).not.toHaveBeenCalled();
  });

  it('saves a new language on its own, without publishing anything', async () => {
    mount();
    expect(languageSelect()!.value).toBe('');
    chooseLanguage('zh');
    await save();

    expect(api.apiPatch).toHaveBeenCalledTimes(1);
    expect(api.apiPatch).toHaveBeenCalledWith(PAGE_URL, { locale: 'zh' });
    // The language has no revision behind it, so there is nothing to publish.
    expect(api.apiPost).not.toHaveBeenCalled();
    expect(onSaved).toHaveBeenCalledTimes(1);
  });

  it('clears the language when "Not set" is chosen', async () => {
    mount({ initialLocale: 'en' });
    expect(languageSelect()!.value).toBe('en');
    chooseLanguage('');
    await save();

    expect(api.apiPatch).toHaveBeenCalledTimes(1);
    expect(api.apiPatch).toHaveBeenCalledWith(PAGE_URL, { locale: null });
    expect(onSaved).toHaveBeenCalledTimes(1);
  });

  it('saves the language before the other properties', async () => {
    api.apiPatch.mockImplementation(async (url: string) =>
      url === METADATA_URL ? { latestRevision: { id: REVISION_ID, version: 2 } } : {},
    );
    mount();
    typeTitle('Guide, renamed');
    chooseLanguage('ja');
    await save();

    expect(api.apiPatch.mock.calls.map(([url]) => url)).toEqual([PAGE_URL, METADATA_URL]);
    expect(api.apiPatch.mock.calls[0]?.[1]).toEqual({ locale: 'ja' });
    expect(onSaved).toHaveBeenCalledTimes(1);
  });

  it('explains a language conflict and leaves everything else unsaved', async () => {
    api.apiPatch.mockRejectedValueOnce({ code: 'PAGE_LANGUAGE_CONFLICT', message: 'conflict' });
    mount();
    typeTitle('Guide, renamed');
    chooseLanguage('en');
    await save();

    // The conflict came first, so the rename was never attempted.
    expect(api.apiPatch).toHaveBeenCalledTimes(1);
    expect(container.textContent).toContain('page.properties.error.languageConflict');
    expect(onSaved).not.toHaveBeenCalled();
  });
});
