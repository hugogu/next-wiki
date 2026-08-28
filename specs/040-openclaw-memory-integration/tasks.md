# Tasks: OpenClaw Shared Memory Bridge

**Input**: Design documents from `/specs/040-openclaw-memory-integration/`

**Prerequisites**: [plan.md](./plan.md), [spec.md](./spec.md), [research.md](./research.md), [data-model.md](./data-model.md), [contracts/](./contracts/), and [quickstart.md](./quickstart.md)

**Tests**: Required. The specification defines independent acceptance tests and the plan requires unit, service, route, package-loader, UI, and Compose verification.

**Organization**: Tasks are grouped by user story. Complete the foundation before story work; retain the documented checkpoints so each completed story can be verified without enabling later optional capabilities.

## Format: `[ID] [P?] [Story] Description`

- `[P]` indicates a task can proceed in parallel once its listed prerequisites exist and it does not modify the same files.
- `[US#]` maps a task to a user story in [spec.md](./spec.md).
- Every API schema is defined in `packages/shared` before its route; every database change starts from Drizzle schema source and uses generated migrations.

## Phase 1: Setup (Shared Package Boundaries)

**Purpose**: Establish the two independently publishable OpenClaw packages without adding an OpenClaw dependency to the Wiki server.

- [X] T001 [P] Create the ESM workspace package metadata, TypeScript/Vitest configuration, and peer-dependency compatibility floor in `packages/openclaw-memory-bridge/package.json`, `packages/openclaw-memory-bridge/tsconfig.json`, and `packages/openclaw-memory-bridge/vitest.config.ts`
- [X] T002 [P] Create the ESM workspace package metadata, TypeScript/Vitest configuration, and non-continuous-package boundary in `packages/openclaw-memory-migrate/package.json`, `packages/openclaw-memory-migrate/tsconfig.json`, and `packages/openclaw-memory-migrate/vitest.config.ts`
- [X] T003 [P] Add package scripts and workspace inclusion needed to build and test both packages in `package.json` and `pnpm-workspace.yaml`
- [X] T004 [P] Add non-secret development fixtures for two connections, a restricted Raw source revision, and an active/revoked grant in `apps/web/src/server/test/fixtures/agent-memory.ts`

---

## Phase 2: Foundational (Generic v2 Service and Authorization)

**Purpose**: Build the client-neutral primitives that block all stories: stable server connections, destinations, grants, immutable provenance, encrypted transient capture input, and v2 common API behavior.

**⚠️ CRITICAL**: Do not begin user-story delivery until this phase is complete. Do not hand-author a migration SQL file or Drizzle journal entry.

- [X] T005 Define v2 closed enums and Zod/OpenAPI schemas for connections, destinations, grants, record provenance, recall scope, capture states, and safe diagnostics in `packages/shared/src/agent-memory.ts`
- [X] T006 [P] Define owner/session resource schemas for connection lifecycle, credential rotation, and read/write grant management in `packages/shared/src/api-keys.ts`
- [X] T007 Extend the Agent Memory Drizzle schema with connection, destination role, credential binding, destination grant, immutable record provenance, evidence link, encrypted capture-envelope, and retention fields in `apps/web/src/server/db/schema/agent-memory.ts`
- [X] T008 Generate and review the Drizzle migration/snapshot from `apps/web/src/server/db/schema/agent-memory.ts` using `pnpm db:generate`, then run `pnpm db:generate` again and record that no additional schema change remains in `specs/040-openclaw-memory-integration/quickstart.md`
- [X] T009 Implement stable connection resolution, legacy v1 binding backfill compatibility, and credential-rotation lookup in `apps/web/src/server/permissions/agent-memory.ts`
- [X] T010 [P] Implement server-owned destination and active read/write-grant evaluation with no client-selected source/destination input in `apps/web/src/server/services/agent-memory-grants.ts`
- [X] T011 Implement common v2 record, immutable citation, evidence-link, retention-state, and idempotency primitives while preserving v1 behavior in `apps/web/src/server/services/agent-memory.ts`
- [X] T012 [P] Add encrypted transient-capture envelope handling with authenticated decryption, digest comparison, expiry, and redaction-safe failure handling in `apps/web/src/server/services/agent-memory.ts`
- [X] T013 Create v2 bearer authentication, no-store response helpers, bounded public-error mapping, and `audit_origin=agent_memory` attribution in `apps/web/app/api/v2/memory/_shared.ts`
- [X] T014 Register generated v2 API schemas and route documentation in `apps/web/src/server/api/openapi.ts` and `apps/web/app/api/v2/memory/_shared.ts`

