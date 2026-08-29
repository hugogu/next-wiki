# Data Model: Agent Memory Provider

## Generic backend revision

The relational model is client-neutral. Physical tables are `agent_memory_*`;
the feature branch's single generated migration creates these objects directly
from the `origin/main` schema baseline; no `hermes_memory_*` tables are kept.
`agent_identity` is non-null on key bindings, records, and captures,
and is part of every namespace-scoped lookup and idempotency key. A shared
destination therefore supports multiple clients safely without putting a client
name in the URL. Raw pages/revisions remain the canonical immutable body and
are indexed by the existing Wiki pipeline; relational rows are only
authorization, provenance, and retry projections.

**Feature**: [Agent Memory Provider](./spec.md)
**Date**: 2026-08-27

## Design Principles

- Wiki page and revision content is canonical. Agent Memory metadata must never become
  a second source of transcript or memory text.
- An authenticated Memory provider key determines its Memory Destination on the server.
  The client-provided agent identity is diagnostic context only and cannot change
  authorization.
- An explicit Memory Record has one immutable backing Raw page/revision. A
  Conversation Evidence Record is an aggregate: one server-derived Raw page
  receives append-only revisions for accepted captures from the same session.
  Raw content is never edited or deleted by an agent; the logical record can
  be forgotten independently.
- Idempotency is durable and scoped to a destination. Retried, overlapping, or
  resumed lifecycle hooks therefore cannot create duplicate evidence.
- All new database schema is defined in Drizzle and migrated solely via
  `pnpm db:generate`.

## Existing Entities Reused

### API Key

Existing `api_keys` keeps the encrypted secret, immutable scopes, owner, revocation
state, and last-used timestamp. It gains the dedicated scope values
`memory.read`, `memory.write`, and `memory.delete`.

The provider does not receive a browser session, database credential, or generic
admin token. Every provider request is authenticated as this API key and is
constrained by its owner role plus its memory scope.

### Page and Page Revision

Each Memory Record is backed by a restricted entry in the shared Raw space and
its published revision. An Evidence Record is backed by one restricted Raw page
whose published revisions form the conversation history. The Raw page/revision retains
canonical source Markdown/text verbatim, the Agent Memory system category and source
metadata, rendered representation, content hash, author/actor attribution,
created time, and common index/reconciliation state. The memory service always
writes through the existing Raw-entry writer; it never writes page tables
directly and never updates an existing revision.

### API Audit Entry

Existing API audit rows record credential identity, endpoint, result, duration,
and safe error information. The audit origin uses `agent_memory`, with bounded
operation/correlation metadata only. It must never contain a secret, query,
profile label, transcript, memory body, or raw HTTP error body.

## New Persistent Entities

### Agent Memory Namespace

An owner-managed, durable Memory Destination that defines the private record
collection used by one or more explicitly bound Agent Memory keys.

| Field | Description | Rules |
|---|---|---|
| `id` | Stable UUID destination identifier | Server-generated; never guessed from profile text. |
| `owner_user_id` | API-key owner | Required; must match each binding's key owner. |
| `display_name` | Owner-visible destination label | Bounded, non-secret; useful for API-key UI and safe diagnostics. |
| `state` | `active` or `disabled` | Disabled destinations reject recall and writes without revealing records. |
| `created_at`, `updated_at`, `disabled_at` | Lifecycle timestamps | `disabled_at` required when disabled. |

The namespace does not contain memory text, prompt text, session identifiers, or
a hard-coded client-home path.

### Agent Memory Key Binding

The authorization binding from one dedicated API key to exactly one active
Memory Namespace.

| Field | Description | Rules |
|---|---|---|
| `api_key_id` | Dedicated API key | Unique; a key cannot select several destinations. |
| `namespace_id` | Bound Memory Namespace | Required; route services derive the namespace from this field. |
| `agent_identity` | Client namespace label | Required, non-secret, immutable per binding; included in every record/capture lookup. |
| `created_at` | Binding time | Auditable through the API-key creation event. |
| `shared_by_owner` | Whether owner deliberately reused a namespace | Safe boolean for UI/audit; does not grant access by itself. |

The User Center creates a fresh namespace by default for a Memory provider key. Reusing an
existing namespace is an explicit owner action that creates another dedicated
key, not a client-side `shared=true` option.

### Agent Memory Record

A logical, destination-scoped record whose canonical content lives in a backing
page revision.

| Field | Description | Rules |
|---|---|---|
| `id` | Logical memory ID | Stable UUID returned to Hermes; never a page path. |
| `namespace_id` | Owning destination | Required; all reads/writes scope to this field. |
| `agent_identity` | Client namespace label | Required; all reads/writes and idempotency checks scope to this value. |
| `record_type` | `memory` or `evidence` | `memory` is explicit durable recall; `evidence` preserves original input. |
| `page_id` | Backing restricted Raw-space page | Required; shared Raw/page lifecycle is canonical. |
| `current_revision_id` | Latest backing revision | For an evidence conversation aggregate, advances after each accepted capture; for an explicit memory it remains the original revision. |
| `idempotency_key` | Caller digest/key | Required for save/evidence submission; unique with `namespace_id` and `agent_identity`. |
| `source_session_digest` | One-way bounded session correlation | Optional; never stores raw Hermes session ID or profile text. |
| `state` | `active` or `forgotten` | `forgotten` changes only Agent Memory recall eligibility; the Raw page remains unchanged. |
| `created_at`, `updated_at`, `forgotten_at` | Lifecycle timestamps | `forgotten_at` required for forgotten state. |

Constraints and indexes:

- Unique `(namespace_id, agent_identity, idempotency_key)` makes retries and overlap safe.
- Index `(namespace_id, state, updated_at)` serves destination-scoped listing
  and retrieval candidate lookup.
