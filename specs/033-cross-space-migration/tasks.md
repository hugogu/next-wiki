# Tasks: Cross-Space Page Migration

**Input**: Design documents from `/Users/gqq/OpenSource/next-wiki/specs/033-cross-space-migration/`
**Prerequisites**: `plan.md`, `spec.md`, `research.md`, `data-model.md`, `contracts/`, `quickstart.md`

**Tests**: Automated unit, route, MCP, component, and end-to-end tests are required by the feature specification and project conventions. Add them with the implementation they verify.

**Organization**: Tasks are grouped by user story so every story can be implemented and verified independently after the shared foundation is complete.

## Phase 1: Setup (Shared Test Support)

**Purpose**: Establish reusable fixtures and conventions for isolated migration tests.

- [ ] T001 [P] Add reusable multi-space, tagged-page, translation, and content-mode fixture builders in `apps/web/test/cross-space-migration-fixtures.ts`
- [ ] T002 [P] Add migration-operation and pg-boss worker test helpers in `apps/web/test/cross-space-migration-fixtures.ts`
- [ ] T003 [P] Add shared migration request/result fixtures for REST and MCP tests in `packages/shared/src/page-migrations.test.ts`

---

## Phase 2: Foundational (Blocking Prerequisites)

**Purpose**: Provide the persistent operation model, common contracts, authorization, and queue plumbing required by every story.

**⚠️ CRITICAL**: Complete this phase before beginning any user story.

- [ ] T004 Add cross-space migration status enums, operation tables, item tables, constraints, and indexes to `apps/web/src/server/db/schema/enums.ts` and `apps/web/src/server/db/schema/index.ts`
- [ ] T005 Generate the Drizzle migration and snapshot for the migration schema with `pnpm db:generate`, producing files under `apps/web/src/server/db/migrations/`
- [ ] T006 Add shared Zod input/output schemas, status types, error codes, and API/MCP result models in `packages/shared/src/page-migrations.ts`
- [ ] T007 Export the shared migration contracts from `packages/shared/src/index.ts`
- [ ] T008 Add OpenAPI migration schemas, operation status models, and standard error mappings in `apps/web/src/server/api/openapi-schemas.ts` and `apps/web/src/server/api/errors.ts`
- [ ] T009 Implement administrator and API-key/MCP authorization, Wiki/AI-Generation mode validation, source/destination visibility checks, and selection-fingerprint validation helpers in `apps/web/src/server/services/cross-space-migrations.ts`
- [ ] T010 Add a `cross-space-migration` pg-boss queue definition and worker runtime dependencies in `apps/web/src/server/jobs/runtime.ts`
- [ ] T011 Register the migration worker and recover queued/running operations safely on worker startup in `apps/web/src/server/jobs/register.ts`
- [ ] T012 Add unit tests for shared migration contracts and invalid status transitions in `packages/shared/src/page-migrations.test.ts`
- [ ] T013 Add service tests for authority, content-mode, same-space, invisible-space, and stale-preview rejection in `apps/web/src/server/services/cross-space-migrations.test.ts`

**Checkpoint**: Durable migration records, validated shared contracts, and an executable but not yet page-moving worker are available to all stories.

---

## Phase 3: User Story 1 — Migrate one page between spaces (Priority: P1) 🎯 MVP

**Goal**: An authorized administrator can preview and confirm moving one eligible page, preserving its identity and history while rehoming it correctly in the destination space.

**Independent Test**: Create a Wiki or AI Generation page with revisions, tags, and an old public route; preview and confirm it through the service, run the job, and verify its ID/history persist, its tags and metadata are valid in the destination, source-only permissions are removed, and the old route follows the documented redirect policy.

### Tests for User Story 1

- [ ] T014 [P] [US1] Add service tests for a single-page preview snapshot, idempotent confirmation, and duplicate-confirm protection in `apps/web/src/server/services/cross-space-migrations.test.ts`
- [ ] T015 [P] [US1] Add worker tests for single-page movement, revision-preserving tag rehoming, human-initiated AI/OKF adaptation metadata, and source permission cleanup in `apps/web/src/server/jobs/cross-space-migration.test.ts`
- [ ] T016 [P] [US1] Add routing/cache tests for cross-space legacy routes, opaque private pages, cache invalidation, and index reconciliation in `apps/web/src/server/services/cross-space-migrations.test.ts`

