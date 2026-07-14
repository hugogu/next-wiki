# Data Model: Feishu Bot Integration

All table/column names use `snake_case`. The implementation changes Drizzle schema
files first and generates the migration with `pnpm db:generate`.

## Existing entities reused

| Entity | Use in this feature | Constraint |
|---|---|---|
| `users` | Bound Wiki actor | User must be active at request, delivery, and worker execution time. |
| `ai_actions` | Grounded Q&A lifecycle | `actor_user_id` remains the bound user; request metadata holds only bounded Feishu origin/correlation metadata. |
| `api_audit_entries` | Request audit trail | Add an origin and external correlation field; never store raw prompts or secrets. |
| `pages`, `spaces` | Citation and notification resources | Visibility is always calculated through the existing permission path at use time. |

## New entities

### `feishu_integration_config`

Singleton configuration record (`id = 'default'`).

| Field | Type | Rules |
|---|---|---|
| `id` | text | Primary key; fixed singleton identifier. |
| `app_id` | text | Required when enabled; safe to display in masked form. |
| `app_secret_encrypted` | text | Required when enabled; AES-256-GCM ciphertext only. |
| `encrypt_key_encrypted` | text | Event v2 decrypt/verification secret; ciphertext only. |
| `verification_token_encrypted` | text | Optional compatibility/configuration value; ciphertext only. |
| `enabled` | boolean | Default false; an unconfigured deployment is usable. |
| `connection_mode` | enum | `webhook` for v1; stored explicitly for health reporting. |
| `user_rate_limit_per_minute` | integer | Default 10; positive bounded administrator value. |
| `chat_rate_limit_per_minute` | integer | Default 30; positive bounded administrator value. |
| `notification_retention_hours` | integer | Default 72; inclusive range 24–168. |
| `last_connected_at`, `last_error` | timestamp, text | No secret or raw event payload in error text. |
| timestamps | timestamptz | Created/updated audit fields. |

### `feishu_bindings`

| Field | Type | Rules |
|---|---|---|
| `id` | UUID | Primary key. |
| `user_id` | UUID FK `users` | One current binding per Feishu identity; user must be active. |
| `open_id` | text | App-scoped Feishu identity used for direct messaging; unique among active/current bindings. |
| `union_id` | text nullable | Optional stable Feishu identity; never used as a replacement for binding confirmation. |
| `display_name` | text nullable | Operational display only; never authorization input. |
| `status` | enum | `active`, `revoked`. |
| `bound_at`, `last_seen_at`, `revoked_at` | timestamptz | State/audit timestamps. |
| `revocation_reason` | text nullable | Bounded operational reason. |

**Transitions**: `active → revoked`; a new completed binding creates a new active
record or explicitly replaces an earlier revoked record. A disabled Wiki user is
treated as unbound without mutating unrelated audit history.

### `feishu_binding_tokens`

| Field | Type | Rules |
|---|---|---|
| `id` | UUID | Primary key/correlation only. |
| `token_hash` | text | Unique; raw binding token is never stored. |
| `open_id` | text | Requesting Feishu identity; must match at completion. |
| `expires_at`, `used_at` | timestamptz | 10-minute expiry; `used_at` changes once only. |
| `created_at` | timestamptz | Lifecycle. |

### `feishu_inbox_events`

Durable receive-side idempotency record.

| Field | Type | Rules |
|---|---|---|
| `id` | UUID | Primary key. |
| `tenant_key`, `event_type`, `source_event_id` | text | Unique triple. `source_event_id` is Feishu `message_id` for message events and `event_id` otherwise. |
| `received_at`, `expires_at` | timestamptz | Retain at least 24 hours. |
| `status` | enum | `accepted`, `processed`, `rejected`. |
| `correlation_id` | UUID/text | Bounded, non-secret trace identifier. |

### `feishu_bot_sessions`

