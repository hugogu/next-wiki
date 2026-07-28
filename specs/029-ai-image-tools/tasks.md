# Tasks: AI Image Tools

**Input**: Design documents from `specs/029-ai-image-tools/`

**Prerequisites**: [plan.md](./plan.md), [spec.md](./spec.md), [research.md](./research.md), [data-model.md](./data-model.md), [contracts/](./contracts/), [quickstart.md](./quickstart.md)

**Tests**: Required. The feature specification defines independent acceptance tests, and project rules require unit, integration, OpenAPI, lint/type, and UI verification for code changes. Write focused tests before each implementation group.

**Organization**: Tasks are grouped by user story. A user story phase is independently verifiable once its listed foundation dependencies are complete.

## Format: `[ID] [P?] [Story] Description`

- **[P]**: Can run in parallel with other marked tasks after its stated dependencies are ready and without editing the same file.
- **[Story]**: Maps the work to the numbered user story in [spec.md](./spec.md).
- Every task names the concrete file(s) it changes or validates.

## Phase 1: Setup (Shared Test Infrastructure)

**Purpose**: Establish reusable deterministic test fixtures before changing shared authorization and image-action behavior.

- [ ] T001 [P] Create reusable API-key actors, editable page/revision, action-state, and validated image-byte fixtures in `apps/web/src/test/ai-image-tools-fixtures.ts` for REST, worker, and Wiki AI tests.

---

## Phase 2: Foundational (Blocking Prerequisites)

**Purpose**: Add the narrow media authorization vocabulary and one shared image runner before implementing any public, MCP, or Wiki AI story.

**⚠️ CRITICAL**: Complete this phase before beginning a user-story implementation task.

- [ ] T002 [P] Add failure-first role ∩ scope tests for `ai.image`, including Editor/Admin allowance and Reader/under-scoped API-key denial, in `apps/web/src/server/permissions/ai-permissions.test.ts`.
- [ ] T003 [P] Extend enum-mirror tests for the `ai.image` key scope and `media` tool category in `packages/shared/src/api-keys.test.ts`, `packages/shared/src/ai-tools.test.ts`, and `apps/web/src/server/db/ai-tool-schema.test.ts`.
- [ ] T004 Add `ai.image` and `media` to the shared schemas and Drizzle enum mirrors, map only `ai.image` to `use_ai_image_generation`, and preserve all other API-key denials in `packages/shared/src/api-keys.ts`, `packages/shared/src/ai-tools.ts`, `apps/web/src/server/db/schema/enums.ts`, and `apps/web/src/server/permissions/index.ts`.
- [ ] T005 Add the new API-key scope to public API-key OpenAPI literals and localized scope names/descriptions in `apps/web/src/server/api/openapi-schemas.ts`, `apps/web/src/i18n/keys.ts`, `apps/web/messages/en.json`, and `apps/web/messages/zh.json`.
- [ ] T006 Generate the single enum migration with `pnpm db:generate`, retaining only Drizzle-produced files under `apps/web/src/server/db/migrations/` and `apps/web/src/server/db/migrations/meta/`; do not hand-author SQL or journal entries.
- [ ] T007 [P] Add queue-versus-inline-runner, permission-recheck, cancellation, selection-hash, provider-output-validation, and safe-artifact lifecycle tests in `apps/web/src/server/services/ai-image-generation.test.ts` and `apps/web/src/server/jobs/ai-image-generation.test.ts`.
- [ ] T008 Refactor creation, queue dispatch, and execution into an authorization-safe shared image runner in `apps/web/src/server/services/ai-image-generation.ts` and `apps/web/src/server/jobs/ai-image-generation.ts`, keeping REST/MCP queued and reserving inline execution for an existing pg-boss caller.

**Checkpoint**: Key scopes/categories are generated into the database, and all clients can use the same validated image-action runner without executing a provider call in HTTP.

---

## Phase 3: User Story 1 — Generate and Promote an Image Through the Public API (Priority: P1) 🎯 MVP

**Goal**: An eligible Editor/Admin API key can submit a page-bound image request, poll/cancel it, privately preview or discard the result, and idempotently promote it to the existing Markdown-ready asset lifecycle.

**Independent Test**: With an `ai.image` + `edit` API key and configured image model, submit a valid page/revision request, poll a safe completion, preview it privately, promote it twice to the same asset, and save the returned Markdown only through the normal draft flow.

