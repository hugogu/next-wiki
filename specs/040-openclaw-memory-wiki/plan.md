# Implementation Plan: OpenClaw Memory Wiki Integration

**Branch**: `040-openclaw-memory-wiki` | **Date**: 2026-08-29 | **Spec**: [spec.md](./spec.md)

**Input**: Feature specification from `/specs/040-openclaw-memory-wiki/spec.md`

## Summary

Deliver a separately installable native OpenClaw plugin that runs alongside
OpenClaw's `memory-wiki` plugin. It scans one explicitly configured local
Memory Wiki vault, preserves every eligible Markdown document as a restricted,
revisioned Raw source in next-wiki, and supplies a bundled agent Skill for
on-demand retrieval of the account's permitted Wiki, Generated, and Raw
content.

The Wiki extends the existing Agent Memory boundary with a generic source-
document snapshot capability. A server-bound OpenClaw connection provisions two
least-privilege keys for the same namespace: a mirror key that can write only
approved Memory Wiki snapshots and a knowledge-search key that can read only
the owner's granted content spaces. Each source document uses the existing
`agent_memory_records → pages → page_revisions` relationship: the Page owns its
storage tree and reader address, and its current published Revision is the
sole searchable version. The service owns destination resolution, storage-path
derivation, provenance, idempotency, and Raw revision creation; the plugin
never receives database access or a generic write credential. Account-wide
retrieval reuses the established page search and page-read services behind a
narrow connection-bound facade, rather than creating a parallel search engine.

`memory-wiki` has no public "file compiled/written" notification contract, so
the plugin's durable correctness mechanism is an initial scan followed by
serialized hash-based reconciliation. OpenClaw hooks may request an earlier
scan but are never the only source of synchronization. Markdown bodies are
canonical next-wiki Raw revisions; the generic Agent Memory record, Page, and
plugin local non-secret state contain only references, hashes, and retry
information.

## Technical Context

**Language/Version**: TypeScript 5.6; next-wiki server runs on Node.js 20.9+
(Docker image uses Node 24); published OpenClaw plugin requires Node.js
22.22.3+ and TypeScript ESM compatibility.

**Primary Dependencies**: Existing Next.js 16, React 19.2, Drizzle ORM, Zod,
PostgreSQL-backed pg-boss runtime, shared Raw/page/search/audit/OpenAPI
services; OpenClaw Plugin SDK and TypeBox for the new external plugin; Node
standard filesystem, crypto, and HTTP primitives for vault scanning and retry.

**Storage**: PostgreSQL 16 `pages` and immutable `page_revisions` plus the
existing content backend remain canonical for mirrored Markdown. Existing
`agent_memory_records` gains the generic `source_document` record type and
continues to bind a namespace/identity to its backing Page and current Revision;
the Page's storage path and Revision source metadata retain the source-tree
mapping without a second locator table. The plugin persists non-secret
scan/retry state only under its OpenClaw-managed data directory.

**Testing**: Vitest unit, service, route, and package tests; generated OpenAPI
schema tests; Playwright onboarding/API-key coverage; installed-package smoke
tests against a supported OpenClaw host; Docker Compose end-to-end validation
against a real next-wiki service and fixture vault.

**Target Platform**: Docker Compose/Kubernetes-hosted next-wiki and any
supported OpenClaw Gateway host that can read its configured local vault and
reach the Wiki over HTTP(S).

**Project Type**: Existing TypeScript web-service monorepo plus a separately
published TypeScript ESM OpenClaw plugin package and bundled Skill.

**Performance Goals**: At p95, an unchanged vault scan avoids a remote write
in under 5 seconds for 500 eligible Markdown files; a changed document of up
to 256 KiB is accepted by next-wiki in under 3 seconds and searchable within
60 seconds; a bounded 20-result account search responds within 2 seconds.

**Constraints**: One configured vault per connection; UTF-8 Markdown only;
the plugin must never follow symlinks or read outside that root; `_attachments`
and `.openclaw-wiki` are excluded; no secret in CLI arguments, local state,
logs, status, audit metadata, sample pages, or Skill text; normal OpenClaw
turns and Memory Wiki compilation never wait for remote synchronization; both
keys are SecretRef-backed and must be bound to the same owner-managed
destination.

**Scale/Scope**: One published OpenClaw plugin and Skill; one OpenClaw vault
per connection; up to 500 Markdown files / 50 MiB per initial scan, each file
bounded to 256 KiB; one concurrent scan per connection; bounded retries with
full jitter. v1 excludes binary syncing, two-way sync, local restore, and
automatic discovery of every agent-scoped vault.

## Constitution Check

*GATE: Passed before Phase 0 research and re-checked after Phase 1 design.*

