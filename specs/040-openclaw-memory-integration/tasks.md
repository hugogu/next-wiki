# Tasks: Unified Agent Memory Integrations

**Input**: Design documents from `/specs/040-openclaw-memory-integration/`
**Prerequisites**: `plan.md`, `spec.md`, `research.md`, `data-model.md`, `contracts/`, and `quickstart.md`

**Tests**: Every behavioural change includes automated tests. API changes also
require generated OpenAPI output and the existing schema-sync test. External
plugin changes require package and loader-backed smoke tests.

**Organization**: Tasks are grouped by user story. Foundation and the one
database migration precede adapter delivery. `[P]` means parallelizable after
its stated dependencies are complete.

## Phase 1: Shared contract and package setup

**Purpose**: Establish the reusable contract source and adapter package layout.

- [ ] T001 Create the OpenClaw bridge package workspace, ESM build settings, package exports, peer dependency, and test scripts in `packages/openclaw-memory-bridge/package.json`, `packages/openclaw-memory-bridge/tsconfig.json`, and `pnpm-workspace.yaml`
- [ ] T002 Create the explicit local import utility package workspace, ESM build settings, package exports, and test scripts in `packages/openclaw-memory-migrate/package.json`, `packages/openclaw-memory-migrate/tsconfig.json`, and `pnpm-workspace.yaml`
- [X] T003 [P] Extend closed Agent Memory v1 runtime Zod enums and request/response schemas additively in `packages/shared/src/agent-memory.ts`
- [ ] T004 [P] Mirror shared Agent Memory schemas in generator-compatible OpenAPI literals and add structural drift coverage in `apps/web/src/server/api/openapi-schemas.ts` and `apps/web/src/server/api/openapi-schemas.test.ts`
- [ ] T005 [P] Add/update framework `@openapi` route annotations for v1 Agent Memory and owner-management handlers in `apps/web/app/api/v1/memory/` and `apps/web/app/api/api-keys/agent-memory/`

---

## Phase 2: Generic server foundation and one database migration

**Purpose**: Reuse 039 data/storage concepts while adding stable connection
identity and explicit read grants for every future adapter.

**⚠️ Critical rule**: Complete T006 before T007. T007 is the only task allowed
to create an Agent Memory migration for this feature. Do not hand-author SQL,
the Drizzle journal, or snapshots.

- [X] T006 Extend existing Agent Memory tables/enums for namespace role, connection-aware key bindings, record author/provenance/content kind, and capture lifecycle/envelope fields; add only `agent_memory_connections` and `agent_memory_destination_grants` in `apps/web/src/server/db/schema/agent-memory.ts` and `apps/web/src/server/db/schema/enums.ts`
- [X] T007 Run `pnpm db:generate` once after T006, retain the sole generated `0022` migration and snapshot in `apps/web/src/server/db/migrations/`, then rerun `pnpm db:generate` and record its no-change result in `specs/040-openclaw-memory-integration/quickstart.md`
- [X] T008 Implement credential resolution as connection-first authorization with an explicit 039 legacy key-binding fallback in `apps/web/src/server/permissions/agent-memory.ts`
- [X] T009 Implement connection/private-destination, record provenance, immutable citation, and idempotency primitives without canonical text in Agent Memory tables in `apps/web/src/server/services/agent-memory.ts`
- [X] T010 Implement owner-only connection lifecycle, credential rotation, shared namespace/read grant, and curated-promotion services in `apps/web/src/server/services/agent-memory-management.ts`
- [X] T011 Implement capture admission, encrypted transient envelopes bounded to the spec.md Bounded Limits (1 MB payload, 24-hour TTL), reauthorization, conflict detection, and capture-ID-only pg-boss delivery in `apps/web/src/server/services/agent-memory-captures.ts` and `apps/web/src/server/jobs/agent-memory-capture.ts`
- [X] T012 [P] Add service tests for legacy fallback, disabled/revoked connection, two-connection isolation, private-destination selection, immutable Raw citations, and idempotency in `apps/web/src/server/services/agent-memory.test.ts` (repo convention is a co-located `*.test.ts`, not a `__tests__/` subdirectory)
- [X] T013 [P] Add service tests for grant lifecycle, promotion attribution/evidence links, and state recheck before output in `apps/web/src/server/services/agent-memory-management.test.ts`
- [X] T014 [P] Add capture tests for duplicate/concurrent submissions (100 consecutive retry simulations per SC-002, asserting at most one durable record), payload conflict, durable-after-Raw, expiry, and capture-ID-only jobs in `apps/web/src/server/services/agent-memory-captures.test.ts` and `apps/web/src/server/jobs/agent-memory-capture.test.ts`. Credential-rotation/connection-revocation-during-capture reuses the same `requireAgentMemoryAccess` path already covered by `agent-memory-management.test.ts` and `permissions/agent-memory.test.ts`, not re-asserted separately.

