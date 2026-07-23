import { renderToStaticMarkup } from 'react-dom/server';
import { describe, expect, it, vi } from 'vitest';

vi.mock('@/i18n/client', () => ({
  useTranslation: () => ({ t: (key: string) => key }),
}));
vi.mock('./ProvenanceIndicators', () => ({
  useProtectedPage: () => ({
    isAdmin: true,
    page: { status: 'published' },
  }),
}));

import { PublishLinkButton } from './PublishLinkButton';

describe('PublishLinkButton', () => {
  it('uses an icon-only button with an accessible tooltip', () => {
    const html = renderToStaticMarkup(
      <PublishLinkButton
        pageId="page-1"
        targetTitle="Zhuge Liang"
        currentPath="history/zhuge-liang"
      />,
    );

    expect(html).toContain('title="page.publishLink.button"');
    expect(html).toContain('aria-label="page.publishLink.button"');
    expect(html).toContain('h-10 w-10');
    expect(html).not.toContain('>page.publishLink.button</button>');
  });
});
