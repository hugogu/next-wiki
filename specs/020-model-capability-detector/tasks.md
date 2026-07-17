# Tasks: Model Capability Detector

**Input**: Design documents from `/specs/020-model-capability-detector/`
**Prerequisites**: [plan.md](./plan.md), [spec.md](./spec.md), [research.md](./research.md), [data-model.md](./data-model.md), [contracts/](./contracts/), [quickstart.md](./quickstart.md)
**Tests**: Included because the plan and quickstart require detector, sync, route, UI, and secret-redaction coverage.
**Organization**: Tasks are grouped by user story to enable independent implementation and validation.

## Format: `[ID] [P?] [Story] Description`

- **[P]**: Can run in parallel after prerequisite tasks in the same phase are complete.
- **[Story]**: User story label from [spec.md](./spec.md).
- Every task includes the primary file path to edit or validate.

## Phase 1: Setup (Shared Infrastructure)

**Purpose**: Prepare shared type surfaces and test fixture locations without changing behavior.

- [X] T001 Create detector fixture directory with OpenRouter and Cloudflare sample payload placeholders in `apps/web/src/server/ai/model-detectors/__fixtures__/README.md`
- [X] T002 [P] Add detector-focused Vitest fixture helpers scaffold in `apps/web/src/server/ai/model-detectors/test-helpers.ts`
- [X] T003 [P] Add admin AI detector E2E fixture notes and selectors inventory in `apps/web/e2e/admin-ai-model-detector.spec.ts`

---

## Phase 2: Foundational (Blocking Prerequisites)

**Purpose**: Core detector contracts, shared schemas, registry, and sync plumbing that all user stories depend on.

**Critical**: No user story implementation starts until this phase is complete.

- [X] T004 Add shared detector source, detector config, and sync action result schemas in `packages/shared/src/ai.ts`
- [X] T005 Update AI provider vendor/protocol definitions for detector source selection in `packages/shared/src/ai.ts`
- [X] T006 [P] Add detector contract types for runtime config, detected models, warnings, and list results in `apps/web/src/server/ai/model-detectors/types.ts`
- [X] T007 [P] Add detector registry with explicit `openrouter` and `cloudflare` registration points in `apps/web/src/server/ai/model-detectors/registry.ts`
- [X] T008 Move current OpenRouter detector behavior behind the new detector contract in `apps/web/src/server/ai/model-detectors/openrouter.ts`
- [X] T009 Replace legacy exports with compatibility wrappers or re-exports in `apps/web/src/server/ai/model-detector.ts`
- [X] T010 Add detector config parsing and credential resolution helpers in `apps/web/src/server/services/ai-admin.ts`
- [X] T011 Add action-backed model-sync enqueue/resume service functions in `apps/web/src/server/services/ai-admin.ts`
- [X] T012 Add or update model-sync worker handling for detector-backed runs in `apps/web/src/server/services/ai-actions.ts`
- [X] T013 Update provider create/update validation for detector config and write-only credentials in `apps/web/src/server/services/ai-admin.ts`
- [X] T014 [P] Add shared i18n keys for detector source, status, partial enrichment, and provenance labels in `apps/web/src/i18n/keys.ts`
- [X] T015 [P] Add English detector labels and messages in `apps/web/messages/en.json`
- [X] T016 [P] Add Chinese detector labels and messages in `apps/web/messages/zh.json`

**Checkpoint**: Detector sources can be validated, selected, and invoked through a registry; OpenRouter behavior is available through the new boundary; provider sync can run through `model_sync` action plumbing.

---

## Phase 3: User Story 1 - Synchronize Cloudflare Model Capabilities (Priority: P1) MVP

**Goal**: Admin can configure a Cloudflare detector source, run model sync, and receive normalized Cloudflare model capabilities with partial schema failures handled safely.

**Independent Test**: Configure a Cloudflare-backed provider with valid fixture credentials, run model synchronization, and verify model rows contain stable IDs, availability, modalities, schema/catalog capability evidence, and partial warnings for schema failures.

### Tests for User Story 1

- [X] T017 [P] [US1] Add Cloudflare detector mapping tests for model search, schema enrichment, modalities, and deprecation in `apps/web/src/server/ai/model-detectors/cloudflare.test.ts`
- [X] T018 [P] [US1] Add Cloudflare partial schema failure tests in `apps/web/src/server/ai/model-detectors/cloudflare.test.ts`
- [X] T019 [P] [US1] Add Cloudflare provider config validation and secret-redaction route tests in `apps/web/app/api/ai/ai-admin-routes.test.ts`
- [X] T020 [P] [US1] Add Cloudflare model sync service tests for added, updated, unavailable, skipped, and partial counts in `apps/web/src/server/services/ai-admin-detectors.test.ts`

