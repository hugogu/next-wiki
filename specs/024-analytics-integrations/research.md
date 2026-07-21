# Phase 0 Research: Web Analytics Integrations

**Feature**: 024-analytics-integrations
**Date**: 2026-07-21
**Status**: Complete - all unknowns resolved

This document consolidates the research that informed the implementation plan.
Each item records the decision, rationale, and alternatives considered.

---

## R1: Where should the analytics `<script>` tags be injected?

**Decision**: In the `<head>` of the root `apps/web/app/layout.tsx`, immediately
after the existing `<script dangerouslySetInnerHTML={{ __html: themeScript }} />`
block. Source the script string from a new
`getActiveAnalyticsScriptContent()` service in
`src/server/services/analytics.ts`, mirroring `getActiveThemeCss()`.

**Rationale**: The root layout is the only framework-level surface that wraps
every route (public, admin, auth, editor, chat). It already uses
`dangerouslySetInnerHTML` for the system-theme CSS and a small inline
`themeScript`. This is the established pattern for site-wide script/style
injection, is cache-tagged with `SITE_SHELL_CACHE_TAG`, and satisfies the
spec's "framework-level, never per-page" constraint without introducing a new
injection mechanism.

**Alternatives considered**:
- `next/script` with `strategy="afterInteractive"` or `"lazyOnload"`: works in
  the App Router but the vendor snippets we need (Baidu `hm.js`, Google
  `gtag/js`) already ship with their own loader pattern that expects a plain
  `<script>` tag in `<head>`. Wrapping them in `next/script` would change
  loading semantics and is unnecessary for v1.
- Per-route group layouts (`(public)/layout.tsx`, `(admin)/admin/layout.tsx`):
  would miss the auth surface and would require duplicate injection logic.
  Rejected.
- A dedicated middleware that injects into the HTML response: middleware runs
  on every request and cannot benefit from the ISR cache. Rejected for
  performance and complexity.

---

## R2: Single-row table vs key-addressed table?

**Decision**: Key-addressed table `analytics_provider_settings`, keyed by
`provider` (pgEnum `analytics_provider`), mirroring the
`content_data_source_settings` pattern exactly.

**Rationale**:
- The spec requires each provider to be independently enabled/disabled and to
  retain its Tracking ID when disabled. A key-addressed table makes this
  natural: one row per provider, upserted independently.
- The `content_data_source_settings` table is the established in-codebase
  pattern for exactly this shape (closed registry of known keys, each with an
  `enabled` flag and a `config` jsonb).
- Adding a future provider is still bounded: append the shared enum, append the
  PostgreSQL enum value via `pnpm db:generate`, and append one provider registry
  entry. No page-component edits are required.
- A single-row `analytics_settings` table with one JSONB column for all
  providers would also work, but it loses Drizzle's per-field typing and makes
  atomic per-provider upsert harder.

**Alternatives considered**:
- Single-row table with a `providers` JSONB column (like `aiSettings`):
  rejected because (a) the per-provider independent update + retention
  semantics are cleaner with one row per provider, and (b) the
  `content_data_source_settings` pattern is a closer analog (closed registry of
  well-known keys) than `aiSettings` (single global config + separate
  multi-row `ai_providers` table).
- A full multi-row `analytics_providers` table like `ai_providers` (with name,
  vendor, kind, base_url, config, credentials_encrypted, status, etc.):
  overkill. Analytics providers are a closed, admin-curated set with only two
  fields (enabled, tracking_id); they are not user-created and do not carry
  credentials.

---

## R3: Should Tracking IDs be encrypted?

**Decision**: No. Tracking IDs are stored as plain `text` columns.

**Rationale**: Tracking IDs are rendered into public HTML by design - every
visitor to the site sees the Baidu Tongji `hm.js?XXXXXXXX` URL and the Google
Analytics `G-XXXXXXXX` ID in the page source. Encrypting them would provide no
security benefit and would add complexity (key management, decryption on every
cache miss). The `encryptKey`/`decryptKey` modules are reserved for actual
secrets (API keys for server-side operations, like the AI provider
credentials).

**Alternatives considered**:
- Encrypt with `encryptKey` (like `aiProviders.credentialsEncrypted`):
  rejected because the value is not secret.
- Store in environment variables instead of the DB: would require a redeploy
  to change Tracking IDs, violating the spec's "configure in the admin
  backend" requirement. Rejected.

---

## R4: New permission action, or reuse `manage_appearance`?

**Decision**: Reuse the existing `manage_appearance` action with the
`{ kind: 'appearance' }` resource. No changes to `permissions/index.ts`.

**Rationale**:
- The spec's permission requirement is "admin-only" - exactly what
  `manage_appearance` already enforces (role === 'admin', API keys denied).
