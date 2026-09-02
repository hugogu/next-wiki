# Research: OpenClaw Memory Wiki Integration

**Feature**: [OpenClaw Memory Wiki Integration](./spec.md)
**Date**: 2026-08-29

## 1. Native OpenClaw Plugin with a Bundled Skill

**Decision**: Publish `@next-wiki/openclaw-memory-wiki` as a native TypeScript
ESM OpenClaw plugin. Its manifest declares an on-startup runtime, configuration
schema, SecretRef inputs, explicit tools, and `skills/next-wiki/SKILL.md` as a
bundled Skill. The released runtime entry points at compiled JavaScript, not
TypeScript source.

**Rationale**: A Skill teaches an agent how to use a capability but cannot run
the vault scanner, register tools, reconcile retries, or validate connection
state. OpenClaw's external plugin model supports all of those capabilities
without changing OpenClaw core; the manifest makes package ownership and tool
availability inspectable before runtime activation.

**Alternatives considered**:

- A standalone copied Skill: rejected because it cannot persist captured
  Markdown or guarantee a discoverable, versioned tool implementation.
- Extend `packages/mcp-server`: rejected because it is a general stdio MCP
  adapter, not an OpenClaw lifecycle plugin, and would require an unnecessary
  child process.
- A bundled OpenClaw-core extension: rejected because this project must remain
  independently installable and updatable.

