# Data Model: System-Level AI Support

**Feature**: 004-system-ai-support
**Date**: 2026-06-20
**Database**: PostgreSQL 16 + pgvector

## Extension

Migration prerequisite:

```sql
CREATE EXTENSION IF NOT EXISTS vector;
```

The Compose database image must contain pgvector. Extension creation remains an
idempotent application migration.

## Enumerations

### `ai_provider_kind`

- `openai_compatible`
- `openrouter`

### `ai_provider_status`

- `unverified`
- `healthy`
- `unavailable`
- `disabled`

### `ai_model_availability`

- `available`
- `unavailable`
- `unknown`

### `ai_capability`

- `text_generation`
- `embedding`
- `image_generation`

### `ai_capability_source`

- `provider`
- `catalog`
- `manual`

### `ai_purpose`

- `wiki_text`
- `wiki_embedding`
- `wiki_image`

### `ai_index_status`

- `building`
- `ready`
- `failed`
- `superseded`

### `ai_page_index_status`

- `pending`
- `running`
- `completed`
- `failed`
- `removed`

### `ai_action_feature`

- `provider_test`
- `model_sync`
- `index_rebuild`
- `semantic_search`
- `wiki_question`
- `text_optimization`
- `image_generation`

### `ai_action_status`

- `queued`
- `running`
- `completed`
- `failed`
- `cancelled`
- `expired`

### `ai_question_mode`

- `full`
- `retrieval`

### `ai_event_type`

- `status`
- `text_delta`
- `search_results`
- `citations`
- `optimization`
- `image_ready`
- `completed`
- `error`

## Tables

### `ai_settings`

Singleton global AI state.

| Field | Type | Rules |
|---|---|---|
| `id` | text | Primary key; fixed value `default` |
| `enabled` | boolean | Not null, default false |
| `event_retention_hours` | integer | Not null, default 24; 1–168 |
| `artifact_retention_hours` | integer | Not null, default 24; 1–168 |
| `updated_by` | uuid nullable | FK `users.id`, set null on user deletion |
| `updated_at` | timestamptz | Not null |

Global disable is checked before enqueue and before worker network access.

### `ai_providers`

System-level provider configuration.

| Field | Type | Rules |
|---|---|---|
| `id` | uuid | Primary key |
| `name` | text | Required, unique, 1–100 chars |
| `kind` | `ai_provider_kind` | Required |
| `base_url` | text | Required HTTPS or explicitly admin-approved HTTP; no embedded credentials |
| `config` | jsonb | Non-secret adapter options only |
| `credentials_encrypted` | text | Required encrypted JSON payload |
| `enabled` | boolean | Default true |
| `status` | `ai_provider_status` | Default `unverified` |
| `last_checked_at` | timestamptz nullable | |
| `last_error_code` | text nullable | Sanitized stable code |
| `created_by` | uuid nullable | FK users |
| `updated_by` | uuid nullable | FK users |
| `created_at` | timestamptz | |
| `updated_at` | timestamptz | |

Deletion is rejected while a purpose assignment or non-terminal action refers to
the provider. Normal removal is soft through `enabled=false`; hard deletion is
limited to unused providers.

### `ai_models`

Provider-scoped model identity and raw discovery metadata.

| Field | Type | Rules |
|---|---|---|
| `id` | uuid | Primary key |
| `provider_id` | uuid | FK `ai_providers.id` |
| `external_id` | text | Required |
| `canonical_id` | text nullable | Stable catalog slug when available |
| `display_name` | text | Required |
| `availability` | `ai_model_availability` | Default `unknown` |
| `context_window` | integer nullable | Positive; required for full-context assignment use |
| `max_output_tokens` | integer nullable | Positive |
| `embedding_dimensions` | integer nullable | Positive; required before embedding assignment |
| `input_modalities` | text[] | Normalized values |
| `output_modalities` | text[] | Normalized values |
| `raw_metadata` | jsonb | Last discovered non-secret metadata |
| `manually_added` | boolean | Default false |
| `last_seen_at` | timestamptz nullable | |
| `created_at` | timestamptz | |
| `updated_at` | timestamptz | |

Unique: `(provider_id, external_id)`.

Catalog refresh marks unseen discovered models unavailable; it does not delete
them or their historical action references.

### `ai_model_capabilities`

Capability value and provenance.

| Field | Type | Rules |
|---|---|---|
| `model_id` | uuid | FK `ai_models.id`, cascade |
| `capability` | `ai_capability` | |
| `supported` | boolean | |
| `source` | `ai_capability_source` | |
| `details` | jsonb | Optional source-specific constraints |
| `updated_by` | uuid nullable | Required for manual rows |
| `updated_at` | timestamptz | |

