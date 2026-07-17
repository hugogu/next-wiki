# Tasks: First-Run Onboarding

**Input**: Design documents from `/specs/021-first-run-onboarding/`
**Prerequisites**: [plan.md](./plan.md), [spec.md](./spec.md), [research.md](./research.md), [data-model.md](./data-model.md), [contracts/](./contracts/), [quickstart.md](./quickstart.md)
**Tests**: Included because the plan and quickstart require unit/service/route coverage, Playwright onboarding flows, secret redaction, concurrency, idempotency, and public-content cache validation.
**Organization**: Tasks are grouped by user story to enable independent implementation and validation.

## Format: `[ID] [P?] [Story] Description`

- **[P]**: Can run in parallel after prerequisite tasks in the same phase are complete.
- **[Story]**: User story label from [spec.md](./spec.md).
- Every task includes the primary file path to edit or validate.

## Phase 1: Setup (Shared Infrastructure)

**Purpose**: Prepare shared setup contracts, fixture locations, and route/component scaffolding without changing runtime behavior.

- [ ] T001 Create shared first-run onboarding schemas, status enums, and response types in `packages/shared/src/setup.ts`
- [ ] T002 Export setup shared contracts from `packages/shared/src/index.ts`
- [ ] T003 [P] Add first-run onboarding fixture helpers scaffold for users, setup state, AI bootstrap, and sample pages in `apps/web/test/setup-onboarding-fixtures.ts`
- [ ] T004 [P] Add Playwright setup onboarding fixture notes and selectors inventory in `apps/web/e2e/setup-onboarding.spec.ts`
- [ ] T005 [P] Add setup component directory scaffold and barrel exports in `apps/web/src/components/setup/index.ts`

---

## Phase 2: Foundational (Blocking Prerequisites)

**Purpose**: Core setup progress persistence, route contracts, i18n surface, and server state helpers required by every user story.

**Critical**: No user story implementation starts until this phase is complete.

### Foundational tests

- [ ] T006 [P] Add setup progress schema tests for singleton constraints, status defaults, JSON result fields, and Admin/action references in `apps/web/src/server/db/setup-progress-schema.test.ts`
- [ ] T007 [P] Add setup state contract tests for anonymous, signed-in Admin, closed, and non-Admin callers in `apps/web/app/api/setup/setup-routes.test.ts`
- [ ] T008 [P] Add setup service state-machine tests for account, AI, sample-pages, summary, closed, and invalid transition handling in `apps/web/src/server/services/setup.test.ts`

### Foundational implementation

- [ ] T009 Add setup progress enums or literal columns to the Drizzle schema in `apps/web/src/server/db/schema/enums.ts`
- [ ] T010 Add the singleton `setup_progress` table and relations to `apps/web/src/server/db/schema/index.ts`
- [ ] T011 Generate the Drizzle migration and snapshot for setup progress in `apps/web/src/server/db/migrations/`
- [ ] T012 Extend test database reset/truncation for `setup_progress` in `apps/web/test/setup.ts` and `apps/web/test/prepare-e2e-db.mjs`
- [ ] T013 Implement setup progress read/write, transition, closed-state, and summary helpers in `apps/web/src/server/services/setup.ts`
- [ ] T014 Implement `GET /api/setup` with uncached setup state and safe anonymous detail shaping in `apps/web/app/api/setup/route.ts`
- [ ] T015 [P] Add setup i18n keys for steps, statuses, summaries, errors, and actions in `apps/web/src/i18n/keys.ts`
- [ ] T016 [P] Add English setup onboarding translations in `apps/web/src/i18n/locales/en.ts`
- [ ] T017 [P] Add Chinese setup onboarding translations in `apps/web/src/i18n/locales/zh.ts`
- [ ] T018 [P] Add setup API client hooks for reading state and mutating AI/sample-page choices in `apps/web/src/components/setup/useSetupOnboarding.ts`
- [ ] T019 Replace the single-form setup page shell with a server-rendered state handoff to onboarding UI in `apps/web/app/setup/page.tsx`

**Checkpoint**: Setup state can be read safely, persisted, translated, and resumed without yet changing account, AI, or sample-page behavior.

---

## Phase 3: User Story 1 - Create the First Admin Account (Priority: P1) MVP

