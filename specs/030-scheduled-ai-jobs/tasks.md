# Tasks: Scheduled AI Jobs

**Input**: Design documents from `/specs/030-scheduled-ai-jobs/`

**Prerequisites**: [plan.md](./plan.md), [spec.md](./spec.md), [research.md](./research.md), [data-model.md](./data-model.md), [contracts/](./contracts/), [quickstart.md](./quickstart.md)

**Tests**: Required by the project instructions and feature specification. Write the focused tests before the matching implementation task, confirm they fail for the intended behavior, then make them pass.

**Organization**: Tasks are grouped by user story. Shared schema and scheduling foundations deliberately precede all stories; each later phase has an independently verifiable outcome once its stated dependencies are met.

## Format: `[ID] [P?] [Story] Description`

- **[P]**: Can run in parallel with other marked work after its listed dependencies are complete.
- **[Story]**: Maps a task to a feature-spec user story.
- Every task includes its concrete target path.

## Phase 1: Setup (Shared Infrastructure)

**Purpose**: Add direct dependencies and shared contract types without creating a runtime path.

- [ ] T001 Add direct `cron-parser` dependency and its lockfile entry in `apps/web/package.json` and `pnpm-lock.yaml`.
- [ ] T002 [P] Add schedule, target-scope, definition, run, list-filter, and API-view schema tests in `packages/shared/src/scheduled-ai-jobs.test.ts`.
- [ ] T003 Create and export validated scheduled-job Zod schemas/types in `packages/shared/src/scheduled-ai-jobs.ts` and `packages/shared/src/index.ts`.

---

## Phase 2: Foundational (Blocking Prerequisites)

**Purpose**: Establish durable data, action/queue registration points, and the shared scheduling primitives required by every user story.

**⚠️ CRITICAL**: Do not begin any user-story phase until this phase is complete.

- [ ] T004 Add schema-regression expectations for scheduled enums, tables, foreign keys, uniqueness, and check/index invariants in `apps/web/src/server/db/scheduled-ai-jobs-schema.test.ts`.
- [ ] T005 Add `scheduled_ai_job` action feature; scheduled definition/run enums and tables; active/due/occurrence indexes; and scheduled-run proposal provenance link in `apps/web/src/server/db/schema/enums.ts`, `apps/web/src/server/db/schema/index.ts`, and `apps/web/src/server/db/schema/ai-tools.ts`.
- [ ] T006 Generate the Drizzle migration and snapshot from the schema changes with `pnpm db:generate` in `apps/web/src/server/db/migrations/`; do not hand-author SQL, journal, or snapshots.
- [ ] T007 [P] Add recurrence, IANA time-zone, DST, definition-snapshot, and conditional state-transition tests in `apps/web/src/server/services/scheduled-ai-jobs.test.ts`.
- [ ] T008 Implement schedule parsing/validation, next-occurrence calculation, immutable snapshot creation, and conditional definition/run transition helpers in `apps/web/src/server/services/scheduled-ai-jobs.ts`.
- [ ] T009 [P] Extend AI-action feature labels, queue selection, and handler-registration tests for `scheduled_ai_job` in `packages/shared/src/ai.test.ts`, `apps/web/src/server/services/ai-actions.test.ts`, and `apps/web/src/server/jobs/ai-actions.test.ts`.
- [ ] T010 Register the new action feature and explicit queue constants/expiry configuration in `apps/web/src/server/services/ai-actions.ts`, `apps/web/src/server/jobs/runtime.ts`, and `apps/web/src/server/jobs/register.ts` without yet scheduling model work.

**Checkpoint**: Schema, shared contracts, and durable scheduling primitives are ready. All user-story work may now begin in dependency order.

---

## Phase 3: User Story 1 - Define a recurring AI maintenance task (Priority: P1) 🎯

**Goal**: An Admin can create, validate, enable, and locate a scoped recurring job with its next occurrence shown in the selected time zone.

