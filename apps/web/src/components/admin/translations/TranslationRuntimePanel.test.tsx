import { describe, expect, it, vi } from 'vitest';
import { renderToStaticMarkup } from 'react-dom/server';
import {
  DEFAULT_TRANSLATION_REQUEST_TIMEOUT_SECONDS,
  MAX_TRANSLATION_REQUEST_TIMEOUT_SECONDS,
  MIN_TRANSLATION_REQUEST_TIMEOUT_SECONDS,
} from '@next-wiki/shared';
import { ApplicationI18nProvider } from '@/components/i18n/ApplicationI18nProvider';
import { getMessages } from '@/i18n/catalog';
import { ApiProvider } from '@/lib/api/provider';

vi.mock('next/navigation', () => ({
  useRouter: () => ({ refresh: vi.fn() }),
}));

import { TranslationRuntimePanel } from './TranslationRuntimePanel';

function render(requestTimeoutSeconds: number, locale: 'en' | 'zh' = 'en'): string {
  return renderToStaticMarkup(
    <ApiProvider>
      <ApplicationI18nProvider initialLocale={locale} messages={getMessages(locale)}>
        <TranslationRuntimePanel
          settings={{ requestTimeoutSeconds, updatedAt: null }}
        />
      </ApplicationI18nProvider>
    </ApiProvider>,
  );
}

describe('TranslationRuntimePanel', () => {
  it('shows the stored per-page deadline inside the supported range', () => {
    const html = render(900);
    expect(html).toContain('value="900"');
    expect(html).toContain(`min="${MIN_TRANSLATION_REQUEST_TIMEOUT_SECONDS}"`);
    expect(html).toContain(`max="${MAX_TRANSLATION_REQUEST_TIMEOUT_SECONDS}"`);
  });

  it('renders localized copy rather than raw catalog keys', () => {
    const en = render(DEFAULT_TRANSLATION_REQUEST_TIMEOUT_SECONDS);
    expect(en).toContain('Runtime limits');
    expect(en).toContain('Per-page timeout (seconds)');
    expect(en).not.toContain('translation.settings.');

    const zh = render(DEFAULT_TRANSLATION_REQUEST_TIMEOUT_SECONDS, 'zh');
    expect(zh).toContain('运行限制');
    expect(zh).not.toContain('translation.settings.');
  });
});