**Goal**: A fresh deployment directs to `/setup`, creates exactly one initial Admin account, signs that Admin in, and closes public first-admin creation after an Admin exists.

**Independent Test**: Start with no users, open `/setup`, submit valid account details, verify Admin session and next step, then verify a second browser or direct setup-account submit cannot create another Admin.

### Tests for User Story 1

- [ ] T020 [P] [US1] Add first-admin setup service tests for success, duplicate email, invalid password, already-configured, and progress update in `apps/web/src/server/services/setup.test.ts`
- [ ] T021 [P] [US1] Add concurrent first-admin creation tests with parallel submissions and single Admin assertion in `apps/web/src/server/services/setup.test.ts`
- [ ] T022 [P] [US1] Add `/api/auth/setup` route tests for response shape, session cookie, forbidden-after-Admin, and setup progress update in `apps/web/app/api/auth/setup/setup-route.test.ts`
- [ ] T023 [P] [US1] Add Playwright coverage for first Admin creation, refresh resume, and second-browser denial in `apps/web/e2e/setup-onboarding.spec.ts`

### Implementation for User Story 1

- [ ] T024 [US1] Make `setupAdmin` atomic with setup progress creation/update and duplicate-Admin protection in `apps/web/src/server/services/setup.ts`
- [ ] T025 [US1] Update `/api/auth/setup` to return `nextStep: "ai"` and preserve existing error mapping in `apps/web/app/api/auth/setup/route.ts`
- [ ] T026 [US1] Refactor `SetupForm` into an account-step component that advances through setup state instead of redirecting immediately in `apps/web/src/components/auth/SetupForm.tsx`
- [ ] T027 [US1] Implement the first-run onboarding shell with account-step rendering and closed-state handling in `apps/web/src/components/setup/FirstRunOnboarding.tsx`
- [ ] T028 [US1] Ensure normal registration and first-admin safety net still share `hasAnyAdmin` semantics in `apps/web/src/server/services/auth.ts`
- [ ] T029 [US1] Update setup page metadata and copy to reflect first-run onboarding rather than only account creation in `apps/web/app/setup/page.tsx`

**Checkpoint**: US1 is independently functional as the MVP first-run setup path.

---

## Phase 4: User Story 2 - Optionally Configure OpenRouter AI Bootstrap (Priority: P1)

**Goal**: The initial Admin can skip AI with no outbound calls or provide OpenRouter credentials to validate, detect compatible models, assign available purposes, and receive a clear per-purpose result.

**Independent Test**: Complete setup once with AI skipped and once with fixture-backed valid OpenRouter credentials; verify skipped mode performs no AI calls, configured mode sets up compatible `wiki_text`, `wiki_embedding`, and `wiki_image` assignments where proven, and failures are retryable without losing the Admin account.

### Tests for User Story 2

- [ ] T030 [P] [US2] Add skip-mode service tests proving no provider, detector, embedding, chat, or image calls occur in `apps/web/src/server/services/setup-ai.test.ts`
- [ ] T031 [P] [US2] Add OpenRouter bootstrap service tests for valid credentials, provider reuse, model sync, per-purpose assignments, and partial missing capability results in `apps/web/src/server/services/setup-ai.test.ts`
- [ ] T032 [P] [US2] Add OpenRouter failure tests for invalid key, rate limit, timeout, global AI disabled, retry, and secret redaction in `apps/web/src/server/services/setup-ai.test.ts`
- [ ] T033 [P] [US2] Add `/api/setup/ai-bootstrap` route contract tests for skip, configure, queued, completed, partial, and safe error responses in `apps/web/app/api/setup/ai-bootstrap/setup-ai-bootstrap-route.test.ts`
- [ ] T034 [P] [US2] Add Playwright coverage for skip-AI, valid OpenRouter, failed OpenRouter retry, and manual-setup summary links in `apps/web/e2e/setup-onboarding.spec.ts`

### Implementation for User Story 2

