import { renderToStaticMarkup } from 'react-dom/server';
import { describe, expect, it, vi } from 'vitest';
import { I18nProvider } from '@/i18n/client';
import enMessages from '../../../messages/en.json';
import { LanguageSwitcher } from './LanguageSwitcher';

vi.mock('next/navigation', () => ({ useRouter: () => ({ refresh: vi.fn() }) }));
vi.mock('@/lib/api/client', () => ({ useApiMutation: () => ({ mutateAsync: vi.fn() }) }));

describe('LanguageSwitcher', () => {
  it('uses a localized accessible label', () => {
    const html = renderToStaticMarkup(
      <I18nProvider initialLocale="en" messages={enMessages}>
        <LanguageSwitcher />
      </I18nProvider>,
    );
    expect(html).toContain('aria-label="Switch to Chinese"');
  });
});