**Independent Test**: As an Admin, create an enabled “Find related pages” job with valid cron, IANA time zone, readable scope, and eligible owner; verify it appears in the Jobs list. Invalid name/cron/time zone/owner/scope keeps the definition inactive. A non-Admin receives no definition data.

### Tests for User Story 1

- [ ] T011 [P] [US1] Add Admin CRUD, duplicate-name, owner-eligibility, scope-validation, and next-run service tests in `apps/web/src/server/services/scheduled-ai-jobs.test.ts`.
- [ ] T012 [P] [US1] Add collection/member API authorization, validation, no-store, and error-envelope tests in `apps/web/app/api/ai/scheduled-jobs/route.test.ts` and `apps/web/app/api/ai/scheduled-jobs/[id]/route.test.ts`.
- [ ] T013 [P] [US1] Add initial definition-list/form rendering and field-error tests in `apps/web/src/components/admin/ai/ScheduledAiJobList.test.tsx` and `apps/web/src/components/admin/ai/ScheduledAiJobForm.test.tsx`.

### Implementation for User Story 1

- [ ] T014 [US1] Implement Admin-only definition create/read/list and active-owner/readable-scope validation in `apps/web/src/server/services/scheduled-ai-jobs.ts`.
- [ ] T015 [US1] Implement `GET`/`POST` collection and `GET` member handlers with shared schemas, audit metadata, no-store headers, and OpenAPI annotations in `apps/web/app/api/ai/scheduled-jobs/route.ts` and `apps/web/app/api/ai/scheduled-jobs/[id]/route.ts`.
- [ ] T016 [US1] Add the canonical Admin Jobs collection route and server-side `manage_ai` gate in `apps/web/app/(admin)/admin/ai/jobs/page.tsx`.
- [ ] T017 [US1] Implement URL-backed Jobs/Runs tabs plus the initial definition list, create form, cron/time-zone preview, owner/scope controls, and inline errors in `apps/web/src/components/admin/ai/ScheduledAiJobList.tsx` and `apps/web/src/components/admin/ai/ScheduledAiJobForm.tsx`.
- [ ] T018 [US1] Add the single AI navigation entry and localized definition/status/validation strings in `apps/web/src/components/layout/Navigator.tsx`, `apps/web/messages/en.json`, and `apps/web/messages/zh.json`.
- [ ] T019 [US1] Add the Admin create/invalid-input/list and non-Admin-denial journey in `apps/web/e2e/scheduled-ai-jobs.spec.ts`.

**Checkpoint**: Job definitions can be safely created and inspected without any model call or background execution.

---

## Phase 4: User Story 2 - Run recurring work through the shared Wiki AI capability (Priority: P1)

**Goal**: A due job executes asynchronously through the existing governed Wiki AI runtime under a live owner context and a hard target scope, without overlapping or replaying stale work.

**Independent Test**: Configure an eligible, scoped job and make it due. Confirm one durable run/action is claimed, the current owner/policy is rechecked, permitted tool work executes through the shared runtime, and disabled owner/model/tool/out-of-scope cases block safely.

### Tests for User Story 2

- [ ] T020 [P] [US2] Add regression tests for the extracted shared workflow covering interactive chat behavior, scheduled action identity, and no conversation capture for scheduled jobs in `apps/web/src/server/jobs/ai-question.test.ts` and `apps/web/src/server/services/scheduled-ai-execution.test.ts`.
- [ ] T021 [P] [US2] Add due-tick, occurrence-idempotency, active-slot, DST, stale-coalescing, and restart-recovery tests in `apps/web/src/server/services/scheduled-ai-jobs.test.ts` and `apps/web/src/server/jobs/scheduled-ai-jobs.test.ts`.
- [ ] T022 [P] [US2] Add executor-scope and current-owner permission/entitlement/model/tool gate tests in `apps/web/src/server/services/ai-tool-runtime.permissions.test.ts` and `apps/web/src/server/services/scheduled-ai-execution.test.ts`.

