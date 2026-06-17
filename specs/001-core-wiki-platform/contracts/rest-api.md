# REST + OpenAPI Contract (API)

**Feature**: `001-core-wiki-platform`
**Mandate**: Constitution P8 + `docs/architecture/mandates.md` § API Architecture.

The frontend and any external clients communicate with the service layer over
**REST + JSON**. All request/response bodies are validated with shared Zod
schemas (`packages/shared`). Every endpoint constructs a permission context and
delegates to a service, which enforces `can(actor, action, resource)` before any
data leaves (P4/D3).

MCP and non-JSON transports are **deferred** for this slice (spec A11).

## Base URL

All routes are mounted under `/api` and served by Next.js App Router route
handlers.

```text
https://{host}/api/...
```

## Authentication

Session-based HTTP-only cookie (`next-wiki-session`). The session cookie is sent
automatically by the browser on every request. Mutations that change auth state
set or clear the cookie in the response.

## Common response shapes

### Success

HTTP 200/201 with JSON body. Each endpoint defines its response schema below.

### Errors

All errors return a JSON body with `code` and `message`:

```json
{
  "code": "UNAUTHORIZED | FORBIDDEN | NOT_FOUND | BAD_REQUEST | CONFLICT",
  "message": "human-readable description"
}
```

- `400 Bad Request` — validation failure or malformed input.
- `401 Unauthorized` — not signed in (or session expired).
- `403 Forbidden` — signed in but not allowed.
- `404 Not Found` — resource missing or not visible to caller (no metadata leak).
- `409 Conflict` — business conflict such as duplicate slug.
- `500 Internal Server Error` — unexpected server error (opaque message in prod).

## Endpoints

### Auth

#### `POST /api/auth/register`

Create a new account (role = `reader`) and establish a session.

| Field | Type | Notes |
|---|---|---|
| `email` | string | valid email |
| `password` | string | min 8 characters |

**Response 201**:

```json
{ "userId": "uuid" }
```

#### `POST /api/auth/login`

Establish a session for an existing user.

| Field | Type | Notes |
|---|---|---|
| `email` | string | |
| `password` | string | |

**Response 200**:

```json
{ "userId": "uuid", "mustResetPassword": false }
```

#### `POST /api/auth/logout`

Destroy the current session and clear the cookie.

**Response 200**:

```json
{ "ok": true }
```

#### `GET /api/auth/me`

Return the currently signed-in user.

**Response 200**:

```json
{ "id": "uuid", "email": "...", "role": "reader|editor|admin", "displayName": "..." }
```

`displayName` may be `null`. Returns 200 with `null` body when anonymous.

#### `POST /api/auth/set-password`

Set a new password for the current user (used after admin reset).

| Field | Type | Notes |
|---|---|---|
| `newPassword` | string | min 8 characters |

**Response 200**:

```json
{ "ok": true }
```

#### `POST /api/auth/setup`

First-run admin bootstrap. Only works when zero admins exist.

| Field | Type | Notes |
|---|---|---|
| `email` | string | |
| `password` | string | min 8 characters |

**Response 201**:

```json
{ "userId": "uuid" }
```

---

### Pages

#### `GET /api/pages`

List published pages (honors `anonymous_read`).

**Response 200**:

```json
[
  { "path": "...", "title": "...", "authorDisplayName": "...|null", "publishedAt": "ISO|null", "updatedAt": "ISO" }
]
```

#### `POST /api/pages`

Create a new page and its first draft version.

| Field | Type | Notes |
|---|---|---|
| `path` | string | optional; lowercase letters, numbers, hyphens, slashes; no leading/trailing/consecutive slashes; unique within space/locale |
| `title` | string | 1-200 chars |
| `contentSource` | string | raw Markdown |

If `path` is omitted the backend may assign a temporary path (the current
implementation still asks for `path` in the create form).

**Response 201**:

```json
{ "pageId": "uuid", "versionId": "uuid" }
```

