# Phase 1 Data Model: Page Attachments

## Entities

### `content_assets` (existing table, extended)

No column changes. `kind` (existing `text`, default `'image'`) gains a new
value `'attachment'`. All other columns (`id`, `content_hash`,
`content_type`, `size_bytes`, `created_by`, `created_at`, `deleted_at`) are
reused unchanged — an attachment's blob metadata row looks identical in
shape to an image's, distinguished only by `kind`.

| Field | Type | Notes |
|---|---|---|
| `kind` | text | `'image'` \| `'attachment'` (was image-only) |
| `content_type` | text | Sniffed/declared MIME (e.g. `application/pdf`, `video/mp4`) |
| `size_bytes` | integer | Exact byte length of the canonical stored bytes |
| `content_hash` | text | sha256 over canonical bytes; enables cross-page dedup of identical files |

### `content_blobs` (existing table, unchanged)

Reused as-is (`asset_id` PK/FK → `content_assets.id`, `bytes` bytea). No
attachment-specific change.

### `page_attachments` (new table)

The page-level association between a page and an attached asset. Not
revision-scoped (see research.md §2) — represents "currently attached to
this page," independent of any specific content revision.

| Field | Type | Notes |
|---|---|---|
| `id` | uuid, PK | Attachment-link identity (distinct from `asset_id`, since the same asset could in principle be attached more than once) |
| `page_id` | uuid, FK → `pages.id`, `onDelete: cascade` | The page this file is attached to |
| `asset_id` | uuid, FK → `content_assets.id`, `onDelete: restrict` | The underlying blob (kind = `'attachment'`) |
| `file_name` | text, not null | Validated single display filename supplied at upload time (not deduplicated — two rows may share a name, see spec Edge Cases) |
| `uploaded_by` | uuid, FK → `users.id`, `onDelete: set null` | Attacher; null if the user is later deleted |
| `created_at` | timestamptz, not null, default now() | Attach time |
| `removed_at` | timestamptz, nullable | Soft-delete marker; null = currently attached |
| `removed_by` | uuid, FK → `users.id`, `onDelete: set null` | Remover; set together with `removed_at` |

Indexes:
- `page_attachments_page_idx` on `(page_id)` filtered `where removed_at is null` — the hot "list current attachments for a page" query.
- `page_attachments_asset_idx` on `(asset_id)` — used by `canReadAttachment`/`getServableAttachment` and by any future asset-usage/cleanup tooling.

**Validation rules**:
- `file_name` MUST be a non-empty, single display filename: control characters,
  path separators, and path traversal are rejected; its rendered and
  `Content-Disposition` representations are safely encoded. This is UI/route-
  level Zod and service validation, not a DB constraint, matching the existing
  convention (`content_assets` has no CHECK on similar fields; validation lives
  in Zod schemas + service code).
- A row is "currently attached" iff `removed_at IS NULL`; removal is a soft-delete (sets `removed_at`/`removed_by`), consistent with constitution P8's general "soft delete by default" convention even though this table is not a `page_revisions` row.
- `asset_id` uses `onDelete: restrict` (not `cascade`, unlike `content_asset_refs`): an attachment's blob is never implicitly deleted by removing the link row; blob lifecycle (garbage collection of unreferenced assets) is a separate, existing concern (mirrors how `content_assets` rows already outlive individual `content_asset_refs` rows for images).

**State transitions**: `attached` (row exists, `removed_at IS NULL`) →
`removed` (row exists, `removed_at IS NOT NULL`). No other states. There is
no "replace" transition (spec Clarification: replace = remove + attach as
two independent rows/operations).

### `attachment_settings` (new singleton table)

Wiki-wide admin configuration, following the exact `site_settings`/
`system_theme_settings` singleton pattern (`id` fixed to `'default'`).

| Field | Type | Notes |
|---|---|---|
| `id` | text, PK, default `'default'` | Singleton row key |
| `max_size_bytes` | integer, not null, default `104857600` (100 MB) | FR-008/FR-010 |
| `allowed_categories` | text[] (or jsonb array), not null, default `['image','video','document']` | FR-009/FR-010; each element ∈ `{'image','video','document'}` |
| `updated_by` | uuid, FK → `users.id`, `onDelete: set null` | Last admin to change it |
| `updated_at` | timestamptz, not null, default now() | |

**Validation rules**: `max_size_bytes > 0`; `allowed_categories` non-empty
array of the three known category literals (Zod-enforced at the settings
route, not a DB CHECK, matching the project's existing settings-table
convention). Changing this row never retroactively affects existing
`content_assets`/`page_attachments` rows (FR-012/SC-005) — it is read only
at upload time.

### `api_key_scope` (existing Postgres enum, extended)

New value `attachments` added via `pnpm db:generate` (Drizzle-generated
migration; `ALTER TYPE api_key_scope ADD VALUE 'attachments'`). Used
exclusively to gate the new `attach_file` permission action for `api_key`
actors (research.md §3) — never implied by `create`/`edit`/any other
existing scope.

## Relationships

```text
pages (1) ──< (N) page_attachments >── (1) content_assets (kind='attachment') ── (1) content_blobs
                                                        │
                                                        └──< (N) storage_replication_tasks (existing, generic)

api_keys (N) ── scopes: api_key_scope[] (now includes 'attachments')

attachment_settings (singleton) ── read at upload-validation time only
```

- A `page_attachments` row always has exactly one `content_assets` row
  (`kind = 'attachment'`); a `content_assets` row may be referenced by zero,
  one, or more `page_attachments` rows (content-hash dedup makes
  cross-attachment blob reuse possible, exactly as it already is for
  images).
- `page_attachments` is intentionally **not** linked to `page_revisions` —
  no `revision_id` column — reflecting the P8 interpretation in plan.md
  (attachment metadata is not versioned page content).

## Cache / Public Content Delivery impact

Per spec's "Public Content Delivery" section and constitution P12: the
attachment list for a page is fetched via an uncached, permission-checked
API call (`GET /api/v1/pages/{pageId}/attachments`), never embedded in the
page's static/ISR HTML body. Attaching or removing a file therefore does
**not** require invalidating the page's ISR path or public-data tag — only
the (already-dynamic) attachment list/download requests are affected, which
carry their own permission check on every request exactly like the existing
`GET /api/v1/assets/{id}/content` image-serving route already does.
