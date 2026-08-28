# Data Model: OpenClaw Shared Memory Bridge

**Feature**: [OpenClaw Shared Memory Bridge](./spec.md)

**Related contracts**: [v2 REST API](./contracts/agent-memory-v2-rest-api.md), [Owner Management](./contracts/agent-memory-management.md), and [OpenClaw Bridge](./contracts/openclaw-bridge-plugin.md)

## Model Principles

- Physical database names remain agent_memory_*. No table, enum, route, or audit origin is named for OpenClaw.
- Restricted Raw pages and immutable page revisions are the only canonical bodies. Relational body-like fields are prohibited except an encrypted, TTL-bound capture envelope before an asynchronous Raw write.
- A connection, not an API key, is the durable client identity. Credential rotation cannot change its destination, grants, records, or audit history.
- Requests cannot select connection, destination, source destination, grant, or agent identity. Services resolve them from the authenticated key and server-side grant graph.
- Existing v1 key bindings and records remain readable for Hermes. V2 connections are backfilled by an idempotent application service; all DDL is generated only by pnpm db:generate.

## Existing Entities Reused

### API Key

api_keys retains encrypted secret material, owner, role, scopes, revocation, and last-used time. Dedicated memory.read, memory.write, and memory.delete scopes remain necessary but do not select a destination. Browser sessions are never accepted by v2 agent routes.

### Raw Page and Page Revision

Every memory, evidence, synthesis, and promotion record uses a restricted Raw page and the immutable revision created by the normal Raw writer. The stored reference is the source revision actually written, never a mutable latest revision. Citation construction verifies page, exact revision, Raw space, restricted visibility, and non-deleted state before returning anything.

### API Audit Entry

The existing agent_memory audit origin is retained. Its bounded metadata contains generic operation, outcome, connection ID, destination ID, and safe correlation ID. It never contains query text, body/title/excerpt, source or session digest, grant labels, credentials, HTTP error body, or transient input.

## New and Evolved Persistent Entities

### Agent Memory Destination

The existing physical agent_memory_namespaces table is the logical destination collection. It gains a closed role and optional retention policy.

| Field | Description | Invariant |
|---|---|---|
| id | Stable destination ID | Server-generated UUID; never client input. |
| owner_user_id | Owning Wiki user | Required; all connected/granted entities have this owner in v1. |
| display_name | Owner-visible label | Bounded non-secret; never returned as agent source inventory. |
| role | private or shared | Shared role alone grants nothing. |
| state | active or disabled | Disabled hides records from recall and rejects operations. |
| retention_policy_version | Owner-selected rule reference | Cannot create a grant or delete canonical evidence. |
| timestamps | Creation/update/disable | disabled_at required when disabled. |

### Agent Memory Connection

agent_memory_connections becomes the stable provider-neutral identity of an external agent installation.

| Field | Description | Invariant |
|---|---|---|
| id | Stable connection ID | Server-generated UUID, never bridge input. |
| owner_user_id | Connection owner | Required; matches private destination and v1 grants. |
| agent_identity | Immutable diagnostic identity | Normalized non-secret label, never an authorization parameter. |
| display_name | Owner-facing name | Bounded/editable; never used for routing. |
| private_destination_id | Primary private destination | Required and owned; has private role. |
| state | active, disabled, or revoked | Inactive states deny agent API access. |
| timestamps | Lifecycle | Terminal timestamps match state. |

One connection has one primary private destination. It may receive grants to other destinations but cannot create or alter them itself.

### Agent Memory Connection Credential

Evolve agent_memory_key_bindings, or add a normalized successor with a compatibility adapter, so each dedicated API key maps to exactly one connection. The existing binding remains the v1 source until a v2 connection exists.

| Field | Description | Invariant |
|---|---|---|
| api_key_id | Dedicated encrypted API key | One active connection binding per key. |
| connection_id | Resolved stable connection | Required for v2; legacy rows are backfilled idempotently. |
| issued_at, retired_at | Credential lifecycle | Rotation does not change connection identity. |
| legacy namespace/identity | v1 compatibility fields | Never trusted by v2 after connection resolution. |

### Agent Memory Destination Grant

agent_memory_destination_grants represents every non-primary permission between a connection and destination.

| Field | Description | Invariant |
|---|---|---|
| id | Stable grant ID | Server-generated UUID. |
| connection_id | Grantee connection | Required; owner-aligned in v1. |
| destination_id | Source/target destination | Never selected by an agent request. |
| capability | read or write | Write is never inferred from read. |
| state | active, revoked, or expired | Only active grants expand access. |
| granted_by_user_id | Owner actor | Required audit/provenance link. |
| timestamps | Lifecycle | Revoked/expired rows remain auditable. |