### Implementation for User Story 1

- [X] T021 [US1] Implement Cloudflare detector list and schema fetch client with bounded timeout and sanitized errors in `apps/web/src/server/ai/model-detectors/cloudflare.ts`
- [X] T022 [US1] Implement Cloudflare catalog-to-model normalization in `apps/web/src/server/ai/model-detectors/cloudflare.ts`
- [X] T023 [US1] Implement Cloudflare schema-to-capability mapping without model-name inference in `apps/web/src/server/ai/model-detectors/cloudflare.ts`
- [X] T024 [US1] Implement per-model partial warning collection and non-blocking schema enrichment failure handling in `apps/web/src/server/ai/model-detectors/cloudflare.ts`
- [X] T025 [US1] Wire Cloudflare detector source selection into provider runtime config resolution in `apps/web/src/server/services/ai-admin.ts`
- [X] T026 [US1] Merge Cloudflare detected models into `ai_models` and `ai_model_capabilities` while preserving unseen model availability semantics in `apps/web/src/server/services/ai-admin.ts`
- [X] T027 [US1] Update model sync route to return queued/resumed `model_sync` action for detector-backed providers in `apps/web/app/api/ai/providers/[id]/model-syncs/route.ts`
- [X] T028 [US1] Add Cloudflare detector fields to provider form validation and submission payload in `apps/web/src/components/admin/ai/ProviderForm.tsx`
- [X] T029 [US1] Add Cloudflare detector source labels and validation messages to provider form UI in `apps/web/src/components/admin/ai/ProviderForm.tsx`

**Checkpoint**: User Story 1 is independently functional as the MVP: Cloudflare detector sync works from fixture-backed admin configuration and preserves safe partial results.

---

## Phase 4: User Story 2 - Use One Detector Contract Across Providers (Priority: P1)

**Goal**: OpenRouter and Cloudflare use the same detector contract and downstream synchronization reads normalized detector results only.

**Independent Test**: Run synchronization against OpenRouter and Cloudflare fixtures and verify both produce the same normalized capability vocabulary and provenance shape; OpenRouter regression tests remain green.

### Tests for User Story 2

- [X] T030 [P] [US2] Add detector registry tests for explicit source lookup and unknown source rejection in `apps/web/src/server/ai/model-detectors/registry.test.ts`
- [X] T031 [P] [US2] Add OpenRouter detector contract regression tests for namespace filtering, chat capabilities, embedding models, and output modality filtering in `apps/web/src/server/ai/model-detectors/openrouter.test.ts`
- [X] T032 [P] [US2] Add sync orchestration tests proving OpenRouter and Cloudflare both flow through normalized `DetectedModel` merge in `apps/web/src/server/services/ai-admin-detectors.test.ts`

### Implementation for User Story 2

- [ ] T033 [US2] Refactor `syncProviderModels` to consume `ModelCapabilityDetector.listModels()` results instead of OpenRouter-specific helper calls in `apps/web/src/server/services/ai-admin.ts`
- [ ] T034 [US2] Replace direct imports of `detectCapabilities` and `listEmbeddingModels` with detector registry usage in `apps/web/src/server/services/ai-admin.ts`
- [ ] T035 [US2] Preserve OpenRouter provider registration behavior through compatibility calls into the OpenRouter detector in `apps/web/src/server/services/ai-admin.ts`
- [ ] T036 [US2] Update legacy OpenRouter detector tests or import paths to the new detector location in `apps/web/src/server/ai/model-detector.test.ts`
- [ ] T037 [US2] Update provider discovery adapter interaction so detector source and runtime provider adapter remain separate in `apps/web/src/server/ai/registry.ts`
- [X] T038 [US2] Update shared model sync result schema to include detector counts and action identifiers in `packages/shared/src/ai.ts`

**Checkpoint**: OpenRouter still works, Cloudflare works through the same contract, and sync/assignment code no longer contains detector-specific branches except registry selection.

---

## Phase 5: User Story 3 - Keep Manual Overrides Safe (Priority: P2)

**Goal**: Detector sync updates detector-owned metadata while manual models and manual capability overrides remain effective and visible.

