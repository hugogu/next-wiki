import type { en } from './locales/en';

export type Translations = typeof en;

export type TranslationKey = keyof Translations;

export type TranslateFunction = (
  key: TranslationKey,
  params?: Record<string, string | number | undefined>,
) => string;
