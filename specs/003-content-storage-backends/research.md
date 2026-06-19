# Research: Pluggable Content Storage & In-Editor Images

**Feature**: 003-content-storage-backends
**Date**: 2026-06-19
**Phase**: 0 (Outline & Research)

This document resolves the technical unknowns implied by the spec and records the
decisions that the plan, data model, and contracts build on. All spec
`[NEEDS CLARIFICATION]` markers were already resolved in the spec's Clarifications
section (Git = one-way export target; migration = brief read-only window). The
research below covers the remaining technical choices.

---

## R1 — ContentStore abstraction (剥离 ContentStore)

**Decision**: Introduce a single server-side `ContentStore` interface with one
implementation per backend, registered in an explicit bounded registry
(`src/server/content-store/registry.ts`). The interface addresses two asset
kinds by stable, backend-agnostic keys:

- **Markdown source**, keyed by `revisionId`.
- **Image asset**, keyed by `assetId` (a UUID).

Interface (conceptual):

```
putMarkdown(revisionId, source: string): Promise<void>
getMarkdown(revisionId): Promise<string>
putImage(assetId, bytes: Buffer, contentType): Promise<void>
getImage(assetId): Promise<{ bytes: Buffer; contentType: string }>
deleteImage(assetId): Promise<void>
listKeys(): AsyncIterable<AssetKey>   // for migration enumeration
healthCheck(): Promise<Result>
```

**Rationale**: Decoupling at an interface (not a table) keeps page, revision, and
permission models untouched (FR-006, FR-010) and satisfies constitution P3
(rendering stays separate from storage) and P9 (explicit registry, no filesystem
discovery). Keying markdown by `revisionId` avoids a risky backfill: the Database
implementation reads/writes the existing `page_revisions.content_source` column,
so existing content needs no data move to adopt the abstraction.

**Alternatives considered**:
- *Move all markdown into a generic `content_blobs(bytea)` table immediately* —
  rejected: forces a destructive backfill of every revision and rewrites every
  `content_source` read for zero behavioral gain while the DB backend is active.
- *Per-call backend branching in services* — rejected: scatters storage logic,
  violates P9's single-registry intent, and makes migration untestable.

---

## R2 — What stays in PostgreSQL vs. moves to the backend

**Decision**: Only raw bytes move. The database always retains: revision
metadata, `content_html` (derived), `content_hash` (the markdown fingerprint),
permissions, the page tree, image asset records (`content_assets`), and image
references (`content_asset_refs`). When the active backend is Database, image
bytes live in a new `content_blobs` table and markdown stays in
`page_revisions.content_source`. When the active backend is Local or S3, image
bytes and markdown bytes live there; `content_source` becomes nullable and is
read through the store.

**Rationale**: Preserves P7 (version everything — fingerprints and revision rows
stay queryable) and P3 (HTML is derived, never canonical). Fingerprints in the DB
make migration verification a pure metadata comparison.

**Alternatives considered**: Storing rendered HTML in the backend too — rejected:
HTML is derived (anti-pattern: "editor format stored as rendered HTML" applies to
canonical storage; derived HTML belongs with the queryable metadata for fast
reads and would otherwise force a backend round-trip on every page view).

---

## R3 — Image references inside Markdown (portability + privacy)

**Decision**: Uploaded images are referenced in Markdown as app-relative URLs
`![alt](/api/assets/{assetId})`, never as backend paths or signed S3 URLs. The
`/api/assets/{assetId}` route resolves the asset's referencing page(s), runs the
same `read` permission check as the page, and streams bytes from the active
backend.

**Rationale**: Backend-agnostic references (FR-004) mean switching backends never
rewrites page content. Routing image reads through the app (FR-005) enforces
per-page permissions — an S3 object is never exposed via a public/guessable URL.
The existing `rehype-sanitize` default schema already permits `<img>` with
relative `src`, so no sanitizer change is needed for app-relative URLs.

**Alternatives considered**:
- *Direct S3 public URLs / presigned URLs in Markdown* — rejected: leaks content
  past the permission layer and bakes backend identity into page source, breaking
  portability and migration.

---

## R4 — Background jobs: introduce pg-boss

