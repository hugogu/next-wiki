/** The UI locale registry. Content-translation locales are a separate domain. */
export const uiLocales = ['en', 'zh'] as const;

/** @deprecated Use uiLocales for UI language; kept for compatibility. */
export const locales = uiLocales;

export type UiLocale = (typeof uiLocales)[number];

/** @deprecated Use UiLocale in new code; kept while consumers migrate. */
export type Locale = UiLocale;

export const defaultLocale: UiLocale = 'en';

export const localeCookieName = 'next-wiki-locale';

/** Public documents are rendered with this request-independent locale. */
export const staticPublicLocale: UiLocale = defaultLocale;

export function isLocale(value: unknown): value is UiLocale {
  return typeof value === 'string' && (uiLocales as readonly string[]).includes(value);
}

export function normalizeUiLocale(value: unknown): UiLocale | null {
  if (isLocale(value)) return value;
  if (typeof value !== 'string') return null;

  const normalized = value.trim().toLowerCase().replace('_', '-');
  const exact = uiLocales.find((locale) => locale === normalized);
  if (exact) return exact;

  const language = normalized.split('-')[0];
  return uiLocales.find((locale) => locale === language) ?? null;
}