- Analytics configuration is conceptually adjacent to site identity
  (`/admin/site`), system theme (`/admin/appearance`), and other shell-level
  concerns that already use `manage_appearance`.
- Adding a new `manage_integrations` action would require changes to the
  `Action` union, `Resource` union, `roleAllows` switch, the API-key
  hard-deny list, and (if an API-key scope were desired) the `apiKeyScopeEnum`
  and `scopeToActions` map. That is disproportionate to the value.

**Alternatives considered**:
- New `manage_integrations` action + `{ kind: 'integrations' }` resource:
  rejected as over-engineered for a two-field, admin-only config surface.
- New `manage_analytics` action: same issue.

---

## R5: How should the public script string be cached?

**Decision**: Wrap the script-builder in `unstable_cache` with
`revalidate: 300, tags: [SITE_SHELL_CACHE_TAG]`, and gate the cached path with
`shouldUseDataCache()` - exactly mirroring `getActiveThemeCss()` in
`src/server/services/system-theme.ts`.

**Rationale**:
- The site-shell cache tag (`SITE_SHELL_CACHE_TAG`) is the established tag for
  data that affects the layout `<head>` (system theme CSS, site identity
  view). Analytics scripts belong to the same category.
- `shouldUseDataCache()` bypasses the cache in tests and E2E runs
  (`NEXT_WIKI_E2E=true`), so tests can assert against fresh data.
- Every mutation calls `invalidateSiteShellCache()`, which
  `revalidateTag(SITE_SHELL_CACHE_TAG, 'max')`s. This means the analytics
  script set updates immediately on admin save, with no 5-minute staleness
  window in production.

**Alternatives considered**:
- A separate `ANALYTICS_CACHE_TAG`: rejected because it duplicates the
  site-shell invalidation plumbing without benefit. The layout-level
  representation is already revalidated as a unit.
- No caching (read DB on every request): violates P12 (public content must
  not require a DB query per visitor). Rejected.

---

## R6: How should public/anonymous pages stay static/ISR-compatible?

**Decision**: The root `app/layout.tsx` reads the cached analytics script
string at render time and inlines it into the document body via
`dangerouslySetInnerHTML`. The string depends only on the admin-configured
provider state (enabled + Tracking ID), never on session/cookie/header.

**Rationale**: This matches the existing system-theme CSS injection, which is
already proven to be ISR-compatible. The script set is identical for every
visitor to a given page, so the cached HTML is safe to serve to anonymous
visitors without a per-request DB or session lookup.

**Alternatives considered**:
- Client-side fetch from `/api/settings/analytics` and dynamic injection: would
  add a round-trip, delay the vendor script (hurting analytics accuracy), and
  break the "scripts must be in the initial HTML" expectation that vendors
  document. Rejected.
- Render analytics in a separate dynamic boundary: would split the `<head>`
  into a cached part and a dynamic part, complicating the layout. Unnecessary,
  since the script set is not session-dependent. Rejected.

---

## R7: How should providers be registered (pluggability)?

**Decision**: A closed `REGISTERED_ANALYTICS_PROVIDERS` array in
`src/server/services/analytics.ts`, each entry containing:
- `provider` (the enum key, e.g. `baidu_tongji`)
- `labelKey` and `descriptionKey` (i18n catalog keys)
- `trackingIdLabelKey` (i18n key for the Tracking ID field label)
- `trackingIdPattern` (regex for validation)
- `trackingIdFormat` (human-readable hint, e.g. `"hm.js?xxxxxxxx"` or
  `"G-XXXXXXXX"`)
- `buildScriptContent(trackingId: string): string` (returns JavaScript loader
  content with the Tracking ID interpolated)

The shared package (`packages/shared/src/analytics.ts`) mirrors the enum via
a Zod schema, so unknown provider values are rejected at the API boundary
before reaching the service.

**Rationale**:
- Mirrors the `REGISTERED_SOURCES` pattern in `content-data-sources.ts`
  (constitutional P10 - explicit registration).
- The `buildScriptContent` factory keeps the provider loader code in one place,
  making it easy to audit and update.
- The i18n keys mean labels are translatable without code changes.
- Adding a new provider (Matomo, Plausible, Umami) is one registry entry + one
  shared enum value + one PostgreSQL enum migration via `pnpm db:generate` - no
  page code changes.

**Alternatives considered**:
- Filesystem-discovered provider modules (e.g. `src/server/analytics/providers/*.ts`):
  rejected by constitutional P10 (custom runtime discovery through filesystem
  scanning is prohibited unless the feature spec defines a bounded registry
  and testable loading contract; the closed array is simpler and equivalent).
- Hardcoded switch statement in the service: rejected because it scatters
  provider metadata across the codebase and is harder to extend.

