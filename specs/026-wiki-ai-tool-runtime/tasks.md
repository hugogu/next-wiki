# Tasks: Wiki AI Tool Runtime

**Input**: Design documents from `/specs/026-wiki-ai-tool-runtime/`

**Prerequisites**: [plan.md](./plan.md), [spec.md](./spec.md), [research.md](./research.md), [data-model.md](./data-model.md), [contracts/](./contracts/), [quickstart.md](./quickstart.md)

**Tests**: Included because the specification defines independent acceptance tests and the plan requires Vitest/component/Playwright coverage for tool policy, runtime, proposals, evidence, APIs, and UI.

**Organization**: Tasks are grouped by user story so each story can be implemented and validated as an independent increment after the shared foundation is complete.

## Phase 1: Setup (Shared Infrastructure)

**Purpose**: Establish shared types, schema exports, and UI copy locations used by all stories.

- [X] T001 Create shared AI tool contract schemas and enums in `packages/shared/src/ai-tools.ts`
- [X] T002 Export AI tool schemas from `packages/shared/src/index.ts`
- [X] T003 [P] Extend AI action feature and model capability shared schemas in `packages/shared/src/ai.ts`
- [X] T004 [P] Add server OpenAPI schema exports for AI tool routes in `apps/web/src/server/api/openapi-schemas.ts`
- [X] T005 [P] Add AI Tools navigation and UI copy keys in `apps/web/src/i18n/keys.ts`
- [X] T006 [P] Add English and Chinese AI Tools messages in `apps/web/messages/en.json` and `apps/web/messages/zh.json`

---

## Phase 2: Foundational (Blocking Prerequisites)

**Purpose**: Database, service, audit, and async-action foundation that every user story depends on.

**Critical**: No user story work should begin until this phase is complete.

- [ ] T007 Add Drizzle enums for tool providers, tool categories, review policy, workflow status, tool-call status, proposal status, proposal kind, and evidence target kind in `apps/web/src/server/db/schema/enums.ts`
- [ ] T008 Add Drizzle tables for tool providers, tool policies, tool workflows, tool calls, tool change proposals, proposal items, and tool evidence links in `apps/web/src/server/db/schema/ai-tools.ts`
- [ ] T009 Register the AI tool schema module in `apps/web/src/server/db/schema/index.ts`
- [ ] T010 Generate the Drizzle migration from schema changes with `pnpm db:generate`, producing files under `apps/web/src/server/db/migrations/`
- [ ] T011 [P] Add schema regression tests for AI tool tables and enum names in `apps/web/src/server/db/ai-tool-schema.test.ts`
- [ ] T012 [P] Add shared schema validation tests for tool contracts in `packages/shared/src/ai-tools.test.ts`
- [ ] T013 Implement the built-in `next-wiki` tool registry in `apps/web/src/server/services/ai-tool-registry.ts`
- [ ] T014 Implement server-enforced review-policy resolution in `apps/web/src/server/services/ai-tool-policy.ts`
- [ ] T015 Implement tool workflow and tool call persistence primitives in `apps/web/src/server/services/ai-tool-runtime.ts`
- [ ] T016 Implement proposal persistence primitives and state-transition guards in `apps/web/src/server/services/ai-tool-proposals.ts`
- [ ] T017 Implement Tool Evidence Raw category lookup/restore primitives in `apps/web/src/server/services/ai-tool-evidence.ts`
- [ ] T018 Extend AI action/event service types for `wiki_tool_chat` and tool event payloads in `apps/web/src/server/services/ai-actions.ts`
- [ ] T019 Register wiki tool chat job handling in `apps/web/src/server/jobs/register.ts` and `apps/web/src/server/jobs/ai-actions.ts`
- [ ] T020 Add audit event helpers for tool policy changes, tool calls, proposal decisions, proposal apply, and immediate mutations in `apps/web/src/server/services/audit.ts`
- [ ] T021 [P] Add foundational unit tests for review-policy strictness in `apps/web/src/server/services/ai-tool-policy.test.ts`
- [ ] T022 [P] Add foundational unit tests for workflow/call state transitions in `apps/web/src/server/services/ai-tool-runtime.test.ts`
- [ ] T023 [P] Add foundational unit tests for proposal state transitions in `apps/web/src/server/services/ai-tool-proposals.test.ts`
- [ ] T024 [P] Add foundational unit tests for Tool Evidence category restore behavior in `apps/web/src/server/services/ai-tool-evidence.test.ts`

