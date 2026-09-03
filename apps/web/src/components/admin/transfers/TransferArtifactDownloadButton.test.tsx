// @vitest-environment jsdom
import { act } from 'react';
import { createRoot, type Root } from 'react-dom/client';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { TransferArtifactDownloadButton } from './TransferArtifactDownloadButton';

vi.mock('@/i18n/client', () => ({
  useTranslation: () => ({
    t: (key: string) => ({
      'admin.transfers.actions.download': 'Download',
      'admin.transfers.actions.downloading': 'Preparing download...',
      'admin.transfers.download.unavailableTitle': 'Download unavailable',
      'admin.transfers.download.unavailableMessage': 'The export is no longer available.',
      'common.actions.dismiss': 'Dismiss',
    }[key] ?? key),
  }),
}));

(globalThis as { IS_REACT_ACT_ENVIRONMENT?: boolean }).IS_REACT_ACT_ENVIRONMENT = true;

let container: HTMLDivElement;
let root: Root;

beforeEach(() => {
  container = document.createElement('div');
  document.body.appendChild(container);
  root = createRoot(container);
});

afterEach(() => {
  act(() => root.unmount());
  container.remove();
  vi.restoreAllMocks();
});

describe('TransferArtifactDownloadButton', () => {
  it('shows an error dialog and keeps the current page when the download fails', async () => {
    const fetchMock = vi.fn().mockResolvedValue(
      new Response(JSON.stringify({ code: 'TRANSFER_NOT_FOUND', message: 'Not found' }), {
        status: 404,
        headers: { 'content-type': 'application/json' },
      }),
    );
    vi.stubGlobal('fetch', fetchMock);
    const currentUrl = window.location.href;

    act(() => {
      root.render(<TransferArtifactDownloadButton url="/api/transfer-artifacts/missing/content" />);
    });
    await act(async () => {
      container.querySelector('button')!.click();
      await Promise.resolve();
    });

    expect(fetchMock).toHaveBeenCalledWith(
      '/api/transfer-artifacts/missing/content',
      { method: 'HEAD', credentials: 'same-origin' },
    );
    expect(window.location.href).toBe(currentUrl);
    expect(container.querySelector('[role="dialog"]')).not.toBeNull();
    expect(container.textContent).toContain('Download unavailable');
    expect(container.textContent).toContain('The export is no longer available.');
  });

  it('uses the native download after a successful availability probe', async () => {
    const fetchMock = vi.fn().mockResolvedValue(
      new Response(null, {
        status: 200,
        headers: { 'content-disposition': 'attachment; filename="export.zip"' },
      }),
    );
    const clickMock = vi.spyOn(HTMLAnchorElement.prototype, 'click').mockImplementation(() => undefined);
    vi.stubGlobal('fetch', fetchMock);

    act(() => {
      root.render(<TransferArtifactDownloadButton url="/api/transfer-artifacts/ready/content" />);
    });
    await act(async () => {
      container.querySelector('button')!.click();
      await Promise.resolve();
    });

    expect(fetchMock).toHaveBeenCalledWith(
      '/api/transfer-artifacts/ready/content',
      { method: 'HEAD', credentials: 'same-origin' },
    );
    expect(clickMock).toHaveBeenCalledOnce();
    expect(container.querySelector('[role="dialog"]')).toBeNull();
  });
});
