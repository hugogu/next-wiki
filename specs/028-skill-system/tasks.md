---

description: "Task list for 028-skill-system"
---

# Tasks: Skill System & Provider-Agnostic Tool Calling

**Input**: Design documents from `/specs/028-skill-system/`

**Prerequisites**: plan.md, spec.md, research.md, data-model.md, contracts/

**Tests**: INCLUDED. Tests are not optional for this feature — SC-007 mandates a
test that no skill script is ever executed, the tool-call contract is defined as
a conformance suite (FR-008), and the project's engineering rules require unit
and integration tests for new code.

**Organization**: Tasks are grouped by user story so each story can be
implemented, tested, and delivered independently.

## Format: `[ID] [P?] [Story] Description`

- **[P]**: Can run in parallel (different files, no dependency on incomplete work)
- **[Story]**: US1–US6, mapping to the user stories in spec.md

## Path Conventions

Monorepo paths from repository root:

- `apps/web/src/server/` — server-only logic
- `apps/web/app/` — routes and REST handlers
- `apps/web/src/components/` — UI (primitives in `ui/`)
- `apps/web/e2e/` — Playwright specs
- `apps/web/test/` — shared test fixtures
- `packages/shared/src/` — zero-dependency Zod schemas

Unit and integration tests are co-located as `*.test.ts` beside their source,
matching existing project convention.

---

## Phase 1: Setup (Shared Infrastructure)

**Purpose**: Deployment configuration for the optional skills mount

- [X] T001 Add `SKILLS_BASE_PATH` (default `/data/skills`) and `SKILLS_HOST_PATH` (default `./.skills`) to the env schema in `apps/web/src/server/config.ts`, mirroring the existing `CONTENT_LOCAL_*` pair
- [X] T002 [P] Add the read-only skills bind mount `- ${SKILLS_HOST_PATH:-./.skills}:${SKILLS_BASE_PATH:-/data/skills}:ro` and both env vars to the `web` service in `docker-compose.yml`
- [X] T003 [P] Document `SKILLS_HOST_PATH` / `SKILLS_BASE_PATH` in `.env.example`

---

## Phase 2: Foundational (Blocking Prerequisites)

**Purpose**: Schema and shared types that every user story depends on

**⚠️ CRITICAL**: No user story work can begin until this phase is complete

- [X] T004 Add enums `skill_source`, `skill_validation_state`, `skill_file_kind`, and `tool_call_strategy` to `apps/web/src/server/db/schema/enums.ts` per data-model.md
- [X] T005 Create `apps/web/src/server/db/schema/skills.ts` with the `skills`, `skill_files`, `skill_file_revisions`, and `skill_settings` tables, including every index, check, and FK in data-model.md
- [X] T006 Re-export the skills schema from `apps/web/src/server/db/schema/index.ts`
- [X] T007 Add `tool_call_strategy` (default `auto`) and `native_tool_call_failed_at` columns to the `ai_models` table in `apps/web/src/server/db/schema/index.ts`
- [X] T008 Run `pnpm db:generate` once to produce the single migration plus its `meta/NNNN_snapshot.json`; never hand-author the SQL or `meta/_journal.json`
- [X] T009 Re-run `pnpm db:generate` with no further edits and confirm it reports `No schema changes, nothing to migrate`; if it opens a rename prompt, stop and investigate the snapshot chain
- [X] T010 [P] Add `neutralToolDefinition`, `neutralToolCall`, and `neutralToolResult` Zod schemas and types to `packages/shared/src/ai-tools.ts` per contracts/tool-call-envelope.md §1
- [X] T011 [P] Create `packages/shared/src/skills.ts` with the skill view, file view, rejection, and request/response schemas from contracts/admin-skills-api.md, and export it from `packages/shared/src/index.ts`

**Checkpoint**: Schema and shared types ready — user stories can begin

---

## Phase 3: User Story 1 — Provider-Agnostic Tool Calling (Priority: P1) 🎯 MVP

