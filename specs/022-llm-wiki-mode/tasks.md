---

description: "Task list for 022 Wiki Writing Modes (Copilot / LLM Wiki)"
---

# Tasks: Wiki Writing Modes — Copilot and LLM Wiki

**Input**: Design documents from `/specs/022-llm-wiki-mode/`

**Prerequisites**: plan.md, spec.md, research.md, data-model.md, contracts/, quickstart.md

**Tests**: Test tasks are included per the project rule "always write unit and integration tests for new code changes" (repo AGENTS.md). Write service/route tests with Vitest; e2e with Playwright where noted.

**Organization**: Tasks are grouped by user story to enable independent implementation and testing of each story.

**Conventions**: Schema changes ONLY via `pnpm db:generate` (never hand-authored SQL). After each logical group, run `pnpm lint && pnpm typecheck` and commit. API changes must regenerate OpenAPI via next-open-api (T062).

## Format: `[ID] [P?] [Story] Description`

- **[P]**: Can run in parallel (different files, no dependencies)
- **[Story]**: Which user story this task belongs to (e.g., US1, US2, US3)

---

## Phase 1: Setup (Shared Infrastructure)

**Purpose**: Verify toolchain and scaffold the feature's service files

- [X] T001 Verify baseline on branch `022-llm-wiki-mode`: `docker compose up -d --build`, `pnpm --filter @next-wiki/web test` green, and `pnpm db:generate` reports "No schema changes" before any schema edit
- [X] T002 [P] Create empty service scaffolds matching plan structure: `apps/web/src/server/services/spaces.ts`, `apps/web/src/server/services/writing-mode.ts`, `apps/web/src/server/services/raw-entries.ts`, `apps/web/src/server/services/link-pages.ts`, `apps/web/src/server/services/okf.ts`

---

## Phase 2: Foundational (Blocking Prerequisites)

**Purpose**: Schema migration, space resolver, mode settings, permission extension — every story depends on these

**⚠️ CRITICAL**: No user story work can begin until this phase is complete

- [X] T003 Add the 6 enums (`writing_mode`, `space_kind`, `page_kind`, `actor_kind`, `content_nature`, `page_visibility`) to `apps/web/src/server/db/schema/enums.ts`
- [X] T004 Extend schema in `apps/web/src/server/db/schema/index.ts`: `spaces.kind`; `pages.kind`/`link_target_page_id`/`nature`/`visibility` (+ target index and `kind='link'` iff target non-null CHECK); `page_revisions.actor_kind`/`source_metadata`/`link_target_page_id`; new singleton table `writing_mode_settings` with `pending_mode`/`switch_job_id`, `CHECK (id = 'default')`, and paired-null CHECK per data-model.md
- [X] T005 Run `pnpm db:generate` to produce the generated `0022_*` through `0024_*` migrations, verify a second run reports "No schema changes", and confirm boot migrations apply cleanly via `docker compose up -d --build`
- [X] T006 Implement space resolver in `apps/web/src/server/services/spaces.ts` (`getSpaceBySlug`, `getSpaceByKind`, `listSpaces`, `resolveSpace(param?)` defaulting to slug `default`) with `unstable_cache` and a `SPACE_CACHE_TAG` invalidation helper
- [X] T007 Replace all hardcoded `getDefaultSpace()` / `DEFAULT_SPACE_SLUG` copies with the resolver in `apps/web/src/server/services/{pages.ts,revisions.ts,public-content.ts,tags.ts,translations.ts,ai-retrieval.ts,public-ai.ts,transfer-page-writer.ts,transfer-export.ts}`, `apps/web/src/server/services/search/candidate-projection.ts`, `apps/web/src/server/services/search/engines/lexical-shared.ts`, and `apps/web/src/server/jobs/transfer-preview.ts` (behavior unchanged when no space is specified)
- [X] T008 Implement writing-mode settings in `apps/web/src/server/services/writing-mode.ts`: `getMode()` (cached), `getSwitchState()`, internal state updates, `requireSpaceKindAccess(ctx, space)`, and a transaction helper that takes the singleton-row `FOR SHARE` lock as the first DB lock for every content mutation and throws `MODE_SWITCH_IN_PROGRESS` when `pending_mode` is set
- [X] T009 Update `apps/web/src/server/seed/index.ts` to idempotently ensure spaces `default` (kind wiki), `raw` (kind raw, `anonymous_read=false`), `generated` (kind generated, `anonymous_read=false`) on boot in all modes
- [X] T010 Extend `can()` in `apps/web/src/server/permissions/index.ts`: page-list/page resources accept `spaceKind`; rules — raw: read/create Admin-only, edit/delete/publish denied for all actors; generated: read/create/edit/publish/delete Admin-only; wiki unchanged; add `visibility==='restricted'` ⇒ Admin-only read/edit for concrete pages
- [X] T011 Apply the mode-row write transaction helper to all content mutation chokepoints in `apps/web/src/server/services/pages.ts` and `revisions.ts` (create/draft/property/delete/publish/unpublish) plus internal translation/import writers; derive and persist `actor_kind` (session→human, api_key/internal→machine) and stable `nature` (raw=`original`, link=`generated`, otherwise explicit or machine→generated/human→original)
- [X] T012 [P] Update shared Zod contracts in `packages/shared/src/pages.ts` (page/revision fields `kind`, permission-projected current `linkTarget`, permission-projected revision `linkTargetPageId`/`source` where source supports optional ISO 8601 `occurredAt`, `origin { actorKind, nature }`, `humanModified`, `visibility`; list query params `space`, `filterType`, `filterTag`, `createdStart`, `createdEnd`), `packages/shared/src/setup.ts` (step enum gains `writing_mode` between `ai` and `sample_pages`), and export new error codes `SPACE_UNAVAILABLE`, `SPACE_FORBIDDEN`, `RAW_SPACE_IMMUTABLE`, `OKF_TYPE_REQUIRED`, `OKF_RESERVED_PATH`, `LINK_TARGET_INVALID`, `MODE_SWITCH_INVALID`, `MODE_SWITCH_IN_PROGRESS`
- [X] T013 [P] Foundational Vitest coverage: space resolver caching in `apps/web/src/server/services/spaces.test.ts`, `can()` space-kind matrix in `apps/web/src/server/permissions/index.test.ts`, and writing-mode guard/row-lock tests in `apps/web/src/server/services/writing-mode.test.ts` (in-flight write drains before pending state; later write rejected)

