# Tasks: Complementary Page Search Engines

**Input**: Design documents from `/specs/017-pg-trgm-search/`
**Prerequisites**: [plan.md](./plan.md), [spec.md](./spec.md), [research.md](./research.md), [data-model.md](./data-model.md), [page-search contract](./contracts/page-search.md), [quickstart.md](./quickstart.md)

**Tests**: Required. The feature specification, constitution, and project instructions require service, contract, integration, and browser coverage for the changed database, permission, API, and interactive-search behavior.

**Organization**: Tasks are grouped by user story so that each capability can be tested independently once the shared foundation is complete.

## Format: `[ID] [P?] [Story] Description`

- **[P]** marks work that can be completed in parallel because it touches a different file and has no unfinished dependency.
- **[US#]** maps a task to the corresponding user story in [spec.md](./spec.md).
- Every task includes an exact target path.

## Phase 1: Setup (Shared Infrastructure)

**Purpose**: Establish reusable test data and a server-only home for the search subsystem.

- [X] T001 Create deterministic readable/unreadable English, Chinese, and semantic-search fixtures in `apps/web/src/server/services/search/test-support.ts`
- [X] T002 Create the server search module export boundary in `apps/web/src/server/services/search/index.ts`

---

## Phase 2: Foundational (Blocking Prerequisites)

**Purpose**: Add the persistent capability lifecycle, stable shared contracts, and permission-safe internal boundaries that all user stories require.

**⚠️ CRITICAL**: No user-story implementation begins until this phase is complete.

- [X] T003 Extend search settings, search records, capability-run enums, relations, and constraints in `apps/web/src/server/db/schema/index.ts`
- [X] T004 Generate and review the additive Drizzle migration and metadata under `apps/web/src/server/db/migrations/` and `apps/web/src/server/db/migrations/meta/` without duplicating existing `pg_trgm` or full-text indexes
- [X] T005 [P] Extend full-text/fuzzy capability settings validation and exports in `packages/shared/src/search-settings.ts` and `packages/shared/src/index.ts`
- [X] T006 [P] Add stable capability-state and engine-source response schemas, then update OpenAPI schema tests in `packages/shared/src/pages.ts`, `apps/web/src/server/api/openapi-schemas.ts`, and `apps/web/src/server/api/openapi-schemas.test.ts`
- [X] T007 Add failing idempotency, capability-snapshot, and per-engine-run lifecycle tests in `apps/web/src/server/services/search-analytics.test.ts`
- [X] T008 Implement owned search-record snapshots and `search_engine_runs` persistence in `apps/web/src/server/services/search-analytics.ts`
- [X] T009 [P] Define server-only `SearchEngine`, `SearchCandidate`, stable capability IDs, deadlines, and lifecycle outcomes in `apps/web/src/server/services/search/types.ts`
- [X] T010 Implement the explicit static adapter registry in `apps/web/src/server/services/search/registry.ts`
- [X] T011 Add failing central projection tests for published state, space, locale, and read permission in `apps/web/src/server/services/search/candidate-projection.test.ts`
- [X] T012 Implement central permission-safe candidate hydration and public-result projection in `apps/web/src/server/services/search/candidate-projection.ts`

**Checkpoint**: The schema, durable attempt/run ownership, stable API vocabulary, registry, and shared visibility boundary are ready. User stories can now proceed without creating another search route or permission path.

---

## Phase 3: User Story 1 - Find pages through complementary search capabilities (Priority: P1) 🎯 MVP

**Goal**: Return high-quality readable results for known terms, Chinese fragments/near text, and exact matches through independently testable full-text, fuzzy, and already-completed semantic contributions.

**Independent Test**: With all capabilities enabled and a completed semantic action available, a readable fixture set returns term matches through `full_text` and Chinese fragment/one-character near matches through `fuzzy`; exact path/title/term results rank ahead of otherwise comparable approximate results, while unreadable pages never appear.

### Tests for User Story 1

- [ ] T013 [P] [US1] Add exact-match protection, page-ID de-duplication, and rank-fusion unit tests in `apps/web/src/server/services/search/ranking.test.ts`
- [ ] T014 [P] [US1] Add term and multi-term query-plan/result integration coverage using the indexed `simple` expression in `apps/web/src/server/services/search/postgres-tsvector.integration.test.ts`
- [ ] T015 [P] [US1] Add Chinese fragment, one-character near-match, mixed-script, and low-similarity rejection coverage in `apps/web/src/server/services/search/postgres-trigram.integration.test.ts`
- [ ] T016 [P] [US1] Add completed semantic-action contribution/fusion tests in `apps/web/src/server/services/search/engines/pgvector-semantic.test.ts` and legacy GET compatibility/permission expectations in `apps/web/src/server/services/public-content-read.test.ts`
- [ ] T017 [P] [US1] Add unchanged GET request/response-envelope coverage in `apps/web/app/api/v1/search/public-page-search-routes.test.ts`

### Implementation for User Story 1

- [ ] T018 [US1] Implement deterministic exact-match protection and reciprocal-rank fusion without comparing native scores in `apps/web/src/server/services/search/ranking.ts`
- [ ] T019 [US1] Implement the `full_text` adapter with the existing `tsvector('simple', ...)` expressions in `apps/web/src/server/services/search/engines/postgres-tsvector.ts`
- [ ] T020 [US1] Implement the `fuzzy` adapter using bounded `pg_trgm` similarity candidates and engine-local ranking in `apps/web/src/server/services/search/engines/postgres-trigram.ts`
- [ ] T021 [US1] Implement completed semantic-action candidate retrieval plus immediate three-capability execution, isolated failures, and fused candidate output in `apps/web/src/server/services/search/engines/pgvector-semantic.ts` and `apps/web/src/server/services/search/coordinator.ts`
- [ ] T022 [US1] Refactor legacy keyword search to use enabled immediate lexical capabilities without starting semantic work in `apps/web/src/server/services/public-content.ts`
- [ ] T023 [US1] Add `EXPLAIN (ANALYZE, BUFFERS)` assertions for the final full-text and trigram predicates in `apps/web/src/server/services/search/postgres-search-plan.integration.test.ts`

**Checkpoint**: Full-text and fuzzy GET retrieval remain independently testable, preserve permissions, and prove the existing PostgreSQL indexes are used; the coordinator also fuses an already-ready semantic contribution.

---

## Phase 4: User Story 2 - Receive progressive results without waiting for every engine (Priority: P1)

**Goal**: Start enabled engines together, return immediate lexical results, and progressively merge resumable semantic results through the existing idempotent POST lifecycle.

**Independent Test**: With all capabilities enabled and semantic deliberately delayed, the first Header POST snapshot contains lexical results and `semantic: pending`; a retry with the same IDs later returns one merged list with semantic contribution. A failed engine leaves completed results available and exposes no internal diagnostic.

### Tests for User Story 2

- [ ] T024 [P] [US2] Add concurrent `Promise.allSettled`, deadline, pending/resume, and partial-failure tests in `apps/web/src/server/services/search/coordinator.test.ts`
- [ ] T025 [P] [US2] Add semantic action continuation and `timed_out` compatibility mapping tests in `apps/web/src/server/services/search/engines/pgvector-semantic.test.ts`
- [ ] T026 [P] [US2] Extend progressive POST snapshot, engine-state, fused-source, and non-disclosure tests in `apps/web/src/server/services/public-content-read.test.ts`
- [ ] T027 [P] [US2] Extend additive POST response and behavior-route contract tests in `apps/web/app/api/v1/search/public-page-search-routes.test.ts`
- [ ] T028 [P] [US2] Add delayed semantic, stale-query, progressive polling, and source-badge browser coverage in `apps/web/e2e/header-hybrid-search.spec.ts`

### Implementation for User Story 2

- [ ] T029 [US2] Extend the semantic adapter to initiate and resume the existing AI-action/pgvector lifecycle for pending search attempts in `apps/web/src/server/services/search/engines/pgvector-semantic.ts`
- [ ] T030 [US2] Extend the coordinator to snapshot enabled capabilities, create/resume engine runs, invoke adapters concurrently, and return safe `engineStates` in `apps/web/src/server/services/search/coordinator.ts`
- [ ] T031 [US2] Replace the Header hybrid keyword/semantic branches with coordinator snapshots while retaining `semanticState` and conceptual `matchSources` in `apps/web/src/server/services/public-content.ts`
- [ ] T032 [US2] Update the existing POST route's OpenAPI-facing response usage without adding a search path in `apps/web/app/api/v1/search/pages/route.ts`
- [ ] T033 [US2] Create TanStack Query-based POST polling keyed by search record and overlay session in `apps/web/src/hooks/useHybridPageSearch.ts`
- [ ] T034 [US2] Refactor transient overlay state and progressive server-state rendering to use the new hook in `apps/web/src/components/search/HeaderHybridSearch.tsx`

**Checkpoint**: The existing Header search resource returns progressive, de-duplicated, permission-safe snapshots; semantic work never blocks lexical results and no new transport route is introduced.

---

## Phase 5: User Story 3 - Control each search capability safely (Priority: P2)

**Goal**: Let administrators independently control full-text, fuzzy, and semantic capability participation while preserving at least one lexical path and immutable in-flight snapshots.

**Independent Test**: An administrator can persist each capability setting and new search attempts use it; saving both lexical switches off fails. A non-administrator cannot read or mutate the settings, and existing attempts retain their accepted capability set.

### Tests for User Story 3

- [ ] T035 [P] [US3] Add settings defaults, persistence, lexical-safety validation, and authorization tests in `apps/web/src/server/services/search-settings.test.ts`
- [ ] T036 [P] [US3] Add settings GET/PATCH validation and authorization route tests in `apps/web/app/api/settings/search/route.test.ts`
- [ ] T037 [P] [US3] Add administrator capability-switch persistence and invalid lexical configuration coverage in `apps/web/e2e/admin-search-settings.spec.ts`

### Implementation for User Story 3

- [ ] T038 [US3] Persist and validate independent capability settings through the existing service in `apps/web/src/server/services/search-settings.ts`
- [ ] T039 [US3] Apply the expanded validated settings input/output through the existing admin route in `apps/web/app/api/settings/search/route.ts`
- [ ] T040 [P] [US3] Add full-text and fuzzy capability labels, descriptions, validation, and saved-state messages in `apps/web/messages/en.json`, `apps/web/messages/zh.json`, and `apps/web/src/i18n/keys.ts`
- [ ] T041 [US3] Render and submit the three independent capability controls with accessible validation feedback in `apps/web/src/components/admin/search/SearchSettingsPanel.tsx`

**Checkpoint**: Administrators can safely control capability participation from the existing settings surface, and every new attempt gets a durable, predictable capability snapshot.

---

## Phase 6: User Story 4 - Evolve search technology without changing the product contract (Priority: P3)

**Goal**: Prove that a capability implementation can change behind the registry without changing routes, settings semantics, visibility rules, or client result-list behavior.

**Independent Test**: Replace one registered adapter with a fake implementation that returns ready and pending states. Coordinator, permission, fusion, and HTTP contract tests pass using the same stable capability ID and settings input.

### Tests for User Story 4

- [ ] T042 [P] [US4] Add a fake replacement-adapter contract test covering ready, pending, failed, and safe error states in `apps/web/src/server/services/search/registry.test.ts`
- [ ] T043 [P] [US4] Add stable `engineSources` and no-diagnostic-leak regression coverage in `apps/web/src/server/services/search/candidate-projection.test.ts`

### Implementation for User Story 4

- [ ] T044 [US4] Make registry construction explicitly injectable for tests and future replacement adapters while retaining the production static registry in `apps/web/src/server/services/search/registry.ts`
- [ ] T045 [US4] Document the concrete adapter, coordinator, permission, and progressive-state implementation boundary in `docs/architecture/mandates.md`, `docs/architecture/project-structure.md`, and `docs/architecture/frontend-data-flow.md`

**Checkpoint**: A replacement capability adapter is demonstrably isolated from the REST resource, administration model, permission projection, and client-facing capability vocabulary.

---

## Phase 7: Polish & Cross-Cutting Concerns

**Purpose**: Regenerate derived contracts, validate operational behavior, preserve static reader delivery, and record the final verification evidence.

- [ ] T046 [P] Regenerate and verify the public REST artifact from updated schemas with `apps/web/src/server/api/openapi-schemas.ts` and `apps/web/public/openapi.json`
- [ ] T047 [P] Validate all added English and Chinese catalog keys with `apps/web/scripts/validate-i18n.mjs`
- [ ] T048 [P] Run the migration and capability quickstart scenarios, recording query-plan and state results in `specs/017-pg-trgm-search/quickstart.md`
- [ ] T049 Run focused Vitest, Playwright, lint, typecheck, and full test commands listed in `specs/017-pg-trgm-search/quickstart.md`
- [ ] T050 Build with Docker and verify `/search` plus anonymous published reader routes preserve the static/ISR build contract using `docker/Dockerfile` and `apps/web/app/(public)/search/page.tsx`

---

## Dependencies & Execution Order

### Phase Dependencies

- **Phase 1 — Setup**: Starts immediately.
- **Phase 2 — Foundational**: Depends on Phase 1 and blocks every user story.
- **Phase 3 — US1**: Depends on Phase 2; establishes usable complementary retrieval for immediately available results and is the MVP.
- **Phase 4 — US2**: Depends on Phase 2 and uses US1's lexical adapters and rank fusion to add progressive semantic behavior.
- **Phase 5 — US3**: Depends on Phase 2; its settings are consumed by US1 and US2, so complete it before the final integrated validation.
- **Phase 6 — US4**: Depends on Phase 4 because replacement proof exercises the completed coordinator lifecycle.
- **Phase 7 — Polish**: Depends on every desired story.

### User Story Dependencies

```text
Setup → Foundational
Foundational → US1 (complementary retrieval MVP)
Foundational + US1 → US2 (progressive multi-engine search)
Foundational → US3 (admin controls)
US2 → US4 (replacement contract proof)
US1 + US2 + US3 + US4 → Polish
```

### Parallel Opportunities

- Phase 2: T005/T006 and T007/T009 can proceed in parallel after T003; T010 begins after T009.
- US1: T013–T017 can be authored in parallel; T019 and T020 can be implemented in parallel after T018.
- US2: T024–T028 are independent test files; T029 can proceed while those tests are authored.
- US3: T035–T037 are independent test files, and T040 can proceed in parallel with T038/T039.
- US4: T042 and T043 are independent contract/regression test files.
- Polish: T046–T048 are independent before the complete verification in T049/T050.

## Parallel Example: User Story 2

```text
Task: "Add concurrent lifecycle tests in apps/web/src/server/services/search/coordinator.test.ts"
Task: "Add semantic adapter tests in apps/web/src/server/services/search/engines/pgvector-semantic.test.ts"
Task: "Add browser polling coverage in apps/web/e2e/header-hybrid-search.spec.ts"
```

## Implementation Strategy

### MVP First (User Story 1)

1. Complete Phases 1 and 2.
2. Complete US1 through T023.
3. Validate exact-term and Chinese fuzzy retrieval, legacy GET compatibility, permission filtering, and query plans independently.
4. Demo full-text, fuzzy, and already-ready semantic fusion before adding asynchronous semantic work.

### Incremental Delivery

1. Foundation + US1 delivers a safe full-text/fuzzy baseline with already-ready semantic fusion.
2. US2 adds concurrent, progressive semantic results on the established POST resource.
3. US3 adds administrator control and capability snapshots.
4. US4 proves future adapter replacement is safe.
5. Polish validates OpenAPI, i18n, migration behavior, tests, Docker build, and static reader delivery.

## Notes

- [P] tasks touch different files and have no incomplete dependency.
- Existing `GET /api/v1/search/pages` stays a pure read throughout the work.
- Do not create a new search route, duplicate existing `pg_trgm`/full-text indexes, or make a public reader route dynamic.
- Commit each completed logical group separately: foundation, lexical retrieval, progressive lifecycle, settings, and replacement/verification.
