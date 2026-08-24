# Tasks: Governed Web Research for Wiki AI

**Input**: Design documents from specs/036-web-research/

**Prerequisites**: plan.md, spec.md, research.md, data-model.md, quickstart.md,
and contracts/

**Tests**: Tests are required by the project engineering rules and the feature
acceptance scenarios. Create focused tests before each implementation group and
use deterministic connector fixtures; never call a paid Tavily endpoint in
automation.

**Organization**: Tasks are grouped by user story. A story can be validated at
its checkpoint once its stated dependencies are complete.

## Format: [ID] [P?] [Story] Description

- **[P]**: Can proceed in parallel because the task writes different files and
  does not rely on an incomplete task.
- **[Story]**: Maps a task to its user story.
- Every task names the concrete source, test, generated-artifact, or
  documentation path it changes.

## Phase 1: Setup (Shared Test Infrastructure)

**Purpose**: Establish deterministic, server-only research test support without
adding a runtime service or an external secret.

- [ ] T001 Create deterministic Tavily search/extract response fixtures in apps/web/src/server/web-research/__fixtures__/tavily.ts
- [ ] T002 [P] Create connector mock and time-control helpers in apps/web/src/server/web-research/test-helpers.ts
- [ ] T003 [P] Create authenticated browser test helpers for web-research setup in apps/web/e2e/fixtures/web-research.ts

---

## Phase 2: Foundational (Blocking Prerequisites)

**Purpose**: Add the shared contracts, persistence, authorization, audit, and
configuration boundaries that every research workflow requires.

**⚠️ CRITICAL**: Complete this phase before starting user-story implementation.

- [ ] T004 Add failing research-mode and discriminated-citation compatibility tests in packages/shared/src/ai.test.ts
- [ ] T005 Implement ResearchMode, WikiCitation | WebCitation, historical citation parsing, and question input schemas in packages/shared/src/ai.ts
- [ ] T006 [P] Add failing web tool-category and provider-key contract tests in packages/shared/src/ai-tools.test.ts
- [ ] T007 Add the web category and built-in web tool contract types in packages/shared/src/ai-tools.ts
- [ ] T008 Define web-research enums, encrypted settings fields, ai_web_sources, and ai_web_research_attempts in apps/web/src/server/db/schema/enums.ts, apps/web/src/server/db/schema/ai-tools.ts, and apps/web/src/server/db/schema/index.ts
- [ ] T009 Generate the Drizzle migration and matching snapshot with pnpm db:generate in apps/web/src/server/db/migrations/ and apps/web/src/server/db/migrations/meta/; never hand-author either artifact
- [ ] T010 Add schema/default/index and generated-migration regression coverage in apps/web/src/server/db/ai-tool-schema.test.ts
- [ ] T011 Add failing AI-action feature and request-metadata lifecycle tests for web_research_test and web_evidence_capture in apps/web/src/server/services/ai-actions.test.ts
- [ ] T012 Register the two action features, encrypted inputs, idempotency, and safe action views in apps/web/src/server/services/ai-actions.ts and apps/web/src/server/jobs/ai-actions.ts
- [ ] T013 [P] Add entitlement-default and actor-type denial tests for webResearchEnabled in apps/web/src/server/services/ai-entitlements.test.ts
- [ ] T014 Extend the AI entitlement model and signed-in-user assertion in apps/web/src/server/services/ai-entitlements.ts and apps/web/src/server/permissions/ai-permissions.test.ts
- [ ] T015 Add failing configuration, credential-redaction, domain-precedence, and request-budget tests in apps/web/src/server/web-research/settings.test.ts and apps/web/src/server/web-research/policy.test.ts
- [ ] T016 Implement the provider-neutral settings resolver, encrypted credential access, effective policy, and domain normalization in apps/web/src/server/web-research/settings.ts, apps/web/src/server/web-research/policy.ts, and apps/web/src/server/web-research/url-policy.ts
- [ ] T017 [P] Add failing safe outbound-web-research audit tests in apps/web/src/server/services/request-log.test.ts
- [ ] T018 Extend redacted outbound request registration so web-research search/extract/test operations cannot log keys, queries, bodies, cookies, or identities in apps/web/src/server/services/request-log.ts and apps/web/src/server/db/schema/request-logs.ts

