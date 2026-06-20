# Tasks: System-Level AI Support

**Input**: Design documents from `/specs/004-system-ai-support/`
**Prerequisites**: `plan.md`, `spec.md`, `research.md`, `data-model.md`,
`contracts/`, `quickstart.md`

**Tests**: Included because `quickstart.md` defines required automated coverage
for authorization, asynchronous recovery, mixed vector dimensions, SSE
reconnection, privacy, artifact promotion, and OpenAPI generation.

**Organization**: Tasks are grouped by user story. Complete Setup and
Foundational phases first; then deliver stories in priority/dependency order.

## Format: `[ID] [P?] [Story] Description`

- **[P]**: May run in parallel with other tasks in the same phase because it
  works in different files and does not depend on their incomplete output.
- **[Story]**: Maps the task to one user story from `spec.md`.
- Every task names the exact file or directory it changes.

## Phase 1: Setup (Shared Infrastructure)

**Purpose**: Prepare pgvector, configuration, shared contracts, and test support.

- [x] T001 Change the Compose database default to `pgvector/pgvector:0.8.3-pg16` while preserving `POSTGRES_IMAGE` override and existing health/volume settings in `docker-compose.yml`
- [x] T002 Add AI timeout, event retention, artifact retention, and generated-image size settings with safe defaults in `apps/web/src/server/config.ts` and `apps/web/.env.example`
- [x] T003 [P] Define AI enums, inputs, views, action events, search results, citations, and error schemas in `packages/shared/src/ai.ts`
- [x] T004 Export the AI shared contracts from `packages/shared/src/index.ts`
- [x] T005 [P] Add deterministic OpenAI-compatible/OpenRouter fixture server helpers for model, SSE text, embeddings, image, timeout, and malformed responses in `apps/web/test/ai-provider-fixture.ts`
- [x] T006 [P] Add reusable AI database/user/provider/index fixtures and cleanup helpers in `apps/web/test/ai-fixtures.ts`

**Checkpoint**: The project can describe AI contracts, boot a pgvector-capable
database, and run provider-independent tests.

---

## Phase 2: Foundational (Blocking Prerequisites)

**Purpose**: Implement shared persistence, authorization, action execution,
event streaming, privacy, and explicit registration required by every story.

**⚠️ CRITICAL**: No user story implementation starts until this phase is
complete.

### Foundational tests

- [ ] T007 [P] Add migration/schema tests for the vector extension, AI tables, defaults, foreign keys, singleton indexes, and retention fields in `apps/web/src/server/db/ai-schema.test.ts`
- [ ] T008 [P] Add permission tests covering Admin-only AI management, signed-in AI use, API-key denial, and Editor/Admin page-mutation gates in `apps/web/src/server/permissions/ai-permissions.test.ts`
- [ ] T009 [P] Add action lifecycle tests for encrypted TTL inputs, action-id-only queue payloads, ordered events, cancellation, ownership, and sanitized audit metadata in `apps/web/src/server/services/ai-actions.test.ts`
- [ ] T010 [P] Add SSE reconnect tests for `Last-Event-ID`, heartbeat, terminal close, expiry, and unauthorized 404 behavior in `apps/web/src/server/ai/events/action-events.test.ts`
- [ ] T011 [P] Add worker recovery tests for queued/running action re-enqueue, global-disable fail-closed behavior, and retryable provider failures in `apps/web/src/server/jobs/ai-actions.test.ts`

### Foundational implementation