**Goal**: Tool calling works identically whether the model uses native
function-calling or the existing text protocol, and switching vendors changes
nothing about which tools exist, what permissions apply, or how changes are
reviewed.

**Independent Test**: Configure two chat models from different vendors, one
`native` and one `text`. Run the same wiki task on each and confirm identical
tool availability, permission outcomes, review outcomes, and chat presentation —
only the provider request bodies differ.

### Tests for User Story 1

- [X] T012 [P] [US1] Extend `apps/web/test/ai-provider-fixture.ts` with tool-capable responses: an OpenAI-style `tool_calls` delta stream (including arguments split across chunks and two calls in one message), an Anthropic-style `tool_use` block stream, and a tool-payload rejection response
- [X] T013 [P] [US1] Add conformance cases TC-01 through TC-09 for `OpenAiCompatibleAdapter` to `apps/web/src/server/ai/providers/provider-conformance.test.ts`, driven as a table so a new adapter is one line
- [X] T014 [P] [US1] Add the same conformance table run for `AnthropicAdapter` in `apps/web/src/server/ai/providers/provider-conformance.test.ts`
- [X] T015 [P] [US1] Cover `tool_use` argument accumulation across `input_json_delta` frames and `tool_result` serialisation position — folded into the `readResultCarrier` hook of the conformance table in `apps/web/src/server/ai/providers/provider-conformance.test.ts` rather than duplicated in a separate `anthropic.test.ts`
- [X] T016 [P] [US1] Add `apps/web/src/server/services/ai-tool-strategy.test.ts` for every row of the resolution table in research.md R4, including the downgrade marker being set and cleared
- [X] T017 [US1] Add the planner-equivalence integration test in `apps/web/src/server/services/ai-tool-planners.test.ts`: the same scripted scenario through both planners must produce identical `ai_tool_calls` rows, identical emitted chat events, identical review decisions, and identical citations (FR-004)

### Implementation for User Story 1

- [X] T018 [US1] Extend `apps/web/src/server/ai/types.ts`: add `tools?: NeutralToolDefinition[]` to `TextGenerationInput`, `toolCalls`/`toolResults` to its message entries, a `{ type: 'tool_call'; call }` variant to `TextGenerationEvent`, and `readonly supportsNativeTools: boolean` to `AiProviderAdapter`
- [X] T019 [P] [US1] Implement tool translation in `apps/web/src/server/ai/providers/openai-compatible.ts`: emit `tools` as `{type:'function', function:{…}}`, accumulate `choices[].delta.tool_calls[]` fragments by index into one `tool_call` event per completed call, and serialise results as `role:'tool'` messages carrying `tool_call_id`
- [X] T020 [P] [US1] Implement tool translation in `apps/web/src/server/ai/providers/anthropic.ts`: emit `tools` with `input_schema`, read `content_block_start`/`input_json_delta`/`content_block_stop` for `tool_use`, and return results as `tool_result` content blocks in a user message
- [X] T021 [P] [US1] Set `supportsNativeTools = false` on `apps/web/src/server/ai/providers/minimax.ts` and `apps/web/src/server/ai/providers/voyage.ts`, and confirm `openrouter.ts` inherits the OpenAI-compatible implementation with no override
- [X] T022 [US1] Make every adapter with `supportsNativeTools === false` reject a `streamText` call carrying a non-empty `tools` array with `CAPABILITY_UNSUPPORTED` rather than ignoring it, in `apps/web/src/server/ai/types.ts` and the affected adapters
- [X] T023 [US1] Create `apps/web/src/server/services/ai-tool-strategy.ts` implementing the resolution table in research.md R4, plus helpers to set and clear `native_tool_call_failed_at`
- [X] T024 [US1] Create `apps/web/src/server/services/ai-tool-planners.ts` and move the existing text-protocol planner out of `apps/web/src/server/jobs/ai-question.ts` unchanged as `createTextProtocolPlanner`, preserving `MAX_TOOL_PROTOCOL_RETRIES` and `extractTaggedThinking`
- [X] T025 [US1] Add `createNativeToolPlanner` to `apps/web/src/server/services/ai-tool-planners.ts`: map the policy-filtered `listToolDefinitions()` to `NeutralToolDefinition[]`, stream with `tools` set, convert `tool_call` events to `PlannedToolCall[]` with `requestedReview: 'none'`, and treat a text-only turn as `{ kind: 'final' }`
- [X] T026 [US1] Wire strategy selection into `apps/web/src/server/jobs/ai-question.ts`: pick the planner from `ai-tool-strategy.ts`, and on a tool-shaped provider rejection set the downgrade marker and retry the same turn with the text planner so the user's request never fails
- [X] T027 [US1] Apply one truncation and summarisation policy to tool results across both planners and record when truncation occurred, in `apps/web/src/server/services/ai-tool-runtime.ts` (FR-006)
- [X] T028 [US1] Expose the `tool_call_strategy` per-model override in `apps/web/app/api/ai/models/[id]/route.ts` (or the existing model update handler) with `can(ctx, 'manage_ai')`, clearing `native_tool_call_failed_at` on change
- [X] T029 [US1] Add the strategy selector and the current effective strategy to `apps/web/src/components/admin/ai/ModelCatalog.tsx`
- [X] T030 [P] [US1] Add `admin.ai.models.toolCallStrategy.*` keys to `apps/web/messages/en.json` and `apps/web/messages/zh.json`

