import {
  defaultLocale,
  isLocale,
  normalizeUiLocale,
  type UiLocale,
} from './config';

export interface LocaleResolutionInput {
  /** Explicit request override (`?lang=en` / `?lang=zh`). */
  urlValue?: unknown;
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
  const url = normalizeUiLocale(input.urlValue);
  if (url && isLocale(url)) return url;

  const persisted = normalizeUiLocale(input.persistedPreference);
  if (persisted && isLocale(persisted)) return persisted;

  const cookie = normalizeUiLocale(input.cookieValue);
  if (cookie && isLocale(cookie)) return cookie;

  // English is the product default. Browser language is intentionally not a
  // selector: a shared workstation or Chinese browser must not silently
  // change the initial UI language. Visitors can still choose a persisted
  // preference or use `?lang=` for a transient link-level override.
  return defaultLocale;
}

export { parseAcceptLanguage };