**Checkpoint**: A connection and all subsequent operation authorization resolve only on the server; v1 Hermes behavior remains reachable, and no v2 route or background job has yet received a raw content body through generic job data.

---

## Phase 3: User Story 1 - Connect an OpenClaw Agent to Shared Durable Memory (Priority: P1) 🎯 MVP

**Goal**: An owner can provision separate stable connections for two agents; each adapter uses the generic v2 service and writes only to its own private destination.

**Independent Test**: Create two owner-managed connections, save one record from each one through separate bridge configurations, and verify both canonical Raw citations exist while neither caller can choose or write to the other's destination.

### Tests for User Story 1

- [X] T015 [P] [US1] Add schema and service tests for immutable connection identity, private-destination isolation, legacy v1 binding compatibility, and idempotent record creation in `apps/web/src/server/services/__tests__/agent-memory.test.ts`
- [ ] T016 [P] [US1] Add route contract tests proving `GET /api/v2/memory/connection` and `POST /api/v2/memory/records` ignore client-supplied identity/destination fields in `apps/web/app/api/v2/memory/__tests__/connection-and-records.test.ts`
- [ ] T017 [P] [US1] Add bridge configuration and HTTP-client tests for SecretRef redaction, v2 connection discovery, and credential-safe failures in `packages/openclaw-memory-bridge/tests/config-and-api-client.test.ts`

### Implementation for User Story 1

- [X] T018 [US1] Implement owner-session connection creation, disable/re-enable, and primary-private-destination initialization in `apps/web/src/server/services/agent-memory-connections.ts`
- [X] T019 [US1] Implement owner-session credential issue, list-safe metadata, rotation, and revocation operations in `apps/web/src/server/services/agent-memory-connections.ts`
- [X] T020 [US1] Implement RESTful owner connection and credential resource routes in `apps/web/app/api/api-keys/agent-memory/connections/route.ts` and `apps/web/app/api/api-keys/agent-memory/connections/[connectionId]/credentials/route.ts`
- [X] T021 [US1] Implement authenticated `GET /api/v2/memory/connection` using resolved connection capabilities without exposing grant inventories or destination labels in `apps/web/app/api/v2/memory/connection/route.ts`
- [X] T022 [US1] Implement v2 explicit-save validation, server-selected private destination, canonical Raw revision creation, immutable citation return, and idempotency disposition in `apps/web/app/api/v2/memory/records/route.ts` and `apps/web/src/server/services/agent-memory.ts`
- [X] T023 [US1] Implement v2 evidence creation with source revision/provenance validation in `apps/web/app/api/v2/memory/evidence/route.ts` and `apps/web/src/server/services/agent-memory.ts`
- [X] T024 [US1] Build the User Center Agent Memory connection list, create dialog, status control, and credential-rotation dialog in `apps/web/src/components/user-center/AgentMemoryConnections.tsx` and `apps/web/app/(user)/user-center/api-keys/page.tsx`
- [X] T025 [US1] Implement bridge strict configuration parsing, endpoint validation, SecretRef resolution boundary, and diagnostic redaction in `packages/openclaw-memory-bridge/src/config.ts`, `packages/openclaw-memory-bridge/src/api-client.ts`, and `packages/openclaw-memory-bridge/src/redaction.ts`
- [X] T026 [US1] Implement the native non-capability plugin manifest and synchronous entry registration without a memory-slot claim in `packages/openclaw-memory-bridge/openclaw.plugin.json` and `packages/openclaw-memory-bridge/src/index.ts`
- [X] T027 [US1] Implement the bridge startup service connection check and safe status categories in `packages/openclaw-memory-bridge/src/service.ts` and `packages/openclaw-memory-bridge/src/diagnostics.ts`
- [ ] T028 [US1] Add a two-connection bridge-to-v2 integration test and retain the Hermes v1 regression suite in `packages/openclaw-memory-bridge/tests/connection.integration.test.ts` and `packages/hermes-memory-provider/src/__tests__/provider.test.ts`

