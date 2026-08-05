# Implementation Plan: Cross-Space Page Migration

**Branch**: `codex/033-cross-space-migration` | **Date**: 2026-08-05 | **Spec**: [spec.md](./spec.md)

**Input**: Feature specification from `specs/033-cross-space-migration/spec.md`

## Summary

Replace the current synchronous, administrator-only single-page move with one
durable migration workflow for a page or folder subtree between Wiki and AI
Generation. The workflow first persists a permission-safe preview, then starts
an idempotent background operation that relocates pages in short per-page
transactions, records legacy routes, preserves provenance/history, and reports
each outcome. Navigator, Pages, REST/OpenAPI, and MCP are thin entry points to
the same service.

The existing AI Generation space remains administrator-curated. Consequently,
all cross-space migration requests require Administrator authority (including
an API/MCP credential acting with Administrator authority); this corrects the
earlier generic “Editor” wording in the specification without changing the
established generated-content permission model.

## Technical Context

**Language/Version**: TypeScript 5.6; Node.js 20.9+ (Node 24 in Docker)

**Primary Dependencies**: Next.js 16 App Router, React 19.2, Drizzle ORM, Zod, pg-boss, next-openapi-gen, TanStack Query, existing Markdown/OKF and permission services

**Storage**: PostgreSQL 16 for pages, revisions, migration state, audit data, and pg-boss; existing content-storage abstraction for revision content and assets

**Testing**: Vitest service/route/component/MCP tests; Playwright end-to-end tests; generated OpenAPI validation; lint, typecheck, i18n validation, and generated migration no-change check

**Target Platform**: Docker Compose deployment with web and worker processes

**Project Type**: pnpm monorepo: Next.js web application plus MCP server package

**Performance Goals**: A single conflict-free page preview and confirmation returns in under 500 ms under ordinary load; folder previews provide a durable result before confirmation; each worker transaction handles one page and does not hold a database transaction across the whole subtree.

**Constraints**: Wiki and AI Generation only; Raw is never source or destination; no automatic access broadening or publication; page/revision identities remain durable; public routes remain one canonical static/ISR document; all schema changes are generated with `pnpm db:generate`.

**Scale/Scope**: One page or every original page under a selected folder, including its translated variants; durable operation/item rows, preview conflicts, status, cancellation, and retry/re-preview; Navigator and Pages entry points; public REST and MCP contracts.

## Constitution Check

### Pre-design gate

| Principle / mandate | Plan response | Status |
|---|---|---|
| P1 simple deployment | Reuses PostgreSQL and the existing pg-boss worker; no service or dependency is added. | Pass |
| P3 governed AI memory | Moving imported material records a human classification and preserves original import provenance; it never claims unavailable model provenance or publishes content. | Pass |
| P5 permissions first | The shared preview, confirmation, status, worker, REST, and MCP paths apply the same Administrator and source/destination checks; unavailable content remains opaque. | Pass |
| P7 async-first | Folder work runs on a registered pg-boss queue with durable progress/recovery; the request returns an operation reference. | Pass |
| P8 version everything | Page IDs and historical revisions persist. A destination-facing migration revision records metadata/tag re-homing or required OKF adaptation; no history is overwritten. | Pass |
| P9 open standards | REST/JSON is documented through OpenAPI and MCP is a thin client of the same service/schemas. | Pass |
| P10 explicit registration | The new queue, worker, service, schemas, route handlers, and MCP tools are explicitly registered. | Pass |
| P11 canonical navigation | Each moved page receives one destination canonical route; prior public routes use the existing conditional redirect record and never serve a duplicate document. | Pass |
| P12 static public reading | The public reader remains static/ISR. Moves invalidate old/new public data and route representations without introducing session-dependent content. | Pass |

### Post-design gate

The design keeps long-running work durable, leaves Raw immutable, performs
permission checks at every boundary, and makes a separate normal page revision
for destination metadata/OKF adaptation. It creates redirect inputs only; the
reader checks current public eligibility before redirecting. Static-site
publication remains a distinct approval/publish decision and is not triggered
by reclassification alone. No constitutional exception is required.

## Project Structure

### Documentation (this feature)

```text
specs/033-cross-space-migration/
├── plan.md
├── research.md
├── data-model.md
├── quickstart.md
├── contracts/
│   ├── space-migrations-api.md
│   └── migration-ui.md
└── tasks.md                         # created by /speckit-tasks
```

### Source Code

```text
apps/web/
├── app/api/v1/space-migrations/
│   ├── previews/route.ts
│   ├── route.ts
│   └── [id]/{route.ts,items/route.ts,cancellation/route.ts}
├── src/
│   ├── components/{layout,admin/pages,pages}/
│   ├── server/
│   │   ├── api/{errors.ts,openapi-schemas.ts}
│   │   ├── db/schema/{index.ts,enums.ts}
│   │   ├── jobs/{runtime.ts,register.ts,cross-space-migration.ts}
│   │   └── services/{cross-space-migrations.ts,pages.ts,space-routes.ts,public-content.ts}
│   └── lib/path.ts
└── public/openapi.json

packages/
├── shared/src/{page-migrations.ts,mcp-tool-catalog.ts}
└── mcp-server/src/{api-client.ts,server.ts,tools/}
```

**Structure Decision**: `cross-space-migrations` owns selection expansion,
preview snapshots, confirmation, operation/item state, authorization, and
per-item execution. Existing page, revision, metadata, routes, cache, and AI
index services remain owners of their respective invariants. Browser routes and
MCP adapt the shared service rather than reimplementing move rules.

## Implementation Sequence

1. Define shared schemas and generated database schema for migration operations
   and items; add the queue and worker registration/recovery before exposing any
   route. Generate the Drizzle migration from schema edits only.
2. Build the preview/confirmation service: expand page or folder selection,
   include translation groups, validate Admin/mode/Raw/path rules, calculate
   destination mappings and visibility, snapshot item preconditions, identify
   safe link impacts, and persist a time-limited preview.
3. Implement the worker with one locked item transaction at a time. Re-check
   the preview snapshot, apply destination metadata/tag re-homing and optional
   OKF revision, move the page, drop explicit source-space ACLs for destination
   inheritance, record legacy routes, and store an item outcome. Re-enqueue
   recoverable operations on worker startup.
4. After committed items, reconcile search/AI indexes, invalidate public
   content once per batch, warm only final public canonical URLs, and notify
   existing non-public publication/backup listeners without initiating a
   static-site publication.
5. Add versioned REST/OpenAPI endpoints and MCP tools using shared Zod models;
   make the old internal single-page endpoint a compatibility shim or retire it
   only after its callers use the shared service.
6. Add the shared migration dialog/launcher to Navigator and the Pages list.
   Update the lazy navigator cache and destination navigation on terminal
   completion rather than relying only on a local list refresh.
7. Add focused service/job/route/component/MCP tests, public-route/cache/link
   tests, an end-to-end browser path for each web entry, generate OpenAPI, and
   run the repository validation gates.

## Complexity Tracking

No constitution violation or exceptional complexity is introduced.