**Checkpoint**: Database schema, shared schemas, registry, policy, workflow, proposal, evidence, audit, and job entry points are ready.

---

## Phase 3: User Story 1 - Configure Wiki AI Tools (Priority: P1)

**Goal**: Admins can manage built-in Wiki AI tool availability and review policy from one AI settings Tools surface.

**Independent Test**: Open `/admin/ai/tools` as Admin, verify the built-in provider and tool categories, disable a category, set mutating tools to review-required, and confirm non-admin access is denied.

### Tests for User Story 1

- [ ] T025 [P] [US1] Add API route tests for Admin-only tool listing and policy update in `apps/web/app/api/ai/tools/route.test.ts`
- [ ] T026 [P] [US1] Add component tests for provider list, policy editor, and future external-provider disabled state in `apps/web/src/components/admin/ai/AiToolsPanel.test.tsx`
- [ ] T027 [P] [US1] Add Playwright coverage for Admin Tools configuration and non-admin denial in `apps/web/e2e/admin-ai-tools.spec.ts`

### Implementation for User Story 1

- [ ] T028 [US1] Implement Admin tool listing route in `apps/web/app/api/ai/tools/route.ts`
- [ ] T029 [US1] Implement Admin policy update route in `apps/web/app/api/ai/tools/policies/route.ts`
- [ ] T030 [US1] Implement tool policy update service with audit logging in `apps/web/src/server/services/ai-tool-policy.ts`
- [ ] T031 [US1] Create Admin AI Tools page route in `apps/web/app/(admin)/admin/ai/tools/page.tsx`
- [ ] T032 [US1] Create provider/category table and policy editor in `apps/web/src/components/admin/ai/AiToolsPanel.tsx`
- [ ] T033 [US1] Add the canonical Tools entry under the existing Admin AI navigation in `apps/web/src/components/layout/Navigator.tsx`
- [ ] T034 [US1] Wire Admin Tools route state to URL query parameters in `apps/web/src/components/admin/ai/AiToolsPanel.tsx`
- [ ] T035 [US1] Regenerate OpenAPI artifacts for tool settings route annotations in `apps/web/app/api/openapi.json`

**Checkpoint**: User Story 1 is functional and independently testable.

---

## Phase 4: User Story 2 - Let Wiki AI Use Tools During Chat (Priority: P1)

**Goal**: Authorized users can ask Wiki AI to inspect wiki content and prepare governed changes through a bounded, permission-scoped tool loop.

**Independent Test**: Enable read tools and one review-required write tool, ask Wiki AI to find related pages and propose a page update, then confirm visible multi-step tool calls happen without bypassing review or permissions.

### Tests for User Story 2

- [ ] T036 [P] [US2] Add runtime unit tests for bounded tool-loop completion, failure, cancellation, and limit reached states in `apps/web/src/server/services/ai-tool-runtime.test.ts`
- [ ] T037 [P] [US2] Add permission-projection tests for read tools returning only allowed pages in `apps/web/src/server/services/ai-tool-runtime.permissions.test.ts`
- [ ] T038 [P] [US2] Add API route tests for additive `tools` option and unsupported model fallback in `apps/web/app/api/ai/questions/route.test.ts`
- [ ] T039 [P] [US2] Add AI action job tests for iterative tool calling and recoverable tool failures in `apps/web/src/server/jobs/ai-tool-chat.test.ts`

### Implementation for User Story 2

