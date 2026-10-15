// @vitest-environment jsdom
import { act } from 'react';
import { createRoot, type Root } from 'react-dom/client';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import type { HistoryRevision } from '@/lib/history-revision';
import type { RevisionDiffOptions } from '@/lib/path';

const api = vi.hoisted(() => ({ apiGet: vi.fn() }));
const router = vi.hoisted(() => ({ replace: vi.fn(), push: vi.fn(), refresh: vi.fn() }));
const i18n = vi.hoisted(() => {
  const messages: Record<string, string> = {
    'page.history.compare.selectVersion': 'Version {version}',
    'page.history.compare.ready': 'Two revisions selected',
    'page.history.compare.selectHint': 'Select two revisions',
    'page.history.revision.loadError': 'Could not load version {version}.',
    'page.history.revision.retry': 'Retry',
    'common.status.loading': 'Loading…',
    'page.diff.comparing': 'Comparing v{earlier} to v{later}',
    'page.revision.heading': 'Revision {version}',
  };
  return {
    t: (key: string, values: Record<string, unknown> = {}) =>
      (messages[key] ?? key).replace(/\{(\w+)\}/g, (_, name: string) => String(values[name])),
  };
});

vi.mock('@/lib/api/client', () => api);
vi.mock('next/navigation', () => ({ useRouter: () => router }));
vi.mock('@/i18n/client', () => ({ useTranslation: () => ({ t: i18n.t }) }));
vi.mock('@/components/pages/PublishButton', () => ({ PublishButton: () => <button type="button">publish</button> }));
vi.mock('@/components/pages/DeleteRevisionButton', () => ({
  DeleteRevisionButton: () => <button type="button">delete</button>,
}));
vi.mock('@/components/renderer/ContentRenderer', () => ({
  ContentRenderer: ({ html }: { html: string }) => <div data-testid="rendered">{html}</div>,
}));

import { HistoryRevisionSelector, type HistoryRevisionSummary } from './HistoryRevisionSelector';

(globalThis as { IS_REACT_ACT_ENVIRONMENT?: boolean }).IS_REACT_ACT_ENVIRONMENT = true;

const summaries: HistoryRevisionSummary[] = [5, 4, 3, 2, 1].map((version) => ({
  version,
  status: 'published',
  meta: `meta ${version}`,
  canPublish: false,
  canDelete: false,
}));
const defaultOptions: RevisionDiffOptions = { view: 'source', context: 3, ignoreWhitespace: false, sync: true };

function loaded(version: number): HistoryRevision {
  return { version, contentSource: `line ${version}`, contentHtml: `<p>html ${version}</p>`, previewLineOffset: 0 };
}

function deferred<T>() {
  let resolve!: (value: T) => void;
  let reject!: (reason: unknown) => void;
  const promise = new Promise<T>((res, rej) => {
    resolve = res;
    reject = rej;
  });
  return { promise, resolve, reject };
}