**Checkpoint**: Two independently installed bridge instances can save private, cited records to one generic Wiki service. The Wiki has no OpenClaw runtime dependency and Hermes v1 remains compatible.

---

## Phase 4: User Story 2 - Preserve Reliable Session Evidence (Priority: P1)

**Goal**: Opted-in lifecycle capture is durable, at-most-once, provenance-preserving, restart-safe, and never delays the completed OpenClaw turn.

**Independent Test**: Enable one capture mode, make the Wiki temporarily unavailable across compaction and session end, restart the Gateway, and verify exactly one durable cited evidence record per event after retry with no turn wait.

### Tests for User Story 2

- [ ] T029 [P] [US2] Add capture API and worker tests for idempotency conflicts, encrypted-envelope expiry, durable citation completion, and capture-status redaction in `apps/web/src/server/services/__tests__/agent-memory-captures.test.ts`
- [ ] T030 [P] [US2] Add concurrent duplicate, timeout, restart, cancellation, retry/backoff, and dead-letter outbox tests in `packages/openclaw-memory-bridge/tests/outbox.test.ts`
- [ ] T031 [P] [US2] Add lifecycle-hook tests for disabled capture, missing correlation, compaction observation, session-end enqueueing, and bounded shutdown in `packages/openclaw-memory-bridge/tests/hooks.test.ts`

### Implementation for User Story 2

- [X] T032 [US2] Implement v2 capture admission with payload-digest conflict detection, encrypted transient storage, and capture-ID-only enqueueing in `apps/web/app/api/v2/memory/captures/route.ts` and `apps/web/src/server/services/agent-memory.ts`
- [X] T033 [US2] Implement connection-restricted capture status retrieval with durable source-page/revision citations only after canonical persistence in `apps/web/app/api/v2/memory/captures/[captureId]/route.ts`
- [X] T034 [US2] Replace raw pg-boss capture payloads with capture identifiers and keep background data-cache bypassing in `apps/web/src/server/jobs/agent-memory-capture.ts` and `apps/web/src/server/jobs/index.ts`
- [X] T035 [US2] Implement worker decryption, active-connection/destination reauthorization, restricted Raw revision creation, durable state, envelope deletion, and TTL cleanup in `apps/web/src/server/jobs/agent-memory-capture.ts` and `apps/web/src/server/services/agent-memory.ts`
- [X] T036 [US2] Implement private atomic outbox persistence, file permissions, capacity/age limits, deterministic event keys, and recoverable state transitions in `packages/openclaw-memory-bridge/src/outbox.ts`
- [X] T037 [US2] Implement selected-content validation, original-versus-generated capture metadata, and idempotent capture request construction in `packages/openclaw-memory-bridge/src/capture.ts`
- [X] T038 [US2] Register only supported observation hooks for before/after compaction, agent end, session end, Gateway start, and Gateway stop in `packages/openclaw-memory-bridge/src/hooks.ts`
- [X] T039 [US2] Implement the service-owned delivery worker, jittered retry, recovery, health reporting, abortable stop, and short best-effort flush in `packages/openclaw-memory-bridge/src/service.ts`
- [X] T040 [US2] Surface pending/retry/terminal/durable status without payload, query, title, session-digest, or credential disclosure in `packages/openclaw-memory-bridge/src/diagnostics.ts` and `apps/web/app/api/v2/memory/diagnostics/route.ts`
- [ ] T041 [US2] Add a loader-backed OpenClaw smoke test that proves hooks are registered without claiming compaction veto/durable-before-return semantics in `packages/openclaw-memory-bridge/tests/plugin-loader.test.ts`

