# Tasks: Hermes Memory Provider

**Input**: Design documents from `/specs/039-hermes-memory-provider/`

**Prerequisites**: [plan.md](./plan.md), [spec.md](./spec.md),
[research.md](./research.md), [data-model.md](./data-model.md), and
[contracts/hermes-memory-rest-api.md](./contracts/hermes-memory-rest-api.md)

**Tests**: Tests are required by the feature specification and repository
policy. Write each listed test before its implementation task and demonstrate
that it fails for the intended missing behavior first.

**Organization**: Tasks are grouped by user story. The foundation establishes
the server-enforced destination boundary so that no provider feature can rely on
a client-supplied page path or Hermes profile for authorization.

## Phase 1: Setup (Shared Infrastructure)

**Purpose**: Create the independently distributable provider project and the
release/compatibility scaffolding without adding a Python runtime to the Wiki
deployment.

- [X] T001 [P] Create the Python distribution scaffold, `src/` package layout, package-data declarations, test configuration, and development dependencies in `packages/hermes-memory-provider/pyproject.toml`.
- [X] T002 [P] Add the package-level public surface and empty discovery modules in `packages/hermes-memory-provider/src/next_wiki_memory/__init__.py`, `packages/hermes-memory-provider/src/next_wiki_memory/cli.py`, and `packages/hermes-memory-provider/src/next_wiki_memory/config_schema.py`.
- [X] T003 [P] Add a reusable mock-Wiki HTTP fixture and a Hermes contract fixture in `packages/hermes-memory-provider/tests/conftest.py` and `packages/hermes-memory-provider/tests/fixtures/hermes_memory_provider.py`.
- [X] T004 [P] Create the tag-triggered wheel publishing and minimum/current Hermes compatibility workflow in `.github/workflows/publish-hermes-memory-provider.yml` using `hermes-memory-provider-v*` tags.

---

## Phase 2: Foundational (Blocking Prerequisites)

**Purpose**: Establish the shared contracts, database model, key-to-destination
authorization, public-API integration, and server service boundary required by
every user story.

**⚠️ CRITICAL**: No user-story route or provider work begins until the
destination binding, scopes, migration, and error/audit foundation is complete.

- [X] T005 [P] Add failing scope and memory-contract serialization tests in `packages/shared/src/api-keys.test.ts` and `packages/shared/src/hermes-memory.test.ts`.
- [X] T006 [P] Add failing schema/index coverage for the memory namespace, key binding, record, and evidence-link tables in `apps/web/src/server/db/hermes-memory-schema.test.ts`.
- [X] T007 [P] Add failing permission-resolution tests for missing scopes, unbound keys, disabled destinations, and cross-destination IDs in `apps/web/src/server/permissions/hermes-memory.test.ts`.
- [ ] T008 [P] Add failing public-error, audit-origin, and OpenAPI registration tests in `apps/web/src/server/api/public-errors.test.ts`, `apps/web/src/server/api/audit-wrapper.test.ts`, and `apps/web/src/server/api/openapi-schemas.test.ts`.
- [X] T009 Define `memory.read`, `memory.write`, and `memory.delete`, shared request/response/error schemas, bounded validation constants, and public exports in `packages/shared/src/api-keys.ts`, `packages/shared/src/hermes-memory.ts`, and `packages/shared/src/index.ts`.
- [X] T010 Define the Hermes memory enums, namespace/binding/record/evidence-link tables, ownership/state checks, unique idempotency constraint, and recall indexes in `apps/web/src/server/db/schema/enums.ts`, `apps/web/src/server/db/schema/hermes-memory.ts`, and `apps/web/src/server/db/schema/index.ts`.
- [X] T011 Generate the database migration with `pnpm db:generate` from `apps/web/src/server/db/schema/hermes-memory.ts`, commit only the generated `apps/web/src/server/db/migrations/*.sql`, `apps/web/src/server/db/migrations/meta/*.json`, and `apps/web/src/server/db/migrations/meta/_journal.json` changes, then rerun the command and confirm it reports no schema changes.
- [X] T012 Implement the destination-binding resolver and dedicated-memory scope guards, deriving the namespace only from the authenticated key, in `apps/web/src/server/permissions/hermes-memory.ts` and `apps/web/src/server/permissions/index.ts`.
- [X] T013 Register safe Hermes public error codes, non-cacheable OpenAPI schemas, and `hermes` audit origin with content-free audit metadata in `apps/web/src/server/api/public-errors.ts`, `apps/web/src/server/api/openapi-schemas.ts`, `apps/web/src/server/api/audit-wrapper.ts`, `packages/shared/src/audit.ts`, and `apps/web/src/server/services/audit.ts`.
- [X] T014 Create the shared service types, safe connection/diagnostic result builders, normal-page/revision adapter boundary, and transaction helpers in `apps/web/src/server/services/hermes-memory.ts`.
- [X] T015 Add the authenticated Hermes-memory route wrapper that composes `withPublicApi`, destination binding, scope checks, audit attribution, Zod validation, and `Cache-Control: no-store` in `apps/web/app/api/v1/hermes/memory/_shared.ts`.

