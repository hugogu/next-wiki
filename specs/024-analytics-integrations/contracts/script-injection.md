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

**Mechanism**: `dangerouslySetInnerHTML` with a string sourced from the new
`getActiveAnalyticsScripts()` service function. This is the same mechanism
already used by the root layout for the system-theme CSS and the
`themeScript` inline script.

```tsx
<head>
  <style id="app-system-theme" dangerouslySetInnerHTML={{ __html: systemCss }} />
  <style id="app-reading-theme" dangerouslySetInnerHTML={{ __html: readingThemeCss }} />
  <script dangerouslySetInnerHTML={{ __html: themeScript }} />
  {/* NEW: analytics scripts for all enabled providers */}
  <script dangerouslySetInnerHTML={{ __html: analyticsScripts }} />
</head>
```

The `analyticsScripts` variable is sourced at the top of the
`RootLayout` function:

```tsx
const analyticsScripts = await getActiveAnalyticsScripts();
```

**Why a single `<script>` tag (not one per provider)?** The service returns a
single concatenated string containing all enabled providers' snippets. This
keeps the layout simple (one `dangerouslySetInnerHTML` call) and lets the
service control the rendering order. The string is plain HTML containing
multiple `<script>` tags if multiple providers are enabled - this is valid
HTML inside a `<head>`.

---

## Service Contract: `getActiveAnalyticsScripts()`

**File**: `apps/web/src/server/services/analytics.ts` (NEW)

**Signature**:

```ts
export async function getActiveAnalyticsScripts(): Promise<string>
```

**Behavior**:
1. Reads the `analytics_provider_settings` table (cached via `unstable_cache`
   tagged `SITE_SHELL_CACHE_TAG`, 300s revalidate, gated by
   `shouldUseDataCache()` - exactly mirroring `getActiveThemeCss()`).
2. For each row with `enabled = true` and a non-null `trackingId` that passes
   the provider's regex:
   - Looks up the provider definition in `REGISTERED_ANALYTICS_PROVIDERS`.
   - Calls `definition.buildScript(trackingId)` to get the canonical vendor
     snippet with the Tracking ID interpolated.
3. Concatenates all snippets in registry order (stable, predictable order).
4. Returns the concatenated string. If no providers are enabled, returns `''`
   (empty string) - the layout renders an empty `<script>` tag, which is a
   no-op. (Alternatively, the layout can conditionally render the tag; either
   is acceptable, but the empty-string approach matches the existing
   `readingThemeCss` pattern.)

**Caching**:

```ts
const getCachedActiveAnalyticsScripts = unstable_cache(
  async () => {
    const rows = await db.query.analyticsProviderSettings.findMany();
    return buildActiveScript(rows);
  },
  ['active-analytics-scripts'],
  { revalidate: 300, tags: [SITE_SHELL_CACHE_TAG] },
);

export async function getActiveAnalyticsScripts(): Promise<string> {
  if (shouldUseDataCache()) return getCachedActiveAnalyticsScripts();
  const rows = await db.query.analyticsProviderSettings.findMany();
  return buildActiveScript(rows);
}
```

The `buildActiveScript` helper is shared between the cached and uncached
paths (so tests see the same logic as production).

---

## Provider Registry

**File**: `apps/web/src/server/services/analytics.ts` (NEW)

The registry is a closed array of provider definitions. Adding a new provider
is a single registry entry + enum value + Zod enum value (no page code
changes).

```ts
type AnalyticsProviderDefinition = {
  provider: AnalyticsProvider;
  labelKey: string;          // i18n key, e.g. 'admin.analytics.providers.baidu_tongji.label'
  descriptionKey: string;    // i18n key
  trackingIdLabelKey: string; // i18n key for the field label
  trackingIdFormatKey: string; // i18n key for the format hint
  trackingIdPattern: RegExp;  // validation regex
  buildScript: (trackingId: string) => string; // returns the canonical vendor snippet
};

const REGISTERED_ANALYTICS_PROVIDERS: AnalyticsProviderDefinition[] = [
  {
    provider: 'baidu_tongji',
    labelKey: 'admin.analytics.providers.baidu_tongji.label',
    descriptionKey: 'admin.analytics.providers.baidu_tongji.description',
    trackingIdLabelKey: 'admin.analytics.providers.baidu_tongji.trackingId.label',
    trackingIdFormatKey: 'admin.analytics.providers.baidu_tongji.trackingId.format',
    trackingIdPattern: /^[a-f0-9]{32}$/i,
    buildScript: (trackingId) => `
<script>
  var _hmt = _hmt || [];
  (function() {
    var hm = document.createElement("script");
    hm.src = "https://hm.baidu.com/hm.js?${trackingId}";
    var s = document.getElementsByTagName("script")[0];
    s.parentNode.insertBefore(hm, s);
  })();