- [ ] T040 [US2] Implement built-in read tool adapters for search, page fetch, page list, backlinks, and neighborhood in `apps/web/src/server/services/ai-tool-registry.ts`
- [ ] T041 [US2] Implement built-in page draft and metadata/tag tool adapters that call existing permission-checked services in `apps/web/src/server/services/ai-tool-registry.ts`
- [ ] T042 [US2] Add tool-calling capability gate and fallback behavior in `apps/web/src/server/services/ai-question.ts`
- [ ] T043 [US2] Accept the additive `tools` request option and create `wiki_tool_chat` actions in `apps/web/app/api/ai/questions/route.ts`
- [ ] T044 [US2] Implement the bounded tool-call loop and provider-agnostic call envelope in `apps/web/src/server/services/ai-tool-runtime.ts`
- [ ] T045 [US2] Emit tool-call lifecycle events through AI action events in `apps/web/src/server/services/ai-actions.ts`
- [ ] T046 [US2] Add cancellation handling for running tool workflows in `apps/web/src/server/services/ai-tool-runtime.ts`
- [ ] T047 [US2] Register and process `wiki_tool_chat` jobs in `apps/web/src/server/jobs/ai-actions.ts`
- [ ] T048 [US2] Ensure disabled categories and denied permissions produce safe assistant-facing failures in `apps/web/src/server/services/ai-tool-runtime.ts`

**Checkpoint**: User Story 2 is functional and independently testable.

---

## Phase 5: User Story 3 - Review AI-Proposed Changes Before They Take Effect (Priority: P1)

**Goal**: Mutating tool calls create drafts or reviewable non-page proposals when policy requires review, and Admins can approve, reject, or apply them safely.

**Independent Test**: Ask Wiki AI to update a page and retag several pages with review required; verify page changes appear as diffable drafts, tag changes appear as proposals with before/after states, and durable state changes only after Admin approval/apply.

### Tests for User Story 3

- [ ] T049 [P] [US3] Add service tests for proposal item conflict detection and apply/reject behavior in `apps/web/src/server/services/ai-tool-proposals.test.ts`
- [ ] T050 [P] [US3] Add route tests for proposal list, detail, approve, reject, and apply APIs in `apps/web/app/api/ai/tool-proposals/route.test.ts`
- [ ] T051 [P] [US3] Add component tests for proposal detail states and item-level before/after rendering in `apps/web/src/components/admin/ai/ToolProposalDetail.test.tsx`
- [ ] T052 [P] [US3] Add Playwright coverage for page draft review and tag proposal apply/reject in `apps/web/e2e/ai-tool-proposals.spec.ts`

### Implementation for User Story 3

- [ ] T053 [US3] Connect page-content tool mutations to existing draft/revision creation in `apps/web/src/server/services/ai-tool-runtime.ts`
- [ ] T054 [US3] Implement non-page proposal creation for tag, metadata, batch, and raw evidence link changes in `apps/web/src/server/services/ai-tool-proposals.ts`
- [ ] T055 [US3] Implement proposal list and detail APIs in `apps/web/app/api/ai/tool-proposals/route.ts` and `apps/web/app/api/ai/tool-proposals/[id]/route.ts`
- [ ] T056 [US3] Implement proposal approve, reject, and apply APIs in `apps/web/app/api/ai/tool-proposals/[id]/approve/route.ts`, `apps/web/app/api/ai/tool-proposals/[id]/reject/route.ts`, and `apps/web/app/api/ai/tool-proposals/[id]/apply/route.ts`
- [ ] T057 [US3] Re-check reviewer permission and current resource state before applying proposal items in `apps/web/src/server/services/ai-tool-proposals.ts`
- [ ] T058 [US3] Route applied public page mutations through existing public-content invalidation in `apps/web/src/server/services/public-content.ts`
- [ ] T059 [US3] Create proposal review page route in `apps/web/app/(admin)/admin/ai/tools/proposals/[id]/page.tsx`
- [ ] T060 [US3] Create proposal detail UI with approve, reject, apply, conflict, and per-item result states in `apps/web/src/components/admin/ai/ToolProposalDetail.tsx`
- [ ] T061 [US3] Regenerate OpenAPI artifacts for proposal route annotations in `apps/web/app/api/openapi.json`

**Checkpoint**: User Story 3 is functional and independently testable.

---

## Phase 6: User Story 4 - Show Tool Calling in the Chat Window (Priority: P2)

**Goal**: Users can see tool calls, command markdown, safe statuses, summaries, proposals, and evidence links during live chat and retained conversation replay.