- A record's page/revision references must belong to the same owner and remain
  restricted. A missing, deleted, or inaccessible backing revision is treated as
  unavailable, never as a chance to read another page.
- A record's revisions are immutable after publication. A retry returns the
  existing capture/revision for the same idempotency key. A different accepted
  capture with the same session digest appends a new revision to the existing
  conversation page instead of creating another page or logical record.

### Agent Memory Evidence Link

A provenance relationship from a `memory` record to one or more supporting
`evidence` records.

| Field | Description | Rules |
|---|---|---|
| `memory_record_id` | Derived memory | Must reference `record_type=memory`. |
| `evidence_record_id` | Supporting original source | Must reference `record_type=evidence` in the same namespace. |
| `relation` | `explicit_save`, `automatic_capture`, or `checkpoint` | Explains why the evidence supports the memory. |
| `created_at` | Link creation time | Immutable provenance fact. |

The composite primary/unique key prevents duplicate evidence links. Forgetting a
memory excludes that memory projection from Agent Memory recall while retaining
the evidence link and immutable evidence page for audit/recovery. An active
evidence record remains independently recallable because it is canonical Raw
content; Hermes forget never mutates or deletes that source. A later
owner-controlled Raw retention/privacy workflow may remove source content
explicitly.

### Agent Memory Capture

| Field | Description | Rules |
|---|---|---|
| `agent_identity` | Client namespace label | Required and matches the bound key. |
| `payload_digest` | Digest of normalized capture input | Required for idempotency conflict detection; never stores evidence text. |
| `evidence_revision_id` | Exact Raw revision produced by this capture | Nullable for legacy rows; required when a capture is durable after this change, and remains stable even when the conversation receives later revisions. |
| `status`, `job_id`, `failure_code` | Queue/retry projection | Row-locked claims and conditional terminal updates prevent overlapping workers from regressing a durable capture. |

Constraints and indexes:

- Unique `(namespace_id, agent_identity, idempotency_key)` reserves one capture
  for a shared destination/agent namespace. This is intentionally destination-
  scoped rather than API-key-scoped: two owner-provisioned keys that share a
  destination must observe the same retry result instead of creating duplicate
  evidence.
- Index `(api_key_id)` supports binding/revocation checks, and index
  `(status, updated_at)` supports bounded worker retry/claim scans. The row lock
  and conditional status updates provide the concurrency guard in addition to
  the unique reservation.

`shared_by_owner` is an audit/UI marker only. `true` means the owner explicitly
  bound another dedicated key to an existing namespace; it does not grant a
  different user access, bypass the owner-role requirement, or allow a client to
  select a namespace. `false` is the default for a newly created private
  destination.

## Derived Retrieval State

The namespace-aware lexical recall adapter uses active `agent_memory_records`
(both `memory` and durable `evidence` records) as its allowed candidate set and
reads their current restricted Raw revisions. Queued or running captures are
not candidates until their Evidence Record is durable.
Each Raw write also enters the existing page/index reconciliation path, so the
same common search/index infrastructure can discover the content for authorized
Wiki users. The provider emits bounded excerpts and citations only after checking the
key binding and record state.

It is derived state, not a new canonical content table:

- a Raw page revision schedules the normal indexing/reconciliation path;
- a forgotten record removes its candidate eligibility;
- a repair/reindex operation can rebuild eligible candidates from active records
  and their current page revisions;
- semantic enrichment, if added later, receives the same allowed IDs and cannot
  silently expand visibility.

## API Key Creation Model

The User Center API-key flow gains a Memory provider option.

| Input / event | Result |
|---|---|
| Create private Memory provider key | Validate owner role; create API key with selected memory scopes; create new namespace and binding transactionally. |
| Create shared Memory provider key | Validate owner selects an existing owned namespace; create a separate API key and binding to that namespace transactionally. |
| Revoke key | Existing `revoked_at` takes effect on the next request; its binding cannot authenticate or reveal destination content. |
| Disable namespace | Existing bindings stay auditable but all provider routes reject it safely. |
| Delete/forget record | Service marks the Agent Memory record forgotten and excludes it from recall; the immutable Raw page/revision is retained. |

No key can edit its scopes or binding in place. Rotation uses a newly provisioned
key and binding, then revokes the old key after the provider is reconfigured.

## Capture Job State

Normal post-turn capture uses the existing pg-boss job lifecycle. The job payload
contains the bounded evidence submission only until the worker writes the normal
Evidence Record; no separate durable transcript body exists after completion.

The client-visible capture state is derived from the matching Record and job:

```text
received -> queued -> running -> durable
                  \-> failed | cancelled
```

- A second request with the same destination/idempotency key returns the same
  capture identity/status rather than enqueueing another write.
- `durable` means the Evidence Record, the capture's exact backing page
  revision, and record mapping committed. The record's current revision may
  advance later without changing this historical capture citation.
- A strict checkpoint may acknowledge only `durable`; `queued`, `running`,
  `failed`, or timeout must cause the active provider to fail closed.

## State Transitions

### Memory Namespace

```text
active -> disabled
```

Only an authorized owner-side management action may disable a namespace. There
is no provider endpoint to enable, create arbitrary destinations, or alter a
binding after authentication.

### Memory Record

```text
new explicit-save idempotency key -> active (one immutable Raw revision)
new evidence capture -> active (append one immutable revision to its session page)
active --forget--> forgotten (Raw page/revision unchanged)
forgotten --repeat forget--> forgotten (idempotent result)
```

Evidence Records remain `active` after an associated memory is forgotten so the
audit/provenance trail stays intact. They are not recall candidates unless a
future explicit evidence-recall policy enables them.