### Implementation for User Story 2

- [ ] T023 [US2] Extract the shared governed tool-workflow orchestration from `apps/web/src/server/jobs/ai-question.ts` into `apps/web/src/server/services/scheduled-ai-execution.ts`, preserving interactive Wiki AI behavior in a refactor-only commit.
- [ ] T024 [US2] Add typed scheduled execution input, live execution-owner resolution, current AI/provider/model/tool gate checks, and bounded safe run result/event handling in `apps/web/src/server/services/scheduled-ai-execution.ts` and `apps/web/src/server/services/scheduled-ai-jobs.ts`.
- [ ] T025 [US2] Pass `ScheduledToolExecutionScope` to the executor boundary and enforce it for tool reads/searches/lists and proposed write targets in `apps/web/src/server/services/ai-tool-runtime.ts` and `apps/web/src/server/services/ai-tool-executors.ts`.
- [ ] T026 [US2] Implement atomic due discovery, occurrence claim, active-run exclusion, stale-occurrence coalescing, enqueue, and boot recovery in `apps/web/src/server/services/scheduled-ai-jobs.ts`.
- [ ] T027 [US2] Register the one-minute tick and isolated scheduled-run worker, route `scheduled_ai_job` actions to it, and enter worker execution through `runWithoutDataCache` in `apps/web/src/server/jobs/runtime.ts`, `apps/web/src/server/jobs/register.ts`, and `apps/web/src/server/jobs/scheduled-ai-jobs.ts`.
- [ ] T028 [US2] Add due-run, blocked-owner/model/tool, out-of-scope redaction, no-overlap, and recovery coverage to `apps/web/e2e/scheduled-ai-jobs.spec.ts`.

**Checkpoint**: Scheduled work is durable, bounded, restart-safe, permission-scoped, and reuses the Wiki AI runtime without a privileged alternate path.

---

## Phase 5: User Story 3 - Review scheduled AI change proposals (Priority: P1)

**Goal**: Every scheduled durable suggestion is traceable to its job/run and remains a draft or proposal until an authorized reviewer acts.

**Independent Test**: Run a job that suggests page links, tags, a tag merge, and content edits. Confirm each is linked to the run but no durable state changes before the existing review/apply flow; conflicting/stale results remain governed.

### Tests for User Story 3

- [ ] T029 [P] [US3] Add scheduled-policy tests proving every mutation resolves to `admin_review`, including an Admin execution owner, in `apps/web/src/server/services/ai-tool-policy.test.ts` and `apps/web/src/server/services/scheduled-ai-execution.test.ts`.
- [ ] T030 [P] [US3] Add proposal/draft provenance, evidence-link, conflict, and no-direct-apply integration tests in `apps/web/src/server/services/ai-tool-proposals.test.ts`, `apps/web/src/server/services/ai-tool-evidence.test.ts`, and `apps/web/src/server/services/scheduled-ai-execution.test.ts`.

### Implementation for User Story 3

- [ ] T031 [US3] Add the scheduled-run execution-policy override that forces mutation calls to review while preserving normal read-tool policy in `apps/web/src/server/services/scheduled-ai-execution.ts` and `apps/web/src/server/services/ai-tool-policy.ts`.
- [ ] T032 [US3] Persist scheduled-run provenance for non-page proposals and page draft/revision metadata, and return bounded linked IDs/counts only, in `apps/web/src/server/services/ai-tool-proposals.ts`, `apps/web/src/server/services/ai-tool-executors.ts`, and `apps/web/src/server/services/scheduled-ai-jobs.ts`.
- [ ] T033 [US3] Expose safe proposal/draft/evidence links on the scheduled run detail while rechecking access in `apps/web/src/server/services/scheduled-ai-jobs.ts` and `apps/web/app/api/ai/scheduled-jobs/[id]/runs/[runId]/route.ts`.
- [ ] T034 [US3] Add an end-to-end scheduled-proposal review boundary—no direct tag/page/public mutation before approval and existing conflict handling after approval—in `apps/web/e2e/scheduled-ai-jobs.spec.ts`.