**Checkpoint**: The server has a migrated, tested, server-enforced destination
boundary; API routes can be added without trusting client profile/path data.

---

## Phase 3: User Story 1 - Connect Hermes to a Personal Wiki (Priority: P1) 🎯

**Goal**: Make an externally installed `next-wiki` provider selectable through
Hermes setup, provision a least-privilege bound key in the Wiki, and expose only
credential-safe status and diagnostics.

**Independent Test**: Provision a dedicated key, install the wheel, run `hermes
memory setup`, select `next-wiki`, then run status/check and verify the Wiki
identity is shown while the key and response bodies are never printed.

### Tests for User Story 1

- [X] T016 [P] [US1] Add API-key provisioning/reuse/rotation tests for owner-only destination selection and immutable memory scopes in `apps/web/src/server/services/api-keys.test.ts`.
- [ ] T017 [P] [US1] Add connection and diagnostics route contract tests for valid, revoked, unbound, disabled, forbidden, incompatible, redirect, and timeout cases in `apps/web/app/api/v1/hermes/memory/connection/route.test.ts` and `apps/web/app/api/v1/hermes/memory/diagnostics/route.test.ts`.
- [ ] T018 [P] [US1] Add UI tests for the Hermes-memory key preset, new-versus-shared destination choice, and scope explanations in `apps/web/src/components/user-center/ApiKeyCreateDialog.test.tsx`.
- [X] T019 [P] [US1] Add provider discovery and no-network availability tests in `packages/hermes-memory-provider/tests/test_provider_registration.py` and `packages/hermes-memory-provider/tests/test_availability.py`.
- [X] T020 [P] [US1] Add provider config-schema parity, config migration, secret redaction, no-positional-secret, and dry-run-no-write tests in `packages/hermes-memory-provider/tests/test_config.py`, `packages/hermes-memory-provider/tests/test_config_schema.py`, and `packages/hermes-memory-provider/tests/test_redaction.py`.
- [X] T021 [P] [US1] Add bounded HTTP client and CLI diagnostic tests for Bearer authentication, HTTPS/loopback checks, 401/403/404/426/timeout/redirect repair guidance, and never echoing bodies/secrets in `packages/hermes-memory-provider/tests/test_api_client.py` and `packages/hermes-memory-provider/tests/test_cli.py`.
- [X] T022 [US1] Extend dedicated API-key creation to transactionally create a private namespace or explicitly bind an owner-selected shared namespace in `apps/web/src/server/services/api-keys.ts`.
- [X] T023 [US1] Add the Hermes-memory key preset and destination selection/reveal/revocation guidance to `apps/web/src/components/user-center/ApiKeyCreateDialog.tsx`, `apps/web/src/components/user-center/ApiKeyList.tsx`, `apps/web/messages/en.json`, and `apps/web/messages/zh.json`.
- [X] T024 [US1] Implement the content-free `GET /api/v1/hermes/memory/connection` contract in `apps/web/app/api/v1/hermes/memory/connection/route.ts` using `apps/web/src/server/services/hermes-memory.ts`.
- [X] T025 [US1] Implement the safe `GET /api/v1/hermes/memory/diagnostics` contract and safe operational outcome lookup in `apps/web/app/api/v1/hermes/memory/diagnostics/route.ts` and `apps/web/src/server/services/hermes-memory.ts`.
- [X] T026 [US1] Implement versioned non-secret configuration, one-source CLI/Desktop field declarations, secret-presence handling, and centralized redaction in `packages/hermes-memory-provider/src/next_wiki_memory/config.py`, `packages/hermes-memory-provider/src/next_wiki_memory/config_schema.py`, and `packages/hermes-memory-provider/src/next_wiki_memory/redaction.py`.
- [X] T027 [US1] Implement the bounded Bearer client and safe diagnostic classification in `packages/hermes-memory-provider/src/next_wiki_memory/api_client.py`.
- [X] T028 [US1] Implement `MemoryProvider` registration, local-only `is_available`, initialization with supplied `hermes_home`, `register(ctx)`, and unavailable repair messages in `packages/hermes-memory-provider/src/next_wiki_memory/__init__.py`.
- [X] T029 [US1] Implement active-provider `hermes next-wiki status|check` commands and standalone pre-activation `next-wiki-hermes-memory init [--dry-run]` with prompt/stdin/environment secret handling in `packages/hermes-memory-provider/src/next_wiki_memory/cli.py`.
- [X] T030 [US1] Build the wheel and run the entry-point discovery smoke test against the pinned Hermes fixture in `packages/hermes-memory-provider/tests/test_provider_registration.py` and `packages/hermes-memory-provider/pyproject.toml`.

