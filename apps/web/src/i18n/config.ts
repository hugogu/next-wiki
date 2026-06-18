export const locales = ['en', 'zh'] as const;

export type Locale = (typeof locales)[number];

export const defaultLocale: Locale = 'en';

export const localeCookieName = 'next-wiki-locale';

export function isLocale(value: string): value is Locale {
  return (locales as readonly string[]).includes(value);
}
