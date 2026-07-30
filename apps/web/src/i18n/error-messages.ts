import type { TranslationKey, TranslateFunction } from './types';

const errorMessageKeys: Partial<Record<string, TranslationKey>> = {
  BAD_REQUEST: 'common.error.internalServerError',
  CONFLICT: 'common.error.internalServerError',
  FORBIDDEN: 'page.publish.error.forbidden',
  NOT_FOUND: 'page.error.notFound',
  UNAUTHORIZED: 'page.publish.error.signInRequired',
  INTERNAL_ERROR: 'common.error.internalServerError',
};

export function getLocalizedErrorMessage(
  t: TranslateFunction,
  error: unknown,
  fallback: TranslationKey,
): string {
  const code = typeof error === 'object' && error !== null && 'code' in error
    ? String((error as { code?: unknown }).code ?? '')
    : '';
  return t(errorMessageKeys[code] ?? fallback);
}

/**
 * Codes a translation surface can receive: the API's own domain codes plus the
 * AI provider codes recorded on a run or a run item (`errorCode`,
 * `warningCode`). Server messages are English-only, so anything shown to a
 * reader goes through this map first.
 */
const translationErrorKeys: Partial<Record<string, TranslationKey>> = {
  INVALID_TRANSLATION_INPUT: 'translation.error.INVALID_TRANSLATION_INPUT',
  TRANSLATION_NOT_FOUND: 'translation.error.TRANSLATION_NOT_FOUND',
  TRANSLATION_ALREADY_RUNNING: 'translation.error.TRANSLATION_ALREADY_RUNNING',
  RUN_NOT_ACTIVE: 'translation.error.RUN_NOT_ACTIVE',
  RUN_NOT_PAUSED: 'translation.error.RUN_NOT_PAUSED',
  MODEL_UNAVAILABLE: 'translation.error.MODEL_UNAVAILABLE',
  MODEL_NOT_FOUND: 'translation.error.MODEL_NOT_FOUND',
  CAPABILITY_MISMATCH: 'translation.error.CAPABILITY_MISMATCH',
  CAPABILITY_UNSUPPORTED: 'translation.error.CAPABILITY_UNSUPPORTED',
  SOURCE_NOT_TRANSLATABLE: 'translation.error.SOURCE_NOT_TRANSLATABLE',
  SOURCE_UNAVAILABLE: 'translation.error.SOURCE_UNAVAILABLE',
  AI_DISABLED: 'translation.error.AI_DISABLED',
  JOB_QUEUE_UNAVAILABLE: 'translation.error.JOB_QUEUE_UNAVAILABLE',
  TIMEOUT: 'translation.error.TIMEOUT',
  RATE_LIMITED: 'translation.error.RATE_LIMITED',
  INPUT_TOO_LARGE: 'translation.error.INPUT_TOO_LARGE',
  CONTENT_REJECTED: 'translation.error.CONTENT_REJECTED',
  PROVIDER_UNAVAILABLE: 'translation.error.PROVIDER_UNAVAILABLE',
  INVALID_RESPONSE: 'translation.error.INVALID_RESPONSE',
  CANCELLED: 'translation.error.CANCELLED',
};

/**
 * Localize a translation-feature code, falling back to the (English, already
 * sanitized) server text, and to nothing when neither is available.
 */
export function getTranslationErrorMessage(
  t: TranslateFunction,
  code: string | null | undefined,
  fallbackMessage?: string | null,
): string | null {
  const key = code ? translationErrorKeys[code] : undefined;
  if (key) return t(key);
  return fallbackMessage ?? null;
}

/** The same lookup for a rejected API call, which carries `code` and `message`. */
export function getTranslationApiErrorMessage(
  t: TranslateFunction,
  error: unknown,
  fallback: TranslationKey,
): string {
  const source =
    typeof error === 'object' && error !== null ? (error as Record<string, unknown>) : {};
  const code = source.code == null ? null : String(source.code);
  const message = typeof source.message === 'string' ? source.message : null;
  return getTranslationErrorMessage(t, code, message) ?? t(fallback);
}
