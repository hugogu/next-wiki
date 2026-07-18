---

description: "Task list for 022 Wiki Writing Modes (Copilot / LLM Wiki)"
---

# Tasks: Wiki Writing Modes — Copilot and LLM Wiki

**Input**: Design documents from `/specs/022-llm-wiki-mode/`

**Prerequisites**: plan.md, spec.md, research.md, data-model.md, contracts/, quickstart.md

**Tests**: Test tasks are included per the project rule "always write unit and integration tests for new code changes" (repo AGENTS.md). Write service/route tests with Vitest; e2e with Playwright where noted.

**Organization**: Tasks are grouped by user story to enable independent implementation and testing of each story.

**Conventions**: Schema changes ONLY via `pnpm db:generate` (never hand-authored SQL). After each logical group, run `pnpm lint && pnpm typecheck` and commit. API changes must regenerate OpenAPI via next-open-api (T044).

## Format: `[ID] [P?] [Story] Description`

- **[P]**: Can run in parallel (different files, no dependencies)
- **[Story]**: Which user story this task belongs to (e.g., US1, US2, US3)

---

## Phase 1: Setup (Shared Infrastructure)

**Purpose**: Verify toolchain and scaffold the feature's service files

- [ ] T001 Verify baseline on branch `022-llm-wiki-mode`: `docker compose up -d --build`, `pnpm --filter @next-wiki/web test` green, and `pnpm db:generate` reports "No schema changes" before any schema edit
- [ ] T002 [P] Create empty service scaffolds matching plan structure: `apps/web/src/server/services/spaces.ts`, `apps/web/src/server/services/writing-mode.ts`, `apps/web/src/server/services/raw-entries.ts`, `apps/web/src/server/services/link-pages.ts`, `apps/web/src/server/services/okf.ts`

---

## Phase 2: Foundational (Blocking Prerequisites)

**Purpose**: Schema migration, space resolver, mode settings, permission extension — every story depends on these

**⚠️ CRITICAL**: No user story work can begin until this phase is complete

- [ ] T003 Add the 6 enums (`writing_mode`, `space_kind`, `page_kind`, `actor_kind`, `content_nature`, `page_visibility`) to `apps/web/src/server/db/schema/enums.ts`
- [ ] T004 Extend schema in `apps/web/src/server/db/schema/index.ts`: `spaces.kind`; `pages.kind`/`link_target_page_id`/`nature`/`visibility` (+ index on `link_target_page_id`); `page_revisions.actor_kind`; new singleton table `writing_mode_settings` with `CHECK (id = 'default')` per data-model.md
- [ ] T005 Run `pnpm db:generate` to produce migration `0022_*`, verify a second run reports "No schema changes", and confirm boot migration applies cleanly via `docker compose up -d --build`
- [ ] T006 Implement space resolver in `apps/web/src/server/services/spaces.ts` (`getSpaceBySlug`, `getSpaceByKind`, `listSpaces`, `resolveSpace(param?)` defaulting to slug `default`) with `unstable_cache` and a `SPACE_CACHE_TAG` invalidation helper
- [ ] T007 Replace all hardcoded `getDefaultSpace()` / `DEFAULT_SPACE_SLUG` copies with the resolver in `apps/web/src/server/services/{pages.ts,revisions.ts,public-content.ts,tags.ts,translations.ts,ai-retrieval.ts,public-ai.ts,transfer-page-writer.ts,transfer-export.ts}`, `apps/web/src/server/services/search/candidate-projection.ts`, `apps/web/src/server/services/search/engines/lexical-shared.ts`, and `apps/web/src/server/jobs/transfer-preview.ts` (behavior unchanged when no space is specified)
- [ ] T008 Implement writing-mode settings in `apps/web/src/server/services/writing-mode.ts`: `getMode()` (cached), `setMode()` internal, guards `requireSpaceKindAccess(ctx, space)` that deny raw/generated when mode is `copilot`
- [ ] T009 Update `apps/web/src/server/seed/index.ts` to idempotently ensure spaces `default` (kind wiki), `raw` (kind raw, `anonymous_read=false`), `generated` (kind generated, `anonymous_read=false`) on boot in all modes
- [ ] T010 Extend `can()` in `apps/web/src/server/permissions/index.ts`: page-list/page resources accept `spaceKind`; rules — raw: read/create admin-only, edit/delete/publish denied for all actors; generated: read/create/edit/publish/delete admin-only; wiki unchanged; add `visibility==='restricted'` ⇒ admin-only read/edit for concrete pages
- [ ] T011 Derive and persist `actor_kind` (session→human, api_key/internal→machine) and `nature` (explicit param wins; machine→generated, human→original) in write paths `apps/web/src/server/services/pages.ts` (`create`, `newDraft`) and `apps/web/src/server/services/translation-writer.ts` (pass `machine`)
- [ ] T012 [P] Update shared Zod contracts in `packages/shared/src/pages.ts` (resource fields `kind`, `linkTarget`, `origin { actorKind, nature }`, `humanModified`, `visibility`; query params `space`, `filterType`), `packages/shared/src/setup.ts` (step enum gains `writing_mode` between `ai` and `sample_pages`), and export new error codes `SPACE_UNAVAILABLE`, `SPACE_FORBIDDEN`, `RAW_SPACE_IMMUTABLE`, `OKF_TYPE_REQUIRED`, `LINK_TARGET_INVALID`, `MODE_SWITCH_INVALID`
- [ ] T013 [P] Foundational Vitest coverage: space resolver caching in `apps/web/src/server/services/spaces.test.ts`, `can()` space-kind matrix in `apps/web/src/server/permissions/index.test.ts`, and writing-mode guards in `apps/web/src/server/services/writing-mode.test.ts`