**Checkpoint**: US1 is independently deliverable — existing tool-enabled chat now
runs natively on capable models and by text protocol elsewhere, with no
user-visible difference.

---

## Phase 4: User Story 2 — Manage the Skill Catalogue (Priority: P1)

**Goal**: A Skills section in AI settings lists every known skill with its source
and state, enable/disable works, and enabled skills reach the model as a name +
description catalogue with content loaded on demand through the tool runtime.

**Independent Test**: Create an admin-authored skill, see it listed, watch the
model load it via a visible `load_skill` tool call, disable it and confirm it
disappears from the model's catalogue, and confirm a non-admin cannot reach the
section.

**Note**: This phase deliberately does not require built-in packages (US3) or the
mount (US5). The registry is built with pluggable sources so those slot in later.

### Tests for User Story 2

- [X] T031 [P] [US2] Add `apps/web/src/server/services/skills/package.test.ts` for the validation table in contracts/skill-package-format.md §2, including name pattern, description bounds, and declared-name-wins on directory mismatch (FR-013a)
- [X] T032 [P] [US2] Add `apps/web/src/server/services/skills/registry.test.ts` for registration order, first-claim-wins duplicate rejection with `conflictsWith`, determinism for a given state, and `invalidateSkillRegistry()` behaviour
- [X] T033 [P] [US2] Add `apps/web/src/server/services/skills/no-execution.test.ts`: assert no `child_process`, `vm`, `eval`, or dynamic `import()` appears anywhere under `apps/web/src/server/services/skills/`, plus behavioural cases proving a script in a built-in or admin-authored skill produces no side effect (SC-007, R10)
- [X] T034 [P] [US2] Add skill-tool tests to `apps/web/src/server/services/ai-tool-executors.test.ts`: `load_skill` on a disabled skill is denied with a safe message, a user without AI access is denied, and any user with AI access may load any enabled skill (FR-022, FR-022a)
- [X] T035 [P] [US2] Add `apps/web/app/api/ai/skills/route.test.ts` asserting `can(ctx, 'manage_ai')` on every method and a 403 with no detail for a non-admin

### Implementation for User Story 2

