# Data Model: Content Import and Export

## Enums

### `transfer_source_type`

- `wikijs`

The source registry is intentionally bounded. Archive uploads are artifacts, not
reusable remote sources.

### `transfer_run_kind`

- `site_export`
- `archive_preview`
- `archive_import`
- `wikijs_source_test`
- `wikijs_preview`
- `wikijs_import`

### `transfer_run_status`

- `queued`
- `running`
- `completed`
- `completed_with_warnings`
- `failed`
- `cancelled`

### `transfer_run_phase`

- `queued`
- `discovering`
- `validating`
- `planning`
- `downloading`
- `writing_assets`
- `writing_pages`
- `finalizing`
- `completed`

### `transfer_item_kind`

- `page`
- `asset`
- `archive_entry`

### `transfer_item_action`

- `create`
- `replace`
- `skip`
- `convert`
- `validate`

### `transfer_item_status`

- `pending`
- `running`
- `completed`
- `warning`
- `failed`
- `cancelled`

### `transfer_artifact_kind`

- `source_archive`
- `export_archive`
- `run_report`

### `transfer_artifact_status`

- `uploading`
- `ready`
- `expired`
- `deleted`
- `failed`

## `transfer_sources`

Reusable external source configuration.

| Field | Type | Rules |
|------|------|-------|
| `id` | UUID | Primary key |
| `type` | enum | `wikijs` in v1 |
| `name` | text | 1–100 characters, unique |
| `base_url` | text | Normalized HTTP(S) origin; no credentials, query, or fragment |
| `allow_private_network` | boolean | Default false; explicit admin trust decision |
| `credentials_encrypted` | text | Required; encrypted API token JSON |
| `status` | text | `unverified`, `healthy`, `unavailable`, `disabled` |
| `last_checked_at` | timestamptz nullable | Last source-test completion |
| `last_error_code` | text nullable | Sanitized code only |
| `created_by` | UUID nullable FK users | `set null` |
| `updated_by` | UUID nullable FK users | `set null` |
| `created_at` | timestamptz | Default now |
| `updated_at` | timestamptz | Default now |

Indexes: unique name; `(type, status)`.

Credentials never appear in list/detail views. Views expose
`hasCredentials: true|false`.

## `transfer_runs`

Durable operation and preview record.

| Field | Type | Rules |
|------|------|-------|
| `id` | UUID | Primary key |
| `kind` | enum | See run kinds |
| `status` | enum | Default `queued` |
| `phase` | enum | Default `queued` |
| `actor_user_id` | UUID nullable FK users | Initiating admin; `set null` |
| `source_id` | UUID nullable FK transfer_sources | Required for Wiki.js kinds; `set null` after source deletion |
| `source_artifact_id` | UUID nullable FK transfer_artifacts | Required for archive preview/import |
| `preview_run_id` | UUID nullable self-FK | Required for import kinds; preserves confirmed plan |
| `active_mutation_slot` | boolean nullable | `true` only for active import; partial unique index where true |
| `options` | JSONB | Conflict strategy, locale/path options, safety limits snapshot |
| `source_fingerprint` | text nullable | Archive hash or Wiki.js discovery fingerprint |
| `total_items` | integer | Non-negative |
| `processed_items` | integer | Non-negative, <= total |
| `created_items` | integer | Non-negative |
| `replaced_items` | integer | Non-negative |
| `skipped_items` | integer | Non-negative |
| `converted_items` | integer | Non-negative |
| `warning_items` | integer | Non-negative |
| `failed_items` | integer | Non-negative |
| `current_item` | text nullable | Sanitized display label |
| `cancel_requested` | boolean | Default false |
| `error_code` | text nullable | Sanitized stable code |
| `error_message` | text nullable | <= 500 characters |
| `error_detail` | text nullable | Admin-only bounded diagnostic |
| `report_artifact_id` | UUID nullable FK transfer_artifacts | Final report |
| `queued_at` | timestamptz | Default now |
| `started_at` | timestamptz nullable | |
| `finished_at` | timestamptz nullable | |
| `expires_at` | timestamptz | Run visibility/cleanup policy if later applied |

Indexes:

- `(status, queued_at)`
- `(kind, queued_at)`
- `(source_id, queued_at)`
- partial unique `active_mutation_slot = true`

Validation:

- Wiki.js test/preview/import requires `source_id`.
- Archive preview/import requires `source_artifact_id`.
- Import requires a completed preview whose fingerprint and conflict options
  match.
- Terminal status requires `finished_at`; terminal status clears
  `active_mutation_slot`.

## `transfer_items`

Per-page, per-asset, or validation entry outcome.