**Checkpoint**: Capture remains opt-in and non-blocking. A hook records intent locally, but only a server response with an immutable citation changes its state to durable.

---

## Phase 5: User Story 3 - Retrieve Cross-Agent Context Without Replacing Local Memory (Priority: P2)

**Goal**: Operators can enable a bounded external-memory capability for entitled cross-agent recall while OpenClaw's local memory remains an independent provider.

**Independent Test**: Save a cited decision using A, grant B read access in a fixture, search through B, and confirm B gets only the bounded citation while a local-memory search is neither replaced nor invoked by the bridge.

### Tests for User Story 3

- [ ] T042 [P] [US3] Add v2 recall tests for own/granted scopes, post-selection grant revocation, forgotten/archived records, and indistinguishable unauthorized omission in `apps/web/src/server/services/__tests__/agent-memory-recall.test.ts`
- [ ] T043 [P] [US3] Add bridge tool and prompt-context tests for output bounds, citation rendering, prompt escaping, tool authority, fail-open retrieval, and no local-memory delegation in `packages/openclaw-memory-bridge/tests/tools-and-prompt-context.test.ts`

### Implementation for User Story 3

- [X] T044 [US3] Implement server-derived own, granted, and own-and-granted candidate expansion with immediate pre-serialization authorization and backing-revision recheck in `apps/web/src/server/services/agent-memory.ts`
- [X] T045 [US3] Implement bounded v2 recall request/response handling that never accepts destination, grant, or agent filters in `apps/web/app/api/v2/memory/recall/route.ts`
- [X] T046 [US3] Declare static optional `next_wiki_memory_search`, `next_wiki_memory_save`, `next_wiki_memory_forget`, and `next_wiki_memory_status` tool contracts with manifest parity in `packages/openclaw-memory-bridge/openclaw.plugin.json` and `packages/openclaw-memory-bridge/src/index.ts`
- [X] T047 [US3] Implement optional external search and status tools with v2 scope defaults, safe schemas, bounded output, and immutable citations in `packages/openclaw-memory-bridge/src/tools.ts`
- [X] T048 [US3] Implement per-call allow-once/deny approval interception for model-initiated save and forget, preserving final server authorization, in `packages/openclaw-memory-bridge/src/hooks.ts` and `packages/openclaw-memory-bridge/src/tools.ts`
- [X] T049 [US3] Implement authorized second-phase prompt enrichment with tool-authority verification, post-await activity assertion, strict size/result budget, citation labels, and fail-open behavior in `packages/openclaw-memory-bridge/src/prompt-context.ts`
- [X] T050 [US3] Register prompt enrichment only when explicit conversation and prompt permissions are configured in `packages/openclaw-memory-bridge/src/hooks.ts` and `packages/openclaw-memory-bridge/src/config.ts`
- [ ] T051 [US3] Add an integration test proving bridge search remains a separate tool and leaves a configured local OpenClaw memory provider untouched in `packages/openclaw-memory-bridge/tests/local-memory-coexistence.integration.test.ts`

**Checkpoint**: External retrieval is a clearly labelled optional capability. It cannot leak a source through result shape and cannot become a hidden replacement for local memory.

---

## Phase 6: User Story 4 - Govern Sharing, Privacy, and Recovery (Priority: P2)

**Goal**: The owner deliberately manages connections, grants, retention, promotion, credential recovery, and audit, while bridge keys remain unable to alter policy.

**Independent Test**: Grant B read access to one A destination, verify cited retrieval, revoke it before serialization, attempt an ungranted shared write, rotate/revoke credentials, and inspect redacted audit outcomes.

### Tests for User Story 4

