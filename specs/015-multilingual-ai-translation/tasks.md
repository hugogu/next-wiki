# Tasks: AI Page Translation

**Input**: Design documents from `/specs/015-multilingual-ai-translation/`

**Prerequisites**: [plan.md](./plan.md), [spec.md](./spec.md), [research.md](./research.md), [data-model.md](./data-model.md), [contracts/](./contracts/), [quickstart.md](./quickstart.md)

**Tests**: Required. The specification's acceptance scenarios, measurable success criteria, constitution compliance rules, and quickstart explicitly require focused unit/integration, contract, and end-to-end coverage.

**Organization**: Tasks are grouped by user story. Foundational work establishes the durable translation data, permission, schema, and worker boundaries used by every story.

## Phase 1: Setup

**Purpose**: Add reusable translation test fixtures and establish the feature's module seams.

- [ ] T001 [P] Create reusable source-page, provider-stream, and translated-page fixture builders in `apps/web/test/translation-fixtures.ts`
- [ ] T002 [P] Add shared translation test factories and Zod test helpers in `packages/shared/src/translations.test.ts`
- [ ] T003 Create translation module barrel exports in `apps/web/src/server/services/translations/index.ts` and `apps/web/src/components/admin/translations/index.ts`

---

## Phase 2: Foundational

**Purpose**: Build the durable model, authorization, shared schemas, and explicitly registered worker foundation required before reader or administrator flows.

**⚠️ CRITICAL**: Complete this phase before implementing user stories.

- [X] T004 [P] Add translation run/item/state, language, and prompt enums to `apps/web/src/server/db/schema/enums.ts`
- [X] T005 Add translation-group page linkage, target-language, prompt, run, item, provenance, and freshness tables/indexes to `apps/web/src/server/db/schema/index.ts`
- [X] T006 Generate and review the Drizzle migration for translation schema changes in `apps/web/src/server/db/migrations/`
- [X] T007 [P] Add shared Zod request/response schemas and exported views for languages, prompts, runs, items, documents, and usage in `packages/shared/src/translations.ts` and `packages/shared/src/index.ts`
- [X] T008 [P] Add `manage_translations` action/resource and administrator/API-key denial coverage in `apps/web/src/server/permissions/index.ts` and `apps/web/src/server/permissions/translation-permissions.test.ts`
- [X] T009 Add the explicit long-running translation queue, expiry policy, and queue test in `apps/web/src/server/jobs/runtime.ts` and `apps/web/src/server/jobs/runtime.test.ts`
- [X] T010 Create the translation service lifecycle/query boundary and explicit job registration/recovery hooks in `apps/web/src/server/services/translations.ts` and `apps/web/src/server/jobs/register.ts`
- [ ] T011 Add migration, uniqueness, source/translation linkage, and permission regression tests in `apps/web/src/server/db/translation-schema.test.ts`
- [X] T012 Add localized shared translation status/error keys in `apps/web/src/i18n/locales/en.ts` and `apps/web/src/i18n/locales/zh.ts`

**Checkpoint**: Durable schema, permission boundary, shared contracts, and queue registration are ready; user-story work may proceed.

---

## Phase 3: User Story 1 — Read an original page or its translation (Priority: P1) 🎯 MVP

**Goal**: Readers can use stable unprefixed source URLs and language-prefixed translated URLs without UI-locale redirects or cache/permission leaks.

**Independent Test**: Seed an original and a published translated revision, then verify `/docs/a` shows the original and `/zh/docs/a` shows only the mapped translation after refresh, while unavailable/unauthorized paths reveal nothing sensitive.

