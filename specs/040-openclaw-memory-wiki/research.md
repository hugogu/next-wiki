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

## 4. Extend Agent Memory with a Path-Aware Snapshot Service

**Decision**: Add a generic, path-aware Agent Memory document-mirror service
under `/api/v1/memory/wiki/`. It persists one full Markdown snapshot through a
trusted Raw writer and records only a locator/provenance projection. The route
is synchronous per bounded document; the OpenClaw background service controls
scan concurrency and retry.

**Rationale**: Existing `records` and `evidence` operations model explicit
memories and append-only conversations. Their server-derived hashed paths and
`appendEntry` behavior cannot faithfully represent the latest full contents of
a named file. A bounded upsert permits a complete latest-file revision while
retaining every prior Raw revision. It adds no new deployment component and
keeps network retry at the client boundary where the source vault exists.

**Alternatives considered**:

- Put every file into `POST /memory/records`: rejected because it overloads
  explicit-memory semantics, cannot preserve source paths, and pollutes memory
  recall.
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

## 5. Preserve Source Paths Separately from Raw UI Paths

**Decision**: Store the exact original vault-relative `.md` path in the mirror
document projection and Raw provenance. Generate a separate stable, reversible
Raw path from the server-bound namespace/identity plus normalized source
segments; remove the `.md` presentation suffix where appropriate and retain the
original path for display/citation.

**Rationale**: next-wiki's page path grammar intentionally rejects uppercase
letters and periods, whereas Memory Wiki includes files such as `AGENTS.md` and
`WIKI.md`. Server projection preserves the logical tree without relying on a
client-selected path or weakening common path validation. A normalized
case-fold key detects ambiguous filesystem paths before they collide remotely.

**Alternatives considered**:

- Relax the global next-wiki path grammar: rejected because it changes all
  page routing and does not belong to this integration.
- Use opaque hashes only: rejected because operators need a navigable remote
  tree.
- Trust a remote path supplied by the plugin: rejected because it would permit
  collisions and make the destination a client-side authorization boundary.

**Local evidence**: `packages/shared/src/pages.ts`,
`apps/web/src/server/services/agent-memory.ts`, and
`apps/web/src/server/services/raw-entries.ts`.

## 6. Paired Keys Preserve Both Memory and Account-Wide Search Boundaries

**Decision**: Provision an OpenClaw connection as two SecretRef-backed keys
bound to one owner-managed Agent Memory namespace:

- the **mirror key** has only `memory.read` and `memory.write`, and can call
  connection/document mirror resources;
- the **knowledge-search key** has `view` plus explicit `wiki`, `raw`, and/or
  `generated` space access granted by its current admin owner, and can call
  connection-bound search/read resources.

The server records each binding's purpose and requires both keys to belong to
the same owner and namespace. The setup flow reveals both keys once; the plugin
passes them only through manifest-declared SecretRefs.

**Rationale**: Existing API-key policy intentionally forbids memory scopes from
mixing with generic scopes or Raw/Generated access. Giving one memory key broad
page access would weaken the bounded-destination model. Two keys retain current
least-privilege guarantees while letting a single configured OpenClaw connection
search the user's larger permitted knowledge base.

**Alternatives considered**:

- One broad Admin key: rejected because it makes mirror compromise equivalent
  to all-account access and defeats independent revocation.
- Let a generic view key call mirror APIs: rejected because it is not bound to
  a destination or agent identity.
- Use the existing public search route directly from any key: rejected for the
  official plugin path because it cannot prove the search key belongs to the
  mirror connection or report safe space coverage.

**Local evidence**: `apps/web/src/server/services/api-keys.ts`,
`apps/web/src/server/permissions/agent-memory.ts`,
`packages/shared/src/api-keys.ts`, and
`apps/web/src/server/services/public-content.ts`.

## 7. Reuse Permission-Safe Search and Page Reads

**Decision**: Add a connection-bound search facade and source-read facade that
authenticate the paired knowledge-search key, then delegate to
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