- [ ] T052 [P] [US4] Add service tests for active/expired/revoked read and write grants, destination disablement, rotation during pending delivery, and denied shared writes in `apps/web/src/server/services/__tests__/agent-memory-grants.test.ts`
- [ ] T053 [P] [US4] Add owner management route tests for connection/credential/grant authorization and audit redaction in `apps/web/app/api/api-keys/agent-memory/__tests__/connections-and-grants.test.ts`
- [ ] T054 [P] [US4] Add Playwright coverage for connection creation, confirmation-required revocation, grant management, and generic repair guidance in `apps/web/e2e/agent-memory-management.spec.ts`

### Implementation for User Story 4

- [X] T055 [US4] Implement owner-only read/write grant creation, listing, expiry, revocation, and same-owner enforcement in `apps/web/src/server/services/agent-memory-grants.ts`
- [X] T056 [US4] Implement RESTful owner grant sub-resources in `apps/web/app/api/api-keys/agent-memory/connections/[connectionId]/read-grants/route.ts` and `apps/web/app/api/api-keys/agent-memory/connections/[connectionId]/write-grants/route.ts`
- [X] T057 [US4] Implement owner connection, credential, and grant resource discovery for User Center in `apps/web/app/api/api-keys/agent-memory/connections/[connectionId]/route.ts` and `apps/web/app/api/api-keys/agent-memory/connections/[connectionId]/credentials/route.ts`
- [X] T058 [US4] Implement read/write grant dialogs, expiry/revocation controls, and explicit destructive-action confirmation in `apps/web/src/components/user-center/AgentMemoryConnections.tsx` and `apps/web/src/components/user-center/api-keys/page.tsx`
- [X] T059 [US4] Reauthorize active pending captures by connection/destination at delivery time and cancel/deny work for disabled or revoked connections in `apps/web/src/server/services/agent-memory.ts` and `apps/web/src/server/jobs/agent-memory-capture.ts`
- [X] T060 [US4] Implement reversible forget/archive recall-state changes without source deletion in `apps/web/app/api/v2/memory/records/[memoryId]/route.ts` and `apps/web/src/server/services/agent-memory.ts`
- [X] T061 [US4] Implement owner-authorized promotion from supporting evidence to a newly attributable curated record and immutable evidence link in `apps/web/src/server/services/agent-memory.ts` and `apps/web/app/api/api-keys/agent-memory/connections/[connectionId]/promotions/route.ts`
- [X] T062 [US4] Implement retention/archival policy metadata updates that preserve citations for recallable records and never create/expand grants in `apps/web/src/server/services/agent-memory-retention.ts` and `apps/web/app/api/api-keys/agent-memory/connections/[connectionId]/retention/route.ts`
- [ ] T063 [US4] Add bounded connection/destination/correlation/operation/outcome audit writes and enforce audit/diagnostic field redaction in `apps/web/src/server/services/agent-memory-audit.ts` and `apps/web/src/server/services/agent-memory.ts`
- [X] T064 [US4] Add bridge credential-unavailable, connection-disabled, destination-disabled, and grant-revoked repair categories in `packages/openclaw-memory-bridge/src/diagnostics.ts` and `packages/openclaw-memory-bridge/src/api-client.ts`

**Checkpoint**: Only the owner/session management surface changes sharing or recovery policy. Revocation races omit protected content, and every inspection surface is content- and secret-safe.

---

## Phase 7: User Story 5 - Migrate and Operate the Integration Safely (Priority: P3)

**Goal**: Operators can preview, explicitly approve, resume, and audit a one-time local-memory import without turning the continuous bridge into a synchronizer or modifying source files.

**Independent Test**: Preview selected local sources with no writes, approve an import, interrupt and resume it, then verify attributable idempotent records and reversible recall exclusion while original files remain unchanged.

### Tests for User Story 5

- [ ] T065 [P] [US5] Add source discovery/parser tests for duplicate, malformed, private, oversized, and excluded candidates in `packages/openclaw-memory-migrate/tests/source-discovery.test.ts`
- [ ] T066 [P] [US5] Add preview, approval, interruption/resume, encrypted-ledger, and idempotent-import tests in `packages/openclaw-memory-migrate/tests/migration-run.test.ts`
- [ ] T067 [P] [US5] Add package manifest and clean Gateway installation smoke coverage for the migration utility in `packages/openclaw-memory-migrate/tests/plugin-loader.test.ts`