**Checkpoint**: Automation can prepare all requested maintenance outcomes, but review remains the only durable-change boundary.

---

## Phase 6: User Story 4 - Inspect, maintain, and control job definitions (Priority: P2)

**Goal**: An Admin can find a definition, edit its future behavior, pause/resume/retire or duplicate it, manually run it, and cancel active work without rewriting its history.

**Independent Test**: Filter a job, edit instruction/schedule/scope/owner, pause it, run it manually, cancel an active run, duplicate it, and retire it; prior run snapshots remain unchanged and no new run begins after pause/retirement.

### Tests for User Story 4

- [ ] T035 [P] [US4] Add definition-version, edit/recalculate, pause/resume, retire, duplicate, manual-run, active-run, and cancel service tests in `apps/web/src/server/services/scheduled-ai-jobs.test.ts`.
- [ ] T036 [P] [US4] Add mutation/action endpoint contract tests in `apps/web/app/api/ai/scheduled-jobs/[id]/route.test.ts`, `apps/web/app/api/ai/scheduled-jobs/[id]/duplicate/route.test.ts`, and `apps/web/app/api/ai/scheduled-jobs/[id]/runs/route.test.ts`.
- [ ] T037 [P] [US4] Add job-detail/control rendering and URL-restoration tests in `apps/web/src/components/admin/ai/ScheduledAiJobDetail.test.tsx` and `apps/web/src/components/admin/ai/ScheduledAiJobForm.test.tsx`.

### Implementation for User Story 4

- [ ] T038 [US4] Implement definition update/versioning, pause/resume, soft retirement, safe duplication, manual-run creation, and cancellation request service operations in `apps/web/src/server/services/scheduled-ai-jobs.ts`.
- [ ] T039 [US4] Implement `PATCH`/`DELETE`, duplicate, manual-run, and cancel handlers with shared schemas, audit metadata, no-store headers, and OpenAPI annotations in `apps/web/app/api/ai/scheduled-jobs/[id]/route.ts`, `apps/web/app/api/ai/scheduled-jobs/[id]/duplicate/route.ts`, `apps/web/app/api/ai/scheduled-jobs/[id]/runs/route.ts`, and `apps/web/app/api/ai/scheduled-jobs/[id]/runs/[runId]/cancel/route.ts`.
- [ ] T040 [US4] Add the canonical definition detail route with Admin gate, breadcrumb/back navigation, and server-loaded initial data in `apps/web/app/(admin)/admin/ai/jobs/[id]/page.tsx`.
- [ ] T041 [US4] Implement definition detail/form actions for edit, pause/resume, duplicate, run now, retire, and active-run cancellation using existing controls/dialogs in `apps/web/src/components/admin/ai/ScheduledAiJobDetail.tsx` and `apps/web/src/components/admin/ai/ScheduledAiJobForm.tsx`.
- [ ] T042 [US4] Add management-control labels, confirmation copy, and status/error translations in `apps/web/messages/en.json` and `apps/web/messages/zh.json`.
- [ ] T043 [US4] Add Admin edit/pause/manual-run/cancel/duplicate/retire and immutable-history browser coverage in `apps/web/e2e/scheduled-ai-jobs.spec.ts`.

**Checkpoint**: Administrators can operate recurring automation deliberately and correct future behavior without erasing or silently changing history.

---

## Phase 7: User Story 5 - Investigate each execution and its outcome (Priority: P2)

**Goal**: An Admin can inspect permanent per-job and cross-job histories, active progress, safe results/errors, definition snapshots, and permitted related resources.

**Independent Test**: Produce successful, blocked, failed, cancelled, skipped, and proposal-producing runs. Confirm every status is paginated/filterable, each detail retains its original snapshot and safe explanation, and inaccessible links/evidence stay redacted.