- [ ] T012 Add all AI PostgreSQL enums to `apps/web/src/server/db/schema/enums.ts`
- [ ] T013 Add `ai_settings`, providers, models, capabilities, assignments, entitlements, index generations, page states, vector chunks, actions, encrypted inputs, events, and generated artifacts to `apps/web/src/server/db/schema/index.ts`
- [ ] T014 Create the pgvector extension and AI schema migration in `apps/web/src/server/db/migrations/0009_system_ai_support.sql` and register its snapshot/journal entries in `apps/web/src/server/db/migrations/meta/`
- [ ] T015 Extend test database truncation/setup for all AI tables and the vector extension in `apps/web/test/global-setup.ts`, `apps/web/test/setup.ts`, and `apps/web/test/prepare-e2e-db.mjs`
- [ ] T016 Extend `Action`, `Resource`, scope handling, and `can()` rules for `manage_ai`, AI search/Q&A, text optimization, and image generation in `apps/web/src/server/permissions/index.ts`
- [ ] T017 Implement encryption/decryption helpers for JSON AI credentials and TTL action inputs using existing AES-GCM key material in `apps/web/src/server/crypto/ai-encryption.ts`
- [ ] T018 Implement AI provider/action/error types and redaction-safe normalized errors in `apps/web/src/server/ai/types.ts`
- [ ] T019 Implement the explicit provider factory registry with no dynamic discovery in `apps/web/src/server/ai/registry.ts`
- [ ] T020 Implement AI action creation, encrypted input access, model/provider snapshotting, status transitions, event append/read, cancellation, expiry, and ownership checks in `apps/web/src/server/services/ai-actions.ts`
- [ ] T021 Implement SSE serialization, cursor handling, heartbeat polling, payload bounds, and terminal stream closure in `apps/web/src/server/ai/events/action-events.ts`
- [ ] T022 Add generic AI queue names and action-id-only enqueue helpers in `apps/web/src/server/jobs/runtime.ts`
- [ ] T023 Implement generic AI action worker dispatch, actor/global-state revalidation, cancellation, retry mapping, and boot recovery in `apps/web/src/server/jobs/ai-actions.ts`
- [ ] T024 Register AI queues, handlers, scheduled input/event/artifact cleanup, and interrupted-action recovery explicitly in `apps/web/src/server/jobs/register.ts`
- [ ] T025 Implement action detail, cancellation, SSE events, and Admin audit route handlers with OpenAPI annotations in `apps/web/app/api/ai/actions/[id]/route.ts`, `apps/web/app/api/ai/actions/[id]/events/route.ts`, and `apps/web/app/api/ai/actions/route.ts`

**Checkpoint**: AI work can be queued, resumed, streamed, cancelled, audited,
and cleaned without placing prompt content in pg-boss or permanent audit fields.

---

## Phase 3: User Story 1 - Configure Providers, Models, and AI Purposes (Priority: P1) 🎯 MVP

**Goal**: An Admin can configure multiple system providers, test them, discover
or manually define models/capabilities, and assign compatible models to text,
embedding, and image purposes.

**Independent Test**: Configure two fixture providers, run connection/model
sync jobs, override one capability, assign all three purposes, and verify
incompatible models and non-admin access are rejected.

### Tests for User Story 1

- [ ] T026 [P] [US1] Add provider adapter conformance tests for credential redaction, connection errors, model metadata, SSE parsing, embeddings, images, cancellation, and normalized errors in `apps/web/src/server/ai/providers/provider-conformance.test.ts`
- [ ] T027 [P] [US1] Add Admin service tests for provider CRUD, encrypted secrets, model sync reconciliation, capability precedence, and purpose validation in `apps/web/src/server/services/ai-admin.test.ts`
- [ ] T028 [P] [US1] Add REST route tests for settings, providers, model sync, model overrides, and assignments in `apps/web/app/api/ai/ai-admin-routes.test.ts`
- [ ] T029 [P] [US1] Add Playwright coverage for configuring two providers, syncing models, overriding capability, assigning purposes, and non-admin denial in `apps/web/e2e/ai-admin.spec.ts`

### Implementation for User Story 1