**Checkpoint**: Shared contracts, generated schema, encrypted configuration,
permission boundary, safe audit boundary, and action infrastructure are ready.

---

## Phase 3: User Story 1 - Answer with Current External Evidence (Priority: P1) 🎯 MVP

**Goal**: An eligible, consented user can request Wiki-first web research,
receive a bounded answer grounded in visibly external sources, and still obtain
zero web egress in Wiki-only mode.

**Independent Test**: With a configured fixture connector and eligible session,
ask a freshness question in Wiki-first web mode and receive separately labelled
external citations. Repeat it in Wiki-only mode and assert zero connector
requests. A Wiki-sufficient response must be able to finish without web I/O.

### Tests for User Story 1

- [ ] T019 [P] [US1] Add Tavily connector success, malformed response, timeout, 429, and usage-normalization tests in apps/web/src/server/web-research/tavily.test.ts
- [ ] T020 [P] [US1] Add opaque-source, domain/redirect, source-budget, and no-arbitrary-URL tests in apps/web/src/server/web-research/sources.test.ts and apps/web/src/server/web-research/url-policy.test.ts
- [ ] T021 [P] [US1] Add web tool registration, argument, executor, transcript, and citation-collection tests in apps/web/src/server/services/ai-tool-registry.test.ts, apps/web/src/server/services/ai-tool-arguments.test.ts, and apps/web/src/server/services/ai-tool-runtime.test.ts
- [ ] T022 [P] [US1] Add question creation, consent, Wiki-only zero-egress, and queued worker policy-recheck tests in apps/web/src/server/services/ai-question.test.ts, apps/web/app/api/ai/questions/route.test.ts, and apps/web/src/server/jobs/ai-question.test.ts
- [ ] T023 [P] [US1] Add chat URL restoration and distinct Wiki/web citation rendering tests in apps/web/src/components/chat/chat-url.test.ts, apps/web/src/components/chat/ChatCitations.test.tsx, and apps/web/src/components/chat/linkify-citations.test.ts
- [ ] T024 [P] [US1] Add conversation reconstruction and Feishu citation compatibility tests in apps/web/src/components/chat/reconstruct-session.test.ts, apps/web/src/components/chat/load-conversation.test.ts, and apps/web/src/server/feishu/answer-card.test.ts

### Implementation for User Story 1

- [ ] T025 [US1] Define the server-only connector capabilities and normalized search/open result types in apps/web/src/server/web-research/types.ts and apps/web/src/server/web-research/registry.ts
- [ ] T026 [US1] Implement the Tavily HTTP connector with fixed conservative request parameters, abort timeout, response validation, error mapping, and usage extraction in apps/web/src/server/web-research/tavily.ts
- [ ] T027 [US1] Implement action-scoped candidate persistence, encrypted bounded content storage, source status transitions, and canonical-domain revalidation in apps/web/src/server/web-research/sources.ts
- [ ] T028 [US1] Register read-only web_search and web_open definitions under the next-wiki built-in provider in apps/web/src/server/services/ai-tool-registry.ts
- [ ] T029 [US1] Validate web tool arguments and add web-search/web-open executors that derive the minimal query from the original user question in apps/web/src/server/services/ai-tool-arguments.ts and apps/web/src/server/services/ai-tool-executors.ts
- [ ] T030 [US1] Extend tool-loop budget accounting, untrusted-result delimiting, action events, and kind-aware citation collection/deduplication in apps/web/src/server/services/ai-tool-runtime.ts
- [ ] T031 [US1] Update Wiki-question planning instructions so external material is untrusted data, candidates are not evidence, and no durable mutation is permitted in apps/web/src/server/ai/prompts/wiki-question.ts
- [ ] T032 [US1] Add research mode/consent validation, session persistence, and action request metadata in apps/web/src/server/services/ai-question.ts
- [ ] T033 [US1] Extend the authenticated question route and OpenAPI input/output schemas for the research object in apps/web/app/api/ai/questions/route.ts and apps/web/src/server/api/openapi-schemas.ts
- [ ] T034 [US1] Build the Wiki-first read-only tool profile and repeat effective enablement, entitlement, cancellation, budget, and source-policy checks immediately before every external call in apps/web/src/server/jobs/ai-question.ts
- [ ] T035 [US1] Persist and restore research mode in the chat URL/session store in apps/web/src/components/chat/chat-url.ts and apps/web/src/components/chat/chat-store.ts
- [ ] T036 [US1] Send confirmed research mode with each action and render the first-use external-processing disclosure in apps/web/src/hooks/use-ai-chat.ts and apps/web/src/components/chat/AiChatPane.tsx
- [ ] T037 [US1] Render kind-aware answer links and distinct external-source groups without treating candidates as citations in apps/web/src/components/chat/ChatCitations.tsx, apps/web/src/components/chat/linkify-citations.ts, apps/web/src/components/chat/ChatAnswer.tsx, and apps/web/src/server/feishu/answer-card.ts
- [ ] T038 [US1] Add fixture-backed end-to-end coverage for Wiki-only no-egress, consented web research, external citation links, and URL restoration in apps/web/e2e/ai-web-research.spec.ts and apps/web/e2e/ai-chat-conversation-url.spec.ts