- [ ] T035 [US2] Add setup AI bootstrap request and response schemas to `packages/shared/src/setup.ts`
- [ ] T036 [US2] Implement OpenRouter skip, credential validation, bootstrap orchestration, action/result tracking, and purpose summary logic in `apps/web/src/server/services/setup-ai.ts`
- [ ] T037 [US2] Reuse AI admin settings/provider/model sync/assignment services for OpenRouter bootstrap in `apps/web/src/server/services/setup-ai.ts`
- [ ] T038 [US2] Ensure OpenRouter bootstrap stores no plaintext credentials in setup progress, logs, action metadata, or API responses in `apps/web/src/server/services/setup-ai.ts`
- [ ] T039 [US2] Implement `PUT /api/setup/ai-bootstrap` with Admin-only setup access, uncached responses, and normalized provider errors in `apps/web/app/api/setup/ai-bootstrap/route.ts`
- [ ] T040 [US2] Implement the OpenRouter bootstrap step UI with key input, skip, retry, progress, partial results, and Admin AI settings links in `apps/web/src/components/setup/OpenRouterBootstrapStep.tsx`
- [ ] T041 [US2] Wire AI bootstrap mutation and polling state into the onboarding shell in `apps/web/src/components/setup/FirstRunOnboarding.tsx`
- [ ] T042 [US2] Add per-purpose setup result rendering for `wiki_text`, `wiki_embedding`, and `wiki_image` in `apps/web/src/components/setup/SetupSummary.tsx`

**Checkpoint**: US2 is independently testable after US1 by completing or skipping AI and reaching a clear AI setup result.

---

## Phase 5: User Story 3 - Choose Example and Help Pages (Priority: P2)

**Goal**: The initial Admin can generate or decline optional sample/help pages; generated pages are normal published Markdown pages, idempotent, linked from welcome, and safe around path collisions.

**Independent Test**: Complete onboarding with examples enabled and verify `welcome`, `help/markdown-syntax`, and `help/main-features` render through normal wiki navigation; complete onboarding with examples skipped and verify optional help pages are absent; rerun generation and verify no duplicates or silent overwrites.

### Tests for User Story 3

- [ ] T043 [P] [US3] Add sample page definition tests for canonical paths, Markdown feature coverage, welcome links, and feature overview coverage in `apps/web/src/server/services/setup-sample-pages.test.ts`
- [ ] T044 [P] [US3] Add sample page writer tests for create, welcome enrich/update, skip, idempotent retry, collision, author attribution, and published revision history in `apps/web/src/server/services/setup-sample-pages.test.ts`
- [ ] T045 [P] [US3] Add public cache invalidation tests for generated or updated sample pages in `apps/web/src/server/services/setup-sample-pages.test.ts`
- [ ] T046 [P] [US3] Add `/api/setup/sample-pages` route tests for generate, skip, partial collision, and forbidden caller responses in `apps/web/app/api/setup/sample-pages/setup-sample-pages-route.test.ts`
- [ ] T047 [P] [US3] Add Playwright coverage for generate examples, decline examples, anonymous page reads, navigation links, and path collision summary in `apps/web/e2e/setup-onboarding.spec.ts`

### Implementation for User Story 3

- [ ] T048 [US3] Add sample page request/response and per-page result schemas to `packages/shared/src/setup.ts`
- [ ] T049 [P] [US3] Define canonical welcome, Markdown syntax, and main features Markdown content in `apps/web/src/server/services/setup-sample-page-definitions.ts`
- [ ] T050 [US3] Implement idempotent sample/help page creation, welcome enrichment, collision detection, and published revision writes in `apps/web/src/server/services/setup-sample-pages.ts`
- [ ] T051 [US3] Reuse sample page definitions from demo seed without forcing production sample data in `apps/web/src/server/seed/index.ts`
- [ ] T052 [US3] Invalidate public content and navigation caches after sample page create/update operations in `apps/web/src/server/services/setup-sample-pages.ts`
- [ ] T053 [US3] Implement `PUT /api/setup/sample-pages` with Admin-only setup access and partial result responses in `apps/web/app/api/setup/sample-pages/route.ts`
- [ ] T054 [US3] Implement the sample pages step UI with generate, skip, per-page result, collision, and generated-page links in `apps/web/src/components/setup/SamplePagesStep.tsx`
- [ ] T055 [US3] Render sample-page choices and generated page links in the onboarding summary in `apps/web/src/components/setup/SetupSummary.tsx`
- [ ] T056 [US3] Wire sample-page mutation and step advancement into the onboarding shell in `apps/web/src/components/setup/FirstRunOnboarding.tsx`

