---
description: "Task list for Feishu Bot Conversation Capture (025)"
---

# Tasks: Feishu Bot Conversation Capture

**Input**: Design documents from `/specs/025-feishu-bot-conversation-capture/`

- [plan.md](./plan.md) (required)
- [spec.md](./spec.md) (required — 6 user stories, P1 × 4 / P2 × 1 / P3 × 1; US1 also moves Data Sources into Bots' General settings)
- [research.md](./research.md)
- [data-model.md](./data-model.md)
- [contracts/api-delta.md](./contracts/api-delta.md)
- [contracts/ui-contract.md](./contracts/ui-contract.md)
- [quickstart.md](./quickstart.md)

**Organization**: Tasks are grouped by user story to enable independent implementation and testing of each story.

## Format: `[ID] [P?] [Story] Description`

- **[P]**: Can run in parallel (different files, no dependencies)
- **[Story]**: Which user story this task belongs to (e.g. US1, US2)
- Include exact file paths in descriptions

## Path Conventions

- Web app (Next.js App Router): shared Zod schemas live in `packages/shared/src`, server logic in `apps/web/src/server`, route handlers under `apps/web/app/api`, components in `apps/web/src/components`. Tests are co-located `.test.ts` siblings.

---

## Phase 1: Setup (Shared Infrastructure)

**Purpose**: Confirm preconditions and tooling before changing code paths.

- [ ] T001 Verify dependencies 019-feishu-bot (Feishu module + `feishuBotSessions` schema + `feishu-delegation.ts`) and 023-raw-conversation-search (capture pipeline + `raw_conversation_*` columns on `ai_actions` + `WIKI_AI_CONVERSATIONS_SOURCE_KEY` + `rawConversationSourceMetadataSchema`) are present on the working branch via `git log --oneline --grep` and direct file reads
- [ ] T002 Read `apps/web/src/server/services/feishu-delegation.ts:98`, `apps/web/src/server/services/ai-question.ts:54-87`, and `apps/web/src/server/services/raw-conversations.ts:31-443`; confirm the capture path the plan depends on is unchanged from research.md findings

**Checkpoint**: Setup verified — proceeding to foundational work is safe.

---

## Phase 2: Foundational (Blocking Prerequisites)

**Purpose**: Core schema/key/i18n primitives that every user story depends on. **MUST complete before any user story.**

- [ ] T003 [P] Add canonical `AI_CONVERSATIONS_SOURCE_KEY = 'ai-conversations'` constant in `packages/shared/src/content-data-sources.ts`, keep `WIKI_AI_CONVERSATIONS_SOURCE_KEY` as a deprecated alias constant, and extend `contentDataSourceKeySchema` to include both keys (only the new key is exposed through the Admin-facing list)
- [ ] T004 [P] Add `wikiAiChannelSchema = z.enum(['wiki-ai', 'feishu'])` in `packages/shared/src/ai.ts`, and an optional `channel` field on `rawConversationSourceMetadataSchema` (line ~662) — legacy pages keep working because the field is `optional()`
- [ ] T005 Extend `RawConversationPointer` in `packages/shared/src/ai.ts` (line ~440) with an optional `channel: wikiAiChannelSchema` field; consumers fall back to `'wiki-ai'` when absent
- [ ] T006 [P] Export `AI_CONVERSATIONS_SOURCE_KEY` and `wikiAiChannelSchema` from `packages/shared/src/index.ts` if not already re-exported (verify against existing barrel file)

**Checkpoint**: Foundation ready — user story implementation can now begin.

---

## Phase 3: User Story 1 - Bots General Owns One AI Conversations Data Source (Priority: P1) 🎯 MVP

**Goal**: Replace the user-facing "Wiki AI Conversations" toggle with a single `AI Conversations` toggle under Bots' General settings that covers every channel (web Wiki AI + Feishu bot), preserving the stored enable/disable state of every existing deployment through a lazy in-place migration and eliminating the old Content settings duplicate.

**Independent Test**: Open `/admin/bots?tab=general` as Admin and see exactly one Data Sources section with `AI Conversations`. Run `GET /api/settings/content-data-sources` and see exactly one source with `sourceKey='ai-conversations'`, label "AI Conversations", and an enabled state equal to the pre-deploy state. Toggle the source; confirm new web Wiki AI chats create no Raw pages when disabled and create Raw pages when enabled. Open the former Content settings Data Sources location and confirm it does not expose a second writable editor.

### Tests for User Story 1 (per project constitution: features that touch AI + public APIs require tests)

- [ ] T007 [P] [US1] Update `apps/web/src/server/services/content-data-sources.test.ts` with cases that (a) existing legacy `'wiki-ai-conversations'` row with `enabled=true` is lazily migrated to `'ai-conversations'` with the same `enabled=true` on first read; (b) Admin list returns only the new key; (c) writes go to the new key; (d) unknown keys still rejected
- [ ] T008 [P] [US1] Update `apps/web/src/server/services/ai-question.test.ts` to assert that `createWikiQuestion` consults the new `AI_CONVERSATIONS_SOURCE_KEY` and falls back to the legacy alias when the new row is absent; existing capture-status expectations remain green
- [ ] T009 [P] [US1] Update or add a UI/route test (`apps/web/src/components/admin/bots/BotsTabs.test.tsx` or an E2E spec) asserting `/admin/bots?tab=general` renders the Data Sources panel and the former Content settings Data Sources location does not render a duplicate writable panel

### Implementation for User Story 1

- [ ] T010 [US1] Update `apps/web/src/server/services/content-data-sources.ts` so that `isDataSourceEnabled(AI_CONVERSATIONS_SOURCE_KEY)` reads the new row first, falls back to the legacy `'wiki-ai-conversations'` row, and lazily creates the new row on first read (lazy migration); the registered source list exposes only the new key for Admin UI
- [ ] T011 [US1] Update `apps/web/src/server/services/ai-question.ts:71` to read `isDataSourceEnabled(AI_CONVERSATIONS_SOURCE_KEY)` from `@next-wiki/shared` instead of the legacy literal
- [ ] T012 [US1] Update `apps/web/src/server/seed/index.ts:131` to seed the new `AI_CONVERSATIONS_SOURCE_KEY` row alongside any existing legacy row (legacy row becomes inert)
- [ ] T013 [P] [US1] Update `apps/web/messages/en.json` — rename `dataSources.content.wikiAiConversations` to `dataSources.content.aiConversations` with `label: "AI Conversations"` and `description: "Capture every AI conversation — Wiki AI and Feishu bot — as Raw Conversation pages."`
- [ ] T014 [P] [US1] Update `apps/web/messages/zh.json` — same rename + translated label and description
- [ ] T015 [US1] Update `apps/web/src/components/admin/bots/BotsTabs.tsx` and `apps/web/app/(admin)/admin/bots/page.tsx` so Bots has a URL-restorable General tab (`/admin/bots?tab=general`) that renders `ContentDataSourcesPanel`; keep Feishu as a provider tab and preserve `/admin/feishu` redirect behavior
- [ ] T016 [US1] Update `apps/web/app/(admin)/admin/content/page.tsx` and the admin navigation/i18n as needed so the former Content settings Data Sources location is removed, redirected, or presented only as a link to `/admin/bots?tab=general`; it must not render a second writable `AI Conversations` toggle
- [ ] T017 [US1] Verify `apps/web/src/components/admin/ContentDataSourcesPanel.tsx` reads the renamed i18n keys (no inline string change required if it already uses `dataSources.content.*`); update if it references the old literal key
- [ ] T018 [US1] Regenerate OpenAPI metadata for the renamed Data Source label/description per the project's `AGENTS.md` rule ("When there is API changes, update docs via next-open-api")

**Checkpoint**: User Story 1 fully functional. Admins see one AI Conversations toggle under Bots General, no duplicate Content settings writer remains, state is preserved, and web captures are correctly gated by it.

---

## Phase 4: User Story 2 - Feishu Q&A Reuses the Wiki AI Record Pipeline (Priority: P1)

**Goal**: Each Feishu-bound Q&A turns into the same `wiki_question` `ai_actions` row a web chat would create, and the capture worker stamps the captured Raw page's `source_metadata.channel='feishu'`. No new pipeline, no parallel Feishu-only capture.

**Independent Test**: With `AI Conversations` enabled, send a Feishu DM to the bot as a bound user. Wait for the answer. Inspect the resulting `ai_actions` row (1 per turn, `feature='wiki_question'`, `requestMetadata.origin='feishu'`, `requestMetadata.feishuSessionId=<uuid>`). Inspect the captured Raw Conversation page; its `source_metadata.channel` must equal `'feishu'`. Repeat with `AI Conversations` disabled; the bot still answers but no Raw page is produced and `rawConversationCaptureStatus='disabled'`.

### Tests for User Story 2

- [ ] T019 [P] [US2] Add unit test `apps/web/src/server/services/raw-conversations.feishu.test.ts` (NEW) asserting: (a) capture of a `wiki_question` action whose `requestMetadata.origin='feishu'` produces a Raw page with `source_metadata.channel='feishu'`; (b) capture of a `wiki_question` action with no origin produces `channel='wiki-ai'`; (c) capture is skipped when `rawConversationCaptureStatus='disabled'` and no Raw page is created; (d) capture is idempotent — running the same action twice produces exactly one Raw page and the action's `rawConversationPageId` pointer is stable
- [ ] T020 [P] [US2] Add unit test `apps/web/src/server/services/feishu-delegation.test.ts` extension (or a new sibling test) asserting that `handleInboundMessage` calls `createWikiQuestion` with `requestMetadata.origin='feishu'` and `requestMetadata.feishuSessionId=<session.id>` so the capture worker can stamp `channel='feishu'`

### Implementation for User Story 2

- [ ] T021 [US2] Extend `apps/web/src/server/services/raw-conversations.ts::captureWikiQuestion` (or equivalent capture-path entry around line 332-369) to read `action.requestMetadata.origin` and stamp `source_metadata.channel` on the produced Raw revision (`'feishu'` → `'feishu'`, anything else → `'wiki-ai'`)
- [ ] T022 [US2] Update `apps/web/src/server/services/raw-conversations.ts::reconstructConversation` (or equivalent view-model assembler) so that the `RawConversationPointer` returned to consumers carries the new `channel` field (read from the captured page's `source_metadata`; default to `'wiki-ai'` when absent)

**Checkpoint**: User Story 2 fully functional. Feishu turns flow through the same pipeline and carry the channel marker on every captured Raw page.

---

## Phase 5: User Story 3 - Bot Session Is a Thin Feishu-Specific Wrapper (Priority: P1)

**Goal**: Confirm `feishuBotSessions` carries only Feishu-side lifecycle state (binding, chat, latest action id, window, state) and a future contributor cannot accidentally add a parallel conversation timeline table. Multi-turn continuity remains in the `feishuSessionId` request-metadata tag.

**Independent Test**: Run two Feishu turns from the same bound user within the session window; verify exactly one `feishuBotSessions` row exists for the (binding, chat) pair, its `ai_action_id` is updated to the latest turn, and each turn produced its own `ai_actions` row + its own Raw Conversation page. Inspect `apps/web/src/server/db/schema/index.ts:1779-1798` and confirm no question/answer/citation/status columns exist on `feishuBotSessions`.

### Tests for User Story 3

- [ ] T023 [P] [US3] Add `apps/web/src/server/services/feishu-sessions.wrapper.test.ts` (NEW) asserting: (a) `getOrCreateActiveSession` creates exactly one row per (binding, chat); (b) `attachActionToSession` updates only `ai_action_id`, `last_activity_at`, `expires_at`, `state`; (c) `feishuBotSessions` schema does not contain columns named like `question`, `answer`, `citations`, `error_message`, `status`; (d) a duplicate inbound event for the same (binding, chat) within the window upserts the same Bot Session row and does not create a second row

### Implementation for User Story 3

- [ ] T024 [US3] Add a header comment to `apps/web/src/server/services/feishu-sessions.ts` documenting the thin-wrapper contract: "Bot Session holds only Feishu-side lifecycle state. Conversation content (question/answer/citations/status) lives exclusively in `ai_actions` / `ai_action_events` and the captured Raw page; do not add timeline columns to `feishuBotSessions`." (formalizes D3)
- [ ] T025 [US3] No schema change. Verify (and document in the spec's plan.md if needed) that no `feishuBotSessions` migration is required for this feature

**Checkpoint**: User Story 3 fully functional. Bot Session is contractually documented as a thin wrapper; tests enforce it.

---

## Phase 6: User Story 4 - Feishu Conversations Are Discovered by Raw Search (Priority: P1)

**Goal**: Captured Feishu turns are keyword-searchable and semantically retrievable through the existing Raw search coordinator under the same permission projection as web captures; the search result opens the same conversation-specific Raw page reader.

**Independent Test**: With `AI Conversations` enabled, ask a Feishu question containing a unique phrase. Wait until indexing settles. As the bound user, run `GET /api/search?q=<unique phrase>&space=raw`; verify the corresponding Raw Conversation page appears in results with the "Feishu" badge per UI contract. As a second user without Raw read permission, repeat the search; verify zero results, zero excerpts, zero counts. Direct fetch of the page id by the unauthorized user returns `404 not_found`.

### Tests for User Story 4

- [ ] T026 [P] [US4] Add `apps/web/src/server/services/search.feishu-conversations.test.ts` (NEW) integration test asserting: (a) keyword search by a phrase present only in a Feishu-captured turn returns the corresponding Raw page with the `channel` marker; (b) semantic search by a related-but-not-identical phrase returns the same Raw page in the top 5 results when the embedding index is available; (c) a user without Raw read permission gets zero results, zero excerpts, zero counts; (d) direct page-id fetch by the unauthorized user returns `404 not_found`; (e) deep-link from a Feishu reply card lands on the same URL as the search-result open
- [ ] T027 [P] [US4] Add `apps/web/src/server/jobs/raw-conversation-capture.search-index.test.ts` (NEW) asserting that after a Feishu turn is captured, the captured Raw page is reconciled into the search indexes the same way a web turn is (verifies the `reconcilePageAcrossIndexes` call from `raw-conversations.ts` runs unchanged for Feishu captures)

### Implementation for User Story 4

- [ ] T028 [US4] Verify `apps/web/src/server/api/ai/sessions/route.ts` (and `[id]/route.ts`) includes the new `channel` field in their `RawConversationPointer` responses; update if it serializes the pointer manually instead of relying on the shared schema
- [ ] T029 [US4] Verify `apps/web/src/server/services/search/coordinator.ts` (and candidate-projection) handles `channel='feishu'` captured Raw pages the same way it handles `channel='wiki-ai'` ones (no Feishu-specific branch needed; document the verification in plan.md if not already)

**Checkpoint**: User Story 4 fully functional. Search discovers captured Feishu turns; permission isolation holds; search-result page-open lands on the canonical Raw Conversation reader.

---

## Phase 7: User Story 5 - Conversation Raw Page Reader Works for Feishu Captures (Priority: P2)

**Goal**: The same conversation-specific reader used for web captures renders Feishu captures identically, with an optional "Feishu" badge for traceability. Reader layout itself is unchanged.

**Independent Test**: Open the same captured conversation from a web search-result click, from a Feishu deep link, and from AI Chat History; the layout, labels, status, citations, errors, timestamps, and answers are visually identical except for the channel badge on surfaces that surface it.

### Tests for User Story 5

- [ ] T030 [P] [US5] Add a snapshot/component test in `apps/web/src/components/chat/__tests__/ConversationSessionView.test.tsx` (NEW if absent) asserting: (a) a `ConversationSessionViewModel` with `pointer.channel='feishu'` renders the localized "Feishu" badge; (b) a `ConversationSessionViewModel` with no channel (or `channel='wiki-ai'`) renders no badge; (c) the rest of the rendered DOM is identical between the two cases

### Implementation for User Story 5

- [ ] T031 [P] [US5] Update `apps/web/src/components/chat/ConversationSessionView.tsx` to render a small badge near the conversation header when the `channel` field is `'feishu'`; the badge is a non-interactive decorative span with the localized label from i18n
- [ ] T032 [P] [US5] Update the search-result preview component used by the header hybrid search to render the same "Feishu" chip when the underlying Raw Conversation page has `channel='feishu'`
- [ ] T033 [P] [US5] Add i18n keys `chat.history.feishuBadge.label` in `apps/web/messages/en.json` ("Feishu") and `apps/web/messages/zh.json` ("飞书")
- [ ] T034 [P] [US5] Update `apps/web/src/i18n/keys.ts` if it tracks keys statically (verify against current shape)

**Checkpoint**: User Story 5 fully functional. Visual parity between web and Feishu captures is preserved; the channel badge is purely additive metadata.

---

## Phase 8: User Story 6 - Admin Observes Feishu Capture With the Same Surfaces As Web Capture (Priority: P3)

**Goal**: Every audit entry for a Feishu-captured turn records `origin='feishu'`, the bound wiki user, the Wiki AI record id, and an opaque correlation id. The audit channel preserves traceability without leaking question/answer text or credentials.

**Independent Test**: Capture a Feishu turn. As Admin, query the audit log filter for `origin='feishu'` and `action=capture_raw_conversation`; verify the entry exists with the bound user id, the action id, and a correlation id that does not contain the raw question, answer, or any credential. Repeat with a web turn; verify the corresponding web audit entry exists.

### Tests for User Story 6

- [ ] T035 [P] [US6] Add `apps/web/src/server/jobs/raw-conversation-capture.audit.test.ts` (NEW) asserting: (a) when the underlying action's `requestMetadata.origin='feishu'`, the audit entry is written with `origin='feishu'`; (b) when origin is absent or `'web'`, the audit entry uses `origin='web'`; (c) the audit entry excludes raw question, answer, and any `appSecret`/`apiKey` substring from the correlation id and any other persisted field

### Implementation for User Story 6

- [ ] T036 [US6] Update `apps/web/src/server/jobs/raw-conversation-capture.ts` so the audit `writeEntry` call site reads `action.requestMetadata.origin` and sets `entry.origin = origin === 'feishu' ? 'feishu' : 'web'`
- [ ] T037 [US6] Verify `apps/web/src/server/services/audit.ts` does not log raw question/answer or credential text; add a redaction helper if needed (existing 019 FR-027 work should already cover this; document any gap)

**Checkpoint**: User Story 6 fully functional. Admin surfaces can trace Feishu captures through the audit log with correct origin and zero leakage.

---

## Phase 9: Polish & Cross-Cutting Concerns

**Purpose**: Documentation, MCP surface, full-stack verification, and end-to-end validation.

- [ ] T038 [P] Update `packages/mcp-server` to expose `channel` on Raw Conversation results returned by `next-wiki_search_wiki` (or equivalent search tool); update tool descriptions
- [ ] T039 [P] Regenerate any project-level `docs/architecture/...` references that mention the data source label (verify there are no other references to `wiki-ai-conversations` via grep)
- [ ] T040 Run `pnpm typecheck` and `pnpm lint`; resolve any new warnings/errors
- [ ] T041 Run `pnpm --filter @next-wiki/web test` (Vitest); confirm no regressions to 019/023/004/022 tests
- [ ] T042 Run `pnpm db:generate` (must report "No schema changes, nothing to migrate") — verifies no Drizzle migration was hand-authored
- [ ] T043 Run `docker compose up -d --build` smoke test; follow `quickstart.md` validation steps 1–12 end-to-end
- [ ] T044 Capture a final note in `specs/025-feishu-bot-conversation-capture/notes.md` (NEW) summarizing the post-merge state (e.g. "AI Conversations toggle live under Bots General; Feishu captures produce channel='feishu' Raw pages; legacy state preserved") for the next agent

---

## Dependencies & Execution Order

### Phase Dependencies

- **Setup (Phase 1)**: No dependencies — can start immediately.
- **Foundational (Phase 2)**: Depends on Setup completion — **BLOCKS all user stories**.
- **User Stories (Phase 3+)**: All depend on Foundational phase completion.
  - All six user stories can proceed in parallel once Phase 2 finishes (different files, no inter-story dependency).
  - Recommended sequential order for solo development: US1 → US2 → US3 → US4 → US5 → US6 (priority order).
- **Polish (Phase 9)**: Depends on all desired user stories being complete.

### User Story Dependencies

- **US1 (P1)**: Can start after Foundational (Phase 2). No dependency on other stories.
- **US2 (P1)**: Can start after Foundational (Phase 2). No dependency on US1's rename being live in production — capture path uses the same constants; the lazy migration makes order irrelevant.
- **US3 (P1)**: Can start after Foundational (Phase 2). Pure documentation + tests; no inter-story dependency.
- **US4 (P1)**: Depends on US2's capture stamping of `channel='feishu'` being merged first (the field must exist on Raw pages for search tests to assert on it). Can run in parallel with US1 if US2 is already merged.
- **US5 (P2)**: Depends on US2's `channel` field being available on `RawConversationPointer`. Can run in parallel with US4.
- **US6 (P3)**: Depends on US2's `requestMetadata.origin` reading being in place. Can run in parallel with US4/US5.

### Within Each User Story

- Tests MUST be written and FAIL before implementation when the test exercises the new behavior.
- Schemas/services before consumers.
- Capture worker (US2) before search tests (US4).

### Parallel Opportunities

- T003, T004, T006 (different files in `packages/shared`) run in parallel inside Phase 2.
- T013, T014 (en.json vs zh.json) run in parallel.
- T010, T011, T012, T015, T016, T017, T018 run sequentially after T007/T008/T009 (they touch shared service/seed/UI files; small contention).
- T019, T020 run in parallel (different test files).
- T021, T022 run sequentially within `raw-conversations.ts`.
- T023 runs alone (single test file).
- T024, T025 run sequentially (header comment + verification).
- T026, T027 run in parallel (different test files).
- T028, T029 run sequentially (both verify existing code paths).
- T030, T031, T032, T033, T034 run in parallel (different component/i18n files).
- T035, T036, T037 run sequentially (test + capture worker + audit service).
- T038, T039 run in parallel.
- T040–T044 run sequentially (verification chain).

---

## Parallel Example: User Story 1 (P1)

```bash
# After Phase 2 foundational tasks finish:
# 1. Write the failing tests in parallel:
Task: "Update content-data-sources.test.ts with rename + lazy migration cases (T007)"
Task: "Update ai-question.test.ts to assert new key is consulted (T008)"
Task: "Update Bots General route/UI test for canonical Data Sources location (T009)"

# 2. After these tests fail, implement in order:
Task: "Update apps/web/src/server/services/content-data-sources.ts lazy migration (T010)"
Task: "Update apps/web/src/server/services/ai-question.ts to use new key (T011)"
Task: "Update apps/web/src/server/seed/index.ts to seed new key (T012)"

# 3. Rename the user-facing label in parallel:
Task: "Update apps/web/messages/en.json i18n rename (T013)"
Task: "Update apps/web/messages/zh.json i18n rename (T014)"

# 4. Verify and finalize:
Task: "Move Data Sources into Bots General (T015)"
Task: "Remove or redirect duplicate Content settings writer (T016)"
Task: "Verify ContentDataSourcesPanel reads renamed i18n keys (T017)"
Task: "Regenerate OpenAPI metadata (T018)"
```

---

## Parallel Example: User Story 2 (P1)

```bash
# Tests first, in parallel:
Task: "Write apps/web/src/server/services/raw-conversations.feishu.test.ts (T019)"
Task: "Write feishu-delegation.test.ts extension asserting createWikiQuestion args (T020)"

# Then implementation, in order:
Task: "Extend raw-conversations.ts captureWikiQuestion to stamp channel on source_metadata (T021)"
Task: "Update reconstructConversation (or pointer serializer) to carry channel (T022)"
```

---

## Implementation Strategy

### MVP First (User Stories 1 + 2 + 3 + 4 — the four P1 stories)

The user's stated goal is "the conversation search should work after that" — meaning the user's primary acceptance bar is met only when US1 (rename), US2 (capture), US3 (thin wrapper), and US4 (search) are all live. US5 and US6 are visual + audit polish respectively.

MVP delivery path:

1. Complete Phase 1: Setup.
2. Complete Phase 2: Foundational (CRITICAL — blocks all stories).
3. Complete Phase 3: User Story 1 — rename + lazy migration.
4. Complete Phase 4: User Story 2 — capture stamps `channel='feishu'`.
5. Complete Phase 5: User Story 3 — formalize thin wrapper contract.
6. Complete Phase 6: User Story 4 — search discovers Feishu captures.
7. **STOP and VALIDATE**: Run quickstart.md steps 1–12 against a fresh deployment; confirm SC-001 through SC-010 pass.
8. Deploy/demo if ready.

### Incremental Delivery

After MVP:

1. Add User Story 5 — visual badge. Independently testable (US5 alone does not break the existing reader).
2. Add User Story 6 — audit channel. Independently testable (audit log only).
3. Each story adds value without breaking previous stories.

### Parallel Team Strategy

With multiple developers, after Phase 2:

- Developer A: US1 (rename + migration) — touches `content-data-sources.ts`, `ai-question.ts`, seed, i18n.
- Developer B: US2 (capture) — touches `raw-conversations.ts`.
- Developer C: US3 (thin wrapper) — touches `feishu-sessions.ts` (comment only) and tests.
- Developer D: US4 (search) — waits on US2's `channel` field being live; then writes tests and verifies.
- Developer E: US5 (UI badge) — waits on US2's pointer carrying `channel`.
- Developer F: US6 (audit) — waits on US2's `requestMetadata.origin` reading.

All six converge at Phase 9.

---

## Notes

- `[P]` tasks = different files, no dependencies.
- `[Story]` label maps task to specific user story for traceability.
- Each user story is independently completable and testable against `quickstart.md`.
- Every new code change ships with a co-located Vitest test per project constitution; this spec never ships without tests.
- Commit after each phase or logical group; keep PRs small (one user story per PR where practical).
- No Drizzle migration is shipped by this feature; `pnpm db:generate` after every change must report "No schema changes, nothing to migrate" (per AGENTS.md rule).
- Avoid: hand-authored `NNNN_*.sql` migrations, parallel Feishu-only timeline tables, vendor-locked AI SDK usage, duplicate feature entry points.