**Checkpoint**: Migration applied, three spaces seeded, permissions/mode guards green — user story implementation can now begin

---

## Phase 3: User Story 1 - Select Writing Mode During First-Run Setup (Priority: P1) 🎯 MVP

**Goal**: Onboarding asks for the writing mode (default Copilot) before sample generation; admin settings expose the current mode

**Independent Test**: Fresh deployment completes onboarding once per mode; verify step order, preselected default, and resulting `GET /api/settings/writing-mode` value; verify Copilot run shows no raw/generated anywhere (quickstart S1)

### Tests for User Story 1

- [ ] T014 [P] [US1] Service tests for `recordWritingMode` transitions (valid choice advances to `sample_pages`, mode persisted, invalid value rejected) in `apps/web/src/server/services/setup.test.ts`
- [ ] T015 [P] [US1] Route tests for `PUT /api/setup/writing-mode` (state machine integration, anonymous setup gating) in `apps/web/app/api/setup/writing-mode/route.test.ts`

### Implementation for User Story 1

- [ ] T016 [US1] Add `recordWritingMode` transition and adjust `nextStepAfterAi` to land on `writing_mode` in `apps/web/src/server/services/setup.ts`
- [ ] T017 [US1] Create route `PUT /api/setup/writing-mode` in `apps/web/app/api/setup/writing-mode/route.ts` calling the service and returning updated setup state
- [ ] T018 [US1] Create `WritingModeStep` component (radio cards: Copilot default/recommended, LLM Wiki) in `apps/web/src/components/setup/WritingModeStep.tsx` and insert `writing_mode` into `STEP_ORDER` before `sample_pages` in `apps/web/src/components/setup/FirstRunOnboarding.tsx`
- [ ] T019 [US1] Add `GET /api/settings/writing-mode` route in `apps/web/app/api/settings/writing-mode/route.ts` (admin-only, returns current mode from `writing-mode.ts`)
- [ ] T020 [US1] Create admin page `apps/web/app/(admin)/admin/writing-mode/page.tsx` (guarded by admin, displays current mode and description; switch action added in US7) and register the nav entry in `apps/web/src/components/layout/Navigator.tsx` ADMIN_GROUPS
- [ ] T021 [P] [US1] Add en/zh strings for the new step and admin page in `apps/web/src/i18n/locales/en.ts` and `apps/web/src/i18n/locales/zh.ts`

**Checkpoint**: Fresh setup in each mode yields the right mode and topology (quickstart S1)

---

## Phase 4: User Story 2 - Capture Original Inputs into the Append-Only Raw Space (Priority: P1)