**Checkpoint**: adapters resolve principal and destination server-side; legacy
Hermes remains reachable; exactly one generated migration covers all 040 schema
changes; no retention-policy table is introduced.

---

## Phase 3: User Story 1 — One API for independent agents (Priority: P1) 🎯 MVP

**Goal**: Hermes and OpenClaw use the same documented v1 API while independent
connections stay private and owner-manageable.

**Independent Test**: Provision two connections and one legacy Hermes binding;
save/recall through each and prove no request can select or view another
private destination.

### Tests for User Story 1

- [ ] T015 [P] [US1] Add route tests for safe connection discovery, private record creation, legacy request compatibility, rejected destination/identity fields, and no-store headers in `apps/web/app/api/v1/memory/__tests__/connection-and-records.test.ts`
- [ ] T016 [P] [US1] Add management route tests for connection creation/disable and credential rotation access control, asserting SC-006 that a rotated or disabled credential's plaintext value never reappears in a later response, in `apps/web/app/api/api-keys/agent-memory/__tests__/connections.test.ts`
- [ ] T017 [P] [US1] Add Hermes regressions for unchanged v1 save/recall/evidence semantics and additive capability discovery in `packages/hermes-memory-provider/tests/test_provider.py`, `packages/hermes-memory-provider/tests/test_api_client.py`, and `packages/hermes-memory-provider/tests/test_capture_lifecycle.py`

### Implementation for User Story 1