**Independent Test**: Create manual capability overrides, run OpenRouter and Cloudflare syncs, and verify manual rows keep precedence; models without detector configuration remain manually manageable.

### Tests for User Story 3

- [X] T039 [P] [US3] Add manual override precedence tests across OpenRouter and Cloudflare syncs in `apps/web/src/server/services/ai-admin-detectors.test.ts`
- [X] T040 [P] [US3] Add assignment validation tests for unknown detector values and explicit manual confirmation in `apps/web/src/server/services/ai-admin.test.ts`
- [ ] T041 [P] [US3] Add UI regression test for manual capability override persistence after sync in `apps/web/e2e/admin-ai-model-detector.spec.ts`

### Implementation for User Story 3

- [X] T042 [US3] Ensure detector merge skips overwriting `manually_added` model rows in `apps/web/src/server/services/ai-admin.ts`
- [X] T043 [US3] Ensure detector merge upserts only detector-owned capability rows and never deletes `source=manual` rows in `apps/web/src/server/services/ai-admin.ts`
- [ ] T044 [US3] Update assignment validation to reject unknown detector evidence unless manual confirmation creates an override in `apps/web/src/server/services/ai-admin.ts`
- [X] T045 [US3] Show detector provenance and manual override precedence in model capability controls in `apps/web/src/components/admin/ai/ModelCatalog.tsx`
- [X] T046 [US3] Keep manual model creation available for detector-backed providers in `apps/web/src/components/admin/ai/ModelCatalog.tsx`

**Checkpoint**: Administrators can trust that automated detection will not erase deliberate local model capability decisions.

---

## Phase 6: User Story 4 - Diagnose Detector Coverage and Failures (Priority: P2)

**Goal**: Admin can see detector source, partial/failed status, safe errors, and per-run counts without exposing credentials or raw provider payloads.

**Independent Test**: Run sync with valid, missing, expired, rate-limited, and malformed detector fixtures and verify safe UI/action diagnostics, no secret leakage, and partial model status visibility.

### Tests for User Story 4

- [X] T047 [P] [US4] Add normalized detector error and secret-redaction tests in `apps/web/src/server/ai/model-detectors/errors.test.ts`
- [X] T048 [P] [US4] Add action metadata tests for detector source, freshness, counts, warnings, and sanitized failures in `apps/web/src/server/services/ai-admin-detectors.test.ts`
- [ ] T049 [P] [US4] Add admin route tests for non-admin denial and no credential exposure in detector status/model responses in `apps/web/app/api/ai/ai-admin-routes.test.ts`
- [ ] T050 [P] [US4] Add Playwright coverage for detector coverage, partial status, and sync result counts in `apps/web/e2e/admin-ai-model-detector.spec.ts`

### Implementation for User Story 4

- [X] T051 [US4] Implement detector error normalization and safe detail shaping in `apps/web/src/server/ai/model-detectors/types.ts`
- [X] T052 [US4] Persist detector source, freshness, counts, warnings, and sanitized failure metadata on `model_sync` actions in `apps/web/src/server/services/ai-admin.ts`
- [ ] T053 [US4] Expose detector coverage and partial status through admin model views without secrets in `apps/web/src/server/services/ai-admin.ts`
- [ ] T054 [US4] Render detector configured/unconfigured/partial/failed states in `apps/web/src/components/admin/ai/ModelDetectorPanel.tsx`
- [X] T055 [US4] Render per-model detector provenance and partial enrichment indicators in `apps/web/src/components/admin/ai/ModelCatalog.tsx`
- [X] T056 [US4] Ensure all detector status and model sync admin routes enforce `manage_ai` and return safe errors in `apps/web/app/api/ai/providers/[id]/model-syncs/route.ts`

**Checkpoint**: Administrators can diagnose detector coverage and failures safely without provider secrets or raw sensitive payloads.

---

## Phase 7: Polish & Cross-Cutting Concerns

**Purpose**: Finish validation, generated documentation, and cleanup across all stories.

