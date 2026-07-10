# Implementation Plan: Hybrid Page Search

**Branch**: `013-hybrid-page-search` | **Date**: 2026-07-10 | **Spec**: [spec.md](./spec.md)
**Input**: Feature specification from `/specs/013-hybrid-page-search/spec.md`
**Depends on**: 004-system-ai-support, 007-public-wiki-api, 010-ai-curation-api

## Summary

Replace the centered header title with an accessible, overlay-based page search. From two characters onward, the header sends a retry-safe request to the existing page-search resource. The response immediately returns keyword candidates and, when permitted and configured, starts or resumes the existing asynchronous semantic-search action. Repeated requests for the same client search identifier return one merged, de-duplicated list once semantic candidates are ready. The UI polls that same existing path, so this feature adds no new search route.

The plan preserves the current `GET /api/v1/search/pages` contract for integrations. It adds a `POST` operation to that existing resource for the Header's hybrid lifecycle and behavior reporting. The POST is idempotent through client-generated identifiers. Two new additive tables retain query-level records and explicit result-open/Escape behaviors; they are not substitutes for the existing request-level API audit log.

## Technical Context

**Language/Version**: TypeScript 5.6, Node.js 20.9+ minimum
**Primary Dependencies**: Next.js 16.2, React 19.2, Drizzle ORM, Zod, pg-boss, PostgreSQL pgvector, TanStack Query, Tailwind CSS; no new runtime dependency
**Storage**: PostgreSQL 16+; two additive analytics tables, plus the existing page/revision and AI-action/index tables
**Testing**: Vitest 3 for service, schema, and route tests; Playwright for header interaction and browser-navigation coverage
**Target Platform**: Linux containers deployed through Docker Compose or Kubernetes
**Project Type**: Next.js App Router monorepo with a first-party web UI and shared REST/OpenAPI API
**Performance Goals**: 95% of qualified Header searches show current results within 1.5 seconds; semantic retrieval never blocks the immediate keyword result; no stale result is actionable after a newer input value
**Constraints**: Existing `GET /api/v1/search/pages` remains response-compatible; no new public search path; all result candidates pass page-read visibility; external embedding calls remain asynchronous; analytics writes are idempotent and best-effort; no new deployment service
**Scale/Scope**: One active browser search session per Header overlay; a new search record for each distinct qualified input attempt; ranked UI limit bounded to 20 results; no analytics dashboard, saved searches, or standalone search screen

No `NEEDS CLARIFICATION` items remain. Decisions and alternatives are recorded in [research.md](./research.md).

## Constitution Check

*Gate: must pass before Phase 0 research. Re-checked after Phase 1 design.*

| Principle / mandate | Status | Design evidence |
|---|---|---|
| P1 Simple Deployment | PASS | Uses PostgreSQL, pgvector, pg-boss, and current application image only. No queue, index, or analytics service is added. |
| P2 AI-native, vendor-independent | PASS | Reuses the provider-agnostic embedding/action flow; keyword search works when AI is absent. |
| P3 Portable AI memory | PASS | Semantic candidates remain a derived projection of page revisions; results are permission-scoped and include an excerpt from the retrieved revision. |
| P5 Permissions first-class | PASS | Keyword and vector candidates are filtered through the existing visibility policy before title, score, or excerpt is returned. Behavior logging revalidates a selected page. |
| P6 UI consistency | PASS | Header search uses existing tokens, `Input`, icons, localization, and shared layout rather than standalone styling assets. |
| P7 Async-first | PASS | Embedding/vector work starts through the existing AI-action/pg-boss lifecycle. The route never awaits an embedding provider. |
| P8 Version everything | PASS | Search analytics is additive observational data; it does not change page content or bypass page revisions. |
| P9 REST + OpenAPI | PASS | The existing page-search resource gains documented schemas and route annotations; generated OpenAPI is regenerated, never hand-edited. |
| P10 Explicit registration | PASS | The query and behavior POST bodies are discriminated; semantic state and retrieval contribution are explicit fields. |
| P11 Native navigation and URL contract | PASS | Selected results use canonical page URLs. The transient overlay is not a shareable destination or separate route; normal back/forward and opening results in a new tab remain native. |
| Frontend data-flow mandate | PASS | Server result data is obtained through REST/TanStack Query-compatible fetches; only transient focus/open/request state is local component state. No server response is placed in Zustand. |

**Anti-pattern check**: no rendered HTML becomes canonical content; no AI-specific page store is added; no vendor SDK or API is hard-coded; no duplicate search route is introduced; no bespoke visual system is added; no protected page existence is exposed. All gates pass after data-model and contract design.

## Project Structure

### Documentation

```text
specs/013-hybrid-page-search/
├── plan.md
├── research.md
├── data-model.md
├── quickstart.md
├── contracts/
│   └── page-search.md
└── tasks.md                    # Created later by /speckit.tasks
```

### Source changes

```text
apps/web/
├── app/api/v1/search/pages/route.ts                  # extend existing GET resource with idempotent POST
├── src/
│   ├── components/
│   │   ├── layout/Header.tsx                          # render HeaderHybridSearch in the title position
│   │   └── search/HeaderHybridSearch.tsx              # new overlay, fetch lifecycle, a11y, navigation
│   ├── i18n/locales/{en,zh}.ts                        # search mode text/statuses
│   ├── server/
│   │   ├── services/public-content.ts                 # keyword candidate reuse/visibility and hybrid facade
│   │   ├── services/ai-retrieval.ts                   # reusable permission-filtered vector candidates/action output
│   │   ├── services/search-analytics.ts               # new idempotent record/behavior persistence
│   │   ├── db/schema/{enums,index}.ts                 # tables, enum, relations, indexes
│   │   ├── db/migrations/                             # generated additive migration and metadata
│   │   └── api/openapi-schemas.ts                     # documented public request/response schemas
│   └── ...
└── e2e/header-hybrid-search.spec.ts                   # new browser behavior coverage

packages/shared/src/pages.ts                           # shared request/response schemas and types
apps/web/app/api/v1/search/public-page-search-routes.test.ts
apps/web/src/server/services/{public-content-read,ai-retrieval,search-analytics}.test.ts
apps/web/e2e/navigation.spec.ts                        # replace centered-title assertions with stable page/header assertions
```

**Structure decision**: retain the monorepo layout. The thin route adapter stays at the existing public search resource; page visibility and hybrid retrieval remain in the server service layer; analytics persistence is a focused service rather than logic in the route or Header component.

## Implementation Order

1. Define shared schemas, OpenAPI schemas, analytics enum/tables, relations, and generated migration.
2. Implement the analytics service and its idempotency/ownership tests before wiring UI events.
3. Extract a permission-filtered vector candidate representation from the existing semantic retrieval flow; retain current public semantic behavior as a regression constraint.
4. Add the idempotent hybrid `POST /api/v1/search/pages` operation and preserve current `GET` behavior byte-for-byte.
5. Build result merging (RRF ranking, page-id de-duplication, excerpt selection) and reduced-coverage behavior with route/service tests.
6. Add the Header overlay component, localization, stale-request guard, focus management, Escape handling, and native result links.
7. Add browser E2E coverage, regenerate OpenAPI, then run lint, typecheck, unit tests, E2E tests, and the project build.

## Complexity Tracking

| Violation | Why needed | Simpler alternative rejected because |
|---|---|---|
| None | — | — |

## Cross-References

- [Research decisions](./research.md)
- [Data model](./data-model.md)
- [Existing page-search contract extension](./contracts/page-search.md)
- [Implementation quickstart](./quickstart.md)