- [ ] T030 [P] [US1] Implement the generic OpenAI-compatible adapter for connection tests, model identity listing, chat SSE, embeddings, and image generation in `apps/web/src/server/ai/providers/openai-compatible.ts`
- [ ] T031 [P] [US1] Implement the OpenRouter adapter for enriched model metadata, output-modality capability mapping, chat streaming, embeddings, and image-output modalities in `apps/web/src/server/ai/providers/openrouter.ts`
- [ ] T032 [US1] Register `openai_compatible` and `openrouter` factories and their capability normalizers in `apps/web/src/server/ai/registry.ts`
- [ ] T033 [US1] Implement global AI settings, provider CRUD, connection test action creation, model sync reconciliation, manual model maintenance, capability overrides, and purpose assignment validation in `apps/web/src/server/services/ai-admin.ts`
- [ ] T034 [US1] Implement provider-test and model-sync action handlers with credential decryption, global-disable checks, and sanitized errors in `apps/web/src/server/jobs/ai-admin.ts`
- [ ] T035 [US1] Register provider-test and model-sync feature dispatch in `apps/web/src/server/jobs/ai-actions.ts`
- [ ] T036 [P] [US1] Implement global settings and purpose assignment REST resources with OpenAPI annotations in `apps/web/app/api/ai/settings/route.ts` and `apps/web/app/api/ai/assignments/[purpose]/route.ts`
- [ ] T037 [P] [US1] Implement provider collection/detail/test/model-sync REST resources with OpenAPI annotations in `apps/web/app/api/ai/providers/route.ts`, `apps/web/app/api/ai/providers/[id]/route.ts`, `apps/web/app/api/ai/providers/[id]/tests/route.ts`, and `apps/web/app/api/ai/providers/[id]/model-syncs/route.ts`
- [ ] T038 [P] [US1] Implement model listing/manual creation/update/capability override REST resources with OpenAPI annotations in `apps/web/app/api/ai/models/route.ts`, `apps/web/app/api/ai/providers/[providerId]/models/route.ts`, `apps/web/app/api/ai/models/[id]/route.ts`, and `apps/web/app/api/ai/models/[id]/capabilities/[capability]/route.ts`
- [ ] T039 [P] [US1] Build provider list/detail forms with secret-preserving updates, test/sync action status, and shared UI primitives in `apps/web/src/components/admin/ai/ProviderList.tsx`, `apps/web/src/components/admin/ai/ProviderForm.tsx`, and `apps/web/src/components/admin/ai/ProviderDetail.tsx`
- [ ] T040 [P] [US1] Build model catalog filtering, capability provenance/override controls, and purpose selectors in `apps/web/src/components/admin/ai/ModelCatalog.tsx` and `apps/web/src/components/admin/ai/PurposeAssignments.tsx`
- [ ] T041 [US1] Create canonical Admin AI overview/provider/model pages and breadcrumbs in `apps/web/app/(admin)/admin/ai/page.tsx`, `apps/web/app/(admin)/admin/ai/providers/page.tsx`, `apps/web/app/(admin)/admin/ai/providers/[id]/page.tsx`, and `apps/web/app/(admin)/admin/ai/models/page.tsx`
- [ ] T042 [US1] Add AI Admin navigation and route titles without creating duplicate entry points in `apps/web/src/components/layout/Navigator.tsx` and `apps/web/src/components/layout/Header.tsx`
- [ ] T043 [US1] Add English and Chinese provider, model, capability, assignment, action-state, and error translations in `apps/web/src/i18n/locales/en.ts` and `apps/web/src/i18n/locales/zh.ts`

**Checkpoint**: Provider/model administration works independently and supplies
validated purpose assignments for later stories.

---

## Phase 4: User Story 2 - Govern AI Features Per User (Priority: P1)

**Goal**: Admins control three fail-closed AI feature switches per user, while
existing role/page permissions remain authoritative.

**Independent Test**: Configure two users with different switches and verify the
next action reflects changes, new users default off, Readers cannot mutate
pages, and global disable prevents outbound requests.

### Tests for User Story 2

- [ ] T044 [P] [US2] Add entitlement service tests for absent-row defaults, Admin updates, disabled users, global disable, and role/page intersection in `apps/web/src/server/services/ai-entitlements.test.ts`
- [ ] T045 [P] [US2] Add REST tests for Admin entitlement reads/updates, self effective state, session-only enforcement, and non-admin denial in `apps/web/app/api/ai/ai-entitlement-routes.test.ts`
- [ ] T046 [P] [US2] Add Playwright coverage for per-user switches, newly registered defaults, immediate revocation, and Reader mutation denial in `apps/web/e2e/ai-entitlements.spec.ts`

### Implementation for User Story 2

- [ ] T047 [US2] Implement effective entitlement lookup, Admin update, active-user checks, global availability reasons, and feature authorization helpers in `apps/web/src/server/services/ai-entitlements.ts`
- [ ] T048 [US2] Initialize fail-closed entitlement behavior for new and existing users without granting AI access in `apps/web/src/server/services/auth.ts` and `apps/web/src/server/seed/index.ts`
- [ ] T049 [P] [US2] Implement Admin user entitlement and current-user effective entitlement routes with OpenAPI annotations in `apps/web/app/api/ai/entitlements/[userId]/route.ts` and `apps/web/app/api/ai/entitlements/me/route.ts`
- [ ] T050 [P] [US2] Build the three-switch Admin user AI access form with availability explanations in `apps/web/src/components/admin/ai/UserAiEntitlementsForm.tsx`
- [ ] T051 [US2] Create the canonical `/admin/users/{id}/ai` page and link it from user management in `apps/web/app/(admin)/admin/users/[id]/ai/page.tsx` and `apps/web/src/components/admin/UserManagementTable.tsx`
- [ ] T052 [US2] Expose effective AI availability to the application shell and hide unavailable AI entry points in `apps/web/src/components/layout/AppShell.tsx` and `apps/web/src/components/layout/types.ts`
- [ ] T053 [US2] Add English and Chinese entitlement labels, provider-disclosure notices, disabled reasons, and authorization errors in `apps/web/src/i18n/locales/en.ts` and `apps/web/src/i18n/locales/zh.ts`