---

## R8: What are the canonical vendor script loaders?

**Decision**: Use loader code equivalent to the official vendor snippets, with
the Tracking ID interpolated as a string (never via unvalidated input that could
break out of the script content). The root layout owns the single outer
`<script id="app-analytics">`; provider definitions return JavaScript content,
not nested `<script>` tags. The Tracking IDs are validated against each
provider's documented format.

**Baidu Tongji** (`baidu_tongji`):
- Tracking ID format: a hex string, traditionally used as the `hm.js?XXXXX`
  parameter. Pattern: `/^[a-f0-9]{32}$/i` (32-char hex; Baidu's documentation
  shows this format).
- Loader content:
  ```js
    var _hmt = _hmt || [];
    (function() {
      var hm = document.createElement("script");
      hm.src = "https://hm.baidu.com/hm.js?{TRACKING_ID}";
      var s = document.getElementsByTagName("script")[0];
      s.parentNode.insertBefore(hm, s);
    })();
  ```

**Google Analytics** (`google_analytics`):
- Tracking ID format: `G-XXXXXXXX` (Measurement ID for Google Analytics 4).
  Pattern: `/^G-[A-Z0-9]{6,12}$/`.
- Loader content:
  ```js
    (function() {
      var gtagScript = document.createElement("script");
      gtagScript.async = true;
      gtagScript.src = "https://www.googletagmanager.com/gtag/js?id={TRACKING_ID}";
      var s = document.getElementsByTagName("script")[0];
      s.parentNode.insertBefore(gtagScript, s);
    })();
    window.dataLayer = window.dataLayer || [];
    function gtag(){dataLayer.push(arguments);}
    gtag('js', new Date());
    gtag('config', '{TRACKING_ID}');
  ```

**Rationale**: Using equivalent vendor loader code ensures compatibility with
the vendor's collection logic while avoiding invalid nested `<script>` markup
inside the root layout's framework-owned script tag. The Tracking ID is
interpolated as a plain string (not via `eval`), and the regex validation
prevents any character that could break out of the script content (no quotes,
angle brackets, or backslashes allowed by the patterns).

**Alternatives considered**:
- `gtag` npm package (`react-ga4`, `nextjs-google-analytics`): rejected. The
  vendor snippets are plain `<script>` tags; an npm wrapper adds bundle size
  and couples us to a third-party maintenance cadence. The spec explicitly
  says "scripts the vendor provides", and the existing layout pattern
  (`themeScript`) already inlines vendor-style scripts.
- Google Tag Manager container (`GTM-XXXX`): out of scope for v1. Could be
  added as a future provider through the same contract if needed.

---

## R9: What API shape should the configuration endpoints take?

**Decision**:
- `GET /api/settings/analytics` - **admin-only** (`@auth bearer`); returns the
  list of providers with their `enabled` and `trackingId` fields for the admin
  configuration UI.
- `PUT /api/settings/analytics` - **admin-only** (`@auth bearer`); takes a
  body of `{ providers: [{ provider, enabled, trackingId }] }` and upserts
  each provider row. Mirrors `PUT /api/settings/site`.

**Rationale**:
- The layout renders for anonymous visitors but does not need a public settings
  API. It calls the in-process, cacheable
  `getActiveAnalyticsScriptContent()` service directly and receives only the
  script content needed for page HTML. The configuration view remains
  admin-only, preserving FR-006/FR-007 and SC-005.
- The PUT is admin-only and uses the existing `createApiContext()` +
  `manage_appearance` permission gate.
- No per-provider PATCH endpoint (`/api/settings/analytics/[provider]`) is
  needed for v1 - the single PUT accepts the full provider list and is simpler
  for the form to submit. This can be added later if needed.

**Alternatives considered**:
- Per-provider `PATCH /api/settings/analytics/[provider]`: mirrors
  `content-data-sources/[sourceKey]`. Rejected for v1 as overkill for two
  providers; the single PUT is simpler for the form.
- Public GET returning settings: rejected because it exposes the configuration
  surface to non-admins and conflicts with FR-006/FR-007. The fact that enabled
  Tracking IDs appear in page HTML does not require exposing disabled provider
  state or the admin settings view.

---

## R10: How should the admin UI be structured?

**Decision**: A single admin page at `/admin/analytics` (server component)
that renders a client form component `AnalyticsProvidersForm` (in
`src/components/admin/analytics/`). The form lists each registered provider
with:
- An enable/disable switch (toggle)
- A Tracking ID text input
- A format hint (e.g. "32-character hex string" or "G-XXXXXXXX")
- Inline validation feedback

A single "Save" button submits the full provider list to `PUT
/api/settings/analytics`. The form shows success/error feedback inline (no
browser `alert`, per the project UI guidance in AGENTS.md).

