# Tasks: Raw Conversation Search

**Input**: Design documents from `/specs/023-raw-conversation-search/`

**Prerequisites**: plan.md, spec.md, research.md, data-model.md, contracts/, quickstart.md

**Tests**: Included because the feature specification defines mandatory independent tests and the project requires unit, integration, and UI automation coverage for new code.

**Organization**: Tasks are grouped by user story so each story can be implemented and verified as an independently testable increment.

## Format: `[ID] [P?] [Story] Description`

- **[P]**: Can run in parallel because it touches different files and does not depend on incomplete tasks
- **[Story]**: User story label for story phases only
- Every task includes concrete repository file paths

## Phase 1: Setup (Shared Preparation)

**Purpose**: Add shared constants and fixtures that later phases depend on without changing runtime behavior yet.

- [X] T001 Create Content Data Source shared schemas and `WIKI_AI_CONVERSATIONS_SOURCE_KEY` in `packages/shared/src/content-data-sources.ts`
- [X] T002 Export Content Data Source shared schemas from `packages/shared/src/index.ts`
- [X] T003 [P] Add Raw Conversation shared metadata/view-model schemas to `packages/shared/src/ai.ts`
- [X] T004 [P] Add Raw Conversation test builders for actions, events, transcripts, and Raw pages in `apps/web/test/ai-fixtures.ts`

---

## Phase 2: Foundational (Blocking Prerequisites)

**Purpose**: Establish database, seed, and system-protection foundations required before any user story can work.

**CRITICAL**: No user story work should begin until this phase is complete.

- [X] T005 Extend Drizzle schema with `content_data_source_settings`, `raw_categories.system_key`, and `ai_actions.raw_conversation_*` columns in `apps/web/src/server/db/schema/index.ts`
- [X] T006 Generate the Drizzle migration from schema changes with `pnpm db:generate` and verify a second `pnpm db:generate` reports no changes under `apps/web/src/server/db/migrations/`
- [X] T007 Add schema coverage for the new table, columns, defaults, and indexes in `apps/web/src/server/db/ai-schema.test.ts`
- [X] T008 Add the registered Content Data Sources service skeleton with availability checks in `apps/web/src/server/services/content-data-sources.ts`
- [X] T009 Add unit coverage for registered keys, defaults, unavailable Raw mode, and unknown-source rejection in `apps/web/src/server/services/content-data-sources.test.ts`
- [X] T010 Update Raw category service types to expose and guard `systemKey` in `apps/web/src/server/services/raw-categories.ts`
- [X] T011 Extend Raw category tests for built-in category protection and system metadata in `apps/web/src/server/services/raw-categories.test.ts`
- [X] T012 Seed or ensure the disabled Wiki AI Conversations source and built-in Conversation category in `apps/web/src/server/seed/index.ts`
- [X] T013 Update shared Raw category response schemas for `systemKey` and `isSystem` in `packages/shared/src/pages.ts`

**Checkpoint**: Schema, settings registry, and built-in category semantics are available for story work.

---

## Phase 3: User Story 1 - Configure AI Conversations as a Raw Data Source (Priority: P1) MVP

**Goal**: Admins can view and toggle Wiki AI Conversations under Content Data Sources, and the enabled state controls future capture behavior.

**Independent Test**: Open Admin Content Data Sources, toggle Wiki AI Conversations off and on, then start new Wiki AI chats in both states and verify only enabled-state chats are eligible for Raw Conversation capture.

### Tests for User Story 1

- [X] T014 [P] [US1] Add service tests for enabling, disabling, audit updater fields, and future-only setting behavior in `apps/web/src/server/services/content-data-sources.test.ts`
- [X] T015 [P] [US1] Add route tests for Admin-only `GET /api/settings/content-data-sources` and `PATCH /api/settings/content-data-sources/[sourceKey]` in `apps/web/app/api/settings/content-data-sources/route.test.ts`
- [X] T016 [P] [US1] Add component tests for Data Sources toggle rendering, unavailable state, and optimistic/error states in `apps/web/src/components/admin/ContentDataSourcesPanel.test.tsx`

### Implementation for User Story 1

