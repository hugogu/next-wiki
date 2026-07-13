# Data Model: Unified UI Localization

## Overview

This feature introduces no database schema or content-model migration. It
formalizes UI localization values and their relationship to existing persisted
preferences while explicitly separating them from AI content translation.

## Entities

### UI Locale

| Field | Description | Rules |
|---|---|---|
| `code` | Product UI language identifier | Closed set in this release: `en`, `zh`; must be validated before use. |
| `displayName` | Localized language label | Must be available in each shipped UI catalog. |
| `fallback` | Locale used for unavailable UI text | `en` for this release; no raw identifier reaches an end user. |

### User Locale Preference

| Field | Description | Rules |
|---|---|---|
| `userId` | Existing authenticated user identity | Existing permission checks apply. |
| `localePreference` | Existing persisted preferred UI locale | Nullable; valid values are `en` or `zh`; invalid legacy value is treated as absent. |
| `updatedAt` | Existing preference update time | Updated by the existing preference operation. |

**Lifecycle**:

```text
unset ── user saves valid locale ──> saved(en|zh)
saved(en|zh) ── user selects another ──> saved(en|zh)
saved(invalid legacy value) ── resolver ──> ignored / fallback selection
```

No history, synchronization job, or schema migration is added.

### Visitor Locale Preference

| Field | Description | Rules |
|---|---|---|
| `cookieName` | Existing browser preference name | Remains `next-wiki-locale` for compatibility. |
| `value` | Browser's selected UI locale | Must be a validated `UiLocale`; malformed/unknown values are ignored. |
| `lifetime` | Preference duration | Remains long-lived; it must never identify content language or page identity. |

### Locale Resolution Result

| Field | Description | Rules |
|---|---|---|
| `locale` | Final selected UI locale | Always one supported `UiLocale`. |
| `source` | Origin used to select it | Persisted preference, product cookie, browser declaration, or default. |
| `cacheMode` | Rendering boundary | `dynamic-ui` may use request preferences; `public-static` uses a cache-safe locale only. |

**Resolution state**:

```text
dynamic request: valid account preference
  → valid product cookie
  → supported browser language match
  → default `en`

public static document: cache-safe stable locale/content-derived values only
  → personalized locale applied later to client controls
```

### UI Message Catalog

| Field | Description | Rules |
|---|---|---|
| `locale` | Catalog's UI locale | One catalog per shipped UI locale. |
| `namespace` | Product-area grouping | Mirrors semantic domains such as common, auth, admin, and user center. |
| `key` | Stable message identifier | Must exist in the baseline catalog and be type-checked. |
| `message` | Localized text and permitted ICU structure | Variables/forms must be compatible across shipped catalogs. |
| `format` | Optional named date/number/relative-time format | Must be registered and deterministic for its UI locale. |

### Content Translation Language (Existing, Protected Boundary)

| Field | Description | Rules |
|---|---|---|
| `translation_languages.code` | AI target language | Administrator-managed; can differ from the UI-locale set. |
| `pages.locale` | Language of a source/translated page | Determines content identity and translation relationships. |
| `translation_group_id` | Links original and translations | Unchanged by UI preference changes. |
| `/{contentLocale}/{path}` | Existing translation reader address | Must never be generated or consumed by UI locale routing. |

## Relationships and Invariants

```text
User ──(optional saved preference)──> UI Locale
Visitor browser ──(optional cookie)──> UI Locale
UI Locale ──(selects)──> UI Message Catalog

Page ──(content locale / translation group)──> Content Translation Language

UI Locale != Content Translation Language
```

1. A UI locale can share a code with a content translation language but never
   changes a page's content locale, route, canonical URL, or translation state.
2. A public static document cannot include a per-user `Locale Resolution
   Result` in its cache key or rendered public metadata.
3. Updating a UI preference changes only preference state; it never invokes
   page cache invalidation or content translation work.
4. A missing UI message falls back to the baseline catalog and is a release
   validation failure; an invalid locale falls back through the resolver.