### Implementation for User Story 5

- [X] T068 [US5] Implement explicit source-selection, normalization, privacy classification, size limits, and preview-only discovery in `packages/openclaw-memory-migrate/src/source-discovery.ts` and `packages/openclaw-memory-migrate/src/preview.ts`
- [X] T069 [US5] Implement a local permission-protected encrypted import ledger with preview, approved, running, completed, failed, and cancelled state transitions in `packages/openclaw-memory-migrate/src/ledger.ts`
- [X] T070 [US5] Implement explicit approval, deterministic source fingerprint/idempotency key generation, resumable import, and no-source-delete guarantees in `packages/openclaw-memory-migrate/src/import-runner.ts`
- [X] T071 [US5] Implement generic v2 import writes with closed `origin=import` provenance and no arbitrary source-path metadata in `packages/openclaw-memory-migrate/src/api-client.ts` and `apps/web/src/server/services/agent-memory.ts`
- [X] T072 [US5] Implement the separate migration package manifest, strict configuration, and one-time command/entry registration in `packages/openclaw-memory-migrate/openclaw.plugin.json`, `packages/openclaw-memory-migrate/src/config.ts`, and `packages/openclaw-memory-migrate/src/index.ts`
- [X] T073 [US5] Document install, secret-reference configuration, preview, approval, resume, upgrade, rotation, disablement, incident recovery, and Gateway-process trust boundary in `docs/openclaw-memory-bridge.md`

**Checkpoint**: Historical import is reviewable and resumable but not continuous; no secret appears in normal commands or examples, and no source file is changed.

---

## Phase 8: Polish and Cross-Cutting Verification

**Purpose**: Complete managed public documentation, targeted public-cache behavior, OpenAPI publication, package release gates, and whole-system validation.

- [X] T074 [P] Add a marker-owned `integrations/openclaw-memory-bridge` guidance page to the sample Wiki beside `integrations/hermes`, link it from the generic Agent Memory/help onboarding content, and use placeholders only in `apps/web/src/server/services/setup-sample-page-definitions.ts` and `apps/web/src/server/services/setup-sample-pages.ts`
- [ ] T075 Implement per-page and help-navigation public cache tags plus successful-mutation-only invalidation in `apps/web/src/server/cache/public-cache.ts`, `apps/web/src/server/services/pages.ts`, and `apps/web/src/server/services/public-content.ts`
- [ ] T076 [P] Add managed-guide collision, rerun, disabled/failed-update, targeted-invalidation, static/ISR, and help-navigation tests in `apps/web/src/server/services/__tests__/setup-sample-pages.test.ts` and `apps/web/e2e/openclaw-memory-guide.spec.ts`
- [X] T077 Regenerate and verify public API documentation from route schemas in `apps/web/public/openapi.json`
- [X] T078 [P] Add bridge package build, archive, clean install, manifest validation, and release gates in `.github/workflows/publish-openclaw-memory-bridge.yml`
- [X] T079 [P] Add migration package build, archive, clean install, manifest validation, and release gates in `.github/workflows/publish-openclaw-memory-migrate.yml`
- [ ] T080 Run focused server, Hermes regression, bridge, and migration test suites from `apps/web/package.json`, `packages/hermes-memory-provider/package.json`, `packages/openclaw-memory-bridge/package.json`, and `packages/openclaw-memory-migrate/package.json`
- [X] T081 Run lint, typecheck, and generated-OpenAPI validation; correct only feature-related failures using `package.json`
- [ ] T082 Run `docker compose up -d --build` and execute the two-connection, grant/revocation, capture/restart, guide-cache, and migration-preview flows in `specs/040-openclaw-memory-integration/quickstart.md`
- [X] T083 Review all new logging, audits, diagnostics, fixtures, and package examples for credentials, raw memory bodies, prompts, tool output, query text, titles, and session-digest leakage in `apps/web/src/server/services/agent-memory-audit.ts` and `packages/openclaw-memory-bridge/src/redaction.ts`