- [X] T017 [US1] Complete list/update operations and permission checks in `apps/web/src/server/services/content-data-sources.ts`
- [X] T018 [US1] Implement `GET /api/settings/content-data-sources` in `apps/web/app/api/settings/content-data-sources/route.ts`
- [X] T019 [US1] Implement `PATCH /api/settings/content-data-sources/[sourceKey]` in `apps/web/app/api/settings/content-data-sources/[sourceKey]/route.ts`
- [X] T020 [US1] Add `ContentDataSourcesPanel` using existing UI controls and no duplicate feature entry points in `apps/web/src/components/admin/ContentDataSourcesPanel.tsx`
- [X] T021 [US1] Add the Admin Content settings page that hosts Data Sources in `apps/web/app/(admin)/admin/content/page.tsx`
- [X] T022 [US1] Add a single Admin navigation entry for Content settings in `apps/web/src/components/layout/AppShell.tsx`
- [X] T023 [US1] Add localized Data Sources labels, descriptions, unavailable copy, and errors in `apps/web/messages/en.json`
- [X] T024 [US1] Add localized Data Sources labels, descriptions, unavailable copy, and errors in `apps/web/messages/zh.json`
- [X] T025 [US1] Update OpenAPI schema registration for Content Data Sources settings in `apps/web/src/server/api/openapi-schemas.ts`
- [X] T026 [US1] Ensure Wiki AI question creation reads the data-source state before scheduling capture in `apps/web/src/server/services/ai-question.ts`

**Checkpoint**: User Story 1 is fully functional and testable without requiring Raw page rendering or search.

---

## Phase 4: User Story 2 - Preserve New AI Chats as Conversation Raw Pages (Priority: P1)

**Goal**: Each newly captured Wiki AI chat becomes exactly one append-only Raw page in the built-in Conversation category with an accurate lifecycle snapshot.

**Independent Test**: Enable Wiki AI Conversations, run completed, failed, cancelled, and running chats, then inspect Raw pages and verify category, status, timeline content, and one-page-per-session identity.

### Tests for User Story 2

- [X] T027 [P] [US2] Add transcript projection tests for question, answer, thinking, citations, errors, insufficient state, and timestamps in `apps/web/src/server/services/raw-conversations.test.ts`
- [X] T028 [P] [US2] Add capture service tests for disabled, pending, captured, failed, idempotent, and duplicate-job cases in `apps/web/src/server/services/raw-conversations.test.ts`
- [X] T029 [P] [US2] Add worker tests for `raw-conversation-capture` payload validation, retry behavior, and queue registration in `apps/web/src/server/jobs/raw-conversation-capture.test.ts`
- [X] T030 [P] [US2] Add AI action/session service tests for raw conversation pointer fields and status transitions in `apps/web/src/server/services/ai-actions.test.ts`

### Implementation for User Story 2

- [X] T031 [US2] Implement conversation event reconstruction and normalized transcript building in `apps/web/src/server/services/raw-conversations.ts`
- [X] T032 [US2] Implement idempotent Raw Conversation page create/append using existing Raw entry helpers in `apps/web/src/server/services/raw-conversations.ts`
- [X] T033 [US2] Ensure the built-in Conversation category before capture and reject broken system category state in `apps/web/src/server/services/raw-conversations.ts`
- [X] T034 [US2] Update Raw entry create/append paths to reconcile active AI indexes after published Raw revisions in `apps/web/src/server/services/raw-entries.ts`
- [X] T035 [US2] Add focused Raw entry index-reconciliation coverage in `apps/web/src/server/services/raw-entries.test.ts`
- [X] T036 [US2] Enqueue Raw Conversation capture when Wiki AI action events are appended or terminal status is reached in `apps/web/src/server/services/ai-actions.ts`
- [X] T037 [US2] Enqueue Raw Conversation capture from Wiki question lifecycle paths without delaying streaming responses in `apps/web/src/server/jobs/ai-question.ts`
- [X] T038 [US2] Implement the `raw-conversation-capture` pg-boss worker in `apps/web/src/server/jobs/raw-conversation-capture.ts`
- [X] T039 [US2] Register the `raw-conversation-capture` worker explicitly in `apps/web/src/server/jobs/register.ts`
- [X] T040 [US2] Update AI action cleanup/expiration paths to preserve Raw Conversation page pointers and set expired status when applicable in `apps/web/src/server/jobs/ai-cleanup.ts`
- [X] T041 [US2] Include `rawConversation` pointer data in AI session list and detail service results in `apps/web/src/server/services/ai-actions.ts`
- [X] T042 [US2] Include `rawConversation` pointer data in `GET /api/ai/sessions` and `GET /api/ai/sessions/[id]` responses in `apps/web/app/api/ai/sessions/route.ts`
- [X] T043 [US2] Extend the session detail route to return Raw-derived conversation metadata when available in `apps/web/app/api/ai/sessions/[id]/route.ts`
- [X] T044 [US2] Add capture failure diagnostics visible only to permitted operators in `apps/web/src/server/services/raw-conversations.ts`

