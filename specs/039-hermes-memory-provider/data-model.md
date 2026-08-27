# Data Model: Hermes Memory Provider

**Feature**: [Hermes Memory Provider](./spec.md)
**Date**: 2026-08-27

## Design Principles

- Wiki page and revision content is canonical. Hermes metadata must never become
  a second source of transcript or memory text.
- An authenticated Hermes key determines its Memory Destination on the server.
  The client-provided Hermes profile is diagnostic context only and cannot change
  authorization.
- A Memory Record has one current backing page/revision and may link to one or
  more Evidence Records. Every backing page uses normal history and reversible
  deletion semantics.
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

Each Memory Record and Evidence Record is backed by a normal restricted page and
its current revision. The page/revision retains canonical source Markdown/text,
rendered representation, content hash, author/actor attribution, created time,
and normal soft-delete behavior. The memory service always writes through the
existing page/revision service; it never writes page tables directly.

### API Audit Entry

Existing API audit rows record credential identity, endpoint, result, duration,
and safe error information. The audit origin adds `hermes`, with bounded
operation/correlation metadata only. It must never contain a secret, query,
profile label, transcript, memory body, or raw HTTP error body.

## New Persistent Entities

### Hermes Memory Namespace

An owner-managed, durable Memory Destination that defines the private record
collection used by a Hermes API key.

| Field | Description | Rules |
|---|---|---|
| `id` | Stable UUID destination identifier | Server-generated; never guessed from profile text. |
| `owner_user_id` | API-key owner | Required; must match each binding's key owner. |
| `display_name` | Owner-visible destination label | Bounded, non-secret; useful for API-key UI and safe diagnostics. |
| `state` | `active` or `disabled` | Disabled destinations reject recall and writes without revealing records. |
| `created_at`, `updated_at`, `disabled_at` | Lifecycle timestamps | `disabled_at` required when disabled. |

The namespace does not contain memory text, prompt text, session identifiers, or
a hard-coded Hermes-home path.

### Hermes Memory Key Binding

The authorization binding from one dedicated API key to exactly one active
Memory Namespace.

| Field | Description | Rules |
|---|---|---|
| `api_key_id` | Dedicated API key | Unique; a key cannot select several destinations. |
| `namespace_id` | Bound Memory Namespace | Required; route services derive the namespace from this field. |
| `created_at` | Binding time | Auditable through the API-key creation event. |
| `shared_by_owner` | Whether owner deliberately reused a namespace | Safe boolean for UI/audit; does not grant access by itself. |

The User Center creates a fresh namespace by default for a Hermes key. Reusing an
existing namespace is an explicit owner action that creates another dedicated
key, not a client-side `shared=true` option.

### Hermes Memory Record

A logical, destination-scoped record whose canonical content lives in a backing
page revision.

| Field | Description | Rules |
|---|---|---|
| `id` | Logical memory ID | Stable UUID returned to Hermes; never a page path. |
| `namespace_id` | Owning destination | Required; all reads/writes scope to this field. |
| `record_type` | `memory` or `evidence` | `memory` is explicit durable recall; `evidence` preserves original input. |
| `page_id` | Backing restricted Wiki page | Required; ordinary page lifecycle is canonical. |
| `current_revision_id` | Current backing revision | Updated only after successful normal revision save. |
| `idempotency_key` | Caller digest/key | Required for save/evidence submission; unique with `namespace_id`. |
| `source_session_digest` | One-way bounded session correlation | Optional; never stores raw Hermes session ID or profile text. |
| `state` | `active` or `forgotten` | `forgotten` follows successful soft deletion of its backing page. |
| `created_at`, `updated_at`, `forgotten_at` | Lifecycle timestamps | `forgotten_at` required for forgotten state. |

Constraints and indexes:

- Unique `(namespace_id, idempotency_key)` makes retries and overlap safe.
- Index `(namespace_id, state, updated_at)` serves destination-scoped listing
  and retrieval candidate lookup.
- A record's page/revision references must belong to the same owner and remain
  restricted. A missing, deleted, or inaccessible backing revision is treated as
  unavailable, never as a chance to read another page.
- Content updates create a new ordinary page revision then atomically update
  `current_revision_id`; metadata-only mapping changes do not create duplicate
  page snapshots.

### Hermes Memory Evidence Link

A provenance relationship from a `memory` record to one or more supporting
`evidence` records.

| Field | Description | Rules |
|---|---|---|
| `memory_record_id` | Derived memory | Must reference `record_type=memory`. |
| `evidence_record_id` | Supporting original source | Must reference `record_type=evidence` in the same namespace. |
| `relation` | `explicit_save`, `automatic_capture`, or `checkpoint` | Explains why the evidence supports the memory. |
| `created_at` | Link creation time | Immutable provenance fact. |

The composite primary/unique key prevents duplicate evidence links. Forgetting a
memory retains the evidence link and evidence page for audit/normal recovery;
the record is excluded from recall. A later privacy-deletion workflow can use
the existing reversible page lifecycle explicitly rather than silently erasing
evidence.

## Derived Retrieval State

The namespace-aware lexical recall adapter uses active `hermes_memory_records`
as its allowed candidate set and indexes their current restricted page revisions
through the existing registered full-text capability. It emits bounded excerpts
and citations only after checking the key binding and record state.

It is derived state, not a new canonical content table:

- a page revision save schedules the normal indexing/reconciliation path;
- a forgotten record removes its candidate eligibility;
- a repair/reindex operation can rebuild eligible candidates from active records
  and their current page revisions;
- semantic enrichment, if added later, receives the same allowed IDs and cannot
  silently expand visibility.

## API Key Creation Model

The User Center API-key flow gains a Hermes Memory option.

| Input / event | Result |
|---|---|
| Create private Hermes key | Validate owner role; create API key with selected memory scopes; create new namespace and binding transactionally. |
| Create shared Hermes key | Validate owner selects an existing owned namespace; create a separate API key and binding to that namespace transactionally. |
| Revoke key | Existing `revoked_at` takes effect on the next request; its binding cannot authenticate or reveal destination content. |
| Disable namespace | Existing bindings stay auditable but all provider routes reject it safely. |
| Delete/forget record | Service soft-deletes backing page, marks record forgotten, and excludes it from recall. |

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
- `durable` means the Evidence Record, backing page revision, and record mapping
  committed together.
- A strict checkpoint may acknowledge only `durable`; `queued`, `running`,
  `failed`, or timeout must cause the Hermes provider to fail closed.

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
new idempotency key -> active
active --save/upsert--> active (new backing page revision)
active --forget--> forgotten (backing page soft-deleted)
forgotten --repeat forget--> forgotten (idempotent result)
```

Evidence Records remain `active` after an associated memory is forgotten so the
audit/provenance trail stays intact. They are not recall candidates unless a
future explicit evidence-recall policy enables them.