**Independent Test**: Start a chat request with several tool calls, verify queued/running/succeeded/failed/blocked statuses and command markdown appear, and confirm full raw tool results are absent from retained conversation history.

### Tests for User Story 4

- [ ] T062 [P] [US4] Add component tests for live tool-call timeline states in `apps/web/src/components/chat/ToolCallTimeline.test.tsx`
- [ ] T063 [P] [US4] Add conversation replay tests for command records without full result payloads in `apps/web/src/components/chat/ConversationSessionView.test.tsx`
- [ ] T064 [P] [US4] Add retention tests for command markdown and safe status metadata in `apps/web/src/server/services/raw-conversations.test.ts`

### Implementation for User Story 4

- [ ] T065 [US4] Implement chat timeline rendering for tool call events in `apps/web/src/components/chat/ToolCallTimeline.tsx`
- [ ] T066 [US4] Integrate tool timeline into the active chat pane in `apps/web/src/components/chat/ConversationSessionView.tsx`
- [ ] T067 [US4] Persist command markdown and safe tool status metadata during conversation capture in `apps/web/src/server/services/raw-conversations.ts`
- [ ] T068 [US4] Redact permission-restricted command details, proposal links, and evidence links during conversation replay in `apps/web/src/components/chat/ConversationSessionView.tsx`
- [ ] T069 [US4] Add event-stream payload handling for tool calls, proposals, and evidence links in `apps/web/src/components/chat/chat-store.ts`

**Checkpoint**: User Story 4 is functional and independently testable.

---

## Phase 7: User Story 5 - Preserve Tool Evidence for Durable Knowledge (Priority: P2)

**Goal**: Tool output that influences durable knowledge is captured or linked as Raw evidence, while transient-only tool results are not stored wholesale.

**Independent Test**: Use Wiki AI to create or update durable knowledge from tool output; verify a Tool Evidence Raw entry or existing source revision link exists, and users without Raw permission cannot discover the evidence.

### Tests for User Story 5

- [ ] T070 [P] [US5] Add service tests for required evidence blocking and existing-source revision linking in `apps/web/src/server/services/ai-tool-evidence.test.ts`
- [ ] T071 [P] [US5] Add permission tests for hiding Tool Evidence from unauthorized users in `apps/web/src/server/services/ai-tool-evidence.permissions.test.ts`
- [ ] T072 [P] [US5] Add Playwright coverage for durable knowledge evidence links and Raw permission redaction in `apps/web/e2e/ai-tool-evidence.spec.ts`

### Implementation for User Story 5

- [ ] T073 [US5] Implement Tool Evidence Raw category restore/create behavior in `apps/web/src/server/services/ai-tool-evidence.ts`
- [ ] T074 [US5] Implement evidence capture and content hashing for durable tool-sourced outputs in `apps/web/src/server/services/ai-tool-evidence.ts`
- [ ] T075 [US5] Link tool evidence to page revisions, proposals, tag mutations, and metadata changes in `apps/web/src/server/services/ai-tool-evidence.ts`
- [ ] T076 [US5] Block durable AI-generated changes when required evidence capture is unavailable in `apps/web/src/server/services/ai-tool-runtime.ts`
- [ ] T077 [US5] Apply Raw permission filtering to evidence links in proposal, chat, search, and page metadata surfaces in `apps/web/src/server/services/ai-tool-evidence.ts`

**Checkpoint**: User Story 5 is functional and independently testable.

---

## Phase 8: User Story 6 - Keep the Tool Runtime Extensible (Priority: P3)

**Goal**: The built-in provider uses provider-aware metadata and policy semantics that future external MCP providers can reuse, while external provider activation remains disabled in this phase.

**Independent Test**: Inspect the Tools area and exported metadata; verify every tool has provider identity, category, risk, permission, retention, and review policy, and that external provider registration cannot be activated.

### Tests for User Story 6

- [ ] T078 [P] [US6] Add registry tests for provider identity, tool metadata completeness, and no implicit provider discovery in `apps/web/src/server/services/ai-tool-registry.test.ts`
- [ ] T079 [P] [US6] Add MCP metadata compatibility tests against existing tool names in `packages/mcp-server/src/tools/tools.test.ts`
- [ ] T080 [P] [US6] Add Admin UI tests for future external-provider disabled state in `apps/web/src/components/admin/ai/AiToolsPanel.test.tsx`

