# REST API Contract: Content Storage & Images

**Feature**: 003-content-storage-backends
**Date**: 2026-06-19

All routes follow the existing conventions: REST + JSON, Zod-validated bodies,
shared schemas in `packages/shared`, permission via `can()`, and the
`withApiAudit` wrapper for key-authenticated calls. Routes that mutate during a
migration return `423 STORAGE_MIGRATING`.

---

## Images

### `POST /api/assets`

Upload an image. Auth: signed-in editor/admin, or API key with `edit`/`create`
scope ∩ role. Body: `multipart/form-data` with a single `file` field.

- **Validates**: mime allowlist + size (FR-003).
- **Behavior**: computes sha256, dedups by `content_hash`, writes bytes to the
  active store, returns the asset.
- **200**: `{ id: string, url: "/api/assets/{id}", contentType, sizeBytes }`
- **400** `INVALID_IMAGE`: bad type/size (localized message).
- **401/403**: unauthenticated / insufficient permission.
- **423** `STORAGE_MIGRATING`: a migration is in progress (read-only window).

### `GET /api/assets/{id}`

Serve image bytes. Auth: `read` permission on a page that references the asset
(FR-005); the uploader may read an as-yet-unreferenced asset they just created.

- **200**: image bytes with `Content-Type` from the asset; cacheable per the
  app's existing static-asset policy (private; honors page permission).
- **404**: asset missing, soft-deleted, or caller lacks read (no existence leak).
- **502** (rendered as placeholder by the client): active backend unreachable
  (Edge Cases) — logged.

---

## Storage backend configuration (admin)

All routes require `manage_storage` (admin role; API key needs `storage` scope ∩
admin role).

### `GET /api/storage`

Return the active primary backend, all configured backends, and git-export state.
Secrets are never included; each backend reports `hasSecret: boolean`.

- **200**: `{ active: BackendView, backends: BackendView[], gitExport: GitExportView | null, migration: MigrationView | null }`

### `PUT /api/storage`

Create or update a backend's configuration (non-secret `config` + optional
`secret`). Does not activate it.

- Body: `{ type, purpose, config, secret? }` (Zod per-type).
- **200**: `BackendView` (with `hasSecret`).
- **400** `INVALID_CONFIG`: failed per-type validation.

### `POST /api/storage/test`

Validate config and run `healthCheck()` for a backend (FR-015). Does not change
state.

- Body: `{ type, config, secret? }` or `{ backendId }`.
- **200**: `{ ok: boolean, detail?: string }`.

### `PUT /api/storage/git-export`

Enable/disable and configure the one-way Git export target (D5).

- Body: `{ enabled: boolean, config?: { remoteUrl, branch, assetsDir? }, secret?: token }`.
- **200**: `GitExportView`.

---

## Migration (admin)

All routes require `manage_storage`.

### `POST /api/storage/migrations`

Start a backend switch. Returns immediately with the migration id (P6).

- Body: `{ targetBackendId: string, confirmOverwrite?: boolean }`.
- **202**: `{ id, status: "pending" }`.
- **409** `MIGRATION_IN_PROGRESS`: another migration is active (FR-020).
- **409** `TARGET_NOT_EMPTY`: target has data and `confirmOverwrite` not set.
- **400** `INVALID_TARGET`: target unconfigured/unhealthy/same as active.

### `GET /api/storage/migrations`

List recent migrations (paginated). **200**: `{ items: MigrationView[] }`.

### `GET /api/storage/migrations/{id}`

Poll progress for the admin UI. **200**: `MigrationView`
(`{ id, status, totalItems, copiedItems, verifiedItems, errorMessage, startedAt, finishedAt }`).

### `POST /api/storage/migrations/{id}/abort`

Abort a running migration; the original backend stays active, all data retained
(FR-018). **200**: `MigrationView` (`status: "aborted"`).

---

## Preferences (scope wiring)

### `PATCH /api/user/preferences` (MODIFIED)

Existing route; now also accepts API-key auth with the `preferences` scope and is
checked via `manage_preferences` (self). Behavior otherwise unchanged from 002.

- Auth: signed-in user (self) or API key with `preferences` scope ∩ role.
- **403**: key without `preferences` scope (FR-023/FR-024).

---

## Mutation routes affected by the read-only window

These existing routes add a `STORAGE_MIGRATING` (423) guard while a migration is
active (FR-019): `POST /api/pages`, `PUT /api/edit/{...path}` (new draft),
`POST /api/revisions/publish`, `POST /api/assets`. Reads are never blocked.

---

## OpenAPI

New routes declare `next-openapi-gen` metadata and reuse the shared Zod schemas so
they appear automatically in `/api-docs` (002 mechanism). The new `storage` and
`preferences` scopes are documented in the security scheme alongside existing
scopes (FR-026).