### Implementation for User Story 1

- [ ] T017 [US1] Implement single-page preview creation with immutable selected-page snapshots, source/destination summaries, warnings, and expiry in `apps/web/src/server/services/cross-space-migrations.ts`
- [ ] T018 [US1] Implement atomic idempotent confirmation that persists an operation and one item, records an audit event, and enqueues the worker in `apps/web/src/server/services/cross-space-migrations.ts`
- [ ] T019 [US1] Implement one-item worker execution with short database transactions, preserved page/revision/provenance IDs, destination placement, explicit page-permission removal, tag rehoming revisions, and failure recording in `apps/web/src/server/jobs/cross-space-migration.ts`
- [ ] T020 [US1] Record old canonical paths as `cross_space_migration` redirects and enforce public/published-only redirect behavior in `apps/web/src/server/jobs/cross-space-migration.ts` and `apps/web/src/server/services/reader-routing.ts`
- [ ] T021 [US1] Invalidate source/destination page and navigation caches, notify public content changes, reconcile search/AI indexes, and schedule canonical warmups after a page finishes in `apps/web/src/server/jobs/cross-space-migration.ts`
- [ ] T022 [US1] Delegate the existing admin single-page move service to the new migration domain service without changing its legacy route contract in `apps/web/src/server/services/pages.ts`
- [ ] T023 [US1] Add an end-to-end single-page migration and legacy-route verification scenario in `apps/web/e2e/cross-space-migration.spec.ts`

**Checkpoint**: A single eligible page can move correctly and durably; this is the MVP backend capability.

---

## Phase 4: User Story 2 — Migrate a folder with its page tree (Priority: P1)

**Goal**: An authorized administrator can move an entire folder subtree, receive collision and eligibility feedback before confirmation, and observe recoverable per-page progress.

**Independent Test**: Build a nested folder with translations, an excluded Raw child, and a destination path collision; preview it, resolve or accept the reported exclusions, confirm it, interrupt/retry the worker, and verify every eligible item completes exactly once with accurate operation progress.

### Tests for User Story 2

- [ ] T024 [P] [US2] Add preview tests for subtree enumeration, descendant path mapping, translation grouping, Raw-page exclusion, and destination collision reporting in `apps/web/src/server/services/cross-space-migrations.test.ts`
- [ ] T025 [P] [US2] Add worker tests for per-item progress, partial failure, cancellation, restart recovery, and no automatic collision suffixing in `apps/web/src/server/jobs/cross-space-migration.test.ts`
- [ ] T026 [P] [US2] Add operation-query tests for paginated items, warnings, failure details, and terminal summaries in `apps/web/src/server/services/cross-space-migrations.test.ts`

### Implementation for User Story 2

- [ ] T027 [US2] Extend preview selection to resolve Navigator folder paths and recursively snapshot eligible pages and translations in `apps/web/src/server/services/cross-space-migrations.ts`
- [ ] T028 [US2] Persist ordered migration items, collision warnings, excluded descendants, and translated-page relationships on confirmation in `apps/web/src/server/services/cross-space-migrations.ts`
- [ ] T029 [US2] Extend the worker to claim, move, and finalize one item at a time; derive operation progress and terminal `completed`, `completed_with_warnings`, `failed`, or `cancelled` state in `apps/web/src/server/jobs/cross-space-migration.ts`
- [ ] T030 [US2] Implement recoverable-operation discovery and safe queue re-enqueueing for interrupted migration jobs in `apps/web/src/server/services/cross-space-migrations.ts` and `apps/web/src/server/jobs/register.ts`
- [ ] T031 [US2] Implement cancellation requests that stop unclaimed items, preserve completed work, and expose stable terminal details in `apps/web/src/server/services/cross-space-migrations.ts`
- [ ] T032 [US2] Add an end-to-end folder migration scenario covering nested pages, translations, exclusions, collisions, and progress in `apps/web/e2e/cross-space-migration.spec.ts`

**Checkpoint**: Folder migration is durable, transparent about conflicts, and safe to resume or cancel without duplicate moves.

---

## Phase 5: User Story 3 — Start migration from Navigator Pane or Pages list (Priority: P2)

**Goal**: Administrators can start the same preview/confirm flow from a Navigator page or virtual folder action and from a Pages-list row action, without losing their current browsing context.