- [ ] T013 [P] [US1] Add source-versus-translation resolver and independent authorization tests in `apps/web/src/server/services/pages.translation.test.ts`
- [ ] T014 [P] [US1] Add reader route, canonical metadata, unavailable-state, and no-leak Playwright coverage in `apps/web/e2e/translation-reader.spec.ts`
- [ ] T015 [US1] Implement source and language-qualified live-page resolution with translation-group validation in `apps/web/src/server/services/pages.ts`
- [ ] T016 [US1] Extend page URL builders for language-prefixed canonical links while preserving source URLs in `apps/web/src/lib/path.ts`
- [ ] T017 [US1] Add language-prefixed public reader routes and localized unavailable/in-progress presentation in `apps/web/app/(public)/[language]/page.tsx` and `apps/web/app/(public)/[language]/[...path]/page.tsx`
- [ ] T018 [US1] Update original reader metadata, translation metadata, alternate-language links, and canonical URL generation in `apps/web/app/(public)/[...path]/page.tsx` and `apps/web/app/(public)/[language]/[...path]/page.tsx`
- [ ] T019 [US1] Add published revision read caching with locale/revision cache tags and permission-safe invalidation hooks in `apps/web/src/server/services/pages.ts` and `apps/web/src/server/cache/page-content.ts`
- [ ] T020 [P] [US1] Make same-language translated internal links resolve to current translations with original fallback in `apps/web/src/server/pipeline/translation-links.ts` and `apps/web/src/server/pipeline/index.ts`
- [ ] T021 [US1] Update sitemap and page-list discovery to apply the explicit translation publication policy in `apps/web/app/sitemap.ts` and `apps/web/src/server/services/pages.ts`
- [ ] T022 [US1] Extend public-page resource lookup with explicit source/locale semantics in `apps/web/src/server/services/public-content.ts` and `apps/web/app/api/v1/pages/route.ts`

**Checkpoint**: Source and translation reader URLs are independently usable with correct canonical identity, access checks, and rendered revision cache behavior.

---

## Phase 4: User Story 2 — Configure a translation language and style (Priority: P1)

**Goal**: Administrators can enable target languages, version translation styles, choose compatible models, and see frozen configuration inputs.

**Independent Test**: Add `zh`, create a style, select an available text model, verify validation failures for disabled/incompatible inputs, and read back the saved language/style metadata.

- [ ] T023 [P] [US2] Add language and immutable prompt-version service/API contract tests in `apps/web/src/server/services/translations-config.test.ts` and `apps/web/app/api/translations/translations-config-routes.test.ts`
- [ ] T024 [P] [US2] Add administrator language/style/model selection Playwright coverage in `apps/web/e2e/translation-admin-config.spec.ts`
- [ ] T025 [US2] Implement target-language lifecycle and immutable prompt-template/version services in `apps/web/src/server/services/translation-config.ts`
- [ ] T026 [US2] Implement configured-text-model capability/availability validation and frozen input snapshots in `apps/web/src/server/services/translations.ts`
- [ ] T027 [US2] Implement language and prompt REST endpoints with OpenAPI annotations in `apps/web/app/api/translations/languages/route.ts`, `apps/web/app/api/translations/languages/[code]/route.ts`, `apps/web/app/api/translations/prompts/route.ts`, and `apps/web/app/api/translations/prompts/[id]/route.ts`
- [ ] T028 [US2] Build the admin translation configuration page using existing admin layout/UI primitives in `apps/web/app/(admin)/admin/translations/page.tsx` and `apps/web/src/components/admin/translations/TranslationSettingsPanel.tsx`
- [ ] T029 [US2] Build target-language management and prompt-version forms in `apps/web/src/components/admin/translations/TranslationLanguageManager.tsx` and `apps/web/src/components/admin/translations/TranslationPromptManager.tsx`
- [ ] T030 [US2] Register translation route schemas in generated OpenAPI inputs and regenerate `apps/web/public/openapi.json` via `apps/web/openapi-gen.config.ts`

**Checkpoint**: An administrator can configure a valid language/style/model combination; all later runs can reference immutable inputs.

---

## Phase 5: User Story 3 — Translate all pages one language at a time (Priority: P1)