**Checkpoint**: Migration applied, three spaces seeded, permissions/mode guards green — user story implementation can now begin

---

## Phase 3: User Story 1 - Select Writing Mode During First-Run Setup (Priority: P1) 🎯 MVP

**Goal**: Onboarding asks for the writing mode (default Copilot) before sample generation; admin settings expose the current mode

**Independent Test**: Fresh deployment completes onboarding once per mode; verify step order, preselected default, and resulting `GET /api/settings/writing-mode` value; verify Copilot run shows no raw/generated anywhere (quickstart S1)

### Tests for User Story 1

- [X] T014 [P] [US1] Service tests for `recordWritingMode` transitions (valid choice advances to `sample_pages`, mode persisted, invalid value rejected) in `apps/web/src/server/services/setup.test.ts`
- [X] T015 [P] [US1] Route tests for `PUT /api/setup/writing-mode` (state machine integration, anonymous setup gating) in `apps/web/app/api/setup/writing-mode/route.test.ts`

### Implementation for User Story 1

- [X] T016 [US1] Add `recordWritingMode` transition and adjust `nextStepAfterAi` to land on `writing_mode` in `apps/web/src/server/services/setup.ts`
- [X] T017 [US1] Create route `PUT /api/setup/writing-mode` in `apps/web/app/api/setup/writing-mode/route.ts` calling the service and returning updated setup state
- [X] T018 [US1] Create `WritingModeStep` component (radio cards: Copilot default/recommended, LLM Wiki) in `apps/web/src/components/setup/WritingModeStep.tsx` and insert `writing_mode` into `STEP_ORDER` before `sample_pages` in `apps/web/src/components/setup/FirstRunOnboarding.tsx`
- [X] T019 [US1] Add `GET /api/settings/writing-mode` route in `apps/web/app/api/settings/writing-mode/route.ts` (admin-only, returns current mode from `writing-mode.ts`)
- [X] T020 [US1] Create admin page `apps/web/app/(admin)/admin/writing-mode/page.tsx` (guarded by admin, displays current mode and description; switch action added in US7) and register the nav entry in `apps/web/src/components/layout/Navigator.tsx` ADMIN_GROUPS
- [X] T021 [P] [US1] Add en/zh strings for the new step and admin page in `apps/web/src/i18n/locales/en.ts` and `apps/web/src/i18n/locales/zh.ts`

**Checkpoint**: Fresh setup in each mode yields the right mode and topology (quickstart S1)

---

## Phase 4: User Story 2 - Capture Original Inputs into the Append-Only Raw Space (Priority: P1)

**Goal**: Raw entries can be created and appended (server-side concatenation, auto-published); every edit/delete/unpublish attempt is rejected for all actors

**Independent Test**: Create raw entries of each input kind via API, append chunks, then attempt edit/delete/unpublish/draft as owner, admin, and API key — all rejected; revision 1 bytes identical after appends (quickstart S2)

### Tests for User Story 2

- [X] T022 [P] [US2] Service tests for raw create/append/immutability in `apps/web/src/server/services/raw-entries.test.ts`: auto-publish, forced nature `original`, append concatenation, per-revision `source_metadata`, concurrent-append serialization (two appends → sequential version numbers), frontmatter `type`/initial source storage, mode guard rejects raw ops in copilot mode, pending-switch barrier rejects writes
- [X] T023 [P] [US2] Route tests in `apps/web/app/api/v1/pages/[id]/appends/route.test.ts` and create-with-`space=raw` cases in `apps/web/app/api/v1/pages/route.test.ts`: 201 create/append with complete revision origin/source, `RAW_SPACE_IMMUTABLE` on PATCH/DELETE/drafts/publication, `SPACE_UNAVAILABLE` in copilot mode, `SPACE_FORBIDDEN` for reader/editor keys, `MODE_SWITCH_IN_PROGRESS` while pending

### Implementation for User Story 2

- [X] T024 [US2] Implement `apps/web/src/server/services/raw-entries.ts`: `createEntry(ctx, { path, title, inputKind, source?, content })` (validates input kind, forces nature original, builds OKF frontmatter, persists any v1 `source_metadata`, auto-publishes) and `appendEntry(ctx, pageId, { content, source? })` (write-barrier transaction: load current content, concatenate with separator, insert next version with immutable `source_metadata`, publish immediately)
- [X] T025 [US2] Add raw-space immutability guards to `apps/web/src/server/services/pages.ts` (`newDraft`, `updateProperties`, `remove`) and `apps/web/src/server/services/revisions.ts` (unpublish path): when the page's space kind is `raw`, throw `RAW_SPACE_IMMUTABLE` for every actor
- [X] T026 [US2] Extend `POST /v1/pages` in `apps/web/src/server/services/public-content.ts` and `apps/web/app/api/v1/pages/route.ts` to accept `space`, `inputKind`, `source`; route raw creates through `raw-entries.ts`
- [X] T027 [US2] Create append sub-resource `POST /v1/pages/[id]/appends` in `apps/web/app/api/v1/pages/[id]/appends/route.ts` (Zod body `{ content, source? }`, returns 201 revision resource) wired to `raw-entries.appendEntry`

