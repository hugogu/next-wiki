# Data Model: OpenClaw Memory Wiki Integration

**Feature**: [OpenClaw Memory Wiki Integration](./spec.md)
**Date**: 2026-08-29

## Design Principles

- A Memory Wiki Markdown body is canonical only as a restricted Raw page
  revision. No OpenClaw-specific table, scan journal, audit row, or API log
  stores a second durable body copy.
- An authenticated key determines the namespace, key purpose, owner, and
  remote root on the server. The plugin supplies a source-relative path and
  content; it never selects an account, namespace, Raw page, or arbitrary
  next-wiki path.
- A changed source document produces a full immutable revision snapshot.
  `appendEntry` remains reserved for append-only evidence and is never used to
  concatenate successive versions of one Memory Wiki file.
- Two connection keys have non-overlapping powers. The mirror key cannot read
  arbitrary account pages; the knowledge-search key cannot call memory write
  routes. Both must be tied to one owner-managed destination.
- File removal does not delete source data. Existing Raw retention, visibility,
  audit, and ordinary administrator lifecycle controls govern it.

## Existing Entities Reused

### API Key

`api_keys` remains the encrypted-secret, owner, scope, role, revocation, and
space-access authority. API key secrets are revealed only by the owner at
connection creation and then supplied to OpenClaw as SecretRefs.

The OpenClaw provisioner creates these two distinct keys atomically:

| Key purpose | Required scopes | Allowed space access | Permitted feature calls |
| --- | --- | --- | --- |
| `mirror` | `memory.read`, `memory.write` | Wiki only; no generic Raw/Generated read grant | connection probe and document snapshot upsert |
| `knowledge_search` | `view` | `wiki` plus owner-selected `raw` and/or `generated` | connection-bound search and source read |

The owner must be an active Admin to create the paired connection or to grant
Raw/Generated coverage. Rotation creates a replacement key of the same purpose
under the same namespace before revoking the old key; a revoked/disabled key
never resolves to a connection.

### Agent Memory Namespace

`agent_memory_namespaces` remains the owner-managed, durable destination. A
new OpenClaw connection creates one fresh namespace by default, with an
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
and agent identity. It gains a non-null **binding purpose** with a migration
default that preserves all existing integrations as `memory_provider`.

| Field | Description | Validation |
| --- | --- | --- |
| `api_key_id` | Bound API key | Primary key; one purpose per key. |
| `namespace_id` | Owner-managed destination | Required; key owner and namespace owner must match. |
| `agent_identity` | Non-secret client identity | Required; OpenClaw provisioner uses its fixed integration identity. |
| `purpose` | `memory_provider`, `mirror`, or `knowledge_search` | Existing rows migrate to `memory_provider`; a route accepts only its intended purpose. |
| `shared_by_owner` | Deliberate shared-destination marker | Existing field; cannot grant access by itself. |
| `created_at` | Binding timestamp | Auditable via key lifecycle. |

For one active OpenClaw connection, the server requires at least one `mirror`
and one `knowledge_search` binding with the same namespace and identity. A
knowledge-search binding without `view`, or a mirror binding lacking memory
write, is invalid. Generic existing Memory provider routes continue to require
`memory_provider` bindings, preserving their behavior for Hermes and later
adapters.

### Agent Memory Wiki Document

`agent_memory_wiki_documents` is a new source locator/provenance projection.
It identifies one logical Memory Wiki Markdown document, but never stores its
body.