| Field | Type | Rules |
|------|------|-------|
| `id` | UUID | Primary key |
| `run_id` | UUID FK transfer_runs | Cascade delete |
| `kind` | enum | page, asset, archive entry |
| `source_key` | text | Stable within run/source |
| `source_fingerprint` | text nullable | Content hash or metadata hash |
| `display_name` | text | Sanitized page path/asset label |
| `target_key` | text nullable | Target canonical `(locale/path)`, asset id, or archive path |
| `action` | enum | Planned/effective action |
| `status` | enum | Default `pending` |
| `bytes_total` | bigint nullable | |
| `bytes_processed` | bigint | Default 0 |
| `warning_code` | text nullable | |
| `warning_message` | text nullable | |
| `error_code` | text nullable | |
| `error_message` | text nullable | <= 500 characters |
| `metadata` | JSONB | Conversion/source/reference details, no credentials |
| `attempts` | integer | Default 0 |
| `available_at` | timestamptz | Retry scheduling |
| `started_at` | timestamptz nullable | |
| `finished_at` | timestamptz nullable | |
| `created_at` | timestamptz | Default now |
| `updated_at` | timestamptz | Default now |

Constraints/indexes:

- unique `(run_id, kind, source_key)`
- `(run_id, status, available_at)`
- `(run_id, action)`

Preview items are immutable after import confirmation. The import run copies or
references the preview plan and records execution outcomes separately.

## `transfer_artifacts`

Metadata for uploaded/generated ZIPs and reports.

| Field | Type | Rules |
|------|------|-------|
| `id` | UUID | Primary key and opaque filename |
| `kind` | enum | source archive, export archive, report |
| `status` | enum | Default `uploading` |
| `created_by` | UUID nullable FK users | `set null` |
| `run_id` | UUID nullable FK transfer_runs | Owning run; no cascade while run retained |
| `original_filename` | text nullable | Display only, sanitized |
| `storage_key` | text | Server-generated relative key only |
| `content_type` | text | ZIP or JSON |
| `size_bytes` | bigint | Finalized size |
| `content_hash` | text nullable | SHA-256 |
| `error_message` | text nullable | |
| `expires_at` | timestamptz | Required |
| `created_at` | timestamptz | Default now |
| `ready_at` | timestamptz nullable | |
| `deleted_at` | timestamptz nullable | |

Indexes: `(status, expires_at)`, `(run_id)`, `(content_hash)`.

The file path is always derived from `id` and kind; clients never provide it.

## `transfer_page_mappings`

Idempotency and link-rewrite mapping.

| Field | Type | Rules |
|------|------|-------|
| `source_type` | text | `archive` or `wikijs` |
| `source_identity` | text | Archive source instance or source configuration identity |
| `source_page_key` | text | Manifest page id or Wiki.js page id |
| `source_fingerprint` | text | Imported content fingerprint |
| `target_page_id` | UUID FK pages | Cascade on target delete |
| `target_path` | text | Canonical path at import time |
| `target_locale` | text | Canonical locale |
| `last_run_id` | UUID FK transfer_runs | |
| `created_at` | timestamptz | |
| `updated_at` | timestamptz | |

Primary key: `(source_type, source_identity, source_page_key)`.
Index: `(target_page_id)`.

## `transfer_asset_mappings`

Remote/archive asset deduplication and rewrite mapping.

| Field | Type | Rules |
|------|------|-------|
| `source_type` | text | `archive` or `wikijs` |
| `source_identity` | text | |
| `source_asset_key` | text | Archive id or normalized URL |
| `source_fingerprint` | text nullable | Declared/downloaded SHA-256 |
| `target_asset_id` | UUID FK content_assets | Cascade on target delete |
| `last_run_id` | UUID FK transfer_runs | |
| `created_at` | timestamptz | |
| `updated_at` | timestamptz | |

Primary key: `(source_type, source_identity, source_asset_key)`.
Index: `(source_fingerprint)`, `(target_asset_id)`.

## State Transitions

### Transfer run

```text
queued
  -> running
      -> completed
      -> completed_with_warnings
      -> failed
      -> cancelled
  -> cancelled
```

Phase advances monotonically for a run kind. A failed retry creates a new run
linked to the prior run; it does not reset historical outcomes.

### Transfer item

```text
pending -> running -> completed
                   -> warning
                   -> failed
pending/running -> cancelled
failed -> pending only in a new retry run
```

### Artifact

```text
uploading -> ready -> expired -> deleted
         -> failed -> deleted
ready -> deleted
```

## Deletion and Retention

- Deleting a source removes credentials/configuration but retains historical run
  rows with `source_id = null` and sanitized source metadata in run options.
- Deleting an artifact removes bytes and marks metadata deleted. Active runs or
  unexpired previews that depend on it block deletion.
- Run/item/mapping records remain after artifact expiry for audit and
  idempotency.
- Transfer cleanup must tolerate a missing file and converge metadata to
  `deleted`.