#### `GET /api/pages/{...path}`

Read the live page (published version, or latest draft for authorized author/editor/admin).

**Response 200**:

```json
{
  "path": "...",
  "title": "...",
  "contentHtml": "...",
  "contentHash": "...",
  "version": 1,
  "publishedAt": "ISO|null",
  "authorDisplayName": "...|null",
  "status": "draft|published"
}
```

Returns 404 for invisible drafts.

#### `GET/POST /api/edit/{...path}`

Load the latest revision source for editing (`GET`) or create a new draft
revision (`POST`). The editor route only updates title and content; it does not
change the page `path`.

**Response 200 (GET)**:

```json
{
  "path": "...",
  "title": "...",
  "contentSource": "...",
  "latestVersion": 1,
  "status": "draft|published",
  "canPublish": true|false
}
```

**POST body**:

| Field | Type | Notes |
|---|---|---|
| `title` | string | 1-200 chars |
| `contentSource` | string | raw Markdown |

**Response 201 (POST)**:

```json
{ "versionId": "uuid", "versionNumber": 2 }
```

Returns 404 for callers without `edit` permission.

#### `GET /api/history/{...path}`

List versions of a page.

**Response 200**:

```json
[
  {
    "version": 1,
    "status": "draft|published",
    "authorDisplayName": "...|null",
    "createdAt": "ISO",
    "contentHash": "...",
    "canPublish": true|false
  }
]
```

#### `GET /api/revisions/{n}/{...path}`

View a specific revision.

**Response 200**:

```json
{
  "version": 1,
  "status": "draft|published",
  "contentHtml": "...",
  "contentSource": "...",
  "authorDisplayName": "...|null",
  "createdAt": "ISO"
}
```

Draft revisions return 404 except for author/admin.

#### `PATCH /api/properties/{...path}`

Update page properties. Currently the only mutable property is the page `path`.

**Request body**:

| Field | Type | Notes |
|---|---|---|
| `path` | string | lowercase letters, numbers, hyphens, slashes; no leading/trailing/consecutive slashes; unique within space/locale |

**Response 200**:

```json
{ "path": "..." }
```

Changing the path does not create a redirect from the old path; bookmarks to
the old path will 404 until a redirect feature is added.

---

### Revisions

#### `POST /api/revisions/publish`

Publish a specific version.

| Field | Type | Notes |
|---|---|---|
| `path` | string | page path |
| `version` | number | version number to publish |

**Response 200**:

```json
{ "versionId": "uuid" }
```

Permission: author of the draft or admin.

---

### Users (admin)

#### `GET /api/users`

List registered users.

**Response 200**:

```json
[
  { "id": "uuid", "email": "...", "role": "...", "status": "...", "displayName": "...|null", "createdAt": "ISO" }
]
```

#### `POST /api/users/{id}/role`

Change a user's role.

| Field | Type | Notes |
|---|---|---|
| `role` | string | `admin|editor|reader` |

**Response 200**:

```json
{ "ok": true }
```

#### `POST /api/users/{id}/status`

Enable or disable a user.

| Field | Type | Notes |
|---|---|---|
| `status` | string | `active|disabled` |

**Response 200**:

```json
{ "ok": true }
```

#### `POST /api/users/{id}/reset-password`

Reset a user's password and force a change on next login.

| Field | Type | Notes |
|---|---|---|
| `tempPassword` | string | min 8 characters |

**Response 200**:

```json
{ "ok": true }
```

## Shared types

All request/response schemas live in `packages/shared` and are reused by route
handlers and the OpenAPI document:

- `PageSummary`
- `LivePage`
- `EditableView`
- `RevisionSummary`
- `RevisionView`
- `UserView`

## OpenAPI document

The OpenAPI 3.1 document is built from the same Zod schemas and route metadata
in `apps/web/src/server/api/openapi.ts`. It is served at `/api/openapi.json`
for external consumers and IDE tooling.