- [X] T036 [US2] Create `apps/web/src/server/services/skills/package.ts`: parse `SKILL.md` frontmatter with the existing `yaml` dependency, validate name and description, classify file kinds, and provide the path guard that rejects any path normalising outside the package root
- [X] T037 [US2] Create `apps/web/src/server/services/skills/store.ts`: managed-skill CRUD, built-in override read/write, `skill_files` writes with revision increment, and immutable `skill_file_revisions` appends
- [X] T038 [US2] Create `apps/web/src/server/services/skills/registry.ts`: a module-cached bounded registry assembled from pluggable sources in the fixed order of data-model.md, producing entries plus typed rejections, with a single `invalidateSkillRegistry()` entry point and no import-time I/O
- [X] T039 [US2] Create `apps/web/src/server/services/skills/builtin.ts` exporting the explicitly enumerated `BUILTIN_SKILL_PACKAGES` list and its loader; the list is empty until US3 populates it
- [X] T040 [US2] Implement effective-enabled resolution and `last_used_at` writes against `skill_settings` in `apps/web/src/server/services/skills/registry.ts`, defaulting every source to enabled per research.md R8
- [X] T041 [US2] Register `load_skill` and `read_skill_file` in `apps/web/src/server/services/ai-tool-registry.ts` as `category: read`, `riskLevel: read`, `requiredScope: use_ai_qa`, `resultRetention: never_full_result`, `defaultReviewPolicy: allow_immediate`
- [X] T042 [US2] Implement both skill executors in `apps/web/src/server/services/ai-tool-executors.ts`, returning text only, enforcing the per-turn skill content budget, and truncating with an explicit marker recorded on the tool-call row (FR-020, FR-021)
- [X] T043 [US2] Add the `{{SKILLS}}` placeholder and enabled-skill catalogue injection to `apps/web/src/server/jobs/wiki-question-tool-planner.ts`, mirroring the existing `{{TOOLS}}` mechanism, and update `DEFAULT_TOOL_SYSTEM_PROMPT` to reference it
- [X] T044 [US2] Implement `GET`/`POST` in `apps/web/app/api/ai/skills/route.ts` per contracts/admin-skills-api.md, including the `rejected` and `directory` payload sections
- [X] T045 [US2] Implement `GET`/`PATCH`/`DELETE` in `apps/web/app/api/ai/skills/[name]/route.ts`, returning `409 SKILL_NAME_TAKEN` with `conflictsWith` on a name collision (FR-016)
- [X] T046 [US2] Create `apps/web/src/components/admin/ai/SkillsPanel.tsx` listing skills with source, enabled toggle, validation state, and the rejection list
- [X] T047 [US2] Create the route `apps/web/app/(admin)/admin/ai/skills/page.tsx` loading the panel under `manage_ai`
- [X] T048 [US2] Add the `/admin/ai/skills` nav entry and its active-path handling to `apps/web/src/components/layout/Navigator.tsx`, keeping one canonical entry point per P11
- [X] T049 [P] [US2] Add `admin.ai.skills.*` keys to `apps/web/messages/en.json` and `apps/web/messages/zh.json`
- [X] T050 [US2] Emit audit records for skill create, delete, enable, and disable in `apps/web/src/server/services/audit.ts` call sites (FR-017)

**Checkpoint**: Skills are manageable and reach the model, using admin-authored
skills alone.

---

## Phase 5: User Story 3 — Built-In Wiki Skills (Priority: P1)

**Goal**: Wiki Writer, Wiki Tagger, and Wiki Linker ship enabled and produce
reviewable changes for the tasks their names imply.

**Independent Test**: On a fresh install, ask the assistant to expand a thin
page, tag pages you name, and link known concepts in a page. Each must load the
matching skill and produce a reviewable proposal, never a direct publish.

### Tests for User Story 3

- [X] T051 [P] [US3] Add `apps/web/src/server/skills/builtin/builtin-packages.test.ts` asserting all three packages parse, declare unique names matching their directory, and stay within the size and file-count bounds
- [ ] T052 [P] [US3] Add Wiki Linker constraint tests in `apps/web/src/server/services/skills/linker-constraints.test.ts`: no link inside an existing link, code span, fenced block, heading, or URL; keywords without a target left unchanged; ambiguous and unreadable targets skipped; first occurrence only (FR-042, SC-009)
- [ ] T053 [US3] Add an integration test in `apps/web/src/server/jobs/ai-question.test.ts` that each built-in skill produces a reviewable draft or proposal and never publishes (FR-039, FR-040, FR-041)
- [ ] T054 [US3] Add a trigger-accuracy test in `apps/web/src/server/jobs/wiki-question-tool-planner.test.ts` asserting each built-in skill loads for its task phrased three different ways and does not load for an ordinary question (SC-012)