| Field | Description | Validation and indexes |
| --- | --- | --- |
| `id` | Stable document UUID | Server generated. |
| `namespace_id` | Owning Memory namespace | Required foreign key; part of every lookup. |
| `agent_identity` | Bound OpenClaw identity | Required; prevents accidental cross-client merging. |
| `source_path` | Exact original vault-relative `.md` path | Required; preserved casing and suffix; no absolute/traversal/hidden-runtime path. |
| `source_path_key` | Server-normalized collision key | Required; detects case/Unicode/path-projection collisions per namespace and identity. |
| `remote_path` | Server-derived Raw page path | Required; no client control; unique within namespace and identity. |
| `page_id` | Backing Raw page | Required unique foreign key. |
| `current_revision_id` | Latest full-file snapshot revision | Required foreign key; advances only on changed source digest. |
| `source_digest` | SHA-256 digest of accepted Markdown body | Required fixed-format value; exact same digest returns `unchanged`. |
| `source_version` | Optional bounded non-secret source version hint | Diagnostic/idempotency context only; never replaces digest authority. |
| `created_at`, `updated_at`, `last_synced_at` | Lifecycle timestamps | `last_synced_at` advances only after a durable Raw revision/no-op match. |

Constraints and indexes:

- unique `(namespace_id, agent_identity, source_path_key)`;
- unique `(namespace_id, agent_identity, remote_path)`;
- unique `page_id`;
- index `(namespace_id, agent_identity, updated_at)` for connection status and
  lookup;
- updates lock the locator row so overlapping scans can create at most one
  changed revision for one accepted digest.

The exact `source_path` and immutable revision metadata let the reader/citation
surface explain the original Memory Wiki structure even where next-wiki's
normal path grammar requires an escaped/normalized `remote_path`.

## Derived and Ephemeral State

### Plugin Scan Journal

The plugin holds a small non-secret state file in its OpenClaw-managed data
directory. It is a recovery cache, not a source of truth.

| Field | Purpose |
| --- | --- |
| Connection fingerprint and schema version | Rejects state belonging to another configured connection. |
| Source path/collision key/digest | Skips unchanged files locally; server digest remains authoritative. |
| Last successful remote revision | Supports status and a precise retry explanation. |
| Attempt count, next retry, safe error code | Implements bounded full-jitter retry without preserving response bodies or Markdown. |
| Last scan and completed scan counters | Status-only operational visibility. |

The journal excludes full file content, excerpts, query text, key values,
vault contents outside eligible paths, and server error bodies. If it is lost,
the next full scan re-establishes convergence through server-side digest checks.

### Search Coverage

Search coverage is computed for each knowledge-search request from the current
key owner, role, binding purpose, writing mode, and explicit space access:

```text
{ wiki: boolean, raw: boolean, generated: boolean, complete: boolean }
```

It communicates that a valid zero-result search may not include every content
space, without reporting any inaccessible page metadata. It is not persisted.

## State Transitions

### Connection Lifecycle

```text
unprovisioned
  -> paired (both keys bound to same active namespace)
  -> configured (both SecretRefs resolve in OpenClaw)
  -> active (first successful connection probe)
  -> degraded (one key revoked, scope/role changes, or repeated safe failures)
  -> active (successful recheck/rotation)
  -> revoked (namespace disabled or both bindings revoked)
```

Only an owner-created paired binding may enter `paired`. `degraded` is a
plugin-local status, not a permission bypass; every route rechecks live keys
and namespace state.

### Document Mirror Lifecycle

```text
discovered
  -> stable (passes root/path/type/size/stability validation)
  -> created (first Raw page/revision and locator)
  -> unchanged (same accepted digest)
  -> updated (new full Raw revision and locator advance)
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
| Probe/mirror document | Mirror key + `mirror` binding | Key owner, active namespace, identity, remote root | Content can create/advance only that document projection. |
| Search knowledge | Knowledge key + `knowledge_search` binding | Key owner, current role, permitted spaces | Only readable page summaries/excerpts plus safe coverage. |
| Read selected result | Knowledge key + `knowledge_search` binding | Same request context and page permission | Only readable bounded Markdown plus revision citation. |
| Rotate/revoke pair | Browser session of namespace owner | Owner and current Admin role | Reveals replacement once or immediately stops next calls. |

No route accepts a caller-selected account, namespace, destination root,
database page ID for mirror writes, or permission override. Route services must
reject a key with the wrong binding purpose before reading/writing data.

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