Primary key: `(model_id, capability, source)`.

Effective capability resolution:

1. newest manual row;
2. provider row;
3. catalog row;
4. unknown.

### `ai_purpose_assignments`

Current administrator request for each AI purpose.

| Field | Type | Rules |
|---|---|---|
| `purpose` | `ai_purpose` | Primary key |
| `model_id` | uuid | FK `ai_models.id` |
| `updated_by` | uuid nullable | FK users |
| `updated_at` | timestamptz | |

Validation:

- model provider is enabled;
- model availability is available;
- effective required capability is true;
- embedding model has known dimensions.

For `wiki_embedding`, changing this row starts a new index generation. Searches
continue using the active ready generation's model until activation.

### `user_ai_entitlements`

Administrator-controlled user feature switches.

| Field | Type | Rules |
|---|---|---|
| `user_id` | uuid | Primary key, FK users cascade |
| `question_answering_enabled` | boolean | Default false |
| `text_optimization_enabled` | boolean | Default false |
| `image_generation_enabled` | boolean | Default false |
| `updated_by` | uuid nullable | FK users |
| `updated_at` | timestamptz | |

Absence of a row is interpreted as all false. Migration may backfill rows, but
authorization must remain fail-closed if no row exists.

### `ai_index_generations`

One internally consistent embedding corpus.

| Field | Type | Rules |
|---|---|---|
| `id` | uuid | Primary key |
| `model_id` | uuid | FK `ai_models.id` |
| `embedding_dimensions` | integer | Required, positive |
| `chunker_version` | text | Required |
| `status` | `ai_index_status` | Default `building` |
| `is_active` | boolean | Default false |
| `total_pages` | integer | Default 0 |
| `completed_pages` | integer | Default 0 |
| `failed_pages` | integer | Default 0 |
| `created_by` | uuid nullable | FK users |
| `started_at` | timestamptz nullable | |
| `ready_at` | timestamptz nullable | |
| `finished_at` | timestamptz nullable | |
| `error_code` | text nullable | |
| `error_message` | text nullable | Sanitized |
| `created_at` | timestamptz | |

Partial unique index: only one `is_active=true`.

State transitions:

```text
building -> ready -> superseded
building -> failed
```

Only `ready` may become active. Activating a generation and superseding the old
one occurs in one transaction.

### `ai_page_index_states`

Tracks page reconciliation for each generation.

| Field | Type | Rules |
|---|---|---|
| `generation_id` | uuid | FK generation cascade |
| `page_id` | uuid | FK pages cascade |
| `target_revision_id` | uuid nullable | FK page revisions; null means removal |
| `target_content_hash` | text nullable | |
| `status` | `ai_page_index_status` | Default pending |
| `attempts` | integer | Default 0 |
| `last_error_code` | text nullable | |
| `last_error_message` | text nullable | Sanitized |
| `available_at` | timestamptz | Retry scheduling |
| `updated_at` | timestamptz | |
| `completed_at` | timestamptz nullable | |

Primary key: `(generation_id, page_id)`.

The target revision/hash is replaced when a newer publish event arrives.
Workers compare the claimed target again before committing chunks, preventing
stale work from overwriting new content.

### `ai_knowledge_chunks`

Derived semantic chunks.

| Field | Type | Rules |
|---|---|---|
| `id` | uuid | Primary key |
| `generation_id` | uuid | FK generation cascade |
| `page_id` | uuid | FK pages cascade |
| `revision_id` | uuid | FK page revisions cascade |
| `chunk_index` | integer | Zero-based |
| `heading_path` | text[] | Deterministic heading hierarchy |
| `content_text` | text | Normalized excerpt source |
| `content_hash` | text | Chunker/revision/text hash |
| `byte_count` | integer | Positive |
| `embedding` | vector | Dimensionless; validated against generation |
| `created_at` | timestamptz | |

Unique: `(generation_id, revision_id, chunk_index)`.

Indexes:

- B-tree `(generation_id, page_id)`
- B-tree `(generation_id, revision_id)`
- B-tree `(page_id)`

Initial vector ranking is exact and filtered by `generation_id`. No approximate
vector index is created in this feature.

### `ai_actions`

Stable resource for outbound work and permanent operational audit metadata.

