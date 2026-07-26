# Data Model: Outbound Request Logging

## Design principles

- `outbound_request_logs` is the one shared record collection for AI and every
  future explicitly registered outbound source.
- `request_log_settings` is a singleton policy row, not a per-provider setting.
- Filtering and list display use bounded metadata columns only.
- Headers, targets, bodies, and complete error envelopes are encrypted at rest
  and decrypted only after the Admin permission check for the detail view.
- Request attempts are append-only operational records. They expire according
  to `expires_at`; they do not become page content, revision history, or Raw
  knowledge automatically.

## Entity: RequestLogSettings

Table: `request_log_settings`

Singleton invariant: `id` is always `default`.

| Field | Type | Rules |
|---|---|---|
| `id` | text | Primary key; only `default` is valid |
| `enabled` | boolean | Default `false`; controls creation of new records |
| `level` | enum | `status`, `header`, or `all`; default `status` |
| `retention_hours` | integer | Default `24`; inclusive range `1..168` |
| `updated_by` | UUID nullable | Admin user that last changed the setting |
| `created_at` | timestamp | Row creation time |
| `updated_at` | timestamp | Last policy change time |

Validation and transitions:

```text
missing row -> effective disabled/status/24h defaults
disabled    -> enabled at status/header/all
enabled     -> disabled
enabled     -> enabled with another level or retention window
```

Saving `all` requires an explicit confirmation in the UI. The service still
validates that the caller is an Admin; confirmation is a request-level input,
not a client-only visual condition.

## Entity: OutboundRequestLog

Table: `outbound_request_logs`

One row represents one outbound request attempt, including a retry attempt. A
single user action may produce multiple rows sharing `correlation_id`.

### Common metadata

| Field | Type | Rules |
|---|---|---|
| `id` | UUID | Primary key |
| `source_type` | text | Canonical identifier from the immutable request-log source registry, e.g. `ai` |
| `provider_key` | text nullable | Provider/integration key, e.g. configured AI provider name |
| `operation` | text | Operation identifier registered for `source_type`, e.g. `chat.completions`, `embeddings`, `models` |
| `attempt` | integer | Positive retry/attempt number; default `1` |
| `method` | text | Uppercase request method |
| `target_host` | text nullable | Safe host metadata used for list context; no credentials |
| `target_path` | text nullable | Safe path metadata used for list context; no raw query credentials |
| `status_code` | integer nullable | HTTP status when a response exists; null for pre-response failures |
| `outcome` | enum/text | `success`, `http_error`, `transport_error`, `timeout`, `cancelled`, or `invalid_response` |
| `error_code` | text nullable | Normalized provider/transport code when available |
| `error_message` | text nullable | Bounded normalized summary safe for list/detail metadata; it excludes raw headers, bodies, credentials, and provider error payloads |
| `provider_request_id` | text nullable | Provider-issued request identifier when available |
| `correlation_id` | text nullable | Bounded non-secret trace identifier |
| `started_at` | timestamp | Request start |
| `completed_at` | timestamp nullable | Completion/failure time |
| `duration_ms` | integer nullable | Non-negative elapsed duration |
| `capture_level` | enum | Snapshot of `status`, `header`, or `all` used for this row |
| `expires_at` | timestamp | Derived from the setting at capture time |
| `created_at` | timestamp | Insert time; normally equal to or after `started_at` |

### Encrypted detail fields

These columns contain encrypted JSON strings using the existing application key
encryption. They are null when the selected level does not include that field.

| Field | Type | Level | Envelope |
|---|---|---|---|
| `target_encrypted` | text nullable | `header`, `all` | Exact normalized target URL without userinfo; raw query is preserved only if the caller supplied it as the target and it is treated as sensitive detail |
| `request_headers_encrypted` | text nullable | `header`, `all` | Ordered `[{ name, values[] }]`; duplicate names and multiple values preserved |
| `response_headers_encrypted` | text nullable | `header`, `all` | Same header envelope; null means no response headers were received |
| `request_body_encrypted` | text nullable | `all` | Body envelope with encoding, MIME type, content encoding, byte length, and original UTF-8/base64 data |
| `response_body_encrypted` | text nullable | `all` | Same body envelope; null means unavailable, while an empty body has byte length `0` |
| `error_detail_encrypted` | text nullable | `all` | Complete serializable error envelope including name/code/message/cause/stack when supplied by the operation and provider payload when available |

The detail route returns decrypted values only to a current Admin. List and
filter routes never select or return encrypted columns.

### Indexes

Create indexes for the query contract:

- `(created_at DESC, id DESC)` for newest-first pagination and time ranges.
- `(source_type, created_at DESC, id DESC)` for source filtering.
- `(provider_key, created_at DESC, id DESC)` for provider filtering.
- `(operation, created_at DESC, id DESC)` for operation filtering.
- `(outcome, created_at DESC, id DESC)` and `(status_code, created_at DESC, id DESC)` for outcome/status filters.
- `(correlation_id, created_at DESC, id DESC)` for trace lookup and deterministic result ordering.
- `(expires_at)` for cleanup.

