import { cookies, headers } from 'next/headers';
import { localeCookieName, defaultLocale, type Locale, isLocale } from './config';
import { en } from './locales/en';
import { zh } from './locales/zh';
import { interpolate } from './utils';
import type { TranslationKey } from './types';

const dictionaries: Record<Locale, typeof en> = {
  en,
  zh,
};

function parseAcceptedLocale(acceptLanguage: string | null): Locale | null {
  if (!acceptLanguage) return null;
  const primary = acceptLanguage.split(',')[0]?.split('-')[0]?.trim().toLowerCase();
  if (primary && isLocale(primary)) return primary;
  return null;
}

export async function getLocale(): Promise<Locale> {
  const cookieStore = await cookies();
  const cookieValue = cookieStore.get(localeCookieName)?.value;
  if (cookieValue && isLocale(cookieValue)) {
    return cookieValue;
  }

  const headersList = await headers();
  const accepted = parseAcceptedLocale(headersList.get('accept-language'));
  if (accepted) return accepted;

  return defaultLocale;
}

export function getDictionary(locale: Locale) {
  const dictionary = dictionaries[locale] ?? dictionaries[defaultLocale];

  return function t(key: TranslationKey, params?: Record<string, string | number | undefined>): string {
    const value = dictionary[key] ?? dictionaries[defaultLocale][key] ?? String(key);
    return interpolate(value, params);
  };
}

export type ServerTranslate = ReturnType<typeof getDictionary>;
