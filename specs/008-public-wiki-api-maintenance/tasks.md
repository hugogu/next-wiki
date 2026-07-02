# Tasks: Public Wiki API Maintenance & Intelligence

**Input**: Design documents from `/specs/008-public-wiki-api-maintenance/`
**Prerequisites**: [plan.md](./plan.md) (required), [spec.md](./spec.md) (required for user stories), [research.md](./research.md), [data-model.md](./data-model.md), [contracts/](./contracts/)
**Tests**: Tasks include tests because the feature spec defines acceptance scenarios for every user story and regression requirements.
**Organization**: Tasks are grouped by user story to enable independent implementation and testing of each story.

## Format: `[ID] [P?] [Story] Description`

- **[P]**: Can run in parallel (different files, no dependencies)
- **[Story]**: Which user story this task belongs to (US1..US6)
- Include exact file paths in descriptions
- Completed tasks are marked `[x]` because this feature has already been implemented.

---

## Phase 1: Setup (Shared Infrastructure)

**Purpose**: Add the one new dependency and prepare the shared schema package.

- [x] T001 Add `diff` npm package to `apps/web` (`pnpm --filter @next-wiki/web add diff`)
- [x] T002 [P] Add `@types/diff` dev dependency to `apps/web`
- [x] T003 Add batch/backlink/diff/stats/similar Zod schemas to `packages/shared/src/pages.ts`

---

## Phase 2: Foundational (Blocking Prerequisites)

**Purpose**: Extend the public-content service layer so every user story can build on a common implementation surface. No user story work can begin until this phase is complete.

- [x] T004 Add `deletePage` signature to `apps/web/src/server/services/public-content.ts`
- [x] T005 [P] Add `getBacklinks` signature to `apps/web/src/server/services/public-content.ts`
- [x] T006 [P] Add `getDiff` signature to `apps/web/src/server/services/public-content.ts`
- [x] T007 [P] Add `batchCreatePages` signature to `apps/web/src/server/services/public-content.ts`
- [x] T008 [P] Add `getStats` signature to `apps/web/src/server/services/public-content.ts`
- [x] T009 [P] Add `findSimilar` signature to `apps/web/src/server/services/public-content.ts`
- [x] T010 Register new OpenAPI schemas in `apps/web/src/server/api/openapi-schemas.ts`

**Checkpoint**: Foundation service layer and shared schemas ready.

---

## Phase 3: User Story 1 — Delete / Archive Pages (Priority: P0) 🎯 MVP

**Goal**: Editors and Admins can soft-delete pages through the public API.

**Independent Test**: Send `DELETE /v1/pages/{id}` with an Editor key and verify
the page disappears from default list/search, then reappears with
`status=deleted`.

### Tests for User Story 1

- [x] T011 [P] [US1] Write route test for delete success in `apps/web/app/api/v1/pages/[id]/route.test.ts`
- [x] T012 [P] [US1] Write route test for delete 404 in `apps/web/app/api/v1/pages/[id]/route.test.ts`
- [x] T013 [P] [US1] Write MCP tool test for `delete_page` in `packages/mcp-server/src/tools/delete-page.test.ts`

### Implementation for User Story 1

- [x] T014 [US1] Implement `deletePage` service in `apps/web/src/server/services/public-content.ts`
- [x] T015 [US1] Add `DELETE` handler to `apps/web/app/api/v1/pages/[id]/route.ts`
- [x] T016 [US1] Update `listPagesInternal` to include deleted pages when `status=deleted` or `status=all`
- [x] T017 [US1] Add `deletePage` client method in `packages/mcp-server/src/api-client.ts`
- [x] T018 [P] [US1] Add `delete_page` tool in `packages/mcp-server/src/tools/delete-page.ts`
- [x] T019 [US1] Register `delete_page` tool in `packages/mcp-server/src/server.ts`

**Checkpoint**: User Story 1 fully functional and independently testable.

---

## Phase 4: User Story 2 — Backlinks (Priority: P0)

**Goal**: Callers can query which pages link to a target page.