**Checkpoint**: A user can securely select and diagnose the provider without
modifying Hermes or exposing a credential; no recall/save behavior is required
for this checkpoint.

---

## Phase 4: User Story 2 - Recall and Preserve Grounded Memory (Priority: P1)

**Goal**: Let the configured provider explicitly save, bound-recall, cite, and
reversibly forget records through normal private Wiki page/revision lifecycle.

**Independent Test**: Save a decision in one session, recall it with citation
in a later session under the same key, then prove another destination cannot
read or forget it.

### Tests for User Story 2

- [X] T031 [P] [US2] Add service tests for private page/revision creation, payload/idempotency conflict handling, same-destination evidence-link validation, soft-delete forget, and record-state transitions in `apps/web/src/server/services/hermes-memory.test.ts`.
- [ ] T032 [P] [US2] Add lexical-recall tests proving result bounds, canonical citations, no-result versus unavailable distinction, hidden/deleted revision behavior, and cross-destination isolation in `apps/web/src/server/services/hermes-memory-recall.test.ts`.
- [ ] T033 [P] [US2] Add REST contract tests for recall, create/idempotent update, and forget authorization/error behavior in `apps/web/app/api/v1/hermes/memory/recall/route.test.ts`, `apps/web/app/api/v1/hermes/memory/records/route.test.ts`, and `apps/web/app/api/v1/hermes/memory/records/[memoryId]/route.test.ts`.
- [X] T034 [P] [US2] Add provider tool-schema/dispatch/prefetch tests covering caps, safe JSON failures, toolset/core-name behavior, and durable citations in `packages/hermes-memory-provider/tests/test_tools.py` and `packages/hermes-memory-provider/tests/test_prefetch.py`.
- [X] T035 [US2] Implement normal restricted page/revision create-or-idempotently-return, memory locator updates, evidence-link validation, and normal soft-deletion in `apps/web/src/server/services/hermes-memory.ts`.
- [X] T036 [US2] Implement destination-filtered bounded lexical candidate retrieval and post-retrieval backing-page/revision access rechecks in `apps/web/src/server/services/hermes-memory-recall.ts`.
- [X] T037 [US2] Implement `POST /api/v1/hermes/memory/recall` with query/limit validation, bounded excerpts, and citation responses in `apps/web/app/api/v1/hermes/memory/recall/route.ts`.
- [X] T038 [US2] Implement `POST /api/v1/hermes/memory/records` with atomically validated evidence links and idempotent response semantics in `apps/web/app/api/v1/hermes/memory/records/route.ts`.
- [X] T039 [US2] Implement `DELETE /api/v1/hermes/memory/records/[memoryId]` as an idempotent normal soft-delete operation in `apps/web/app/api/v1/hermes/memory/records/[memoryId]/route.ts`.
- [X] T040 [US2] Implement the uniquely prefixed `next_wiki_memory_search`, `next_wiki_memory_save`, and `next_wiki_memory_forget` schemas/dispatch plus bounded prefetch in `packages/hermes-memory-provider/src/next_wiki_memory/__init__.py`.
- [ ] T041 [US2] Add an HTTP-fixture integration test for provider save → new-session recall → citation → forget and cross-destination denial in `packages/hermes-memory-provider/tests/test_wiki_api_integration.py`.

