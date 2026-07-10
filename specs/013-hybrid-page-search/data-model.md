# Data Model: Hybrid Page Search

**Phase 1 output** | **Date**: 2026-07-10

## Existing entities reused unchanged

| Entity | Purpose in this feature |
|---|---|
| `pages` | Canonical page identity, path, title, visibility state, and selected-page reference. |
| `page_revisions` | Raw source for keyword excerpts and the source revision backing vector chunks. |
| `ai_actions` and `ai_action_events` | Existing asynchronous semantic query lifecycle and completed vector candidates. |
| `ai_knowledge_chunks` / active index generation | Existing derived pgvector projection used only when semantic search is available. |
| `users`, `sessions`, and permission context | Optional actor attribution and page-read authorization. |
| `api_audit_entries` | Remains transport auditing only; it is not extended to carry raw search query data. |

## New enum

### `search_behavior_action`

| Value | Meaning |
|---|---|
| `result_open` | The user activated a visible result to open its page. |
| `escape` | The user pressed Escape while Header search mode was active. |

The enum is additive and introduced through the generated migration.

## New table: `search_records`

One row represents one processed, qualified query attempt. Its client-created ID is also the idempotency key for retrying the hybrid POST.

| Field | Type / rules | Notes |
|---|---|---|
| `id` | UUID primary key, supplied by client | One new UUID for every distinct two-or-more-character input attempt; retries reuse it. |
| `space_id` | UUID, required FK to `spaces` | Preserves space boundary for future analytics. |
| `actor_user_id` | UUID, nullable FK to `users`, `ON DELETE SET NULL` | Set for authenticated actors; absent for anonymous readers. |
| `session_id` | UUID, required | Fresh browser value for each opened overlay; not a durable browser identity. |
| `query` | text, required, normalized nonblank | Raw query is explicitly required for later analysis; never copied into API audit. |
| `keyword_result_count` | integer, required, nonnegative | Count after visibility filtering. |
| `semantic_result_count` | integer, required, nonnegative, default `0` | Updated when semantic retrieval completes. |
| `result_count` | integer, required, nonnegative | Current count in the merged response. |
| `semantic_state` | text/enum, required | `pending`, `ready`, `unavailable`, `failed`, or `skipped`; never exposes provider internals. |
| `semantic_action_id` | UUID, nullable correlation key to `ai_actions` | Associates a signed-in eligible search with the existing async action. The current Drizzle migration does not enforce this as a database FK because `ai_actions` is declared later in the schema module. |
| `created_at` | timestamp with time zone, required default now | Query acceptance time. |
| `updated_at` | timestamp with time zone, required default now | Last merged-result/semantic-state update. |

Indexes:

- `(session_id, created_at)` for journey analysis;
- `(actor_user_id, created_at)` for owner-scoped analysis;
- `(space_id, created_at)` for future space summaries;
- `(created_at)` for retention/aggregation jobs;
- unique primary key `id` for idempotent query retries.

## New table: `search_behaviors`

One row represents one explicit post-search decision. Its client event ID makes duplicate keydown, click, and `keepalive` retries harmless.

| Field | Type / rules | Notes |
|---|---|---|
| `id` | UUID primary key, supplied by client | Event idempotency key. |
| `search_record_id` | UUID, required FK to `search_records`, `ON DELETE CASCADE` | Required link to the exact visible-query attempt. |
| `actor_user_id` | UUID, nullable FK to `users`, `ON DELETE SET NULL` | Copied from the accepted request after ownership checks. |
| `action` | `search_behavior_action`, required | `result_open` or `escape`. |
| `page_id` | UUID, nullable FK to `pages`, `ON DELETE SET NULL` | Required for `result_open`; null for `escape`. |
| `created_at` | timestamp with time zone, required default now | Explicit user-action time. |

Validation and indexes:

- database check: `result_open` requires `page_id`; `escape` requires it to be null;
- `(search_record_id, created_at)` supports per-query outcome analysis;
- `(actor_user_id, created_at)`, `(action, created_at)`, and `(page_id, created_at)` support filtered analysis;
- primary key `id` makes a repeated event insert a no-op.

## Relationships and state

```text
spaces 1 ── * search_records
users  0..1 ── * search_records
search_records 1 ── * search_behaviors
users  0..1 ── * search_behaviors
pages  0..1 ── * search_behaviors (only result_open)
ai_actions 0..1 ── * search_records (semantic_action_id correlation key)
```

`search_records.semantic_state` transitions are:

```text
pending ──> ready
pending ──> failed
pending ──> unavailable
skipped/unavailable ──> unavailable
```

`result_open` and `escape` are terminal analytics events for one explicit UI action, but the database permits multiple different events for a record only if the UI can genuinely produce them. Header logic prevents this feature from emitting more than one terminal behavior per open search session.

## Privacy and retention boundary

The feature records only the query, aggregate counts, availability state, page ID for an intentional selection, timestamps, and optional actor/session references. It does not persist excerpts, complete result lists, raw page content, IP address, user agent, referrer, keystroke timing, pointer movement, or impression events. Retention, export, and analytics UI are outside this feature.
