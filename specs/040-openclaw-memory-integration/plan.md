# Implementation Plan: OpenClaw Shared Memory Bridge

**Branch**: `codex/040-openclaw-memory-integration` | **Date**: 2026-08-28 | **Spec**: [spec.md](./spec.md)

**Input**: Feature specification from `/specs/040-openclaw-memory-integration/spec.md`

## Summary

Evolve the existing client-neutral Agent Memory foundation into a stable,
connection-based shared-memory service, then ship OpenClaw as a separately
published companion bridge. The Wiki owns durable content, explicit
connection/destination grants, permission re-checks, provenance, audit, and
versioned REST contracts. The bridge owns only OpenClaw lifecycle adaptation,
its private local outbox, optional model tools, and optional authorized prompt
enrichment. It does not replace OpenClaw's memory slot or local memory search.

The server keeps the existing `/api/v1/memory/*` contract operational for the
Hermes integration. The new shared-memory behavior is published as
`/api/v2/memory/*`, avoiding a semantic change to v1 while making the reusable
connection/grant model available to OpenClaw and future adapters. Original
evidence and generated summaries are canonical restricted Raw pages and
immutable revisions. Relational tables and transient encrypted capture payloads
are authorization, retry, and provenance projections only.

## Technical Context

**Language/Version**: TypeScript 5.6 on Node.js 20.9+ for next-wiki; TypeScript
ESM on OpenClaw-supported Node.js 22.22.3+ for the published bridge packages.

**Primary Dependencies**: Next.js 16, React 19.2, Drizzle ORM, Zod, pg-boss,
existing Raw/content-store and public OpenAPI infrastructure; OpenClaw Plugin
SDK as a peer dependency plus TypeBox and Node built-ins in the bridge package.

**Storage**: PostgreSQL 16 remains the only required server state. Canonical
memory/evidence bodies are restricted Raw page revisions in existing content
storage. PostgreSQL keeps connections, destinations, grants, records, capture
state, and an encrypted short-lived ingest envelope. The bridge has a bounded
plugin-owned outbox below the OpenClaw state root, protected by OS permissions;
it is not a second server store and retains no data after acknowledgement or its
configured expiry.

**Testing**: Vitest unit/service/route tests, Playwright User Center and guide
tests, OpenAPI generation checks, package Vitest tests and loader-backed plugin
smoke tests, clean tarball installation/inspection, Docker Compose end-to-end
tests, and minimum/current OpenClaw compatibility CI.

**Target Platform**: Existing Docker Compose/Kubernetes next-wiki deployment;
an OpenClaw Gateway host running a supported Node version. The bridge supports
local or remote Wikis reachable over an operator-managed secure network path.

**Project Type**: Existing Next.js web service monorepo plus two independently
published TypeScript OpenClaw packages (continuous bridge and one-time
migration).

**Performance Goals**: The server returns bounded lexical recall within 2
seconds at p95 under normal deployment load. At least 100 independently
configured connections can use one Wiki without destination leakage. Local
outbox persistence happens before a hook returns; normal OpenClaw turns do not
wait for remote capture completion.

**Constraints**: The server has no OpenClaw runtime dependency or
OpenClaw-named public resource. Agent requests never select a destination or
grant. Public API changes update OpenAPI. Native OpenClaw hooks are
at-least-once observations, not a durable queue or a compaction veto. No
credentials, prompts, tool output, query text, or memory bodies enter logs,
audit metadata, public guides, or diagnostics.

**Scale/Scope**: Preserve Hermes through v1; add generic v2 connection/grant
semantics, owner-side management, one OpenClaw continuous bridge, one separate
previewable migration package, a managed OpenClaw guide, and compatibility
coverage. Semantic/vector recall, arbitrary cross-Wiki federation, automatic
promotion, and an OpenClaw memory-slot replacement remain out of scope.

## Constitution Check