### Tests for User Story 1

- [ ] T009 [P] [US1] Write service tests for public image submission, owner-bound status/cancellation, safe public projection, and API audit metadata in `apps/web/src/server/services/public-ai-images.test.ts`.
- [ ] T010 [P] [US1] Write route contract tests for `202` submit, status polling, `204` cancellation, no-store headers, private binary preview, discard, and asset promotion in `apps/web/app/api/v1/ai/images/routes.test.ts` and `apps/web/app/api/v1/ai/generated-artifacts/routes.test.ts`.
- [ ] T011 [P] [US1] Extend artifact and direct-upload regression tests for page binding, idempotent promotion, expiry/discard denial, and unchanged multipart upload output in `apps/web/src/server/services/ai-artifacts.test.ts` and `apps/web/app/api/v1/assets/route.test.ts`.

### Implementation for User Story 1

- [ ] T012 [US1] Implement a public-image facade with fresh API-key role/scope/page/entitlement checks, owner-existence hiding, public status projection, cancellation, and safe audit linkage in `apps/web/src/server/services/public-ai-images.ts`.
- [ ] T013 [US1] Implement asynchronous public submission through `withPublicApi` in `apps/web/app/api/v1/ai/images/route.ts`, validating the existing page-or-selection input and returning an accepted action resource without provider work.
- [ ] T014 [US1] Implement owner-bound status polling and idempotent cancellation in `apps/web/app/api/v1/ai/images/[actionId]/route.ts`, including only safe terminal errors and artifact URLs.
- [ ] T015 [US1] Implement authenticated no-store preview, discard, and idempotent promotion routes in `apps/web/app/api/v1/ai/generated-artifacts/[artifactId]/route.ts` and `apps/web/app/api/v1/ai/generated-artifacts/[artifactId]/asset/route.ts`.
- [ ] T016 [US1] Add explicit public-domain error mappings, literal image request/response OpenAPI schemas, and route annotations in `apps/web/src/server/api/public-errors.ts`, `apps/web/src/server/api/openapi-schemas.ts`, `apps/web/app/api/v1/ai/images/route.ts`, and `apps/web/app/api/v1/ai/generated-artifacts/[artifactId]/asset/route.ts`.
- [ ] T017 [US1] Regenerate and validate the published REST contract with `pnpm --filter @next-wiki/web openapi:generate`, updating `apps/web/public/openapi.json` and `apps/web/src/server/api/openapi-schemas.test.ts`.
- [ ] T018 [US1] Add an authenticated browser lifecycle test that proves public generation/promotion returns reusable Markdown while leaving page revision/publication unchanged in `apps/web/e2e/public-wiki-api-assets.spec.ts`.

**Checkpoint**: User Story 1 is independently usable as a documented, non-cacheable `/api/v1` media workflow; no internal `/api/ai/*` access rule is broadened.

---

## Phase 4: User Story 2 — Use Image Media Through MCP (Priority: P1)

**Goal**: MCP users can discover non-blocking generation/status/promotion tools and retain compatibility with the existing base64 upload tool.

**Independent Test**: Configure the packaged MCP server with the same eligible API key, create and poll a generated image, promote the ready artifact without byte round-tripping, and verify the Markdown/asset identity matches REST while `upload_image` inputs and output remain unchanged.

### Tests for User Story 2

- [ ] T019 [P] [US2] Add typed REST client and response-shape tests for image submissions, status, artifact metadata, and promotion responses in `packages/mcp-server/src/api-client.test.ts` and `packages/mcp-server/src/shapes.test.ts`.
- [ ] T020 [P] [US2] Add handler, discovery, metadata-alignment, and `upload_image` compatibility tests in `packages/mcp-server/src/tools/tools.test.ts`, `packages/mcp-server/src/tools/upload-image.test.ts`, `packages/mcp-server/src/tool-metadata.test.ts`, and `packages/mcp-server/src/integration.test.ts`.

### Implementation for User Story 2