**Checkpoint**: AI capabilities are explicitly governed per user and cannot
elevate Reader or page permissions.

---

## Phase 5: User Story 3 - Find Pages by Meaning (Priority: P1)

**Goal**: Build and administer a rebuildable permission-safe semantic index and
return ranked readable page results.

**Independent Test**: Publish conceptually related fixture pages, build an
index, search with non-matching wording, verify relevant permitted pages rank
first, and confirm republish/delete/permission/model changes reconcile safely.

### Tests for User Story 3

- [ ] T054 [P] [US3] Add deterministic Markdown chunker tests for headings, CJK text, code, links, image alt text, overlap, limits, and stable hashes in `apps/web/src/server/ai/chunking/markdown-chunker.test.ts`
- [ ] T055 [P] [US3] Add index lifecycle tests for build/catch-up/activation/failure, stale-job suppression, delete/restore, mixed dimensions, retry, and boot recovery in `apps/web/src/server/services/ai-index.test.ts`
- [ ] T056 [P] [US3] Add retrieval tests for exact cosine ranking, page grouping, permission filtering, unpublished/deleted exclusion, and bounded excerpts in `apps/web/src/server/services/ai-retrieval.test.ts`
- [ ] T057 [P] [US3] Add index/search REST tests for Admin status/retry and signed-in semantic search action creation in `apps/web/app/api/ai/ai-index-search-routes.test.ts`
- [ ] T058 [P] [US3] Add Playwright coverage for index progress, semantic result ranking, permission leakage prevention, and embedding-model rebuild activation in `apps/web/e2e/ai-search.spec.ts`

### Implementation for User Story 3

- [ ] T059 [P] [US3] Implement deterministic Markdown normalization, heading-aware chunking, overlap, byte limits, and chunk hashes in `apps/web/src/server/ai/chunking/markdown-chunker.ts`
- [ ] T060 [P] [US3] Implement exact pgvector cosine query helpers scoped to one generation in `apps/web/src/server/ai/retrieval/vector-search.ts`
- [ ] T061 [US3] Implement generation creation, page target reconciliation, progress aggregation, catch-up verification, atomic activation, superseding, and retries in `apps/web/src/server/services/ai-index.ts`
- [ ] T062 [US3] Implement embedding batch validation, idempotent chunk replacement, stale target rejection, and page removal handlers in `apps/web/src/server/jobs/ai-index.ts`
- [ ] T063 [US3] Register index rebuild/reconciliation dispatch and startup recovery in `apps/web/src/server/jobs/ai-actions.ts` and `apps/web/src/server/jobs/register.ts`
- [ ] T064 [US3] Enqueue index reconciliation after publish, unpublish, soft-delete, restore, and relevant path/title changes in `apps/web/src/server/services/revisions.ts` and `apps/web/src/server/services/pages.ts`
- [ ] T065 [US3] Implement permission-scoped semantic retrieval, result grouping, canonical links, excerpts, and active-generation query embedding in `apps/web/src/server/services/ai-retrieval.ts`
- [ ] T066 [P] [US3] Implement index collection/detail/page-state/retry REST resources with OpenAPI annotations in `apps/web/app/api/ai/indexes/route.ts`, `apps/web/app/api/ai/indexes/[id]/route.ts`, `apps/web/app/api/ai/indexes/[id]/pages/route.ts`, and `apps/web/app/api/ai/indexes/[id]/page-retries/route.ts`
- [ ] T067 [P] [US3] Implement the session-only semantic search action endpoint with OpenAPI annotations in `apps/web/app/api/ai/searches/route.ts`
- [ ] T068 [P] [US3] Build index generation status, failed-page filtering, retry controls, and active-generation display in `apps/web/src/components/admin/ai/IndexList.tsx` and `apps/web/src/components/admin/ai/IndexDetail.tsx`
- [ ] T069 [P] [US3] Build semantic search form/results with URL-backed query, mode, pagination, loading, and error states in `apps/web/src/components/search/SemanticSearch.tsx`
- [ ] T070 [US3] Create canonical index administration and semantic search pages in `apps/web/app/(admin)/admin/ai/indexes/page.tsx`, `apps/web/app/(admin)/admin/ai/indexes/[id]/page.tsx`, and `apps/web/app/(public)/search/page.tsx`
- [ ] T071 [US3] Add English and Chinese indexing, semantic-search, result, retry, empty-corpus, and degraded-state translations in `apps/web/src/i18n/locales/en.ts` and `apps/web/src/i18n/locales/zh.ts`