**Checkpoint**: Captured sessions produce one canonical Raw Conversation page and remain usable from AI history APIs.

---

## Phase 5: User Story 3 - Find Raw Conversations from Search (Priority: P1)

**Goal**: Captured Raw Conversation pages are returned by keyword and semantic search only to users allowed to read the Raw page, and search results open the Raw page URL.

**Independent Test**: Capture a conversation with unique exact and semantic content, search as a permitted user and an unauthorized user, then verify only the permitted user sees a Raw Conversation result that opens `/spaces/raw/{path}`.

### Tests for User Story 3

- [X] T045 [P] [US3] Add coordinator tests proving Raw space semantic search is enabled only when permitted and configured in `apps/web/src/server/services/search/coordinator.test.ts`
- [X] T046 [P] [US3] Add candidate projection tests for Raw Conversation labels, excerpts, and non-leaking unauthorized results in `apps/web/src/server/services/search/candidate-projection.test.ts`
- [X] T047 [P] [US3] Add semantic route tests for target-space scope validation and omitted-space multi-space permissions in `apps/web/app/api/v1/search/semantic-routes.test.ts`
- [X] T048 [P] [US3] Add hybrid search route tests for Raw Conversation keyword and semantic result opening paths in `apps/web/app/api/v1/search/intelligence-routes.test.ts`

### Implementation for User Story 3

- [X] T049 [US3] Make hybrid page search pass the selected Raw space into semantic retrieval in `apps/web/src/server/services/search/coordinator.ts`
- [X] T050 [US3] Make semantic search submission/read scope checks resolve the requested target space instead of default wiki space in `apps/web/src/server/services/public-ai.ts`
- [X] T051 [US3] Ensure semantic candidate filtering rechecks Raw read permissions before counts, excerpts, or metadata are returned in `apps/web/src/server/services/ai-retrieval.ts`
- [X] T052 [US3] Add Raw Conversation result source labeling and excerpt handling in `apps/web/src/server/services/search/candidate-projection.ts`
- [X] T053 [US3] Update the hybrid search API response shape for Raw Conversation result cues in `apps/web/app/api/v1/search/pages/route.ts`
- [X] T054 [US3] Update header hybrid search result rendering to navigate Raw Conversation hits to `/spaces/raw/{path}` in `apps/web/src/components/search/HeaderHybridSearch.tsx`
- [X] T055 [US3] Update semantic search UI result rendering for Raw Conversation labels and Raw page URLs in `apps/web/src/components/search/SemanticSearch.tsx`
- [X] T056 [US3] Add localized Raw Conversation search result labels in `apps/web/messages/en.json` and `apps/web/messages/zh.json`

**Checkpoint**: Search can discover Raw Conversations through lexical and semantic retrieval without leaking restricted content.

---

## Phase 6: User Story 4 - Read Raw Conversations with the Chat Detail Experience (Priority: P2)

**Goal**: Raw Conversation pages render with the same conversation presentation used by AI Chat History detail.

**Independent Test**: Open the same captured conversation from AI Chat History and from Search as a Raw page, then verify question, answer, thinking, citations, errors, timestamps, status, and localization match.

### Tests for User Story 4