**Goal**: Raw entries can be created and appended (server-side concatenation, auto-published); every edit/delete/unpublish attempt is rejected for all actors

**Independent Test**: Create raw entries of each input kind via API, append chunks, then attempt edit/delete/unpublish/draft as owner, admin, and API key — all rejected; revision 1 bytes identical after appends (quickstart S2)

### Tests for User Story 2

- [ ] T022 [P] [US2] Service tests for raw create/append/immutability in `apps/web/src/server/services/raw-entries.test.ts`: auto-publish, append concatenation, concurrent-append serialization (two appends → sequential version numbers), frontmatter `type`/`source` storage, mode guard rejects raw ops in copilot mode
- [ ] T023 [P] [US2] Route tests in `apps/web/app/api/v1/pages/[id]/appends/route.test.ts` and create-with-`space=raw` cases in `apps/web/app/api/v1/pages/route.test.ts`: 201 create/append, `RAW_SPACE_IMMUTABLE` on PATCH/DELETE/drafts/publication, `SPACE_UNAVAILABLE` in copilot mode, `SPACE_FORBIDDEN` for reader/editor keys

### Implementation for User Story 2

- [ ] T024 [US2] Implement `apps/web/src/server/services/raw-entries.ts`: `createEntry(ctx, { path, title, inputKind, source, content })` (validates input kind, builds OKF frontmatter, auto-publishes v1) and `appendEntry(ctx, pageId, { content, source? })` (transaction: load current content, concatenate with separator, insert next version, publish immediately)
- [ ] T025 [US2] Add raw-space immutability guards to `apps/web/src/server/services/pages.ts` (`newDraft`, `updateProperties`, `remove`) and `apps/web/src/server/services/revisions.ts` (unpublish path): when the page's space kind is `raw`, throw `RAW_SPACE_IMMUTABLE` for every actor
- [ ] T026 [US2] Extend `POST /v1/pages` in `apps/web/src/server/services/public-content.ts` and `apps/web/app/api/v1/pages/route.ts` to accept `space`, `inputKind`, `source`; route raw creates through `raw-entries.ts`
- [ ] T027 [US2] Create append sub-resource `POST /v1/pages/[id]/appends` in `apps/web/app/api/v1/pages/[id]/appends/route.ts` (Zod body `{ content, source? }`, returns 201 revision resource) wired to `raw-entries.appendEntry`

**Checkpoint**: Raw space behaves as an append-only evidence store through the API (quickstart S2)

---

## Phase 5: User Story 3 - Maintain AI-Generated Pages in OKF Form (Priority: P1)

**Goal**: Generated-space pages are OKF-conformant (validation + injection), provenance (`actor_kind`/`nature`/`humanModified`) is recorded and answerable, and MCP/API-key creation defaults to the generated space in LLM Wiki mode

**Independent Test**: Create generated pages with/without frontmatter (injection vs 422), verify `origin`/`humanModified` via API after a human edit, verify API-key create without `space` lands in generated (quickstart S3)

### Tests for User Story 3

- [ ] T028 [P] [US3] Unit tests for OKF validate/inject matrix in `apps/web/src/server/services/okf.test.ts` (no block → inject; valid → unchanged + unknown keys preserved; missing/empty `type` → reject; unparseable → reject)
- [ ] T029 [P] [US3] Integration tests in `apps/web/src/server/services/pages.test.ts` (generated-space create/draft runs OKF hook) and `apps/web/src/server/services/public-content.test.ts` (`humanModified` true only after a session-actor revision; api_key create without `space` targets generated in llm-wiki mode, default space in copilot mode)

### Implementation for User Story 3

- [ ] T030 [US3] Implement `apps/web/src/server/services/okf.ts`: `ensureOkfConformance(source, { title, now })` using the existing `yaml` dependency per contracts/okf-conformance.md
- [ ] T031 [US3] Invoke the OKF hook from `create`/`newDraft` in `apps/web/src/server/services/pages.ts` when the target space kind is `generated`; map rejections to `OKF_TYPE_REQUIRED`
- [ ] T032 [US3] Add the creation-time space default rule in `apps/web/src/server/services/public-content.ts` `createPage`: api_key actor + llm-wiki mode + no explicit `space` ⇒ `generated` (FR-018); session actor keeps `default`
- [ ] T033 [US3] Compute `humanModified` (EXISTS human-actor revision) and assemble `origin`/`nature` fields in the page resource builders in `apps/web/src/server/services/public-content.ts`