**Checkpoint**: Explicit Wiki-backed memory delivers recall and reversible
persistence with server-enforced destination isolation and inspectable citations.

---

## Phase 5: User Story 3 - Capture Conversations Without Losing Evidence (Priority: P2)

**Goal**: Add opt-in, privacy-filtered asynchronous capture and capability-gated
strict checkpoints that only acknowledge committed Wiki evidence.

**Independent Test**: With capture enabled, finish/switch/compact a session and
verify one private evidence record per digest, durable checkpoint behavior, and
no tool-output persistence by default.

### Tests for User Story 3

- [ ] T042 [P] [US3] Add evidence submission/poll route tests for validation, idempotent queued/durable/failed transitions, authorization, and checkpoint-not-durable errors in `apps/web/app/api/v1/hermes/memory/evidence/route.test.ts` and `apps/web/app/api/v1/hermes/memory/evidence/[captureId]/route.test.ts`.
- [ ] T043 [P] [US3] Add job tests for `runWithoutDataCache`, bounded retry/overlap handling, private normal-page evidence writes, and durable state transitions in `apps/web/src/server/jobs/hermes-memory-capture.test.ts`.
- [X] T044 [P] [US3] Add lifecycle tests for opt-in-only capture, primary-context filtering, session switch/end flush, tool-result exclusion, daemon non-blocking sync, and secret-safe failures in `packages/hermes-memory-provider/tests/test_capture_lifecycle.py`.
- [X] T045 [P] [US3] Add capability-gated v2 checkpoint tests for digest idempotency, poll-until-durable success, timeout/failure raise, and incompatible host fallback in `packages/hermes-memory-provider/tests/test_checkpoints.py`.
- [X] T046 [US3] Implement bounded normalized-evidence validation, idempotent capture submission/status service methods, and durable Evidence Record creation in `apps/web/src/server/services/hermes-memory.ts`.
- [X] T047 [US3] Implement the registered pg-boss capture handler, durable job state mapping, and cache-context escape in `apps/web/src/server/jobs/hermes-memory-capture.ts`, `apps/web/src/server/jobs/register.ts`, and `apps/web/src/server/jobs/runtime.ts`.
- [X] T048 [US3] Implement asynchronous evidence submission and status polling routes in `apps/web/app/api/v1/hermes/memory/evidence/route.ts` and `apps/web/app/api/v1/hermes/memory/evidence/[captureId]/route.ts`.
- [X] T049 [US3] Implement capture policy persistence, bounded daemon queue, session switch/end/shutdown flushing, and safe non-primary-context behavior in `packages/hermes-memory-provider/src/next_wiki_memory/__init__.py` and `packages/hermes-memory-provider/src/next_wiki_memory/config.py`.
- [ ] T050 [US3] Implement runtime feature detection and the v2 `on_pre_compress` durable checkpoint workflow without advertising strict mode to unsupported Hermes hosts in `packages/hermes-memory-provider/src/next_wiki_memory/__init__.py`.
- [ ] T051 [US3] Add a Docker Compose integration scenario for capture retry, durable evidence page/revision, and strict-checkpoint failure behavior in `packages/hermes-memory-provider/tests/test_docker_integration.py` and `docker-compose.yml`.

**Checkpoint**: Default chats remain non-persistent, enabled capture is
asynchronous and traceable, and strict compression preservation fails closed.

