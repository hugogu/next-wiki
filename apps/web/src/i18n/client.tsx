'use client';

import {
  NextIntlClientProvider,
  useLocale,
  useTranslations,
} from 'next-intl';
import { createContext, useCallback, useContext, useEffect, useMemo, useState } from 'react';
import { useSearchParams } from 'next/navigation';
import { localeCookieName, defaultLocale, type Locale, isLocale } from './config';
import { getMessagePath } from './message-path';
import type { AppMessages } from './catalog';
import { getCachedMessages, loadMessages, prefetchOtherLocale, seedMessages } from './message-store';
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
  const searchParams = useSearchParams();
  const urlLocale = searchParams?.get('lang') ?? null;
  const [locale, setLocaleState] = useState<Locale>(() =>
    isLocale(initialLocale) ? initialLocale : defaultLocale,
  );
  const activeLocale = isLocale(urlLocale) ? urlLocale : locale;

  if (providedMessages) seedMessages(initialLocale, providedMessages);

  const [catalogLocale, setCatalogLocale] = useState(activeLocale);
  const [catalog, setCatalog] = useState<AppMessages>(
    () => providedMessages ?? getCachedMessages(activeLocale) ?? ({} as AppMessages),
  );

  // Derived-during-render update (not an effect): when `locale` changes and
  // its catalog is already cached, adopt it in the same render pass instead
  // of committing a stale frame first. See:
  // https://react.dev/learn/you-might-not-need-an-effect#adjusting-some-state-when-a-prop-changes
  if (activeLocale !== catalogLocale) {
    const cached = getCachedMessages(activeLocale);
    if (cached) {
      setCatalogLocale(activeLocale);
      setCatalog(cached);
    }
  }

  useEffect(() => {
    if (getCachedMessages(activeLocale)) return;
    let cancelled = false;
    loadMessages(activeLocale)
      .then((loaded) => {
        if (!cancelled) {
          setCatalog(loaded);
          setCatalogLocale(activeLocale);
        }
      })
      .catch(() => {
        // Stay on the already-cached catalog; the load can be retried
        // later since `loadMessages` clears its in-flight entry on failure.
      });
    return () => {
      cancelled = true;
    };
  }, [activeLocale]);

  // Warm the other locale in the background so a later switch has no
  // visible load, without shipping both dictionaries on the critical path.
  useEffect(() => {
    prefetchOtherLocale(activeLocale);
  }, [activeLocale]);

  useEffect(() => {
    document.documentElement.lang = activeLocale;
  }, [activeLocale]);

  const setLocale = useCallback((next: Locale) => {
    if (!isLocale(next)) return;
    setLocaleState(next);
    setLocaleCookie(next);
    if (!isLocale(urlLocale) && typeof document !== 'undefined') {
      document.documentElement.lang = next;
    }
  }, [urlLocale, setLocaleState]);

  return (
    <NextIntlClientProvider locale={activeLocale} messages={catalog} timeZone="UTC">
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
