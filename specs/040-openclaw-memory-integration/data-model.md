# Data Model: Unified Agent Memory Integrations

**Feature**: [Unified Agent Memory Integrations](./spec.md)

## Model Principles

- Physical names remain `agent_memory_*`; no persistent object is named for
  Hermes or OpenClaw.
- Restricted Raw pages and their immutable revisions are the sole canonical
  bodies. Agent Memory rows are authorization, provenance, locator, and retry
  projections only.
- A connection is the durable identity. API keys are rotatable credentials and
  adapter-supplied identity, path, destination, and share values are never
  authorization inputs.
- The 039 namespace, binding, record, evidence-link, and capture tables are
  extended in place. No automatic conversion of existing data is required.
- This feature introduces exactly one generated database migration after every
  schema change below has been made. It does not introduce a long-term
  retention-policy table.

## Existing Entities Reused

### API Key and Audit Entry

`api_keys` continues to hold encrypted credential material, ownership, scopes,
revocation, and last-used time. Dedicated `memory.read`, `memory.write`, and
`memory.delete` scopes remain the agent interface gate. Audit entries retain
the generic `agent_memory` origin and only bounded operation, connection,
destination, correlation, and outcome data—never source bodies, titles,
queries, session/event digests, grants, or credentials.

### Raw Page and Page Revision

Every memory, evidence, and curated record is written through the normal Raw
writer as a restricted page and immutable published revision. The record stores
the exact source page and revision written. A missing, deleted, non-Raw,
unpublished, or inaccessible source is unavailable; it never resolves to a
different current page body.

## Reused and Evolved Agent Memory Tables

### `agent_memory_namespaces` — Memory Destination

Keep the existing table as the physical destination collection.

| Field | Meaning after this feature | Invariant |
|---|---|---|
| `id` | Destination ID | Server-generated and never accepted from an adapter. |
| `owner_user_id` | Destination owner | Must match every attached connection and grant in the initial release. |
| `display_name` | Owner-visible label | Not returned as a source inventory to an agent. |
| `role` (new) | `private` or `shared` | `shared` alone does not grant access. |
| `state` | `active` or `disabled` | Disabled destinations reject operation and are omitted from recall. |
| lifecycle timestamps | Destination state | Disabled state has a disabled timestamp. |

Each connection has one private destination. Shared destinations contain only
owner-curated records in this release; adapters do not choose them as a write
target.

### `agent_memory_key_bindings` — Connection Credential

Keep the existing API-key primary key and legacy fields. Add nullable
`connection_id`.

| Field | Meaning | Invariant |
|---|---|---|
| `api_key_id` | Dedicated credential | One binding per key. |
| `connection_id` (new) | Stable connection for new credentials | Required by application logic for a new connection; nullable only for 039 compatibility. |
| `namespace_id`, `agent_identity` | Legacy resolver data | Existing Hermes bindings may use these unchanged; new calls resolve the connection first. |
| `shared_by_owner` | Legacy audit/UI marker | Never treated as an authorization grant. |

Credential rotation issues another binding for the same connection. Revoking one
credential does not change record provenance, grants, or pending-capture
identity.

### `agent_memory_records` — Durable Record Projection

Keep the table and canonical Raw references. Add connection and provenance
fields rather than a second record table.

| Field | Meaning | Invariant |
|---|---|---|
| `namespace_id` | Destination ID | Physical name remains for compatibility. |
| `author_connection_id` (new) | Producing connection | Required for newly created connection-backed records. |
| `agent_identity` | Legacy diagnostic identity | Retained for old rows and safe diagnostics; not an authorization selector. |
| `record_type` | `memory` or `evidence` | Evidence is original selected source; memory is a durable assertion or curated copy. |
| `origin` (new) | `explicit_save`, `automatic_capture`, `checkpoint`, `import`, or `promotion` | Closed provenance value chosen by the service path. |
| `content_kind` (new) | `original` or `generated` | Lets recall/audit distinguish source material from synthesis. |
| `page_id`, `current_revision_id` | Immutable Raw locator | `current_revision_id` keeps its physical name but is semantically the immutable source revision and is never updated. |
| `idempotency_key` | Request/event identity | New records are unique by destination, connection, and key; legacy uniqueness stays for legacy rows. |
| `state` | `active` or `forgotten` | Forget affects recall only; it does not delete the Raw source. |

The generated migration may add a connection-scoped unique index alongside the
existing legacy `(namespace_id, agent_identity, idempotency_key)` constraint.
Existing rows are not backfilled; their existing unique constraint remains their
idempotency boundary.

### `agent_memory_evidence_links` — Provenance Link

