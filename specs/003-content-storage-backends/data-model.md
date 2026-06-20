# Data Model: Pluggable Content Storage & In-Editor Images

## 2026-06-20 Replica Model Revision

The following model supersedes the single-active-primary constraint:

- `storage_backends` gains lifecycle state
  (`disabled|backfilling|enabled|degraded|deleting`), `is_read_preferred`,
  synchronization timestamps, and last-error fields. Database is seeded as
  enabled and cannot be disabled. At most one enabled non-Database backend is
  read-preferred.
- The partial unique index enforcing one active primary is removed. The legacy
  `is_active` column remains temporarily for migration compatibility only.
- `page_revisions.content_source` is authoritative and non-null for all newly
  created revisions.
- `content_blobs` contains every live asset, regardless of enabled replicas.
- `storage_replication_tasks` is the transactional outbox/delivery table. Each
  row identifies a backend, object kind, object id, operation, expected hash,
  status, attempt count, retry time, and last error. A uniqueness key makes
  current-object delivery idempotent and coalesces superseded work.
- Backfill creates the same delivery records used by live writes. Therefore a
  backfill and concurrent edits cannot create a synchronization gap.
- Fallback reads enqueue an upsert repair task for the failed preferred replica.

**Feature**: 003-content-storage-backends
**Date**: 2026-06-19
**Phase**: 1 (Design)

All schema changes are applied via idempotent Drizzle migrations that auto-apply
on container restart (consistent with 001/002). Table and column names use
`snake_case`. Nothing here is destructive: existing `page_revisions` data is
preserved.

---

## Enum changes

### `api_key_scope` (MODIFIED — add two values)

```
'view', 'create', 'edit', 'delete', 'share', 'run', 'storage', 'preferences'
```

Postgres enum values can only be appended (`ALTER TYPE ... ADD VALUE`), which is
exactly what is needed — additive, non-breaking. Mirrored in
`packages/shared/src/api-keys.ts` `apiKeyScopeSchema`.

### `storage_backend_type` (NEW)

```
'database', 'local', 's3', 'git'
```

### `storage_backend_purpose` (NEW)

```
'primary', 'git_export'
```

### `content_asset_kind` (NEW)

```
'image'
```

(`markdown` is addressed by `revisionId` directly and needs no row; the enum is
defined extensibly for future asset kinds.)

### `migration_status` (NEW)

```
'pending', 'copying', 'verifying', 'completed', 'failed', 'aborted'
```

---

## New tables

### `storage_backends`

The admin-managed definition of configured backends. Exactly one
`purpose='primary'` row has `is_active=true`; the `git_export` row (if any) toggles
independently.

| Column | Type | Notes |
|---|---|---|
| `id` | uuid PK | `defaultRandom()` |
| `type` | `storage_backend_type` | not null |
| `purpose` | `storage_backend_purpose` | not null, default `'primary'` |
| `is_active` | boolean | not null, default `false` |
| `config` | jsonb | not null, default `{}` — non-secret settings |
| `secret_encrypted` | text | nullable — AES-256-GCM blob (S3 keys / Git token) |
| `created_at` | timestamptz | not null, default now |
| `updated_at` | timestamptz | not null, default now |

Indexes / constraints:
- Partial unique index: at most one active primary —
  `unique (purpose) where is_active = true and purpose = 'primary'`.
- Unique `(type, purpose)` so each backend is configured once.

`config` shapes (validated by Zod in `packages/shared/src/content-storage.ts`):
- `local`: `{ basePath: string }`
- `s3`: `{ endpoint?: string, region: string, bucket: string, prefix?: string, accessKeyId: string }` (secret access key in `secret_encrypted`)
- `git`: `{ remoteUrl: string, branch: string, assetsDir?: string, username?: string }` (token in `secret_encrypted`)
- `database`: `{}`

### `content_assets`

One row per uploaded image. Bytes live in the active backend (DB backend →
`content_blobs`).

| Column | Type | Notes |
|---|---|---|
| `id` | uuid PK | `defaultRandom()` — used in `/api/assets/{id}` |
| `kind` | `content_asset_kind` | not null, default `'image'` |
| `content_hash` | text | not null — sha256 of bytes (integrity + verify) |
| `content_type` | text | not null — mime, e.g. `image/png` |
| `size_bytes` | integer | not null |
| `created_by` | uuid FK → `users.id` | nullable, `on delete set null` — original uploader |
| `created_at` | timestamptz | not null, default now |
| `deleted_at` | timestamptz | nullable — soft delete (orphan cleanup) |

Indexes: index on `content_hash` (integrity/migration verification); index on
`deleted_at`; index on `created_by`.

**Upload ownership & expiration.** `created_by` records the original uploader so the
serving route can let the uploader read an asset that is not yet referenced by any
saved revision (D3 read rule), without leaking it to others. An asset that is
never referenced (`content_asset_refs` empty) is an **abandoned upload**; it
expires after a configurable TTL (default 24h from `created_at`) and is reclaimed
by the orphan cleanup (bytes deleted from the store, row soft-deleted). Once an
asset gains at least one ref it is permanent (subject only to reference-aware
orphan cleanup, R10). User deletion sets `created_by` to null and never deletes
the asset or its revision references. This slice does **not** deduplicate uploads
across users: two uploads with identical bytes receive distinct asset IDs, which
avoids granting access through another user's private-page reference. The hash is
retained for integrity and migration verification.

### `content_asset_refs`

Reference-aware lifecycle: which revisions use which image.

