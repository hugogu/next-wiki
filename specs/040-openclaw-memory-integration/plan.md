# Implementation Plan: Unified Agent Memory Integrations

**Branch**: `codex/040-openclaw-memory-integration` | **Date**: 2026-08-29 | **Spec**: [spec.md](./spec.md)
**Input**: Feature specification from `/specs/040-openclaw-memory-integration/spec.md`

## Summary

Extend the 039 Agent Memory service into one client-neutral, documented
`/api/v1/memory` contract. Hermes remains a compatible optional adapter and a
new OpenClaw bridge uses the same server API. The server resolves a stable
connection and private destination from credentials, enables owner-controlled
read grants and curated promotion, and preserves all canonical content in
restricted Raw Wiki revisions. OpenClaw lifecycle capture is non-blocking and
restart-safe through a plugin-owned local outbox.

Complete all Agent Memory schema edits before running Drizzle once, producing
one generated migration after 0021. API code changes update shared Zod schemas,
framework OpenAPI annotations, and generated OpenAPI documentation together.

## Technical Context

**Language/Version**: TypeScript 5.6 / Node.js 20.9+ (web), Node 22.22.3+ for the independently packaged OpenClaw ESM plugin, existing Python Hermes package
**Primary Dependencies**: Next.js 16 App Router, React 19, Drizzle ORM, Zod, pg-boss, existing Raw-page content service; documented OpenClaw plugin SDK
**Storage**: PostgreSQL 16 + pgvector; canonical content in existing restricted Wiki pages/revisions; encrypted and bounded transient capture envelope/outbox storage
**Testing**: Vitest/route and service tests, Drizzle generation verification, Hermes regression tests, OpenClaw loader-backed package smoke tests, Docker Compose integration flows
**Target Platform**: Next Wiki server and separately installed OpenClaw Gateway plugin
**Project Type**: Monorepo web application with shared packages and adapter packages
**Performance Goals**: bounded recall returns within 2 seconds under normal service conditions; hooks persist a local outbox entry within the 200 ms local delivery budget (spec.md Bounded Limits) without conversation-path network waits; server capture reports durable only after canonical persistence
**Constraints**: existing `/api/v1/memory` remains the only agent API base; backend API responses are no-store; no agent-selected destination/grant; no raw payload in audit/job metadata; all schema changes result in exactly one generated migration; no automatic legacy-row migration; local outbox capped at 500 entries/256 KB each with a 7-day TTL and exponential backoff (5s–10min); server-side capture envelope capped at 1 MB with a 24-hour TTL (spec.md Bounded Limits is authoritative for all numeric values)
**Scale/Scope**: multiple independently provisioned agents per Wiki owner; private memory by default; owner-created shared recall and promotion; one optional Hermes adapter and one optional OpenClaw bridge

## Constitution Check

| Principle | Design response | Status |
|---|---|---|
| Minimal, focused changes | Reuse 039 namespaces, records, evidence links, captures, routes, and Raw writer; add only connection and destination-grant tables. | Pass |
| Domain-first authorization | Stable connection, private destination, and read-grant graph are server-owned domain concepts; adapters supply no policy identifiers. | Pass |
| Canonical provenance | Memory text remains a restricted Raw revision; records store immutable citation/provenance only. | Pass |
| Compatibility | Hermes keeps `/api/v1/memory` request semantics; legacy key bindings resolve through an explicit fallback. | Pass |
| Safe asynchronous work | Capture is idempotent and non-blocking, with bounded encrypted transient storage and a restart-safe local outbox. | Pass |
| Database discipline | All schema edits are finalized first, then `pnpm db:generate` creates one `0022` migration and snapshot; no hand-authored SQL/journal. | Pass |
| API documentation | Shared schemas, literal OpenAPI schemas, route annotations, generated `openapi.json`, and sync tests are one change gate. | Pass |
| Public docs/cache discipline | Managed generic and OpenClaw help pages are idempotent and invalidate only their page/help-navigation cache tags. | Pass |

## Project Structure

```text
apps/web/
├── app/api/v1/memory/                         # shared agent endpoints; additive only
├── app/api/api-keys/agent-memory/             # owner/session management routes
├── src/server/db/schema/agent-memory.ts       # all 040 schema edits happen here first
├── src/server/db/migrations/                  # one generated 0022 migration + snapshot
├── src/server/services/agent-memory*.ts       # connection, grants, records, capture service
├── src/server/api/openapi-schemas.ts           # literal schemas for generator compatibility
├── src/server/api/openapi-schemas.test.ts      # runtime/OpenAPI structural sync test
└── src/server/services/setup-sample-pages.ts   # managed help pages
packages/
├── shared/src/agent-memory.ts                  # runtime Zod schemas and closed enums
├── hermes-memory-provider/                     # compatible optional Python adapter
├── openclaw-memory-bridge/                     # ESM manifest, hooks, tools, outbox, service
└── openclaw-memory-migrate/                    # explicit local import preview/ledger utility
specs/040-openclaw-memory-integration/
├── research.md
├── data-model.md
├── contracts/
├── quickstart.md
└── tasks.md
```