### Implementation for User Story 3

- [X] T055 [P] [US3] Author the Wiki Writer package under `apps/web/src/server/skills/builtin/wiki-writer/` (`SKILL.md` plus reference and script files), instructing draft-or-propose only, never publish
- [X] T056 [P] [US3] Author the Wiki Tagger package under `apps/web/src/server/skills/builtin/wiki-tagger/`, instructing before/after tag proposals through the existing change-proposal path
- [X] T057 [P] [US3] Author the Wiki Linker package under `apps/web/src/server/skills/builtin/wiki-linker/`, encoding every constraint in contracts/skill-package-format.md §6
- [X] T058 [US3] Populate `BUILTIN_SKILL_PACKAGES` in `apps/web/src/server/services/skills/builtin.ts` with the three packages and confirm they load enabled by default (FR-044)
- [ ] T059 [US3] Bound each built-in skill's work to the pages named in the conversation and the existing per-turn tool-call limit, and make the assistant state which pages it covered and which it did not when the limit is reached, in `apps/web/src/server/services/ai-tool-runtime.ts` and the skill texts (FR-044a, FR-044b)
- [ ] T060 [US3] Render the Wiki Linker link list — keyword, location, target page — from the recorded tool-call arguments in `apps/web/src/components/admin/ai/ToolProposalDetail.tsx` and the draft review view, so the reviewer sees the structured list alongside the diff (FR-043)
- [ ] T061 [US3] Write each built-in skill's `description` for trigger match quality — naming the task and the phrasings users actually use — and iterate against T054

**Checkpoint**: The three built-in skills work end to end on a fresh install.

---

## Phase 6: User Story 4 — Browse and Edit Skill Files (Priority: P2)

**Goal**: Administrators can browse every file in a skill, edit files for
editable sources, and reset a built-in skill to its shipped default.

**Independent Test**: Open a built-in skill, browse its tree, open `SKILL.md` and
a script, edit the instructions, save, see the change take effect in the next
assistant turn, then reset to default.

### Tests for User Story 4

- [ ] T062 [P] [US4] Add `apps/web/app/api/ai/skills/[name]/files/[...path]/route.test.ts` covering read, write, delete, `SKILL_PATH_INVALID` for an escaping path, `SKILL_FILE_NOT_VIEWABLE` for binary or oversized files, and 403 for a non-admin
- [ ] T063 [P] [US4] Add a concurrency test asserting a stale `revision` returns `409 SKILL_FILE_CONFLICT` with `currentRevision` and applies nothing (FR-036)
- [ ] T064 [P] [US4] Add a validation test asserting a `SKILL.md` save that removes `name` or `description` is rejected with a specific message and the previous content stays in effect (FR-033)
- [ ] T065 [P] [US4] Add `apps/web/app/api/ai/skills/[name]/reset/route.test.ts` asserting the override is removed, shipped content returns, and revisions are retained (FR-034)

### Implementation for User Story 4