| Field | Type | Rules |
|---|---|---|
| `id` | uuid | Primary key |
| `feature` | `ai_action_feature` | |
| `status` | `ai_action_status` | Default queued |
| `actor_user_id` | uuid nullable | FK users set null; interactive actions require non-null |
| `provider_id` | uuid nullable | Snapshot FK |
| `model_id` | uuid nullable | Snapshot FK |
| `index_generation_id` | uuid nullable | Retrieval/index snapshot |
| `page_id` | uuid nullable | Context page |
| `question_mode` | `ai_question_mode` nullable | |
| `request_metadata` | jsonb | IDs, sizes, hashes, mode; no prompt text |
| `result_metadata` | jsonb | counts, citation ids, artifact id; no answer text |
| `usage_metadata` | jsonb | provider token/image usage when available |
| `error_code` | text nullable | Stable code |
| `error_message` | text nullable | Sanitized and bounded |
| `queued_at` | timestamptz | |
| `started_at` | timestamptz nullable | |
| `finished_at` | timestamptz nullable | |
| `expires_at` | timestamptz | Event/output expiry |

Indexes:

- `(actor_user_id, queued_at desc)`
- `(feature, queued_at desc)`
- `(status, queued_at)`
- `(provider_id, queued_at desc)`
- `(model_id, queued_at desc)`

Terminal transitions:

```text
queued -> running -> completed
queued -> failed|cancelled
running -> failed|cancelled
completed|failed|cancelled -> expired
```

### `ai_action_events`

Short-lived content-bearing event stream.

| Field | Type | Rules |
|---|---|---|
| `id` | bigserial | Primary key; SSE cursor |
| `action_id` | uuid | FK actions cascade |
| `type` | `ai_event_type` | |
| `payload` | jsonb | Event-specific bounded payload |
| `created_at` | timestamptz | |
| `expires_at` | timestamptz | |

Index: `(action_id, id)`.

Payload limits are enforced before insert. Events are deleted after expiry.
They are not copied into audit logs.

### `ai_action_inputs`

Encrypted short-lived request content used by workers.

| Field | Type | Rules |
|---|---|---|
| `action_id` | uuid | Primary key, FK actions cascade |
| `payload_encrypted` | text | AES-GCM encrypted JSON |
| `payload_hash` | text | Integrity/idempotency metadata; does not reveal content |
| `created_at` | timestamptz | |
| `expires_at` | timestamptz | |

The pg-boss job payload contains only `actionId`. Workers decrypt this row only
after rechecking global AI state, actor status, entitlement, and model/provider
availability. The row is deleted after terminal completion or TTL expiry.

### `ai_generated_artifacts`

Private temporary generated image bytes.

| Field | Type | Rules |
|---|---|---|
| `id` | uuid | Primary key |
| `action_id` | uuid | Unique FK action cascade |
| `content_type` | text | Existing image allowlist |
| `content_hash` | text | SHA-256 |
| `size_bytes` | integer | Existing maximum |
| `bytes` | bytea | Validated image |
| `expires_at` | timestamptz | |
| `promoted_asset_id` | uuid nullable | FK content assets |
| `created_at` | timestamptz | |
| `promoted_at` | timestamptz nullable | |

An artifact can be promoted at most once. Promotion and normal asset creation
are transactional where database storage permits; retries return the existing
asset id.

## Existing Entities Modified

### `users`

No AI booleans are added directly. The one-to-one entitlement table keeps
feature governance separate from identity/profile fields.

### `content_assets`

No schema change required. Confirmed generated images use the existing
`kind='image'`, validation, authoritative blob, replication, reference, and
permission behavior.

### Permission model

Add action/resource types for AI administration and user operations. These are
application types, not database enums.

## Relationship Summary

```text
ai_provider 1---* ai_model 1---* ai_model_capability
                         |
                         +---* ai_purpose_assignment
                         +---* ai_index_generation 1---* ai_page_index_state
                                                   \---* ai_knowledge_chunk

user 1---0..1 user_ai_entitlement
user 1---* ai_action *---0..1 provider/model/index/page
ai_action 1---0..1 ai_action_input
ai_action 1---* ai_action_event
ai_action 1---0..1 ai_generated_artifact ---0..1 content_asset
```

## Deletion and Retention

- Provider/model historical references are retained while actions or index
  generations refer to them.
- Superseded knowledge generations are retained for a bounded rollback window,
  then chunks/states are deleted asynchronously.
- AI action operational metadata follows the administrator's normal audit
  retention policy.
- Action inputs, action events, and unpromoted generated artifacts default to
  24-hour retention.
- Page revisions remain immutable and are never deleted by AI cleanup.