**Independent Test**: As an administrator, launch the dialog from each of the three supported UI contexts, choose a destination space, review the same preview data, confirm migration, and verify the Navigator and list refresh to canonical results; verify non-administrators never see a usable action.

### Tests for User Story 3

- [ ] T033 [P] [US3] Add dialog tests for destination selection, preview warnings, confirmation, polling terminal state, cancellation, and disabled ineligible targets in `apps/web/src/components/pages/CrossSpaceMigrationDialog.test.tsx`
- [ ] T034 [P] [US3] Add Navigator tests for page and virtual-folder overflow actions, administrator gating, and post-migration cache rekeying in `apps/web/src/components/layout/Navigator.test.tsx`
- [ ] T035 [P] [US3] Add Pages-list tests for the per-row migration action, permission gating, and list refresh in `apps/web/src/components/admin/pages/AdminPagesPanel.test.tsx`

### Implementation for User Story 3

- [ ] T036 [US3] Build a reusable cross-space migration dialog and launcher with preview, confirm, progress, cancellation, and destination-space selection in `apps/web/src/components/pages/CrossSpaceMigrationDialog.tsx`
- [ ] T037 [US3] Add localized migration labels, warnings, status messages, and accessibility keys in `apps/web/messages/en.json`, `apps/web/messages/zh.json`, and `apps/web/src/i18n/keys.ts`
- [ ] T038 [US3] Add administrator-only page and virtual-folder overflow launchers to `apps/web/src/components/layout/Navigator.tsx`, passing virtual-folder paths rather than fabricated IDs
- [ ] T039 [US3] Replace the Pages-list row move entry with the shared launcher and refresh/rekey affected list data in `apps/web/src/components/admin/pages/AdminPagesPanel.tsx` and `apps/web/src/components/admin/pages/MovePageButton.tsx`
- [ ] T040 [US3] Refresh route state and clear/rekey Navigator lazy-tree caches after terminal migration results in `apps/web/src/components/pages/CrossSpaceMigrationDialog.tsx` and `apps/web/src/components/layout/Navigator.tsx`
- [ ] T041 [US3] Add end-to-end UI coverage for Navigator page, Navigator folder, and Pages-list migration entry points in `apps/web/e2e/cross-space-migration.spec.ts`

**Checkpoint**: All requested web entry points use one consistent, accessible migration experience.

---

## Phase 6: User Story 4 — Migrate pages through OpenAPI or MCP (Priority: P2)

**Goal**: Administrator-authorized integrations and MCP clients can preview, start, monitor, list items for, and cancel the same migration operations as the web UI.

**Independent Test**: Use an administrator API key and an MCP client to preview and start a page or folder migration, poll its operation/items, cancel a queued operation, and verify unauthorized, invalid-mode, stale-preview, and not-found calls return documented structured errors without leaking inaccessible data.

### Tests for User Story 4

- [ ] T042 [P] [US4] Add public API route tests for preview, create, status, item listing, cancellation, authorization, and no-store response headers in `apps/web/app/api/v1/space-migrations/route.test.ts`
- [ ] T043 [P] [US4] Add MCP API-client serialization and error-mapping tests in `packages/mcp-server/src/api-client.test.ts`
- [ ] T044 [P] [US4] Add MCP tool registration, validation, and result-shaping tests in `packages/mcp-server/src/tools/tools.test.ts`

### Implementation for User Story 4

- [ ] T045 [US4] Implement authenticated preview and create endpoints with OpenAPI annotations in `apps/web/app/api/v1/space-migrations/previews/route.ts` and `apps/web/app/api/v1/space-migrations/route.ts`
- [ ] T046 [US4] Implement operation status, paginated item-list, and cancellation endpoints with standard public API wrappers in `apps/web/app/api/v1/space-migrations/[id]/route.ts`, `apps/web/app/api/v1/space-migrations/[id]/items/route.ts`, and `apps/web/app/api/v1/space-migrations/[id]/cancellation/route.ts`
- [ ] T047 [US4] Add migration client methods and typed error handling in `packages/mcp-server/src/api-client.ts`
- [ ] T048 [US4] Register `preview_space_migration`, `start_space_migration`, `get_space_migration`, `list_space_migration_items`, and `cancel_space_migration` MCP tools in `packages/mcp-server/src/server.ts` and `packages/mcp-server/src/tools/space-migrations.ts`
- [ ] T049 [US4] Add the migration tool definitions and API links to `packages/shared/src/mcp-tool-catalog.ts`
- [ ] T050 [US4] Generate the checked-in OpenAPI document from route annotations with `pnpm --filter @next-wiki/web openapi:generate`, updating `apps/web/public/openapi.json`
- [ ] T051 [US4] Add public API and MCP end-to-end migration coverage in `apps/web/e2e/cross-space-migration.spec.ts` and `packages/mcp-server/src/tools/tools.test.ts`