**Checkpoint**: US3 is independently testable after US1 by generating or declining examples and verifying normal published wiki behavior.

---

## Phase 6: User Story 4 - Resume and Diagnose Interrupted Setup (Priority: P2)

**Goal**: Refreshes, retries, interrupted OpenRouter verification, partial sample generation, and setup completion always resume to a safe next action with an accurate final summary.

**Independent Test**: Refresh during each onboarding step, retry interrupted AI and sample-page operations, submit completed steps again, and verify no duplicated users/providers/pages plus safe summaries and links.

### Tests for User Story 4

- [ ] T057 [P] [US4] Add resume-state tests for refresh after account, queued AI, failed AI, completed AI, partial samples, skipped samples, summary, and closed setup in `apps/web/src/server/services/setup.test.ts`
- [ ] T058 [P] [US4] Add duplicate side-effect tests for repeated AI configure, repeated AI skip, repeated sample generation, and repeated sample skip in `apps/web/src/server/services/setup.test.ts`
- [ ] T059 [P] [US4] Add setup summary route tests for safe details, no credentials, remaining manual actions, and closed state in `apps/web/app/api/setup/setup-routes.test.ts`
- [ ] T060 [P] [US4] Add Playwright coverage for refresh/retry on every setup step and final summary navigation in `apps/web/e2e/setup-onboarding.spec.ts`

### Implementation for User Story 4

- [ ] T061 [US4] Implement resume-state derivation from setup progress, AI actions, providers, assignments, and sample page results in `apps/web/src/server/services/setup.ts`
- [ ] T062 [US4] Implement idempotent repeated-step handling for AI and sample-page choices in `apps/web/src/server/services/setup.ts`
- [ ] T063 [US4] Implement setup completion/closed transition and normal-route handoff behavior in `apps/web/src/server/services/setup.ts`
- [ ] T064 [US4] Add summary-safe shaping for AI results, sample page results, manual action links, and missing setup items in `apps/web/src/server/services/setup.ts`
- [ ] T065 [US4] Render queued/running/failed/partial/completed statuses consistently across setup steps in `apps/web/src/components/setup/FirstRunOnboarding.tsx`
- [ ] T066 [US4] Complete the final summary UI with wiki home, Admin AI settings, and generated page links in `apps/web/src/components/setup/SetupSummary.tsx`
- [ ] T067 [US4] Ensure `/setup` redirects or closes correctly once onboarding is complete in `apps/web/app/setup/page.tsx`

**Checkpoint**: Setup recovery and final summary work across interrupted and repeated operations without duplicate side effects.

---

## Phase 7: Polish & Cross-Cutting Concerns

**Purpose**: Finish validation, generated API artifacts, documentation consistency, and full quickstart checks.

- [ ] T068 [P] Update OpenAPI annotations or generated schema coverage for setup routes in `apps/web/app/api/setup/route.ts`
- [ ] T069 [P] Update OpenAPI annotations or generated schema coverage for setup AI and sample-page routes in `apps/web/app/api/setup/ai-bootstrap/route.ts` and `apps/web/app/api/setup/sample-pages/route.ts`
- [ ] T070 [P] Update setup route documentation and onboarding behavior notes in `apps/web/README.md`
- [ ] T071 Run Drizzle generate a second time to confirm no pending schema drift and record result in `specs/021-first-run-onboarding/quickstart.md`
- [ ] T072 Run setup-focused Vitest suites and fix regressions in `apps/web/src/server/services/setup.ts`
- [ ] T073 Run setup onboarding Playwright coverage and fix regressions in `apps/web/e2e/setup-onboarding.spec.ts`
- [ ] T074 Run i18n validation and fix missing setup translations in `apps/web/src/i18n/keys.ts`
- [ ] T075 Run lint and typecheck, fixing final setup-related issues in `packages/shared/src/setup.ts`
- [ ] T076 Validate public-content static/ISR behavior and cache invalidation for generated sample pages in `specs/021-first-run-onboarding/quickstart.md`
- [ ] T077 Run the full quickstart validation checklist and record verification notes in `specs/021-first-run-onboarding/quickstart.md`

---

## Dependencies & Execution Order

### Phase Dependencies

