# Implementation Plan: Complementary Page Search Engines

**Branch**: `codex/017-pg-trgm-search` | **Date**: 2026-07-14 | **Spec**: [spec.md](./spec.md)
**Input**: Feature specification from `/specs/017-pg-trgm-search/spec.md`
**Depends on**: 004-system-ai-support, 013-hybrid-page-search

## Summary

Refactor page retrieval into three independently enabled, explicitly registered capabilities: `full_text` (current PostgreSQL `tsvector`), `fuzzy` (current PostgreSQL `pg_trgm`), and `semantic` (current `pgvector` plus the existing AI-action lifecycle). The coordinator starts all enabled capabilities together, returns a permission-safe fused snapshot as soon as immediate engines finish, and lets the existing idempotent Header `POST /api/v1/search/pages` polling lifecycle incorporate later semantic results.

The stable boundary is the capability contract, not a PostgreSQL extension or AI provider. A replacement implementation therefore changes only an adapter and its explicit registry entry; the REST route, admin capability settings, candidate visibility projection, rank fusion, and Header flow stay intact. The legacy `GET` remains a pure compatible read and only invokes immediate lexical capabilities.

## Technical Context

**Language/Version**: TypeScript 5.6, Node.js 20.9+ minimum

**Primary Dependencies**: Next.js 16.2, React 19.2, Drizzle ORM, Zod, PostgreSQL 16+, pg-boss, pgvector, TanStack Query; no new runtime dependency

**Storage**: PostgreSQL 16+ using `tsvector` GIN expressions, existing content `pg_trgm` GIN indexes, a scoped partial `btree_gin` + title `pg_trgm` index, and derived `pgvector` knowledge chunks; additive settings and capability-run records

**Testing**: Vitest 3 service/schema/route tests, PostgreSQL integration tests with Chinese fixtures and `EXPLAIN (ANALYZE, BUFFERS)`, Playwright progressive Header search tests

**Target Platform**: Linux containers deployed through Docker Compose or Kubernetes; default database image `pgvector/pgvector:0.8.3-pg16`

**Project Type**: Next.js App Router monorepo with first-party web UI and shared REST/OpenAPI API

**Performance Goals**: 95% of qualified interactive searches return the initial immediate-engine snapshot within 500 ms; semantic enrichment never blocks it; 95% of Header interactions receive an updated result state within 1.5 seconds under the reference profile

**Constraints**: Existing GET envelope stays compatible and non-mutating; Header POST stays on the same resource and remains idempotent; enabled capabilities start concurrently; every candidate is permission-filtered before fusion; no raw engine score/diagnostic leaks; API responses are not cached; no default deployment service is added

**Scale/Scope**: Three initial capabilities, bounded UI limit of 20, one active Header search session, and one run per enabled capability per search record. The slice does not add an analytics dashboard, administrator ranking-weight controls, SSE, or a managed search service.

No `NEEDS CLARIFICATION` items remain. Research decisions are recorded in [research.md](./research.md).

## Constitution Check

*Gate: passed before Phase 0 research and re-checked after Phase 1 design.*

| Principle / mandate | Status | Design evidence |
|---|---|---|
| P1 Simple Deployment | PASS | Reuses PostgreSQL; migration `0013_scoped_trigram_search.sql` adds only `btree_gin` and a partial scoped title index, with no service, queue, or runtime dependency. |
| P2 AI-native, vendor-independent | PASS | `semantic` remains optional and uses the existing provider-neutral AI action flow. Full-text and fuzzy search remain usable with AI off. |
| P3 Portable AI memory | PASS | `pgvector` remains a rebuildable projection of page revisions. A capability adapter can be replaced without changing source content or public result semantics. |
| P5 Permissions first-class | PASS | Engines return internal candidates only; one coordinator-owned visibility projection filters every candidate before result, excerpt, count, or fusion. |
| P7 Async-first | PASS | Local PostgreSQL engines stay inside the request budget; external embedding/vector work remains an existing pg-boss action. Future long-running adapters use the same persisted run lifecycle rather than an in-process promise. |
| P9 REST + OpenAPI | PASS | The existing page-search resource receives additive schemas and regenerated OpenAPI. GET stays idempotent; POST remains the one interactive lifecycle resource. |
| P10 Explicit over implicit | PASS | All adapters are registered in one static registry under stable capability IDs. No filesystem discovery or global singleton is introduced. |
| Project structure / frontend data flow | PASS | Search orchestration is a server-service submodule. Header search snapshots and engine states are server state managed through TanStack Query; transient overlay and focus remain local UI state. |
| P12 Public content delivery | PASS — N/A | Search is an uncached, permission-dependent API interaction after hydration. It does not query or vary published reader ISR output, cache tags, or invalidation paths. |

