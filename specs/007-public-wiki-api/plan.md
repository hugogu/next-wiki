# Implementation Plan: Public Wiki Content API

**Branch**: `007-public-wiki-api` | **Date**: 2026-06-29 | **Spec**: [spec.md](./spec.md)
**Input**: Feature specification from `/specs/007-public-wiki-api/spec.md`

## Summary

Add a stable, versioned Public Wiki Content API for external tools such as
OpenClaw and OpenCode. The implementation introduces `/api/v1` content
contracts for pages, revisions, assets, search, and publication while keeping
business behavior in the existing service layer. Public routes are contract
adapters over shared page/revision/asset/search capabilities; first-party
client-side CRUD workflows should move to the same public contract where an
equivalent public operation exists.

## Technical Context

**Language/Version**: TypeScript 5.6 on Node.js 20.9+; Docker image tracks Node 24  
**Primary Dependencies**: Next.js 16 App Router, React 19.2, Drizzle ORM, Zod,
TanStack Query, next-openapi-gen, existing content-store and audit services  
**Storage**: Existing PostgreSQL 16 database and current content storage backends;
no new persistent store required  
**Testing**: Vitest route/service tests and Playwright E2E/API workflow coverage  
**Target Platform**: Self-hosted Linux deployment through Docker Compose or Kubernetes  
**Project Type**: Full-stack web application in the existing pnpm monorepo  
**Performance Goals**: Public content listing/search responses should remain
paginated and bounded; common page read/update calls should complete within
normal interactive API latency under existing wiki scale  
**Constraints**: No new default service; no MCP or AI scope; no route-level
business logic; public API versioning under `/api/v1`; generated OpenAPI must
include the public contract; API-key calls must be audited without storing page
source or file bytes in audit records  
**Scale/Scope**: Personal and small-team installations, aligned with existing
wiki scale and current 10,000-page AI/indexing assumptions

## Constitution Check

*GATE: Must pass before Phase 0 research. Re-check after Phase 1 design.*

| Principle / Mandate | Status | Design compliance |
|---|---|---|
| P1 Simple Deployment | PASS | Adds route handlers, schemas, and tests only. No new service, queue, cache, or storage dependency. |
| P2 AI Optional | PASS | Does not introduce AI behavior, AI scopes, model calls, or MCP tools. Existing AI remains optional. |
| P3 Rendering Pipeline | PASS | Public write operations continue to submit Markdown source through the existing render pipeline; no rendered HTML becomes canonical input. |
| P4 Permissions First-Class | PASS | Every public operation constructs a permission context and calls shared services that enforce role, scope, page, revision, and asset visibility. |
| P5 UI Consistency | PASS | No new major UI surface beyond existing API docs; any first-party client changes reuse existing UI and data-flow primitives. |
| P6 Async-First | PASS | Feature is synchronous for bounded content API operations only. Large imports/exports remain outside this feature and already use background jobs. |
| P7 Version Everything | PASS | Public updates create normal immutable draft revisions and publishing promotes a revision through the existing publish flow. |
| P8 Open Standards | PASS | Establishes REST + JSON + OpenAPI as the stable external contract under `/api/v1`. |
| P9 Explicit Over Implicit | PASS | Public route modules and schemas are explicit; no dynamic route/tool discovery or hidden adapter registration. |
| P10 Native Navigation | PASS | API resources use resource-oriented URLs and documented sub-resources; first-party URL state rules remain unchanged. |
| API Architecture mandate | PASS | Public REST routes are thin adapters over shared services and Zod schemas; they do not call internal route handlers or duplicate business logic. |
| Frontend Data Flow mandate | PASS | Client-side CRUD should use TanStack Query/fetch against the public API when an equivalent public operation exists; RSC loaders may continue to call services directly. |

## Project Structure

### Documentation (this feature)

```text
specs/007-public-wiki-api/
├── plan.md
├── research.md
├── data-model.md
├── quickstart.md
├── contracts/
│   └── rest-api.md
└── tasks.md
```

### Source Code (repository root)

```text
packages/shared/src/
├── pages.ts                    # extend public page/revision/resource schemas
├── content-storage.ts          # reuse/extend asset response schemas where needed
└── index.ts                    # export public API contracts

apps/web/app/api/
└── v1/
    ├── pages/
    │   ├── route.ts
    │   ├── [id]/route.ts
    │   ├── [id]/drafts/route.ts
    │   ├── [id]/properties/route.ts
    │   ├── [id]/revisions/route.ts
    │   ├── [id]/revisions/[version]/route.ts
    │   └── [id]/revisions/[version]/publication/route.ts
    ├── pages/by-path/[...path]/route.ts
    ├── assets/route.ts
    ├── assets/[id]/route.ts
    ├── assets/[id]/content/route.ts
    └── search/pages/route.ts

apps/web/src/server/
├── api/
│   ├── openapi-schemas.ts      # register public schemas for next-openapi-gen
│   ├── errors.ts               # reuse stable error mapping
│   └── pagination.ts           # reuse for bounded public lists
└── services/
    ├── pages.ts                # shared capabilities, extended if needed
    ├── revisions.ts            # publish behavior
    ├── content-assets.ts       # upload/read behavior
    └── public-content.ts       # optional thin service facade for stable DTO mapping only

apps/web/e2e/
└── public-wiki-api.spec.ts
```

**Structure Decision**: Keep the current monorepo layout. Public routes live
under `apps/web/app/api/v1/` as the stable external REST surface. Business
logic remains in `apps/web/src/server/services/`; a `public-content` service may
map shared service results into stable DTOs but must not own page/revision/asset
business decisions. Shared Zod schemas live in `packages/shared`.

## Complexity Tracking

No constitution violations or complexity exceptions are required.

## Phase 0: Research

See [research.md](./research.md).

## Phase 1: Design & Contracts

See [data-model.md](./data-model.md), [contracts/rest-api.md](./contracts/rest-api.md), and [quickstart.md](./quickstart.md).

### Post-Design Constitution Check

PASS. The completed design keeps `/api/v1` as a stable contract layer over
existing services, requires first-party client-side CRUD to prefer that same
contract when available, and introduces no extra deployment dependency. The
stale-update guard, DTO mapping, and search/list pagination are contract-level
behaviors backed by shared validation and services rather than separate page
business logic.