*GATE: Passed before Phase 0 research and re-checked after Phase 1 design.*

| Principle / gate | Design response | Status |
|---|---|---|
| P1 — simple deployment | The Wiki adds only PostgreSQL schema, existing pg-boss work, and existing encrypted-value helpers. The OpenClaw packages run outside the Wiki image; no cache, vector service, queue, or model provider is required. | Pass |
| P2 — AI-native, vendor-neutral | OpenClaw is a replaceable adapter. The server uses a client-neutral REST contract and is still usable without an AI provider or OpenClaw installed. | Pass |
| P3 — portable, grounded memory | Restricted Raw revisions are canonical. Records carry source-revision citations and immutable provenance. A transient encrypted ingest envelope is deleted after the canonical revision becomes durable; it is never recallable content. | Pass |
| P5 — permissions first | Server-issued connections/destinations and explicit grants are the only authorization inputs. The bridge cannot choose a path, source destination, share, or write target. Every candidate is rechecked before serialization. | Pass |
| P7 — async-first | The bridge writes a local outbox before returning from lifecycle observations. The server queues only encrypted temporary input and a capture ID; the worker calls `runWithoutDataCache` and never puts raw bodies in job data. | Pass |
| P8 — version source content | Captures, saves, imports, and owner-approved promotions append a new immutable Raw revision. Forget/archive changes recall projection only. Migration never deletes source files. | Pass |
| P9 — open standards | `/api/v2/memory/*` is REST + JSON, authenticated by dedicated keys, described in generated OpenAPI, and shared by all adapters. `/api/v1/memory/*` remains compatible. | Pass |
| P10 — explicit registration | Routes, services, pg-boss handler, schema exports, API schemas, User Center routes, plugin manifest contracts, tools, hooks, service, and release workflows are all explicitly registered. No Wiki-side runtime plugin discovery is introduced. | Pass |
| P11 — native navigation | Agent Memory management is one User Center resource hierarchy. REST URLs name connections, credentials, and grants; no action-style management route is introduced. | Pass |
| P12 — public delivery | `help/agent-memory` becomes generic and links to a new `help/openclaw-memory-bridge` document. Both remain static/ISR public pages; targeted page/tree cache tags invalidate only changed guide/navigation representations after successful mutations. | Pass |

### Source of Truth, Provenance, and Publication Boundary

- Agent-produced text is appended through the Raw writer as a restricted page
  and immutable revision. The record stores only page/revision locators,
  connection/destination identity, closed-enum origin/nature, digests, state,
  and evidence relationships. It never stores another canonical body.
- A capture request is accepted into an encrypted, access-controlled, TTL-bound
  ingest envelope so the API handler can return quickly. The pg-boss payload
  contains only the capture ID. The worker decrypts only long enough to create
  the Raw record, commits the record/citation and capture state transactionally,
  then erases the envelope. Failed envelopes are bounded, non-recallable, and
  surfaced only through safe diagnostic categories.
- Generated compaction summaries are marked generated; pre-compaction snapshots
  and selected session material are marked original. Curated/shared knowledge
  can be created only through an owner-authorized promotion flow that creates a
  new attributable record linked to evidence. The bridge never promotes or
  publishes automatically.
- Recall expands only the caller's private destination and active server-side
  grants. It rechecks connection, destination, grant, record state, backing
  page/revision, and restricted visibility immediately before returning each
  citation. Derived search indexes are permission-filtered rebuildable
  projections; lexical recall remains the no-model baseline.
- The public guides contain placeholders only. User Center state, connection
  keys, destinations, grants, captures, and all Raw memory are authenticated
  dynamic data and never enter a public cache representation.

## Project Structure

### Documentation (this feature)

```text
specs/040-openclaw-memory-integration/
├── plan.md
├── research.md
├── data-model.md
├── quickstart.md
├── contracts/
│   ├── agent-memory-v2-rest-api.md
│   ├── agent-memory-management.md
│   └── openclaw-bridge-plugin.md
└── tasks.md                         # created by /speckit-tasks
```