**Sources**: [OpenClaw Building plugins](https://docs.openclaw.ai/plugins/building-plugins),
[Plugin manifest](https://docs.openclaw.ai/plugins/manifest),
[Creating skills](https://docs.openclaw.ai/tools/creating-skills), and
`packages/mcp-server/package.json`.

## 2. Polling Is the Durable Memory Wiki Synchronization Mechanism

**Decision**: Start a root-confined background scan when the Gateway starts,
perform a full inventory immediately, then repeat bounded incremental scans.
Use a manual sync tool and safe status report. An OpenClaw hook such as
`after_tool_call` may request an earlier scan after `wiki_apply`, but scanning
remains the source of truth.

**Rationale**: `memory-wiki` is an adjacent compiled knowledge layer; it does
not expose a stable public event for every file write or completed compile.
CLI commands, compile jobs, human edits, restore, and restart may all change
the vault without a tool hook. Hash reconciliation after a stability window is
recoverable across those paths and does not require modifying OpenClaw core or
the Memory Wiki plugin.

**Alternatives considered**:

- Depend only on a tool hook: rejected because it misses non-tool writes and
  has no durable outbox guarantee.
- Watch the filesystem as the only input: rejected because watchers are
  platform/restart-sensitive and do not prove all writes were observed.
- Modify Memory Wiki to emit a new callback: rejected because it couples this
  separately published plugin to OpenClaw core changes.

**Sources**: [Memory Wiki](https://docs.openclaw.ai/plugins/memory-wiki),
[Plugin hooks](https://docs.openclaw.ai/plugins/hooks), and the current
[Memory Wiki entry](https://raw.githubusercontent.com/openclaw/openclaw/main/extensions/memory-wiki/index.ts).

## 3. Mirror Only Stable, Eligible Markdown

**Decision**: A scanner accepts only stable UTF-8 `.md` files beneath the
configured vault root. It includes root documents and normal Memory Wiki areas
(`inbox`, `entities`, `concepts`, `syntheses`, `sources`, `reports`, `_views`),
but excludes `_attachments`, `.openclaw-wiki`, symlinks, traversal paths, and
all non-Markdown files. It sends exact source path and body plus a SHA-256
digest; content is reread or restatted before transmission if a write may still
be in progress.

**Rationale**: This preserves the documented navigable Markdown knowledge tree
while avoiding attachment transfer, local runtime state, cache/secret leakage,
and paths outside an operator-approved root. A content digest makes initial
imports, periodic scans, retry, and restarts idempotent without storing file
bodies in a local queue.

**Alternatives considered**:

- Mirror every filesystem entry: rejected because attachment/state files have
  different content and privacy semantics.
- Normalize or reconstruct Markdown before upload: rejected because the
  original body, frontmatter, links, claims, and human blocks are source
  evidence.
- Rely on path alone for change detection: rejected because it cannot detect
  content updates or make retries safe.

**Sources**: [Memory Wiki vault layout](https://docs.openclaw.ai/plugins/memory-wiki)
and `packages/shared/src/pages.ts` path grammar.

## 4. Extend the Existing Agent Memory Record with Generic Source Documents

**Decision**: Add `source_document` as a generic `agent_memory_records` type
and expose a bounded snapshot upsert under `/api/v1/memory/wiki/`. A source
document continues to use the existing
`agent_memory_records → pages → page_revisions` relationship; it does not get
an OpenClaw-specific locator table. The route writes one full Markdown snapshot
through a trusted Raw writer and advances both the record's
`current_revision_id` and the Page's `current_published_version_id`. The route
is synchronous per bounded document; the OpenClaw background service controls
scan concurrency and retry.

**Rationale**: `pages.path` is already the internal storage tree and is
independent of the Page's reader-facing `slug` and aliases. `page_revisions`
already supplies immutable history, while the current published Revision is
what the normal search/index queries join. The existing Agent Memory record is
already the generic namespace/identity-to-Page relation used by Hermes, so
extending its record type avoids a parallel OpenClaw relationship and makes the
same source-document mechanism available to future agents. What is genuinely
missing is a complete-snapshot Raw write: `appendEntry` concatenates evidence
and cannot represent the current contents of a mutable external file.

**Alternatives considered**:

- Put every file through the existing `POST /memory/records` behavior without
  extension: rejected because it models explicit semantic memories and
  idempotent creates, not named source-document snapshots. The implementation
  reuses its record/Page relationship but adds the distinct generic
  `source_document` lifecycle, excluded from normal memory recall by default.
- Use append-only Raw entries: rejected because a changed file would contain
  multiple concatenated snapshots instead of its original current Markdown.
- Store files in a dedicated table/blob store: rejected because it duplicates
  source content outside the revision and indexing lifecycle.
- Add one job per document: deferred because a bounded document upsert is
  simpler and the plugin already performs serialized background work. Any
  future server batch job must use `runWithoutDataCache`.

**Local evidence**: `apps/web/src/server/services/agent-memory.ts`,
`apps/web/src/server/services/raw-entries.ts`,
`apps/web/app/api/v1/memory/`, and
`apps/web/src/server/jobs/agent-memory-capture.ts`.

## 5. Reuse Page Storage Paths and Independent Addresses

**Decision**: Use `pages.path` as the server-derived Raw **storage path** for
the Memory Wiki hierarchy, and use the existing independent `pages.slug` /
`page_addresses` model for reader addresses and aliases. Retain the exact
original vault-relative `.md` path, source digest, delivery idempotency key,
and optional source version in each immutable Revision's trusted
`source_metadata`; do not duplicate them in a mirror table. Extend the generic
Raw writer to accept a server-selected slug/address so nested source documents
with equal leaf names do not collide.

**Rationale**: next-wiki intentionally separates storage organization from
public addressing. This lets a mirrored tree use the Page's normal storage
model and lets a future rename retain a stable reader address rather than
requiring another mapping model. The common path/address grammar still rejects
uppercase letters and periods, whereas Memory Wiki includes files such as
`AGENTS.md` and `WIKI.md`; therefore the storage path is normalized by the
server while immutable provenance preserves the byte-exact source path. A
normalized case-fold check rejects ambiguous filesystem paths before they
collide remotely.

**Alternatives considered**:

- Relax the global next-wiki path grammar: rejected because it changes all
  page routing and does not belong to this integration.
- Use opaque hashes only: rejected because operators need a navigable Page
  storage tree.
- Trust a remote path supplied by the plugin: rejected because it would permit
  collisions and make the destination a client-side authorization boundary.

**Local evidence**: `packages/shared/src/pages.ts`,
`apps/web/src/server/services/agent-memory.ts`, and
`apps/web/src/server/services/raw-entries.ts`.

## 6. One Generic Agent Memory Provider Key Covers Each Connection

**Decision**: Reuse the generic Agent Memory provider API-key flow for every
agent connection. Each connection is one SecretRef-backed API key bound to one
owner-managed Agent Memory namespace. The adapter identity is data on the
binding, not a new key type or provisioning endpoint. Ordinary scopes are
independent capabilities on that key:

- `memory.read` / `memory.write` control Agent Memory and Memory Wiki snapshots;
- `view` controls next-wiki search and selected page reads;
- `spaceAccess` independently grants Wiki, Raw, and/or Generated coverage.

The server derives the owner, namespace, and agent identity from the binding and
checks the required scope on every endpoint. The setup flow reveals one key once;
the plugin passes it through one manifest-declared SecretRef.

**Rationale**: A connection is the natural lifecycle and rotation unit. Splitting
one connection into keys by endpoint created needless provisioning, storage,
configuration, and rotation work. Existing API-key policy already models each
capability as a scope, while `spaceAccess` safely narrows content visibility.
One bound key preserves least privilege as long as routes check their required
scope and never trust client-supplied destinations.

**Alternatives considered**:

- Two keys per connection: rejected because it couples one lifecycle to two
  secrets and prevents a coherent scope grant/revocation decision.
- An OpenClaw-specific key type or `/api/api-keys/openclaw` endpoint: rejected
  because every future agent (for example Pi) would require another special
  schema, route, UI branch, and lifecycle. The existing generic
  `memoryProvider` input already carries the agent identity and supports the
  same composable scopes.
- One unscoped Admin key: rejected because it bypasses destination binding and
  exposes unrelated account operations.
- Use the existing public search route directly from any key: rejected because
  it cannot prove the key is bound to an Agent Memory destination or report safe
  space coverage.

**Local evidence**: `apps/web/src/server/services/api-keys.ts`,
`apps/web/src/server/permissions/agent-memory.ts`,
`packages/shared/src/api-keys.ts`, and
`apps/web/src/server/services/public-content.ts`.

## 7. Reuse Permission-Safe Search and Page Reads

**Decision**: Add a connection-bound search facade and source-read facade that
authenticate the same bound key with `view`, then delegate to
`publicContent.searchPages` and `getPageById`. Return page-space coverage and
result citations; do not create a new index, query language, or unfiltered
content read path.

**Rationale**: The existing search coordinator already fans out across every
space an API-key actor may read, ranks results, creates safe excerpts, and
rechecks visibility before a page body is returned. The facade adds only
connection binding and a content-free coverage indicator, satisfying the Skill
requirement without revealing inaccessible titles, paths, or excerpts.

**Alternatives considered**:

- Build a second plugin-specific search index: rejected because it duplicates
  ranking, permissions, and operational state.
- Use the hybrid search POST resource: rejected because it writes analytics
  and needs UI session identifiers; the Skill needs an on-demand read.
- Add whole-account content to every prompt: rejected because it wastes
  context, increases disclosure, and conflicts with the on-demand design.

**Local evidence**: `apps/web/src/server/services/public-content.ts`,
`apps/web/app/api/v1/search/pages/route.ts`, and
`packages/mcp-server/src/tools/search-wiki.ts`.

## 8. In-Product Guidance, Package Proof, and Release

**Decision**: Add a separate marker-owned `integrations/openclaw` sample page
and links from the existing welcome and main-features pages; retain the Hermes
guide. Package CI builds a tarball, installs it into a clean OpenClaw host,
inspects the runtime, verifies bundled Skill discovery, and exercises a Docker
Compose next-wiki fixture. A tag-triggered npm provenance workflow publishes
the package; ClawHub publication is a controlled manual release action until
the project has an approved organization/token.

**Rationale**: Existing sample-page behavior already protects user-authored
content and correctly publishes/cache-invalidates managed pages. Tarball
installation catches missing runtime dependencies and source-only entry points
that workspace tests cannot. A dedicated release path keeps the external plugin
version independent of the MCP package and Wiki image.

**Alternatives considered**:

- Replace `integrations/hermes`: rejected because Hermes and OpenClaw are
  separate integrations with different installation/configuration flows.
- Test only source checkout installation: rejected because it misses the
  package layout users receive.
- Publish only from npm without an OpenClaw runtime check: rejected because a
  valid npm package can still have an invalid plugin manifest or dependency
  graph.

**Sources**: [OpenClaw plugin packaging](https://docs.openclaw.ai/plugins/building-plugins),
[OpenClaw plugin testing](https://docs.openclaw.ai/plugins/sdk-testing),
`apps/web/src/server/services/setup-sample-pages.ts`,
`.github/workflows/publish-mcp-server.yml`, and
`.github/workflows/publish-hermes-memory-provider.yml`.
