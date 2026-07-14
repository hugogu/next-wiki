# Data Model: Complementary Page Search Engines

**Phase 1 output** | **Date**: 2026-07-14

## Existing entities reused

| Entity | Purpose in this feature |
|---|---|
| `pages` / `page_revisions` | Canonical published identity and raw source. Both lexical adapters query current published revisions; all public results are later projected through visibility rules. |
| `ai_knowledge_chunks` / active index generation | Existing derived `pgvector` projection used only by the semantic capability. |
| `ai_actions` / `ai_action_events` | Existing durable semantic query lifecycle. The semantic engine run may retain its action as an opaque continuation reference. |
| `search_records` | Existing idempotent feature-013 search attempt. Extended with the accepted capability snapshot; it retains legacy semantic summary fields for response compatibility. |
| `search_behaviors` | Existing explicit `result_open` / `escape` outcomes. No result content or engine-native diagnostics are added. |
| `search_settings` | Existing global administrator-managed search settings. Extended with full-text and fuzzy enablement. |
| `users`, `sessions`, and permission context | Ownership, page-read authorization, and settings management authorization. |

## Stable capability and lifecycle values

### `search_capability_id`

| Value | Product role | Initial adapter |
|---|---|---|
| `full_text` | Term-oriented lexical retrieval | PostgreSQL `tsvector` |
| `fuzzy` | Chinese fragment and near-text retrieval | PostgreSQL `pg_trgm` |
| `semantic` | Conceptual retrieval | `pgvector` plus existing AI action |

### `search_engine_run_state`

| Value | Meaning | Publicly safe? |
|---|---|---|
| `ready` | The capability has completed and contributed zero or more readable candidates. | Yes |
| `pending` | Work has been accepted and can be resumed for this owned attempt. | Yes |
| `skipped` | The capability was not in the attempt's accepted snapshot. | Yes |
| `unavailable` | The capability cannot be used without exposing an implementation reason. | Yes |
| `failed` | The capability did not complete; detail stays in server logs. | Yes |
| `timed_out` | The capability exceeded its budget; detail stays in server logs. | Yes |

`timed_out` maps to the pre-existing POST `semanticState: "failed"` when it describes the semantic capability, so existing clients keep their established state vocabulary.

## Changed table: `search_settings`

The singleton row gains capability controls plus a bounded operational budget:

| Column | Meaning |
|---|---|
| `full_text_search_enabled` | Enables the stable `full_text` capability for new search attempts. |
| `fuzzy_search_enabled` | Enables the stable `fuzzy` capability for new search attempts. |
| `immediate_search_timeout_ms` | Per-window PostgreSQL statement budget for immediate lexical retrieval. Default `400`; constrained to `100`–`2,000`. It is an operational setting, not a ranking weight. |

`semantic_search_enabled` remains the setting for `semantic`. A database check and shared-schema validation require `full_text_search_enabled OR fuzzy_search_enabled`; semantic retrieval can never become the sole required way to search a wiki. The capability set is snapshotted per accepted attempt; the timeout applies to the current request so an administrator can immediately protect the database from a slow lexical query.

## Changed table: `search_records`

Add `capability_snapshot` as non-null JSONB. It contains only the stable capability IDs and their enabled Boolean values accepted at creation time, for example:

```json
{
  "full_text": true,
  "fuzzy": true,
  "semantic": true
}
```

The existing `keyword_result_count`, `semantic_result_count`, `result_count`, `semantic_state`, and `semantic_action_id` remain for feature-013 response and analytics compatibility. They are compatibility materializations derived from the engine-run state, not the new source of per-capability truth.

## New table: `search_engine_runs`

One row represents one stable capability for one accepted search record.

| Column | Type / rules | Notes |
|---|---|---|
| `id` | UUID primary key | Server-generated persistence identity. |
| `search_record_id` | UUID, required FK to `search_records`, `ON DELETE CASCADE` | Inherits record ownership and retention. |
| `capability_id` | `search_capability_id`, required | Product-level ID, not a vendor/extension name. |
| `state` | `search_engine_run_state`, required | Starts as `pending` for work that can continue, otherwise reaches a terminal state in the initial request. |
| `result_count` | integer, required, nonnegative, default 0 | Count after permission filtering only. |
| `continuation_ref` | nullable text | Opaque server-only correlation to a resumable action/run. Never returned to clients or logged as a public error. |
| `started_at` | timestamp with time zone, required | Acceptance/start time. |
| `completed_at` | nullable timestamp with time zone | Set for terminal outcomes. |
| `updated_at` | timestamp with time zone, required | Last safe state/count update. |

Constraints and indexes:

- unique `(search_record_id, capability_id)` prevents duplicate retries from creating another run;
- check `result_count >= 0`;
- `(state, updated_at)` supports operational inspection/retention jobs;
- `(search_record_id, updated_at)` serves an owned POST resume;
- no raw candidate list, excerpt, native score, SQL error, provider error, index detail, or page identifier is persisted in this table.

## Relationships and state

```text
search_records 1 ── * search_engine_runs
search_records 1 ── * search_behaviors
search_engine_runs (semantic) 0..1 ──> existing ai_actions via continuation_ref
pages/page_revisions ──> transient SearchCandidate ──> unified response
```

For an accepted query, each enabled capability creates or resumes exactly one run. `full_text` and `fuzzy` normally transition directly to `ready`, `failed`, or `timed_out` in the first request. `semantic` may remain `pending` until its existing action completes, then transitions to `ready`, `unavailable`, `failed`, or `timed_out`. A disabled capability creates no run and is returned as `skipped` from the immutable snapshot.

## Internal, non-persistent contracts

`SearchCandidate` contains `pageId`, optional `revisionId`, engine-local rank, exact-match/field evidence, and an optional raw-source excerpt location. It is never an API response. The coordinator resolves every candidate through the same published/readable resource projection before it is fused or counted.

`SearchEngine` accepts the normalized query, actor permission context, attempt identity, candidate limit, deadline, and continuation input. It returns a stable capability state plus bounded candidates. The contract deliberately has no SQL, vector, provider, or raw-score field.

## Derived indexes and migration boundary

Migration `0007_fast_keyword_search.sql` provides the `simple` `tsvector` expressions and the revision-content `pg_trgm` GIN index used by the lexical adapters. Migration `0013_scoped_trigram_search.sql` additionally installs `btree_gin` and a partial composite GIN index on `(pages.space_id, pages.title)` for non-deleted published pages. This is not a duplicate: it makes the required scope and published predicates indexable together with the fuzzy title predicate. Migration `0014_immediate_search_timeout.sql` adds the administrator-controlled, database-enforced lexical request budget. Existing AI migrations provide `pgvector`.

The PostgreSQL adapters set transaction-local `statement_timeout`; client-side promise races are prohibited because they abandon, rather than cancel, database work. Fuzzy content retrieval uses exact contiguous fragments only when a query contains at least three non-space characters: `pg_trgm` cannot selectively index shorter fragments, and a low-threshold word-similarity scan across long markdown revisions violates the interactive budget. Scoped title retrieval still supplies short-fragment and near-text recall.

## Privacy and retention boundary

Search records retain the query and aggregate behavior already approved by feature 013. Capability runs add only product capability, safe lifecycle state, aggregate count, timing, and opaque continuation correlation. They never store complete result lists, excerpts, raw page content, provider diagnostics, IP address, user agent, or per-keystroke telemetry.