| Principle / gate | Design response | Status |
| --- | --- | --- |
| P1 — simple deployment | The Wiki gains only tables, routes, and existing services. The OpenClaw runtime is an external package; no new next-wiki service, daemon, queue, or container is introduced. | Pass |
| P2 — AI-native, never vendor-locked | OpenClaw is a client adapter over a documented Agent Memory REST capability. The Wiki's canonical source, authorization, and search layers remain client-neutral; no OpenClaw model SDK is introduced into the web service. | Pass |
| P3 — portable, self-growing memory | Captured Markdown is stored verbatim as restricted Raw page revisions with citations and common indexing. The bundled Skill retrieves evidence on demand and instructs the agent to cite it. | Pass |
| P5 — permissions first | Mirror and search keys are distinct and tied to one namespace and owner. The server derives the mirror root and rechecks page/space permissions for every search/read; plugin configuration cannot select another account. | Pass |
| P7 — async-first heavy work | Vault scanning and retry run in a serialized background plugin service. One bounded document snapshot is synchronous only after stability checks; no chat turn or Memory Wiki compiler waits for it. | Pass |
| P8 — source content and reversibility | Raw pages retain immutable full-file snapshots. The common Agent Memory record points at the Page/current Revision, while Revision metadata retains exact source provenance; digest-equal retries are no-ops and removals never hard-delete Raw history. | Pass |
| P9 — open standards | Integration uses versioned REST/JSON, OpenAPI, Markdown, a documented plugin manifest, and an independently installable package. | Pass |
| P10 — explicit registration | The plugin manifest, two-key provisioner, route registrations, system category, OpenAPI schemas, sample-page definitions, package entry point, Skill, and release workflow are explicit. | Pass |
| P12 — public reading static by default | The only public change is a marker-owned OpenClaw help page and links. It follows existing published static/ISR delivery and targeted invalidation; credentials and integration state remain authenticated. | Pass |

### Source of Truth, Provenance, and Publication Boundary

- Each Memory Wiki document is canonical as an immutable restricted Raw
  revision. On a changed digest, the mirror writes a complete new file snapshot
  through the Raw writer; it does not concatenate historical file versions or
  overwrite an existing revision.
- `agent_memory_records` gains a generic `source_document` type rather than
  introducing an OpenClaw-only locator entity. It points at one Raw Page and
  its current Revision; its existing namespace/identity binding makes the
  relationship reusable by Hermes and future agents. The Page supplies the
  server-derived storage path and independent reader address. Each immutable
  Raw Revision records the exact source path, delivery idempotency key, digest,
  optional source version, and writer provenance in trusted source metadata.
- The source vault is read-only from next-wiki's perspective. The plugin
  accepts only stable UTF-8 `.md` files under its configured root and excludes
  attachments, hidden runtime state, symlinks, traversal paths, secrets, and
  arbitrary adjacent local files.
- A document is visible only after the new Raw revision has completed the
  normal render, metadata, asset-reference, replication, publication, and
  index-reconciliation pipeline. Search returns the current readable revision
  with its page/revision citation; opening a result repeats the normal
  permission check.
- A detected local deletion does not delete or unpublish its raw source. It is
  reported in plugin status and left to the owner's ordinary retention and
  lifecycle controls. A rename/move is reconciled when its stable source ID or
  unambiguous local journal relation is available; ambiguous cases are reported
  for operator resolution rather than silently merging documents.
- The OpenClaw Skill is retrieval-only. It warns that source text is evidence,
  not executable instruction, and it never publishes generated conclusions or
  makes an unreviewed Wiki mutation.

### Public Content Delivery

- Setup example-page initialization creates `integrations/openclaw` and adds
  links from the marker-owned Welcome and Main Features pages. The existing
  Hermes guide remains a separate integration page.
- These normal published Wiki pages use the existing static/ISR representation
  and existing page/navigation cache tags. `publish`, marker-owned refresh,
  restore, or managed-page migration invalidates the affected guide, Welcome,
  Main Features, navigation tree, and public-page cache representation through
  the established publish path.
- No API key, SecretRef, connection name, vault path, synchronization state,
  search result, or user-specific control is embedded in public page content.

## Project Structure

### Documentation (this feature)

```text
specs/040-openclaw-memory-wiki/
├── plan.md
├── research.md
├── data-model.md
├── quickstart.md
├── contracts/
│   ├── openclaw-memory-wiki-rest-api.md
│   └── openclaw-plugin-contract.md
└── tasks.md                         # created by /speckit-tasks
```

### Source Code (repository root)

