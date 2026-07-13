'use client';

import {
  NextIntlClientProvider,
  useLocale,
  useTranslations,
} from 'next-intl';
import { createContext, useCallback, useContext, useMemo, useState } from 'react';
import { localeCookieName, defaultLocale, type Locale, isLocale } from './config';
import { getMessagePath, type AppMessages, messages } from './catalog';
import type { TranslationKey, TranslateFunction } from './types';

interface I18nContextValue {
  locale: Locale;
  setLocale: (locale: Locale) => void;
  t: TranslateFunction;
}

const I18nContext = createContext<I18nContextValue | null>(null);

const ONE_YEAR_SECONDS = 60 * 60 * 24 * 365;

function setLocaleCookie(locale: Locale) {
  if (typeof document === 'undefined') return;
  document.cookie = `${localeCookieName}=${locale};path=/;max-age=${ONE_YEAR_SECONDS};SameSite=Lax`;
}

function LegacyTranslationBridge({
  setLocale,
  catalog,
  children,
}: {
  setLocale: (locale: Locale) => void;
  catalog: AppMessages;
  children: React.ReactNode;
}) {
  const locale = useLocale() as Locale;
  const nextTranslate = useTranslations();

  const t = useCallback<TranslateFunction>(
    (key: TranslationKey, params?: Record<string, string | number | undefined>) => {
      const values = params
        ? Object.fromEntries(Object.entries(params).filter(([, value]) => value !== undefined))
        : undefined;
      const path = getMessagePath(String(key), catalog);
      return nextTranslate(path as never, values as never);
    },
    [catalog, nextTranslate],
  );

  const value = useMemo(() => ({ locale, setLocale, t }), [locale, setLocale, t]);
  return <I18nContext.Provider value={value}>{children}</I18nContext.Provider>;
}

export function I18nProvider({
  initialLocale,
  messages: providedMessages,
  children,
}: {
  initialLocale: Locale;
  messages?: AppMessages;
  children: React.ReactNode;
}) {
  const [locale, setLocaleState] = useState<Locale>(() =>
    isLocale(initialLocale) ? initialLocale : defaultLocale,
  );

  const catalog = providedMessages && locale === initialLocale ? providedMessages : messages[locale];
  const setLocale = useCallback((next: Locale) => {
    if (!isLocale(next)) return;
    setLocaleState(next);
    setLocaleCookie(next);
    if (typeof document !== 'undefined') {
      document.documentElement.lang = next;
    }
  }, []);

  return (
    <NextIntlClientProvider locale={locale} messages={catalog} timeZone="UTC">
      <LegacyTranslationBridge setLocale={setLocale} catalog={catalog}>
        {children}
      </LegacyTranslationBridge>
    </NextIntlClientProvider>
  );
}

export function useTranslation() {
  const ctx = useContext(I18nContext);
  if (!ctx) throw new Error('useTranslation must be used inside I18nProvider');
  return ctx;
}