| Field | Type | Rules |
|---|---|---|
| `id` | UUID | Primary key. |
| `binding_id` | UUID FK `feishu_bindings` | Session actor. |
| `chat_id` | text | Feishu direct/group chat identifier. |
| `ai_action_id` | UUID FK `ai_actions` nullable | Latest underlying conversation/action reference. |
| `state` | enum | `active`, `expired`, `reset`. |
| `last_activity_at`, `expires_at` | timestamptz | Default 30-minute inactivity; never cross users in a group. |

**Uniqueness**: one active session per `(binding_id, chat_id)`.

### `feishu_notification_subscriptions`

| Field | Type | Rules |
|---|---|---|
| `id` | UUID | Primary key. |
| `event_type` | enum | `page_published`, `ai_action_completed`, `transfer_completed`. |
| `mode` | enum | `direct`, `public_safe_group`, `private_recipients_group`. |
| `target_open_id`, `target_chat_id` | text nullable | Exactly one target shape valid for the mode. |
| `space_id` | UUID FK `spaces` nullable | Optional event scope. |
| `status` | enum | `active`, `paused`, `failing`, `action_required`. |
| `failure_count`, `last_success_at`, `last_error` | integer/timestamp/text | Health; no protected payload in error. |
| `created_by` | UUID FK `users` | Admin actor. |
| timestamps | timestamptz | Lifecycle. |

**Mode invariants**:

- `direct` requires a currently bound `target_open_id`.
- `public_safe_group` requires `target_chat_id`; only a still-public resource may
  generate a group card.
- `private_recipients_group` requires `target_chat_id`; it is recipient discovery
  only and never receives a group card with protected metadata.

### `feishu_notification_events`

Durable, minimal outbox record created for a supported Wiki event.

| Field | Type | Rules |
|---|---|---|
| `id` | UUID | Primary key/correlation ID. |
| `type` | enum | Matches subscription event types. |
| `page_id`, `space_id`, `ai_action_id`, `transfer_id` | UUID nullable | Exactly the resource references required by the event type. |
| `occurred_at`, `expires_at` | timestamptz | Expiry derives from configuration snapshot at creation. |
| `safe_payload` | JSONB | Minimal identifiers/neutral status only; do not pre-render private text. |
| `created_at` | timestamptz | Lifecycle. |

### `feishu_notification_deliveries`

| Field | Type | Rules |
|---|---|---|
| `id` | UUID | Primary key and outgoing idempotency UUID. |
| `event_id`, `subscription_id` | UUID FKs | Unique pair; one logical delivery per subscription. |
| `recipient_binding_id` | UUID FK nullable | Required for direct/private-recipient delivery. |
| `status` | enum | `queued`, `running`, `delivered`, `retry`, `failed`, `blocked`, `expired`. |
| `attempts` | integer | Starts at zero; terminal `failed` after five unsuccessful sends. |
| `available_at`, `claimed_at`, `delivered_at`, `expires_at` | timestamptz | Claim/retry/retention lifecycle. |
| `last_error` | text nullable | Bounded normalized error only. |

**Indexes**: unique `(event_id, subscription_id, recipient_binding_id)` where the
nullable recipient form remains unambiguous; due-work index `(status, available_at)`;
subscription-health index. The implementation may materialize per-recipient delivery
rows for private-recipient groups after member and permission checks.

## Existing audit extensions

`api_audit_entries` gains:

| Field | Type | Rules |
|---|---|---|
| `origin` | enum/text | Bounded `web`, `api`, or `feishu`; existing rows backfill/default to their present origin. |
| `external_correlation_id` | text nullable | Non-secret Feishu event/message/action correlation; indexed with origin. |

The audit writer takes these explicit values rather than inferring them from path.

## Retention and cleanup

- Binding tokens: delete/expire shortly after their 10-minute completion window.
- Inbox events: retain at least 24 hours for Feishu retry coverage.
- Sessions: expire immediately on unbind/revocation/deactivation and clean up on a
  documented operational TTL.
- Notification events/deliveries: stop retries at `expires_at`, set terminal
  `expired`, then clean up after the configured retention period while retaining
  aggregate subscription health.
- Raw Feishu credentials never enter these rows except encrypted configuration
  fields; raw questions and answers remain governed by the existing AI-action
  retention policy, not an additional bot copy.
