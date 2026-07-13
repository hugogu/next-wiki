import { cookies, headers } from 'next/headers';
import { createTranslator } from 'next-intl';
import { localeCookieName, defaultLocale, staticPublicLocale, type Locale, isLocale } from './config';
import { getMessages, getMessagePath, type MessageCatalog } from './catalog';
import { resolveUiLocale } from './resolve';
import type { TranslationKey } from './types';

export async function getLocale(persistedPreference?: unknown): Promise<Locale> {
  const cookieStore = await cookies();
  const headersList = await headers();

  return resolveUiLocale({
    persistedPreference,
    cookieValue: cookieStore.get(localeCookieName)?.value,
    acceptLanguage: headersList.get('accept-language'),
  });
}

/** Request-independent locale for static/ISR public document rendering. */
export function getStaticLocale(): Locale {
  return staticPublicLocale;
}

type LegacyMessageValues = Record<string, string | number | undefined>;

function normalizeValues(values: LegacyMessageValues | undefined): Record<string, string | number> | undefined {
  if (!values) return undefined;
  return Object.fromEntries(
    Object.entries(values).filter(([, value]) => value !== undefined),
  ) as Record<string, string | number>;
}

/**
 * Compatibility surface for server components during the staged migration.
 * The translator and catalogs are provided by next-intl; only the dotted-key
 * path adapter remains until all server call sites use getTranslations.
 */
export function getDictionary(locale: Locale) {
  const messages = getMessages(isLocale(locale) ? locale : defaultLocale);
  const translate = createTranslator({
    locale,
    messages,
  });

  return function t(key: TranslationKey, params?: LegacyMessageValues): string {
    const path = getMessagePath(String(key), messages as MessageCatalog);
    return translate(path as never, normalizeValues(params) as never);
  };
}

export type ServerTranslate = ReturnType<typeof getDictionary>;