- [X] T066 [US4] Extract the CodeMirror setup from `apps/web/src/components/admin/appearance/CssEditor.tsx` into a new primitive `apps/web/src/components/ui/CodeEditor.tsx` and refactor `CssEditor` onto it, per P6 and the plan's Constitution Check
- [X] T067 [US4] Implement `GET`/`PUT`/`DELETE` in `apps/web/app/api/ai/skills/[name]/files/[...path]/route.ts` per contracts/admin-skills-api.md, with the path guard applied before any storage or filesystem access
- [X] T068 [US4] Enforce the mandatory `revision` concurrency token and reject `directory` sources with `409 SKILL_READ_ONLY` in `apps/web/src/server/services/skills/store.ts`
- [X] T069 [US4] Validate `SKILL.md` on every write and refuse a save that would leave the skill invalid, in `apps/web/src/server/services/skills/store.ts` (FR-033)
- [X] T070 [US4] Create the built-in override row on first write and implement reset via soft-delete in `apps/web/src/server/services/skills/store.ts`, exposed at `apps/web/app/api/ai/skills/[name]/reset/route.ts`
- [X] T071 [US4] Create `apps/web/src/components/admin/ai/SkillDetail.tsx` with the file tree, `ui/CodeEditor`, save, reset, and read-only presentation for directory sources
- [X] T072 [US4] Create the route `apps/web/app/(admin)/admin/ai/skills/[name]/page.tsx`, keeping the selected file in a `?file=` search param so the state is linkable and browser navigation works (P11)
- [X] T073 [US4] Show non-viewable files by name, type, and size without breaking the tree, in `apps/web/src/components/admin/ai/SkillDetail.tsx` (FR-037)
- [X] T074 [US4] Emit audit records for every skill file write, delete, rename, and reset from `apps/web/app/api/ai/skills/[name]/files/[...path]/route.ts` and `apps/web/app/api/ai/skills/[name]/reset/route.ts` (FR-032, FR-035)
- [X] T075 [P] [US4] Add the editor and conflict/validation error message keys to `apps/web/messages/en.json` and `apps/web/messages/zh.json`

**Checkpoint**: Skills are adaptable from the admin interface.

---

## Phase 7: User Story 5 — Load Skills from a Mounted Directory (Priority: P2)

**Goal**: Skill packages on the host load read-only inside the service, with
bounded, explicitly-contracted discovery.

**Independent Test**: Place a valid package in a host directory, start with it
mounted, see it read-only in the Skills section, remove it from the host, rescan,
and confirm it disappears.

### Tests for User Story 5

- [X] T076 [P] [US5] Add `apps/web/src/server/services/skills/directory-loader.test.ts` for every bound in research.md R6: depth, package count, file count, per-file bytes, per-package bytes
- [X] T077 [P] [US5] Add tests to `apps/web/src/server/services/skills/directory-loader.test.ts` that one malformed package never aborts the scan and its reason is reported, and that a missing, unreadable, or unconfigured root yields an informational notice rather than a failure (FR-025, FR-028)
- [X] T078 [P] [US5] Add a path-escape test to `apps/web/src/server/services/skills/directory-loader.test.ts` using a symlink pointing outside the package, asserting the file is never exposed and the reason is recorded (FR-029)
- [X] T079 [P] [US5] Add a duplicate-name test to `apps/web/src/server/services/skills/registry.test.ts`: a directory package colliding with a built-in is rejected with both locations named, the incumbent keeps working, and a host rename plus rescan clears the conflict (FR-014, SC-010)
- [X] T080 [P] [US5] Add a behavioural no-execution test for a script inside a directory-sourced skill to `apps/web/src/server/services/skills/no-execution.test.ts`, completing SC-007 coverage across all three sources

### Implementation for User Story 5

- [X] T081 [US5] Create `apps/web/src/server/services/skills/directory-loader.ts` implementing the one-level bounded scan, per-entry validation, typed rejection reasons, and symlink resolution with escape rejection
- [X] T082 [US5] Register the directory source with the registry in `apps/web/src/server/services/skills/registry.ts`, last in the registration order so built-in and managed skills keep their names
- [X] T083 [US5] Guarantee the service never writes to the skills root — no create, edit, rename, or delete path may target it — in `apps/web/src/server/services/skills/store.ts` (FR-026a)
- [X] T084 [US5] Implement `POST /api/ai/skills/rescan` in `apps/web/app/api/ai/skills/rescan/route.ts`, invalidating the registry and returning the refreshed catalogue and rejections, audited
- [X] T085 [US5] Add the rescan control, the mount status, and the rejection list with reasons to `apps/web/src/components/admin/ai/SkillsPanel.tsx`
- [X] T086 [P] [US5] Add mount status, notice, and rejection-reason message keys to `apps/web/messages/en.json` and `apps/web/messages/zh.json`
- [X] T087 [US5] Document the host mount workflow in `apps/web/README.md` and the deployment docs, including that the mount is read-only and edits made in the UI do not write back to the host