### Implementation for User Story 6

- [ ] T081 [US6] Add provider-aware metadata exports for built-in tools in `apps/web/src/server/services/ai-tool-registry.ts`
- [ ] T082 [US6] Add MCP-compatible built-in tool metadata exports in `packages/mcp-server/src/tool-metadata.ts`
- [ ] T083 [US6] Ensure external provider kinds remain visible but non-activatable in `apps/web/src/server/services/ai-tool-policy.ts`
- [ ] T084 [US6] Document external MCP provider extension constraints in `specs/026-wiki-ai-tool-runtime/contracts/tool-contract.md`

**Checkpoint**: User Story 6 is functional and independently testable.

---

## Phase 9: Polish & Cross-Cutting Concerns

**Purpose**: Final validation, documentation, generated artifacts, and full acceptance coverage across stories.

- [ ] T085 [P] Run shared/package tests covering `packages/shared/src/ai-tools.test.ts` and `packages/mcp-server/src/tools/tools.test.ts` with `pnpm --filter @next-wiki/mcp-server test` and `pnpm --filter @next-wiki/shared test`
- [ ] T086 [P] Run web service and component tests covering `apps/web/src/server/services/ai-tool-runtime.test.ts` and `apps/web/src/components/chat/ToolCallTimeline.test.tsx` with `pnpm --filter @next-wiki/web test`
- [ ] T087 Run Drizzle verification after migration generation with `pnpm db:generate` and confirm no schema changes under `apps/web/src/server/db/migrations/`
- [ ] T088 Run full-stack validation covering `apps/web/e2e/admin-ai-tools.spec.ts`, `apps/web/e2e/ai-tool-proposals.spec.ts`, and `apps/web/e2e/ai-tool-evidence.spec.ts` with `docker compose up -d --build` and `pnpm --filter @next-wiki/web test:e2e`
- [ ] T089 Validate public readers see no proposal or unapplied tool mutation in `apps/web/e2e/ai-tool-proposals.spec.ts`
- [ ] T090 [P] Update feature notes and quickstart results in `specs/026-wiki-ai-tool-runtime/quickstart.md`
- [ ] T091 Run whitespace and markdown validation with `git diff --check` for `specs/026-wiki-ai-tool-runtime/tasks.md`

---

## Dependencies & Execution Order

### Phase Dependencies

- **Phase 1 Setup**: No dependencies.
- **Phase 2 Foundational**: Depends on Phase 1 and blocks all user stories.
- **Phase 3 US1**: Depends on Phase 2.
- **Phase 4 US2**: Depends on Phase 2; can begin in parallel with US1 after foundation, but operational rollout should validate US1 policies first.
- **Phase 5 US3**: Depends on Phase 2 and integrates with US2 mutation outputs; can be built in parallel using service contracts once proposal primitives exist.
- **Phase 6 US4**: Depends on Phase 2 event contracts and US2 event emission.
- **Phase 7 US5**: Depends on Phase 2 evidence primitives and integrates with US2/US3 durable changes.
- **Phase 8 US6**: Depends on Phase 2 registry/policy primitives and can run alongside US1-US5.
- **Phase 9 Polish**: Depends on the desired user stories being complete.

### User Story Dependencies

- **US1 (P1 Configure Tools)**: No dependency on other stories after foundation; MVP control surface.
- **US2 (P1 Tool Chat Runtime)**: No dependency on US1 implementation after foundation, but uses the same policy records US1 manages.
- **US3 (P1 Review AI Changes)**: Depends on foundation and receives mutation outputs from US2; proposal APIs/UI can be independently tested with seeded proposals.
- **US4 (P2 Chat Timeline)**: Depends on US2 event payloads.
- **US5 (P2 Tool Evidence)**: Depends on US2/US3 durable-output paths.
- **US6 (P3 Extensibility)**: Depends on foundation only.

### Within Each User Story

- Tests should be written first and initially fail.
- Shared schemas before DB schema consumers.
- DB schema and generated migration before services.
- Services before API routes.
- API routes before UI integration.
- UI and E2E validation after the relevant route/service behavior exists.