**Checkpoint**: An entitled user can independently use bounded, citation-backed
Wiki-first web research, while Wiki-only chat remains strictly local.

---

## Phase 4: User Story 2 - Govern and Safely Operate External Research (Priority: P2)

**Goal**: An administrator can safely configure/test/disable the connector,
limit sources and budgets, and grant the separate user entitlement.

**Independent Test**: An administrator configures a fixture connector for one
user, verifies the user can research, then disables it or revokes access before
a queued call begins and observes zero external I/O.

### Tests for User Story 2

- [ ] T039 [P] [US2] Add administrator settings GET/PATCH authorization, validation, and secret-omission tests in apps/web/app/api/ai/web-research/settings/route.test.ts
- [ ] T040 [P] [US2] Add queued connection-test action, timeout, and safe-result tests in apps/web/src/server/web-research/connection-test.test.ts and apps/web/src/server/jobs/ai-actions.test.ts
- [ ] T041 [P] [US2] Add web-research entitlement route and user-access-form tests in apps/web/app/api/ai/ai-entitlement-routes.test.ts and apps/web/src/components/admin/ai/UserAiEntitlementsForm.test.tsx
- [ ] T042 [P] [US2] Add queued-disable, entitlement-revocation, blocked-domain, and policy-budget zero-egress integration tests in apps/web/src/server/jobs/ai-question.test.ts and apps/web/src/server/web-research/policy.test.ts
- [ ] T043 [P] [US2] Add admin-panel save/test/error-state accessibility tests in apps/web/src/components/admin/ai/WebResearchPanel.test.tsx
- [ ] T044 [US2] Implement manage_ai-protected web-research settings GET/PATCH resource in apps/web/app/api/ai/web-research/settings/route.ts
- [ ] T045 [US2] Implement bounded web_research_test action execution and safe attempt recording in apps/web/src/server/web-research/connection-test.ts and apps/web/src/server/jobs/ai-actions.ts
- [ ] T046 [US2] Implement the asynchronous connection-test sub-resource route in apps/web/app/api/ai/web-research/connection-tests/route.ts
- [ ] T047 [US2] Add the single Admin AI Web Research panel, canonical route, and tab entry in apps/web/src/components/admin/ai/WebResearchPanel.tsx, apps/web/src/components/admin/ai/AiAdminTabs.tsx, and apps/web/app/(admin)/admin/ai/research/page.tsx
- [ ] T048 [US2] Expose webResearchEnabled through the existing entitlement API and administrator user-access controls in apps/web/app/api/ai/entitlements/[userId]/route.ts and apps/web/src/components/admin/ai/UserAiEntitlementsForm.tsx
- [ ] T049 [US2] Add localized admin, unavailable, denied, policy-blocked, and budget-limited copy in apps/web/src/i18n/keys.ts and apps/web/src/i18n/messages/
- [ ] T050 [US2] Add administrator end-to-end coverage for configure/test/entitle/disable and queued-work no-egress behavior in apps/web/e2e/admin-ai-web-research.spec.ts

