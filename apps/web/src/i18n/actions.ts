'use server';

import { cookies } from 'next/headers';
import { localeCookieName, normalizeUiLocale, type UiLocale } from './config';

const ONE_YEAR_SECONDS = 60 * 60 * 24 * 365;

export type SetUiLocaleResult =
  | { ok: true; locale: UiLocale }
  | { ok: false; code: 'INVALID_LOCALE' };

/** Validate and persist the browser locale without changing any content URL. */
export async function setUiLocale(value: unknown): Promise<SetUiLocaleResult> {
  const locale = normalizeUiLocale(value);
  if (!locale) return { ok: false, code: 'INVALID_LOCALE' };

  const cookieStore = await cookies();
  cookieStore.set(localeCookieName, locale, {
    path: '/',
    maxAge: ONE_YEAR_SECONDS,
    sameSite: 'lax',
  });
  return { ok: true, locale };
}