**Rationale**:
- Mirrors the `SiteSettingsForm` pattern (`src/components/admin/appearance/SiteSettingsForm.tsx`).
- A single page with a single form is the simplest UX for two providers.
- The page is added to the admin nav under the `system` group, right after
  `appearance` (conceptually adjacent: shell-level rendering concerns).

**Alternatives considered**:
- A tabbed UI like the AI admin page: overkill for two providers.
- A separate page per provider: would require navigating between pages for a
  two-field configuration. Rejected.

---

## R11: How should i18n keys be structured?

**Decision**: Add a new `admin.analytics` block to `apps/web/messages/en.json`
and `apps/web/messages/zh.json`, plus a new `admin.nav.analytics` entry in the
`system` nav group.

```json
{
  "admin": {
    "nav": {
      "analytics": "Analytics"
    },
    "analytics": {
      "title": "Web analytics",
      "description": "Configure third-party analytics providers. Each provider's tracking script is injected into every page when enabled.",
      "noProviders": "No analytics providers are registered.",
      "allDisabled": "All analytics providers are currently disabled. No tracking scripts will be loaded.",
      "providers": {
        "baidu_tongji": {
          "label": "Baidu Tongji (百度统计)",
          "description": "Baidu's web analytics service.",
          "trackingId": {
            "label": "Tracking ID",
            "placeholder": "32-character hex string",
            "format": "32-character hex string"
          }
        },
        "google_analytics": {
          "label": "Google Analytics",
          "description": "Google's web analytics service (GA4).",
          "trackingId": {
            "label": "Measurement ID",
            "placeholder": "G-XXXXXXXX",
            "format": "G-XXXXXXXX (e.g. G-A1B2C3D4E5)"
          }
        }
      },
      "save": "Save",
      "saved": "Analytics settings saved.",
      "saveFailed": "Failed to save analytics settings.",
      "invalidTrackingId": "Tracking ID does not match the expected format."
    }
  }
}
```

**Rationale**: Follows the existing `admin.appearance`, `admin.site`, and
`admin.ai` block structure. Both locales must stay in sync.

**Alternatives considered**:
- Hardcoded English labels in the component: violates the i18n convention.

---

## R12: Migration generation

**Decision**: Add the new enum to `src/server/db/schema/enums.ts` and the new
table to `src/server/db/schema/index.ts`, then run `pnpm db:generate` to
produce the `0030_*.sql` migration. Never hand-author the SQL, journal, or
snapshot.

**Rationale**: Documented in `CLAUDE.md` and `AGENTS.md` - the
`meta/NNNN_snapshot.json` is required for every future `db:generate` call, and
only `drizzle-kit generate` produces it correctly. Hand-authoring has broken
the chain twice before (`0020`-`0023`).

**Alternatives considered**: None. This is a hard constraint of the project.

---

## R13: OpenAPI regeneration

**Decision**: After adding the new `/api/settings/analytics` route with its
JSDoc `@openapi` annotations, run
`pnpm --filter @next-wiki/web openapi:generate` to regenerate `openapi.json`.

**Rationale**: Required by `AGENTS.md` ("When there is API changes, update docs
via next-open-api").

---

## Summary of resolved unknowns

| # | Unknown | Resolution |
|---|---|---|
| R1 | Script injection location | Root `app/layout.tsx` `<head>`, after `themeScript` |
| R2 | Table shape | Key-addressed `analytics_provider_settings`, mirroring `content_data_source_settings` |
| R3 | Tracking ID encryption | No - plain `text` (public by design) |
| R4 | Permission action | Reuse `manage_appearance` + `{ kind: 'appearance' }` |
| R5 | Public script caching | `unstable_cache` tagged `SITE_SHELL_CACHE_TAG`, `shouldUseDataCache()` guard |
| R6 | ISR compatibility | Inline via `dangerouslySetInnerHTML`, depends only on admin state |
| R7 | Provider registration | Closed `REGISTERED_ANALYTICS_PROVIDERS` array in service file |
| R8 | Vendor loaders | Baidu `hm.js` + Google `gtag/js` loader content, regex-validated, rendered inside one framework-owned script tag |
| R9 | API shape | `GET` (admin) + `PUT` (admin) at `/api/settings/analytics`; no public settings endpoint |
| R10 | Admin UI | Single `/admin/analytics` page + `AnalyticsProvidersForm` client component |
| R11 | i18n | New `admin.analytics` block in en.json + zh.json |
| R12 | Migrations | `pnpm db:generate` only |
| R13 | OpenAPI | `pnpm --filter @next-wiki/web openapi:generate` after route added |

All unknowns resolved. No `NEEDS CLARIFICATION` markers remain.