---

## Phase 6: User Story 4 - Configure with In-Product Guidance (Priority: P2)

**Goal**: Make secure Hermes-memory setup discoverable in a fresh Wiki and in
the package/deployment documentation without publishing any integration state or
secrets.

**Independent Test**: Generate onboarding pages on a fresh Wiki, navigate from
welcome/help to the Hermes guide, and follow only it plus the helper to reach a
verified configuration; rerun with a user page at the guide path and verify no
overwrite.

### Tests for User Story 4

- [X] T052 [P] [US4] Extend managed-sample-page tests for the fourth published guide, welcome/main-feature links, rerun idempotency, four cache invalidations, collision protection, and default-space-only collision lookup in `apps/web/src/server/services/setup-sample-pages.test.ts`.
- [ ] T053 [P] [US4] Extend setup route and onboarding Playwright coverage for four outcomes, visible Hermes help content, and collision reporting in `apps/web/app/api/setup/sample-pages/setup-sample-pages-route.test.ts` and `apps/web/e2e/setup-onboarding.spec.ts`.
- [X] T054 [US4] Add the marker-owned published `help/hermes-memory` source, welcome link, and Main Features link in `apps/web/src/server/services/setup-sample-page-definitions.ts`.
- [X] T055 [US4] Resolve the default wiki space before generated-page collision lookup and include the Hermes guide in generated results in `apps/web/src/server/services/setup-sample-pages.ts`.
- [X] T056 [US4] Update setup-step/API descriptive copy and localized four-page results in `apps/web/src/components/setup/SamplePagesStep.tsx`, `apps/web/app/api/setup/sample-pages/route.ts`, `apps/web/messages/en.json`, and `apps/web/messages/zh.json`.
- [X] T057 [US4] Write the npm/PyPI-shipped installation, setup, activation, local/remote/container address, capture/checkpoint, rotation/revoke, backup, and safe-diagnostics guide in `packages/hermes-memory-provider/README.md`.
- [X] T058 [US4] Write deployment/operator guidance and link it from public documentation in `docs/hermes-memory-provider.md`, `docs/deployment.md`, `README.md`, and `packages/mcp-server/README.md`.
- [X] T059 [US4] Validate the documented shell flows, `--dry-run` no-change guarantee, and public guide wording against `specs/039-hermes-memory-provider/quickstart.md` and `packages/hermes-memory-provider/tests/test_cli.py`.

**Checkpoint**: A fresh Wiki exposes an idempotent public guide while all
credentials and operational state remain private.

---

## Phase 7: User Story 5 - Control and Audit an Integration (Priority: P3)

**Goal**: Ensure all memory operations are observable without content leakage
and immediately stop on key revocation, destination disablement, or loss of a
required scope.

**Independent Test**: Use a dedicated key for recall/save, inspect safe audit
entries, revoke it, and confirm operations fail while previously stored pages
remain normally recoverable to the owner.

### Tests for User Story 5

- [ ] T060 [P] [US5] Add audit tests proving Hermes origin, endpoint/result/correlation metadata, and key identity are recorded while secrets, queries, profiles, transcript bodies, and upstream response bodies are absent in `apps/web/src/server/services/audit.test.ts` and `apps/web/src/server/services/hermes-memory.test.ts`.
- [ ] T061 [P] [US5] Add public-route tests for revoked/disabled/missing-scope behavior, post-revocation non-access, and key-bound record indistinguishability in `apps/web/app/api/v1/hermes/memory/connection/route.test.ts`, `apps/web/app/api/v1/hermes/memory/recall/route.test.ts`, and `apps/web/app/api/v1/hermes/memory/records/[memoryId]/route.test.ts`.
- [ ] T062 [P] [US5] Add user-center end-to-end coverage for provision, safe audit visibility, key revocation, and failed provider recheck in `apps/web/e2e/api-keys.spec.ts`.
- [X] T063 [US5] Refine API-key authentication state resolution and the memory service so revoked/disabled/unbound/scope failures are safely classified, audited, and never reveal a destination record in `apps/web/src/server/services/api-keys.ts`, `apps/web/src/server/services/hermes-memory.ts`, and `apps/web/app/api/v1/hermes/memory/_shared.ts`.
- [ ] T064 [US5] Add safe Hermes audit operation/correlation mapping and query/content redaction enforcement in `apps/web/src/server/services/audit.ts`, `apps/web/src/server/api/audit-wrapper.ts`, and `packages/shared/src/audit.ts`.
- [X] T065 [US5] Ensure API-key revocation and namespace disablement immediately disable all bound memory operations while preserving normal page/revision recovery paths in `apps/web/src/server/services/api-keys.ts`, `apps/web/src/server/services/hermes-memory.ts`, and `apps/web/src/components/user-center/ApiKeyList.tsx`.
- [X] T066 [US5] Add provider-side recovery messaging for revoked, forbidden, unbound, disabled, unavailable, and ambiguous not-found responses in `packages/hermes-memory-provider/src/next_wiki_memory/api_client.py` and `packages/hermes-memory-provider/src/next_wiki_memory/cli.py`.

