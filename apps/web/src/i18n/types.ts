import type { AppMessages } from './catalog';
import type { TranslationKey as CatalogTranslationKey } from './keys';
import type { AppFormats } from './formats';

export type Translations = AppMessages;

export type TranslationKey = CatalogTranslationKey;

export type UiMessages = AppMessages;

declare module 'next-intl' {
  interface AppConfig {
    Locale: 'en' | 'zh';
    Messages: UiMessages;
    Formats: AppFormats;
  }
}

export type TranslateFunction = (
  key: TranslationKey,
  params?: Record<string, string | number | undefined>,
) => string;