**Checkpoint**: Semantic search and index administration function without Q&A,
text optimization, or image generation.

---

## Phase 6: User Story 4 - Ask Questions Across the Wiki (Priority: P2)

**Goal**: Provide persistent, context-aware Wiki Q&A in full-context and RAG
modes with streamed grounded answers and permission-safe citations.

**Independent Test**: Ask the same question in both modes, verify readable
citations, insufficient-evidence handling, full-context capacity rejection, SSE
reconnect, and zero disclosure from an inaccessible page.

### Tests for User Story 4

- [ ] T072 [P] [US4] Add prompt/citation normalization tests for grounded source ids, unknown citation removal, and insufficient evidence in `apps/web/src/server/ai/prompts/wiki-question.test.ts`
- [ ] T073 [P] [US4] Add full-context corpus/capacity tests for readable-page ordering, conservative budget, unknown capacity, and no silent truncation in `apps/web/src/server/services/ai-question.test.ts`
- [ ] T074 [P] [US4] Add Q&A worker tests for full/retrieval modes, provider streaming, entitlement revocation, permission recheck, citations, retry, and sanitized failures in `apps/web/src/server/jobs/ai-question.test.ts`
- [ ] T075 [P] [US4] Add Playwright coverage for the persistent side pane, URL-backed mode, current-page context, streamed answers, citations, reconnect, and protected-page non-disclosure in `apps/web/e2e/ai-chat.spec.ts`

### Implementation for User Story 4

- [ ] T076 [P] [US4] Implement grounded question prompt construction, source identifiers, citation parsing, and insufficient-evidence output in `apps/web/src/server/ai/prompts/wiki-question.ts`
- [ ] T077 [P] [US4] Implement readable full-context corpus loading, deterministic ordering, conservative context budgeting, and capacity errors in `apps/web/src/server/ai/retrieval/full-context.ts`
- [ ] T078 [US4] Implement question action creation for full/retrieval modes, current-page context validation, provider disclosure metadata, and entitlement checks in `apps/web/src/server/services/ai-question.ts`
- [ ] T079 [US4] Implement Wiki question worker streaming, retrieval integration, final permission/citation recheck, usage capture, cancellation, and terminal events in `apps/web/src/server/jobs/ai-question.ts`
- [ ] T080 [US4] Register `wiki_question` dispatch in `apps/web/src/server/jobs/ai-actions.ts`
- [ ] T081 [US4] Implement the Wiki question action endpoint with OpenAPI annotations in `apps/web/app/api/ai/questions/route.ts`
- [ ] T082 [P] [US4] Implement the Zustand session chat store and action/SSE reconnect hooks in `apps/web/src/components/chat/chat-store.ts`, `apps/web/src/hooks/use-ai-action.ts`, and `apps/web/src/hooks/use-ai-chat.ts`
- [ ] T083 [P] [US4] Build the collapsible side pane, mode selector, provider notice, streamed transcript, retry, and citation list in `apps/web/src/components/chat/AiChatPane.tsx`
- [ ] T084 [US4] Mount the chat pane in reader, editor, and Admin layouts and synchronize `ai`/`aiMode` URL parameters in `apps/web/src/components/layout/AppShell.tsx` and `apps/web/src/components/common/PublicLayout.tsx`
- [ ] T085 [US4] Add English and Chinese chat, mode, provider disclosure, citation, insufficient-evidence, capacity, retry, and streaming translations in `apps/web/src/i18n/locales/en.ts` and `apps/web/src/i18n/locales/zh.ts`

