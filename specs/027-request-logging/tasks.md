---

description: "Implementation tasks for outbound request logging"
---

# Tasks: Outbound Request Logging

**Input**: Design documents from `/specs/027-request-logging/`

**Prerequisites**: `spec.md`, `plan.md`, `research.md`, `data-model.md`, `contracts/`, and `quickstart.md`

**Tests**: Required by the repository engineering rules and the feature design. Add tests before the corresponding implementation and keep the original outbound request behavior unchanged when capture fails.

**Organization**: Tasks are ordered by dependency and grouped by the four P1 user stories in `spec.md`.

## Phase 1: Setup (Feature Test and Delivery Fixtures)

**Purpose**: Establish the focused fixtures and validation entry points used by the feature without adding a new runtime dependency or service.

- [ ] T001 Add deterministic outbound-response fixtures covering success, HTTP error, pre-response transport failure, timeout, cancellation, malformed JSON/SSE, duplicate headers, empty bodies, and binary bodies in `apps/web/src/server/ai/providers/http-client.test.ts`.
- [ ] T002 Add shared request-log test factories for settings, source descriptors, metadata, encrypted detail envelopes, and expiration timestamps in `apps/web/src/server/services/request-log.test.ts`.
- [X] T003 Record the feature-specific Docker, migration, focused-test, OpenAPI, and i18n validation commands in `specs/027-request-logging/quickstart.md` and keep them aligned with the implementation paths.

---

## Phase 2: Foundational (Blocking Prerequisites)

**Purpose**: Build the shared contract, persistence, permission, encryption, and service boundaries required by every user story.

**⚠️ CRITICAL**: No user-story implementation should begin until this phase is complete.

- [X] T004 [P] Define shared request-log enums, source descriptors, settings schemas, list filters, list summaries, detail envelopes, and API error shapes in `packages/shared/src/request-log.ts`.
- [X] T005 Export the request-log shared types and schemas from `packages/shared/src/index.ts` after `packages/shared/src/request-log.ts` is defined.
- [X] T006 [P] Add `request_log_level` and request outcome enum definitions in `apps/web/src/server/db/schema/enums.ts`, following the existing Drizzle enum conventions.
- [X] T007 Define the singleton `request_log_settings` and append-only `outbound_request_logs` tables, encrypted columns, nullable-response semantics, retention columns, foreign-key attribution, and stable list/cleanup indexes in `apps/web/src/server/db/schema/request-logs.ts`; add the non-sensitive settings-change audit metadata column in `apps/web/src/server/db/schema/index.ts`.
- [X] T008 Re-export the request-log schema from the main Drizzle schema entry point in `apps/web/src/server/db/schema/index.ts`.
- [X] T009 Generate the Drizzle migration and matching snapshot/journal entries from the edited schema using `pnpm db:generate`, writing generated artifacts only under `apps/web/src/server/db/migrations/`; do not hand-author SQL or metadata.
- [X] T010 Re-run `pnpm db:generate` and verify the schema is clean with no changes reported, using `apps/web/src/server/db/schema/request-logs.ts` as the source of truth.
- [X] T011 Add the dedicated `manage_request_logs` action and `request_logs` resource, including Admin-only and API-key-denied behavior, in `apps/web/src/server/permissions/index.ts`.
- [ ] T012 [P] Add permission and schema regression tests for Admin, Editor, anonymous, and API-key actors in `apps/web/src/server/db/request-log-schema.test.ts` and `apps/web/src/server/permissions/request-log-permissions.test.ts`.
- [X] T013 Implement the generic capture service and immutable source/operation registry in `apps/web/src/server/services/request-log.ts`, including one capture decision per attempt, Status/Header/All field boundaries, ordered duplicate header values, absent-versus-empty body markers, safe bounded target/error metadata, correlation and attempt fields, encryption before queueing, and non-recursive failure isolation; add idempotent encrypted persistence through `apps/web/src/server/jobs/request-log-persist.ts`, declare the queue in `apps/web/src/server/jobs/runtime.ts`, and register its worker in `apps/web/src/server/jobs/register.ts` without awaiting persistence from the original outbound operation.
- [ ] T014 Add unit and worker coverage for disabled capture, source-registry validation, level conformance, encryption before queueing, idempotent persistence, body/header preservation, correlation, retries, pre-response failures, logging-write failure isolation, and expiry calculation in `apps/web/src/server/services/request-log.test.ts` and `apps/web/src/server/jobs/request-log-persist.test.ts`.
- [X] T015 Add shared settings/list/detail validation schemas and scanner-compatible response definitions in `apps/web/src/server/api/openapi-schemas.ts`, keeping raw encrypted fields out of list schemas.