Reuse the existing source relationship. Preserve its physical columns
`memory_record_id` and `evidence_record_id` for compatibility; conceptually it
means derived record to supporting source. Extend the closed relation set for
`promotion` and `import` when those flows create a link.

Links are immutable. The service validates that both records are eligible and
that curation does not itself expand read access to the source destination.

### `agent_memory_captures` — Capture Delivery Ledger

Reuse the existing capture table; it remains operational state, never a second
canonical transcript store.

| Field | Meaning | Invariant |
|---|---|---|
| `connection_id` (new) | Resolved producer connection | Worker authorization and retry identity use this value, not the original API key. |
| `namespace_id` | Resolved private destination | The adapter never supplies it. |
| `api_key_id` | Original/legacy credential attribution | Retained for legacy requests and audit; rotation does not decide replay authorization. |
| `idempotency_key`, `payload_digest` | Retry identity | Same key with different normalized content is a safe conflict. |
| `capture_kind` (new) | `turn`, `checkpoint`, `compaction`, or `session_end` | Supports both adapters without product-named columns. Imports create normal private records rather than capture deliveries. |
| `payload_encrypted`, `payload_expires_at` (new) | Worker-only transient selected content | At most 1 MB encrypted, expiring 24 hours after admission (see spec.md Bounded Limits). Deleted after durable completion, cancellation, or expiry. |
| `session_digest` | One-way correlation | Never returned in a view or audit entry. |
| `status`, `evidence_record_id`, `job_id`, `failure_code` | Delivery state | `durable` only after Raw revision and record mapping commit. |

The background job contains the capture ID only. Row locks and conditional
states serialize duplicate workers. A disabled/revoked connection or disabled
destination stops a replay before a new canonical write.

## New Tables

### `agent_memory_connections`

This is the stable product-neutral identity of an external agent installation.

| Field | Description | Invariant |
|---|---|---|
| `id` | Stable connection ID | Server-generated; never adapter input. |
| `owner_user_id` | Owner | Matches the private destination. |
| `private_namespace_id` | Primary private destination | Required, unique for the initial release, and has `private` role. |
| `agent_identity` | Bounded immutable diagnostic label | Never used to authorize a request. |
| `display_name` | Owner-facing mutable label | Never used for routing. |
| `state` | `active`, `disabled`, or `revoked` | Inactive connections deny agent API operations and pending replay. |
| timestamps | Lifecycle | Preserve auditable creation/disable/revoke timing. |

One connection can have multiple credentials over time. It has implicit access
to its private destination and gains no other destination access unless a grant
exists.

### `agent_memory_destination_grants`

This models deliberate cross-agent read access.

| Field | Description | Invariant |
|---|---|---|
| `id` | Grant ID | Server-generated. |
| `grantee_connection_id` | Reader | Active connection owned by the same owner in this release. |
| `destination_id` | Shared source destination | Never supplied by the agent request. |
| `capability` | `read` | The initial release grants reads only; shared writes remain owner-side curation. |
| `state` | `active`, `revoked`, or `expired` | Only active, unexpired grants expand recall. |
| `granted_by_user_id` | Owner actor | Required provenance. |
| `expires_at`, `created_at`, `revoked_at` | Grant lifecycle | Revocation is retained for audit. |

Unique `(grantee_connection_id, destination_id, capability)` prevents competing
active grant state. The primary private destination is not represented as a
grant.

## Explicitly Not Added

`agent_memory_retention_policies` is not part of this feature. The initial
release relies on the existing Wiki retention policy for canonical Raw content,
the record's reversible forget state for recall exclusion, and bounded cleanup
of transient capture data. A future retention feature can add a separate policy
aggregate only when it defines actual policy execution and history semantics.

## Authorization Resolution

```text
Bearer API key
  -> active memory scope + key binding
  -> connection (or legacy 039 binding)
  -> own private destination
  -> active read grants when requested
  -> record/source-revision recheck
  -> bounded response or indistinguishable omission
```

- Save and capture always use the resolved private destination.
- Hermes uses own-destination recall by default.
- OpenClaw's external-memory tool requests granted recall explicitly; its own
  destination is included only when the operator enables that intent.
- Browser/session owner routes create connections, credentials, shared
  destinations, grants, and curation. Agent credentials cannot administer
  those resources.

## Single Migration Boundary

All changes above are made together in
`apps/web/src/server/db/schema/agent-memory.ts`, then generated once from the
039 `0021` schema baseline by `pnpm db:generate`. The resulting single `0022`
migration includes all enums, new tables, columns, constraints, and indexes.
No SQL, journal entry, or snapshot is hand-written. It is acceptable for old
039 rows to remain legacy rows rather than be data-migrated automatically.