**Checkpoint**: Authorized users can ask grounded Wiki questions in both modes
without any page mutation capability.

---

## Phase 7: User Story 5 - Optimize Selected Wiki Text (Priority: P2)

**Goal**: Let an entitled Editor/Admin request, compare, accept, or reject an AI
replacement for exactly the selected Markdown range.

**Independent Test**: Optimize a selection, verify preview and unchanged
unselected text, accept/reject behavior, stale-selection protection, and no save
or publish before the normal editor workflow.

### Tests for User Story 5

- [ ] T086 [P] [US5] Add optimization service/worker tests for entitlement, Editor/Admin permission, input limits, replacement-only output, cancellation, and no page writes in `apps/web/src/server/services/ai-optimization.test.ts`
- [ ] T087 [P] [US5] Add CodeMirror selection-hash and exact-range application tests in `apps/web/src/components/editor/AiTextOptimizationDialog.test.tsx`
- [ ] T088 [P] [US5] Add Playwright coverage for request/preview/accept/reject, stale selection refusal, Reader denial, and revision creation only after normal Save in `apps/web/e2e/ai-editor-optimization.spec.ts`

### Implementation for User Story 5

- [ ] T089 [US5] Implement optimization action validation, encrypted selection input, page edit checks, text-model assignment snapshot, and input capacity bounds in `apps/web/src/server/services/ai-optimization.ts`
- [ ] T090 [US5] Implement optimization prompt execution and final replacement event without page persistence in `apps/web/src/server/jobs/ai-optimization.ts`
- [ ] T091 [US5] Register `text_optimization` dispatch in `apps/web/src/server/jobs/ai-actions.ts`
- [ ] T092 [US5] Implement the text optimization action endpoint with OpenAPI annotations in `apps/web/app/api/ai/optimizations/route.ts`
- [ ] T093 [US5] Build the optimization dialog, original/suggestion comparison, selection hash guard, exact CodeMirror transaction, and reject flow in `apps/web/src/components/editor/AiTextOptimizationDialog.tsx` and `apps/web/src/components/editor/SplitMarkdownEditor.tsx`
- [ ] T094 [US5] Add English and Chinese optimization toolbar, instructions, preview, stale-selection, limit, entitlement, and provider error translations in `apps/web/src/i18n/locales/en.ts` and `apps/web/src/i18n/locales/zh.ts`

**Checkpoint**: Text optimization changes only the local draft selection and
relies on the existing Save/Publish versioning path.

---

## Phase 8: User Story 6 - Generate a Relevant Page Illustration (Priority: P3)

**Goal**: Let an entitled Editor/Admin generate a private preview from page or
selected content and explicitly promote it into a normal Wiki asset.

**Independent Test**: Generate from both scopes, preview privately, discard one,
promote another, insert the returned asset reference, and verify normal asset
permissions/publication while failures leave the draft unchanged.

### Tests for User Story 6

- [ ] T095 [P] [US6] Add image generation service/worker tests for assigned model use, source scoping, URL/data/bytes responses, validation, limits, expiry, and sanitized failures in `apps/web/src/server/services/ai-image-generation.test.ts`
- [ ] T096 [P] [US6] Add artifact service tests for owner/Admin preview, unauthorized 404, discard, expiry, idempotent promotion, entitlement revocation, and existing asset replication in `apps/web/src/server/services/ai-artifacts.test.ts`
- [ ] T097 [P] [US6] Add Playwright coverage for page/selection generation, preview, discard, promotion, Markdown insertion, Reader denial, and publish visibility in `apps/web/e2e/ai-editor-image.spec.ts`

### Implementation for User Story 6