- **Phase 1 Setup**: No dependencies.
- **Phase 2 Foundational**: Depends on Phase 1 and blocks all user stories.
- **Phase 3 US1**: Depends on Phase 2; MVP first-run Admin setup.
- **Phase 4 US2**: Depends on Phase 2 and needs an Admin from US1 for full UI validation; service/route tests can use fixtures.
- **Phase 5 US3**: Depends on Phase 2 and needs an Admin from US1 for full page authorship validation; service/route tests can use fixtures.
- **Phase 6 US4**: Depends on Phases 3-5 because it verifies recovery across account, AI, and sample-page steps.
- **Phase 7 Polish**: Depends on all selected user stories.

### User Story Dependencies

- **US1 (P1)**: First MVP after foundation; required for real onboarding.
- **US2 (P1)**: Can be implemented after foundation with test fixtures, but full flow depends on US1.
- **US3 (P2)**: Can be implemented after foundation with test fixtures, but full flow depends on US1.
- **US4 (P2)**: Depends on US1-US3 behavior to verify resume and duplicate-side-effect safety.

### Within Each User Story

- Tests first; verify they fail before implementation.
- Shared schemas before services.
- Services before route handlers.
- Route handlers before UI integration.
- UI integration before Playwright completion.
- Story checkpoint validation before moving to the next priority.

## Parallel Opportunities

- T003, T004, and T005 can run in parallel after T001/T002 contract direction is clear.
- T006, T007, and T008 can run in parallel before foundational implementation.
- T015, T016, T017, and T018 can run in parallel after shared setup schema naming stabilizes.
- US1 tests T020-T023 can run in parallel.
- US2 tests T030-T034 can run in parallel.
- US3 tests T043-T047 can run in parallel.
- US4 tests T057-T060 can run in parallel.
- US2 and US3 implementation can proceed in parallel after Phase 2 if both use the stable setup progress service and separate files.

## Parallel Example: User Story 2

```bash
Task: "T030 [US2] Add skip-mode service tests in apps/web/src/server/services/setup-ai.test.ts"
Task: "T033 [US2] Add /api/setup/ai-bootstrap route contract tests in apps/web/app/api/setup/ai-bootstrap/setup-ai-bootstrap-route.test.ts"
Task: "T034 [US2] Add Playwright OpenRouter bootstrap coverage in apps/web/e2e/setup-onboarding.spec.ts"
```

## Parallel Example: User Story 3

```bash
Task: "T043 [US3] Add sample page definition tests in apps/web/src/server/services/setup-sample-pages.test.ts"
Task: "T046 [US3] Add /api/setup/sample-pages route tests in apps/web/app/api/setup/sample-pages/setup-sample-pages-route.test.ts"
Task: "T047 [US3] Add Playwright sample-page coverage in apps/web/e2e/setup-onboarding.spec.ts"
```

## Implementation Strategy

### MVP First (US1)

1. Complete Phase 1 setup.
2. Complete Phase 2 foundation.
3. Complete Phase 3 first Admin account flow.
4. Stop and validate US1 independently with service, route, and Playwright tests.

### Incremental Delivery

1. Foundation: shared setup schemas, singleton progress state, setup state route, i18n, setup shell.
2. US1: create the first Admin and close first-admin creation.
3. US2: add optional OpenRouter bootstrap or skip path.
4. US3: add optional sample/help page generation or skip path.
5. US4: harden resume, retry, duplicate-side-effect, and final summary behavior.
6. Polish: OpenAPI, docs, i18n validation, lint/typecheck, quickstart verification.

### Commit Guidance

- Commit Phase 1 + Phase 2 as a foundation commit only if migration generation and schema tests are coherent.
- Prefer one commit per user story after its checkpoint passes.
- Keep schema/migration work separate from UI-only changes when practical.
- Do not hand-author Drizzle migration metadata; use `pnpm db:generate`.

## Notes

- API responses for setup are not cached.
- No task should add a new default deployment dependency or required AI provider.
- Skip-AI mode must make no outbound model, detector, embedding, chat, or image-generation calls.
- OpenRouter credentials are write-only, encrypted, and redacted from logs, setup progress, action metadata, and API responses.
- Generated sample pages are normal published Markdown pages with immutable revisions.
- Public page body and navigation cache invalidation is required when sample pages are created or updated.