### Tests for User Story 5

- [ ] T044 [P] [US5] Add durable-history, status/trigger filtering, paging, action-cleanup survival, and read-time redaction service tests in `apps/web/src/server/services/scheduled-ai-jobs.test.ts`.
- [ ] T045 [P] [US5] Add per-job/cross-job/run-detail API response, pagination, redaction, and non-Admin denial tests in `apps/web/app/api/ai/scheduled-jobs/[id]/runs/route.test.ts`, `apps/web/app/api/ai/scheduled-jobs/[id]/runs/[runId]/route.test.ts`, and `apps/web/app/api/ai/scheduled-job-runs/route.test.ts`.
- [ ] T046 [P] [US5] Add active polling, terminal-stop, safe error, and related-link component tests in `apps/web/src/components/admin/ai/ScheduledAiJobRunList.test.tsx` and `apps/web/src/components/admin/ai/ScheduledAiJobRunDetail.test.tsx`.

### Implementation for User Story 5

- [ ] T047 [US5] Implement permanent per-job/cross-job run listing, detail projection, safe action/proposal/draft/evidence linking, pagination, and read-time redaction in `apps/web/src/server/services/scheduled-ai-jobs.ts`.
- [ ] T048 [US5] Implement per-job, cross-job, and member-run read routes with shared schemas, no-store headers, and OpenAPI annotations in `apps/web/app/api/ai/scheduled-jobs/[id]/runs/route.ts`, `apps/web/app/api/ai/scheduled-jobs/[id]/runs/[runId]/route.ts`, and `apps/web/app/api/ai/scheduled-job-runs/route.ts`.
- [ ] T049 [US5] Implement URL-backed cross-job/per-job run lists, status badges, TanStack Query polling, detail sections, and links to existing proposal/page review pages in `apps/web/src/components/admin/ai/ScheduledAiJobRunList.tsx` and `apps/web/src/components/admin/ai/ScheduledAiJobRunDetail.tsx`.
- [ ] T050 [US5] Add the canonical nested run-detail route with Admin access, breadcrumb, and back link in `apps/web/app/(admin)/admin/ai/jobs/[id]/runs/[runId]/page.tsx`.
- [ ] T051 [US5] Add successful/blocked/failed/cancelled/skipped history, filters/paging, active polling, and redacted-link browser coverage in `apps/web/e2e/scheduled-ai-jobs.spec.ts`.

**Checkpoint**: Every scheduled execution is observable and auditable without exposing sensitive or no-longer-permitted content.

---

## Phase 8: Polish & Cross-Cutting Concerns

**Purpose**: Validate generated contracts, accessibility, operational behavior, and the complete feature against project standards.

- [ ] T052 [P] Regenerate and verify REST OpenAPI output after all route annotations in `apps/web/public/openapi.json` and `apps/web/src/server/api/openapi-schemas.ts`.
- [ ] T053 [P] Validate matching English/Chinese catalogs and typed i18n keys for Scheduled AI Jobs in `apps/web/messages/en.json`, `apps/web/messages/zh.json`, and `apps/web/src/i18n/keys.ts`.
- [ ] T054 Add focused performance/operational tests for bounded tick work, queue expiry, no active-run overlap, and startup recovery in `apps/web/src/server/jobs/scheduled-ai-jobs.test.ts` and `apps/web/src/server/services/scheduled-ai-jobs.test.ts`.
- [ ] T055 Add security regression coverage for instruction injection, scope bypass, revoked owner, evidence/link redaction, forced review, and public-content non-change before approval in `apps/web/src/server/services/scheduled-ai-execution.test.ts` and `apps/web/e2e/scheduled-ai-jobs.spec.ts`.
- [ ] T056 Run generated-migration confirmation, focused/full tests, OpenAPI/i18n generation, lint, type-check, Docker Compose integration, and Playwright validation from `specs/030-scheduled-ai-jobs/quickstart.md`.
- [ ] T057 Update implementation-facing verification notes and final task outcomes in `specs/030-scheduled-ai-jobs/quickstart.md` and `specs/030-scheduled-ai-jobs/tasks.md` after all checks pass.

