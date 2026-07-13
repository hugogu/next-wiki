# Web localization

The web UI uses `next-intl` with an explicit two-value registry (`en` and
`zh`). UI language is a preference, not a route segment: do not add locale
middleware, `defineRouting`, URL rewrites, or locale-aware navigation helpers.

Message catalogs live in [`messages/en.json`](./messages/en.json) and
[`messages/zh.json`](./messages/zh.json). They are namespaced JSON catalogs;
`pnpm --filter @next-wiki/web i18n:validate` checks key parity and ICU
variable compatibility before release.

There are two rendering boundaries:

- Dynamic application screens resolve persisted preference, the
  `next-wiki-locale` cookie, weighted `Accept-Language`, then English.
- Public reader documents use a request-independent English server default.
  Personal controls hydrate on the client, so cookies and preferences never
  vary public document HTML, canonical URLs, hreflang, or cache tags.

The existing `/{language}/{path}` convention remains content translation
routing. `zh` in that URL identifies translated page content; it never selects
the UI language.