```text
apps/web/
├── app/api/
│   ├── api-keys/openclaw/route.ts   # paired-key creation, reveal-once response
│   └── v1/memory/wiki/
│       ├── connection/route.ts
│       ├── documents/route.ts
│       ├── search/route.ts
│       └── pages/[pageId]/route.ts
├── src/components/user-center/
│   └── ApiKeyCreateDialog.tsx       # OpenClaw paired-key preset
├── src/server/
│   ├── api/openapi-schemas.ts
│   ├── db/schema/agent-memory.ts
│   ├── permissions/agent-memory.ts
│   └── services/
│       ├── agent-memory.ts          # shared destination + generic record integration
│       ├── agent-memory-documents.ts # generic source-document snapshot service
│       ├── api-keys.ts              # paired-key provisioner
│       ├── raw-entries.ts           # trusted full-snapshot revision helper
│       └── setup-sample-page-*.ts
└── test and e2e/                    # service, route, key, audit, setup coverage

packages/
├── shared/src/
│   ├── agent-memory.ts               # mirror and connection DTOs
│   └── api-keys.ts                   # OpenClaw paired-key DTOs
└── openclaw-memory-wiki/
    ├── package.json
    ├── openclaw.plugin.json
    ├── tsup.config.ts
    ├── src/
    │   ├── index.ts                  # native plugin entry and registrations
    │   ├── config.ts                 # strict non-secret configuration
    │   ├── client.ts                 # REST client and safe errors
    │   ├── vault-scanner.ts          # root-bound Markdown inventory
    │   ├── sync-service.ts           # serialized reconciliation/retry
    │   └── tools.ts                  # search/get/status/manual-sync tools
    ├── skills/next-wiki/
    │   └── SKILL.md
    ├── tests/
    └── README.md

.github/workflows/
└── publish-openclaw-memory-wiki.yml
```

**Structure Decision**: Keep server authorization, source persistence,
provenance, OpenAPI, and sample-page work within the current web/shared layers.
Publish the OpenClaw runtime as a separate package under `packages/`, as with
the existing MCP and Hermes integrations, so next-wiki's deployment does not
embed or discover a third-party runtime. The plugin calls the Wiki through
REST; it does not reuse the Node MCP process or direct server internals.

## Design and Delivery Sequence

1. **Freeze public contracts and paired credentials**
   - Add shared schemas for stable Markdown snapshot input, mirror document
     view/outcome, connection capabilities, search coverage, and the
     reveal-once OpenClaw paired-key response.
   - Add the owner-only provisioner that creates two keys for one namespace:
     mirror (`memory.read`/`memory.write`) and knowledge search (`view` plus
     owner-approved space access). Bind the two key purposes to the same
     owner/namespace and reject mixed-purpose or cross-owner setup.
   - Document all new routes with route-level OpenAPI metadata and regenerate
     the public OpenAPI document.

2. **Add the generic source-document record and safe Raw snapshot writer**
   - Extend Drizzle source schema with the `source_document` Agent Memory
     record type and binding purpose; generate the migration exclusively with
     `pnpm db:generate`, then rerun it to confirm no pending schema changes.
   - Implement a server-derived storage-path projection for the documented
     vault hierarchy, using the Page's independent storage path and address.
     Preserve exact source paths in immutable Revision provenance and reject
     traversal, unsupported paths, case-fold collisions, invalid UTF-8,
     non-Markdown inputs, and changed-idempotency replay.
   - Add an internal full-snapshot Raw revision operation that uses the shared
     content lifecycle. Existing `appendEntry` stays for append-only evidence;
     it is not reused for mutable file snapshots.

3. **Expose narrow mirror and retrieval surfaces**
   - Add a bounded idempotent document upsert under `/api/v1/memory/wiki/`,
     resolving namespace, identity, and destination only from the mirror key.
     Return safe `created`, `updated`, and `unchanged` metadata and a citation.
   - Add connection-bound search/read facades for the paired knowledge key.
     They delegate to the existing `publicContent.searchPages` and
     `getPageById` permission-filtered services, return only readable content,
     and include coverage for Wiki/Raw/Generated without leaking inaccessible
     page metadata.
   - Reuse the existing `agent_memory` audit origin; audit endpoint/outcome and
     bounded correlation information only, never body, query, source path,
     excerpt, or secret.

4. **Build the native OpenClaw plugin and bundled Skill**
   - Create an ESM external plugin with a strict manifest, `onStartup`
     activation, config SecretRef declarations, compiled JavaScript entry, and
     explicit tool contracts.
   - Run a stable, root-confined initial/periodic scan. A manual sync tool and
     a safe status tool complement background reconciliation; tool hooks can
     request a prompt scan but cannot replace scanning. Limit concurrency and
     use content hash + jittered retry to remain non-blocking and restart-safe.
   - Bundle a `next-wiki` Skill that teaches search-first, citation-aware,
     prompt-injection-resistant retrieval. Register `next_wiki_search`,
     `next_wiki_get`, `next_wiki_status`, and an opt-in `next_wiki_sync`.

5. **Make the feature discoverable and releasable**
   - Add the collision-safe `integrations/openclaw` sample page and update the
     existing welcome/main-features links without replacing the Hermes guide.
   - Add package build, tarball installation, runtime inspection, Skill load,
     Docker Compose, compatibility, and release checks. Publish through a
     dedicated `openclaw-memory-wiki-v*` workflow; keep ClawHub publication a
     controlled release step until project ownership/credentials are supplied.

## Complexity Tracking

No constitution violations require justification.