</script>`,
  },
  {
    provider: 'google_analytics',
    labelKey: 'admin.analytics.providers.google_analytics.label',
    descriptionKey: 'admin.analytics.providers.google_analytics.description',
    trackingIdLabelKey: 'admin.analytics.providers.google_analytics.trackingId.label',
    trackingIdFormatKey: 'admin.analytics.providers.google_analytics.trackingId.format',
    trackingIdPattern: /^G-[A-Z0-9]{6,12}$/,
    buildScript: (trackingId) => `
<script async src="https://www.googletagmanager.com/gtag/js?id=${trackingId}"></script>
<script>
  window.dataLayer = window.dataLayer || [];
  function gtag(){dataLayer.push(arguments);}
  gtag('js', new Date());
  gtag('config', '${trackingId}');
</script>`,
  },
];
```

**Why this shape?**
- `labelKey`/`descriptionKey`/`trackingIdFormatKey` are i18n keys, so the
  admin UI and the public GET endpoint can return localized labels without
  the service knowing about locales. The service resolves the keys via
  `getDictionary(locale)` at the API boundary.
- `trackingIdPattern` is the regex used by the service to validate the
  Tracking ID before saving (when `enabled = true`) and before building the
  script (defensive - the saved value should already be valid).
- `buildScript(trackingId)` returns the canonical vendor snippet with the
  Tracking ID interpolated. The function assumes the Tracking ID has already
  been validated against `trackingIdPattern`; the regexes are designed to
  reject any character that could break out of the script tag (no quotes,
  angle brackets, backslashes, or whitespace).

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
- On `buildScript(trackingId)`: defensive re-validation. If a saved
  Tracking ID somehow fails the regex (e.g. the regex was tightened in a
  later version), the provider is skipped and an error is logged. The other
  providers' scripts are still delivered.

---

## Cache Interaction

| Operation | Cache effect |
|---|---|
| `getActiveAnalyticsScripts()` (read) | Served from `unstable_cache` tagged `SITE_SHELL_CACHE_TAG`, 300s revalidate. Bypassed in tests/E2E via `shouldUseDataCache()`. |
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
- **No `eval` or dynamic script construction**: the `buildScript` function
  uses template-string interpolation of a regex-validated Tracking ID. The
  regexes reject any character that could break out of the script tag or
  the `hm.src`/`gtag` string.
- **No remote script loading from untrusted sources**: the only remote
  scripts loaded are from `hm.baidu.com` and
  `googletagmanager.com` - the official vendor CDN hosts. These are
  hardcoded in the `buildScript` function, not configurable.
- **Provider script failure isolation**: each provider's snippet is wrapped
  in its own `<script>` tag (or in Baidu's case, an IIFE). A failure in one
  provider's script (e.g. network error loading `hm.js`) does not block the
  other provider's script from executing, because the browser parses
  `<script>` tags independently.
- **Content Security Policy**: if a CSP is configured in a future feature,
  the `script-src` and the `hm.baidu.com`/`googletagmanager.com` hosts will
  need to be allowlisted. Out of scope for v1 (no CSP is currently
  configured).

---

## Testing Strategy

- **Unit tests** (`src/server/services/analytics.test.ts`):
  - `buildScript` for each provider returns the expected snippet with the
    Tracking ID interpolated.
  - `trackingIdPattern` rejects empty strings, strings with special
    characters, and out-of-format values.
  - `buildActiveScript` skips disabled providers and providers with no
    Tracking ID.
  - `buildActiveScript` skips providers whose saved Tracking ID fails the
    regex (defensive) and logs an error.
  - `buildActiveScript` returns `''` when no providers are enabled.
  - `updateAnalyticsProvider` rejects enabling with an invalid Tracking ID.
  - `updateAnalyticsProvider` allows saving a Tracking ID for a disabled
    provider.
  - `updateAnalyticsProvider` calls `invalidateSiteShellCache` after the
    DB write.

- **Integration tests** (`src/server/services/analytics.integration.test.ts`):
  - Full round-trip: upsert providers, read back via `getActiveAnalyticsScripts`,
    assert the rendered string contains the expected snippets.
  - Cache invalidation: mutate, then assert the next read returns the new
    value (with `shouldUseDataCache()` bypassed in test mode).

- **E2E tests** (Playwright):
  - Admin page: navigate to `/admin/analytics`, enter a Tracking ID, enable,
    save, see success message.
  - Script injection: with Baidu Tongji enabled, open `/` (public home),
    `/editor/...`, `/admin/analytics` (admin), and `/auth/...` (auth) and
    assert the Baidu `hm.js` script tag is present in the page source.
  - Disabling: toggle Baidu off, refresh, assert the script is absent on
    all surfaces.
  - Permission: as a non-admin user, navigate to `/admin/analytics` and
    assert 404 (the existing pattern for admin-only pages).