### Source Code (repository root)

```text
apps/web/
├── app/
│   ├── (user)/user-center/api-keys/                 # connection/grant management UI
│   ├── api/api-keys/agent-memory/
│   │   ├── connections/                              # owner/session-only resources
│   │   └── connections/[connectionId]/
│   │       ├── credentials/
│   │       ├── read-grants/
│   │       └── write-grants/
│   └── api/v2/memory/
│       ├── _shared.ts
│       ├── connection/route.ts
│       ├── diagnostics/route.ts
│       ├── recall/route.ts
│       ├── records/route.ts
│       ├── records/[memoryId]/route.ts
│       └── captures/
│           ├── route.ts
│           └── [captureId]/route.ts
├── src/
│   ├── components/user-center/                       # connection/grant dialogs and views
│   └── server/
│       ├── api/                                      # shared Zod/OpenAPI/error schemas
│       ├── cache/                                    # targeted public guide/tree invalidation
│       ├── crypto/                                   # existing encrypted payload helper reuse
│       ├── db/schema/agent-memory.ts                 # generated Drizzle migration source
│       ├── jobs/agent-memory-capture.ts              # capture-id-only worker
│       ├── permissions/agent-memory.ts               # connection and grant resolution
│       └── services/
│           ├── agent-memory.ts                       # v1-compatible and v2 shared service
│           ├── agent-memory-connections.ts
│           ├── agent-memory-grants.ts
│           └── setup-sample-page-*.ts
├── e2e/                                               # User Center, guide, permission E2E
└── public/openapi.json                                # regenerated only

packages/
├── shared/src/
│   ├── agent-memory.ts                                # v1/v2 schemas and closed enums
│   └── api-keys.ts                                    # owner management schemas
├── hermes-memory-provider/                            # retained v1 adapter, regression tested
├── openclaw-memory-bridge/
│   ├── openclaw.plugin.json
│   ├── package.json
│   ├── src/
│   │   ├── index.ts                                   # synchronous plugin registration
│   │   ├── config.ts
│   │   ├── api-client.ts
│   │   ├── outbox.ts
│   │   ├── capture.ts
│   │   ├── hooks.ts
│   │   ├── tools.ts
│   │   ├── prompt-context.ts
│   │   ├── service.ts
│   │   ├── diagnostics.ts
│   │   └── redaction.ts
│   └── tests/
└── openclaw-memory-migrate/
    ├── openclaw.plugin.json
    ├── package.json
    ├── src/                                           # preview, local ledger, import adapter
    └── tests/

docs/
└── openclaw-memory-bridge.md

.github/workflows/
├── publish-openclaw-memory-bridge.yml
└── publish-openclaw-memory-migrate.yml
```

**Structure Decision**: Keep all authorization, persistence, content writes,
and public REST behavior in the existing Wiki service layers. `packages/shared`
remains the sole source of API schemas. OpenClaw packages contain only the
adapter and never import server-only modules. A separate migration package keeps
one-time local-history handling out of the continuously running bridge.

## Design and Delivery Sequence

1. **Freeze v2 generic contracts and compatibility boundary**
   - Keep every `/api/v1/memory/*` request and Hermes regression behavior
     intact. Define v2 shared Zod/OpenAPI schemas for connection discovery,
     recall intent, record/capture provenance, safe diagnostics, and owner-side
     resources; no request accepts a destination ID, agent name, grant, or
     arbitrary metadata.
   - Add the v2 route namespace and public error/audit mapping. Regenerate
     `apps/web/public/openapi.json` from annotations and schemas; never edit it
     directly.