---

## Dependencies & Execution Order

### Phase Dependencies

- **Phase 1 (Setup)** has no dependencies.
- **Phase 2 (Foundational)** depends on Phase 1 and blocks every story: shared contracts, schema/migration, action routing, and lifecycle primitives must be in place.
- **US1 (Phase 3)** depends on Phase 2 and delivers safe job-definition CRUD.
- **US2 (Phase 4)** depends on Phase 2 and a definition created through US1; it must complete before recurring work can execute.
- **US3 (Phase 5)** depends on US2 because it constrains and links the runtime outputs. US2+US3 form the safe end-to-end scheduling MVP.
- **US4 (Phase 6)** depends on US1 and US2 for definition actions and manual/cancelled runs.
- **US5 (Phase 7)** depends on US2/US3 run/provenance records and can proceed in parallel with the latter half of US4 where files do not overlap.
- **Polish (Phase 8)** depends on all desired stories.

### User Story Dependencies

```text
Setup -> Foundational -> US1 (define jobs)
                              ├-> US2 (scheduled shared runtime) -> US3 (forced review/provenance)
                              └-> US4 (maintenance controls)
US2 + US3 -------------------> US5 (durable run history)
US3 + US4 + US5 -------------> Polish
```

### Parallel Opportunities

- T002 and T004/T007/T009 test work can run in parallel when their inputs exist.
- Within US1, T011–T013 can be authored in parallel; T016 and the component work T017 can proceed in parallel after service/API shapes stabilize.
- Within US2, T020–T022 are independent test tracks. Scope work T025 can proceed after the shared runtime contract from T023 is stable while tick/queue work advances through T026–T027.
- Within US3, T029 and T030 can run in parallel; within US4 and US5 the marked test/component tracks are parallel after their service contract is fixed.
- T052 and T053 are parallel final generation/validation tasks; T054 and T055 can run in parallel once runtime work is complete.

## Parallel Example: User Story 2

```text
Task: "Add shared-workflow regression tests in apps/web/src/server/jobs/ai-question.test.ts and apps/web/src/server/services/scheduled-ai-execution.test.ts"
Task: "Add due-tick/recovery tests in apps/web/src/server/services/scheduled-ai-jobs.test.ts and apps/web/src/server/jobs/scheduled-ai-jobs.test.ts"
Task: "Add executor-scope tests in apps/web/src/server/services/ai-tool-runtime.permissions.test.ts and apps/web/src/server/services/scheduled-ai-execution.test.ts"
```

## Implementation Strategy

### Configuration MVP (US1)

1. Complete Phases 1–2.
2. Complete US1 and verify Admin-only, validated, URL-restorable definition management.
3. This is a safe configuration increment but does not yet execute AI work.

### Functional Safe MVP (US1 + US2 + US3)

1. Complete the shared-runtime extraction as its own refactor commit (T023).
2. Complete the tick/run/scope execution path (US2).
3. Complete forced review/provenance (US3).
4. Verify a due job can prepare—but never apply or publish—page/tag/link changes.

### Incremental Delivery

1. Add US4 to make jobs operable: edit, pause, duplicate, manually run, cancel, retire.
2. Add US5 to make all outcomes discoverable, permanent, and redacted correctly.
3. Complete Phase 8 only after all selected stories pass focused and end-to-end checks.

## Notes

- `[P]` means separate files and no dependency on incomplete preceding work; it does not waive the phase dependency graph.
- The schema migration task must run `pnpm db:generate`; no task authorizes hand-written migration SQL.
- Scheduled execution and its runtime extraction must be committed separately from feature behavior, as required by the project commit policy.
- No task adds a public reader route, a new service dependency, automatic proposal apply, automatic publication, or an unregistered tool/external script.