**Checkpoint**: Database schema, shared types, permission boundary, encrypted capture service, and validation contracts are ready for story work.

---

## Phase 3: User Story 1 - Enable Diagnostic Capture (Priority: P1) 🎯 MVP

**Goal**: Let an Admin safely enable/disable global capture, select Status/Header/All, confirm sensitive All capture, and collect complete AI request attempts without changing the provider result.

**Independent Test**: With no settings row, verify disabled/status/24-hour defaults; enable each level, execute fixture AI requests including success and failures, and verify the stored fields exactly match the selected level; disable capture and verify no new row is created.

### Tests for User Story 1

- [ ] T016 [P] [US1] Add settings transition tests for default values, retention bounds, All confirmation, level snapshots, non-sensitive previous/new audit metadata, and turning capture off without deleting existing rows in `apps/web/src/server/services/request-log-settings.test.ts`.
- [ ] T017 [P] [US1] Add route contract tests for `GET` and `PATCH /api/request-log/settings`, including unauthorized, forbidden, invalid payload, missing confirmation, and dynamic-response behavior in `apps/web/src/server/services/request-log-routes.test.ts`.
- [ ] T018 [P] [US1] Extend provider-boundary tests for HTTP errors, parser errors, streaming failures, timeout, cancellation, retries, malformed responses, and logging failure isolation in `apps/web/src/server/ai/providers/http-client.test.ts`.

### Implementation for User Story 1

- [X] T019 [US1] Implement settings read/update, singleton initialization defaults, retention validation, sensitive-capture confirmation, immutable per-attempt level selection, and non-sensitive previous/new setting-change audit metadata in `apps/web/src/server/services/request-log.ts`.
- [X] T020 [US1] Implement the Admin-session-only dynamic settings route with `createApiContext`, permission checks, shared schemas, `withApiAudit`, `mapDomainError`, `Cache-Control: no-store`, and OpenAPI annotations in `apps/web/app/api/request-log/settings/route.ts`.
- [ ] T021 [US1] Refactor the complete existing AI provider operation boundary so capture wraps fetch, response parsing, and stream consumption while preserving the original consumer stream, timeout, cancellation, retry, and error behavior; encrypt and hand off capture persistence without awaiting it in `apps/web/src/server/ai/providers/http-client.ts`.
- [ ] T022 [US1] Register source type, provider key, operation, attempt, and correlation identifiers for model discovery, chat streaming, embeddings, image generation, and provider-test operations across `apps/web/src/server/ai/providers/openai-compatible.ts`, `apps/web/src/server/ai/providers/openrouter.ts`, `apps/web/src/server/ai/providers/anthropic.ts`, `apps/web/src/server/ai/providers/voyage.ts`, and `apps/web/src/server/ai/providers/minimax.ts`.
- [ ] T023 [US1] Update each existing AI provider call site to pass the explicit request-log descriptor and complete operation callback without serializing request bodies or consulting capture storage when capture is disabled in `apps/web/src/server/ai/providers/http-client.ts`, `apps/web/src/server/ai/providers/openai-compatible.ts`, `apps/web/src/server/ai/providers/openrouter.ts`, `apps/web/src/server/ai/providers/anthropic.ts`, `apps/web/src/server/ai/providers/voyage.ts`, and `apps/web/src/server/ai/providers/minimax.ts`.

**Checkpoint**: An Admin can turn capture on at any level, reproduce an AI request, and obtain one correctly classified record per attempt; capture-off and logger-failure paths preserve normal AI behavior.

---

## Phase 4: User Story 2 - Find and Diagnose a Request (Priority: P1)

**Goal**: Provide one Admin `REQUEST LOG` surface under `DATA & OPERATIONS` with URL-restorable filters, newest-first pagination, settings visibility, and a safe detail view for all captured fields allowed by the immutable record level.

**Independent Test**: Generate successful, failed, timeout, and streaming AI calls; open `DATA & OPERATIONS` → `REQUEST LOG`; filter by source/outcome/status/correlation/time; open a record; verify summary, unavailable-versus-empty states, headers, bodies, and errors match the stored capture level.

### Tests for User Story 2