**Checkpoint**: The connector can be safely operated and turned off without
breaking ordinary Wiki AI or leaking configuration to ineligible users.

---

## Phase 5: User Story 3 - Preserve Selected External Evidence (Priority: P3)

**Goal**: A permitted user can deliberately preserve one opened external source
as provenance-complete Raw original evidence without implicitly editing or
publishing a Wiki page.

**Independent Test**: Complete a fixture-backed research answer, capture one
opened source, open the resulting Raw source/revision, and verify URL/title/
provider/retrieval time/content hash/action link. Expired or unauthorized
capture creates no record.

### Tests for User Story 3

- [ ] T051 [P] [US3] Add trusted Raw external-fetch writer, provenance, and idempotency tests in apps/web/src/server/web-research/evidence.test.ts and apps/web/src/server/services/raw-entries.test.ts
- [ ] T052 [P] [US3] Add capture action ownership, permission, expiry, failure, and no-page-mutation tests in apps/web/src/server/services/ai-actions.test.ts and apps/web/src/server/jobs/ai-actions.test.ts
- [ ] T053 [P] [US3] Add capture sub-resource authorization/idempotency/OpenAPI tests in apps/web/app/api/ai/actions/[actionId]/web-sources/[sourceId]/captures/route.test.ts and apps/web/src/server/api/openapi-schemas.test.ts
- [ ] T054 [P] [US3] Add preserve-control queued/succeeded/expired/denied rendering tests in apps/web/src/components/chat/ChatCitations.test.tsx
- [ ] T055 [US3] Implement the trusted capture service that maps one opened AiWebSource to a Raw external-fetch page/revision and stores the durable relation in apps/web/src/server/web-research/evidence.ts and apps/web/src/server/services/raw-entries.ts
- [ ] T056 [US3] Register the web_evidence_capture worker handler with ownership, Raw-create permission, source status, and idempotency checks in apps/web/src/server/jobs/ai-actions.ts and apps/web/src/server/services/ai-actions.ts
- [ ] T057 [US3] Implement the capture sub-resource route and regenerate its OpenAPI schema in apps/web/app/api/ai/actions/[actionId]/web-sources/[sourceId]/captures/route.ts and apps/web/src/server/api/openapi-schemas.ts
- [ ] T058 [US3] Add source-specific Preserve as evidence controls, action progress, and durable Raw evidence links in apps/web/src/components/chat/ChatCitations.tsx and apps/web/src/components/chat/ChatAnswer.tsx
- [ ] T059 [US3] Extend periodic AI cleanup to expire unpreserved bodies/source rows within 24 hours while retaining captured Raw evidence in apps/web/src/server/jobs/ai-cleanup.ts and apps/web/src/server/services/ai-actions.ts
- [ ] T060 [US3] Add cleanup retention and captured-evidence survival tests in apps/web/src/server/jobs/ai-cleanup.test.ts and apps/web/src/server/web-research/sources.test.ts
- [ ] T061 [US3] Add end-to-end capture, duplicate-capture, expiry, and no-implicit-publication coverage in apps/web/e2e/ai-web-research.spec.ts and apps/web/e2e/raw-content.spec.ts

**Checkpoint**: Selected evidence becomes a permission-scoped Raw original source
with durable provenance; all other web bodies expire and no page publication is
implicit.

---

## Phase 6: Polish and Cross-Cutting Validation

**Purpose**: Complete generated artifacts, safety regression coverage, and
release-level verification across all user stories.

