// @vitest-environment jsdom
import { act } from 'react';
import { createRoot, type Root } from 'react-dom/client';
import type { PublicAttachmentResource } from '@next-wiki/shared';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { AttachmentsPanel } from './AttachmentsPanel';
import { listAttachments } from '@/lib/api/attachments';

vi.mock('@/i18n/client', () => ({
  useTranslation: () => ({ t: (key: string) => key }),
}));

vi.mock('@/lib/api/attachments', () => ({
  listAttachments: vi.fn(),
  attachFile: vi.fn(),
  removeAttachment: vi.fn(),
}));

(globalThis as { IS_REACT_ACT_ENVIRONMENT?: boolean }).IS_REACT_ACT_ENVIRONMENT = true;

function attachment(fileName: string, contentType: string): PublicAttachmentResource {
  const id = crypto.randomUUID();
  return {
    id,
    pageId: crypto.randomUUID(),
    fileName,
    contentType,
    sizeBytes: 2048,
    url: `/api/v1/attachments/${id}/content`,
    createdAt: '2026-10-07T00:00:00.000Z',
    uploadedBy: null,
  };
}

const pdf = attachment('报告 Q3.pdf', 'application/pdf');
const png = attachment('diagram.png', 'image/png');
const docx = attachment(
  'spec.docx',
  'application/vnd.openxmlformats-officedocument.wordprocessingml.document',
);
const text = attachment('notes.txt', 'text/plain');

let container: HTMLDivElement;
let root: Root;

async function renderPanel(items: PublicAttachmentResource[]) {
  vi.mocked(listAttachments).mockResolvedValue(items);
  await act(async () => {
    root.render(<AttachmentsPanel pageId="page-1" />);
  });
}

function link(name: string): HTMLAnchorElement {
  const anchor = [...container.querySelectorAll('a')].find((a) => a.textContent === name);
  if (!anchor) throw new Error(`no link named ${name}`);
  return anchor;
}

beforeEach(() => {
  container = document.createElement('div');
  document.body.appendChild(container);
  root = createRoot(container);
});

afterEach(() => {
  act(() => root.unmount());
  container.remove();
  vi.unstubAllGlobals();
  vi.clearAllMocks();
});

describe('AttachmentsPanel links', () => {
  it('opens browser-safe types (PDF, images) in a new tab straight from the content URL', async () => {
    await renderPanel([pdf, png]);

    for (const item of [pdf, png]) {
      const anchor = link(item.fileName);
      expect(anchor.getAttribute('href')).toBe(item.url);
      expect(anchor.getAttribute('target')).toBe('_blank');
      expect(anchor.getAttribute('rel')).toBe('noopener');
      expect(anchor.hasAttribute('download')).toBe(false);
    }
  });

  it('downloads every other type under its original file name, without opening a tab', async () => {
    await renderPanel([docx, text]);

    for (const item of [docx, text]) {
      const anchor = link(item.fileName);
      expect(anchor.getAttribute('href')).toBe(item.url);
      expect(anchor.getAttribute('download')).toBe(item.fileName);
      expect(anchor.hasAttribute('target')).toBe(false);
      expect(anchor.getAttribute('rel')).toBe('noopener');
    }
  });

  // Regression: the click used to be cancelled so the file could be fetched
  // first, and the tab was opened after the response arrived. By then the
  // click's user activation had often expired, so Chrome blocked the open as a
  // pop-up. The browser must be left to act on the click itself.
  it.each([pdf, docx])('leaves the click of $fileName to the browser', async (item) => {
    const fetchMock = vi.fn();
    vi.stubGlobal('fetch', fetchMock);
    await renderPanel([item]);

    // Listening on `document` sees the event after React's handlers have run,
    // so `defaultPrevented` there tells whether the component cancelled it.
    // Cancelling it afterwards only keeps jsdom from "navigating".
    let cancelledByComponent: boolean | undefined;
    const observe = (event: Event) => {
      cancelledByComponent = event.defaultPrevented;
      event.preventDefault();
    };
    document.addEventListener('click', observe);
    try {
      link(item.fileName).click();
    } finally {
      document.removeEventListener('click', observe);
    }

    expect(cancelledByComponent).toBe(false);
    expect(fetchMock).not.toHaveBeenCalled();
  });
});