- [ ] T021 [US2] Add typed public image lifecycle client methods and safe shape transformers in `packages/mcp-server/src/api-client.ts` and `packages/mcp-server/src/shapes.ts`.
- [ ] T022 [US2] Implement strict MCP argument schemas and handlers for `generate_image`, `get_image_generation`, and `promote_generated_image` in `packages/mcp-server/src/tools/generate-image.ts`, `packages/mcp-server/src/tools/get-image-generation.ts`, and `packages/mcp-server/src/tools/promote-generated-image.ts`.
- [ ] T023 [US2] Register the three media tools and their explicit descriptions/metadata while preserving `upload_image` unchanged in `packages/mcp-server/src/server.ts` and `packages/mcp-server/src/tool-metadata.ts`.
- [ ] T024 [US2] Document image tool inputs, asynchronous polling, authorization errors, promotion idempotency, and retained upload compatibility in `packages/mcp-server/README.md`.

**Checkpoint**: User Story 2 transports only public v1 REST semantics; MCP never accesses provider, database, or image storage directly.

---

## Phase 5: User Story 3 — Let Wiki AI Generate Page Media Safely (Priority: P1)

**Goal**: Wiki AI can call static, governed media tools to generate and promote a private asset under the initiating user, then return Markdown for a separate normal draft operation.

**Independent Test**: With media tools enabled for an eligible Editor, ask Wiki AI for a page illustration; confirm its pg-boss question action creates/finishes a child image action, returns a bounded safe artifact result, promotes it on request, and leaves all page revisions/publication unchanged.

### Tests for User Story 3

- [ ] T025 [P] [US3] Add static-catalog and review-floor tests for both media tools and their category in `apps/web/src/server/services/ai-tool-registry.test.ts` and `apps/web/src/server/services/ai-tool-policy.test.ts`.
- [ ] T026 [P] [US3] Add executor/runtime tests for validated page-bound arguments, permission loss, safe summary redaction, promotion idempotency, and no implicit draft write in `apps/web/src/server/services/ai-tool-executors.test.ts`, `apps/web/src/server/services/ai-tool-runtime.test.ts`, and `apps/web/src/server/services/ai-tool-runtime.permissions.test.ts`.
- [ ] T027 [P] [US3] Add AI-question service/worker tests proving child image generation runs inline only inside the existing pg-boss action, honors cancellation/tool deadlines, and records safe timeline events in `apps/web/src/server/services/ai-question.test.ts` and `apps/web/src/server/jobs/ai-question.test.ts`.

### Implementation for User Story 3

- [ ] T028 [US3] Register `generate_image` and `promote_generated_image` with explicit JSON argument contracts, `media` category, `immediate_write` risk, and bounded retention in `apps/web/src/server/services/ai-tool-registry.ts`.
- [ ] T029 [US3] Define the non-page-mutation media review floor and category enablement behavior in `apps/web/src/server/services/ai-tool-policy.ts`, so policy cannot silently turn an image operation into a revision/publication bypass.
- [ ] T030 [US3] Implement Zod-validated media executors that use the resolved actor/context, return only safe IDs/metadata/Markdown, and delegate artifact promotion to existing services in `apps/web/src/server/services/ai-tool-executors.ts`.
- [ ] T031 [US3] Wire media executor dispatch and structured safe tool-call audit/event summaries through `apps/web/src/server/services/ai-tool-runtime.ts` and `apps/web/src/server/services/ai-actions.ts`.
- [ ] T032 [US3] Invoke the shared image runner from the existing question worker without enqueuing a duplicate job, and keep cancellation/deadline behavior inside background execution in `apps/web/src/server/jobs/ai-question.ts` and `apps/web/src/server/services/ai-question.ts`.
- [ ] T033 [US3] Update tool-catalog prompt coverage so model-visible descriptions tell it to pass returned Markdown to the existing draft tool rather than mutate a page, in `apps/web/src/server/services/ai-runtime-settings.test.ts` and `apps/web/src/server/services/ai-tool-registry.ts`.

**Checkpoint**: User Story 3 can generate and upload a private image from a Wiki AI turn without provider execution in HTTP, raw bytes in the transcript, or an automatic content change.

---

## Phase 6: User Story 4 — Govern Costly and Private Media Operations (Priority: P2)

**Goal**: Administrators can inspect and govern media tools, while privacy, lifecycle, entitlement, and audit behavior remain enforced for every media entry point.

**Independent Test**: Compare an entitled Editor key, under-scoped Editor key, Reader key, disabled account, and unrelated owner against generation/preview/promotion; only the eligible owner succeeds, denied attempts create no action/artifact/asset, and Admin UI can independently enable or disable media tools.

