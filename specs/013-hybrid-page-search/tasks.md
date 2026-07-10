# Tasks: Hybrid Page Search

**Input**: Design documents from `/specs/013-hybrid-page-search/`
**Prerequisites**: [plan.md](./plan.md), [spec.md](./spec.md), [research.md](./research.md), [data-model.md](./data-model.md), [page-search contract](./contracts/page-search.md), [quickstart.md](./quickstart.md)

**Tests**: Required. The specification contains acceptance scenarios and the project guidance requires unit, route, E2E, build, and Docker verification.

**Organization**: Tasks are grouped by user story. Shared database, schema, and persistence prerequisites are completed before story work so each later story is independently verifiable against the same API contract.

## Format: `[ID] [P?] [Story] Description`

- **[P]**: Can be worked on in parallel after its listed dependencies are complete.
- **[US#]**: User story the task serves. Story labels appear only within user-story phases.
- Every task includes its concrete file path.

## Phase 1: Setup and baseline

**Purpose**: Establish the current behavior and test command baseline without changing the feature contract.

- [X] T001 Record baseline lint, typecheck, unit-test, E2E, build, and Docker commands from `package.json`, `apps/web/package.json`, and `docker/Dockerfile` before editing feature files.
- [X] T002 Review the legacy search compatibility assertions in `apps/web/app/api/v1/search/public-page-search-routes.test.ts` and the current keyword implementation in `apps/web/src/server/services/public-content.ts` before adding POST behavior.

---

## Phase 2: Foundational contract, persistence, and migration

**Purpose**: Add the shared schema and additive data model that every hybrid request and behavior event relies on.

**⚠️ CRITICAL**: Complete this phase before implementing any user-story UI or route behavior.

- [X] T003 [P] Add discriminated hybrid-query and behavior request schemas plus hybrid result/semantic-state response schemas in `packages/shared/src/pages.ts` while retaining legacy GET search types unchanged.
- [X] T004 [P] Add documented mirrors of the hybrid POST schemas and response fields in `apps/web/src/server/api/openapi-schemas.ts`.
- [X] T005 [P] Define `search_behavior_action`, `searchRecords`, `searchBehaviors`, relationships, checks, and analysis indexes in `apps/web/src/server/db/schema/enums.ts` and `apps/web/src/server/db/schema/index.ts`.
- [X] T006 Generate and inspect the additive Drizzle migration and metadata for the new enum/tables under `apps/web/src/server/db/migrations/` and `apps/web/src/server/db/migrations/meta/`; do not run handwritten DDL.
- [X] T007 Create failing idempotency, ownership, foreign-key, page/action-shape, and privacy tests for search records and behavior events in `apps/web/src/server/services/search-analytics.test.ts`.
- [X] T008 Implement the focused, best-effort-safe search record and behavior persistence service in `apps/web/src/server/services/search-analytics.ts`, including actor/session ownership validation and conflict-safe event insertion.
- [X] T009 Add fixture cleanup for `searchBehaviors` and `searchRecords` in the affected server test setup files under `apps/web/src/server/services/*.test.ts`.

**Checkpoint**: The shared POST contract compiles, the generated migration represents only additive changes, and duplicate persistence requests produce one logical record.

---

## Phase 3: User Story 1 — Find a page from the header (Priority: P1) 🎯 MVP

**Goal**: A reader can open centered Header search, type at least two characters, receive a current unified keyword/semantic result list with excerpts, and open a result directly.

**Independent Test**: On a readable page, focus Header search, type a two-or-more-character query that has literal and/or semantic matches, wait for the latest result list, and activate a result to navigate to its canonical page URL.

### Tests for User Story 1

- [X] T010 [P] [US1] Extend keyword/public hybrid contract tests for POST query validation, idempotent search-record reuse, and unchanged GET `{items,nextCursor}` behavior in `apps/web/app/api/v1/search/public-page-search-routes.test.ts`.
- [ ] T011 [P] [US1] Add hybrid candidate merge tests for RRF ordering, page-ID de-duplication, keyword/semantic excerpt selection, zero results, and semantic reduced-coverage fallback in `apps/web/src/server/services/public-content-read.test.ts`.
- [ ] T012 [P] [US1] Add vector-candidate permission and action-lifecycle regression tests in `apps/web/src/server/services/ai-retrieval.test.ts`.

### Implementation for User Story 1

- [ ] T013 [US1] Extract a reusable permission-filtered vector candidate/result reader from the existing action flow in `apps/web/src/server/services/ai-retrieval.ts` without changing existing semantic-search semantics.
- [X] T014 [US1] Extend keyword search and add the hybrid query orchestration, RRF merge, deterministic tie breaking, visibility filtering, semantic-state update, and best-effort search-record write in `apps/web/src/server/services/public-content.ts`.
- [X] T015 [US1] Implement the idempotent `kind: "query"` POST adapter on the existing resource, retaining the current GET adapter and OpenAPI annotations in `apps/web/app/api/v1/search/pages/route.ts`.
- [X] T016 [P] [US1] Add localized Header search placeholder, two-character prompt, searching, no-results, reduced-coverage, and generic-error text in `apps/web/src/i18n/locales/en.ts` and `apps/web/src/i18n/locales/zh.ts`.
- [X] T017 [US1] Create the accessible centered input, overlay, live status/result region, request-abort/current-request guard, bounded same-resource polling, and canonical result links in `apps/web/src/components/search/HeaderHybridSearch.tsx`.
- [X] T018 [US1] Replace the centered `page-title` rendering with `HeaderHybridSearch` while preserving edge controls and editor behavior in `apps/web/src/components/layout/Header.tsx`.
- [X] T019 [US1] Add Header overlay, second-character threshold, latest-response-wins, excerpt, and direct canonical navigation coverage in `apps/web/e2e/header-hybrid-search.spec.ts`.
- [X] T020 [US1] Update centered-title assumptions to stable page/header assertions in `apps/web/e2e/navigation.spec.ts`.

**Checkpoint**: US1 is independently usable with keyword-only fallback, and an eligible actor receives one merged list without stale or duplicate results.

---

## Phase 4: User Story 2 — Leave search predictably (Priority: P2)

**Goal**: Escape reliably leaves active search, clears transient state, restores focus, leaves the reader on the original page, and creates exactly one Escape behavior event.

**Independent Test**: Open Header search on a readable page, enter a qualified query, press Escape once, and verify the overlay closes, focus returns, URL remains unchanged, and one matching Escape behavior is persisted.

### Tests for User Story 2

- [X] T021 [P] [US2] Add route tests for `kind: "behavior"` Escape validation, owner/session isolation, idempotent `204`, and non-blocking persistence failures in `apps/web/app/api/v1/search/public-page-search-routes.test.ts`.
- [X] T022 [P] [US2] Add Escape close, focus restoration, current-page preservation, and exactly-once event assertions in `apps/web/e2e/header-hybrid-search.spec.ts`.

### Implementation for User Story 2

- [X] T023 [US2] Add the `kind: "behavior"` Escape branch to the existing POST resource and delegate to `search-analytics` in `apps/web/app/api/v1/search/pages/route.ts`.
- [X] T024 [US2] Add one-shot Escape event emission, query/result clearing, request cancellation, document listener cleanup, and prior-focus restoration in `apps/web/src/components/search/HeaderHybridSearch.tsx`.

**Checkpoint**: Escape is inert outside search mode, reliably ends active search mode, and does not create duplicate behavior records on repeated key events.

---

## Phase 5: User Story 3 — Analyze search and selection behavior (Priority: P2)

**Goal**: Product analysis can link every qualified search to explicit result-open or Escape outcomes without retaining page content or creating duplicate rows.

**Independent Test**: Perform a qualified search and open a result, then perform another and Escape; inspect persistence to confirm one query record per attempt and one separately linked behavior record per explicit outcome.

### Tests for User Story 3

- [X] T025 [P] [US3] Extend `apps/web/src/server/services/search-analytics.test.ts` with query-count/semantic-state updates, anonymous session attribution, selected-page validation, and no-excerpt/no-result-payload assertions.
- [X] T026 [P] [US3] Add `result_open` route tests for readable-page revalidation, cross-owner non-disclosure, duplicate event IDs, and analytics-failure non-blocking behavior in `apps/web/app/api/v1/search/public-page-search-routes.test.ts`.
- [X] T027 [P] [US3] Add result-click `keepalive`/exactly-once analytics coverage in `apps/web/e2e/header-hybrid-search.spec.ts`.

### Implementation for User Story 3

- [X] T028 [US3] Complete behavior-service result-open validation and search-record aggregate/semantic-state update paths in `apps/web/src/server/services/search-analytics.ts`.
- [X] T029 [US3] Add the `result_open` behavior route branch, selected-page permission recheck, and conflict-safe success response in `apps/web/app/api/v1/search/pages/route.ts`.
- [X] T030 [US3] Generate per-query and per-event UUIDs, send one best-effort `result_open` event with `keepalive`, and allow native navigation to continue in `apps/web/src/components/search/HeaderHybridSearch.tsx`.

**Checkpoint**: Search demand and user outcomes are separately queryable, linked, idempotent, and do not delay result navigation or expose content in analytics storage.

---

## Phase 6: User Story 4 — Keep search safe and compatible (Priority: P3)

**Goal**: Hybrid search respects page visibility, preserves legacy clients, merges duplicate candidates, and degrades safely when semantic retrieval is unavailable.

**Independent Test**: Search as an actor who cannot read a known matching page and verify no trace of it is returned; repeat through legacy GET and hybrid POST and verify GET compatibility plus generic keyword fallback.

### Tests for User Story 4

- [X] T031 [P] [US4] Add no-disclosure tests for unreadable keyword/vector candidates, result counts, excerpts, and semantic state in `apps/web/src/server/services/public-content-read.test.ts` and `apps/web/src/server/services/ai-retrieval.test.ts`.
- [ ] T032 [P] [US4] Add route-level compatibility tests for legacy GET callers, unauthorized semantic enrichment, and generic unavailable/failed coverage states in `apps/web/app/api/v1/search/public-page-search-routes.test.ts`.

### Implementation for User Story 4

- [X] T033 [US4] Apply the canonical page-read visibility filter to every vector candidate before merge and ensure unavailable semantic enrichment returns only safe keyword results in `apps/web/src/server/services/ai-retrieval.ts` and `apps/web/src/server/services/public-content.ts`.
- [X] T034 [US4] Finalize public schema descriptions and route annotations for the existing search resource in `apps/web/src/server/api/openapi-schemas.ts` and `apps/web/app/api/v1/search/pages/route.ts`.

**Checkpoint**: Protected pages cannot be inferred through hybrid search, while unchanged GET clients remain fully compatible and keyword search remains useful without AI.

---

## Phase 7: Polish and cross-cutting verification

**Purpose**: Regenerate public artifacts and prove the finished feature through the repository's required checks.

- [X] T035 Regenerate the public API specification from schemas and annotations with `apps/web/package.json` command `openapi:generate`, then review generated `apps/web/public/openapi.json`.
- [X] T036 [P] Run targeted service and route suites for the feature from `apps/web/src/server/services/search-analytics.test.ts`, `apps/web/src/server/services/public-content-read.test.ts`, `apps/web/src/server/services/ai-retrieval.test.ts`, and `apps/web/app/api/v1/search/public-page-search-routes.test.ts`.
- [X] T037 [P] Run the Header/browser journeys in `apps/web/e2e/header-hybrid-search.spec.ts` and `apps/web/e2e/navigation.spec.ts`.
- [ ] T038 Run repository lint, typecheck, unit tests, and build via `package.json` and `apps/web/package.json` scripts.
- [ ] T039 Build the deployment image using `docker/Dockerfile` and verify the feature introduces no extra runtime service in `docker-compose.yml`.
- [ ] T040 Reconcile implemented behavior with [quickstart.md](./quickstart.md), [contracts/page-search.md](./contracts/page-search.md), and [spec.md](./spec.md), updating those feature documents only for verified implementation-level deviations.

---

## Dependencies and execution order

```text
Phase 1 baseline
    ↓
Phase 2 shared schemas + migration + analytics service
    ↓
US1 Header hybrid search (MVP)
    ├──→ US2 Escape lifecycle
    ├──→ US3 result-open analytics
    └──→ US4 permission/compatibility hardening
              ↓
       Phase 7 generated artifacts and full verification
```

### Story dependencies

- **US1 (P1)** depends on Phase 2. It is the MVP and independently delivers Header discovery, keyword fallback, semantic enrichment, and direct navigation.
- **US2 (P2)** depends on US1 because it extends the same overlay lifecycle; it has no dependency on result-open analytics.
- **US3 (P2)** depends on Phase 2 and US1's query lifecycle; it can proceed in parallel with US2 after US1's stable Header component exists.
- **US4 (P3)** depends on the hybrid service introduced by US1 and may proceed in parallel with US2/US3 once candidate merge and route POST exist.

## Parallel execution examples

### Foundational phase

```text
Parallel after T002:
- T003: shared schemas in packages/shared/src/pages.ts
- T004: OpenAPI schema mirrors in apps/web/src/server/api/openapi-schemas.ts
- T005: analytics schema in apps/web/src/server/db/schema/
```

### User Story 1

```text
Parallel before implementation:
- T010: route contract tests
- T011: hybrid merge service tests
- T012: vector/action tests

Parallel with server work after T015:
- T016: i18n dictionaries
```

### Post-MVP stories

```text
After US1 is stable, separate owners can proceed in parallel:
- US2: T021–T024 (Escape lifecycle)
- US3: T025–T030 (analytics and result-open)
- US4: T031–T034 (permission and compatibility hardening)
```

## Implementation strategy

### MVP first

1. Complete Phases 1 and 2.
2. Complete US1 through T020.
3. Verify the Header can search, show a current merged list, degrade to keyword results, and navigate to a result.
4. Stop for a focused review before layering Escape and detailed analytics behavior.

### Incremental delivery

1. Ship US1 after its independent test passes.
2. Add US2 to make the overlay safely dismissible.
3. Add US3 to complete the requested analytics loop.
4. Add US4 hardening and then execute Phase 7 before release.

## Format validation

- **Total tasks**: 40 (T001–T040).
- **Story task counts**: US1: 11; US2: 4; US3: 6; US4: 4; setup/foundation/polish: 15.
- Every task follows the required checkbox, sequential ID, optional `[P]`, story-label, and concrete-file-path format.