- [ ] T024 [P] [US2] Add list/detail service tests for bounded pagination, stable newest-first ordering, every documented filter, expiry exclusion, safe list projections, Admin-only decryption, and not-found behavior for expired records in `apps/web/src/server/services/request-log.test.ts`.
- [ ] T025 [P] [US2] Add API route contract tests for list and detail responses, including all query filters, maximum page size, no raw payloads in list results, `Cache-Control: no-store`, session/API-key authorization, and not-found behavior only for unknown/expired IDs in `apps/web/src/server/services/request-log-routes.test.ts`.
- [ ] T026 [P] [US2] Add component tests for settings states, All confirmation, URL filter synchronization, pagination reset, empty/no-match states, sensitive collapsed sections, unavailable/empty/binary content, and permission loss in `apps/web/src/components/admin/request-log/RequestLogPanel.test.tsx`.

### Implementation for User Story 2

- [X] T027 [US2] Implement request-log list and detail query services with metadata-only list selection, bounded filters/page sizes, deterministic `(created_at, id)` ordering, expiry predicates, Admin permission checks, and detail decryption in `apps/web/src/server/services/request-log.ts`.
- [X] T028 [US2] Implement the dynamic Admin-session-only paginated list route with all documented filters, shared response schemas, audit wrapper, `Cache-Control: no-store`, and OpenAPI annotations in `apps/web/app/api/request-log/route.ts`.
- [X] T029 [US2] Implement the dynamic Admin-session-only detail route that returns complete level-allowed values only after authorization, preserves unavailable-versus-empty semantics, returns forbidden access without metadata, and maps only unknown/expired IDs to not-found in `apps/web/app/api/request-log/[id]/route.ts`.
- [ ] T030 [US2] Build the URL-restorable settings/filter/list table, newest-first pagination, sensitivity warnings, empty states, and navigation to detail in `apps/web/src/components/admin/request-log/RequestLogPanel.tsx`.
- [ ] T031 [US2] Build the summary-first detail view with collapsed sensitive sections for request/response headers, bodies, and complete error details in `apps/web/src/components/admin/request-log/RequestLogDetail.tsx`.
- [ ] T032 [US2] Add the canonical Admin list and detail pages with dynamic rendering, a route-derived breadcrumb, current-list back navigation, and existing Admin layout primitives in `apps/web/app/(admin)/admin/request-log/page.tsx` and `apps/web/app/(admin)/admin/request-log/[id]/page.tsx`.
- [X] T033 [US2] Add exactly one `REQUEST LOG` item to the existing `DATA & OPERATIONS` navigation group and wire the page labels, settings, filters, outcomes, columns, warnings, sensitive sections, empty states, accessibility labels, and permission messages in `apps/web/src/components/layout/Navigator.tsx`, `apps/web/src/i18n/keys.ts`, `apps/web/messages/en.json`, and `apps/web/messages/zh.json`.

**Checkpoint**: The Admin can find and inspect captured records from the canonical navigation surface without raw payloads leaking into list rows, URLs, notifications, or ordinary logs.

---

## Phase 5: User Story 3 - Capture AI and Future External Requests Through One Mechanism (Priority: P1)

**Goal**: Prove that AI and a second explicitly registered outbound source use the same common record, filters, correlation, and detail contract without provider-specific viewers or tables.

**Independent Test**: Run an AI request and a fixture external integration request under one enabled setting; verify both appear in the same collection with common fields and remain independently filterable by source/provider/operation.

### Tests for User Story 3

- [ ] T034 [P] [US3] Add a generic source-conformance test using `sourceType=fixture`, provider key, operation, correlation ID, and attempt metadata to prove non-AI sources can use the same capture contract in `apps/web/src/server/services/request-log.test.ts`.
- [ ] T035 [P] [US3] Add provider-operation coverage asserting model, chat, embedding, image, and provider-test descriptors are consistent and distinct in `apps/web/src/server/ai/providers/provider-conformance.test.ts`.
- [ ] T036 [P] [US3] Add an end-to-end two-source scenario that filters AI and fixture records independently while keeping one list/detail surface in `apps/web/e2e/request-log.spec.ts`.

### Implementation for User Story 3

- [ ] T037 [US3] Document the immutable source-registry adoption contract for future HTTP or SDK integrations, including the required code registration, descriptor, injected test registry, operation callback, correlation, attempt, and recursion guard, in `specs/027-request-logging/quickstart.md`.
- [ ] T038 [US3] Ensure every existing AI provider adapter is covered by the immutable `ai` source/operation registry and the shared request wrapper, rather than provider-specific persistence or viewer logic, in `apps/web/src/server/ai/providers/provider-conformance.test.ts` and `apps/web/src/server/services/request-log.ts`.
- [ ] T039 [US3] Add an injected test-only fixture source registry and fixture integration that adopts the common wrapper, then verify its records share the AI list/detail schemas without a new table, route, filter model, or UI surface in `apps/web/src/server/services/request-log.test.ts` and `apps/web/e2e/request-log.spec.ts`.
- [ ] T040 [US3] Preserve correlation identifiers across multiple outbound attempts and keep retry attempts distinguishable and ordered by start time in `apps/web/src/server/services/request-log.ts` and `apps/web/src/server/ai/providers/http-client.ts`.