**Goal**: Administrators can queue one-language bulk translation and monitor durable per-page progress while generated output becomes normal published translated revisions.

**Independent Test**: Start an all-published run for a seeded language, leave the browser, return to its detail URL, and verify completed/skipped/failed page outcomes and a readable translated page.

- [ ] T031 [P] [US3] Add run creation, active-language exclusion, item claim, and durable counter tests in `apps/web/src/server/services/translations-runs.test.ts`
- [ ] T032 [P] [US3] Add provider-stream, Markdown-validation, render/write, and page-level failure continuation tests in `apps/web/src/server/jobs/translation.test.ts`
- [ ] T033 [P] [US3] Add run creation/detail/item REST contract tests in `apps/web/app/api/translations/runs/translation-runs-routes.test.ts`
- [ ] T034 [P] [US3] Add bulk-run creation/progress/detail Playwright coverage in `apps/web/e2e/translation-runs.spec.ts`
- [ ] T035 [US3] Implement run creation, source eligibility snapshotting, active-language lock, and list/detail/item query services in `apps/web/src/server/services/translations.ts`
- [ ] T036 [US3] Implement encrypted/sanitized translation prompt assembly and Markdown-only generation rules in `apps/web/src/server/ai/prompts/translation.ts`
- [ ] T037 [US3] Implement normal page/revision write, metadata/assets/replication, provenance, and freshness-state updates for accepted translation output in `apps/web/src/server/services/translation-writer.ts`
- [ ] T038 [US3] Implement dedicated per-item translation worker with provider streaming, retry/backoff, usage provenance, and compare-before-publish checks in `apps/web/src/server/jobs/translation.ts`
- [ ] T039 [US3] Register the translation worker and boot recovery in `apps/web/src/server/jobs/register.ts` and `apps/web/src/server/jobs/runtime.ts`
- [ ] T040 [US3] Implement run creation/list and detail/item REST handlers in `apps/web/app/api/translations/runs/route.ts`, `apps/web/app/api/translations/runs/[id]/route.ts`, and `apps/web/app/api/translations/runs/[id]/items/route.ts`
- [ ] T041 [US3] Build run creation controls and status summary in `apps/web/src/components/admin/translations/TranslationRunCreateForm.tsx` and `apps/web/src/components/admin/translations/TranslationRunList.tsx`
- [ ] T042 [US3] Build deep-linkable run detail, per-item table, outcomes, and sanitized error views in `apps/web/app/(admin)/admin/translations/[id]/page.tsx` and `apps/web/src/components/admin/translations/TranslationRunDetail.tsx`

**Checkpoint**: A one-language bulk run survives navigation, processes independent page outcomes, and produces normal versioned/rendered translations.

---

## Phase 6: User Story 4 — Control, resume, and replace translation work (Priority: P1)

**Goal**: Administrators can pause/cancel, resume only unfinished work, and start traceable replacement runs with different model/style inputs.

**Independent Test**: Pause after partial completion, resume without regenerating current pages, then create a replacement using another model/style and verify old/new provenance histories.