**Checkpoint**: UI, REST, and MCP use the same durable migration service and expose matching progress/error semantics.

---

## Phase 7: Polish & Cross-Cutting Concerns

**Purpose**: Close cross-story behavior, documentation, and verification gaps.

- [ ] T052 [P] Add recognized internal-link rewrite/warning policy coverage for moved pages in `apps/web/src/server/services/cross-space-migrations.test.ts`
- [ ] T053 Implement the approved internal-link rewrite and unresolved-link warning behavior during item execution in `apps/web/src/server/jobs/cross-space-migration.ts`
- [ ] T054 [P] Update migration setup, recovery, and manual verification guidance in `specs/033-cross-space-migration/quickstart.md`
- [ ] T055 Run focused migration unit/component/route/MCP tests and the cross-space Playwright suite, fixing failures in their owning files
- [ ] T056 Run `pnpm --filter @next-wiki/web lint`, `pnpm --filter @next-wiki/web typecheck`, and `pnpm db:generate`; confirm lint/type checks pass and Drizzle reports no additional schema changes
- [ ] T057 Run `docker compose up -d --build` and complete the migration quickstart smoke test against the local stack

---

## Dependencies & Execution Order

### Phase Dependencies

- Phase 1 has no dependencies and may begin immediately.
- Phase 2 depends on Phase 1 and blocks every user story.
- User Story 1 depends on Phase 2 and is the MVP.
- User Story 2 depends on Phase 2 and reuses the User Story 1 item-moving worker behavior.
- User Story 3 depends on User Stories 1 and 2 because it invokes the complete preview/confirm/progress lifecycle.
- User Story 4 depends on User Stories 1 and 2 because it exposes the same lifecycle through REST/MCP; it can run in parallel with User Story 3 after Phase 4.
- Phase 7 depends on all selected stories being complete.

### User Story Dependency Graph

```text
Setup → Foundation → US1 (single page) → US2 (folder tree)
                                      ├→ US3 (Navigator + Pages UI)
                                      └→ US4 (OpenAPI + MCP)
US3 + US4 → Polish
```

### Parallel Opportunities

- In Phase 1, T001, T002, and T003 can run in parallel.
- In Phase 2, T004/T006/T008 can begin in parallel; T005 follows T004, T007 follows T006, and T010/T011 follow their queue/service dependencies.
- In US1, T014–T016 can be written in parallel; T019–T021 can be split once T017/T018 define the service boundary.
- In US2, T024–T026 can be written in parallel; T030 and T031 can proceed together after the operation state model is available.
- In US3, T033–T035 can be written in parallel; T038 and T039 can proceed together once T036 exposes the launcher contract.
- In US4, T042–T044 can be written in parallel; T047 and T049 can proceed in parallel after T006/T007.

## Implementation Strategy

### MVP First (User Story 1)

1. Complete setup and foundational persistence/contracts/queue work.
2. Implement and test single-page preview, confirmation, asynchronous movement, rehoming, redirects, and cache/index effects.
3. Run the US1 tests and its end-to-end scenario before expanding selection scope.

### Incremental Delivery

1. Add folder planning and per-item resumable execution (US2).
2. Connect the finished service to the two required web surfaces (US3).
3. Expose the identical service contract through OpenAPI and MCP (US4).
4. Complete link policy, documentation, and full-stack validation.

### Completion Criteria

- Every migration source and destination is validated against the Wiki/AI-Generation content-mode rules.
- Every confirmed operation is durable, idempotent, observable, recoverable, and cancellable.
- No raw content moves; no inaccessible route is revealed by redirect behavior; no explicit source page permission survives the move.
- Navigator Pane, Pages list, REST API, and MCP each cover their specified entry point and share the same outcome semantics.