**Checkpoint**: AI and fixture external requests are visibly one generic operational capability, with no AI-only request-log implementation path.

---

## Phase 6: User Story 4 - Protect and Control Captured Operational Data (Priority: P1)

**Goal**: Enforce the Admin-only boundary, audit changes and access through existing infrastructure, and expire sensitive records through the existing cleanup worker.

**Independent Test**: Capture an All-level record containing sensitive headers/body/error data; attempt settings/list/detail access as Editor, anonymous, and API-key actors; verify denial without metadata disclosure; expire the record and run cleanup to verify it disappears.

### Tests for User Story 4

- [ ] T041 [P] [US4] Add security tests for settings/list/detail authorization, API-key denial, current-permission re-evaluation, encrypted-at-rest fields, no raw list projection, and logging-path recursion prevention in `apps/web/src/server/services/request-log-security.test.ts`.
- [ ] T042 [P] [US4] Add retention tests for `expires_at`, normal-query expiry filtering, cleanup deletion, configured 1–168 hour bounds, and preservation of unrelated AI/content/audit records in `apps/web/src/server/jobs/ai-cleanup.test.ts`.
- [ ] T043 [P] [US4] Add Playwright coverage for Admin capture, non-Admin/API-key denial, sensitive disclosure warnings, URL absence of raw values, permission loss, and retention behavior in `apps/web/e2e/request-log.spec.ts`.

### Implementation for User Story 4

- [X] T044 [US4] Extend the existing API audit wrapper so the settings route attaches one typed non-sensitive previous/new enabled, level, and retention envelope to its normal PATCH audit row; store and display it with the acting Admin in `apps/web/src/server/api/audit-wrapper.ts`, `apps/web/src/server/services/audit.ts`, `apps/web/src/components/admin/AdminAuditTable.tsx`, `packages/shared/src/audit.ts`, and `apps/web/app/api/request-log/settings/route.ts`.
- [X] T045 [US4] Extend the existing scheduled cleanup path to delete expired request-log rows in bounded batches, without touching pages, revisions, AI actions, or audit entries, in `apps/web/src/server/jobs/ai-cleanup.ts` and `apps/web/src/server/jobs/register.ts`.
- [ ] T046 [US4] Harden the Admin request-log components so raw values remain out of list projections, URL state, notifications, ordinary logs, and retained client state after permission loss in `apps/web/src/components/admin/request-log/RequestLogPanel.tsx` and `apps/web/src/components/admin/request-log/RequestLogDetail.tsx`.
- [ ] T047 [US4] Add security and retention documentation for the temporary sensitive-data boundary, default 24-hour retention, 1–168 hour policy, cleanup behavior, and operational warning in `specs/027-request-logging/quickstart.md`.

**Checkpoint**: Sensitive request data is encrypted at rest, readable only by a current Admin through the detail route, audited through existing infrastructure, and bounded by retention.

---

## Phase 7: Polish & Cross-Cutting Concerns

**Purpose**: Complete generated API documentation, full validation, accessibility/localization checks, and implementation handoff evidence.

- [X] T048 Add the three request-log route groups and shared schemas to the scanner-compatible OpenAPI definitions, then regenerate the committed document with `pnpm --filter @next-wiki/web openapi:generate` in `apps/web/src/server/api/openapi-schemas.ts` and `apps/web/public/openapi.json`.
- [X] T049 Validate English and Simplified Chinese completeness, accessible labels/keyboard behavior, and absence of browser alert popups for the request-log surface in `apps/web/src/i18n/keys.ts`, `apps/web/messages/en.json`, `apps/web/messages/zh.json`, and `apps/web/src/components/admin/request-log/RequestLogPanel.tsx`.
- [ ] T050 Run the focused Vitest suites and Playwright scenario from `specs/027-request-logging/quickstart.md`, including `apps/web/src/server/services/request-log.test.ts`, `apps/web/src/server/ai/providers/http-client.test.ts`, `apps/web/src/server/services/request-log-routes.test.ts`, `apps/web/src/components/admin/request-log/RequestLogPanel.test.tsx`, and `apps/web/e2e/request-log.spec.ts`.
- [X] T051 Run `pnpm --filter @next-wiki/web lint`, `pnpm --filter @next-wiki/web typecheck`, `pnpm --filter @next-wiki/web i18n:validate`, and the generated-migration no-change check documented in `apps/web/package.json` and `apps/web/src/server/db/migrations/`.
- [ ] T052 Run the Docker-backed quickstart with `docker compose up -d --build`, verify the Admin manual scenarios, and record any implementation-specific setup notes in `specs/027-request-logging/quickstart.md`.