- [ ] T043 [P] [US4] Add pause/cancel/resume/retry state-transition and concurrent-control tests in `apps/web/src/server/services/translations-controls.test.ts`
- [ ] T044 [P] [US4] Add worker polling, in-flight terminal outcome, stale-running reclaim, and restart recovery tests in `apps/web/src/server/jobs/translation-controls.test.ts`
- [ ] T045 [P] [US4] Add control endpoint contract tests in `apps/web/app/api/translations/runs/translation-controls-routes.test.ts`
- [ ] T046 [P] [US4] Add pause/resume/replacement Playwright coverage in `apps/web/e2e/translation-run-controls.spec.ts`
- [ ] T047 [US4] Implement cooperative pause/cancel flags, legal transition validation, and same-run resume services in `apps/web/src/server/services/translations.ts`
- [ ] T048 [US4] Implement successor retry/replacement creation with selected model/prompt snapshots and immutable predecessor linkage in `apps/web/src/server/services/translations.ts`
- [ ] T049 [US4] Add pause/cancel polling, terminal state finalization, and stale-running recovery paths in `apps/web/src/server/jobs/translation.ts`
- [ ] T050 [US4] Implement pause, resume, cancellation, and retry REST subresources in `apps/web/app/api/translations/runs/[id]/pause/route.ts`, `apps/web/app/api/translations/runs/[id]/resume/route.ts`, `apps/web/app/api/translations/runs/[id]/cancellation/route.ts`, and `apps/web/app/api/translations/runs/[id]/retries/route.ts`
- [ ] T051 [US4] Add run control buttons, replacement input picker, and conflict feedback in `apps/web/src/components/admin/translations/TranslationRunControls.tsx` and `apps/web/src/components/admin/translations/TranslationRunDetail.tsx`
- [ ] T052 [US4] Show translated revision provenance/history with source, model, prompt, and predecessor links in `apps/web/src/components/admin/translations/TranslationVersionHistory.tsx` and `apps/web/app/api/translations/documents/[id]/versions/route.ts`

**Checkpoint**: Controls are durable and conflict-safe; resume and replacement preserve completed output and complete historical traceability.

---

## Phase 7: User Story 5 — Keep translations current and analyze their cost (Priority: P2)

**Goal**: Source publication automatically coalesces refresh work, never publishes stale output, and exposes durable usage/duration analysis.

**Independent Test**: Publish two source updates before a refresh completes; verify only the latest revision becomes current and that its run/item analytics reports model, prompt, duration, and token provenance.

- [ ] T053 [P] [US5] Add source-publication refresh/coalescing and stale-result suppression tests in `apps/web/src/server/services/translations-refresh.test.ts`
- [ ] T054 [P] [US5] Add usage aggregation/provenance and analytics endpoint tests in `apps/web/src/server/services/translations-usage.test.ts` and `apps/web/app/api/translations/usage/route.test.ts`
- [ ] T055 [P] [US5] Add automatic-refresh/cache-invalidation Playwright coverage in `apps/web/e2e/translation-refresh.spec.ts`
- [ ] T056 [US5] Implement source publish hooks that invalidate translation state and upsert latest-language refresh work without translated-page loops in `apps/web/src/server/services/revisions.ts` and `apps/web/src/server/services/translations.ts`
- [ ] T057 [US5] Reconcile translated state and cache tags on source path change, deletion, and visibility changes in `apps/web/src/server/services/pages.ts` and `apps/web/src/server/services/translations.ts`
- [ ] T058 [US5] Implement item/run duration and reported/estimated/unavailable usage aggregation in `apps/web/src/server/services/translations.ts`
- [ ] T059 [US5] Implement translation document, version, and usage query endpoints in `apps/web/app/api/translations/documents/route.ts`, `apps/web/app/api/translations/documents/[id]/versions/route.ts`, and `apps/web/app/api/translations/usage/route.ts`
- [ ] T060 [US5] Build translation document freshness and usage analytics panels in `apps/web/src/components/admin/translations/TranslationDocumentList.tsx` and `apps/web/src/components/admin/translations/TranslationUsagePanel.tsx`
- [ ] T061 [US5] Add source/translation cache-tag invalidation and visible-content cache regression tests in `apps/web/src/server/cache/page-content.test.ts`

**Checkpoint**: Published source changes refresh only the latest translation, stale output cannot become current, and administrators can analyze durable usage/time outcomes.

---

## Phase 8: Polish & Cross-Cutting Concerns

**Purpose**: Complete contract, accessibility, safety, performance, and operational verification across all stories.

