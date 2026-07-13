'use client';

import { I18nProvider } from '@/i18n/client';
import type { AppMessages } from '@/i18n/catalog';
import type { UiLocale } from '@/i18n/config';

export function ApplicationI18nProvider({
  initialLocale,
  messages,
  children,
}: {
  initialLocale: UiLocale;
  messages: AppMessages;
  children: React.ReactNode;
}) {
  return (
    <I18nProvider initialLocale={initialLocale} messages={messages}>
      {children}
    </I18nProvider>
  );
}
