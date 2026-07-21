# Script Injection Contract: Web Analytics Integrations

**Feature**: 024-analytics-integrations
**Date**: 2026-07-21

This document specifies the framework-level script injection contract: the
single injection point, the script template registry, the validation rules,
and the cache interaction. This is the heart of the feature - the spec's
hard constraint is that scripts MUST be injected at the framework level, never
per-page.

---

## Injection Point

**File**: `apps/web/app/layout.tsx` (the root layout - the only layout-level
component that wraps every route, including public, admin, auth, editor, and
chat surfaces).

**Location**: Inside the existing `<head>` block, immediately after the
existing `<script dangerouslySetInnerHTML={{ __html: themeScript }} />` tag
(around line 102 of the current file).

**Mechanism**: `dangerouslySetInnerHTML` on one framework-owned script tag with
JavaScript content sourced from the new `getActiveAnalyticsScriptContent()`
service function. This is the same mechanism already used by the root layout
for the system-theme CSS and the `themeScript` inline script. The service
returns JavaScript content only; it MUST NOT return `<script>` tags that would
be nested inside the layout-owned `<script>`.

```tsx
<head>
  <style id="app-system-theme" dangerouslySetInnerHTML={{ __html: systemCss }} />
  <style id="app-reading-theme" dangerouslySetInnerHTML={{ __html: readingThemeCss }} />
  <script dangerouslySetInnerHTML={{ __html: themeScript }} />
  {analyticsScriptContent ? (
    <script
      id="app-analytics"
      dangerouslySetInnerHTML={{ __html: analyticsScriptContent }}
    />
  ) : null}
</head>
```

The `analyticsScriptContent` variable is sourced at the top of the
`RootLayout` function:

```tsx
const analyticsScriptContent = await getActiveAnalyticsScriptContent();
```

**Why a single framework-owned `<script>` tag?** The service returns one
concatenated JavaScript body containing all enabled providers' loader code. This
keeps the layout simple (one conditional `dangerouslySetInnerHTML` call), lets
the service control the rendering order, and avoids invalid nested `<script>`
markup. When no providers are enabled, the layout renders no analytics script
tag, satisfying FR-010's "no placeholder" requirement.

---

## Service Contract: `getActiveAnalyticsScriptContent()`

**File**: `apps/web/src/server/services/analytics.ts` (NEW)

**Signature**:

```ts
export async function getActiveAnalyticsScriptContent(): Promise<string>
```

**Behavior**:
1. Reads the `analytics_provider_settings` table (cached via `unstable_cache`
   tagged `SITE_SHELL_CACHE_TAG`, 300s revalidate, gated by
   `shouldUseDataCache()` - exactly mirroring `getActiveThemeCss()`).
2. For each row with `enabled = true` and a non-null `trackingId` that passes
   the provider's regex:
   - Looks up the provider definition in `REGISTERED_ANALYTICS_PROVIDERS`.
   - Calls `definition.buildScriptContent(trackingId)` to get the vendor
     JavaScript loader content with the Tracking ID interpolated.
3. Wraps each provider content block in its own `try`/`catch` and concatenates
   the wrapped blocks in registry order (stable, predictable order), so a
   JavaScript error in one provider loader cannot prevent later providers from
   initializing.
4. Returns the concatenated JavaScript body. If no providers are enabled,
   returns `''` (empty string), and the layout renders no analytics script tag.

**Caching**:

```ts
const getCachedActiveAnalyticsScriptContent = unstable_cache(
  async () => {
    const rows = await db.query.analyticsProviderSettings.findMany();
    return buildActiveScriptContent(rows);
  },
  ['active-analytics-script-content'],
  { revalidate: 300, tags: [SITE_SHELL_CACHE_TAG] },
);

export async function getActiveAnalyticsScriptContent(): Promise<string> {
  if (shouldUseDataCache()) return getCachedActiveAnalyticsScriptContent();
  const rows = await db.query.analyticsProviderSettings.findMany();
  return buildActiveScriptContent(rows);
}
```

The `buildActiveScriptContent` helper is shared between the cached and uncached
paths (so tests see the same logic as production).

---

## Provider Registry

**File**: `apps/web/src/server/services/analytics.ts` (NEW)

The registry is a closed array of provider definitions. Adding a new provider
requires one registry entry, one shared Zod enum value, one PostgreSQL enum
value generated through `pnpm db:generate`, and no page-code changes.