- [ ] T062 [P] Regenerate and verify translation OpenAPI output in `apps/web/public/openapi.json` and `apps/web/openapi-gen.config.ts`
- [ ] T063 [P] Add i18n completeness, keyboard/accessibility, and empty/error-state tests in `apps/web/src/components/admin/translations/TranslationRunDetail.test.tsx` and `apps/web/src/i18n/locales/translation-locales.test.ts`
- [ ] T064 [P] Add provider credential/prompt/redaction and unsafe/generated-Markdown security regression coverage in `apps/web/src/server/ai/translation-privacy.test.ts` and `apps/web/src/server/jobs/translation.test.ts`
- [ ] T065 [P] Add original/translation public API, sitemap, and permission equivalence regression tests in `apps/web/e2e/translation-public-equivalence.spec.ts`
- [ ] T066 Document translation operations, recovery, and cache/usage troubleshooting in `docs/operations/ai-page-translation.md`
- [ ] T067 Run the full quickstart validation matrix and record results in `specs/015-multilingual-ai-translation/quickstart.md`
- [ ] T068 Run `pnpm typecheck`, `pnpm lint`, `pnpm test`, `pnpm --filter @next-wiki/web test:e2e`, and `git diff --check` from `package.json`

---

## Dependencies & Execution Order

### Phase Dependencies

- **Setup (Phase 1)**: Start immediately.
- **Foundational (Phase 2)**: Depends on setup; blocks all user stories.
- **US1 (Phase 3)**: Depends on foundation; provides canonical reader routing using seeded translated revisions.
- **US2 (Phase 4)**: Depends on foundation; supplies persisted language/prompt/model configuration for generation.
- **US3 (Phase 5)**: Depends on US1 reader/write integration and US2 frozen configuration; delivers initial bulk generation.
- **US4 (Phase 6)**: Depends on US3 durable runs/items.
- **US5 (Phase 7)**: Depends on US3 writer/run lifecycle and US1 cache tags; it may proceed in parallel with late US4 UI work after those dependencies land.
- **Polish (Phase 8)**: Depends on all desired stories.

### User Story Dependencies

```text
Foundation ──► US1 (reader URLs/cache)
Foundation ──► US2 (languages/styles)
US1 + US2 ──► US3 (bulk generation)
US3 ──► US4 (pause/resume/replacement)
US1 + US3 ──► US5 (refresh/analytics)
```

### Parallel Opportunities

- T004/T007/T008/T009 and T011/T012 affect independent schema, shared, permission, queue, test, and locale surfaces after their immediate prerequisites.
- In each user story, the listed `[P]` test tasks can be authored in parallel before the dependent implementation tasks.
- US1 and US2 can proceed in parallel after Phase 2; US5 service work can begin once US3's run/writer interfaces are stable, while US4's controls are completed.

## Parallel Example: User Story 3

```text
Task: "Add bulk run service tests in apps/web/src/server/services/translations-runs.test.ts"
Task: "Add worker tests in apps/web/src/server/jobs/translation.test.ts"
Task: "Add REST contract tests in apps/web/app/api/translations/runs/translation-runs-routes.test.ts"
Task: "Add Playwright coverage in apps/web/e2e/translation-runs.spec.ts"
```

## Implementation Strategy

### MVP First

1. Complete setup and foundation.
2. Complete US1 using seeded source/translation revisions to prove canonical routing, access checks, and reader cache behavior.
3. Complete US2 configuration, then US3 bulk generation to make that reader increment self-serve.
4. Validate US3 before adding control/replacement and automatic refresh.

### Incremental Delivery

1. Foundation + US1: reliable original/translation reading.
2. US2 + US3: configured, observable one-language generation.
3. US4: operationally safe pause/resume/retranslation.
4. US5: automatic freshness and analysis-ready records.
5. Polish: full operational and security validation.

## Notes

- Every task uses the required checkbox, sequential ID, exact file path, and story label for user-story phases.
- `[P]` only marks work that can be completed in separate files after stated prerequisites.
- Do not introduce a second content store or use expiring `ai_actions` records as translation history.