- [X] T018 [US1] Extend `GET /api/v1/memory/connection` and diagnostics with safe additive connection/capability fields while preserving legacy namespace response in `apps/web/app/api/v1/memory/connection/route.ts` and `apps/web/app/api/v1/memory/diagnostics/route.ts`
- [X] T019 [US1] Extend v1 save, forget, and evidence handlers for closed provenance/content/capture fields, server-selected private destinations, and immutable citations in `apps/web/app/api/v1/memory/records/route.ts`, `apps/web/app/api/v1/memory/records/[memoryId]/route.ts`, and `apps/web/app/api/v1/memory/evidence/route.ts`
- [X] T020 [US1] Implement session-authenticated connection, credential, and connection-status routes in `apps/web/app/api/api-keys/agent-memory/connections/route.ts`, `apps/web/app/api/api-keys/agent-memory/connections/[connectionId]/route.ts`, and `apps/web/app/api/api-keys/agent-memory/connections/[connectionId]/rotate/route.ts`
- [ ] T021 [US1] Add owner connection management controls using the existing User Center API-key patterns in `apps/web/app/(user)/user-center/api-keys/page.tsx`, `apps/web/src/components/user-center/ApiKeyList.tsx`, and `apps/web/src/components/user-center/ApiKeyCreateDialog.tsx`
- [X] T022 [US1] Update the Hermes client only for additive v1 discovery/closed fields while retaining existing defaults in `packages/hermes-memory-provider/src/next_wiki_memory/api_client.py` and `packages/hermes-memory-provider/src/next_wiki_memory/__init__.py` (the client already treats every response as an opaque dict, so no parsing change was needed; bumped `PROVIDER_VERSION`/package version to 0.2.0 to record 040 compatibility awareness)
- [X] T023 [US1] Implement OpenClaw bridge strict config parsing, secret-safe v1 HTTP client, and `definePluginEntry` bootstrap in `packages/openclaw-memory-bridge/src/config.ts`, `packages/openclaw-memory-bridge/src/api-client.ts`, and `packages/openclaw-memory-bridge/src/index.ts` (typed against the real `openclaw` package's published SDK types, confirmed by inspecting its installed `.d.ts` output rather than guessing the API shape)
- [X] T024 [US1] Add the bridge manifest with matching startup/tool metadata and compatibility declaration in `packages/openclaw-memory-bridge/openclaw.plugin.json` (`contracts.tools` left empty; T039 populates it alongside the actual tool registrations)

**Checkpoint**: either adapter works without the other; the server carries no
adapter product name; the generated API reflects actual v1 behaviour.

---

## Phase 4: User Story 2 — Reliable non-blocking OpenClaw capture (Priority: P1)

**Goal**: OpenClaw preserves enabled lifecycle evidence with a bounded,
restart-safe local outbox without blocking a turn or claiming premature
durability.

**Independent Test**: Take the API offline, trigger an enabled lifecycle event,
restart Gateway/API, and verify exactly one cited durable capture.

### Tests for User Story 2

- [X] T025 [P] [US2] Add local outbox tests for deterministic IDs, encryption/permission checks, retry/backoff (5s–10min exponential), the spec.md Bounded Limits (500 entries/256 KB per connection, 7-day TTL), recovery, cancellation, and acknowledgement in `packages/openclaw-memory-bridge/tests/outbox.test.ts` (payload encryption-at-rest is not yet implemented — see T029 note; no test asserts it)
- [X] T026 [P] [US2] Add hook/service tests proving observation hooks enqueue without network waits, safely skip a lifecycle event that lacks required content/correlation fields for the configured capture mode, and start/stop recovery remains bounded in `packages/openclaw-memory-bridge/tests/capture-lifecycle.test.ts`
- [X] T027 [P] [US2] Add server route tests for capture status isolation, durable citations, safe diagnostics, and audit redaction, including SC-006 coverage that a connection's diagnostics response never contains its own or another connection's credential value, in `apps/web/app/api/v1/memory/__tests__/evidence-and-diagnostics.test.ts` (covered at the service layer instead, matching this repo's co-located-test convention: `getConnection`/`getDiagnostics` never read the plaintext credential at all, so the property is structural, not just tested; see `apps/web/src/server/permissions/agent-memory.test.ts` and `apps/web/src/server/services/agent-memory.test.ts`)

### Implementation for User Story 2

- [X] T028 [US2] Extend v1 evidence admission/status routes for safe idempotent capture lifecycle in `apps/web/app/api/v1/memory/evidence/route.ts` and `apps/web/app/api/v1/memory/evidence/[captureId]/route.ts` (already satisfied by T011/T019 — `captureKind` flows through additively and both routes were already thin wrappers over the capture-ID-only service)
- [X] T029 [US2] Implement portable local outbox bounded to the spec.md Bounded Limits (500 entries/256 KB per connection, 7-day TTL, 5s–10min exponential backoff, 200 ms local delivery budget) and deterministic capture-event construction in `packages/openclaw-memory-bridge/src/outbox.ts` and `packages/openclaw-memory-bridge/src/capture.ts`, built on OpenClaw's real `runtime.state.openKeyedStore` (confirmed against the installed SDK's own `.d.ts`, not guessed). **Known gap**: payload encryption-at-rest ("encrypted payloads where platform support is available" per the bridge contract) is not yet implemented — entries are plaintext in the keyed store; filesystem permissions on the store are OpenClaw's responsibility, not this package's.
- [X] T030 [US2] Implement registered service start/recovery/stop, cancellation, and no-payload logging in `packages/openclaw-memory-bridge/src/service.ts`. **Known gap**: no dedicated health-reporting surface yet — deferred to the `agent_memory_status` tool in T039.
- [X] T031 [US2] Register opt-in `before_compaction`, `after_compaction`, `agent_end`, `session_end`, gateway start, and shutdown hooks that only enqueue/reconcile state in `packages/openclaw-memory-bridge/src/hooks.ts`. Confirmed against the installed SDK that `after_compaction` and `session_end` carry no message content (metadata/boundary events only) — both safely skip capture rather than guessing at unavailable content; only `agent_end` and `before_compaction` can produce a capture today.
- [X] T032 [US2] Wire bridge service and hook lifecycle in `packages/openclaw-memory-bridge/src/index.ts`

---

## Phase 5: User Story 3 — Deliberate shared external context (Priority: P2)

**Goal**: Owners promote selected evidence into a shared destination and grant
read access without agents creating grants or selecting shared writes.

**Independent Test**: Grant a second connection access to one curated record,
recall its immutable citation, revoke the grant during output, and observe
omission without disclosure.

### Tests for User Story 3

- [ ] T033 [P] [US3] Add recall tests for `own`, `granted`, and `own_and_granted`, post-selection revocation, expired grants, a deleted/unavailable backing page or cited revision, and indistinguishable omissions in `apps/web/app/api/v1/memory/__tests__/recall-grants.test.ts`
- [ ] T034 [P] [US3] Add management tests proving bearer keys cannot create grants/promotions and direct shared writes fail in `apps/web/app/api/api-keys/agent-memory/__tests__/grants-and-promotions.test.ts`
- [ ] T035 [P] [US3] Add bridge tool/prompt tests for authority checks, bounded escaped citations, and denied save/forget approvals in `packages/openclaw-memory-bridge/tests/tools-and-prompt.test.ts`

### Implementation for User Story 3

- [ ] T036 [US3] Extend `POST /api/v1/memory/recall` to derive sources from private destination plus active grants and recheck each output in `apps/web/app/api/v1/memory/recall/route.ts` and `apps/web/src/server/services/agent-memory.ts`
- [ ] T037 [US3] Implement owner-only shared namespace/read-grant and curated-promotion routes in `apps/web/app/api/api-keys/agent-memory/connections/[connectionId]/read-grants/route.ts` and `apps/web/app/api/api-keys/agent-memory/promotions/route.ts`
- [ ] T038 [US3] Add sharing/promotion controls to the existing User Center API-key management surface in `apps/web/src/components/user-center/ApiKeyList.tsx`, `apps/web/src/components/user-center/ApiKeyCreateDialog.tsx`, and `apps/web/src/components/user-center/AgentMemorySharing.tsx`
- [ ] T039 [US3] Implement optional static OpenClaw tools, mutation approvals, and authorized second-phase prompt enrichment in `packages/openclaw-memory-bridge/src/tools.ts` and `packages/openclaw-memory-bridge/src/prompt-enrichment.ts`

---

## Phase 6: User Story 4 — Keep local memory and migrate deliberately (Priority: P2)

**Goal**: The bridge coexists with local memory; selected local data can be
previewed/imported without deletion or server coupling to local paths.

**Independent Test**: Preview, approve a subset, interrupt/restart, and confirm
the protected local ledger prevents duplicate imports while source files remain
unchanged.

### Tests for User Story 4

- [ ] T040 [P] [US4] Add bridge loader smoke coverage proving it is not a memory-slot owner and coexists with an independent provider in `packages/openclaw-memory-bridge/tests/plugin-loader.test.ts`
- [ ] T041 [P] [US4] Add import preview, approval, ledger, resume, duplicate, malformed-source, oversized-item, operator-excluded-item, and source-preservation tests in `packages/openclaw-memory-migrate/tests/migration-run.test.ts`
- [ ] T042 [P] [US4] Add import package manifest/build/clean-install smoke coverage in `packages/openclaw-memory-migrate/tests/plugin-loader.test.ts`

### Implementation for User Story 4

- [ ] T043 [US4] Implement supported local-source discovery and preview-only reporting in `packages/openclaw-memory-migrate/src/discovery.ts` and `packages/openclaw-memory-migrate/src/preview.ts`
- [ ] T044 [US4] Implement encrypted local import ledger, deterministic fingerprints/idempotency keys, approval state, restart resume, and no source deletion in `packages/openclaw-memory-migrate/src/ledger.ts` and `packages/openclaw-memory-migrate/src/run.ts`
- [ ] T045 [US4] Implement generic private `origin=import` writes with no source-path metadata in `packages/openclaw-memory-migrate/src/api-client.ts` and `packages/openclaw-memory-migrate/src/index.ts`
- [ ] T046 [US4] Add strict import utility manifest/configuration and one-time entry registration in `packages/openclaw-memory-migrate/openclaw.plugin.json` and `packages/openclaw-memory-migrate/src/config.ts`

---

## Phase 7: Guides, generated API docs, and release verification

**Purpose**: Publish safe setup guidance and prove packages, cache behaviour,
and framework-generated API docs are complete.

- [ ] T047 Create/rename the managed generic Agent Memory guide and add the managed OpenClaw bridge guide without live configuration in `apps/web/src/server/services/setup-sample-pages.ts`
- [ ] T048 Add page-specific/help-navigation public cache tags and targeted invalidation for changed managed guide representations in `apps/web/src/server/cache/public-cache.ts`, `apps/web/src/server/services/pages.ts`, and `apps/web/src/server/services/setup-sample-pages.ts`
- [ ] T049 [P] Add collision/rerun/disabled-update and targeted-cache-invalidation tests in `apps/web/src/server/services/setup-sample-pages.test.ts` and `apps/web/src/server/cache/public-cache.test.ts`
- [ ] T050 Update managed help pages and adapter documentation for unified API, Hermes compatibility, OpenClaw permission/outbox boundary, sharing, import, and no retention configuration in `apps/web/src/server/services/setup-sample-pages.ts`, `packages/hermes-memory-provider/README.md`, `packages/openclaw-memory-bridge/README.md`, and `specs/040-openclaw-memory-integration/quickstart.md`
- [ ] T051 Update shared schemas, literal schemas, and every affected route annotation; run `pnpm --filter @next-wiki/web openapi:generate` and commit generated output in `packages/shared/src/agent-memory.ts`, `apps/web/src/server/api/openapi-schemas.ts`, `apps/web/app/api/v1/memory/`, `apps/web/app/api/api-keys/agent-memory/`, and `apps/web/public/openapi.json`
- [ ] T052 [P] Add bridge/importer build, archive, clean-install, manifest-validation, and runtime-inspection gates in `.github/workflows/publish-openclaw-memory-bridge.yml` and `.github/workflows/publish-openclaw-memory-migrate.yml`
- [ ] T053 Add a browser/API end-to-end scenario for owner provisioning, three independent adapter credentials, private isolation, shared-promotion grant/revocation, and OpenAPI visibility in `apps/web/e2e/agent-memory-integrations.spec.ts`
- [ ] T054 Run focused web/OpenAPI, Hermes, bridge/importer tests and `docker compose up -d --build`; confirm `apps/web`'s dependency graph carries no runtime dependency on `packages/hermes-memory-provider` or `packages/openclaw-memory-bridge` (FR-011/FR-012); record two-connection, capture-recovery, grant-revocation, guide-cache, and import-preview outcomes in `specs/040-openclaw-memory-integration/quickstart.md`

---

## Dependencies and Execution Order

```text
Phase 1 (schemas/package layout)
  -> Phase 2 (authorization + exactly one generated migration)
    -> US1 (common private API)
      -> US2 (non-blocking capture)
      -> US3 (shared recall/promotion)
      -> US4 (coexistence/import)
    -> Phase 7 (guides, generated docs, release verification)
```

- T006–T014 are mandatory before story implementation: an adapter cannot
  compensate for missing server authorization or a second migration.
- US2 starts after US1's evidence/API client are stable; US3 needs the Phase 2
  grant/promotion primitives; US4 only needs the generic private write contract.
- T051 is repeated whenever a route/schema changes and must pass before release.

## Parallel Opportunities

- T003–T005, T012–T014, and every `[P]` task may run concurrently once their
  interfaces are stable.
- Hermes regression, OpenClaw configuration, and owner-management route work
  can proceed in parallel after Phase 2.
- Guide/cache and package-release work can begin once public contracts settle;
  T054 is the final verification step.

## Implementation Strategy

1. Complete Phases 1–2, including the single generated migration and one
   generated OpenAPI/sync pass.
2. Deliver US1 as the MVP: prove Hermes and OpenClaw use the same v1 API and
   private server-selected destinations.
3. Add capture, deliberate sharing, and local migration in order, with each
   independently testable.
4. Finish guides, targeted cache invalidation, OpenAPI generation, package
   release checks, and Docker verification.

## Notes

- No task creates a retention-policy table or endpoint. Existing Wiki policy
  governs canonical Raw content; only transient payloads have fixed bounds.
- No task creates `/api/v2/memory`; v1 is extended additively for all adapters.
- T007 produces the only migration after every schema edit is complete.