---

## Parallel Opportunities

- Setup tasks T003-T006 can run in parallel after T001/T002 ownership is clear.
- Foundational tests T021-T024 can run in parallel with service implementation once target interfaces are agreed.
- US1 tests T025-T027 can run in parallel; UI and route implementation touch separate files.
- US2 tests T036-T039 can run in parallel; read adapters and route/job integration can be split after T040 defines tool adapter contracts.
- US3 tests T049-T052 can run in parallel; proposal APIs and UI can be split after T054 defines proposal DTOs.
- US4 tests T062-T064 can run in parallel with chat timeline implementation.
- US5 tests T070-T072 can run in parallel with evidence service implementation.
- US6 tests T078-T080 can run in parallel with provider metadata alignment.

## Parallel Example: User Story 1

```text
Task: "T025 [P] [US1] Add API route tests for Admin-only tool listing and policy update in apps/web/app/api/ai/tools/route.test.ts"
Task: "T026 [P] [US1] Add component tests for provider list, policy editor, and future external-provider disabled state in apps/web/src/components/admin/ai/AiToolsPanel.test.tsx"
Task: "T027 [P] [US1] Add Playwright coverage for Admin Tools configuration and non-admin denial in apps/web/e2e/admin-ai-tools.spec.ts"
```

## Parallel Example: User Story 2

```text
Task: "T036 [P] [US2] Add runtime unit tests for bounded tool-loop completion, failure, cancellation, and limit reached states in apps/web/src/server/services/ai-tool-runtime.test.ts"
Task: "T037 [P] [US2] Add permission-projection tests for read tools returning only allowed pages in apps/web/src/server/services/ai-tool-runtime.permissions.test.ts"
Task: "T038 [P] [US2] Add API route tests for additive tools option and unsupported model fallback in apps/web/app/api/ai/questions/route.test.ts"
Task: "T039 [P] [US2] Add AI action job tests for iterative tool calling and recoverable tool failures in apps/web/src/server/jobs/ai-tool-chat.test.ts"
```

## Parallel Example: User Story 3

```text
Task: "T049 [P] [US3] Add service tests for proposal item conflict detection and apply/reject behavior in apps/web/src/server/services/ai-tool-proposals.test.ts"
Task: "T050 [P] [US3] Add route tests for proposal list, detail, approve, reject, and apply APIs in apps/web/app/api/ai/tool-proposals/route.test.ts"
Task: "T051 [P] [US3] Add component tests for proposal detail states and item-level before/after rendering in apps/web/src/components/admin/ai/ToolProposalDetail.test.tsx"
Task: "T052 [P] [US3] Add Playwright coverage for page draft review and tag proposal apply/reject in apps/web/e2e/ai-tool-proposals.spec.ts"
```

## Implementation Strategy

### MVP First

1. Complete Phase 1 and Phase 2.
2. Complete Phase 3 (US1) so Admins can control tools.
3. Complete Phase 4 (US2) for read-only and review-required tool chat.
4. Complete Phase 5 (US3) before enabling mutating tools outside development.
5. Validate with quickstart scenarios 1-4 before moving to P2 evidence/display polish.

### Incremental Delivery

1. Foundation: schemas, migration, registry, policy, runtime records, proposal/evidence primitives.
2. US1: Admin Tools management.
3. US2: tool-enabled chat loop under policy and permissions.
4. US3: reviewable drafts/proposals and apply/reject.
5. US4: richer chat timeline and retained conversation replay.
6. US5: durable Raw evidence enforcement.
7. US6: external-provider-ready metadata without external activation.

### Team Parallel Strategy

1. One developer owns Drizzle/shared schemas and migration.
2. One developer owns runtime/policy/job services.
3. One developer owns Admin Tools UI/API.
4. One developer owns proposal review UI/API.
5. One developer owns chat timeline and evidence redaction once event contracts settle.

## Format Validation

- All tasks use `- [ ] T###` checklist format.
- User story phase tasks include `[US1]` through `[US6]` labels.
- Parallelizable tasks include `[P]` only where they touch separable files or test surfaces.
- Every task description includes at least one concrete file path or command with its resulting file path.