- [ ] T098 [US6] Implement image action validation, page/selection source loading, edit/entitlement checks, and image-model snapshotting in `apps/web/src/server/services/ai-image-generation.ts`
- [ ] T099 [US6] Implement image provider execution, bounded remote fetch/data decoding, existing image validation, hashing, and temporary artifact persistence in `apps/web/src/server/jobs/ai-image-generation.ts`
- [ ] T100 [US6] Register `image_generation` dispatch and expired-artifact cleanup in `apps/web/src/server/jobs/ai-actions.ts` and `apps/web/src/server/jobs/ai-cleanup.ts`
- [ ] T101 [US6] Implement artifact owner lookup, private preview serving, discard, and idempotent promotion through the existing asset write path in `apps/web/src/server/services/ai-artifacts.ts`
- [ ] T102 [P] [US6] Implement image generation and artifact preview/discard/promotion routes with OpenAPI annotations in `apps/web/app/api/ai/images/route.ts`, `apps/web/app/api/ai/generated-artifacts/[id]/route.ts`, and `apps/web/app/api/ai/generated-artifacts/[id]/asset/route.ts`
- [ ] T103 [P] [US6] Build image source/aspect controls, streamed status, private preview, confirm/discard actions, and error states in `apps/web/src/components/editor/AiImageGenerationDialog.tsx`
- [ ] T104 [US6] Integrate generated-image promotion and cursor insertion into the CodeMirror image workflow in `apps/web/src/components/editor/SplitMarkdownEditor.tsx`
- [ ] T105 [US6] Add English and Chinese image generation, source, preview, confirmation, expiry, validation, and unavailable-model translations in `apps/web/src/i18n/locales/en.ts` and `apps/web/src/i18n/locales/zh.ts`

**Checkpoint**: Generated images become normal page assets only after explicit
confirmation and remain governed by existing edit, asset, and publish rules.

---

## Phase 9: Polish & Cross-Cutting Concerns

**Purpose**: Complete observability, documentation, security hardening,
performance validation, and full deployment verification.

- [ ] T106 [P] Build the Admin AI action audit table with user/provider/model/feature/status/time filters and no content-bearing fields in `apps/web/src/components/admin/ai/AiActionAuditTable.tsx`
- [ ] T107 Create the canonical AI action audit page and breadcrumb/title integration in `apps/web/app/(admin)/admin/ai/actions/page.tsx` and `apps/web/src/components/layout/Header.tsx`
- [ ] T108 [P] Add structured redaction tests proving credentials, questions, selected text, responses, image data, and provider bodies never enter logs or permanent audit fields in `apps/web/src/server/ai/ai-privacy.test.ts`
- [ ] T109 Harden provider HTTP clients with connect/request timeouts, cancellation, redirect/response-size limits, header redaction, and retry-after parsing in `apps/web/src/server/ai/providers/http-client.ts`
- [ ] T110 Implement scheduled cleanup of expired action inputs/events, generated artifacts, and superseded index generations in `apps/web/src/server/jobs/ai-cleanup.ts`
- [ ] T111 [P] Add benchmark fixtures for semantic top-five relevance, exact-search latency, indexing throughput, and full-context capacity estimates in `apps/web/src/server/ai/ai-benchmarks.test.ts`
- [ ] T112 Regenerate the REST contract with next-openapi-gen and commit AI paths/schemas in `apps/web/public/openapi.json`
- [ ] T113 [P] Extend API documentation E2E coverage for AI Admin, search, action SSE, optimization, image, and entitlement resources in `apps/web/e2e/api-docs.spec.ts`
- [ ] T114 Run shared/web typecheck, lint, Vitest, and Playwright suites and resolve all failures in `packages/shared/src/ai.ts`, `apps/web/src/server/ai/`, `apps/web/app/api/ai/`, and `apps/web/e2e/`
- [ ] T115 Run `docker compose up -d --build`, verify pgvector extension/health/readiness/worker startup, and record any required corrections in `docker-compose.yml`, `apps/web/instrumentation.ts`, and `specs/004-system-ai-support/quickstart.md`
- [ ] T116 Validate every scenario and failure drill in `specs/004-system-ai-support/quickstart.md` and update that file with final executable commands and observed expected results

**Checkpoint**: All desired stories are deployable, documented, observable,
permission-safe, and verified through the repository's required Compose workflow.

---

## Dependencies & Execution Order

### Phase Dependencies

- **Phase 1 — Setup**: Starts immediately.
- **Phase 2 — Foundational**: Depends on Phase 1 and blocks every story.
- **Phase 3 — US1**: Depends on Phase 2; establishes provider/model assignments.
- **Phase 4 — US2**: Depends on Phase 2; can run alongside US1, using fixtures
  for model availability.
- **Phase 5 — US3**: Depends on Phase 2 and the embedding-provider/assignment
  subset of US1 (T030–T038).
- **Phase 6 — US4**: Depends on US1 text assignment, US2 question entitlement,
  and US3 for retrieval mode. Full-context internals may be built earlier, but
  the story checkpoint requires both modes.