**Decision**: Adopt **pg-boss** (the constitution's mandated job queue) for the
two heavy operations this feature adds: (1) the storage **migration** job and
(2) the optional **Git export** job. pg-boss runs entirely inside the existing
PostgreSQL database (its own schema), requires no extra service, and the worker
runs **in-process** inside the Next.js Node server, started once at boot via an
explicit bootstrap module.

**Rationale**: P6 mandates pg-boss for any operation that may exceed 500ms
(migration copies the whole corpus; `git push` is network I/O). pg-boss keeps P1
intact (no Redis/queue service — it lives in PostgreSQL). Running the worker
in-process keeps the deployment at one container for the small-team default; the
constitution permits a separate worker container later using the same image
without code change (P1 "MAY run separate app and worker containers").

**Alternatives considered**:
- *Ad-hoc `setImmediate`/in-memory background task* — rejected: loses jobs on
  restart (violates FR-022 resumability) and contradicts P6's explicit pg-boss
  mandate.
- *Separate worker container now* — deferred: unnecessary for single-instance
  scale; the in-process worker is the simpler default and upgrades cleanly.

---

## R5 — Safe migration protocol (copy → verify → cutover)

**Decision**: A migration is a pg-boss job with an explicit state machine recorded
in a `content_migrations` row: `pending → copying → verifying → completed`
(or `failed` / `aborted`). Protocol:

1. **Guard**: reject if another migration is `pending/copying/verifying`
   (single-flight, FR-020). If the target already contains data, require an
   explicit `confirmOverwrite` flag (FR-020).
2. **Read-only window**: the pending migration row is created in the same
   transaction as the single-flight check and immediately acts as the global
   write lock — page saves, publishes, and image uploads return a localized
   "storage migrating, read-only" error; reads are unaffected (FR-019). The lock
   therefore starts before the worker is scheduled, leaving no acceptance/startup
   race.
3. **Copy**: enumerate all markdown assets (every revision) and image assets
   (`content_assets`) from the source backend; write each to the target. Progress
   counters (`total_items`, `copied_items`) update incrementally — no single long
   DB transaction (Edge Cases).
4. **Verify**: re-read each item from the target and compare its fingerprint to
   the DB-stored `content_hash` (markdown) / `content_assets.content_hash`
   (images), plus a count check (FR-018).
5. **Abort/cutover**: abort records `abort_requested`; the worker checks it before
   every item, before verification, and immediately before cutover. Only on 100%
   verification does a conditional transaction confirm
   `status='verifying' AND abort_requested=false`, flip
   `storage_backends.is_active`, and mark the migration completed. A failed guard
   rolls back and records `aborted`. On any other failure, leave the original
   active, retain everything, record `error_message`, and release the lock
   (FR-018, FR-018a, FR-021).
6. **Source retention**: the previous backend's bytes are never auto-deleted.
   A separately confirmed pg-boss cleanup job may delete them later, but refuses
   the active backend or a backend participating in an active migration
   (FR-021).

**Resumability**: on boot, a migration left in `copying`/`verifying` by a crash is
re-queued; copy/verify are idempotent (content-addressed writes), so re-running is
safe and never cuts over a partial target (FR-022).

**Rationale**: Verify-before-cutover with DB-side fingerprints gives the SC-004
"no loss/corruption" guarantee cheaply. The read-only window (confirmed
clarification) removes the need to track in-flight writes, the simplest correct
design at this scale.

---

## R6 — Git one-way export

**Decision**: Git is **not** a selectable primary backend. It is an optional,
independently-enabled export target (`storage_backends` row with
`purpose = 'git_export'`). Every successful publish, page deletion, or page path
change enqueues/coalesces a pg-boss `git-export` trigger. Enabling/re-enabling
export triggers a full backfill. A serialized worker materializes the complete
current published state: standard Markdown + frontmatter, referenced images,
removal of deleted/renamed paths, and pruning of stale assets. The configured
branch is system-owned. Non-fast-forward divergence is overwritten with
force-with-lease and surfaced as an admin warning; the system never merges or
imports external changes.

**Library**: use **`isomorphic-git`** with the Node `fs` and an HTTP client — pure
JS, no native build, works in the Alpine Docker image, supports clone/commit/push
over HTTPS with a token. (Alternative `simple-git` shells out to a `git` binary
that is not in the runtime image; rejected to avoid adding a system dependency.)

**Rationale**: Matches the constitution's "Git Storage Sync" mandate (optional,
async pg-boss job, DB stays source of truth) and the confirmed clarification
(export for GitHub Pages-style workflows). Export failures are recorded on the job
and retried; they never block the page save (FR-009 edge case).

**Alternatives considered**:
- *Two-way Git sync* — explicitly out of scope and blocked by the mandate until a
  conflict model is specified.

---

## R7 — Backend secret encryption & configuration

**Decision**: Reuse the existing `encryptKey`/`decryptKey` (AES-256-GCM,
`API_KEY_ENCRYPTION_KEY`) from `src/server/crypto/key-encryption.ts` to encrypt
backend secrets (S3 access/secret keys, Git token) before storing them in
`storage_backends.secret_encrypted`. Non-secret config (S3 endpoint/bucket/region,
local base path, git remote/branch) lives in a `config` JSONB column. Secrets are
never returned to the client (write-only fields; the API returns a boolean
"configured" indicator).