### Tests for User Story 4

- [ ] T034 [P] [US4] Add media category filtering, enablement, scope-label, and English/Chinese translation coverage in `apps/web/src/components/admin/ai/AiToolsPanel.test.tsx`, `apps/web/src/i18n/messages.test.ts`, and `apps/web/src/components/user-center/ApiKeyCreateDialog.test.tsx`.
- [ ] T035 [P] [US4] Extend public media denial/retention tests for cross-owner existence hiding, revoked entitlement/page access at execution, expired/discarded artifacts, and zero-state denial outcomes in `apps/web/src/server/services/public-ai-images.test.ts` and `apps/web/src/server/services/ai-artifacts.test.ts`.

### Implementation for User Story 4

- [ ] T036 [US4] Add the URL-restorable `media` category filter and policy controls to the existing Admin tools surface in `apps/web/src/components/admin/ai/AiToolsPanel.tsx`.
- [ ] T037 [US4] Add media-category labels in `apps/web/src/i18n/keys.ts`, `apps/web/messages/en.json`, and `apps/web/messages/zh.json`.
- [ ] T038 [US4] Surface the `ai.image` scope through the existing API-key creation UI without changing other scope behavior in `apps/web/src/components/user-center/ApiKeyCreateDialog.tsx` and `apps/web/app/(user)/user-center/api-keys/page.tsx`.
- [ ] T039 [US4] Harden safe request/action/artifact audit metadata and expiry/discard/promote transition handling, retaining no prompt, selection text, provider secret, or image bytes, in `apps/web/src/server/services/public-ai-images.ts`, `apps/web/src/server/services/ai-artifacts.ts`, and `apps/web/src/server/services/ai-actions.ts`.
- [ ] T040 [US4] Add browser coverage for Admin media enable/disable, API-key scope visibility, and no automatic page mutation in `apps/web/e2e/admin-ai-tools.spec.ts`, `apps/web/e2e/api-keys.spec.ts`, and `apps/web/e2e/content-images.spec.ts`.

**Checkpoint**: User Story 4 independently proves that media is an attributable, reversible private workflow governed by role, scope, feature entitlement, page permission, tool policy, and retention.

---

## Phase 7: Polish & Cross-Cutting Verification

**Purpose**: Regenerate derived artifacts and verify the integrated feature against the repository’s operational standards.

- [ ] T041 [P] Re-run `pnpm db:generate` after all schema work and confirm it reports no changes against `apps/web/src/server/db/schema/` and `apps/web/src/server/db/migrations/meta/`.
- [ ] T042 [P] Regenerate OpenAPI and run schema drift coverage with `pnpm --filter @next-wiki/web openapi:generate` against `apps/web/public/openapi.json` and `apps/web/src/server/api/openapi-schemas.test.ts`.
- [ ] T043 [P] Run focused web service/job/route/component tests for the image lifecycle and tool policy files under `apps/web/src/server/services/`, `apps/web/src/server/jobs/`, `apps/web/app/api/v1/ai/`, and `apps/web/src/components/admin/ai/`.
- [ ] T044 [P] Run the complete MCP server test suite and build/type/lint checks for `packages/mcp-server/src/` and `packages/mcp-server/package.json`.
- [ ] T045 [P] Run web lint, TypeScript, and localization validation for `apps/web/src/`, `apps/web/messages/`, and `apps/web/package.json`.
- [ ] T046 Run the affected Playwright suites against the Docker Compose environment defined by `docker-compose.yml`, covering `apps/web/e2e/public-wiki-api-assets.spec.ts`, `apps/web/e2e/admin-ai-tools.spec.ts`, `apps/web/e2e/api-keys.spec.ts`, and `apps/web/e2e/content-images.spec.ts`.
- [ ] T047 Reconcile implementation evidence with the REST, MCP, Wiki AI, privacy, retention, and no-page-mutation scenarios in `specs/029-ai-image-tools/quickstart.md` and record any intentional deviations in `specs/029-ai-image-tools/plan.md`.

---

## Dependencies & Execution Order

### Phase Dependencies

