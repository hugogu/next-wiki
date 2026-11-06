// @vitest-environment jsdom
import { act } from 'react';
import { createRoot, type Root } from 'react-dom/client';
import type { BulkPageVisibilityResult } from '@next-wiki/shared';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { apiPost } from '@/lib/api/client';
import { BulkVisibilityDialog } from './BulkVisibilityDialog';

const t = (key: string, params?: Record<string, unknown>) => (params ? `${key}${JSON.stringify(params)}` : key);
vi.mock('@/i18n/client', () => ({ useTranslation: () => ({ t }) }));
vi.mock('@/lib/api/client', () => ({ apiPost: vi.fn() }));

(globalThis as { IS_REACT_ACT_ENVIRONMENT?: boolean }).IS_REACT_ACT_ENVIRONMENT = true;

let container: HTMLDivElement;
let root: Root;

function result(overrides: Partial<BulkPageVisibilityResult>): BulkPageVisibilityResult {
  return {
    visibility: 'public',
    dryRun: false,
    matched: 0,
    pending: { total: 0, public: 0, registered: 0, restricted: 0, unpublished: 0 },
    changed: 0,
    remaining: 0,
    results: [],
    ...overrides,
  };
}

async function chooseVisibility(value: string) {
  const select = container.querySelector('select')!;
  await act(async () => {
    select.value = value;
    select.dispatchEvent(new Event('change', { bubbles: true }));
  });
}

function button(label: string): HTMLButtonElement {
  const found = [...container.querySelectorAll('button')].find((element) => element.textContent?.startsWith(label));
  if (!found) throw new Error(`no button ${label}`);
  return found;
}

beforeEach(() => {
  container = document.createElement('div');
  document.body.appendChild(container);
  root = createRoot(container);
});

afterEach(() => {
  act(() => root.unmount());
  container.remove();
  vi.resetAllMocks();
});

describe('BulkVisibilityDialog', () => {
  it('warns before a folder becomes public, then applies it in batches until nothing remains', async () => {
    const pending = { total: 600, public: 0, registered: 100, restricted: 500, unpublished: 3 };
    vi.mocked(apiPost)
      .mockResolvedValueOnce(result({ dryRun: true, matched: 650, pending, remaining: 600 }))
      .mockResolvedValueOnce(result({ matched: 650, pending, changed: 500, remaining: 100 }))
      .mockResolvedValueOnce(result({ matched: 650, pending: { ...pending, total: 100 }, changed: 100, remaining: 0 }));
    const onDone = vi.fn();
    act(() => root.render(
      <BulkVisibilityDialog selectedPageIds={[]} space="default" spaceLabel="Wiki" folder="news" onClose={vi.fn()} onDone={onDone} />,
    ));

    expect(container.querySelector<HTMLInputElement>('input[type="radio"]')!.disabled).toBe(true);
    expect(container.textContent).toContain('admin.pages.bulk.scopeFolder{"space":"Wiki","folder":"news"}');
    expect(button('admin.pages.bulk.applyIdle').disabled).toBe(true);

    await chooseVisibility('public');

    const folderScope = { kind: 'folder', space: 'default', pathPrefix: 'news' };
    expect(apiPost).toHaveBeenCalledWith(
      '/api/admin/pages/visibility',
      { scope: folderScope, visibility: 'public', dryRun: true },
      expect.objectContaining({ signal: expect.any(AbortSignal) }),
    );
    const warning = container.querySelector('[role="alert"]')!;
    expect(warning.textContent).toContain('admin.pages.bulk.publicWarning{"count":600}');
    expect(warning.textContent).toContain('admin.pages.bulk.publicWarningRestricted{"count":500}');
    expect(warning.textContent).toContain('admin.pages.bulk.publicWarningUnpublished{"count":3}');

    await act(async () => button('admin.pages.bulk.apply').click());

    expect(apiPost).toHaveBeenCalledTimes(3);
    expect(apiPost).toHaveBeenLastCalledWith('/api/admin/pages/visibility', { scope: folderScope, visibility: 'public' });
    expect(onDone).toHaveBeenCalledWith(600, 'public');
  });

  it('changes the selected pages without a public warning and says which no longer exist', async () => {
    vi.mocked(apiPost).mockResolvedValueOnce(result({
      visibility: 'restricted',
      dryRun: true,
      matched: 1,
      pending: { total: 1, public: 1, registered: 0, restricted: 0, unpublished: 0 },
      remaining: 1,
    }));
    act(() => root.render(
      <BulkVisibilityDialog selectedPageIds={['a', 'b']} space="default" spaceLabel="Wiki" onClose={vi.fn()} onDone={vi.fn()} />,
    ));

    await chooseVisibility('restricted');

    expect(apiPost).toHaveBeenCalledWith(
      '/api/admin/pages/visibility',
      { scope: { kind: 'pages', pageIds: ['a', 'b'] }, visibility: 'restricted', dryRun: true },
      expect.anything(),
    );
    expect(container.textContent).toContain('admin.pages.bulk.missing{"count":1}');
    expect(container.querySelector('[role="alert"]')).toBeNull();
    expect(button('admin.pages.bulk.apply').disabled).toBe(false);
  });

  it('reports how far a failed change got and counts the pages again', async () => {
    const pending = { total: 600, public: 600, registered: 0, restricted: 0, unpublished: 0 };
    vi.mocked(apiPost)
      .mockResolvedValueOnce(result({ visibility: 'registered', dryRun: true, matched: 600, pending, remaining: 600 }))
      .mockResolvedValueOnce(result({ visibility: 'registered', matched: 600, pending, changed: 500, remaining: 100 }))
      .mockRejectedValueOnce({ code: 'INTERNAL', message: 'boom' })
      .mockResolvedValueOnce(result({
        visibility: 'registered',
        dryRun: true,
        matched: 600,
        pending: { ...pending, total: 100, public: 100 },
        remaining: 100,
      }));
    const onDone = vi.fn();
    act(() => root.render(
      <BulkVisibilityDialog selectedPageIds={[]} space="default" spaceLabel="Wiki" onClose={vi.fn()} onDone={onDone} />,
    ));
    await chooseVisibility('registered');

    await act(async () => button('admin.pages.bulk.apply').click());

    expect(onDone).not.toHaveBeenCalled();
    expect(container.textContent).toContain('admin.pages.bulk.partialError{"changed":500,"total":600,"message":"boom"}');
    expect(apiPost).toHaveBeenLastCalledWith(
      '/api/admin/pages/visibility',
      { scope: { kind: 'folder', space: 'default' }, visibility: 'registered', dryRun: true },
      expect.anything(),
    );
    expect(button('admin.pages.bulk.apply').textContent).toBe('admin.pages.bulk.apply{"count":100}');
  });
});
