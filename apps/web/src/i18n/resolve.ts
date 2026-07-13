import { match } from '@formatjs/intl-localematcher';
import {
  defaultLocale,
  isLocale,
  normalizeUiLocale,
  uiLocales,
  type UiLocale,
} from './config';

export interface LocaleResolutionInput {
  persistedPreference?: unknown;
  cookieValue?: unknown;
  acceptLanguage?: string | null;
}

function parseAcceptLanguage(value: string | null | undefined): string[] {
  if (!value) return [];

  return value
    .split(',')
    .map((part, index) => {
      const [language, ...parameters] = part.trim().split(';');
      const quality = parameters.find((parameter) => parameter.trim().startsWith('q='));
      const parsedQuality = quality ? Number(quality.trim().slice(2)) : 1;
      return {
        language: language?.trim(),
        quality: Number.isFinite(parsedQuality) ? Math.max(0, Math.min(1, parsedQuality)) : 0,
        index,
      };
    })
    .filter((entry): entry is { language: string; quality: number; index: number } =>
      Boolean(entry.language) && entry.quality > 0,
    )
    .sort((a, b) => b.quality - a.quality || a.index - b.index)
    .map((entry) => entry.language);
}

export function resolveUiLocale(input: LocaleResolutionInput = {}): UiLocale {
  const persisted = normalizeUiLocale(input.persistedPreference);
  if (persisted && isLocale(persisted)) return persisted;

  const cookie = normalizeUiLocale(input.cookieValue);
  if (cookie && isLocale(cookie)) return cookie;

  const requested = parseAcceptLanguage(input.acceptLanguage);
  if (requested.length > 0) {
    const matched = match(requested, uiLocales, defaultLocale, { algorithm: 'best fit' });
    if (isLocale(matched)) return matched;
  }

  return defaultLocale;
}

export { parseAcceptLanguage };