```text
Setup (T001)
  └── Foundational authorization + generated migration + shared runner (T002–T008)
        ├── US1: Public REST lifecycle (T009–T018)  ← MVP
        │     └── US2: MCP transport (T019–T024)
        ├── US3: Wiki AI media tools (T025–T033)
        │     └── US4: Admin governance and denial matrix (T034–T040)
        └── Polish and integrated verification (T041–T047)
```

### User Story Dependencies

- **US1 (P1)**: Starts after T008; it is the independently deployable REST/OpenAPI MVP.
- **US2 (P1)**: Starts after the US1 REST resource contracts are stable (T012–T017); it must call only those v1 resources.
- **US3 (P1)**: Starts after T008 and can proceed in parallel with US1 route work; it shares the common runner but not the public facade.
- **US4 (P2)**: Starts after the shared `media` category (T004) and static Wiki AI tools (T028); it validates all external and internal governance paths.
- **Polish**: Starts after all selected stories are complete; T041/T042 are mandatory generated-artifact gates before handoff.

### Within Each User Story

- Complete the listed tests before their corresponding implementation tasks.
- Preserve the authorization intersection on every call: active Editor/Admin, correct API-key scope where applicable, live entitlement, page edit authority, and owner/tenant binding.
- Keep all generation asynchronous except the shared-runner invocation inside the existing pg-boss Wiki AI action.
- Do not add image bytes, prompts, selection text, provider secrets, or internal errors to REST bodies, MCP responses, or chat timeline events.

## Parallel Opportunities

### Foundation

```text
Task: T002 "Permission matrix tests in apps/web/src/server/permissions/ai-permissions.test.ts"
Task: T003 "Enum mirror tests in packages/shared/src/ and apps/web/src/server/db/ai-tool-schema.test.ts"
Task: T007 "Shared runner tests in apps/web/src/server/services/ and apps/web/src/server/jobs/"
```

### User Story 1

```text
Task: T009 "Public facade tests in apps/web/src/server/services/public-ai-images.test.ts"
Task: T010 "Public v1 route tests in apps/web/app/api/v1/ai/"
Task: T011 "Artifact/upload regression tests in apps/web/src/server/services/ai-artifacts.test.ts and apps/web/app/api/v1/assets/route.test.ts"
```

### User Story 2

```text
Task: T019 "MCP client and shape tests in packages/mcp-server/src/"
Task: T020 "MCP tool/discovery compatibility tests in packages/mcp-server/src/"
```

### User Story 3

```text
Task: T025 "Registry and policy tests in apps/web/src/server/services/"
Task: T026 "Runtime redaction tests in apps/web/src/server/services/"
Task: T027 "Question service/worker tests in apps/web/src/server/services/ai-question.test.ts and apps/web/src/server/jobs/ai-question.test.ts"
```

## Implementation Strategy

### MVP First (US1 Only)

1. Complete T001–T008, including the Drizzle-generated enum migration and shared worker runner.
2. Complete T009–T018 to deliver the governed REST/OpenAPI lifecycle.
3. Verify an authorized API key can generate, poll, preview, promote, and separately draft the resulting Markdown, while denied callers create no state.
4. Stop for a reviewable REST MVP before adding new external transport or Wiki AI surface area.

### Incremental Delivery

1. Foundation → common authorization and image lifecycle are ready.
2. US1 → public REST/OpenAPI media capability is usable independently.
3. US2 → MCP gains the same capability without duplicated domain logic.
4. US3 → Wiki AI uses the same runner and asset workflow from its existing job context.
5. US4 → Admin governance, privacy matrix, and UI controls complete the product surface.
6. Polish → regenerate schema/OpenAPI and run focused, package, Docker, and browser checks.

### Parallel Team Strategy

After T008, one developer can implement US1 public resources, a second can prepare US3 registry/runtime work, and a third can prepare US2 transport tests. Merge order remains US1 resource contracts first, US3 static tool wiring next, then US2 and US4; coordinate all changes to shared enums, `ai-image-generation.ts`, and `ai-tool-registry.ts` to avoid file conflicts.

## Notes

- `[P]` tasks change independent files and are safe to parallelize only after their preceding dependencies are complete.
- Every public route remains private and non-cacheable; anonymous published-page cache rules are unaffected.
- Run `pnpm db:generate` only through Drizzle and confirm the final invocation is clean; never create migration SQL, snapshot, or journal records by hand.
- Commit each completed logical task group according to the repository workflow.