**Independent Test**: Create two pages that link to a third, call
`GET /v1/pages/{id}/backlinks`, and confirm both referencing pages appear.

### Tests for User Story 2

- [x] T020 [P] [US2] Write service test for `getBacklinks` in `apps/web/src/server/services/public-content.test.ts`
- [x] T021 [P] [US2] Write route test for backlinks in `apps/web/app/api/v1/pages/[id]/backlinks/route.test.ts`
- [x] T022 [P] [US2] Write MCP tool test for `get_backlinks` in `packages/mcp-server/src/tools/get-backlinks.test.ts`

### Implementation for User Story 2

- [x] T023 [US2] Implement `getBacklinks` service in `apps/web/src/server/services/public-content.ts`
- [x] T024 [US2] Add `GET` handler to `apps/web/app/api/v1/pages/[id]/backlinks/route.ts`
- [x] T025 [US2] Add `PublicBacklink` / `PublicBacklinksResponse` schemas to `apps/web/src/server/api/openapi-schemas.ts`
- [x] T026 [US2] Add `getBacklinks` client method in `packages/mcp-server/src/api-client.ts`
- [x] T027 [P] [US2] Add `get_backlinks` tool in `packages/mcp-server/src/tools/get-backlinks.ts`
- [x] T028 [US2] Register `get_backlinks` tool in `packages/mcp-server/src/server.ts`

**Checkpoint**: User Stories 1 and 2 both work independently.

---

## Phase 5: User Story 3 — Revision Diff (Priority: P0)

**Goal**: Callers can request a structured diff between two revisions of a page.

**Independent Test**: Edit a page to create v1 and v2, call
`GET /v1/pages/{id}/revisions/2/diff?against=1`, and confirm the response
contains the expected added/removed lines with correct counts.

### Tests for User Story 3

- [x] T029 [P] [US3] Write service test for `getDiff` in `apps/web/src/server/services/public-content.test.ts`
- [x] T030 [P] [US3] Write route test for diff in `apps/web/app/api/v1/pages/[id]/revisions/[version]/diff/route.test.ts`
- [x] T031 [P] [US3] Write MCP tool test for `get_diff` in `packages/mcp-server/src/tools/get-diff.test.ts`

### Implementation for User Story 3

- [x] T032 [US3] Implement `getDiff` service in `apps/web/src/server/services/public-content.ts`
- [x] T033 [P] [US3] Add thin `wiki-diff.ts` wrapper in `apps/web/src/server/services/wiki-diff.ts`
- [x] T034 [US3] Add `GET` handler to `apps/web/app/api/v1/pages/[id]/revisions/[version]/diff/route.ts`
- [x] T035 [US3] Add `PublicRevisionDiffQuery` / `PublicRevisionDiffResponse` schemas to `apps/web/src/server/api/openapi-schemas.ts`
- [x] T036 [US3] Add `getDiff` client method in `packages/mcp-server/src/api-client.ts`
- [x] T037 [P] [US3] Add `get_diff` tool in `packages/mcp-server/src/tools/get-diff.ts`
- [x] T038 [US3] Register `get_diff` tool in `packages/mcp-server/src/server.ts`

**Checkpoint**: User Stories 1, 2, and 3 work independently.

---

## Phase 6: User Story 4 — Batch Create Pages (Priority: P1)

**Goal**: Editors and Admins can create up to 50 pages atomically.

**Independent Test**: Send `POST /v1/pages/batch` with two page definitions,
confirm both are created, then send a conflicting batch and confirm 409 with
zero pages created.

### Tests for User Story 4

- [x] T039 [P] [US4] Write service test for `batchCreatePages` success in `apps/web/src/server/services/public-content.test.ts`
- [x] T040 [P] [US4] Write service test for `batchCreatePages` atomic rollback in `apps/web/src/server/services/public-content.test.ts`
- [x] T041 [P] [US4] Write route test for batch create in `apps/web/app/api/v1/pages/batch/route.test.ts`
- [x] T042 [P] [US4] Write MCP tool test for `batch_create_pages` in `packages/mcp-server/src/tools/batch-create-pages.test.ts`