**Checkpoint**: Raw space behaves as an append-only evidence store through the API (quickstart S2)

---

## Phase 5: User Story 3 - Maintain AI-Generated Pages in OKF Form (Priority: P1)

**Goal**: Generated-space pages are OKF-conformant (validation + injection), provenance (`actor_kind`/`nature`/`humanModified`) is recorded and answerable, and MCP/API-key creation defaults to the generated space in LLM Wiki mode

**Independent Test**: Create generated pages with/without frontmatter (injection vs 422), verify `origin`/`humanModified` via API after a human edit, verify API-key create without `space` lands in generated (quickstart S3)

### Tests for User Story 3

- [X] T028 [P] [US3] Unit tests for OKF validation and archive writing in `apps/web/src/server/services/okf.test.ts` and `apps/web/src/server/transfers/okf-archive-writer.test.ts`: no block → inject; valid → unchanged + unknown keys preserved; missing/empty `type` or unparseable YAML → reject; `index`/`log` path leaf → `OKF_RESERVED_PATH`; emitted concepts preserve source frontmatter and the bundle passes the OKF v0.1 checklist
- [X] T029 [P] [US3] Integration tests in `apps/web/src/server/services/pages.test.ts`, `apps/web/src/server/services/public-content.test.ts`, and transfer export tests: generated create/draft runs OKF source hooks; create and path-changing property updates reject normalized `index`/`log` leaves; `humanModified` changes only after a session-actor revision; page origin uses v1 actor while every revision includes its actor + page nature; api_key create without `space` targets generated in llm-wiki mode/default in copilot; generated OKF export uses latest draft or published revision without portable-wrapper frontmatter

### Implementation for User Story 3

- [X] T030 [US3] Implement `apps/web/src/server/services/okf.ts`: `ensureOkfConceptPath(path)` and `ensureOkfConformance(source, { title, now })` using the existing `yaml` dependency; implement `apps/web/src/server/transfers/okf-archive-writer.ts` to preserve concept frontmatter and validate emitted Markdown per contracts/okf-conformance.md
- [X] T031 [US3] Invoke the OKF source hook from `create`/`newDraft` and the normalized-path hook from `create`/path-changing `updateProperties` in `apps/web/src/server/services/pages.ts` for generated pages; extend `site_export` options in `packages/shared/src/transfers.ts`, `apps/web/src/server/services/transfers.ts`, `apps/web/src/server/services/transfer-export.ts`, and `apps/web/src/server/jobs/transfer-export.ts` with the Admin-only `{ space:'generated', format:'okf' }` branch using latest revisions and the dedicated writer, preserving the options on retry
- [X] T032 [US3] Add the creation-time space default rule in `apps/web/src/server/services/public-content.ts` `createPage`: api_key actor + llm-wiki mode + no explicit `space` ⇒ `generated` (FR-018); session actor keeps `default`
- [X] T033 [US3] Compute `humanModified` (EXISTS human-actor revision) and assemble page/revision provenance in `apps/web/src/server/services/public-content.ts`: page actor from version 1, revision actor from that row, stable page nature on both, and Admin-only projection of current page `linkTarget`, historical revision `linkTargetPageId`, and raw revision `source` (null for unauthorized/public callers even after migration)

**Checkpoint**: Generated space is OKF-conformant with complete provenance (quickstart S3)

---

## Phase 6: User Story 4 - Publish Generated Content via Softlink Pages (Priority: P1)

**Goal**: Wiki-space link pages render a generated target's current published content at a wiki path without copying; invalidation fans out from target to all link paths

**Independent Test**: Create link page → anonymous read shows target content; republish target → link path updates; delete target → graceful 404; delete link → target untouched (quickstart S4)

### Tests for User Story 4