Unique active capability grants prevent duplicate state. The primary private destination is implicit rather than represented as a grant.

### Agent Memory Record

Evolve agent_memory_records from namespace/agent-identity ownership to connection/destination ownership. Current v1 fields remain only during the compatibility period.

| Field | Description | Invariant |
|---|---|---|
| id | Logical memory ID | Stable UUID; visible only through resolved access. |
| destination_id | Containing destination | Derived write destination. |
| author_connection_id | Producing connection | Required for v2 provenance and idempotency. |
| source_page_id, source_revision_id | Canonical Raw locator | Required and immutable; never resolve a later body. |
| record_role | evidence, synthesis, or curated | Curated requires owner promotion. |
| nature | original or generated | Closed enum; sources remain attributable. |
| origin | explicit_save, automatic_capture, checkpoint, import, or promotion | Bridge cannot use promotion. |
| idempotency_key | Client event/request identity | Unique with destination and author connection. |
| source/event digests | One-way correlation | Never returned or audited. |
| recall_state | active, forgotten, or archived | State never deletes the Raw source. |
| timestamps | Lifecycle | Every transition is attributable. |

Current_revision_id becomes conceptually source_revision_id. Implementation must never overwrite it because Agent Memory bodies are append-only.

### Agent Memory Provenance Link

Evolve agent_memory_evidence_links into source-to-derived links while keeping a compatibility reader for v1 rows.

| Field | Description | Invariant |
|---|---|---|
| source_record_id | Supporting evidence/record | Must be active and permitted. |
| derived_record_id | Memory, synthesis, or curated record | Written atomically when required. |
| relation | explicit_save, automatic_capture, checkpoint, import, or promotion | Immutable closed enum. |
| created_at | Link creation time | Cannot mutate source content. |

Cross-destination links are allowed only by owner-authorized promotion and do not expand recall access. A returned citation still undergoes its own recheck.

### Agent Memory Capture Delivery

Evolve agent_memory_captures into a capture ledger with protected transient input. It is not canonical memory content.

| Field | Description | Invariant |
|---|---|---|
| id | Capture ID | Stable UUID returned to bridge. |
| connection/destination IDs | Resolved producer/target | Derived server-side. |
| idempotency key/payload digest | Retry identity | Mismatch is a safe conflict. |
| session/event digest | One-way correlation | Excluded from views/audit. |
| capture_kind | pre/post compaction, session end, or import | Determines allowed original/generated nature. |
| payload_encrypted | Temporary normalized content | Worker-only AES-GCM; erased on durability/expiry. |
| status | queued, running, durable, failed, or cancelled | Durable only after Raw revision and record commit. |
| record/job/failure fields | Safe references | Job data contains no body. |
| timestamps | Retry/TTL lifecycle | Cleanup removes only transient content. |

~~~
queued -> running -> durable
   |        |          \
   |        -> failed     -> terminal
   -> cancelled
failed -> queued          (same key and payload, within retry policy)
~~~

Row locking plus payload-digest comparison serializes duplicates. Credential rotation changes authentication, not capture identity; disabled/revoked connections deny replay.

## Non-Persistent Bridge State

### Continuous Bridge Outbox Entry

The OpenClaw package stores a pending capture below the public OpenClaw state root. It is local operational state, not Wiki data and not a server schema.

| Field | Purpose |
|---|---|
| idempotency key/payload digest | Duplicate detection and server replay. |
| capture kind and correlation | Attribution without server identity selection. |
| normalized selected content | Pending delivery only; never logged; retention bounded. |
| state/attempt/next retry/safe error | Recovery, retry, and diagnostics. |

Entries use atomic writes and Gateway-user-only file permissions. They are deleted after durable acknowledgement or terminal expiry; shutdown never deletes an unacknowledged entry.

### Migration Ledger

The separate migration package keeps a resumable local source-fingerprint ledger with preview, approved, running, completed, failed, and cancelled states. It records source digest and resulting generic record/capture ID, never deletes or changes OpenClaw source material.

## Authorization Resolution

~~~
Bearer API key
  -> dedicated memory scope + active key
  -> active Agent Memory Connection
  -> implicit private destination + active read/write grants
  -> operation-specific destination set
  -> record/page/revision re-check
  -> safe response or indistinguishable non-disclosure
~~~

- Recall own uses the private destination; granted uses active read grants; own_and_granted unions both. Input never contains a destination/key/agent filter.
- Save, ordinary capture, and import target the private destination. Shared write requires a separate active server grant; no bridge option can select it.
- Owner management owns connections, credentials, grants, retention, and promotion. Bearer keys can only use their scoped v2 memory resources.