| Column | Type | Notes |
|---|---|---|
| `asset_id` | uuid FK → `content_assets.id` | not null, `on delete cascade` |
| `revision_id` | uuid FK → `page_revisions.id` | not null, `on delete cascade` |

Constraints: PK `(asset_id, revision_id)`; index on `revision_id`. An asset is an
orphan when it has no ref to a revision of a non-deleted page.

### `content_blobs`

Database-backend byte storage for images (markdown for the DB backend stays in
`page_revisions.content_source`).

| Column | Type | Notes |
|---|---|---|
| `asset_id` | uuid PK FK → `content_assets.id` | `on delete cascade` |
| `bytes` | bytea | not null |

Only written/read by `DatabaseStore`. Absent rows for Local/S3-stored images.

### `content_migrations`

Tracks a backend switch (one active at a time).

| Column | Type | Notes |
|---|---|---|
| `id` | uuid PK | `defaultRandom()` |
| `source_backend_id` | uuid FK → `storage_backends.id` | not null |
| `target_backend_id` | uuid FK → `storage_backends.id` | not null |
| `status` | `migration_status` | not null, default `'pending'` |
| `total_items` | integer | not null, default 0 |
| `copied_items` | integer | not null, default 0 |
| `verified_items` | integer | not null, default 0 |
| `error_message` | text | nullable |
| `abort_requested` | boolean | not null, default `false` — cooperative cancel flag |
| `created_by` | uuid FK → `users.id` | not null |
| `created_at` | timestamptz | not null, default now |
| `started_at` | timestamptz | nullable |
| `finished_at` | timestamptz | nullable |

Indexes: partial unique to enforce single-flight —
`unique (status) where status in ('pending','copying','verifying')` is not directly
expressible per-value; instead use a partial unique index on a constant expression
guarded in the service, plus an index on `status`. The single-flight guard is
enforced in `migration.ts` inside a transaction (`SELECT ... FOR UPDATE`) as the
authoritative check.

**Cooperative abort.** The abort endpoint only sets `abort_requested = true`; it
never mutates `status` directly. The worker reads `abort_requested` at defined
checkpoints — before each copied item, before the verify phase, and immediately
before cutover — and, if set, transitions to `aborted` and stops. Cutover is a
**conditional transaction**:
`UPDATE storage_backends SET is_active=... ; UPDATE content_migrations SET
status='completed' WHERE id=$1 AND status='verifying' AND abort_requested=false`.
If the guarded `UPDATE` affects zero rows (an abort landed during verification),
the worker rolls back, leaves the original backend active, and records `aborted`.
This closes the abort-vs-cutover race (review P1 #3, FR-018).

State machine: `pending → copying → verifying → completed`; any step → `failed`;
admin abort → `aborted`. Only `completed` flips `storage_backends.is_active`.

---

## Modified tables

### `page_revisions` (MODIFIED)

- `content_source`: `text` **becomes nullable**. The DB backend continues to
  populate it; Local/S3 backends leave it null and store markdown externally.
  `content_html` and `content_hash` are unchanged (stay in DB — derived +
  fingerprint). No data migration required for existing rows.

---

## Entity relationships

```text
storage_backends (1 active primary) ──┐
                                       ├── content_migrations (source/target)
storage_backends (0..1 git_export) ───┘

page_revisions 1───* content_asset_refs *───1 content_assets 1───0..1 content_blobs
       │                                              (image bytes for DB backend)
       └── content_source (nullable; DB backend markdown bytes)
```

- A revision's **markdown** = `content_source` (DB backend) or external file keyed
  by `revision_id` (Local/S3). Fingerprint = `page_revisions.content_hash`.
- An **image** = `content_assets` row; bytes in `content_blobs` (DB) or external
  object keyed by `asset_id` (Local/S3). Referenced by revisions via
  `content_asset_refs`; referenced in Markdown as `/api/assets/{asset_id}`.

---

## Validation rules (Zod, `packages/shared/src/content-storage.ts`)

- **Image upload**: `content_type` ∈ allowlist (`image/png`, `image/jpeg`,
  `image/gif`, `image/webp`); `size_bytes` ≤ configurable max (default e.g.
  10 MB). The declared mime MUST match the bytes (magic-number sniff) to prevent
  type confusion. **SVG is excluded** from the allowlist for this slice — an SVG
  served same-origin can execute active content on direct navigation; safe SVG
  support requires sanitization + origin isolation and is deferred (see
  research R12 / plan D3). Violations → 400 with localized message (FR-003).
- **Backend config**: per-type schema (above); required fields enforced; secret
  fields write-only (never serialized back). Activation requires a passing
  `healthCheck()` (FR-015). URL fields reject embedded credentials. Local/S3
  operations are confined to the configured base directory/prefix and cleanup
  cannot escape that managed namespace (FR-015a).
- **Migration start**: `target_backend_id` must reference a configured,
  health-checked primary backend distinct from the active one; single-flight; if
  target non-empty, `confirmOverwrite=true` required (FR-020).

---

## Permission model additions (`src/server/permissions/index.ts`)

- **Actions** (added): `manage_storage`, `manage_preferences`.
- **Resources** (added): `{ kind: 'storage' }`, `{ kind: 'preferences' }`.
- **`scopeToActions`** (added): `storage → ['manage_storage']`,
  `preferences → ['manage_preferences']`.
- **`roleAllows`** (added): `manage_storage` → `admin` only;
  `manage_preferences` → any authenticated role (`admin|editor|reader`), self only.
- API-key actors additionally require the matching scope (scope ∩ role, FR-024);
  `manage_storage` via a non-admin key is denied by role.