```ts
type AnalyticsProviderDefinition = {
  provider: AnalyticsProvider;
  labelKey: string;          // i18n key, e.g. 'admin.analytics.providers.baidu_tongji.label'
  descriptionKey: string;    // i18n key
  trackingIdLabelKey: string; // i18n key for the field label
  trackingIdFormatKey: string; // i18n key for the format hint
  trackingIdPattern: RegExp;  // validation regex
  buildScriptContent: (trackingId: string) => string; // returns JavaScript loader content
};

const REGISTERED_ANALYTICS_PROVIDERS: AnalyticsProviderDefinition[] = [
  {
    provider: 'baidu_tongji',
    labelKey: 'admin.analytics.providers.baidu_tongji.label',
    descriptionKey: 'admin.analytics.providers.baidu_tongji.description',
    trackingIdLabelKey: 'admin.analytics.providers.baidu_tongji.trackingId.label',
    trackingIdFormatKey: 'admin.analytics.providers.baidu_tongji.trackingId.format',
    trackingIdPattern: /^[a-f0-9]{32}$/i,
    buildScriptContent: (trackingId) => `
  var _hmt = _hmt || [];
  (function() {
    var hm = document.createElement("script");
    hm.src = "https://hm.baidu.com/hm.js?${trackingId}";
    var s = document.getElementsByTagName("script")[0];
    s.parentNode.insertBefore(hm, s);
  })();`,
  },
  {
    provider: 'google_analytics',
    labelKey: 'admin.analytics.providers.google_analytics.label',
    descriptionKey: 'admin.analytics.providers.google_analytics.description',
    trackingIdLabelKey: 'admin.analytics.providers.google_analytics.trackingId.label',
    trackingIdFormatKey: 'admin.analytics.providers.google_analytics.trackingId.format',
    trackingIdPattern: /^G-[A-Z0-9]{6,12}$/,
    buildScriptContent: (trackingId) => `
  (function() {
    var gtagScript = document.createElement("script");
    gtagScript.async = true;
    gtagScript.src = "https://www.googletagmanager.com/gtag/js?id=${trackingId}";
    var s = document.getElementsByTagName("script")[0];
    s.parentNode.insertBefore(gtagScript, s);
  })();
  window.dataLayer = window.dataLayer || [];
  function gtag(){dataLayer.push(arguments);}
  gtag('js', new Date());
  gtag('config', '${trackingId}');`,
  },
];
```

**Why this shape?**
- `labelKey`/`descriptionKey`/`trackingIdFormatKey` are i18n keys, so the
  admin UI and admin-only GET endpoint can return localized labels without the
  service knowing about locales. The service resolves the keys via
  `getDictionary(locale)` at the API boundary.
- `trackingIdPattern` is the regex used by the service to validate the
  Tracking ID before saving (when `enabled = true`) and before building the
  script (defensive - the saved value should already be valid).
- `buildScriptContent(trackingId)` returns JavaScript loader content with the
  Tracking ID interpolated. The function assumes the Tracking ID has already
  been validated against `trackingIdPattern`; the regexes are designed to
  reject any character that could break out of the script content or string
  literals (no quotes, angle brackets, backslashes, or whitespace).

---

## Validation Rules

| Provider | Pattern | Format hint (en) | Notes |
|---|---|---|---|
| `baidu_tongji` | `/^[a-f0-9]{32}$/i` | "32-character hex string" | Baidu's standard site ID format. |
| `google_analytics` | `/^G-[A-Z0-9]{6,12}$/` | "G-XXXXXXXX (e.g. G-A1B2C3D4E5)" | Google Analytics 4 Measurement ID. |

**When validation runs**:
- On `PUT /api/settings/analytics`: for each provider with `enabled = true`,
  the `trackingId` MUST be non-empty and match the pattern. Otherwise the
  request is rejected with `400 BAD_REQUEST` and a message describing the
  expected format. The previously active configuration is preserved.
- On `buildScriptContent(trackingId)`: defensive re-validation. If a saved
  Tracking ID somehow fails the regex (e.g. the regex was tightened in a
  later version), the provider is skipped and an error is logged. The other
  providers' scripts are still delivered.

---

## Cache Interaction

