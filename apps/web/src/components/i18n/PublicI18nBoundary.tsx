'use client';

import { I18nProvider } from '@/i18n/client';
import enMessages from '../../../messages/en.json';
import { localeCookieName, normalizeUiLocale, staticPublicLocale } from '@/i18n/config';
import { useEffect } from 'react';
import { useTranslation } from '@/i18n/client';

function PublicLocaleHydrator() {
  const { setLocale } = useTranslation();

  useEffect(() => {
    const cookie = document.cookie
      .split('; ')
      .find((entry) => entry.startsWith(`${localeCookieName}=`))
      ?.split('=')[1];
    const locale = normalizeUiLocale(cookie);
    if (locale) setLocale(locale);
  }, [setLocale]);

  return null;
}

/**
 * Public reader documents are cache-safe: no request cookie/header/session is
 * read while their server HTML is produced. Personal controls may opt into a
 * client-side locale later without changing the document representation.
 */
export function PublicI18nBoundary({ children }: { children: React.ReactNode }) {
  return (
    <I18nProvider initialLocale={staticPublicLocale} messages={enMessages}>
      <PublicLocaleHydrator />
      {children}
    </I18nProvider>
  );
}
