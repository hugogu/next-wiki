# Data Model: AI Page Translation

## Existing records reused

- `pages` holds original/translated identity, path, locale, published revision, and soft-delete state.
- `page_revisions` holds immutable Markdown, rendered/sanitized HTML, hash, metadata, assets, publication state, and version number for both original and translated documents.
- `ai_models` and `ai_providers` supply the selected text-generation runtime.

## Enums

| Enum | Values |
|---|---|
| `translation_run_kind` | `initial`, `resume`, `replacement`, `refresh` |
| `translation_run_status` | `queued`, `running`, `paused`, `completed`, `completed_with_warnings`, `failed`, `cancelled` |
| `translation_item_status` | `pending`, `running`, `completed`, `skipped`, `failed`, `cancelled`, `superseded` |
| `translation_freshness_status` | `fresh`, `stale`, `queued`, `running`, `failed`, `unavailable` |
| `translation_usage_source` | `provider_reported`, `estimated`, `unavailable` |

## Translation groups and pages

`translation_groups` has `id`, unique `source_page_id` FK, `created_at`, and `updated_at`.

Add nullable `translation_group_id` and `source_page_id` FKs to `pages`. Both are null for a source page; both are required for a translation, and `source_page_id` equals the group's source. Keep unique `(space_id, path, locale)` and add partial unique `(translation_group_id, locale)` for translated pages. A translation shares its source space/path. Resolution always begins from the source path, then group/locale; it never starts from a locale match alone.

## `translation_languages`

Administrator-managed target language configuration: normalized lowercase `code` primary key, enabled/retired state, optional default prompt-version and model references, creator/updater, and timestamps. A disabled or retired language cannot start new work and its language-prefixed reader URLs resolve as unavailable. Existing runs preserve frozen inputs after this configuration changes.

## Prompt records

`translation_prompt_templates` contains id, unique name, retirement time, creator, and timestamps. `translation_prompt_versions` contains id, template id, increasing version number, bounded instruction body, content hash, creator, and timestamp. A version is immutable; template changes create a new version.

## `translation_runs`

Durable work for exactly one target language.

| Area | Fields / rules |
|---|---|
| Identity | id, target locale, kind, optional predecessor/trigger run |
| Frozen inputs | provider/model IDs and name/external-id snapshots, prompt version, source-selection snapshot |
| Control | status, pause/cancel flags, `active_language_slot` |
| Progress | total, processed, completed, skipped, failed, superseded, current label |
| Analytics | input/output/cached tokens with provenance and total duration milliseconds |
| Audit | actor, bounded sanitized error fields, queued/started/finished timestamps |

Indexes include target-locale/time, status/time, actor/time, model/time, and a partial unique active-language slot to prevent conflicting target-language work.

## `translation_run_items`

One durable item per source page/run, unique on `(run_id, source_page_id)`.

| Area | Fields / rules |
|---|---|
| Source snapshot | source page/revision IDs and immutable content hash |
| Target | nullable translation page/revision IDs until success and locale/path display snapshot |
| Lifecycle | status, attempt count, retry availability, started/finished timestamps |
| Provenance | frozen provider/model/prompt input references |
| Usage | input/output/cached tokens and individual provenance, provider request id, duration |
| Diagnostics | bounded sanitized errors/warnings; no source body, credential, or raw provider response |

Items transition `pending -> running -> completed|skipped|failed|superseded`. Pause leaves unfinished items pending; cancellation marks unstarted work cancelled. Retry/replacement creates a successor run rather than changing history.

## `translation_revision_provenance`

One immutable row per generated translated `page_revisions` row. It holds source revision, run/item, provider/model/prompt version IDs plus immutable name/hash snapshots, provider request id, output hash, usage/provenance, duration, and generation time.

## `page_translation_states`

One reader/admin freshness projection per translated page: source/group IDs, target locale, freshness status, latest source revision/hash, translated source revision/hash, current translated revision, latest run/item, and bounded latest failure information. It is updated with source invalidation and successful output; provenance and ordinary page revisions remain historical truth.

## Write and freshness rules

1. Atomically claim a pending item, increment attempts, and record `running`.
2. Check authorization, stream with the run's frozen model/prompt, and validate generated Markdown.
3. Render via the normal pipeline; write/reuse target page, a normal published revision, metadata/assets/replication, provenance, state, item, and counters transactionally.
4. Immediately recheck source current revision/hash. Mismatch means `superseded`, never current output.
5. Source publication marks linked states stale and coalesces latest-refresh work. Publishing a translated page never triggers a loop.
