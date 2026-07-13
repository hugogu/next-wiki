# Research: Unified UI Localization

## Decision 1: Use next-intl without UI locale routing

**Decision**: Configure next-intl in its App Router no-routing mode. Do not add
a locale route segment, locale redirect, middleware/proxy rewrite,
`defineRouting`, `createNavigation`, or locale-aware links for the UI.

**Rationale**: The reader's existing catch-all route already interprets a
leading two-letter segment as an AI-generated content translation. A UI route
such as `/zh/...` would collide with that stable document address. next-intl
supports App Router use without locale-based routing.

**Alternatives considered**:

- UI `/{locale}/...` routes: rejected because they compete with content
  translation URLs and break the one-canonical-entry-point rule.
- A dedicated UI prefix such as `/ui/{locale}/...`: rejected for this release
  because UI language is a personal preference, the existing URLs are stable,
  and it creates duplicate entry points without a user need.
- Retain the custom provider: rejected because it lacks robust ICU messages,
  type-safe message contracts, request integration, and locale formatting.

**Sources**: [next-intl without i18n routing](https://next-intl.dev/docs/getting-started/app-router/without-i18n-routing), [Next.js internationalization guide](https://nextjs.org/docs/app/guides/internationalization).

## Decision 2: Centralize validated UI locale resolution

**Decision**: Define a finite `UiLocale` registry (`en`, `zh`) and one shared
resolver. For dynamic application requests it uses, in order: valid persisted
authenticated preference, valid product cookie, weighted `Accept-Language`
match, then `en`. It validates every value before catalog loading or preference
persistence.

**Rationale**: The current root layout can use a saved database preference while
metadata and other server components only use cookie/header resolution. One
resolver removes mixed-language server output and safely handles invalid legacy
values. A real locale matcher correctly handles examples such as `zh-CN` and
weighted language lists.

**Alternatives considered**:

- Use the first `Accept-Language` token: rejected because it ignores quality
  weighting and supported fallback languages.
- Let each layout resolve locale independently: rejected because it recreates
  the current metadata/document/client mismatch.
- Expand UI locale values to match all administrator content languages:
  rejected because content translation lifecycle is independent and dynamic.

**Sources**: [next-intl request configuration](https://next-intl.dev/docs/usage/configuration), [FormatJS locale matcher](https://formatjs.github.io/docs/polyfills/intl-localematcher/), [Next.js cookies](https://nextjs.org/docs/app/api-reference/functions/cookies).

## Decision 3: Keep public documents static and localize personal UI separately

**Decision**: Split localization boundaries. Dynamic authenticated/application
routes use the per-request next-intl configuration. The static public reader
must not invoke a cookie-, header-, session-, or database-preference-dependent
locale resolver while producing document HTML or public metadata. It uses
cache-safe content/default values on the server; personal labels and controls
are localized by a client boundary after delivery.

**Rationale**: `cookies()` and `headers()` are dynamic APIs. Calling them from a
layout shared by the public reader would compromise the ISR contract. The
reader already has `dynamic = 'force-static'`, a 300-second revalidation period,
and shared public content cache tags; these must remain unchanged. Content
translation locale continues to control translated document identity,
canonical URL, and hreflang—not the UI locale.

**Alternatives considered**:

- Render every public document per UI preference: rejected by Constitution P12
  and would fragment cacheability and SEO metadata.
- Always render public-reader UI in the visitor's cookie locale on the server:
  rejected because it makes a shared ISR document request-specific.
- Replace the content-translation URL scheme: rejected as outside this feature
  and a breaking bookmark/API behavior change.

**Sources**: [Next.js dynamic APIs and caching](https://nextjs.org/docs/app/guides/caching#dynamic-apis), [Next.js cookies](https://nextjs.org/docs/app/api-reference/functions/cookies).

## Decision 4: Store catalogs as typed, namespaced JSON and use ICU/formatters

**Decision**: Convert the flat English/Chinese TypeScript dictionaries into
namespaced JSON catalogs with equivalent coverage. Register the base catalog
and UI locale type with next-intl. Migrate hand-written `{{variable}}`
interpolation to ICU only when a message needs variables, plural/select logic,
or rich content. Replace ad-hoc `toLocale*` calls with centralized message and
formatter APIs.

**Rationale**: The current catalog ensures key parity but cannot validate
variable names/forms, plural/select semantics, rich messages, or consistent
formatting. next-intl supports type-safe message keys, ICU messages, and date,
number, and relative-time formatting.

**Alternatives considered**:

- Preserve flat keys indefinitely: rejected because it produces an awkward
  migration surface and does not improve message structure or formatter use.
- Convert every message to ICU: rejected because static labels gain no value and
  a mechanical conversion increases migration risk.
- Keep direct browser `Intl` calls scattered in components: rejected because it
  permits formatting omissions and server/client inconsistencies.

**Sources**: [next-intl TypeScript workflow](https://next-intl.dev/docs/workflows/typescript), [messages and ICU](https://next-intl.dev/docs/usage/messages), [date and time formatting](https://next-intl.dev/docs/usage/dates-times).

## Decision 5: Make a language switch authoritative only after persistence and refresh

**Decision**: Validate and write the selected locale to the existing product
cookie and, for an authenticated user, the existing preference record. Refresh
the active route after a successful change so RSC output, `<html lang>`,
metadata, and client messages agree. A failed persistence request presents a
localized failure and restores/retains the last confirmed locale.

**Rationale**: The current switcher changes only client state and a cookie, and
silently ignores a preference-write failure. That can leave server-rendered text
and metadata stale. Refreshing after the authoritative result makes the server
and client converge.

**Alternatives considered**:

- Client state and cookie only: rejected because server-rendered components do
  not reliably update and a failed account preference is hidden.
- Cookie-only preference: rejected because signed-in users expect cross-device
  persistence.
- Write preference without refresh: rejected because it keeps RSC/metadata
  potentially mixed until unrelated navigation.

**Sources**: [Next.js router refresh](https://nextjs.org/docs/app/api-reference/functions/use-router), [Next.js cookies](https://nextjs.org/docs/app/api-reference/functions/cookies).

## Decision 6: Use a staged migration with explicit compatibility tests

**Decision**: Introduce next-intl, resolver, catalog typing, and a temporary
compatibility adapter first; migrate shared providers and server lookup, then
client/server consumers in product-domain batches. Migrate the renderer's
separately mounted code/diagram islands explicitly. Remove the old runtime and
catalogs only after import, message, route, public-cache, and E2E checks pass.

**Rationale**: The current custom API is used by 89 client and 39 server files.
`ContentRenderer` manually creates independent React roots, so it cannot
implicitly inherit a replacement context or react to a root locale change.
Staging limits regression surface and keeps each batch verifiable.

**Alternatives considered**:

- Big-bang rename/removal: rejected because failures across reader, auth,
  admin, and renderer UI become hard to isolate.
- Leave the old provider alongside next-intl permanently: rejected because two
  locale sources and two catalogs would reintroduce drift.

## Resolved Planning Questions

| Question | Resolution |
|---|---|
| Does the UI use locale URL routing? | No. UI language remains preference-based; no URL is added or rewritten. |
| Does an AI content language become a UI language? | No. `translation_languages` and `pages.locale` remain the content-translation domain. |
| Can public reader metadata use a UI cookie? | No. Dynamic/authenticated route metadata may use the resolver; cacheable public document metadata uses only stable content/cache-safe inputs. |
| Is a database migration needed? | No. Existing `users.locale_preference` and `en`/`zh` API schema are retained. |
| Does UI language change public cache invalidation? | No. It must not call public content revalidation; existing content lifecycle invalidation remains unchanged. |
