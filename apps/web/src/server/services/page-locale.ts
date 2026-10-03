import { eq, isNull, type SQL } from 'drizzle-orm';
import type { PgColumn } from 'drizzle-orm/pg-core';

/**
 * A page's `locale` records the language its text is written in, and an
 * original page may have none. Only a translation row is *routed* by it: it is
 * served at `/{locale}/{slug}`, while an original is served at its bare address
 * whatever language it is written in.
 *
 * Everything that builds an address or renders a document "as read at a
 * locale" must go through this instead of passing `page.locale` along, or an
 * original written in a non-default language would be addressed (and have its
 * links resolved) as if it were a translation.
 */
export function routingLocale(page: {
  sourcePageId: string | null;
  locale: string | null;
}): string | null {
  return page.sourcePageId ? page.locale : null;
}

/**
 * `column = locale`, where "language not set" is a value too. A plain
 * `eq(column, null)` compiles to `column = NULL`, which matches nothing, so a
 * conflict check written that way would silently stop finding the page it is
 * looking for.
 */
export function localeEquals(column: PgColumn, locale: string | null): SQL {
  return locale === null ? isNull(column) : eq(column, locale);
}

/**
 * The language of a translation row. The `pages_translation_has_locale` check
 * constraint guarantees one; the column's type cannot say so, so this narrows
 * it and fails loudly rather than interpolating "null" into an address.
 */
export function translationLocale(page: { locale: string | null }): string {
  if (page.locale === null) throw new Error('Invariant: a translation row has no locale');
  return page.locale;
}