**Rationale**: No new secret store or env var (P1); consistent with the 002
encrypted-settings approach (FR-014, spec A9). The encryption key already exists
in the deployment.

**Local filesystem note**: selecting the Local backend requires a writable base
directory; in Docker this is a bind/named volume mounted into the web container.
This is documented in quickstart and is only needed when Local is chosen — it does
not affect the default DB deployment (P1).

---

## R8 — In-editor image insertion (CodeMirror 6)

**Decision**: Extend `SplitMarkdownEditor` with (a) a toolbar "image" button
opening a file picker and (b) a `paste`/`drop` handler on the `EditorView` that
detects image blobs. Both call `POST /api/assets` (multipart), receive
`{ id, url }`, and insert `![](url)` at the selection via a CodeMirror transaction.
Upload validation (size, mime) happens server-side; the client shows a localized
error toast on rejection and inserts nothing (FR-003).

**Rationale**: Keeps the editor's "serialize to raw Markdown only" contract
(Editor Extensibility mandate) — the AST never leaves the browser; only an image
reference string is inserted. No WYSIWYG image widget is added to the client
bundle.

**Alternatives considered**: Base64-inlining images into Markdown — rejected:
bloats revisions, defeats the storage abstraction, and breaks reuse/dedup.

---

## R9 — New permission scopes & actions

**Decision**: Add `storage` and `preferences` to the `api_key_scope` enum
(DB + shared Zod). Add two `Action`s to the permission model: `manage_storage`
(storage config + migration) and `manage_preferences` (read/write own display
preferences). Wire the scope→action map and `roleAllows`:

| New scope | Maps to action | Role rule (`roleAllows`) |
|---|---|---|
| `storage` | `manage_storage` | admin only |
| `preferences` | `manage_preferences` | any authenticated user (self) |

Add Resource kinds `{ kind: 'storage' }` and `{ kind: 'preferences' }`. Session
(`user`) actors keep current behavior: an admin may manage storage; any signed-in
user may manage their own preferences. API-key actors additionally require the
matching scope (scope ∩ role, FR-024). `manage_storage` for a non-admin key →
denied by role even with the scope.

**Rationale**: Mirrors the proven 002 scope-intersection design exactly
(`scopeToActions` + `roleAllows` in `permissions/index.ts`), so enforcement is one
chokepoint and fully unit-testable. No admin bypass.

---

## R10 — Image lifecycle & orphan handling

**Decision**: Track references in `content_asset_refs(asset_id, revision_id)`,
populated on save by parsing the saved Markdown for `/api/assets/{id}` URLs. An
image is "orphaned" only when no non-deleted revision references it. Orphans are
**not** hard-deleted on edit (P7 soft-delete spirit); a conservative, bounded
cleanup (manual admin action or a future scheduled job) reclaims true orphans.
Deleting a page (soft delete) never deletes shared images still referenced
elsewhere (Edge Cases).

`content_assets.created_by` records the original uploader with `ON DELETE SET
NULL`. It grants temporary read access only while the upload has no saved
reference and is within a configurable TTL (default 24h). Cross-user hash
deduplication is intentionally not performed because reusing an ID already tied
to a private page creates ambiguous preview authorization.

**Rationale**: Reference-aware lifecycle prevents the classic "deleted image that
another page still uses" data loss, and aligns with version-everything.

---

## R11 — Cross-store save atomicity

**Decision**: For Local/S3, generate the revision or asset UUID, write and confirm
the external object first, then commit the DB metadata row. External failure
creates no row. DB failure triggers best-effort object deletion; failed
compensation leaves an unreferenced object that a bounded, grace-period cleanup
can safely remove by comparing store keys with DB rows. DatabaseStore keeps bytes
and metadata in one DB transaction. Puts are idempotent by key.

**Rationale**: PostgreSQL and object storage cannot share a transaction. This
ordering guarantees that no committed revision points to missing bytes; the only
possible partial result is an unreachable orphan.

---

## R12 — Image type safety

**Decision**: Accept PNG, JPEG, GIF, and WebP after magic-number validation. SVG
is excluded in this slice. Backend-failure placeholders are application-owned
static image bytes, not user uploads.

**Rationale**: A user-controlled SVG served from the application origin may carry
active content when directly navigated to. Supporting SVG safely requires a
separate sanitization and origin-isolation design.

---

## Summary of new dependencies

| Dependency | Purpose | P1 impact |
|---|---|---|
| `pg-boss` | Job queue for migration + Git export (P6) | None — runs inside PostgreSQL, no new service |
| `@aws-sdk/client-s3` | S3-compatible backend (optional) | None — only used when S3 selected |
| `isomorphic-git` | Git one-way export (optional) | None — pure JS, no native/system git, only used when Git enabled |

No new **required** runtime service or env var. The default deployment remains
PostgreSQL-only with content in the database (P1, SC-002).