### Implementation for User Story 4

- [x] T043 [US4] Implement `batchCreatePages` service in `apps/web/src/server/services/public-content.ts`
- [x] T044 [US4] Add `POST` handler to `apps/web/app/api/v1/pages/batch/route.ts`
- [x] T045 [US4] Add `PublicPageBatchCreateInput` / `PublicBatchCreateResult` schemas to `apps/web/src/server/api/openapi-schemas.ts`
- [x] T046 [US4] Add `batchCreatePages` client method in `packages/mcp-server/src/api-client.ts`
- [x] T047 [P] [US4] Add `batch_create_pages` tool in `packages/mcp-server/src/tools/batch-create-pages.ts`
- [x] T048 [US4] Register `batch_create_pages` tool in `packages/mcp-server/src/server.ts`

**Checkpoint**: User Stories 1-4 work independently.

---

## Phase 7: User Story 5 — Wiki Stats / Overview (Priority: P1)

**Goal**: Callers can retrieve aggregate wiki health metrics and optional orphan detection.

**Independent Test**: Create pages across two directories with mixed statuses,
call `GET /v1/stats?include=orphans`, and confirm counts and orphan list match.

### Tests for User Story 5

- [x] T049 [P] [US5] Write service test for `getStats` in `apps/web/src/server/services/public-content.test.ts`
- [x] T050 [P] [US5] Write route test for stats in `apps/web/app/api/v1/stats/route.test.ts`
- [x] T051 [P] [US5] Write MCP tool test for `get_stats` in `packages/mcp-server/src/tools/get-stats.test.ts`

### Implementation for User Story 5

- [x] T052 [US5] Implement `getStats` service in `apps/web/src/server/services/public-content.ts`
- [x] T053 [US5] Add `GET` handler to `apps/web/app/api/v1/stats/route.ts`
- [x] T054 [US5] Add `PublicStatsQuery` / `PublicStatsResponse` schemas to `apps/web/src/server/api/openapi-schemas.ts`
- [x] T055 [US5] Add `getStats` client method in `packages/mcp-server/src/api-client.ts`
- [x] T056 [P] [US5] Add `get_stats` tool in `packages/mcp-server/src/tools/get-stats.ts`
- [x] T057 [US5] Register `get_stats` tool in `packages/mcp-server/src/server.ts`

**Checkpoint**: User Stories 1-5 work independently.

---

## Phase 8: User Story 6 — Duplicate Detection (Priority: P1)

**Goal**: Callers can check for existing pages similar to a proposed title/path.

**Independent Test**: Create a page titled "Payment Routing", call
`POST /v1/search/similar` with title "payment routing", and confirm the
existing page is returned with a high score.

### Tests for User Story 6

- [x] T058 [P] [US6] Write service test for `findSimilar` in `apps/web/src/server/services/public-content.test.ts`
- [x] T059 [P] [US6] Write route test for similar search in `apps/web/app/api/v1/search/similar/route.test.ts`
- [x] T060 [P] [US6] Write MCP tool test for `find_similar` in `packages/mcp-server/src/tools/find-similar.test.ts`

### Implementation for User Story 6

- [x] T061 [US6] Implement `findSimilar` service in `apps/web/src/server/services/public-content.ts`
- [x] T062 [US6] Add `POST` handler to `apps/web/app/api/v1/search/similar/route.ts`
- [x] T063 [US6] Add `PublicSimilarQuery` / `PublicSimilarResponse` schemas to `apps/web/src/server/api/openapi-schemas.ts`
- [x] T064 [US6] Add `findSimilar` client method in `packages/mcp-server/src/api-client.ts`
- [x] T065 [P] [US6] Add `find_similar` tool in `packages/mcp-server/src/tools/find-similar.ts`
- [x] T066 [US6] Register `find_similar` tool in `packages/mcp-server/src/server.ts`

**Checkpoint**: All six user stories independently functional.

---

## Phase 9: Polish & Cross-Cutting Concerns