## Design and Delivery Order

### 1. Freeze the shared v1 contract and docs boundary

Keep the existing `/api/v1/memory` routes. Add connection discovery,
grant-aware recall scope, closed provenance/capture enums, and safe statuses as
additive schema fields. Define runtime schemas in `packages/shared`, duplicate
the generator-compatible literals in `openapi-schemas.ts`, annotate each route,
then regenerate `apps/web/public/openapi.json`. The sync test prevents the two
schema representations drifting.

### 2. Make one complete database change

Finish every Agent Memory change in `agent-memory.ts` before migration
generation. Reuse namespaces as physical destinations and extend their role;
extend bindings, records, and captures for stable connection/provenance/capture
lifecycle. Add only `agent_memory_connections` and
`agent_memory_destination_grants`. Run `pnpm db:generate` once, review the one
new `0022` migration and snapshot, then run it again to verify no further
schema delta. Do not hand-edit migration SQL, journal, or snapshots.

Existing 039 rows do not need automatic conversion. Resolver compatibility
continues to authorize a legacy key binding against its old namespace while all
new credentials resolve a connection and private destination.

### 3. Implement generic service authorization

Resolve credential → connection (or legacy fallback) → private namespace in a
single service boundary. The request cannot choose an identity, namespace,
destination, or grant. Owner/session management creates/rotates/disables
connections and creates/revokes read grants. Recall expands only the caller's
private namespace plus active grants and rechecks state during result output.

Adapters can create private records/captures only. An owner promotion service
copies eligible evidence into a separately attributable curated record in a
shared namespace and emits immutable evidence links. Forget changes recall
projection without destroying the Raw citation.

### 4. Preserve durable evidence without a retention feature

Canonical evidence is written through the restricted Raw writer before a
capture reports `durable`; derivative jobs hold only IDs/citations. If raw
input must wait temporarily server-side, it is an encrypted bounded envelope
with explicit expiry, no audit leakage, and execution reauthorization by
connection. There is no destination-retention table in this feature: canonical
content follows existing Wiki policy; only local/envelope payloads receive
fixed TTL and capacity caps.

### 5. Adapt Hermes and add OpenClaw independently

Keep Hermes on the same v1 API with omitted additive fields defaulting to 039
behaviour. Ship OpenClaw as a separately published ESM `definePluginEntry`
non-capability plugin: no exclusive memory slot, no server-side OpenClaw
dependency, and no call to another plugin's internals. A registered service
owns a portable, restart-safe outbox. Observation hooks enqueue; they never
block conversation/compaction awaiting the API or promise a pre-compaction
remote save.

Optional static tools and authorized prompt enrichment are operator opt-in;
save/forget require per-call approval. The bridge sends only the generic v1
contract and renders bounded, escaped citations.

### 6. Make sharing, migration, guides, and release behaviour explicit

Shared recall begins only after the owner creates a shared namespace, creates a
read grant, and deliberately promotes content. Revocation removes results
without disclosure. The separate import utility previews local source data,
requires approval, maintains a local protected idempotency ledger, and writes
normal `origin=import` private records; it never deletes source files or
imports a generic path into server metadata.

Create a generic Agent Memory help page plus an OpenClaw bridge page using the
same marker-owned, collision-safe sample-page mechanism as Hermes. Add
page-specific/help-navigation cache tags so only changed public guide
representations invalidate. Validate OpenAPI output, package archives, loader
compatibility, Hermes regression, bridge recovery, and the Docker quickstart.

## OpenAPI Synchronization Procedure

For every route contract change:

1. Change runtime Zod schemas in `packages/shared/src/agent-memory.ts`.
2. Update generator-compatible literal schemas in
   `apps/web/src/server/api/openapi-schemas.ts` and its structural test.
3. Update handler `@openapi` annotations under `apps/web/app/api/v1/memory` or
   owner-management route documentation.
4. Run `pnpm --filter @next-wiki/web openapi:generate` and commit the updated
   `apps/web/public/openapi.json`.
5. Run focused route/schema tests; failures or a stale generated document block
   the feature.

## Complexity Tracking

No constitution exceptions are required. The two new tables are the smallest
durable representation of stable connection identity and explicit shared-read
authorization; a retention-policy table, separate v2 route family, and
OpenClaw-specific server tables are deliberately excluded.