- [ ] T062 [P] Regenerate and validate OpenAPI output from apps/web/src/server/api/openapi-schemas.ts into apps/web/public/openapi.json with the apps/web/package.json openapi:generate script
- [ ] T063 [P] Validate all newly added localization keys/messages and catalog integrity in apps/web/src/i18n/keys.ts and apps/web/src/i18n/messages/
- [ ] T064 Regenerate Drizzle artifacts from apps/web/src/server/db/schema/ and confirm the second pnpm db:generate run has no changes in apps/web/src/server/db/migrations/meta/
- [ ] T065 Run focused and full lint/typecheck suites defined by package.json and apps/web/package.json after all modified source paths are complete
- [ ] T066 Run the connector, policy, action, citation, retention, route, and Raw-evidence Vitest suites under apps/web/src/server/, apps/web/src/components/chat/, apps/web/app/api/ai/, and packages/shared/src/
- [ ] T067 Run Playwright coverage for apps/web/e2e/ai-web-research.spec.ts, apps/web/e2e/admin-ai-web-research.spec.ts, apps/web/e2e/ai-chat-conversation-url.spec.ts, and apps/web/e2e/raw-content.spec.ts
- [ ] T068 Run docker compose up -d --build from docker-compose.yml and exercise the app/worker migration and queued-action health path
- [ ] T069 Exercise the 50-question fixture workload and record the 45-second completion metric in specs/036-web-research/quickstart.md
- [ ] T070 Re-run every administrator, user-flow, security, and lifecycle acceptance check in specs/036-web-research/quickstart.md and record any intentional limitation in specs/036-web-research/tasks.md

---

## Dependencies & Execution Order

### Phase dependencies

~~~text
Phase 1 Setup
    ↓
Phase 2 Foundational
    ├──→ Phase 3 US1 — user research and citations
    └──→ Phase 4 US2 — governance and administration
                  ↓
          Phase 5 US3 — capture (requires an opened US1 source)
                  ↓
          Phase 6 Polish and release validation
~~~

### User story dependencies

- **US1 (P1)** depends only on Phase 2. Fixture configuration through the
  shared settings resolver is sufficient for its independent test.
- **US2 (P2)** depends only on Phase 2 for implementation; run its final
  enabled-user end-to-end check after US1 supplies the question worker path.
- **US3 (P3)** depends on US1 because it preserves an opened external source,
  and consumes the existing Raw evidence permission model. It does not depend
  on the administrator UI beyond configured fixture data.

### Within each user story

1. Write its focused tests and keep them failing.
2. Implement persistence/connector/service layers before routes and UI.
3. Add worker integration before browser interaction.
4. Run the story's stated independent test at its checkpoint.
5. Commit the completed logical unit before beginning the next slice.

## Parallel Opportunities

### User Story 1

~~~text
T019 connector tests
T020 source/policy tests
T021 tool-runtime tests
T022 action/worker tests
T023 chat citation tests
T024 reconstruction/Feishu tests
~~~

After their relevant contracts exist, the test tasks above can run in parallel.
T035 and T037 can also proceed in parallel after T032–T034 provide the action
and citation contracts.

### User Story 2

~~~text
T039 settings route tests
T040 connection-test tests
T041 entitlement tests
T042 policy TOCTOU tests
T043 admin-panel tests
~~~

T044, T045, and T047 write distinct subsystems after the foundational settings
contract is complete. T049 may proceed with T047 because it only adds i18n
messages.

### User Story 3

~~~text
T051 Raw writer tests
T052 action tests
T053 capture route tests
T054 capture UI tests
~~~

After T055/T056 establish the capture contract, T057 and T058 may proceed in
parallel. T060 can run after T059 changes retention.

## Implementation Strategy

### MVP first

1. Complete Phases 1 and 2.
2. Complete US1 through T038 using deterministic fixtures.
3. Validate the US1 zero-egress and external-citation checkpoint.
4. Demonstrate the bounded, read-only user flow before adding durable capture.

### Incremental delivery

1. Foundation plus US1 delivers explicit, cited external research.
2. US2 adds safe administration, entitlement, policy, and operational controls.
3. US3 adds deliberate, provenance-complete Raw evidence capture.
4. Phase 6 validates the complete feature under local Docker Compose.

### Parallel team strategy

After Phase 2, one developer can implement US1 tool/worker work while another
implements US2 administration and settings UI. Begin US3 only after a stable
opened-source contract is available from US1. Assign the final integration,
generated-artifact, and release validation tasks to a reviewer who did not
author the connector.

## Notes

- Every external call is server-only, connector-governed, and reauthorized at
  the moment of egress.
- The generated migration must come only from pnpm db:generate; never edit
  apps/web/src/server/db/migrations SQL, journal, or snapshot by hand.
- No task grants web research to anonymous/API-key/MCP/bot/scheduled actors,
  creates a generic URL fetcher, or allows a web-research tool to mutate Wiki
  content.
