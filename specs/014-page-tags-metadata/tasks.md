# Tasks: Page Tags and Metadata

**Input**: Design documents from `specs/014-page-tags-metadata/`

**Prerequisites**: `plan.md`, `spec.md`, `research.md`, `data-model.md`, `contracts/rest-api.md`, `quickstart.md`

**Tests**: Required by the validation guide and success criteria. Add focused tests with each story before marking its checkpoint complete.

**Organization**: Tasks are grouped by user story so each increment can be tested independently after the shared foundation is ready.

## Format: `[ID] [P?] [Story] Description`

- **[P]** means the task can proceed in parallel with other tasks in the same phase once its stated prerequisites are complete.
- **[US#]** maps a task to the corresponding user story in `spec.md`.

## Phase 1: Setup

**Purpose**: Establish the feature's focused test fixtures and baseline commands before changing behavior.

- [X] T001 [P] Add reusable tagged-Markdown and metadata assertion fixtures in `apps/web/src/server/services/pages.test.ts`
- [X] T002 [P] Add public API/MCP metadata fixture builders in `apps/web/src/server/services/public-content-read.test.ts` and `packages/mcp-server/src/tools/tools.test.ts`
- [X] T003 Record the page-tags validation commands and manual smoke data in `specs/014-page-tags-metadata/quickstart.md`

---

## Phase 2: Foundational (Blocking Prerequisites)

**Purpose**: Build the data, permission, revision, rendering, and job primitives required by every story.

**⚠️ CRITICAL**: Do not start user-story tasks until this phase is complete.

- [X] T004 [P] Add `manage_tags` permission action and API-key scope mapping in `apps/web/src/server/permissions/index.ts` and `apps/web/src/server/db/schema/enums.ts`
- [X] T005 [P] Define tag, revision-metadata, revision-tag, and tag-mutation Drizzle tables/relations in `apps/web/src/server/db/schema/index.ts`
- [X] T006 Generate and review the schema migration and Drizzle metadata in `apps/web/src/server/db/migrations/0008_page_tags_metadata.sql` and `apps/web/src/server/db/migrations/meta/`
- [X] T007 [P] Add strict supported-metadata parse, normalize, validate, merge, and YAML serialization helpers in `apps/web/src/server/metadata/frontmatter.ts`
- [X] T008 [P] Add parser/serializer validation coverage, including malformed frontmatter fallback and unrelated-key preservation, in `apps/web/src/server/metadata/frontmatter.test.ts`
- [X] T009 Route valid frontmatter through body-only Markdown rendering and cover preview/render behavior in `apps/web/src/server/pipeline/index.ts` and `apps/web/src/server/pipeline/pipeline.test.ts`
- [X] T010 Implement the shared metadata-aware revision writer with stale checks, revision snapshots, tag resolution, asset references, replication, export, and index handoff in `apps/web/src/server/services/page-metadata.ts`
- [X] T011 Refactor normal page writes and public batch frontmatter writes to use the shared revision writer in `apps/web/src/server/services/pages.ts` and `apps/web/src/server/services/public-content.ts`
- [X] T012 Add transactional revision/tag metadata consistency and stale-write tests in `apps/web/src/server/services/page-metadata.test.ts`
- [X] T013 Define tag-mutation persistence, queue payloads, and worker registration in `apps/web/src/server/services/tag-mutations.ts`, `apps/web/src/server/jobs/tag-mutations.ts`, and `apps/web/src/server/jobs/register.ts`
- [X] T014 Add queued/running/succeeded/failed and rollback coverage for tag-mutation jobs in `apps/web/src/server/services/tag-mutations.test.ts` and `apps/web/src/server/jobs/tag-mutations.test.ts`
- [X] T015 Extend shared public schemas with additive typed metadata, tag resources, mutation resources, and metadata-write input in `packages/shared/src/pages.ts`
- [X] T016 Extend OpenAPI schema registration for typed metadata, tags, and tag-mutations in `apps/web/src/server/api/openapi-schemas.ts` and `apps/web/src/server/api/public-openapi.ts`

**Checkpoint**: A validated metadata/revision/tag foundation exists; valid frontmatter is no longer rendered as body content; all stories can consume the same writer and permissions.

---

## Phase 3: User Story 1 - Classify pages with reusable tags (Priority: P1) 🎯 MVP

**Goal**: Editors can assign normalized reusable tags, and authorized managers can create, rename, or retire them without duplicate labels or stale page state.

**Independent Test**: Create two tags, assign/remove them on a page, then rename and retire a shared tag; verify affected readable pages show the final tags once and their supported frontmatter converges after the mutation completes.

### Tests for User Story 1

- [X] T017 [P] [US1] Add tag registry normalization, duplicate-name, assignment, and retirement service tests in `apps/web/src/server/services/tags.test.ts`
- [X] T018 [P] [US1] Add browser tag-management and page-assignment E2E coverage in `apps/web/e2e/page-tags.spec.ts`

### Implementation for User Story 1

- [X] T019 [US1] Implement permission-scoped tag list/create/get and fan-out rename/retire orchestration in `apps/web/src/server/services/tags.ts`
- [X] T020 [US1] Add internal tag-management routes/actions for the browser in `apps/web/app/api/tags/route.ts` and `apps/web/app/api/tags/[id]/route.ts`
- [X] T021 [P] [US1] Add reusable accessible tag picker/chip controls using existing design tokens in `apps/web/src/components/pages/TagPicker.tsx` and `apps/web/src/components/pages/TagList.tsx`
- [X] T022 [US1] Add authorized tag creation, rename, retirement, and operation-status UI to `apps/web/src/components/admin/pages/TagManager.tsx` and `apps/web/src/components/admin/pages/AdminPagesPanel.tsx`
- [X] T023 [US1] Wire page tag assignment/removal and permitted inline tag creation into `apps/web/src/components/editor/PagePropertiesFields.tsx` and `apps/web/src/components/pages/EditPageForm.tsx`
- [X] T024 [US1] Add localized tag labels, errors, operation states, and accessible instructions in `apps/web/src/i18n/en.ts` and `apps/web/src/i18n/zh.ts`

**Checkpoint**: Tags can be managed and assigned through the browser with normalized uniqueness and completed fan-out synchronization.

---

## Phase 4: User Story 2 - Maintain page metadata and Markdown frontmatter together (Priority: P1)

**Goal**: Authors can maintain title, date, tags, and summary through metadata UI or Markdown without divergence, and readers see structured metadata instead of raw YAML.

**Independent Test**: Edit a Markdown page with supported frontmatter through both source and page properties; confirm the resulting revision, source, reader metadata, and tag snapshot agree and unrelated frontmatter remains intact.

### Tests for User Story 2

- [X] T025 [P] [US2] Add page-service tests for source-to-metadata synchronization, date validation, title convergence, and revision snapshots in `apps/web/src/server/services/pages.test.ts`
- [X] T026 [P] [US2] Add reader rendering tests for present/absent metadata and frontmatter-free body HTML in `apps/web/app/(public)/[...path]/page.test.tsx`

### Implementation for User Story 2

- [X] T027 [US2] Extend `LivePage`, editable page data, and published page mapping with typed revision metadata in `packages/shared/src/index.ts` and `apps/web/src/server/services/pages.ts`
- [X] T028 [US2] Add a server-rendered, accessible structured metadata presentation in `apps/web/src/components/pages/PageMetadata.tsx`
- [X] T029 [US2] Render `PageMetadata` before article content and omit absent values in `apps/web/app/(public)/[...path]/page.tsx`
- [X] T030 [US2] Extend page properties UI with title/date/tags/summary validation and save wiring in `apps/web/src/components/editor/PagePropertiesPanel.tsx`, `apps/web/src/components/editor/PagePropertiesFields.tsx`, and `apps/web/src/components/pages/EditPageForm.tsx`
- [X] T031 [US2] Preserve frontmatter/body synchronization through draft, publish, property, and source save flows in `apps/web/src/server/services/revisions.ts` and `apps/web/src/server/services/pages.ts`
- [X] T032 [US2] Add localized metadata labels, date errors, and empty-state semantics in `apps/web/src/i18n/en.ts` and `apps/web/src/i18n/zh.ts`

**Checkpoint**: The reader shows structured date/tags/summary, valid YAML never repeats in the body, and either editing surface produces a consistent revision.

---

## Phase 5: User Story 3 - Show authored summaries in page lists (Priority: P1)

**Goal**: Standard page lists use a non-empty authored summary before the existing generated/truncated fallback.

**Independent Test**: Publish one page with a summary and one without; verify homepage and `/pages` display the summary exactly for the first and the existing fallback for the second without additional client requests.

### Tests for User Story 3

- [X] T033 [P] [US3] Add published-page projection tests for summary-first and fallback descriptions in `apps/web/src/server/services/pages.test.ts`
- [X] T034 [P] [US3] Add homepage and page-list card rendering tests in `apps/web/app/(public)/page.test.tsx` and `apps/web/app/(public)/pages/page.test.tsx`

### Implementation for User Story 3

- [X] T035 [US3] Extend shared `PageSummary` with summary/fallback description fields in `packages/shared/src/index.ts`
- [X] T036 [US3] Build the published-revision metadata/excerpt projection without per-card reads in `apps/web/src/server/services/pages.ts`
- [X] T037 [US3] Render the shared description projection on homepage cards in `apps/web/app/(public)/page.tsx`
- [X] T038 [US3] Render the shared description projection on paginated page-list cards in `apps/web/app/(public)/pages/page.tsx`
- [X] T039 [US3] Ensure summary text is safely rendered as descriptive text rather than executable/structural markup in `apps/web/src/components/pages/PageListDescription.tsx`

**Checkpoint**: Every existing description-bearing page list consistently chooses summary first and preserves fallback behavior otherwise.

---

## Phase 6: User Story 4 - Automate tags and metadata through API and MCP (Priority: P2)

**Goal**: Authorized REST and MCP clients can read/write structured metadata and manage tags using the same validation, revision, and permission rules as the browser.

**Independent Test**: Use an editor API key to create a tag, update page metadata, and read it through MCP; start and observe a tag mutation. Verify a read-only key cannot perform mutations or learn inaccessible page details.

### Tests for User Story 4

- [X] T040 [P] [US4] Add v1 page metadata route contract, optimistic-concurrency, and authorization tests in `apps/web/app/api/v1/pages/[id]/metadata/route.test.ts`
- [X] T041 [P] [US4] Add tag collection/item/mutation route and visibility-safe count tests in `apps/web/app/api/v1/tags/tags-routes.test.ts` and `apps/web/app/api/v1/tag-mutations/tag-mutations-routes.test.ts`
- [X] T042 [P] [US4] Add MCP metadata projection, legacy `filterTag`, and new tag-tool contract tests in `packages/mcp-server/src/tools/tools.test.ts` and `packages/mcp-server/src/shapes.test.ts`

### Implementation for User Story 4

- [X] T043 [US4] Extend public-content page/read/list/search projections and preserve raw frontmatter/filter compatibility in `apps/web/src/server/services/public-content.ts`
- [X] T044 [US4] Implement `PATCH /v1/pages/{id}/metadata` with shared schemas, permission checks, and standard error/audit behavior in `apps/web/app/api/v1/pages/[id]/metadata/route.ts`
- [X] T045 [US4] Implement v1 tag list/create/rename/retire resources in `apps/web/app/api/v1/tags/route.ts` and `apps/web/app/api/v1/tags/[id]/route.ts`
- [X] T046 [US4] Implement requester/admin mutation status retrieval in `apps/web/app/api/v1/tag-mutations/[id]/route.ts`
- [X] T047 [US4] Update public route OpenAPI annotations and generated contract coverage in `apps/web/app/api/v1/pages/[id]/metadata/route.ts`, `apps/web/app/api/v1/tags/route.ts`, and `apps/web/app/api/v1/tag-mutations/[id]/route.ts`
- [X] T048 [US4] Extend MCP v1 client schemas and calls for typed metadata, tags, and mutations in `packages/mcp-server/src/api-client.ts`
- [X] T049 [US4] Preserve/add typed metadata in MCP response transforms and existing page/search/list shapes in `packages/mcp-server/src/shapes.ts`
- [X] T050 [P] [US4] Add MCP tag and metadata tool input/forwarding modules in `packages/mcp-server/src/tools/list-tags.ts`, `packages/mcp-server/src/tools/create-tag.ts`, `packages/mcp-server/src/tools/rename-tag.ts`, `packages/mcp-server/src/tools/delete-tag.ts`, `packages/mcp-server/src/tools/get-tag-mutation.ts`, and `packages/mcp-server/src/tools/update-page-metadata.ts`
- [X] T051 [US4] Register the new tools and extend existing tool descriptions/legacy filter compatibility in `packages/mcp-server/src/server.ts` and `packages/mcp-server/src/tools/search-wiki.ts`

**Checkpoint**: Browser, REST, and MCP report the same typed metadata/tag state and enforce equivalent authorization.

---

## Phase 7: Polish & Cross-Cutting Concerns

**Purpose**: Complete migration, compatibility, operation, and end-to-end validation across all stories.

- [X] T052 Add an idempotent legacy-frontmatter metadata/tag backfill and operational progress reporting in `apps/web/src/server/jobs/page-metadata-backfill.ts` and `apps/web/src/server/jobs/register.ts`
- [X] T053 Add migration/backfill, historical revision, and Git export frontmatter preservation regression tests in `apps/web/src/server/services/page-metadata.test.ts` and `apps/web/src/server/git/export.test.ts`
- [X] T054 Verify content-store, replication, and index reconciliation retain typed metadata/frontmatter consistency in `apps/web/src/server/services/storage-replication.test.ts` and `apps/web/src/server/services/ai-index.test.ts`
- [X] T055 [P] Add a 100-page tag rename/delete mutation E2E/worker scenario in `apps/web/src/server/jobs/tag-mutations.test.ts`
- [X] T056 [P] Regenerate and validate OpenAPI output in `apps/web/public/openapi.json` and `apps/web/src/server/api/openapi-schemas.test.ts`
- [X] T057 Run the quickstart validation matrix and record any remaining operator notes in `specs/014-page-tags-metadata/quickstart.md`
- [X] T058 Run repository quality gates and record feature-regression results in `specs/014-page-tags-metadata/quickstart.md` using `pnpm --filter @next-wiki/web typecheck`, `pnpm --filter @next-wiki/web test`, `pnpm --filter @next-wiki/mcp-server typecheck`, and `pnpm --filter @next-wiki/mcp-server test`

---

## Dependencies & Execution Order

### Phase dependencies

- Phase 1 can begin immediately.
- Phase 2 depends on Phase 1 and blocks all user stories.
- US1, US2, US3, and US4 can begin after Phase 2, but US1 and US2 coordinate on the shared properties form and should be sequenced in one worktree.
- Phase 7 depends on the desired user-story phases being complete.

### User story dependencies

- **US1 (P1)**: Foundation only; recommended MVP.
- **US2 (P1)**: Foundation only, but shares editor-property files with US1.
- **US3 (P1)**: Foundation only; can proceed in parallel with US1/US2 because it uses page-list files.
- **US4 (P2)**: Foundation only; can proceed in parallel with browser work once shared schemas are stable.

### Parallel opportunities

- T004/T005/T007/T008 and T013 can run in parallel at the beginning of Phase 2; T006 follows schema work, while T010–T016 follow their prerequisites.
- US1 tests T017/T018 and picker UI T021 can run in parallel after the tag service contract is settled.
- US2 tests T025/T026 can run in parallel; US3 tests T033/T034 can run in parallel with US2 implementation.
- US4 contract tests T040–T042 can run in parallel; T048 and T050 can run in parallel once REST schemas exist.
- T055 and T056 are independent final validation tasks.

## Implementation Strategy

### MVP first

1. Complete Phases 1–2.
2. Deliver US1: normalized tag registry, browser assignment, and consistent lifecycle mutations.
3. Validate US1 independently before moving on.

### Incremental delivery

1. Add US2 for structured metadata/frontmatter synchronization and reader display.
2. Add US3 for summary-first descriptions on existing page lists.
3. Add US4 for public API and MCP parity.
4. Finish Phase 7 before release.

## Notes

- All tasks follow the required checkbox, ID, optional parallel marker, user-story label, and file-path format.
- Do not bypass the shared metadata-aware writer for any page/tag mutation.
- Keep the raw frontmatter API response and existing clients compatible while adding typed metadata.
