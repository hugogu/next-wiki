import { renderToStaticMarkup } from 'react-dom/server';
import { ApplicationI18nProvider } from '@/components/i18n/ApplicationI18nProvider';
import { getMessages } from '@/i18n/catalog';
import type { UiLocale } from '@/i18n/config';

export function renderWithI18n(
  children: React.ReactNode,
  locale: UiLocale = 'en',
): string {
  return renderToStaticMarkup(
    <ApplicationI18nProvider initialLocale={locale} messages={getMessages(locale)}>
      {children}
    </ApplicationI18nProvider>,
  );
}
