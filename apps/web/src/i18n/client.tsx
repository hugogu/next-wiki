'use client';

import { createContext, useContext, useState, useCallback, useMemo } from 'react';
import { localeCookieName, defaultLocale, type Locale, isLocale } from './config';
import { en } from './locales/en';
import { zh } from './locales/zh';
import { interpolate } from './utils';
import type { TranslationKey, TranslateFunction } from './types';

const dictionaries: Record<Locale, typeof en> = {
  en,
  zh,
};

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

export function I18nProvider({
  initialLocale,
  children,
}: {
  initialLocale: Locale;
  children: React.ReactNode;
}) {
  const [locale, setLocaleState] = useState<Locale>(() =>
    isLocale(initialLocale) ? initialLocale : defaultLocale,
  );

  const setLocale = useCallback((next: Locale) => {
    setLocaleState(next);
    setLocaleCookie(next);
    if (typeof document !== 'undefined') {
      document.documentElement.lang = next;
    }
  }, []);

  const t = useCallback<TranslateFunction>(
    (key: TranslationKey, params?: Record<string, string | number | undefined>) => {
      const dictionary = dictionaries[locale] ?? dictionaries[defaultLocale];
      const value = dictionary[key] ?? dictionaries[defaultLocale][key] ?? String(key);
      return interpolate(value, params);
    },
    [locale],
  );

  const value = useMemo(
    () => ({
      locale,
      setLocale,
      t,
    }),
    [locale, setLocale, t],
  );

  return <I18nContext.Provider value={value}>{children}</I18nContext.Provider>;
}

export function useTranslation() {
  const ctx = useContext(I18nContext);
  if (!ctx) throw new Error('useTranslation must be used inside I18nProvider');
  return ctx;
}