| Operation | Cache effect |
|---|---|
| `getActiveAnalyticsScriptContent()` (read) | Served from `unstable_cache` tagged `SITE_SHELL_CACHE_TAG`, 300s revalidate. Bypassed in tests/E2E via `shouldUseDataCache()`. |
| `updateAnalyticsProvider(ctx, provider, input)` (mutation) | After DB upsert, calls `invalidateSiteShellCache()` -> `revalidateTag(SITE_SHELL_CACHE_TAG, 'max')`. Next request sees the updated script set. |
| `upsertAnalyticsProviders(ctx, providers[])` (bulk mutation) | Same - calls `invalidateSiteShellCache()` once after all rows are upserted. |

The cache invalidation matches the existing `site-settings` and
`system-theme` services exactly. There is no separate analytics-specific
cache tag; the site-shell tag is the correct granularity because the
analytics script is part of the layout `<head>`, which is revalidated as a
unit.

---

## Public Content Delivery Compatibility

The injected `<script>` is part of the static/ISR document body:

- It does NOT vary by session, cookie, or request header.
- It does NOT trigger a DB query on cache hit (the `unstable_cache` wrapper
  serves the cached string).
- It is identical for every visitor to a given page.
- When admin configuration changes, `invalidateSiteShellCache()` revalidates
  the affected public pages so the next request serves the updated
  representation (with or without the provider's script as appropriate).

This satisfies constitutional mandate P12 ("Public Reading Is Static by
Default") and the spec's FR-014/FR-015/FR-016.

---

## Security Considerations

- **Tracking IDs are public**: they appear in the page source of every
  visitor. They are NOT encrypted at rest (see [data-model.md](../data-model.md)).
- **No `eval` or unbounded dynamic script construction**: the
  `buildScriptContent` function uses template-string interpolation of a
  regex-validated Tracking ID into fixed provider loader code. The regexes
  reject any character that could break out of the script content or the
  `hm.src`/`gtag` string.
- **No remote script loading from untrusted sources**: the only remote
  scripts loaded are from `hm.baidu.com` and
  `googletagmanager.com` - the official vendor CDN hosts. These are
  hardcoded in the `buildScriptContent` function, not configurable.
- **Provider script failure isolation**: each provider's loader content is
  emitted as an independent `try`/`catch` block inside the framework-owned
  analytics script. A failure in one loader block, or a failure loading one
  remote vendor file (for example `hm.js`), does not block the other provider's
  loader block from executing.
- **Content Security Policy**: if a CSP is configured in a future feature,
  the `script-src` and the `hm.baidu.com`/`googletagmanager.com` hosts will
  need to be allowlisted. Out of scope for v1 (no CSP is currently
  configured).

---

## Testing Strategy

- **Unit tests** (`src/server/services/analytics.test.ts`):
  - `buildScriptContent` for each provider returns the expected JavaScript
    loader content with the Tracking ID interpolated.
  - `trackingIdPattern` rejects empty strings, strings with special
    characters, and out-of-format values.
  - `buildActiveScriptContent` skips disabled providers and providers with no
    Tracking ID.
  - `buildActiveScriptContent` skips providers whose saved Tracking ID fails the
    regex (defensive) and logs an error.
  - `buildActiveScriptContent` returns `''` when no providers are enabled.
  - `updateAnalyticsProvider` rejects enabling with an invalid Tracking ID.
  - `updateAnalyticsProvider` allows saving a Tracking ID for a disabled
    provider.
  - `updateAnalyticsProvider` calls `invalidateSiteShellCache` after the
    DB write.

- **Integration tests** (`src/server/services/analytics.integration.test.ts`):
  - Full round-trip: upsert providers, read back via
    `getActiveAnalyticsScriptContent`,
    assert the rendered string contains the expected loader URLs/content.
  - Cache invalidation: mutate, then assert the next read returns the new
    value (with `shouldUseDataCache()` bypassed in test mode).

- **E2E tests** (Playwright):
  - Admin page: navigate to `/admin/analytics`, enter a Tracking ID, enable,
    save, see success message.
  - Script injection: with Baidu Tongji enabled, open `/` (public home),
    `/editor/...`, `/admin/analytics` (admin), and `/auth/...` (auth) and
    assert the Baidu `hm.js` loader URL is present in the page source.
  - Disabling: toggle Baidu off, refresh, assert the script is absent on
    all surfaces.
  - Permission: as a non-admin user, navigate to `/admin/analytics` and
    assert 404 (the existing pattern for admin-only pages).
