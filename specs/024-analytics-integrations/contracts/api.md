# API Contract: Web Analytics Integrations

**Feature**: 024-analytics-integrations
**Date**: 2026-07-21

This document describes the REST API surface introduced by the feature.
Endpoints follow the existing `/api/settings/*` convention (see
`api/settings/site/route.ts`, `api/settings/content-data-sources/route.ts`).
OpenAPI annotations use the JSDoc `@openapi` style consumed by
`next-openapi-gen`; after route changes, run
`pnpm --filter @next-wiki/web openapi:generate`.

---

## Shared Zod Schemas

**File**: `packages/shared/src/analytics.ts` (NEW)
**Re-exported from**: `packages/shared/src/index.ts`

```ts
import { z } from 'zod';

export const analyticsProviderSchema = z.enum([
  'baidu_tongji',
  'google_analytics',
]);
export type AnalyticsProvider = z.infer<typeof analyticsProviderSchema>;

export const analyticsProviderItemSchema = z.object({
  provider: analyticsProviderSchema,
  label: z.string(),            // localized at the service layer
  description: z.string(),      // localized at the service layer
  enabled: z.boolean(),
  trackingId: z.string().nullable(),
  trackingIdFormat: z.string(), // human-readable format hint, localized
  updatedAt: z.string().nullable(),
});
export type AnalyticsProviderItem = z.infer<typeof analyticsProviderItemSchema>;

export const analyticsSettingsViewSchema = z.object({
  providers: z.array(analyticsProviderItemSchema),
  activeScript: z.string(),    // the rendered <script> HTML for all enabled providers
});
export type AnalyticsSettingsView = z.infer<typeof analyticsSettingsViewSchema>;

export const updateAnalyticsProviderInputSchema = z.object({
  provider: analyticsProviderSchema,
  enabled: z.boolean(),
  trackingId: z.string().trim().max(200).nullable(),
});
export type UpdateAnalyticsProviderInput = z.infer<typeof updateAnalyticsProviderInputSchema>;

export const updateAnalyticsSettingsInputSchema = z.object({
  providers: z.array(updateAnalyticsProviderInputSchema).min(1),
});
export type UpdateAnalyticsSettingsInput = z.infer<typeof updateAnalyticsSettingsInputSchema>;
```

The `trackingId` max length (200) is a generous upper bound; the per-provider
regex validation (see [script-injection.md](./script-injection.md)) is the
real authority.

---

## Endpoints

### `GET /api/settings/analytics`

**Public**. Returns the full list of registered analytics providers with their
enabled state, Tracking ID, and the rendered `<script>` HTML for all enabled
providers. The Tracking IDs are intentionally public - they appear in the page
source of every visitor anyway.

**Auth**: None (public).

**OpenAPI annotations**:

```yaml
@openapi
@summary List analytics providers
@description Returns all registered analytics providers with their configuration and the active script HTML.
@tag Analytics
@response 200 application/json { $ref: analyticsSettingsViewSchema }
```

**Response body** (`AnalyticsSettingsView`):

```json
{
  "providers": [
    {
      "provider": "baidu_tongji",
      "label": "Baidu Tongji (百度统计)",
      "description": "Baidu's web analytics service.",
      "enabled": true,
      "trackingId": "abcdef0123456789abcdef0123456789",
      "trackingIdFormat": "32-character hex string",
      "updatedAt": "2026-07-21T10:00:00.000Z"
    },
    {
      "provider": "google_analytics",
      "label": "Google Analytics",
      "description": "Google's web analytics service (GA4).",
      "enabled": false,
      "trackingId": null,
      "trackingIdFormat": "G-XXXXXXXX (e.g. G-A1B2C3D4E5)",
      "updatedAt": null
    }
  ],
  "activeScript": "<script>var _hmt=...;</script>"
}
```

**Errors**:
- `500` - Internal server error (returned via `internalError()`).

---

### `PUT /api/settings/analytics`

**Admin-only**. Replaces the configuration for one or more analytics providers.
Each provider in the request body is upserted independently; providers not
mentioned in the body are left unchanged. The request is atomic per-provider
(each provider's update succeeds or fails independently), but not
transactional across providers (matching the `content-data-sources` pattern).

**Auth**: `@auth bearer` (session cookie). API keys are denied by the
`manage_appearance` hard-deny rule.

**Permission**: `manage_appearance` + `{ kind: 'appearance' }`.

**OpenAPI annotations**:

```yaml
@openapi
@summary Update analytics providers
@description Upserts one or more analytics provider configurations. Each provider is updated independently.
@tag Analytics
@auth bearer
@body application/json { $ref: updateAnalyticsSettingsInputSchema }
@response 200 application/json { $ref: analyticsSettingsViewSchema }
@response 400 application/json { error: BAD_REQUEST, message: string }
@response 401 application/json { error: UNAUTHORIZED, message: string }
@response 403 application/json { error: FORBIDDEN, message: string }
```

**Request body** (`UpdateAnalyticsSettingsInput`):

```json
{
  "providers": [
    {
      "provider": "baidu_tongji",
      "enabled": true,
      "trackingId": "abcdef0123456789abcdef0123456789"
    },
    {
      "provider": "google_analytics",
      "enabled": false,
      "trackingId": "G-A1B2C3D4E5"
    }
  ]
}
```

**Validation rules** (enforced at the service layer):

- `providers` MUST be a non-empty array.
- Each `provider` MUST be one of the registered providers (Zod enum).
- Each `trackingId` MAY be `null` or empty (for disabled providers).
- A provider with `enabled: true` MUST have a non-empty `trackingId` that
  matches the provider's regex pattern. Violation: `400 BAD_REQUEST` with a
  message describing the expected format. The previously active configuration
  is preserved.
- A provider with `enabled: false` MAY have any (or no) `trackingId`; the
  value is retained for later re-enablement.

**Response body**: the updated `AnalyticsSettingsView` (same shape as `GET`).

**Side effects**:
- `invalidateSiteShellCache()` is called after the DB write, so the next
  request to any page sees the updated script set.

---

## Error Shapes

All errors use the existing `DomainError` -> `mapDomainError` mapping (see
`api/settings/site/route.ts`):

```json
{
  "error": "BAD_REQUEST",
  "message": "Tracking ID for baidu_tongji must be a 32-character hex string."
}
```

| HTTP | Error code | When |
|---|---|---|
| 400 | `BAD_REQUEST` | Invalid request body (Zod parse failure), or service-layer validation rejection (empty/invalid Tracking ID for an enabled provider). |
| 401 | `UNAUTHORIZED` | No session. |
| 403 | `FORBIDDEN` | Session is not an admin (role !== 'admin'), or actor is an API key. |
| 500 | `INTERNAL_ERROR` | Unexpected failure. |

---

## Non-Goals (out of scope for v1)

- No per-provider `PATCH /api/settings/analytics/[provider]` endpoint. The
  single `PUT` accepts the full provider list. This can be added later if the
  provider count grows.
- No `DELETE` endpoint. Disabling a provider (setting `enabled: false`) is the
  supported way to "turn off" a provider; the row is retained so the Tracking
  ID survives.
- No server-side event forwarding (e.g. Measurement Protocol). The feature
  only injects the vendor's client-side snippet.
- No API-key scope for analytics. Configuration is admin-only via session.