- [X] T034 [P] [US4] Service tests in `apps/web/src/server/services/link-pages.test.ts`: create validation (target generated-space, native, live; no chains/self), forced nature `generated`, create/retarget revisions preserve their historical `link_target_page_id`, delete link spares target
- [X] T035 [P] [US4] Read-path tests in `apps/web/src/server/services/pages.test.ts` for `getLive` link resolution (serves target's current published revision at link path; 404 when target unpublished/deleted), anonymous resource/sitemap projection tests proving target id/path/title are not disclosed, and invalidation fan-out coverage in `apps/web/src/server/cache/public-cache.test.ts`

### Implementation for User Story 4

- [X] T036 [US4] Implement `apps/web/src/server/services/link-pages.ts`: `createLinkPage(ctx, { path, title?, targetPageId })` (validates target, creates live page with a `NULL`-source revision whose `link_target_page_id` records the target), `retargetLinkPage(ctx, pageId, targetPageId)` (new revision preserving the new target), `deleteLinkPage` (soft-delete link only), `listLiveLinksForTarget(targetPageId)`
- [X] T037 [US4] Extend `getLive` and cached variants (`getCachedPublicLivePage`) in `apps/web/src/server/services/pages.ts` to resolve `kind='link'`: load target's current published revision, return its content under the link page's path/title; return not-found when the target is unpublished/deleted
- [X] T038 [US4] Add link fan-out invalidation in `apps/web/src/server/cache/public-cache.ts` and call sites (`revisions.ts` publish/unpublish, `pages.ts` remove/updateProperties): after target mutations, `revalidatePath` every live link path from `listLiveLinksForTarget`
- [X] T039 [US4] Support `kind=link` + `linkTargetPageId` in `POST /v1/pages` and retarget via `PATCH /v1/pages/[id]` in `apps/web/src/server/services/public-content.ts` and `apps/web/app/api/v1/pages/[id]/route.ts`; include `kind` and permission-projected `linkTarget` in page/tree resources, while sitemap output contains only the public wiki link URL and never generated target metadata

**Checkpoint**: Softlink publishing works end-to-end with correct ISR behavior (quickstart S4)

---

## Phase 7: User Story 5 - Navigate and Work Across the Three Spaces (Priority: P2)

**Goal**: Admins get a URL-addressable space switcher (wiki/generated/raw), authenticated reader routes for raw/generated, space-aware editor, and link/human-modified indicators

**Independent Test**: Admin switches spaces from the nav with URLs `/spaces/generated/...` and `/spaces/raw/...`; non-admin sees no switcher and is denied; Copilot mode removes the switcher (quickstart S5)

### Tests for User Story 5

- [X] T040 [P] [US5] Playwright e2e for space switching, breadcrumbs, and denial paths in `apps/web/e2e/spaces-navigation.spec.ts` (Admin sees switcher + navigates with route/tree-derived breadcrumbs; editor role gets no switcher and 404/403 on `/spaces/raw/...`; copilot mode hides all of it)

### Implementation for User Story 5

- [X] T041 [US5] Create authenticated reader route `apps/web/app/(user)/spaces/[space]/[...path]/page.tsx` (Admin-gated, resolves `space` param to raw/generated only, reuses reader components with a space context, renders breadcrumbs from route + page tree) plus a space-aware tree loader using `getPageTree({ space })`
- [X] T042 [US5] Add the space switcher to `apps/web/src/components/layout/Navigator.tsx` (visible only when mode is `llm-wiki` AND actor is admin; active state derived from URL; links to `/`, `/spaces/generated`, `/spaces/raw`) fed by a lightweight server-provided mode/role context outside the ISR body
- [X] T043 [US5] Make editor routes space-aware: `apps/web/app/(public)/new/page.tsx` and `apps/web/app/(public)/edit/[...path]/page.tsx` accept a space context and post to v1 with `space`; `apps/web/src/components/pages/NewPageDialog.tsx` and `EditPageForm.tsx` pass it through
- [X] T044 [US5] Add indicators per FR-016: "linked from generated" badge + target link on link pages, human-modified indicator on generated pages (authenticated-only components in `apps/web/src/components/pages/`), and a "Publish as link…" action + dialog (choose wiki path) on generated pages calling `POST /v1/pages` with `kind=link` — all composed outside cached public bodies, using the custom dialog primitives (no browser alerts)
- [X] T045 [P] [US5] Add en/zh strings for switcher, badges, and dialog in `apps/web/src/i18n/locales/en.ts` and `apps/web/src/i18n/locales/zh.ts`

**Checkpoint**: Full cross-space navigation works with correct visibility per role and mode (quickstart S5)

---

## Phase 8: User Story 6 - Query Raw and Generated Spaces via API and MCP (Priority: P2)

**Goal**: v1 read surfaces accept `space` and `filterType` with permission-safe projection; MCP exposes space params, OKF filtering, and `append_raw_entry`

**Independent Test**: MCP `list_pages(space, filterType)` filters both spaces; reader-scoped key denied; `append_raw_entry` succeeds; search returns raw/generated hits only for admins (quickstart S6)

### Tests for User Story 6

- [X] T046 [P] [US6] API tests for `space`/`filterType` plus list `filterTag`/`createdStart`/`createdEnd` in `apps/web/app/api/v1/pages/route.test.ts`, `apps/web/app/api/v1/tree/route.test.ts`, and `apps/web/app/api/v1/search/pages/route.test.ts`, plus ID-addressed route coverage (collection filtering correctness, complete page/revision origin + raw source shapes, resolved-resource permission checks, permission projection of link targets, denial without existence leak)
- [X] T047 [P] [US6] Search projection tests for space-kind visibility in `apps/web/src/server/services/search/candidate-projection.test.ts` (raw/generated candidates visible to admin only; wiki unchanged)
- [X] T048 [P] [US6] MCP unit tests in `packages/mcp-server/src/tools/append-raw-entry.test.ts` and schema/shape tests for extended tools in `packages/mcp-server/src/shapes.test.ts`: list filter forwarding, complete origin fields, current page and historical revision link targets, raw append source, and pending-switch errors

### Implementation for User Story 6

- [X] T049 [US6] Wire `space` + `filterType` (frontmatter `type`) through `apps/web/src/server/services/public-content.ts` (`listPages`, `getPageTree`, `searchPages`, `getStats`) and corresponding collection/search `apps/web/app/api/v1/**/route.ts` query schemas; ensure `listPages` also forwards existing tag filtering plus `createdStart`/`createdEnd`, while ID-addressed page/revision/backlink/link/diff routes stay parameter-compatible and enforce the resolved resource's space kind
- [X] T050 [US6] Make `apps/web/src/server/services/search/candidate-projection.ts` and `apps/web/src/server/services/search/engines/{postgres-tsvector.ts,postgres-trigram.ts}` space-parameterized with per-space-kind visibility (wiki: anonymousRead; raw/generated: admin-only + mode check); vector retrieval left unchanged per research D8
- [X] T051 [US6] Extend MCP collection/search tools in `packages/mcp-server/src/tools/` with optional `space` (`list_pages`, `get_page_tree`, `search_wiki`, `get_stats`), `filterType` (`list_pages`, `search_wiki`), and list-page `filterTag`/`createdStart`/`createdEnd`, threading params through `packages/mcp-server/src/api-client.ts`; keep ID-addressed tool inputs unchanged and verify they can read permitted raw/generated resources by UUID
- [X] T052 [US6] Add `nature`, `inputKind`/`source`, and `kind`/`linkTargetPageId` args to `create_page` (and per-item `space` to `batch_create_pages`) in `packages/mcp-server/src/tools/create-page.ts` and `batch-create-pages.ts`, documenting raw/link forced-nature rules
- [X] T053 [US6] Create `append_raw_entry` tool in `packages/mcp-server/src/tools/append-raw-entry.ts`, register it in `packages/mcp-server/src/server.ts`, and flatten its result in `packages/mcp-server/src/shapes.ts`
- [X] T054 [P] [US6] Update `packages/mcp-server/README.md` tool table + agent notes for spaces, OKF filtering, and raw immutability

**Checkpoint**: Agents can filter/read/append both new spaces through MCP with correct permissions (quickstart S6)

---

## Phase 9: User Story 7 - Switch Writing Modes Safely (Priority: P2)

**Goal**: Copilot→LLM Wiki is a zero-migration flip; LLM Wiki→Copilot migrates all raw/generated pages into the wiki space (per-source-space visibility choice, link materialization) via a background job gated by a confirmation dialog

**Independent Test**: Switch forward with content intact; switch back with warning + visibility selects and verify migrated pages at `raw/…`/`generated/…` with history, chosen visibility, and materialized links; cancel path changes nothing; kill-worker drill retries idempotently (quickstart S7)

### Tests for User Story 7

- [X] T055 [P] [US7] Job tests in `apps/web/src/server/jobs/writing-mode-switch.test.ts`: one transaction moves raw/generated page rows in place with stable page/revision ids and related records, deterministic conflict suffixing + report mapping, visibility mapping, live-link in-place materialization with pre-generated revision id, retained historical target, and replication task across transaction-bound DatabaseStore and external-store mocks, unavailable-link soft delete, full DB rollback on migration/content-store failure with external orphan left unreachable, mode flip + pending clear, cache invalidation/replication kick after commit
- [X] T056 [P] [US7] Route/service concurrency tests for `PUT /api/settings/writing-mode` in `apps/web/app/api/settings/writing-mode/route.test.ts`: forward switch synchronous; switch-back requires visibility choices; returns `202 { jobId }`; duplicate request returns same job; conflicting request/content mutation returns `MODE_SWITCH_IN_PROGRESS`; in-flight write finishes before pending state; null/failed enqueue conditionally clears pending; Admin-only

### Implementation for User Story 7

- [X] T057 [US7] Add queue `writing-mode-switch` to `apps/web/src/server/jobs/runtime.ts` (QUEUES + expiry override) and implement `apps/web/src/server/jobs/writing-mode-switch.ts` per research D10: lock pending setting, compute paths, move rows in place, materialize links using the content-store read router plus pre-generated revision ids (`DatabaseStore(tx)` for Database, external-first for Local/S3) and transactional storage-replication tasks, soft-delete unavailable links, flip mode + clear pending in one DB transaction, persist progress and conflict-path mappings in the job report, then invalidate affected public paths and kick replication only after commit
- [X] T058 [US7] Register the queue + handler in `apps/web/src/server/jobs/register.ts`; add boot recovery that verifies a pending row's stored job id is absent before re-enqueuing that exact id, plus terminal-failure cleanup that conditionally clears pending state after transaction rollback
- [X] T059 [US7] Implement `switchMode(target, { rawVisibility, generatedVisibility })` in `apps/web/src/server/services/writing-mode.ts` (validate transition + choices, forward flip + cache invalidation, pre-generate switch job UUID, mode-row update, pg-boss enqueue with `{ id }`, conditional pending cleanup on immediate enqueue failure, duplicate/conflict handling) and expose complete switch state through `GET|PUT /api/settings/writing-mode`
- [X] T060 [US7] Build the switch-back confirmation dialog in `apps/web/src/components/admin/writing-mode/SwitchModeDialog.tsx` (migration warning text, independent public/Admin-only visibility selects, confirm/cancel) wired into T020; poll job status with TanStack Query, surface failure/retry and final conflict-path report state, and disable all content mutation controls through the shared pending-mode context while reads remain available
- [X] T061 [P] [US7] Add en/zh strings for the dialog, warning, and job status in `apps/web/src/i18n/locales/en.ts` and `apps/web/src/i18n/locales/zh.ts`

**Checkpoint**: Both switch directions behave per spec with zero content loss (quickstart S7)

---

## Phase 10: Polish & Cross-Cutting Concerns

**Purpose**: Documentation, API spec regeneration, and full verification

- [X] T062 Regenerate and commit OpenAPI output via next-open-api (`apps/web/public/openapi.json`) covering all v1 deltas, and verify `/api-docs` renders the new params/endpoints
- [X] T063 [P] Add Playwright e2e for onboarding mode selection and admin mode switch in `apps/web/e2e/writing-mode.spec.ts`
- [X] T064 [P] Update user-facing docs (wiki help pages/README section describing the two writing modes, Admin-private spaces, OKF export, switch-back write barrier, and MCP usage) in `README.md` and sample help content if affected
- [X] T065 Validate public-content ISR/static generation end-to-end for link pages: cached body contains no session data or generated target metadata; anonymous page/tree/revision/sitemap projections contain no target/source provenance; target republish → link path revalidated; mode switch → all affected paths revalidated (constitution P12 + Public Content Delivery gate)
- [ ] T066 Run the full quickstart.md validation (S1–S7 + OKF bundle validation + switch transaction failure drills) against `docker compose up -d --build`
- [X] T067 Final gates: `pnpm lint`, `pnpm typecheck`, `pnpm --filter @next-wiki/web test`, and `pnpm db:generate` reporting "No schema changes"; anti-pattern scan per constitution compliance review (no second-class AI content paths, no verb URLs, no duplicate entry points, breadcrumbs present, TanStack Query owns job state)

---

## Phase 11: Raw Space Spec Revision (2026-07-19 clarification)

**Purpose**: Bring implementation in line with the 2026-07-19 clarification — raw entries preserve original source format byte-identical (no OKF injection), use dual-track storage (extracted text in `content_source` + original bytes in `content_assets`), are filed under an admin-managed `raw_categories` taxonomy, AND participate in semantic retrieval through the existing `ai-index` job with space-kind-aware permission gating in `ai-retrieval.ts`. Affects US2 (raw create/append), US3 (OKF hook must NOT fire on raw), US5 (raw reader renderer dispatch), US6 (filter dimensions and `list_raw_categories` tool), the foundational schema migration, and the semantic-retrieval permission path. UI is also affected (admin taxonomy page, raw content renderer dispatcher).

**Superseded tasks**: T024, T026, T027, T053 (the parts that built OKF frontmatter on raw entries / treated `inputKind` as OKF `type` / accepted only markdown chunks in `append_raw_entry`) are **superseded** by T074, T078, T081 — their raw-specific behavior is rewritten by Phase 11. T022, T023, T028 (the parts that asserted OKF injection / `filterType`-as-inputKind) are likewise rewritten by T068, T069, T071. The historical `[X]` markers stay on the old tasks for traceability; Phase 11 owns the new behavior.

**Conventions**: Schema changes ONLY via `pnpm db:generate` (migration `0025_*`). After each logical group, run `pnpm lint && pnpm typecheck` and commit. API changes must regenerate OpenAPI via next-open-api.

### Tests for the revision

- [X] T068 [P] [US2] Update `apps/web/src/server/services/raw-entries.test.ts`: raw create with `contentType` other than `text/markdown` preserves body byte-identical (no `---\ntype: …` frontmatter injected); raw create with `originalBytes` stores the asset via `content_assets` and references it via `original_asset_id` (sha256 recorded, immutable); declared `contentType` that disagrees with `originalBytes` magic-bytes → `RAW_CONTENT_TYPE_MISMATCH`; raw create without `categoryId` and no admin default → `RAW_CATEGORY_REQUIRED`; raw create with retired `categoryId` → `RAW_CATEGORY_RETIRED`; raw append with `originalBytes` attaches a NEW asset row (prior revision's asset untouched); append-only immutability holds for both extracted text AND original bytes. **Delete the legacy OKF-injection assertions** (frontmatter `type:` set from `inputKind`, source keys in frontmatter) — they contradict the 2026-07-19 clarification.
- [X] T069 [P] [US3] Update `apps/web/src/server/services/okf.test.ts` and `pages.test.ts`: OKF hook does NOT fire when `space.kind='raw'` regardless of `contentType`; raw body is never reformatted; `filterInputKind` and `filterCategoryId` are independent from `filterType`. **Delete legacy assertions** that `inputKind` is stored as OKF `type` on raw entries.
- [X] T070 [P] [US5] Playwright e2e additions in `apps/web/e2e/spaces-navigation.spec.ts`: raw entry with `contentType=application/pdf` renders through a PDF viewer (`<iframe>` of the original-bytes blob URL is acceptable) + "Download original" affordance; raw entry with `contentType=application/json` renders as pretty-printed JSON in `<pre>`; raw entry with `contentType=text/x-log` renders in monospace; markdown entry still renders through the markdown renderer; a notice is shown when an entry's content type has no dedicated viewer (falls back to plain text + Download original).
- [X] T071 [P] [US6] Update `packages/mcp-server/src/tools/append-raw-entry.test.ts` and schema/shape tests in `packages/mcp-server/src/shapes.test.ts`: tool accepts `contentType` + optional `originalBytes`; revision resource exposes `contentType`, nullable `originalAsset`, nullable `categoryId`; `list_raw_categories` tool returns taxonomy; `filterInputKind` and `filterCategoryId` are wired and independent from `filterType`. **Delete legacy assertions** that `inputKind` flows through `filterType`.
- [X] T072 [P] [US2] Service tests for `apps/web/src/server/services/raw-categories.test.ts`: at most one `is_default=true` (partial unique); retire sets `is_retired=true`; delete rejects with `RAW_CATEGORY_HAS_ENTRIES` when entries reference; slug/name uniqueness; default applied silently on raw create when no explicit `categoryId`

### Implementation for the revision

- [X] T073 [US2] Schema migration `0025_*` via `pnpm db:generate`: broaden `page_revisions.content_type` from enum to open text (NOT NULL + `CHECK (content_type ~ '^[\w-]+/[\w.+-]+(\+[\w-]+)?(\;.*)?$')` for RFC 2046 grammar); add `page_revisions.original_asset_id` (uuid NULL FK → `content_assets.id` ON DELETE RESTRICT); add `pages.raw_category_id` (uuid NULL FK → `raw_categories.id` ON DELETE RESTRICT); new `raw_categories` table (id, name, slug, description, is_default, is_retired, created_at, updated_at, updated_by) with partial unique index on `is_default=true` and unique indexes on slug/name. Verify a second `pnpm db:generate` reports "No schema changes". No backfill needed — raw space has no historical data.
- [X] T073a [US2] Add MIME type parsing to `packages/shared/src/pages.ts`: import a standard MIME type library (e.g. `content-type` or `mime-types` — pick the lighter one at implementation time, no in-house parser), expose a Zod schema `mimeTypeSchema` that accepts RFC 2046-conformant strings; use it for raw create/append body validation; reject with `RAW_CONTENT_TYPE_INVALID` (422) on parse failure. Pair with the DB CHECK from T073.
- [X] T074 [US2] Rewrite `apps/web/src/server/services/raw-entries.ts` per FR-007/FR-007a/FR-007b/FR-007c: skip the OKF hook entirely (delete any frontmatter construction code carried over from T024); verify caller-supplied `contentType` against `originalBytes` via minimal magic-byte sniffing in the style of `content-store/image-validation.ts:sniffImageType` (PDF `%PDF-`, PNG `\x89PNG`, JPEG `\xFF\xD8\xFF`, GIF `GIF8`, WebP `RIFF....WEBP`, JSON `{`/`[`, HTML `<!DOCTYPE`/`<html`/`<body`, log/`text/plain` default); reject `RAW_CONTENT_TYPE_MISMATCH`; store extracted text in `content_source` and original bytes via `content_assets` referenced by `original_asset_id`; require `categoryId` (or apply admin default) at create and reject on retired categories; preserve body byte-identical (no frontmatter, no markdown conversion).
- [X] T075 [US2] Implement `apps/web/src/server/services/raw-categories.ts`: admin CRUD (create, list with `entryCount`, update name/slug/description/is_default, retire/delete with `RAW_CATEGORY_HAS_ENTRIES` protection); partial unique enforcement for `is_default`.
- [X] T076 [US2] Add admin API surface `apps/web/app/api/settings/raw-categories/...` per `contracts/v1-api-delta.md`: GET list (with `entryCount`), POST create, PATCH update, DELETE retire (or reject with `RAW_CATEGORY_HAS_ENTRIES`); admin-only; `SPACE_UNAVAILABLE` in copilot mode.
- [X] T077 [US3] Update `apps/web/src/server/services/okf.ts` and call sites: the OKF hook MUST short-circuit when `space.kind !== 'generated'`; add a regression test that raw and wiki pages bypass the hook.
- [X] T078 [US2] Update `apps/web/app/api/v1/pages/route.ts` and `apps/web/app/api/v1/pages/[id]/appends/route.ts`: accept `contentType`, `originalBytes`, `categoryId`; thread them through the service; report `originalAsset` and `categoryId` on revision resources; add `filterInputKind` and `filterCategoryId` to `GET /v1/pages` and `/v1/search/pages`. **Remove the legacy mapping** of `inputKind` to OKF `filterType` (it is now its own filter dimension).
- [X] T079 [US5] Implement raw content renderer dispatcher in `apps/web/src/components/pages/raw-content/`: PDF viewer (`<iframe>` of the original-bytes blob URL — browser-native, no PDF.js dependency), JSON viewer (`<pre>{JSON.stringify(value, null, 2)}</pre>` — no external library), monospace log view (`<pre>`), image viewer (`<img>`), sanitized HTML (`text/html` — reuse existing sanitization if present, otherwise render as plain text), markdown (`text/markdown` — existing renderer), plain-text default; plus a "Download original" affordance when `originalAsset` is non-null; wire into `apps/web/app/(user)/spaces/[space]/[...path]/page.tsx`. UI must NOT claim raw supports only lexical search — semantic search works (see T086).
- [X] T080 [US5] Build `apps/web/app/(admin)/admin/raw-categories/page.tsx` + `apps/web/src/components/admin/RawCategoriesManager.tsx`: list categories with entry counts; create/rename/retire; mark/unmark default; report retired state clearly; composed of existing UI primitives, no browser alerts.
- [X] T081 [US6] Update `packages/mcp-server/src/tools/create-page.ts`, `append-raw-entry.ts`, `list_pages`/`search_wiki` shapes, and add new `list_raw_categories` tool registered in `packages/mcp-server/src/server.ts`; flatten results in `packages/mcp-server/src/shapes.ts`; thread `contentType`/`originalBytes`/`categoryId`/`filterInputKind`/`filterCategoryId` through `api-client.ts`.
- [X] T082 [P] [US6] Update `packages/mcp-server/README.md` tool table + agent notes: raw entries preserve original format (no OKF), dual-track storage explained, `filterInputKind`/`filterCategoryId` independent from `filterType`, `list_raw_categories` for taxonomy discovery, semantic retrieval works for raw (admin-only) per T086.
- [X] T083 [P] Add en/zh strings for raw renderer dispatcher, raw categories admin page, and new error messages in `apps/web/src/i18n/locales/en.ts` and `apps/web/src/i18n/locales/zh.ts`.
- [X] T084 Regenerate and commit OpenAPI output via next-open-api (`apps/web/public/openapi.json`) covering all v1 deltas from this revision.
- [ ] **T085 Final gates**: `pnpm lint`, `pnpm typecheck`, `pnpm --filter @next-wiki/web test`, `pnpm test:e2e`, and `pnpm db:generate` reporting "No schema changes"; full quickstart.md S2/S3/S5/S6 re-validation against `docker compose up -d --build`.

### Cross-cutting tasks added during the 2026-07-19 review pass

- [ ] **T086 [US6]** Replace `apps/web/src/server/services/ai-retrieval.ts:60` (the single default-space `anonymousRead` gate) with a per-candidate space-kind check: each `VectorMatch` joins to its page's `space.kind`; raw/generated candidates are returned only to callers permitted to read those spaces (admins and admin-backed write-scoped keys); wiki candidates follow the existing `anonymousRead` rule. Add `space` parameter to `POST /v1/search/semantic` (optional; when omitted, returns the union of spaces the caller can read). Test in `apps/web/src/server/services/ai-retrieval.test.ts`: anonymous caller gets wiki-only results even when raw/generated chunks exist in the shared `ai_knowledge_chunks` index; admin caller gets the full union.
- [X] **T087** Extend `apps/web/src/server/jobs/orphan-cleanup.ts` to skip any asset id appearing in `page_revisions.original_asset_id` when deciding which abandoned uploads to reclaim; add a regression test that a raw original-byte asset is preserved even after the upload TTL expires, while an unreferenced abandoned upload is still reclaimed. Protects D14's dual-track contract from accidental byte loss.
- [X] **T088** Update `CLAUDE.md` MCP server tool table (in the MANUAL ADDITIONS section) to add `append_raw_entry` and `list_raw_categories`, document `filterInputKind` / `filterCategoryId` as raw-only independent dimensions, and note that semantic search now covers raw/generated for Admin callers.
- [X] **T089** Code cleanup pass: grep `apps/web/src` and `packages/mcp-server/src` for residual OKF-on-raw references (`buildOklFrontmatter` on raw path, `inputKind as type`, `filterType=chat-transcript`, markdown-only `append_raw_entry`) and remove them; verify with `pnpm typecheck` after cleanup. Pairs with T074/T077/T078/T081.

**Checkpoint**: Raw entries preserve original source format byte-identical, dual-track storage works (extracted text + original bytes), admin-managed taxonomy is in place, OKF hooks fire only on generated space, semantic retrieval is space-kind-aware, orphan cleanup protects raw original bytes, UI dispatches renderers by content type, MCP exposes independent filter dimensions (quickstart S2/S3/S5/S6 as revised).

---

## Dependencies & Execution Order

### Phase Dependencies

- **Setup (Phase 1)**: No dependencies - can start immediately
- **Foundational (Phase 2)**: Depends on Setup - BLOCKS all user stories
- **User Stories (Phase 3+)**: All depend on Foundational completion
- **Polish (Phase 10)**: Depends on all desired user stories being complete

### User Story Dependencies

- **US1 Onboarding step (P1)**: Independent after Foundational
- **US2 Raw space (P1)**: Independent after Foundational
- **US3 Generated OKF + provenance (P1)**: Independent after Foundational
- **US4 Link pages (P1)**: Independent after Foundational (needs only the `generated` space kind from Phase 2, not US3's OKF logic)
- **US5 Navigation (P2)**: After Foundational; fullest value once US2–US4 exist, but routes/switcher can be built and tested against seeded spaces
- **US6 API/MCP (P2)**: Depends on US2 (`/appends` endpoint for the MCP tool); read-side work (T049–T051) can start after Foundational
- **US7 Mode switching (P2)**: Logically last — migrates content produced by US2/US3 and materializes US4 links

### Within Each User Story

- Tests SHOULD be written first and fail before implementation
- Services before routes; routes before UI
- Story checkpoint validation before moving on

### Parallel Opportunities

- Phase 2: T012 and the test scaffolding in T013 can start in parallel; T003→T004→T005 are sequential, T006 precedes T007, and T011 depends on the T008 write-barrier helper
- US2–US5 can proceed fully in parallel after Phase 2 (different services/routes/components)
- US6 read-side (T049–T051) and create-tool work (T052) can run parallel with US2–US4; T053 waits on US2's append endpoint contract
- Within stories: test tasks [P] together; i18n tasks [P] always

---

## Parallel Example: User Stories 2-4 (after Phase 2)

```bash
# Three independent P1 slices, different files:
Task: "Implement raw-entries service + appends route (US2)"
Task: "Implement okf.ts + generated-space hooks (US3)"
Task: "Implement link-pages service + getLive resolution (US4)"
```

## Parallel Example: User Story 6

```bash
# Read-side API wiring (independent of US2):
Task: "Wire space/filterType through public-content.ts and v1 routes (T049)"
Task: "Space-aware search projection (T050)"
Task: "MCP space params on read tools (T051)"
```

---

## Implementation Strategy

### MVP First (P1 cluster)

1. Complete Phase 1: Setup
2. Complete Phase 2: Foundational (CRITICAL - blocks all stories)
3. Complete Phase 3–6: US1–US4 (all P1 — the coherent MVP: mode selectable, three spaces functional, softlink publishing live)
4. **STOP and VALIDATE**: quickstart S1–S4
5. Deploy/demo if ready

### Incremental Delivery

1. Setup + Foundational → Foundation ready
2. US1–US4 (P1) → validate S1–S4 → MVP
3. US5 navigation → validate S5 → demo
4. US6 API/MCP → validate S6 → agents get full access
5. US7 mode switching → validate S7 → safe exits
6. Polish → full quickstart + gates

### Parallel Team Strategy

1. Team completes Setup + Foundational together
2. After Foundational: Dev A → US2, Dev B → US3, Dev C → US4, Dev D → US1 + US5
3. Reconverge for US6 (needs US2) and US7 (needs US2–US4)

---

## Notes

- [P] tasks = different files, no dependencies
- [Story] label maps task to specific user story for traceability
- Migration rule: edit `schema/*.ts` → `pnpm db:generate`; verify a second run is a no-op before committing (AGENTS.md)
- Commit after each task or logical group; keep commits small and single-purpose
- Stop at any checkpoint to validate a story independently
- Avoid: vague tasks, same file conflicts, cross-story dependencies that break independence