The implementation should use a bounded page size (default `20`, maximum `100`)
and a stable `created_at, id` tie-breaker for deterministic pagination.

## Capture-level invariants

| Level | Required persisted fields | Forbidden persisted fields |
|---|---|---|
| `status` | Common metadata, normalized error summary, status/outcome/timing | Request/response headers, target raw detail, request/response bodies, full error envelope |
| `header` | Everything in `status`, all request/response header pairs, encrypted target detail | Request/response bodies, full error envelope |
| `all` | Everything in `header`, complete available bodies, complete serializable error detail | Nothing available at the outbound boundary is intentionally dropped; unavailable data is marked as unavailable |

`capture_level` is immutable for a row. A level change affects only later
attempts. If capture is disabled while an attempt is in flight, the attempt
uses the decision made when the wrapper began; it is never silently split.

## Source registration contract

`source_type` and `operation` are not free-form input. The request-log service
owns one immutable source registry, checked when a wrapper is constructed. The
production registry initially contains `ai` and its supported operations. A
future integration changes that registry in the same change set as its adapter
and tests; it does not register itself dynamically at runtime. Tests may inject
a fixture registry into the service constructor, which keeps the production
registry immutable and avoids a mutable global singleton.

The generic wrapper receives an explicit source descriptor:

```ts
type OutboundRequestSource = {
  sourceType: string;
  providerKey?: string;
  operation: string;
  correlationId?: string;
  attempt?: number;
};
```

The wrapper also receives the request method/target and an operation callback
that consumes the response. This keeps the record complete for parser and
stream failures, not merely HTTP transport failures. AI provider adapters are
the first registered source; future integrations must pass an explicit
descriptor validated against the registry and must not be discovered
implicitly.

## Persistence lifecycle

1. At wrapper start, read the effective setting once and snapshot the selected
   capture level and retention window for the attempt. Disabled capture returns
   without payload serialization.
2. At operation completion (including parser, stream, timeout, cancellation,
   and transport failures), collect the fields allowed by the snapshotted
   level. Assign the request-log UUID before persistence.
3. Encrypt every raw target/header/body/error envelope before enqueueing. The
   pg-boss job payload contains only metadata and encrypted envelopes; it never
   contains plaintext diagnostic content.
4. Submit the record to a `requestLogPersist` job handled by the existing
   pg-boss worker process. The original outbound operation does not await this
   persistence path. Queue/encryption/persistence failures are bounded
   operational diagnostics and never recurse into request logging.
5. The worker inserts by the preassigned UUID with idempotent conflict handling
   so a retry creates at most one durable row per captured attempt.

## Relationships to existing entities

- `request_log_settings.updated_by -> users.id` with `on delete set null`.
- `outbound_request_logs` does not require an `ai_action_id`; generic sources
  may not have one. AI calls carry `source_type = ai`, provider/operation, and a
  correlation identifier supplied by the AI action when available.
- Existing `api_audit_entries` records authenticated settings/list/detail route
  access. Add a nullable non-sensitive audit metadata envelope for a settings
  mutation: previous and new `enabled`, `level`, and `retention_hours`; this is
  an audit projection, not a foreign-key parent of the request record and MUST
  never contain captured headers, bodies, targets, or errors.

  ```ts
  type RequestLogSettingsAuditMetadata = {
    kind: 'request_log_settings_change';
    previous: { enabled: boolean; level: 'status' | 'header' | 'all'; retentionHours: number };
    next: { enabled: boolean; level: 'status' | 'header' | 'all'; retentionHours: number };
  };
  ```

  The settings route passes this envelope to the existing API-audit wrapper;
  the wrapper writes it on the normal authenticated PATCH audit row rather than
  creating a second audit entry.
- No request log row is linked to page revisions, Raw pages, or generated pages
  automatically.

## Retention behavior

At capture time, calculate `expires_at = (completed_at ?? started_at) +
retention_hours`. The existing scheduled cleanup worker periodically removes
expired request-log rows and their encrypted payloads. Normal list/detail
queries also constrain `expires_at > now()` so expired data is invisible even
before the cleanup pass completes. The persister calculates expiry from the
attempt's snapshotted retention window, never the setting current when its job
runs.

Retention cleanup is operational data expiry, not a page-content deletion path;
it must not touch `pages`, `page_revisions`, `ai_actions`, or audit records.

## Migration requirements

1. Add the new enum values/tables and the non-sensitive API-audit metadata
   column to the actual Drizzle schema files.
2. Run `pnpm db:generate` from the repository root to produce the next
   migration and matching snapshot/journal entry.
3. Never hand-author the SQL migration, snapshot, or journal.
4. Run `pnpm db:generate` again and verify it reports no schema changes.