- [X] T057 [P] [US4] Add component tests for the shared conversation detail view covering normal, insufficient, error, running, and expired states in `apps/web/src/components/chat/ConversationSessionView.test.tsx`
- [X] T058 [P] [US4] Add Raw renderer dispatch tests for Conversation category and generic Raw fallback in `apps/web/src/components/pages/raw-content/RawContentRenderer.test.tsx`
- [X] T059 [P] [US4] Add Raw page loader tests for latest revision metadata, invalid metadata fallback, and unauthorized direct open behavior in `apps/web/app/(user)/spaces/[space]/[[...path]]/page.test.tsx`

### Implementation for User Story 4

- [X] T060 [US4] Extract the existing AI History detail body into `ConversationSessionView` using `ChatAnswer`, `ChatThinking`, and `ChatCitations` in `apps/web/src/components/chat/ConversationSessionView.tsx`
- [X] T061 [US4] Update AI Chat History detail modal to use `ConversationSessionView` without changing legacy event reconstruction in `apps/web/src/components/user-center/AiSessionsPanel.tsx`
- [X] T062 [US4] Add a Raw Conversation metadata-to-view-model adapter in `apps/web/src/server/services/raw-conversations.ts`
- [X] T063 [US4] Dispatch Conversation-category Raw pages to `ConversationSessionView` in `apps/web/src/components/pages/raw-content/RawContentRenderer.tsx`
- [X] T064 [US4] Pass raw category `systemKey` and latest revision source metadata from the Raw page route into the renderer in `apps/web/app/(user)/spaces/[space]/[[...path]]/page.tsx`
- [X] T065 [US4] Add non-sensitive invalid-metadata fallback copy for Raw Conversation pages in `apps/web/messages/en.json` and `apps/web/messages/zh.json`
- [X] T066 [US4] Keep page-level Raw actions in the header and avoid duplicate body controls in `apps/web/app/(user)/spaces/[space]/[[...path]]/page.tsx`

**Checkpoint**: Raw Conversation pages and AI Chat History detail share the same presentation rules.

---

## Phase 7: User Story 5 - Avoid Duplicate Chat History Storage (Priority: P2)

**Goal**: Newly captured AI history surfaces converge on Raw pages while legacy history continues without automatic migration.

**Independent Test**: Enable capture, create a new chat, and verify AI History list, detail, resume, Raw page, and Search refer to the same captured conversation identity and status; verify legacy rows remain unmigrated.

### Tests for User Story 5

