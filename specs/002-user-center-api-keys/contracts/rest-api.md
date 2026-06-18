# REST API Contract: User Center & API Keys

**Feature**: `002-user-center-api-keys`
**Mandate**: Constitution P8 + `docs/architecture/mandates.md` § API Architecture.

This document describes **new and modified** REST endpoints. All existing
endpoints from 001 remain unchanged in behavior but gain API-key auth support
transparently (via `createApiContext()`).

All new request/response bodies are validated with shared Zod schemas
(`packages/shared`). All new routes enforce permissions through `can()`.

## Authentication

### Session (existing, unchanged)

HTTP-only cookie (`next-wiki-session`). Sent automatically by the browser.

### API Key (new)

```http
Authorization: Bearer nwk_<random-token>
```

The Bearer header is checked by `resolveActor()` before the session cookie. If
a Bearer token is present and valid, the request is authenticated as the key's
owner with the key's scopes intersected with the owner's role (FR-013). If the
Bearer token is present but invalid/expired, the request is treated as
anonymous (not session-authenticated) — the session cookie is NOT checked as a
fallback. This ensures API key auth failures are logged as API key failures,
not silently falling through to session.

## Common response shapes

Same as 001: success returns 200/201 with JSON; errors return `{ code, message }`.

New error code for this slice:

- `403 SCOPE_DENIED` — the API key's scopes do not include the required scope
  (distinct from `FORBIDDEN` which means the role denies the action). This
  helps API consumers distinguish "your key lacks this scope" from "your account
  lacks this permission".

---

## New Endpoints

### User Profile & Preferences

#### `PATCH /api/user/profile`

Update the signed-in user's display name (nickname).

**Auth**: session or API key. API key requires `edit` scope (self-management is
an edit operation). Actually — self-profile management is a user-center action,
not a content action. Profile management via API key is NOT supported in this
slice (keys are for wiki content access, not account management). Session only.

| Field | Type | Notes |
|---|---|---|
| `displayName` | string \| null | 1–100 chars, or null to clear |

**Response 200**:
```json
{ "id": "uuid", "email": "...", "displayName": "...|null" }
```

---

#### `PATCH /api/user/email`

Change the signed-in user's email. Immediate (no verification, no
current-password re-auth — clarification Q3). Session only.

| Field | Type | Notes |
|---|---|---|
| `email` | string | valid email, unique |

**Response 200**:
```json
{ "id": "uuid", "email": "new@example.com" }
```

**Errors**: `409 CONFLICT` if email is already registered by another account.

---

#### `POST /api/user/password`

Change the signed-in user's password. Requires current password. Session only.

| Field | Type | Notes |
|---|---|---|
| `currentPassword` | string | must match |
| `newPassword` | string | min 8 characters |

**Response 200**:
```json
{ "ok": true }
```

**Errors**: `401 UNAUTHORIZED` if current password is incorrect.

---

#### `PATCH /api/user/preferences`

Update display preferences (theme, language). Session only.

| Field | Type | Notes |
|---|---|---|
| `theme` | string \| null | `'light' \| 'dark' \| 'auto'`, or null to clear |
| `locale` | string \| null | `'en' \| 'zh'`, or null to clear |

Both fields are optional; omitting a field leaves it unchanged.

**Response 200**:
```json
{ "theme": "dark", "locale": "zh" }
```

---

### API Keys

#### `GET /api/api-keys`

List the signed-in user's API keys (active and revoked). Session only.

**Response 200**:
```json
[
  {
    "id": "uuid",
    "name": "my-bot",
    "scopes": ["view"],
    "keyPrefix": "nwk_aB3xY9zK",
    "createdAt": "ISO",
    "revokedAt": "ISO|null",
    "lastUsedAt": "ISO|null"
  }
]
```

The full key secret is NOT returned in the list. Use the reveal endpoint.

---

#### `POST /api/api-keys`

Create a new API key. Session only.

| Field | Type | Notes |
|---|---|---|
| `name` | string | 1–100 chars |
| `scopes` | string[] | non-empty; each ∈ `view, create, edit, delete, share, run` |

**Response 201**:
```json
{
  "id": "uuid",
  "name": "my-bot",
  "scopes": ["view"],
  "keyPrefix": "nwk_aB3xY9zK",
  "keySecret": "nwk_aB3xY9zK...full-key-value",
  "createdAt": "ISO"
}
```

The full `keySecret` is returned **only at creation time** and via the reveal
endpoint. It is encrypted at rest (FR-009, FR-010).

**Errors**:
- `400 BAD_REQUEST` — invalid name or scopes.
- `409 CONFLICT` — per-user key maximum exceeded (FR-015).

---

#### `GET /api/api-keys/:id/reveal`

Reveal the full key secret for a specific key. Session only.