describe('HistoryRevisionSelector', () => {
  let container: HTMLDivElement;
  let root: Root;
  let replaceState: ReturnType<typeof vi.spyOn>;

  beforeEach(() => {
    api.apiGet.mockReset();
    router.replace.mockReset();
    router.push.mockReset();
    window.history.replaceState(null, '', '/h/docs/a');
    replaceState = vi.spyOn(window.history, 'replaceState');
    container = document.createElement('div');
    document.body.appendChild(container);
    root = createRoot(container);
  });

  afterEach(() => {
    act(() => root.unmount());
    container.remove();
    vi.restoreAllMocks();
  });

  const mount = (props: Partial<Parameters<typeof HistoryRevisionSelector>[0]> = {}) =>
    act(() =>
      root.render(
        <HistoryRevisionSelector
          path="docs/a"
          pageId="page-1"
          revisions={summaries}
          currentVersion={5}
          initialSelection={[4, 5]}
          initialRevisions={[loaded(4), loaded(5)]}
          initialOptions={defaultOptions}
          {...props}
        />,
      ),
    );
  const versionButton = (version: number) =>
    [...container.querySelectorAll<HTMLButtonElement>('ul button[aria-pressed]')].find((button) =>
      new RegExp(`^Version ${version}(?!\\d)`).test(button.textContent ?? ''),
    )!;
  const pressed = () =>
    [...container.querySelectorAll<HTMLButtonElement>('ul button[aria-pressed="true"]')]
      .map((button) => Number(/Version (\d+)/.exec(button.textContent ?? '')![1]))
      .sort((a, b) => a - b);
  const click = (element: HTMLElement) => act(() => element.click());
  const settle = (resolve: () => void) =>
    act(async () => {
      resolve();
      await Promise.resolve();
    });
  const heading = () => container.querySelector('section strong')?.textContent;
  const status = () => container.querySelector('section [role="status"]')?.textContent;
  const addressBar = () => window.location.pathname + window.location.search;

  it('paints the first view from its props, without a request or a change to the address bar', () => {
    mount();

    expect(heading()).toBe('Comparing v4 to v5');
    expect(pressed()).toEqual([4, 5]);
    expect(api.apiGet).not.toHaveBeenCalled();
    expect(replaceState).not.toHaveBeenCalled();
  });

  it('moves the highlight at once and keeps the old content until the picked revision arrives', async () => {
    const request = deferred<HistoryRevision>();
    api.apiGet.mockReturnValue(request.promise);
    mount();

    click(versionButton(3));

    expect(pressed()).toEqual([3]);
    expect(heading()).toBe('Comparing v4 to v5');
    expect(status()).toBe('Loading…');
    expect(container.querySelector('[aria-busy]')).toBeNull();
    expect(api.apiGet).toHaveBeenCalledTimes(1);
    expect(api.apiGet).toHaveBeenCalledWith('/api/pages/page-1/revisions/3');

    await settle(() => request.resolve(loaded(3)));

    expect(container.querySelector('[data-testid="rendered"]')?.textContent).toBe('<p>html 3</p>');
    expect(status()).toBe('');
  });

  it('updates the address bar in place instead of navigating through the router', async () => {
    api.apiGet.mockResolvedValue(loaded(3));
    mount();

    click(versionButton(3));
    await settle(() => undefined);

    expect(addressBar()).toBe('/h/docs/a?selected=3');
    expect(replaceState).toHaveBeenCalledTimes(1);
    expect(router.replace).not.toHaveBeenCalled();
    expect(router.push).not.toHaveBeenCalled();
  });

  it('names a picked pair as an ordered comparison and shows it once both revisions are in', async () => {
    const three = deferred<HistoryRevision>();
    const two = deferred<HistoryRevision>();
    api.apiGet.mockImplementation((url: string) => (url.endsWith('/3') ? three.promise : two.promise));
    mount();

    click(versionButton(3));
    click(versionButton(2));

    expect(pressed()).toEqual([2, 3]);
    expect(container.querySelector('aside p')?.textContent).toBe('Two revisions selected');
    expect(addressBar()).toBe('/h/docs/a?compare=2..3');
    expect(heading()).toBe('Comparing v4 to v5');

    await settle(() => three.resolve(loaded(3)));
    expect(heading()).toBe('Comparing v4 to v5');

    await settle(() => two.resolve(loaded(2)));
    expect(heading()).toBe('Comparing v2 to v3');
  });

  it('loads a revision only once and reuses it on every later pick', async () => {
    api.apiGet.mockResolvedValue(loaded(3));
    mount();

    click(versionButton(3));
    await settle(() => undefined);
    click(versionButton(3));
    expect(pressed()).toEqual([4, 5]);
    click(versionButton(3));

    expect(pressed()).toEqual([3]);
    expect(container.querySelector('[data-testid="rendered"]')?.textContent).toBe('<p>html 3</p>');
    expect(status()).toBe('');
    expect(api.apiGet).toHaveBeenCalledTimes(1);
  });

  it('returns to the latest comparison when the last picked version is clicked off', async () => {
    api.apiGet.mockImplementation(async (url: string) => loaded(Number(url.split('/').pop())));
    mount({ initialSelection: [3], initialRevisions: [loaded(3)] });
    expect(container.querySelector('article')?.textContent).toContain('Revision 3');

    click(versionButton(3));
    await settle(() => undefined);

    expect(pressed()).toEqual([4, 5]);
    expect(heading()).toBe('Comparing v4 to v5');
  });

  it('starts loading on hover and on keyboard focus, sharing one request with the click', async () => {
    const request = deferred<HistoryRevision>();
    api.apiGet.mockReturnValue(request.promise);
    mount();
    const button = versionButton(2);

    act(() => {
      button.dispatchEvent(new Event('pointerover', { bubbles: true }));
    });
    act(() => button.focus());
    click(button);

    expect(api.apiGet).toHaveBeenCalledTimes(1);
    expect(api.apiGet).toHaveBeenCalledWith('/api/pages/page-1/revisions/2');

    await settle(() => request.resolve(loaded(2)));
    expect(container.querySelector('[data-testid="rendered"]')?.textContent).toBe('<p>html 2</p>');
  });

  it('keeps what is on screen and offers a retry when a revision cannot be loaded', async () => {
    api.apiGet.mockRejectedValueOnce(new Error('offline')).mockResolvedValueOnce(loaded(3));
    mount();

    click(versionButton(3));
    await settle(() => undefined);

    expect(container.querySelector('[role="alert"]')?.textContent).toBe('Could not load version 3.');
    expect(heading()).toBe('Comparing v4 to v5');
    const retry = [...container.querySelectorAll('button')].find((button) => button.textContent === 'Retry')!;

    click(retry);
    await settle(() => undefined);

    expect(api.apiGet).toHaveBeenCalledTimes(2);
    expect(container.querySelector('[role="alert"]')).toBeNull();
    expect(container.querySelector('[data-testid="rendered"]')?.textContent).toBe('<p>html 3</p>');
  });

  it('keeps the display options in the address bar and through a change of selection', async () => {
    api.apiGet.mockImplementation(async (url: string) => loaded(Number(url.split('/').pop())));
    mount();
    const toggle = (label: string) =>
      [...container.querySelectorAll<HTMLButtonElement>('[role="group"] button')].find(
        (button) => button.textContent === label,
      )!;

    click(toggle('page.diff.preview'));
    expect(addressBar()).toBe('/h/docs/a?view=preview');

    click(versionButton(3));
    await settle(() => undefined);
    click(versionButton(2));
    await settle(() => undefined);

    expect(heading()).toBe('Comparing v2 to v3');
    expect(toggle('page.diff.preview').getAttribute('aria-pressed')).toBe('true');
    expect(addressBar()).toBe('/h/docs/a?view=preview&compare=2..3');
  });

  it('writes a changed context length to the address bar and drops it again at the default', () => {
    mount();
    const select = container.querySelector('select')!;
    const choose = (value: string) =>
      act(() => {
        Object.getOwnPropertyDescriptor(HTMLSelectElement.prototype, 'value')!.set!.call(select, value);
        select.dispatchEvent(new Event('change', { bubbles: true }));
      });

    choose('5');
    expect(addressBar()).toBe('/h/docs/a?context=5');

    choose('3');
    expect(addressBar()).toBe('/h/docs/a');
  });

  it('shows the hint when no comparison exists to fall back to', () => {
    mount({
      revisions: [summaries[0]!],
      initialSelection: [],
      initialRevisions: [],
    });

    expect(container.querySelector('section')?.textContent).toBe('Select two revisions');
  });
});