**Purpose**: OpenAPI generation, documentation updates, lint/typecheck, and regression validation.

- [x] T067 [P] Regenerate `apps/web/public/openapi.json` with `pnpm openapi:generate`
- [x] T068 [P] Update MCP tool table in `CLAUDE.md`
- [x] T069 [P] Update tool descriptions in `packages/mcp-server/README.md`
- [x] T070 Run full `pnpm lint && pnpm typecheck`
- [x] T071 [P] Run existing 007-public-wiki-api acceptance tests to confirm no regressions
- [ ] T072 End-to-end integration test with live API key (deferred to CI)

---

## Dependencies & Execution Order

### Phase Dependencies

- **Setup (Phase 1)**: No dependencies — can start immediately. Adds the only
  new package dependency and shared schemas.
- **Foundational (Phase 2)**: Depends on Setup. Defines service signatures and
  OpenAPI schema registration — blocks all user story implementation.
- **User Stories (Phase 3-8)**: All depend on Foundational phase completion.
  - US1 (delete) is the MVP and should be completed first.
  - US2 and US3 are P0 and can run in parallel after US1.
  - US4-US6 are P1 and can run in parallel once P0 stories are stable.
- **Polish (Phase 9)**: Depends on all desired user stories being complete.

### User Story Dependencies

- **US1 (P0)**: No dependencies on other stories. MVP.
- **US2 (P0)**: Independent of US1, but both are safety primitives often used
  together (delete + backlinks).
- **US3 (P0)**: Independent of US1/US2.
- **US4 (P1)**: Independent; builds on the existing single-page create flow.
- **US5 (P1)**: Independent; orphan detection reuses backlink scan logic, so it
  depends only on the foundational `getBacklinks` signature, not on US2 completion.
- **US6 (P1)**: Independent; reads page titles and paths only.

### Within Each User Story

- Service implementation before route handler.
- Route handler before MCP client method/tool.
- Tool registration is the last step.
- Tests can be written in parallel with implementation but must be runnable
  independently.

---

## Parallel Example: User Story 1

```bash
# All US1 tests can run in parallel:
Task: "Write route test for delete success in apps/web/app/api/v1/pages/[id]/route.test.ts"
Task: "Write route test for delete 404 in apps/web/app/api/v1/pages/[id]/route.test.ts"
Task: "Write MCP tool test for delete_page in packages/mcp-server/src/tools/delete-page.test.ts"

# After service exists, route + MCP work can proceed in parallel:
Task: "Add DELETE handler to apps/web/app/api/v1/pages/[id]/route.ts"
Task: "Add deletePage client method in packages/mcp-server/src/api-client.ts"
```

---

## Implementation Strategy

### MVP First (User Story 1 Only)

1. Complete Phase 1: Setup
2. Complete Phase 2: Foundational
3. Complete Phase 3: User Story 1 (delete/archive)
4. **STOP and VALIDATE**: Test soft-delete independently
5. Deploy/demo if ready

### Incremental Delivery

1. Setup + Foundational → Foundation ready
2. Add US1 → Test independently → Deploy/Demo (MVP)
3. Add US2 (backlinks) → Test independently
4. Add US3 (diff) → Test independently
5. Add US4 (batch create) → Test independently
6. Add US5 (stats) → Test independently
7. Add US6 (similar) → Test independently
8. Phase 9 polish → regenerate docs, lint, regression tests

### Parallel Team Strategy

With multiple developers after Foundational phase completes:

- Developer A: US1 + US2 (P0 safety primitives)
- Developer B: US3 (P0 change review)
- Developer C: US4 + US6 (P1 create efficiency and duplicate prevention)
- Developer D: US5 (P1 health overview)

Each story can be merged independently once its tests pass.

---

## Notes

- All implementation tasks are marked `[x]` because this feature has already
  shipped in the `007-public-wiki-api` branch.
- T072 (end-to-end integration test with live API key) remains `[ ]` and is
  tracked for CI setup.
- No user story depends on another for correctness; dependencies are only on
  the foundational service layer and shared schemas.