**Anti-pattern check**: no new search route or default service; no synchronous embedding call; no engine-specific client contract; no raw content/index diagnostics in a response; no permission bypass; no session-bound public document. All gates pass after the design.

## Project Structure

### Documentation

```text
specs/017-pg-trgm-search/
├── plan.md
├── research.md
├── data-model.md
├── quickstart.md
├── contracts/
│   └── page-search.md
└── tasks.md                    # Created later by /speckit-tasks

docs/architecture/
├── mandates.md                 # binding search retrieval invariants
├── project-structure.md        # registered server search module boundary
└── frontend-data-flow.md       # progressive-search server/UI state boundary
```

### Source changes

```text
apps/web/
├── app/
│   ├── api/settings/search/route.ts                  # extend capability settings resource
│   └── api/v1/search/pages/route.ts                  # preserve GET; extend POST snapshot contract
├── src/
│   ├── components/
│   │   ├── admin/search/SearchSettingsPanel.tsx      # three capability controls
│   │   └── search/HeaderHybridSearch.tsx             # TanStack Query progressive polling
│   └── server/
│       ├── db/
│       │   ├── schema/index.ts                       # settings and capability-run relations
│       │   └── migrations/                           # additive settings/run and scoped-title-index migrations
│       └── services/
│           ├── public-content.ts                     # public facade and legacy GET projection
│           ├── search-analytics.ts                   # record/run persistence and idempotency
│           └── search/
│               ├── types.ts                          # stable capability, candidate, and lifecycle contracts
│               ├── registry.ts                       # explicit current-engine registration
│               ├── coordinator.ts                    # concurrent execution, resume, and safe aggregation
│               ├── ranking.ts                        # page-ID de-duplication and rank fusion
│               └── engines/
│                   ├── postgres-tsvector.ts          # current full_text adapter
│                   ├── postgres-trigram.ts           # current fuzzy adapter
│                   └── pgvector-semantic.ts          # current semantic/action adapter
└── tests and e2e/                                    # capability, contract, migration, and Header coverage

packages/shared/
└── src/
    ├── pages.ts                                      # additive engine state/source response schemas
    └── search-settings.ts                            # stable capability-setting schemas
```

**Structure Decision**: The feature stays within the binding `src/server/services/` business-logic boundary. `services/search/` is a named submodule with a static registry, so adapters do not leak into routes, `public-content.ts`, or client components. The database implementation remains private to adapters; shared schemas publish only stable capability IDs and user-safe lifecycle states.

## Complexity Tracking

| Addition | Why Needed | Simpler Alternative Rejected Because |
|---|---|---|
| `search_engine_runs` persistence | Each enabled capability must resume independently across the existing idempotent POST polling lifecycle and preserve the capability snapshot that accepted the query. | A single `semantic_state` field cannot represent concurrent full-text, fuzzy, and future asynchronous capabilities without serial coupling and ambiguous retries. |
| Explicit adapter registry and coordinator | Current engines already differ in query type, latency, and failure mode; replacements must not change API/UI semantics. | Extending `public-content.ts` with more conditionals would couple capability selection, SQL, AI actions, visibility, and response formatting, making replacement unsafe. |
