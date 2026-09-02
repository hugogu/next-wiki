# Data Model: OpenClaw Memory Wiki Integration

**Feature**: [OpenClaw Memory Wiki Integration](./spec.md)
**Date**: 2026-08-29

## Design Principles

- A Memory Wiki Markdown body is canonical only as a restricted Raw page
  revision. No OpenClaw-specific table, scan journal, audit row, or API log
  stores a second durable body copy.
- An authenticated key determines the namespace, owner, and
  remote root on the server. The plugin supplies a source-relative path and
  content; it never selects an account, namespace, Raw page, or arbitrary
  next-wiki path.
- A changed source document produces a full immutable revision snapshot.
  `appendEntry` remains reserved for append-only evidence and is never used to
  concatenate successive versions of one Memory Wiki file.
- One connection key carries independent scopes. `memory.read`/`memory.write`
  govern Agent Memory operations, `view` governs search/page reads, and
  Raw/Generated grants remain an explicit space-access decision.
- File removal does not delete source data. Existing Raw retention, visibility,
  audit, and ordinary administrator lifecycle controls govern it.

## Existing Entities Reused

### API Key

`api_keys` remains the encrypted-secret, owner, scope, role, revocation, and
space-access authority. API key secrets are revealed only by the owner at
connection creation and then supplied to OpenClaw as SecretRefs.

The generic Agent Memory provider flow creates one bound key. Its capabilities
are additive; each endpoint checks only the scope it needs. OpenClaw, Hermes,
Pi, and future adapters differ only by `agentIdentity` and source/runtime
adapter:

| Agent Memory provider key | Scope/grant | Permitted feature calls |
| --- | --- | --- |
| Any adapter (for example OpenClaw) | `memory.read`, `memory.write`, `view`; independent `spaceAccess` | Agent Memory, source mirroring, account-wide search, and selected page reads |

The owner must be an active Admin to create the connection or to grant
Raw/Generated coverage. Rotation creates one replacement connection key with
the selected scopes; the old key is revoked after the replacement is verified.
A revoked/disabled key never resolves to a connection.

### Agent Memory Namespace

`agent_memory_namespaces` remains the owner-managed, durable destination. A
new Agent Memory provider connection creates one fresh namespace by default, with an
operator-visible display name. The namespace is also the server-derived root
for every mirrored document. It contains no vault filesystem path, query,
credential, or Markdown body.

### Page and Page Revision

Each mirrored document has one restricted Raw page in the existing Raw space.
The initial mirror creates a published Raw page, and every changed source
digest creates a new published revision with the complete new Markdown body.
The standard Raw lifecycle supplies source content storage, rendering,
metadata extraction, asset-reference processing, replication, index
reconciliation, page visibility, immutable history, and citations.

### Search and Page Read

The integration delegates search to `publicContent.searchPages` and source
read to `publicContent.getPageById`. The existing services enumerate only
readable spaces and re-check page visibility. The OpenClaw facade shapes and
bounds results; it does not store or index a second search corpus.

### Audit Entry

Existing API audit records use the `agent_memory` origin for Memory API routes.
They capture endpoint, key, status, duration, and safe correlation information.
They must not record Markdown, query text, source path, excerpt, document
title, vault path, owner label, response body, or credential.

## Changed Persistent Entities

### Agent Memory Key Binding

`agent_memory_key_bindings` continues to bind a key to exactly one namespace
and agent identity. Its existing **binding purpose** is retained as internal
compatibility metadata; new keys created through the generic provider flow
always use `memory_provider`, and route authorization is scope-based rather
than adapter- or purpose-specific.

| Field | Description | Validation |
| --- | --- | --- |
| `api_key_id` | Bound API key | Primary key; one purpose per key. |
| `namespace_id` | Owner-managed destination | Required; key owner and namespace owner must match. |
| `agent_identity` | Non-secret client identity | Required; each adapter supplies its own stable identity, such as `openclaw`, `hermes`, or `pi`. |
| `purpose` | `memory_provider`, `mirror`, or `knowledge_search` | Legacy metadata retained for compatibility; capability routes authorize by required scope. |
| `shared_by_owner` | Deliberate shared-destination marker | Existing field; cannot grant access by itself. |
| `created_at` | Binding timestamp | Auditable via key lifecycle. |

One active Agent Memory provider connection has one binding and one key. A key may carry
`memory.read`, `memory.write`, and `view` together; each route checks only the
scope it needs. Generic existing Memory provider routes continue to work with
`memory_provider` bindings, preserving Hermes and later adapters.

### Agent Memory Record — Source Document Extension

`agent_memory_records` remains the single generic Agent Memory-to-Wiki
relationship. It gains the `source_document` record type and does not add an
OpenClaw-specific document table.

For a `source_document` record:

| Existing field / Page capability | Source-document meaning |
| --- | --- |
| `namespace_id`, `agent_identity` | Server-bound owner and agent boundary, shared with Hermes and future adapters. |
| `record_type` | `source_document`, distinct from semantic `memory` and append-only `evidence`, so normal memory recall does not accidentally treat every mirrored file as an explicit memory. |
| `page_id` | The one restricted Raw Page representing the external logical document. |
| `current_revision_id` | The latest accepted full-file snapshot; it advances only when the accepted digest changes. |
| `idempotency_key` | Existing unique record key, generated by the service as a namespaced normalized source-path key for this record type. Per-delivery idempotency key/digest is retained in immutable Revision source metadata so an incompatible replay can be rejected without a new journal table. |
| `pages.path` | Server-derived normalized **storage path**, preserving the Memory Wiki hierarchy beneath the namespace root. |
| `pages.slug` and `page_addresses` | Independent reader address and aliases; they are not the filesystem path and may stay stable when storage organization changes. |
| `page_revisions.source_metadata` | Trusted per-version provenance: exact vault-relative `sourcePath` (including casing and `.md`), source digest, delivery key, optional source version, and provider identity. |

`pages` already has a unique storage-path constraint in its space, and
`agent_memory_records` already has a unique `page_id` relation. The snapshot
service derives the storage path from the authenticated namespace/identity and
validated source path, locks the Page/record during update, and rejects a
case/Unicode-normalization collision before it can point two external files at
one Page. The exact path is kept in immutable provenance because the existing
storage/address grammar intentionally cannot spell every valid filesystem name
such as `AGENTS.md` byte-for-byte.

## Derived and Ephemeral State

### Plugin Scan Journal

The plugin holds a small non-secret state file in its OpenClaw-managed data
directory. It is a recovery cache, not a source of truth.

| Field | Purpose |
| --- | --- |
| Connection fingerprint and schema version | Rejects state belonging to another configured connection. |
| Source path/collision key/digest | Skips unchanged files locally; the server-derived Page path and current Revision digest remain authoritative. |
| Last successful remote revision | Supports status and a precise retry explanation. |
| Attempt count, next retry, safe error code | Implements bounded full-jitter retry without preserving response bodies or Markdown. |
| Last scan and completed scan counters | Status-only operational visibility. |

The journal excludes full file content, excerpts, query text, key values,
vault contents outside eligible paths, and server error bodies. If it is lost,
the next full scan re-establishes convergence through server-side digest checks.

### Search Coverage

Search coverage is computed for each knowledge-search request from the current
key owner, role, `view` scope, writing mode, and explicit space access:

```text
{ wiki: boolean, raw: boolean, generated: boolean, complete: boolean }
```

It communicates that a valid zero-result search may not include every content
space, without reporting any inaccessible page metadata. It is not persisted.

## State Transitions

### Connection Lifecycle

```text
unprovisioned
  -> bound (one key bound to an active namespace)
  -> configured (the single SecretRef resolves in OpenClaw)
  -> active (first successful connection probe)
  -> degraded (key revoked, scope/role changes, or repeated safe failures)
  -> active (successful recheck/rotation)
  -> revoked (namespace disabled or key revoked / namespace disabled)
```

Only an owner-created binding may enter `bound`. `degraded` is a
plugin-local status, not a permission bypass; every route rechecks live keys
and namespace state.

### Document Mirror Lifecycle

```text
discovered
  -> stable (passes root/path/type/size/stability validation)
  -> created (first Raw page/revision and generic source-document record)
  -> unchanged (same accepted digest)
  -> updated (new full Raw revision and record current-revision advance)
  -> retrying (safe transport/transient failure)
  -> failed (validation, authorization, collision, or retry budget terminal state)
```

`created`, `unchanged`, and `updated` are durable terminal outcomes for the
specific digest. A later digest starts a new transition. A locally missing
source produces a status observation only; it never transitions a Raw page to
hard-deleted.

## Authorization Data Flow

| Operation | Required key/binding | Server-derived authority | Result |
| --- | --- | --- | --- |
| Probe/mirror document | Bound key + `memory.write` | Key owner, active namespace, identity, server-derived Page storage root | Content can create/advance only that generic source-document record/Page. |
| Search knowledge | Bound key + `view` | Key owner, current role, permitted spaces | Only readable page summaries/excerpts plus safe coverage. |
| Read selected result | Bound key + `view` | Same request context and page permission | Only readable bounded Markdown plus revision citation. |
| Rotate/revoke connection | Browser session of namespace owner | Owner and current Admin role | Reveals replacement once or immediately stops all calls. |

No route accepts a caller-selected account, namespace, destination root,
database page ID for mirror writes, or permission override. Route services must
reject a key that lacks the operation's required scope before reading/writing data.

## Migration and Retention Rules

- Edit `apps/web/src/server/db/schema/*.ts`, run `pnpm db:generate`, and commit
  the generated SQL, journal, and snapshot together. Never hand-author the
  migration files.
- Existing `agent_memory_key_bindings` rows receive the safe
  `memory_provider` purpose. No existing API key gains a new scope or
  Raw/Generated coverage.
- The migration creates only metadata/projection data. It does not migrate or
  copy any existing Raw body.
- Revocation, source disappearance, mirror replacement, and forgetting do not
  hard-delete page or revision content. Ordinary next-wiki retention and
  administrator controls remain the sole deletion mechanism.