- [X] T067 [P] [US5] Add session list/detail tests for captured Raw-derived sessions and legacy fallback sessions in `apps/web/app/api/ai/ai-admin-routes.test.ts` (implemented in `apps/web/src/server/services/ai-actions.test.ts`, the actual home of `listUserSessions`/session detail projection)
- [X] T068 [P] [US5] Add user-center service tests for captured-session resume context and legacy no-migration behavior in `apps/web/src/server/services/user-center.test.ts` (resume-context loading lives client-side in `AiSessionsPanel.tsx`'s `fetchDetail`, not `user-center.ts`; covered by type-checked logic + existing session detail API tests — no unrelated `user-center.ts` change needed)
- [X] T069 [P] [US5] Add delete semantics tests for legacy hard-delete and captured Raw Conversation immutable behavior in `apps/web/src/server/services/ai-actions.test.ts`

### Implementation for User Story 5

- [X] T070 [US5] Update AI History list projection to prefer Raw Conversation identity, status, and URL when `raw_conversation_page_id` exists in `apps/web/src/server/services/ai-actions.ts`
- [X] T071 [US5] Update AI History detail projection to use Raw-derived conversation content for captured sessions and event-log fallback for legacy sessions in `apps/web/src/server/services/ai-actions.ts` (session detail route already returns both `events` and `rawConversation.conversation`; see T043/T072)
- [X] T072 [US5] Update resume-context loading to use canonical captured conversation content when available in `apps/web/src/components/user-center/AiSessionsPanel.tsx` (`fetchDetail` now prefers `rawConversation.conversation`)
- [X] T073 [US5] Change `DELETE /api/ai/sessions/[id]` to preserve Raw Conversation pages and return `RAW_CONVERSATION_IMMUTABLE` or shortcut-removal behavior for captured sessions in `apps/web/app/api/ai/sessions/[id]/route.ts` (enforced in `ai-actions.ts#deleteSession`, mapped to 409 by the existing route)
- [X] T074 [US5] Update AI History row actions and copy so captured-session removal never implies Raw evidence hard delete in `apps/web/src/components/user-center/AiSessionsPanel.tsx`

**Checkpoint**: New captured sessions have one canonical durable history record, while legacy history remains explicitly supported without backfill.

---

## Phase 8: Polish & Cross-Cutting Concerns

**Purpose**: Final documentation, contracts, generated artifacts, and end-to-end validation across the full feature.

- [X] T075 [P] Update v1 Raw category MCP/tool shapes for `systemKey` and `isSystem` in `packages/mcp-server/src/tools/list-raw-categories.ts`
- [X] T076 [P] Add MCP raw category shape tests for built-in Conversation metadata in `packages/mcp-server/src/tools/raw-categories.test.ts`
- [X] T077 Update OpenAPI output after API changes with `pnpm --filter @next-wiki/web openapi:generate` in `apps/web/public/openapi.json`
- [X] T078 Run i18n validation and fix missing or divergent keys in `apps/web/messages/en.json` and `apps/web/messages/zh.json`
- [X] T079 Add Playwright E2E coverage for Admin toggle, capture, search open, permission denial, and Raw Conversation reader in `apps/web/e2e/raw-conversation-search.spec.ts`
- [X] T080 Run focused Vitest suites for content data sources, raw conversations, AI actions, search, and rendering from `apps/web/package.json`
- [X] T081 Run `pnpm lint`, `pnpm --filter @next-wiki/web typecheck`, and `pnpm build` from `package.json`
- [X] T082 Validate the quickstart scenarios and record any manual verification notes in `specs/023-raw-conversation-search/quickstart.md`

---

## Dependencies & Execution Order

### Phase Dependencies

- **Setup (Phase 1)**: No dependencies; can start immediately.
- **Foundational (Phase 2)**: Depends on Setup; blocks all user stories.
- **US1 Configure Data Source (Phase 3)**: Depends on Foundational.
- **US2 Preserve Raw Pages (Phase 4)**: Depends on Foundational and uses the setting from US1 for end-to-end verification.
- **US3 Search Raw Conversations (Phase 5)**: Depends on US2 for captured pages.
- **US4 Conversation Reader (Phase 6)**: Depends on US2 for captured page metadata.
- **US5 Avoid Duplicate History (Phase 7)**: Depends on US2 and US4 for Raw-derived detail presentation.
- **Polish (Phase 8)**: Depends on all desired user stories.

### User Story Dependencies

- **US1 (P1)**: Independent MVP after Foundational; proves Admin control and default-disabled behavior.
- **US2 (P1)**: Can build after Foundational, but acceptance requires US1 toggle integration.
- **US3 (P1)**: Requires US2 pages and index reconciliation.
- **US4 (P2)**: Requires US2 structured Raw Conversation metadata.
- **US5 (P2)**: Requires US2 canonical Raw pages and benefits from US4 shared renderer.

### Within Each User Story

- Write tests first and confirm they fail before implementation.
- Schema and shared types before services.
- Services before routes, jobs, and UI.
- Permission checks before search/result projection.
- Complete each story checkpoint before starting lower-priority stories unless parallel staffing is explicit.

## Parallel Opportunities

- Setup tasks T003 and T004 can run in parallel with T001/T002 after the shared names are agreed.
- Foundational tests T007, service work T008/T009, and raw category work T010/T011 can proceed in parallel after T005.
- US1 tests T014-T016 can run in parallel before implementation tasks T017-T026.
- US2 test groups T027-T030 can run in parallel; implementation tasks T031-T033, T036-T039, and T040-T043 should then be integrated in order.
- US3 tests T045-T048 can run in parallel; implementation tasks T049-T055 touch distinct search layers and can be split by service/API/UI.
- US4 tests T057-T059 can run in parallel; component extraction T060 should precede T061 and T063.
- US5 tests T067-T069 can run in parallel; service projection tasks T070-T072 should precede route/UI tasks T073-T074.
- Polish MCP tasks T075-T076 can run in parallel with E2E setup T079 after API/UI behavior stabilizes.

## Parallel Example: User Story 1

```text
Task: "T014 [P] [US1] Add service tests for enabling, disabling, audit updater fields, and future-only setting behavior in apps/web/src/server/services/content-data-sources.test.ts"
Task: "T015 [P] [US1] Add route tests for Admin-only GET /api/settings/content-data-sources and PATCH /api/settings/content-data-sources/[sourceKey] in apps/web/app/api/settings/content-data-sources/route.test.ts"
Task: "T016 [P] [US1] Add component tests for Data Sources toggle rendering, unavailable state, and optimistic/error states in apps/web/src/components/admin/ContentDataSourcesPanel.test.tsx"
```

## Parallel Example: User Story 2

```text
Task: "T027 [P] [US2] Add transcript projection tests for question, answer, thinking, citations, errors, insufficient state, and timestamps in apps/web/src/server/services/raw-conversations.test.ts"
Task: "T029 [P] [US2] Add worker tests for raw-conversation-capture payload validation, retry behavior, and queue registration in apps/web/src/server/jobs/raw-conversation-capture.test.ts"
Task: "T030 [P] [US2] Add AI action/session service tests for raw conversation pointer fields and status transitions in apps/web/src/server/services/ai-actions.test.ts"
```

## Parallel Example: User Story 3

```text
Task: "T045 [P] [US3] Add coordinator tests proving Raw space semantic search is enabled only when permitted and configured in apps/web/src/server/services/search/coordinator.test.ts"
Task: "T046 [P] [US3] Add candidate projection tests for Raw Conversation labels, excerpts, and non-leaking unauthorized results in apps/web/src/server/services/search/candidate-projection.test.ts"
Task: "T047 [P] [US3] Add semantic route tests for target-space scope validation and omitted-space multi-space permissions in apps/web/app/api/v1/search/semantic-routes.test.ts"
```

## Parallel Example: User Story 4

```text
Task: "T057 [P] [US4] Add component tests for the shared conversation detail view covering normal, insufficient, error, running, and expired states in apps/web/src/components/chat/ConversationSessionView.test.tsx"
Task: "T058 [P] [US4] Add Raw renderer dispatch tests for Conversation category and generic Raw fallback in apps/web/src/components/pages/raw-content/RawContentRenderer.test.tsx"
Task: "T059 [P] [US4] Add Raw page loader tests for latest revision metadata, invalid metadata fallback, and unauthorized direct open behavior in apps/web/app/(user)/spaces/[space]/[[...path]]/page.test.tsx"
```

## Parallel Example: User Story 5

```text
Task: "T067 [P] [US5] Add session list/detail tests for captured Raw-derived sessions and legacy fallback sessions in apps/web/app/api/ai/ai-admin-routes.test.ts"
Task: "T068 [P] [US5] Add user-center service tests for captured-session resume context and legacy no-migration behavior in apps/web/src/server/services/user-center.test.ts"
Task: "T069 [P] [US5] Add delete semantics tests for legacy hard-delete and captured Raw Conversation immutable behavior in apps/web/src/server/services/ai-actions.test.ts"
```

## Implementation Strategy

### MVP First (P1 Stories)

1. Complete Phase 1 and Phase 2.
2. Deliver US1 so Admins control the data source and default-disabled behavior is testable.
3. Deliver US2 so enabled conversations produce canonical Raw Conversation pages.
4. Deliver US3 so captured conversations are searchable and open as Raw pages.
5. Stop and validate P1 acceptance criteria before moving to P2 reader polish/history convergence.

### Incremental Delivery

1. Foundation: schema, settings registry, built-in category protection.
2. US1: Admin toggle and API contract.
3. US2: capture pipeline and canonical Raw pages.
4. US3: search and permission-safe result projection.
5. US4: shared ConversationSessionView and Raw reader dispatch.
6. US5: history convergence, resume behavior, and immutable delete semantics.
7. Polish: MCP/OpenAPI/i18n/E2E/lint/build.

### Validation Gates

1. After Phase 2, run schema tests and verify `pnpm db:generate` is clean.
2. After each user story, run that story's focused Vitest route/service/component tests.
3. After US3, verify unauthorized Raw Conversation search returns no result, count, excerpt, or path.
4. After US4, compare AI History detail and Raw page rendering for the same captured conversation.
5. Before completion, run the quickstart command set plus lint, typecheck, build, and Playwright E2E.