**Checkpoint**: Teams can bring their own skill library via a volume mount.

---

## Phase 8: User Story 6 — Observe and Troubleshoot Skills (Priority: P3)

**Goal**: Administrators can tell why a skill did not load or did not apply.

**Independent Test**: Place one valid and one malformed package, use the valid
one in a conversation, then confirm the Skills section reports the successful use
and the specific rejection reason.

### Tests for User Story 6

- [ ] T088 [P] [US6] Add tests asserting `last_used_at` is written when a skill is loaded and surfaced per skill (FR-045)
- [ ] T089 [P] [US6] Add a test to `apps/web/src/server/services/skills/directory-loader.test.ts` asserting rejection messages carry a specific reason and corrective action and contain no filesystem path outside the skills root, no credential, and no stack detail (FR-046)
- [ ] T090 [P] [US6] Add a test deriving which skills were loaded for a durable change from the `ai_tool_calls` chain (FR-024)

### Implementation for User Story 6

- [X] T091 [US6] Write `last_used_at` on successful `load_skill` in `apps/web/src/server/services/skills/registry.ts`
- [X] T092 [US6] Show enabled state, source, validation state, and last used time per skill in `apps/web/src/components/admin/ai/SkillsPanel.tsx`
- [ ] T093 [US6] Surface skill attribution on a durable change by deriving the loaded skills from the turn's `ai_tool_calls` rows, in `apps/web/src/server/services/ai-tool-runtime.ts` and the review views
- [ ] T094 [US6] Ensure every rejection reason carries a corrective action and is sanitised, in `apps/web/src/server/services/skills/directory-loader.ts` and `package.ts`

**Checkpoint**: The skill system is operable.

---

## Phase 9: Polish & Cross-Cutting Concerns

- [X] T095 [P] Add OpenAPI JSDoc to every new route under `apps/web/app/api/ai/skills/`, following the project's `next-openapi-gen` conventions (comment above the export, no single-line JSDoc, literal `@response` copies)
- [ ] T096 [P] Add the E2E spec `apps/web/e2e/admin-ai-skills.spec.ts` covering catalogue, enable/disable, file edit, reset, and rescan, modelled on `apps/web/e2e/admin-ai-tools.spec.ts`
- [ ] T097 [P] Add an E2E spec covering a skill-driven turn producing a reviewable proposal, extending `apps/web/e2e/ai-tool-proposals.spec.ts`
- [ ] T098 Verify against `apps/web/src/server/services/public-content.ts` and the ISR revalidation call sites that no skill content reaches a public surface and that no new ISR path or cache tag was introduced, per the Public Content Delivery section of `specs/028-skill-system/plan.md`
- [ ] T099 Run `pnpm lint` and `pnpm typecheck` and fix every warning introduced by this feature
- [ ] T100 Run `pnpm --filter @next-wiki/web test` with no preview or manual dev server running
- [ ] T101 Run `pnpm --filter @next-wiki/web test:e2e` with no preview or manual dev server running
- [ ] T102 Run `docker compose up -d --build` and walk quickstart.md §5, confirming the read-only mount, that a UI edit does not appear on the host, that rescan works without a restart, and that a non-existent `SKILLS_HOST_PATH` starts normally
- [ ] T103 Walk every success criterion in quickstart.md §3 and record the result

---

## Dependencies

```text
Phase 1 (Setup)
   └─> Phase 2 (Foundational)  ← blocks everything
          ├─> Phase 3  US1  (independent; no skill dependency)
          └─> Phase 4  US2  (independent of US1)
                 ├─> Phase 5  US3  (needs the registry + skill tools)
                 ├─> Phase 6  US4  (needs the store + registry)
                 └─> Phase 7  US5  (needs the registry's pluggable sources)
                        └─> Phase 8  US6  (needs rejections from US5 to be meaningful)
                               └─> Phase 9  Polish
```

**Story independence**

