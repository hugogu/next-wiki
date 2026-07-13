# UI Localization Contract

## Purpose

This internal UI contract defines observable behavior while migrating the
localization runtime. It does not add or change a public content API.

## 1. UI Locale Resolution

For dynamic UI requests, select exactly one supported UI locale using this
ordered contract:

1. A valid authenticated user's saved preference.
2. A valid `next-wiki-locale` browser cookie.
3. A supported match from the browser's weighted `Accept-Language` declaration.
4. The default `en` locale.

Malformed, unknown, retired, or content-only language values are ignored and
the resolver continues to the next source. The resolver never exposes an
unknown value as a catalog name, URL segment, or page locale.

For a static anonymous public document, the request-specific steps above are
not performed during document or public metadata rendering. Personalized UI
controls may resolve their locale after delivery.

## 2. Existing Preference HTTP Contract

The existing authenticated preference operation remains compatible:

```http
PATCH /api/user/preferences
Content-Type: application/json

{
  "theme": "light" | "dark" | "auto" | null,
  "locale": "en" | "zh" | null
}
```

```json
{
  "theme": "light" | "dark" | "auto" | null,
  "locale": "en" | "zh" | null
}
```

Behavior added by this feature:

- The selected `locale` is validated before it becomes the browser preference
  or authenticated saved preference.
- On success, the active route refreshes so server-rendered and interactive UI
  converge on the returned locale.
- On failure, the UI presents a localized failure and must not report that an
  unsaved preference is durable.

No public page, content translation, OpenAPI resource, or response field gains
a UI-locale route parameter.

## 3. URL and Content-Translation Invariance

| Address / value | Contract |
|---|---|
| `/guide` | Continues to identify the original/source document. UI locale changes do not redirect it. |
| `/zh/guide` | Continues to identify the existing Chinese content translation if it is enabled and available. It never means “Chinese UI around `/guide`.” |
| `/admin/...`, `/auth/...`, `/user-center/...` | Existing URL is retained; UI language is not encoded in a competing path. |
| `pages.locale`, `translation_languages` | Existing content-translation data; not valid input for selecting UI language unless the code is also in the finite UI locale set. |

## 4. Message and Formatting Contract

- Every user-visible message is addressed by a stable namespaced key and is
  available in every shipped UI catalog.
- Messages may accept explicitly declared values and use ICU plural, selection,
  and rich-text behavior where needed.
- Date, time, number, and relative-time presentation uses the resolved UI
  locale and registered formats rather than unscoped browser defaults.
- Missing message fallback is visible only as baseline-language text; raw keys,
  blank labels, and uncaught formatting failures are forbidden.
- Server/domain errors crossing into UI are mapped from stable error codes to
  localized messages. Raw server `.message` text is not treated as UI copy.

## 5. Static Public Content Contract

- Cookie, `Accept-Language`, session, and saved UI preference must not vary the
  cached public document body, content-derived metadata, canonical URL,
  hreflang output, or public navigation representation.
- UI preference changes do not call public content cache invalidation.
- Existing source publish/unpublish/path/metadata and content-translation
  lifecycle invalidation continue to revalidate their current routes/tags.
