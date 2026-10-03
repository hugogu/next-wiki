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