- **US1** has no dependency on any skill work and can ship alone. It is the only
  story that touches the provider adapters.
- **US2** depends only on the foundational phase. It is testable with
  admin-authored skills, without built-in packages or the mount.
- **US3**, **US4**, **US5** all build on US2 and are independent of each other —
  they can proceed in parallel once US2 is done.
- **US6** is meaningful only after US5 produces real rejections, though T091–T093
  could land earlier.

**Cross-story file contention** (do not parallelise these):

- `apps/web/src/server/services/skills/registry.ts` — T038, T040 (US2), T082 (US5), T091 (US6)
- `apps/web/src/server/services/skills/store.ts` — T037 (US2), T068–T070 (US4), T083 (US5)
- `apps/web/src/components/admin/ai/SkillsPanel.tsx` — T046 (US2), T085 (US5), T092 (US6)
- `apps/web/src/server/services/ai-tool-runtime.ts` — T027 (US1), T059 (US3), T093 (US6)
- `apps/web/messages/*.json` — T030, T049, T075, T086 (parallel within a phase only)

---

## Parallel Execution Examples

**Phase 2** — after T009 completes:

```text
T010  packages/shared/src/ai-tools.ts
T011  packages/shared/src/skills.ts
```

**Phase 3 (US1)** — tests first, all independent files:

```text
T012  apps/web/test/ai-provider-fixture.ts
T013  provider-conformance.test.ts  (openai-compatible cases)
T014  provider-conformance.test.ts  (anthropic cases)   ← same file as T013; sequence these two
T015  apps/web/src/server/ai/providers/anthropic.test.ts
T016  apps/web/src/server/services/ai-tool-strategy.test.ts
```

then, after T018:

```text
T019  providers/openai-compatible.ts
T020  providers/anthropic.ts
T021  providers/minimax.ts + voyage.ts
```

**Phase 5 (US3)** — the three packages are independent directories:

```text
T055  server/skills/builtin/wiki-writer/
T056  server/skills/builtin/wiki-tagger/
T057  server/skills/builtin/wiki-linker/
```

**Phases 5, 6, 7** can run as three parallel tracks once Phase 4 is complete,
with the file-contention list above respected.

---

## Implementation Strategy

**MVP — Phase 1 → 3 (US1).** The tool-call abstraction is a complete, shippable
deliverable on its own: existing tool-enabled chat starts using native function
calling on capable models, gains a vendor-switch guarantee backed by a
conformance suite, and changes nothing user-visible. Ship and verify this before
touching skills. It is also the highest-risk work, so failing early here is
cheap.

**First user-visible skill increment — Phase 4 + 5 (US2 + US3).** US2 alone is
technically testable but thin: a Skills page with no skills in it. Pairing it
with the three built-in packages is the first release worth demoing.

**Then Phase 6 and 7 in either order.** Editing (US4) and the mount (US5) serve
different audiences — one adapts the shipped procedures, the other brings an
existing library — and neither blocks the other.

**Phase 8 last**, since its value depends on US5 producing real rejections.

---

## Notes

- **T060 is a judgment call worth reviewing.** FR-043 requires the Wiki Linker
  proposal to show each link's keyword, location, and target page. The spec's own
  Assumptions state that this feature introduces no new review model and reuses
  the draft/diff path for page-content changes, so T060 renders the structured
  link list from the recorded tool-call arguments alongside the diff rather than
  adding a new proposal kind. If a first-class `link` proposal kind is wanted
  instead, that is a schema change and must be folded into T004–T008 before the
  migration is generated — retrofitting it later means a second migration.
- **Directory skills load enabled by default** (research.md R8). If the more
  conservative "mounted means visible, admin makes it active" reading is
  preferred, only T040's default changes.
- **Do not hand-author migrations.** T008 and T009 exist because this repository
  has twice been broken by hand-written migrations with missing snapshots. One
  `db:generate` run, then a second run that must report no changes.
- **Stop any preview or manual dev server before T100 and T101.** Leftover dev
  servers starve CPU and make the suite look like it regressed.