**Checkpoint**: Owners can audit and revoke an integration safely; the provider
does not turn a failed operation into a false persistence or recall claim.

---

## Phase 8: Polish & Cross-Cutting Validation

**Purpose**: Validate the complete external contract, migration discipline,
security properties, release build, and deployment behavior.

- [X] T067 [P] Verify every new Hermes-memory route appears with correct security, schemas, errors, and no-cache response behavior in `apps/web/src/server/api/openapi-schemas.test.ts` and `apps/web/app/api/v1/public-route-architecture.test.ts`.
- [ ] T068 [P] Add regression coverage that generic page scopes and Raw/Generated space access cannot authorize the dedicated memory surface in `apps/web/src/server/permissions/hermes-memory.test.ts` and `apps/web/app/api/v1/hermes/memory/recall/route.test.ts`.
- [ ] T069 [P] Build/install the wheel against the documented minimum and current Hermes versions, proving entry-point, `cli.py`, Desktop schema, lifecycle hook, toolset gate, and provider-name collision compatibility in `packages/hermes-memory-provider/tests/test_hermes_compatibility.py` and `.github/workflows/publish-hermes-memory-provider.yml`.
- [ ] T070 [P] Review all emitted provider/server messages and documentation for credential, content, profile, session-ID, and raw-error leakage in `packages/hermes-memory-provider/src/next_wiki_memory/redaction.py`, `apps/web/src/server/services/hermes-memory.ts`, and `docs/hermes-memory-provider.md`.
- [X] T071 Run `pnpm db:generate` after all schema work and confirm no pending changes from `apps/web/src/server/db/schema/hermes-memory.ts`; do not hand-author migration files under `apps/web/src/server/db/migrations/`.
- [ ] T072 Run focused Vitest, pytest, Playwright, and OpenAPI suites for `apps/web/src/server/services/hermes-memory.test.ts`, `apps/web/app/api/v1/hermes/memory/recall/route.test.ts`, `apps/web/e2e/setup-onboarding.spec.ts`, and `packages/hermes-memory-provider/tests/`.
- [ ] T073 Run workspace typecheck, lint, package wheel build, and Docker Compose end-to-end validation using `package.json`, `packages/hermes-memory-provider/pyproject.toml`, and `docker-compose.yml`; fix only feature-related failures.
- [ ] T074 Re-run every command and manual scenario in `specs/039-hermes-memory-provider/quickstart.md`, recording supported Hermes version/commit evidence and any compatibility limits in `docs/hermes-memory-provider.md`.

---

## Dependencies & Execution Order

### Phase Dependencies

- **Setup (Phase 1)**: No dependencies; T001–T004 can run in parallel.
- **Foundational (Phase 2)**: Depends on the package/release scaffolding where
  needed, and blocks every user story. Complete T005–T015 before a provider can
  make a memory request.
- **US1 (Phase 3)**: Depends on Foundation. It establishes secure provisioning
  and the provider lifecycle.
- **US2 (Phase 4)**: Depends on Foundation and US1's authenticated provider
  client/configuration. It is the first useful memory MVP.