**Checkpoint**: Generated space is OKF-conformant with complete provenance (quickstart S3)

---

## Phase 6: User Story 4 - Publish Generated Content via Softlink Pages (Priority: P1)

**Goal**: Wiki-space link pages render a generated target's current published content at a wiki path without copying; invalidation fans out from target to all link paths

**Independent Test**: Create link page → anonymous read shows target content; republish target → link path updates; delete target → graceful 404; delete link → target untouched (quickstart S4)

### Tests for User Story 4

- [ ] T034 [P] [US4] Service tests in `apps/web/src/server/services/link-pages.test.ts`: create validation (target generated-space, native, live; no chains/self), retarget writes revision, delete link spares target
- [ ] T035 [P] [US4] Read-path tests in `apps/web/src/server/services/pages.test.ts` for `getLive` link resolution (serves target's current published revision at link path; 404 when target unpublished/deleted) and invalidation fan-out coverage in `apps/web/src/server/cache/public-cache.test.ts`

### Implementation for User Story 4

- [ ] T036 [US4] Implement `apps/web/src/server/services/link-pages.ts`: `createLinkPage(ctx, { path, title?, targetPageId })` (validates target, creates live page with a `NULL`-source revision recording the target), `retargetLinkPage(ctx, pageId, targetPageId)` (new retarget revision), `deleteLinkPage` (soft-delete link only), `listLiveLinksForTarget(targetPageId)`
- [ ] T037 [US4] Extend `getLive` and cached variants (`getCachedPublicLivePage`) in `apps/web/src/server/services/pages.ts` to resolve `kind='link'`: load target's current published revision, return its content under the link page's path/title; return not-found when the target is unpublished/deleted
- [ ] T038 [US4] Add link fan-out invalidation in `apps/web/src/server/cache/public-cache.ts` and call sites (`revisions.ts` publish/unpublish, `pages.ts` remove/updateProperties): after target mutations, `revalidatePath` every live link path from `listLiveLinksForTarget`
- [ ] T039 [US4] Support `kind=link` + `linkTargetPageId` in `POST /v1/pages` and retarget via `PATCH /v1/pages/[id]` in `apps/web/src/server/services/public-content.ts` and `apps/web/app/api/v1/pages/[id]/route.ts`; include `kind`/`linkTarget` in tree (`getPageTree`) and sitemap (`apps/web/app/sitemap.ts`) responses

**Checkpoint**: Softlink publishing works end-to-end with correct ISR behavior (quickstart S4)

---

## Phase 7: User Story 5 - Navigate and Work Across the Three Spaces (Priority: P2)

**Goal**: Admins get a URL-addressable space switcher (wiki/generated/raw), authenticated reader routes for raw/generated, space-aware editor, and link/human-modified indicators

**Independent Test**: Admin switches spaces from the nav with URLs `/spaces/generated/...` and `/spaces/raw/...`; non-admin sees no switcher and is denied; Copilot mode removes the switcher (quickstart S5)

### Tests for User Story 5

- [ ] T040 [P] [US5] Playwright e2e for space switching and denial paths in `apps/web/e2e/spaces-navigation.spec.ts` (admin sees switcher + navigates; editor role gets no switcher and 404/403 on `/spaces/raw/...`; copilot mode hides all of it)

### Implementation for User Story 5

- [ ] T041 [US5] Create authenticated reader route `apps/web/app/(user)/spaces/[space]/[...path]/page.tsx` (admin-gated, resolves `space` param to raw/generated only, reuses reader components with a space context) plus a space-aware tree loader using `getPageTree({ space })`
- [ ] T042 [US5] Add the space switcher to `apps/web/src/components/layout/Navigator.tsx` (visible only when mode is `llm-wiki` AND actor is admin; active state derived from URL; links to `/`, `/spaces/generated`, `/spaces/raw`) fed by a lightweight server-provided mode/role context outside the ISR body
- [ ] T043 [US5] Make editor routes space-aware: `apps/web/app/(public)/new/page.tsx` and `apps/web/app/(public)/edit/[...path]/page.tsx` accept a space context and post to v1 with `space`; `apps/web/src/components/pages/NewPageDialog.tsx` and `EditPageForm.tsx` pass it through
- [ ] T044 [US5] Add indicators per FR-016: "linked from generated" badge + target link on link pages, human-modified indicator on generated pages (authenticated-only components in `apps/web/src/components/pages/`), and a "Publish as link…" action + dialog (choose wiki path) on generated pages calling `POST /v1/pages` with `kind=link` — all composed outside cached public bodies, using the custom dialog primitives (no browser alerts)
- [ ] T045 [P] [US5] Add en/zh strings for switcher, badges, and dialog in `apps/web/src/i18n/locales/en.ts` and `apps/web/src/i18n/locales/zh.ts`

**Checkpoint**: Full cross-space navigation works with correct visibility per role and mode (quickstart S5)

---

## Phase 8: User Story 6 - Query Raw and Generated Spaces via API and MCP (Priority: P2)

**Goal**: v1 read surfaces accept `space` and `filterType` with permission-safe projection; MCP exposes space params, OKF filtering, and `append_raw_entry`

**Independent Test**: MCP `list_pages(space, filterType)` filters both spaces; reader-scoped key denied; `append_raw_entry` succeeds; search returns raw/generated hits only for admins (quickstart S6)

### Tests for User Story 6

- [ ] T046 [P] [US6] API tests for `space`/`filterType` on list/tree/search in `apps/web/app/api/v1/pages/route.test.ts`, `apps/web/app/api/v1/tree/route.test.ts`, `apps/web/app/api/v1/search/pages/route.test.ts` (filtering correctness + permission denial without existence leak)
- [ ] T047 [P] [US6] Search projection tests for space-kind visibility in `apps/web/src/server/services/search/candidate-projection.test.ts` (raw/generated candidates visible to admin only; wiki unchanged)
- [ ] T048 [P] [US6] MCP unit tests in `packages/mcp-server/src/tools/append-raw-entry.test.ts` and schema/shape tests for the extended tools in `packages/mcp-server/src/shapes.test.ts`

### Implementation for User Story 6

- [ ] T049 [US6] Wire `space` + `filterType` (frontmatter `type`, matching the existing `filterStatus`/`filterOwner` channel) through `apps/web/src/server/services/public-content.ts` (`listPages`, `getPageTree`, `searchPages`, `getStats`) and the corresponding `apps/web/app/api/v1/**/route.ts` query schemas
- [ ] T050 [US6] Make `apps/web/src/server/services/search/candidate-projection.ts` and `apps/web/src/server/services/search/engines/{postgres-tsvector.ts,postgres-trigram.ts}` space-parameterized with per-space-kind visibility (wiki: anonymousRead; raw/generated: admin-only + mode check); vector retrieval left unchanged per research D8
- [ ] T051 [US6] Extend MCP tools in `packages/mcp-server/src/tools/` with optional `space` (list_pages, get_page_tree, get_page, search_wiki, list_revisions, get_revision, get_backlinks, get_stats) and `filterType` (list_pages, search_wiki), threading params through `packages/mcp-server/src/api-client.ts`
- [ ] T052 [US6] Add `nature`, `inputKind`/`source`, and `kind`/`linkTargetPageId` args to `create_page` (and per-item `space` to `batch_create_pages`) in `packages/mcp-server/src/tools/create-page.ts` and `batch-create-pages.ts`
- [ ] T053 [US6] Create `append_raw_entry` tool in `packages/mcp-server/src/tools/append-raw-entry.ts`, register it in `packages/mcp-server/src/server.ts`, and flatten its result in `packages/mcp-server/src/shapes.ts`
- [ ] T054 [P] [US6] Update `packages/mcp-server/README.md` tool table + agent notes for spaces, OKF filtering, and raw immutability

**Checkpoint**: Agents can filter/read/append both new spaces through MCP with correct permissions (quickstart S6)

---

## Phase 9: User Story 7 - Switch Writing Modes Safely (Priority: P2)

**Goal**: Copilot→LLM Wiki is a zero-migration flip; LLM Wiki→Copilot migrates all raw/generated pages into the wiki space (per-source-space visibility choice, link materialization) via a background job gated by a confirmation dialog

**Independent Test**: Switch forward with content intact; switch back with warning + visibility selects and verify migrated pages at `raw/…`/`generated/…` with history, chosen visibility, and materialized links; cancel path changes nothing; kill-worker drill retries idempotently (quickstart S7)

### Tests for User Story 7

- [ ] T055 [P] [US7] Job tests in `apps/web/src/server/jobs/writing-mode-switch.test.ts`: migration copies pages+revisions with original version numbers/authors/actor_kind/timestamps, path-conflict suffixing, visibility mapping, link materialization, flip-last ordering, idempotent retry
- [ ] T056 [P] [US7] Route tests for `PUT /api/settings/writing-mode` in `apps/web/app/api/settings/writing-mode/route.test.ts` (forward switch synchronous; switch-back requires visibility choices → `MODE_SWITCH_INVALID` without them; returns `202 { jobId }`; admin-only)

### Implementation for User Story 7

- [ ] T057 [US7] Add queue `writing-mode-switch` to `apps/web/src/server/jobs/runtime.ts` (QUEUES + expiry override) and implement the migration handler in `apps/web/src/server/jobs/writing-mode-switch.ts` per research D10 (raw→`raw/…`, generated→`generated/…`, link materialization, setting flip last, progress on the job record, idempotent page-level skips)
- [ ] T058 [US7] Register the queue + handler in `apps/web/src/server/jobs/register.ts` and add boot-recovery re-enqueue for interrupted switch jobs
- [ ] T059 [US7] Implement `switchMode(target, { rawVisibility, generatedVisibility })` in `apps/web/src/server/services/writing-mode.ts` (validate transition + choices, forward flip + cache invalidation, switch-back enqueue) and expose `PUT /api/settings/writing-mode` in `apps/web/app/api/settings/writing-mode/route.ts`
- [ ] T060 [US7] Build the switch-back confirmation dialog in `apps/web/src/components/admin/writing-mode/SwitchModeDialog.tsx` (migration warning text, independent visibility selects for raw and generated, confirm/cancel) wired into the admin page from T020 with job-status polling on `202`
- [ ] T061 [P] [US7] Add en/zh strings for the dialog, warning, and job status in `apps/web/src/i18n/locales/en.ts` and `apps/web/src/i18n/locales/zh.ts`

**Checkpoint**: Both switch directions behave per spec with zero content loss (quickstart S7)

---

## Phase 10: Polish & Cross-Cutting Concerns

**Purpose**: Documentation, API spec regeneration, and full verification

- [ ] T062 Regenerate and commit OpenAPI output via next-open-api (`apps/web/public/openapi.json`) covering all v1 deltas, and verify `/api-docs` renders the new params/endpoints
- [ ] T063 [P] Add Playwright e2e for onboarding mode selection and admin mode switch in `apps/web/e2e/writing-mode.spec.ts`
- [ ] T064 [P] Update user-facing docs (wiki help pages/README section describing the two writing modes, spaces, and MCP usage) in `README.md` and sample help content if affected
- [ ] T065 Validate public-content ISR/static generation end-to-end for link pages: cached body contains no session data; target republish → link path revalidated; mode switch → all affected paths revalidated (constitution P12 + Public Content Delivery gate)
- [ ] T066 Run the full quickstart.md validation (S1–S7 + failure drills) against `docker compose up -d --build`
- [ ] T067 Final gates: `pnpm lint`, `pnpm typecheck`, `pnpm --filter @next-wiki/web test`, and `pnpm db:generate` reporting "No schema changes"; anti-pattern scan per constitution compliance review (no second-class AI content paths, no verb URLs, no duplicate entry points)

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

- Phase 2: T012, T013 parallel after T003–T011 land (T003→T004→T005 sequential; T006 before T007; T008–T011 parallel among themselves after T005)
- US2–US5 can proceed fully in parallel after Phase 2 (different services/routes/components)
- US6 read-side (T049–T051) parallel with US2–US4; T052/T053 wait on US2's append endpoint contract (already fixed in contracts/)
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