- [X] T057 [P] Update OpenAPI schema tests for changed model sync response shape in `apps/web/src/server/api/openapi-schemas.test.ts`
- [X] T058 [P] Regenerate or update generated OpenAPI output for AI admin routes in `apps/web/public/openapi.json`
- [X] T059 [P] Run i18n validation and fix detector translation key coverage in `apps/web/src/i18n/keys.ts`
- [ ] T060 Run focused detector quickstart checks and record verification notes in `specs/020-model-capability-detector/quickstart.md`
- [ ] T061 Run full AI admin Vitest coverage and fix regressions in `apps/web/src/server/services/ai-admin.ts`
- [ ] T062 Run admin AI Playwright coverage and fix regressions in `apps/web/e2e/admin-ai-model-detector.spec.ts`
- [X] T063 Run lint and typecheck, fixing final issues in `packages/shared/src/ai.ts`
- [ ] T064 Confirm no public-content ISR/static generation or invalidation changes are required in `specs/020-model-capability-detector/quickstart.md`

---

## Dependencies & Execution Order

### Phase Dependencies

- **Phase 1 Setup**: No dependencies.
- **Phase 2 Foundational**: Depends on Phase 1 and blocks all user stories.
- **Phase 3 US1**: Depends on Phase 2; MVP.
- **Phase 4 US2**: Depends on Phase 2 and can proceed alongside US1 after the shared registry is stable, but final validation depends on US1 Cloudflare fixtures.
- **Phase 5 US3**: Depends on Phase 2 and benefits from either US1 or US2 detector fixtures.
- **Phase 6 US4**: Depends on Phase 2 and needs detector run/action metadata from US1 or US2.
- **Phase 7 Polish**: Depends on all selected user stories.

### User Story Dependencies

- **US1 (P1)**: Independent MVP after foundation; proves Cloudflare detector value.
- **US2 (P1)**: Independent architecture story after foundation; validates OpenRouter and Cloudflare share one contract.
- **US3 (P2)**: Can start after foundation with fake detector output; final confidence requires at least one real detector implementation.
- **US4 (P2)**: Can start after foundation with fake detector errors; final UI validation benefits from US1 partial-sync behavior.

### Within Each User Story

- Tests first; verify they fail before implementation.
- Detector/contract implementation before sync orchestration.
- Sync orchestration before route/UI integration.
- Story checkpoint validation before moving to the next story.

## Parallel Opportunities

- T002 and T003 can run in parallel after T001.
- T006, T007, T014, T015, and T016 can run in parallel after T004/T005 API shape decisions.
- US1 tests T017-T020 can run in parallel.
- US2 tests T030-T032 can run in parallel.
- US3 tests T039-T041 can run in parallel.
- US4 tests T047-T050 can run in parallel.
- UI work in T028/T029, T045/T046, and T054/T055 can run parallel to service work once shared schemas are stable.

## Parallel Example: User Story 1

```bash
Task: "T017 [US1] Add Cloudflare detector mapping tests in apps/web/src/server/ai/model-detectors/cloudflare.test.ts"
Task: "T019 [US1] Add Cloudflare provider config route tests in apps/web/app/api/ai/ai-admin-routes.test.ts"
Task: "T020 [US1] Add Cloudflare model sync service tests in apps/web/src/server/services/ai-admin-detectors.test.ts"
```

## Parallel Example: User Story 4

```bash
Task: "T047 [US4] Add normalized detector error tests in apps/web/src/server/ai/model-detectors/errors.test.ts"
Task: "T049 [US4] Add admin route secret-redaction tests in apps/web/app/api/ai/ai-admin-routes.test.ts"
Task: "T050 [US4] Add Playwright detector diagnostics coverage in apps/web/e2e/admin-ai-model-detector.spec.ts"
```

## Implementation Strategy

### MVP First (US1)

1. Complete Phase 1 setup.
2. Complete Phase 2 foundation.
3. Complete Phase 3 Cloudflare detector synchronization.
4. Stop and validate US1 independently with fixture-backed detector and service tests.

### Incremental Delivery

1. Foundation: shared schemas, detector contract, registry, action-backed sync.
2. US1: Cloudflare detector sync MVP.
3. US2: finish OpenRouter migration into the shared detector contract.
4. US3: harden manual override precedence.
5. US4: expose diagnostics and safe failures.
6. Polish: OpenAPI, i18n, quickstart validation, lint/typecheck.

### Commit Guidance

- Commit Phase 1 + Phase 2 as one foundation commit only if it stays coherent.
- Prefer one commit per user story after the checkpoint passes.
- Keep OpenRouter refactor and Cloudflare detector implementation separate when practical.

## Notes

- API responses are admin-only and must not be cached.
- No task should add a new default deployment dependency or service.
- Do not hard delete models that disappear from a detector catalog.
- Do not infer model capabilities from model names.
- Keep Cloudflare runtime inference out of scope unless an existing provider adapter already supports it.