---

## Dependencies & Execution Order

### Phase Dependencies

- **Phase 1: Setup** has no feature dependency and establishes fixtures/documentation.
- **Phase 2: Foundational** depends on Phase 1 and blocks every user story.
- **Phase 3: US1** depends on Phase 2 and is the recommended MVP.
- **Phase 4: US2** depends on the US1 settings/capture contract so it can display real records, while its list/detail implementation is otherwise isolated.
- **Phase 5: US3** depends on the Phase 2 generic contract and the US1 AI boundary integration.
- **Phase 6: US4** depends on the settings/list/detail routes and capture service from US1/US2, plus the existing cleanup worker.
- **Phase 7: Polish** depends on all stories selected for delivery.

### User Story Dependencies

- **US1 (P1)**: Phase 2 only; no other story dependency. This is the MVP increment.
- **US2 (P1)**: Phase 2 plus the US1 settings/capture result shape; can be implemented in parallel with late US1 UI-independent work after the service contract is stable.
- **US3 (P1)**: Phase 2 plus US1's provider boundary; it extends the generic wrapper and can be developed independently of the Admin UI.
- **US4 (P1)**: Phase 2 plus the routes and components from US1/US2; security tests should be run before exposing any sensitive detail.

### Within Each User Story

- Write the story-specific tests before implementation and make them fail for the missing behavior.
- Implement shared data/service behavior before routes, then routes before UI/E2E integration.
- Keep list projections metadata-only and keep decryption behind the authorized detail path.
- Preserve the original provider operation result if request-log persistence fails.

## Parallel Execution Examples

### Foundation

```text
T004 shared schemas, then T005 exports
T006-T008 Drizzle enum/table/index work
T011-T012 permission work and permission tests
T013-T014 capture service and service tests (tests should be authored first)
```

### US1

```text
T016 settings tests, T017 settings route tests, and T018 provider-boundary tests
can be authored in parallel because they target separate test files.

T019-T020 settings service and route are sequential; T021-T023 provider-boundary
and adapter integration then proceed after the capture contract is stable.
```

### US2 / US3 / US4

```text
T024-T026 US2 service/route/component tests can be authored in parallel.
T030-T033 list/detail UI files can be split after the shared schemas are stable.
T034-T036 generic-source tests can be authored in parallel with the Admin UI.
T041-T043 security, retention, and E2E tests can be authored in parallel before
T044-T046 audit, cleanup, and UI hardening are integrated.
```

## Implementation Strategy

### MVP First (US1)

1. Complete Phase 1 and Phase 2, including the generated migration and clean re-run.
2. Complete US1 settings and AI boundary capture.
3. Run the US1 focused tests and reproduce a failing AI request at Status, Header, and All.
4. Stop for validation/demo if needed; do not expose the All-level detail surface before US2/US4 security work is complete.

### Incremental Delivery

1. Add US2 to make captured records searchable and inspectable through the Admin surface.
2. Add US3 to verify non-AI integrations can opt into the same contract.
3. Add US4 to complete audit, permission, encryption, and retention hardening.
4. Complete Phase 7 and run the Docker-backed quickstart before release.

### Suggested Team Split

After Phase 2 is complete:

- Developer A: US1 settings and provider boundary (`apps/web/src/server/services/request-log.ts`, `apps/web/src/server/ai/providers/http-client.ts`).
- Developer B: US2 routes and Admin surface (`apps/web/app/api/request-log/`, `apps/web/app/(admin)/admin/request-log/`, `apps/web/src/components/admin/request-log/`).
- Developer C: US3 source conformance and US4 security/retention (`apps/web/src/server/jobs/ai-cleanup.ts`, `apps/web/src/server/permissions/index.ts`, and tests).

## Notes

- Every task has a sequential ID, starts with an unchecked checkbox, and includes an exact repository path.
- `[P]` marks only tasks intended for separate files with no incomplete dependency; tasks touching the same core service remain ordered.
- No new service, queue backend, cache, or vendor SDK is introduced; encrypted persistence uses an additional handler on the existing pg-boss worker process.
- Database migrations must be generated from `apps/web/src/server/db/schema/*.ts` with Drizzle; never hand-author migration SQL, snapshots, or journal entries.
