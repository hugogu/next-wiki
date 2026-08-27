// @vitest-environment jsdom
import { act } from 'react';
import { createRoot, type Root } from 'react-dom/client';
import { afterEach, describe, expect, it, vi } from 'vitest';

const { apiGet, apiPost } = vi.hoisted(() => ({
  apiGet: vi.fn(),
  apiPost: vi.fn(),
}));

vi.mock('@/i18n/client', () => ({
  useTranslation: () => ({ t: (key: string) => key }),
}));

vi.mock('@/lib/api/client', () => ({ apiGet, apiPost }));

import { CrossSpaceMigrationDialog } from './CrossSpaceMigrationDialog';

(globalThis as { IS_REACT_ACT_ENVIRONMENT?: boolean }).IS_REACT_ACT_ENVIRONMENT = true;

let container: HTMLDivElement;
let root: Root;

function previewButton() {
  return Array.from(container.querySelectorAll('button')).find((button) => button.textContent === 'admin.pages.move.preview')!;
}

function destinationSelect() {
  return container.querySelectorAll('select')[0]!;
}

function visibilitySelect() {
  return container.querySelectorAll('select')[1]!;
}

afterEach(() => {
  act(() => root.unmount());
  container.remove();
  vi.clearAllMocks();
});

describe('CrossSpaceMigrationDialog', () => {
  it('uses one responsive destination row, excludes Raw, and resolves a Navigator folder source UUID', async () => {
    apiGet.mockResolvedValue({
      spaces: [
        { id: '11111111-1111-4111-8111-111111111111', kind: 'wiki', routePrefix: 'wiki', isActive: true },
        { id: '22222222-2222-4222-8222-222222222222', kind: 'generated', routePrefix: 'ai', isActive: true },
        { id: '33333333-3333-4333-8333-333333333333', kind: 'raw', routePrefix: 'raw', isActive: true },
      ],
    });
    apiPost.mockResolvedValue({ id: 'preview-1', items: [], fingerprint: 'fingerprint' });
    container = document.createElement('div');
    document.body.appendChild(container);
    root = createRoot(container);

    await act(async () => {
      root.render(<CrossSpaceMigrationDialog selection={{ kind: 'folder', sourceSpaceId: '', pathPrefix: 'imported' }} sourceSpaceKind="wiki" title="Imported" onClose={() => {}} />);
      await Promise.resolve();
    });

    expect(container.innerHTML).toContain('sm:grid-cols-2');
    expect(Array.from(destinationSelect().querySelectorAll('option')).map((option) => option.value)).toEqual(['22222222-2222-4222-8222-222222222222']);
    expect(container.querySelector('input')?.className).toContain('px-md py-sm');
    expect(previewButton().parentElement?.className).toContain('justify-end');

    await act(async () => {
      previewButton().click();
      await Promise.resolve();
    });

    expect(apiPost).toHaveBeenCalledWith('/api/v1/space-migrations/previews', {
      selection: { kind: 'folder', sourceSpaceId: '11111111-1111-4111-8111-111111111111', pathPrefix: 'imported' },
      destinationSpaceId: '22222222-2222-4222-8222-222222222222',
    });
  });

  it('defaults visibility to keep-current and includes it in the preview request once chosen', async () => {
    apiGet.mockResolvedValue({
      spaces: [
        { id: '11111111-1111-4111-8111-111111111111', kind: 'wiki', routePrefix: 'wiki', isActive: true },
        { id: '22222222-2222-4222-8222-222222222222', kind: 'generated', routePrefix: 'ai', isActive: true },
      ],
    });
    apiPost.mockResolvedValue({ id: 'preview-1', items: [], fingerprint: 'fingerprint' });
    container = document.createElement('div');
    document.body.appendChild(container);
    root = createRoot(container);

    await act(async () => {
      root.render(<CrossSpaceMigrationDialog selection={{ kind: 'page', pageId: 'page-1' }} sourceSpaceKind="generated" title="Migrated" onClose={() => {}} />);
      await Promise.resolve();
    });

    expect(Array.from(visibilitySelect().querySelectorAll('option')).map((option) => option.value)).toEqual(['', 'public', 'registered', 'restricted']);
    expect(visibilitySelect().value).toBe('');

    await act(async () => {
      visibilitySelect().value = 'public';
      visibilitySelect().dispatchEvent(new Event('change', { bubbles: true }));
      await Promise.resolve();
    });

    await act(async () => {
      previewButton().click();
      await Promise.resolve();
    });

    expect(apiPost).toHaveBeenCalledWith('/api/v1/space-migrations/previews', {
      selection: { kind: 'page', pageId: 'page-1' },
      destinationSpaceId: '11111111-1111-4111-8111-111111111111',
      visibility: 'public',
    });
  });
});