2. **Introduce stable connections and explicit grants**
   - Add generic connections and use the existing namespace table as the
     physical destination table. Evolve key bindings to resolve a stable
     connection rather than treating API-key ID or mutable agent text as the
     connection identity.
   - Add explicit read/write destination grants. Private destination access is
     implicit for its connection; every other readable/writable destination is
     an owner-created active grant. Add compatibility/backfill services for
     existing v1 key bindings and records rather than hand-writing DDL or
     assuming a clean database.
   - Define all schema changes in Drizzle source, run `pnpm db:generate`,
     inspect the generated migration/snapshot, then rerun it to prove there are
     no remaining changes.

3. **Harden canonical capture and recall**
   - Generalize record provenance to original evidence, generated synthesis,
     imported material, and owner-curated promotion. Preserve immutable
     page/revision citations and source/derived links; forbid agent-side
     publication or promotion.
   - Replace raw evidence bodies in pg-boss job data with an encrypted transient
     capture envelope and capture-ID-only jobs. Apply a TTL/cleanup policy and
     worker audit outcome while retaining `runWithoutDataCache` and
     idempotency-conflict behavior.
   - Build server-derived own/granted recall modes. Recheck permissions and
     backing revision state after search selection, return no source inventory,
     and make grant/revocation races indistinguishable from unavailable records.

4. **Add owner management and public documentation**
   - Extend the existing User Center API-key surface with one canonical Agent
     Memory connections hierarchy. Let the owner create/disable connections,
     issue/rotate credentials, and grant/revoke read or write access through
     session-authenticated resource routes; bridge keys cannot mutate policy.
   - Add a generic Agent Memory guide and a separate OpenClaw bridge guide to
     marker-owned first-run pages. Extend public cache helpers with page/tree
     tags so a successful guide mutation invalidates only changed documents and
     affected navigation; collision/skip/error paths invalidate nothing.

5. **Build the OpenClaw companion bridge**
   - Publish an ESM native non-capability plugin with explicit manifest,
     compatibility floor, optional tools, hook permissions, and a registered
     service. Do not claim the exclusive memory slot or call another memory
     plugin's private APIs.
   - Persist lifecycle capture work to a bounded file outbox under the supported
     OpenClaw state root before returning. Recover it at Gateway start, drive
     retry through the bridge service, use a short abortable shutdown flush, and
     retain pending entries after timeout rather than falsely acknowledging
     them. Outbox files are private to the Gateway user, size/age bounded, and
     never logged.
   - Observe supported compaction/session/turn boundaries only. Capture is
     opt-in; missing correlation data safely skips capture. `before_compaction`
     is not a veto and strict pre-compaction durability is explicitly deferred
     until OpenClaw exposes a supported enforcement capability.
   - Offer optional `next_wiki_memory_search`, `next_wiki_memory_save`, and
     `next_wiki_memory_forget` tools. Search uses granted sources by default;
     save/forget require a per-call plugin approval in addition to server ACL.
     Prompt enrichment uses only the post-policy `before_prompt_build` phase
     with tool authority, bounded/escaped citations, and fail-open behavior.

6. **Build a separate migration capability**
   - Package a distinct OpenClaw migration provider with preview, explicit
     source selection, approval, resumable local fingerprint ledger, and
     generic v2 import provenance. It never reads private memory-plugin
     internals, deletes local source files, or creates a continuous sync job.

7. **Verify and release**
   - Add service/route/schema/permission/audit/capture tests; User Center and
     guide Playwright coverage; OpenAPI checks; v1 Hermes regression tests; and
     unit/loader/package tests for both OpenClaw packages.
   - Run the standard full workspace checks and Docker Compose smoke test.
     Build each package, install its packed artifact through OpenClaw's managed
     installer, inspect the live runtime, and run compatibility jobs against
     the pinned minimum and current OpenClaw release before ClawHub publication.

## Complexity Tracking

No constitutional exception is required. The two external packages are optional
adapters; they do not broaden the Wiki's default deployment. The added generic
connection/grant model is required to make the server, rather than a plugin
path convention, enforce multi-agent isolation and deliberate sharing.