**Response 200**:
```json
{
  "id": "uuid",
  "keySecret": "nwk_aB3xY9zK...full-key-value"
}
```

**Errors**: `404 NOT_FOUND` if the key doesn't exist or doesn't belong to the
user.

---

#### `DELETE /api/api-keys/:id`

Revoke (soft-delete) an API key. Session only.

**Response 204**: No body.

Sets `revoked_at = now()`. Subsequent API calls with this key return 401.

**Errors**: `404 NOT_FOUND` if the key doesn't exist or doesn't belong to the
user.

---

### Audit Log

#### `GET /api/audit`

List the signed-in user's own API audit entries. Session only.

**Query parameters**:
| Param | Type | Notes |
|---|---|---|
| `keyId` | string | filter by key id (optional) |
| `status` | string | `'success' \| 'error'` (optional) |
| `page` | number | default 1 |
| `pageSize` | number | default 20, max 100 |

**Response 200**:
```json
{
  "entries": [
    {
      "id": "uuid",
      "keyId": "uuid|null",
      "keyName": "my-bot|null",
      "method": "GET",
      "path": "/api/pages",
      "statusCode": 200,
      "durationMs": 12,
      "authStatus": "authenticated",
      "errorMessage": null,
      "createdAt": "ISO"
    }
  ],
  "total": 42,
  "page": 1,
  "pageSize": 20
}
```

---

#### `GET /api/audit/all`

List all API audit entries across all users. Admin only.

**Query parameters**:
| Param | Type | Notes |
|---|---|---|
| `userId` | string | filter by user (optional) |
| `keyId` | string | filter by key (optional) |
| `status` | string | `'success' \| 'error'` (optional) |
| `method` | string | filter by HTTP method (optional) |
| `path` | string | filter by path prefix (optional) |
| `startTime` | string | ISO timestamp (optional) |
| `endTime` | string | ISO timestamp (optional) |
| `page` | number | default 1 |
| `pageSize` | number | default 20, max 100 |

**Response 200**:
```json
{
  "entries": [
    {
      "id": "uuid",
      "keyId": "uuid|null",
      "keyName": "my-bot|null",
      "userId": "uuid|null",
      "userEmail": "user@example.com|null",
      "method": "GET",
      "path": "/api/pages",
      "statusCode": 200,
      "durationMs": 12,
      "authStatus": "authenticated",
      "errorMessage": null,
      "createdAt": "ISO"
    }
  ],
  "total": 42,
  "page": 1,
  "pageSize": 20
}
```

**Errors**: `404 NOT_FOUND` for non-admins (no leak per FR-023).

---

### OpenAPI Documentation

#### `GET /api/openapi.json`

Serve the auto-generated OpenAPI 3.1 specification (public, no auth required).

**Response 200**: OpenAPI 3.1 JSON document.

---

#### `GET /api-docs`

Interactive API documentation page (public, no auth required). Renders the
OpenAPI spec with an interactive viewer (Scalar or Swagger UI). Allows inline
execution of read endpoints (FR-019).

This is a page route (`page.tsx`), not an API route. It renders an HTML page
with the interactive docs viewer.

---

## Modified Endpoints (auth extension)

All existing `/api/**` endpoints (except `/api/auth/**` and `/api/preview`)
now accept `Authorization: Bearer <key>` in addition to the session cookie.
The auth resolution flow (plan D1):

1. Bearer header present → resolve API key → authenticate as key owner with
   scopes.
2. No Bearer header → fall back to session cookie (existing behavior).
3. Neither → anonymous.

When a Bearer token is present but invalid, the request is NOT authenticated
(via session or anonymous). A 401 is returned and the attempt is logged in the
audit trail (FR-021).

**Audit logging**: All existing `/api/**` routes (except auth/preview) are
wrapped with `withApiAudit()`. When a Bearer header is present (valid or
invalid), an audit entry is recorded after the response is sent. Session-only
requests are NOT audited (they are UI interactions, not API calls).

---

## Shared Types (new)

All new Zod schemas live in `packages/shared/src/`:

- `apiKeyScopeSchema` — enum of valid scopes
- `createApiKeyInputSchema` — `{ name, scopes }`
- `apiKeyViewSchema` — key list item (without secret)
- `apiKeyCreatedSchema` — key with secret (creation response only)
- `apiKeyRevealSchema` — `{ id, keySecret }`
- `updateProfileInputSchema` — `{ displayName }`
- `changeEmailInputSchema` — `{ email }`
- `changePasswordInputSchema` — `{ currentPassword, newPassword }`
- `updatePreferencesInputSchema` — `{ theme?, locale? }`
- `auditEntrySchema` — audit log entry
- `auditListResponseSchema` — paginated audit response
- `auditQueryParamsSchema` — query parameter validation
