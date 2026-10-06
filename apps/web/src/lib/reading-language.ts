/**
 * The language a reader last chose for pages that come in several, kept in this
 * browser only. Reading public pages needs no account, and the pages themselves
 * are cached static documents that must not vary by who asks, so the choice is
 * applied in the browser after the page loads rather than on the server.
 *
 * Choosing the original clears it: "no choice yet" and "the original" both mean
 * a page opens as written.
 */
const STORAGE_KEY = 'next-wiki-reading-language';
const LOCALE_CODE = /^[a-z]{2}$/;

/** The language last chosen, or null when there is none or it cannot be read. */
export function readReadingLanguage(): string | null {
  try {
    const stored = window.localStorage.getItem(STORAGE_KEY);
    return stored && LOCALE_CODE.test(stored) ? stored : null;
  } catch {
    // Storage can be blocked, or absent on the server.
    return null;
  }
}

/** Remember `locale`, or forget the choice with null (the original). */
export function writeReadingLanguage(locale: string | null): void {
  try {
    if (locale) window.localStorage.setItem(STORAGE_KEY, locale);
    else window.localStorage.removeItem(STORAGE_KEY);
  } catch {
    // The choice is simply not remembered.
  }
}