- **Phase 7 — US5**: Depends on US1 text assignment and US2 text entitlement;
  independent of US3/US4.
- **Phase 8 — US6**: Depends on US1 image assignment and US2 image entitlement;
  independent of US3/US4/US5.
- **Phase 9 — Polish**: Depends on all stories selected for release.

### User Story Dependency Graph

```text
Setup -> Foundation -> US1 Provider/Models ----+----> US3 Semantic Search ----> US4 Wiki Q&A
                     \                         |
                      +-> US2 Entitlements ----+----> US5 Text Optimization
                                                \---> US6 Image Generation
```

### User Story Independence

- **US1** delivers complete provider/model administration without user AI tools.
- **US2** delivers complete fail-closed user governance and can be tested with
  fixture assignments.
- **US3** delivers semantic search without chat or editor generation.
- **US4** consumes US3 retrieval but performs no page mutation.
- **US5** modifies only local editor state and uses the normal save path.
- **US6** promotes only confirmed previews into the existing asset path.

### Within Each Story

1. Write and run the listed tests first; confirm they fail for the intended
   missing behavior.
2. Implement services and workers before route handlers.
3. Implement REST contracts before UI integration.
4. Add localized UI and E2E coverage before the story checkpoint.
5. Do not proceed past a checkpoint with permission leakage, synchronous model
   calls, content-bearing queue payloads, or undocumented API changes.

## Parallel Opportunities

### Setup and Foundation

- T003, T005, and T006 can run in parallel.
- T007–T011 can be authored in parallel.
- After schema/contracts exist, T017–T019 can run in parallel before T020–T025.

### User Story 1

```text
T026 provider conformance tests
T027 Admin service tests
T028 REST route tests
T029 E2E flow
```

Then implement T030 and T031 in parallel; T036–T040 can split across API and UI
owners after T033.

### User Story 2

T044–T046 can run in parallel. After T047, route work T049 and component work
T050 can run in parallel.

### User Story 3

T054–T058 can run in parallel. T059 and T060 can run in parallel. After index
services stabilize, API work T066–T067 and UI work T068–T069 can run in
parallel.

### User Story 4

T072–T075 can run in parallel. T076 and T077 can run in parallel. After service
contracts stabilize, T081–T083 can run in parallel before layout integration.

### User Story 5

T086–T088 can run in parallel. Backend work T089–T092 precedes editor
integration T093, while translations T094 can proceed once copy keys are known.

### User Story 6

T095–T097 can run in parallel. After temporary artifact contracts stabilize,
route work T102 and component work T103 can run in parallel before editor
integration T104.

## Implementation Strategy

### MVP First

The strict story-only MVP is **US1** after Setup/Foundation: administrators can
configure providers, understand model capabilities, and select purpose models.

For a user-visible AI MVP, complete:

1. Setup and Foundation
2. US1 provider/model administration
3. US2 entitlements
4. US3 semantic search

This yields governed semantic knowledge retrieval before introducing generative
chat or editor mutations.

### Incremental Delivery

1. **Infrastructure**: pgvector + actions/events/jobs/privacy.
2. **Administration**: US1 provider/model assignments.
3. **Governance**: US2 user switches.
4. **Retrieval**: US3 semantic search and index operations.
5. **Synthesis**: US4 full-context/RAG Wiki Q&A.
6. **Authoring text**: US5 selected-text optimization.
7. **Authoring images**: US6 generated illustration promotion.
8. **Release hardening**: Phase 9.

### Parallel Team Strategy

After Foundation:

- Team A: US1 provider adapters and Admin resources.
- Team B: US2 entitlements and authorization surfaces.
- Once US1 embedding assignment is stable, Team C: US3 indexing/retrieval.
- After US1/US2: Team D can implement US5 while Team E implements US6.
- US4 integrates the completed text provider, entitlement, and retrieval
  contracts.

## Notes

- `[P]` marks only tasks that touch separate files and do not require unfinished
  output from another task in the same parallel set.
- All AI provider network calls belong in pg-boss workers, never route handlers.
- pg-boss payloads contain only action ids; encrypted TTL input rows carry
  content-bearing requests.
- Semantic retrieval and citations must never expose unreadable pages.
- Only Editor/Admin with the corresponding entitlement may apply text or image
  output to a draft.
- Every API task includes next-openapi-gen annotations; T112 regenerates the
  committed document.
- Use `docker compose up -d --build` for final testing.
