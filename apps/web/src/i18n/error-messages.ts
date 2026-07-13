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