---

## Dependencies and Execution Order

### Phase Dependencies

- **Phase 1** has no dependency and its package/test setup tasks can run in parallel.
- **Phase 2** depends on Phase 1. It blocks all user stories because it establishes the generic server contract, migration, authorization, and capture storage boundary.
- **US1** depends on Phase 2 and is the MVP. It produces separately provisioned, private v2 connections.
- **US2** depends on US1 because captures are attributed to an established connection and canonical Raw record service.
- **US4** depends on Phase 2 and integrates with US1 connection resources. It can be worked in parallel with US2 after the shared service boundary is stable.
- **US3** depends on US1 and the grant service from US4; it can develop bridge-only tool/prompt tests in parallel but must merge after v2 recall/grant semantics are available.
- **US5** depends on US1's generic record/import contract, but its package and local-ledger work can proceed in parallel with US2/US4.
- **Phase 8** depends on the desired stories and releaseable package artifacts.

### User Story Dependencies

```text
Setup
  -> Foundation
     -> US1 (private generic connection MVP)
        -> US2 (asynchronous capture)
        -> US4 (owner governance)
             -> US3 (granted external recall)
        -> US5 (separate migration)
             \-> Polish and release verification
```

### Parallel Opportunities

- T001–T004 can be split across package and test-fixture work.
- After T005–T014, the test tasks for US1 (T015–T017) are independent; T018/T019 and T024/T025 are different-file implementation tracks.
- After US1, server capture work (T029/T032–T035) and bridge outbox/hook work (T030/T031/T036–T041) can proceed in parallel.
- After grant semantics are available, US3 server recall (T042/T044–T045) and bridge tools/prompt enrichment (T043/T046–T050) can proceed in parallel.
- Within US4, management routes/services (T055–T057), UI (T058), retention/promotion (T060–T062), and audit diagnostics (T063–T064) can be split after their shared APIs stabilize.
- Within US5, source discovery/preview (T065/T068), ledger/run state (T066/T069–T070), and package loader work (T067/T072) can be parallelized.
- T074, T076, T078, and T079 modify independent guide/release files and can proceed in parallel after their prerequisites.

## Parallel Example: User Story 2

```text
Task: "Add capture API and worker tests in apps/web/src/server/services/__tests__/agent-memory-captures.test.ts"
Task: "Add outbox state-machine tests in packages/openclaw-memory-bridge/tests/outbox.test.ts"
Task: "Add lifecycle-hook tests in packages/openclaw-memory-bridge/tests/hooks.test.ts"

After the capture contract is fixed:
Task: "Implement capture-ID-only server worker in apps/web/src/server/jobs/agent-memory-capture.ts"
Task: "Implement private bridge outbox in packages/openclaw-memory-bridge/src/outbox.ts"
```

## Implementation Strategy

### MVP First

1. Complete Phase 1 and Phase 2, including generated Drizzle migration verification.
2. Complete US1 through T028.
3. Validate two private connections, v2 record citations, no client-selected destinations, bridge status, and Hermes v1 compatibility.
4. Demonstrate the MVP before enabling lifecycle capture, grants, prompt enrichment, or migration.

### Incremental Delivery

1. Add US2 to make selected lifecycle evidence resilient and non-blocking.
2. Add US4 so owner-managed sharing, recovery, audit, retention, and promotion are explicit.
3. Add US3 only after grant semantics exist; enable optional tools first, then authorized prompt enrichment.
4. Add US5 as a deliberately separate one-time migration capability.
5. Finish Phase 8 before publishing either package.

## Format Validation

- All 83 tasks use the required checkbox, sequential `T001`–`T083` identifiers, and an exact target path; completed implementation and verification tasks are marked `[X]`.
- Every user-story task is labelled `[US1]` through `[US5]`; setup, foundational, and polish tasks have no story label.
- `[P]` appears only on tasks deliberately designed for independent files or test tracks.