- **US3 (Phase 5)**: Depends on Foundation and US1; it uses the established
  provider lifecycle and destination service, but does not depend on recall.
- **US4 (Phase 6)**: Documentation and sample-page code can begin after
  Foundation; validate it after US1 so the guide reflects the actual helper and
  API-key UI.
- **US5 (Phase 7)**: Depends on US1/US2 routes because it verifies their audit
  and revocation behavior.
- **Polish (Phase 8)**: Depends on all desired user stories.

### User Story Dependencies

- **US1 (P1)**: Starts after Foundation; independently delivers discoverable,
  safely configured connection and diagnostics.
- **US2 (P1)**: Requires US1's client/configuration; independently validates
  grounded explicit save/recall/forget once configured.
- **US3 (P2)**: Requires the provider selected in US1; can otherwise progress
  in parallel with US2 after service contracts are stable.
- **US4 (P2)**: Requires Foundation for sample-page behavior and validates after
  US1 so its documented setup flow is truthful; it does not require US2/US3.
- **US5 (P3)**: Verifies capabilities delivered by US1 and US2.

### Within Each User Story

- Write all test tasks first and confirm the relevant tests fail.
- Complete schema/permission/service work before routes.
- Complete Wiki routes before Python HTTP dispatch and lifecycle wiring.
- Exercise each independent scenario at the stated checkpoint before accepting
  the next story.

### Parallel Opportunities

- T001–T004, T005–T008, and the test tasks marked `[P]` can proceed in parallel.
- After Foundation and US1 configuration/client work, US2 record/recall and US3
  capture work can be assigned to separate developers if they coordinate
  `apps/web/src/server/services/hermes-memory.ts` changes.
- US4 sample-page/UI work, documentation, and their tests can run in parallel
  with the server-side memory implementation because they touch separate files.
- Phase 8 tasks T067–T070 can run in parallel before the final command suite.

## Parallel Example: User Story 2

```text
Task: "T031 service lifecycle tests in apps/web/src/server/services/hermes-memory.test.ts"
Task: "T032 recall isolation tests in apps/web/src/server/services/hermes-memory-recall.test.ts"
Task: "T033 route contracts in apps/web/app/api/v1/hermes/memory/recall/route.test.ts"
Task: "T034 provider tools in packages/hermes-memory-provider/tests/test_tools.py"
```

After those tests exist, separate work can proceed on T036 (recall service) and
T040 (provider tools); T037–T039 wait on the corresponding service methods.

## Implementation Strategy

### Recommended MVP (US1 + US2)

1. Complete Setup and the security-critical Foundation.
2. Complete US1 and prove package discovery, bound key provisioning, and safe
   setup/diagnostics.
3. Complete US2 and prove the explicit save → cited recall → forget path.
4. Stop and validate that end-to-end flow before enabling any automatic
   conversation capture or release publication.

US1 alone proves safe connection but does not yet provide memory value; US1 plus
US2 is therefore the recommended externally useful MVP.

### Incremental Delivery

1. Setup + Foundation → enforceable server boundary.
2. US1 → install/configure/diagnose a selected provider.
3. US2 → explicit, inspectable Wiki memory.
4. US3 → opt-in evidence preservation and strict checkpoints where supported.
5. US4 → fresh-instance discoverability and operator documentation.
6. US5 → revocation/audit operational confidence, then release validation.

### Parallel Team Strategy

1. One developer completes Foundation migrations, permissions, and API wrapper.
2. After US1's config/client contract is stable:
   - Developer A: US2 Wiki service and REST routes.
   - Developer B: US3 capture job and provider lifecycle.
   - Developer C: US4 help-page, localization, and documentation.
3. Integrate US5 audit/revocation tests, then execute Phase 8 together.

## Notes

- `[P]` means the task can run in parallel because it edits different files.
- `[US#]` labels retain user-story traceability.
- Never accept a namespace, profile, page path, or API key in a tool argument.
- Do not hand-author Drizzle migrations; T011 and T071 must use `pnpm db:generate`.
- Commit after a coherent completed task group and keep refactors separate from
  feature behavior changes.
