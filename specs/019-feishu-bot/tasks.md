# Tasks: Feishu Bot Integration

**Input**: Design documents from `/specs/019-feishu-bot/`

**Prerequisites**: [plan.md](./plan.md), [spec.md](./spec.md), [research.md](./research.md), [data-model.md](./data-model.md), and [contracts/](./contracts/)

**Tests**: Tests are required by the feature specification, implementation plan, and
project rules. Add the listed Vitest, contract, E2E, migration-generation, and
Compose validations before considering a story complete.

**Organization**: Tasks are grouped by user story so each increment has a focused
acceptance test. Foundational work is deliberately limited to shared persistence,
service authentication, auditing, and transport scaffolding.

## Format: `[ID] [P?] [Story] Description`

- **[P]**: Can run in parallel after its stated dependencies, in different files.
- **[Story]**: The user story served by the task.
- Every task lists exact implementation or test paths.

## Phase 1: Setup (Shared Infrastructure)

**Purpose**: Create the optional same-image bot role and the common test/type
scaffolding without changing default Wiki behavior.

- [ ] T001 Add the `apps/feishu-bot` workspace package, TypeScript config, start script, and official Feishu SDK dependency in `apps/feishu-bot/package.json`, `apps/feishu-bot/tsconfig.json`, and `pnpm-workspace.yaml`.
- [ ] T002 [P] Add shared bounded Feishu Zod schemas, enums, and exports for private-contract inputs in `packages/shared/src/feishu.ts` and `packages/shared/src/index.ts`.
- [ ] T003 [P] Create a deterministic Feishu Event v2/message transport test double in `apps/feishu-bot/src/feishu-client.test-support.ts` and `apps/feishu-bot/src/feishu-client.test.ts`.
- [ ] T004 Add an optional `feishu` Compose profile, same-image bot command, only-needed callback port, and no new stateful service in `docker/Dockerfile` and `docker-compose.yml`.
- [ ] T005 Add developer configuration names, safe example values, and secret-handling documentation in `.env.example` and `README.md`.

---

## Phase 2: Foundational (Blocking Prerequisites)

**Purpose**: Establish permission-safe persistence, private service authentication,
audit provenance, and durable worker primitives required by every story.

**⚠️ CRITICAL**: Complete this phase before user-story implementation.

- [ ] T006 [P] Define Feishu statuses, subscription modes, delivery states, and audit origins in `apps/web/src/server/db/schema/enums.ts`.
- [ ] T007 Define `feishu_integration_config`, `feishu_bindings`, `feishu_binding_tokens`, `feishu_inbox_events`, `feishu_bot_sessions`, subscription, notification-event, and delivery tables with the documented indexes/uniqueness constraints in `apps/web/src/server/db/schema/index.ts`.
- [ ] T008 Extend `api_audit_entries` with bounded `origin` and `external_correlation_id` fields plus indexes and relations in `apps/web/src/server/db/schema/index.ts`.
- [ ] T009 Generate the schema migration and snapshot with `pnpm db:generate`; inspect generated files under `apps/web/drizzle/`, then rerun the command to confirm no further schema changes.
- [ ] T010 Add Feishu configuration encryption, write-only serialization, retention validation, and service tests using the existing key-encryption primitive in `apps/web/src/server/services/feishu-config.ts` and `apps/web/src/server/services/feishu-config.test.ts`.
- [ ] T011 Add a private bot service-auth verifier that rejects caller-supplied Wiki identity and constructs only a bot-service context in `apps/web/src/server/api/feishu-service-auth.ts` and `apps/web/src/server/api/feishu-service-auth.test.ts`.
- [ ] T012 Extend audit writing/query mapping for `origin=feishu` and opaque correlations in `apps/web/src/server/services/audit.ts`, `apps/web/src/server/services/audit.test.ts`, and `apps/web/src/components/admin/AdminAuditTable.tsx`.
- [ ] T013 Implement durable Feishu inbox de-duplication, rate-limit accounting, and normalized correlation/error helpers in `apps/web/src/server/services/feishu-inbox.ts` and `apps/web/src/server/services/feishu-inbox.test.ts`.
- [ ] T014 Add explicit Feishu delivery queue names, worker registration, stale-claim recovery, and cleanup scheduling in `apps/web/src/server/jobs/runtime.ts` and `apps/web/src/server/jobs/register.ts`.
- [ ] T015 Add foundational integration coverage for generated schema, service-auth rejection, encrypted config serialization, audit origin, and inbox uniqueness in `apps/web/src/server/services/feishu-foundation.integration.test.ts`.

**Checkpoint**: Database migrations are generated and clean; no bot request can select
a Wiki user, bypass permissions, or omit its Feishu audit origin.

---

## Phase 3: User Story 1 - Bind a Feishu Identity to a Wiki Account (Priority: P1) 🎯 MVP

**Goal**: An unbound direct-message or @-mention user can safely bind to their Wiki
account, receive confirmation, unbind, and be revoked by an administrator.

**Independent Test**: A signed unbound message produces one private 10-minute link;
the signed-in user completes it once, receives a welcome, can unbind, and an admin
revocation makes the next contact unbound without exposing a link in a group.

### Tests for User Story 1

- [ ] T016 [P] [US1] Add binding-token service tests for hashing, 10-minute expiry, one-time use, `open_id` matching, user deactivation, unbind, and admin revocation in `apps/web/src/server/services/feishu-bindings.test.ts`.
- [ ] T017 [P] [US1] Add Event v2 webhook tests for invalid signature, stale payload, duplicate `message_id`, direct binding disposition, and group-safe no-link fallback in `apps/feishu-bot/src/webhook.test.ts`.
- [ ] T018 [P] [US1] Add Playwright binding/revocation coverage with private-message and group-fallback fixtures in `apps/web/e2e/feishu-binding.spec.ts`.

### Implementation for User Story 1

- [ ] T019 [US1] Implement active-binding lookup, hashed token issuance/consumption, confirmation, unbind, revocation, and immediate session expiry in `apps/web/src/server/services/feishu-bindings.ts`.
- [ ] T020 [US1] Implement the authenticated binding-confirmation page and mutation route in `apps/web/app/(user)/user-center/feishu/bind/page.tsx` and `apps/web/app/api/feishu/bindings/route.ts`.
- [ ] T021 [US1] Implement the bot Event v2 callback, URL-verification response, decrypt/verify-before-parse flow, and durable inbox acknowledgement in `apps/feishu-bot/src/webhook.ts` and `apps/feishu-bot/src/main.ts`.
- [ ] T022 [US1] Implement the private inbound-message adapter that resolves bindings server-side and returns only `bind`/`ignored`/safe dispositions in `apps/web/app/api/internal/feishu/inbound-messages/route.ts` and `apps/web/src/server/services/feishu-delegation.ts`.
- [ ] T023 [US1] Implement private direct-message sending and generic group fallback without ever emitting a binding URL in `apps/feishu-bot/src/message-sender.ts` and `apps/feishu-bot/src/command-dispatcher.ts`.
- [ ] T024 [US1] Add binding/unbinding confirmation copy and translations in `apps/web/messages/en.json` and `apps/web/messages/zh-CN.json`.
- [ ] T025 [US1] Run the US1 Vitest, webhook, and Playwright suites from `apps/web/src/server/services/feishu-bindings.test.ts`, `apps/feishu-bot/src/webhook.test.ts`, and `apps/web/e2e/feishu-binding.spec.ts`.

**Checkpoint**: User Story 1 is independently demonstrable with no Q&A, subscription,
or notification implementation enabled.

---

## Phase 4: User Story 2 - Ask Wiki Questions in Feishu (Priority: P1)

**Goal**: A bound direct-message user or group @-mentioner receives a permission-safe,
grounded asynchronous answer with citations and isolated conversation context.

**Independent Test**: A bound user receives a cited answer from readable sources;
unreadable/mixed sources do not leak, a group answer is direct unless all citations
remain public, duplicate messages do not create another action, and a reset/expiry
clears only that user's session.

### Tests for User Story 2

- [ ] T026 [P] [US2] Add delegation-service tests for server-side binding resolution, forbidden caller-supplied user identity, AI-disabled fallback, and audit attribution in `apps/web/src/server/services/feishu-delegation.test.ts`.
- [ ] T027 [P] [US2] Add permission-isolation tests for unreadable retrieval candidates, group @-mention actor selection, direct-only protected answers, and public-only group replies in `apps/web/src/server/services/feishu-question.test.ts`.
- [ ] T028 [P] [US2] Add bot polling/response tests for queued/running/completed/insufficient-evidence outcomes and duplicate message handling in `apps/feishu-bot/src/question-poller.test.ts`.
- [ ] T029 [P] [US2] Add end-to-end bound Q&A, session reset/expiry, entitlement change, and citation-link coverage in `apps/web/e2e/feishu-question.spec.ts`.

### Implementation for User Story 2

- [ ] T030 [US2] Implement per-binding-per-chat session lifecycle, reset command, 30-minute default expiry, and 5–240-minute configuration validation in `apps/web/src/server/services/feishu-sessions.ts`.
- [ ] T031 [US2] Extend the private inbound-message delegation flow to build the bound user's `PermCtx`, invoke `createWikiQuestion`, set Feishu request metadata, and recheck normal AI permissions in `apps/web/src/server/services/feishu-delegation.ts` and `apps/web/src/server/services/ai-question.ts`.
- [ ] T032 [US2] Implement the ownership-checked private action-status/result route using sanitized citations only in `apps/web/app/api/internal/feishu/ai-actions/[actionId]/route.ts`.
- [ ] T033 [US2] Implement bot action polling, acknowledgement, insufficient-evidence/AI-disabled mapping, citation-card rendering, and group-vs-direct delivery policy in `apps/feishu-bot/src/question-poller.ts` and `apps/feishu-bot/src/command-dispatcher.ts`.
- [ ] T034 [US2] Persist Feishu origin/correlation metadata without raw prompts/answers and assert worker-time actor/entitlement rechecks in `apps/web/src/server/jobs/ai-question.ts` and `apps/web/src/server/jobs/ai-question.test.ts`.
- [ ] T035 [US2] Run the US2 service, worker, bot, and Playwright suites named in `apps/web/src/server/services/feishu-question.test.ts` and `apps/web/e2e/feishu-question.spec.ts`.

**Checkpoint**: User Stories 1 and 2 work independently with existing AI providers and
no new public Wiki API route.

---

## Phase 5: User Story 3 - Receive Wiki Event Notifications (Priority: P2)

**Goal**: Supported Wiki events become durable, permission-safe direct or group
notifications with retry, recovery, and administrator-visible failure states.

**Independent Test**: Public page events produce one public-safe group card; protected
group events fan out only to currently authorized bound recipients; AI completion is
direct to its actor; disconnect/retry/restart preserve one logical delivery and stop
after five attempts or expiry.

### Tests for User Story 3

- [ ] T036 [P] [US3] Add notification-event/delivery service tests for unique event-to-subscription keys, lease claims, exponential retries, fifth-failure pause, expiry, and stale-claim recovery in `apps/web/src/server/services/feishu-notifications.test.ts`.
- [ ] T037 [P] [US3] Add group-policy tests for public-safe resource rechecks, private-recipient fan-out, unbound/unauthorized members, and zero protected group metadata in `apps/web/src/server/services/feishu-notification-policy.test.ts`.
- [ ] T038 [P] [US3] Add bot sender tests for deterministic request UUIDs, Feishu QPS throttling, delivery outcome idempotency, and normalized provider errors in `apps/feishu-bot/src/delivery-poller.test.ts`.
- [ ] T039 [P] [US3] Add Compose/E2E coverage for page publish, AI completion, transfer completion, bot restart, five failures, and explicit expiry in `apps/web/e2e/feishu-notifications.spec.ts`.

### Implementation for User Story 3

- [ ] T040 [US3] Implement notification-event creation, minimal safe payloads, subscription expansion, delivery claims, retry scheduling, terminal states, and cleanup in `apps/web/src/server/services/feishu-notifications.ts`.
- [ ] T041 [US3] Implement delivery-time page/action/transfer authorization and the `public_safe_group` / `private_recipients_group` policy in `apps/web/src/server/services/feishu-notification-policy.ts`.
- [ ] T042 [US3] Add page-publish outbox creation in `apps/web/src/server/services/pages.ts`, AI-action terminal outbox creation in `apps/web/src/server/services/ai-actions.ts`, and transfer-terminal outbox creation in `apps/web/src/server/services/transfers.ts`.
- [ ] T043 [US3] Implement the registered durable delivery worker, recoverer, and cleanup worker in `apps/web/src/server/jobs/feishu-deliveries.ts`, `apps/web/src/server/jobs/feishu-cleanup.ts`, and `apps/web/src/server/jobs/register.ts`.
- [ ] T044 [US3] Implement private claim and outcome route adapters with current lease/UUID checks in `apps/web/app/api/internal/feishu/delivery-claims/route.ts` and `apps/web/app/api/internal/feishu/delivery-claims/[deliveryId]/outcomes/route.ts`.
- [ ] T045 [US3] Implement bot claim polling, recipient-aware send throttling, stable Feishu send UUIDs, and outcome reporting in `apps/feishu-bot/src/delivery-poller.ts` and `apps/feishu-bot/src/message-sender.ts`.
- [ ] T046 [US3] Add notification delivery audit/correlation entries and administrator-safe blocked/failure reasons in `apps/web/src/server/services/audit.ts` and `apps/web/src/server/services/feishu-notifications.ts`.
- [ ] T047 [US3] Run the US3 service, policy, sender, and Compose/E2E suites named in `apps/web/src/server/services/feishu-notifications.test.ts` and `apps/web/e2e/feishu-notifications.spec.ts`.

**Checkpoint**: Notifications survive bot restarts/disconnects and never weaken Wiki
resource visibility.

---

## Phase 6: User Story 4 - Admin Configures the Bot Connection and Subscriptions (Priority: P2)

**Goal**: An administrator can configure credentials and limits, operate subscriptions,
revoke bindings, and inspect connection/delivery health through one canonical,
URL-restorable Feishu administration surface.

**Independent Test**: An admin saves masked credentials, sees connection health within
60 seconds, adds each subscription mode, filters/revokes a binding, pauses a failure,
and reloads a shared filtered URL with the same state.

### Tests for User Story 4

- [ ] T048 [P] [US4] Add admin service/route tests for role enforcement, write-only secrets, connection health, subscription validation, pause/resume, binding revocation, and URL query validation in `apps/web/src/server/services/feishu-admin.test.ts` and `apps/web/app/api/admin/feishu/route.test.ts`.
- [ ] T049 [P] [US4] Add component tests for masked configuration, subscription mode warnings, health/error rendering, and bindings filters in `apps/web/src/components/admin/feishu/FeishuIntegrationPanel.test.tsx`.
- [ ] T050 [P] [US4] Add Playwright canonical-route, deep-link, subscription, health, and revocation coverage in `apps/web/e2e/admin-feishu.spec.ts`.

### Implementation for User Story 4

- [ ] T051 [US4] Implement admin configuration, health, subscription, delivery-history, and binding-management services with `manage_ai`/admin permission checks in `apps/web/src/server/services/feishu-admin.ts`.
- [ ] T052 [US4] Implement first-party admin API routes for configuration/health, subscriptions, deliveries, and bindings in `apps/web/app/api/admin/feishu/route.ts`, `apps/web/app/api/admin/feishu/subscriptions/route.ts`, `apps/web/app/api/admin/feishu/deliveries/route.ts`, and `apps/web/app/api/admin/feishu/bindings/route.ts`.
- [ ] T053 [US4] Implement the canonical `/admin/feishu` page, server loader, breadcrumb, and query-parameter restoration in `apps/web/app/(admin)/admin/feishu/page.tsx`.
- [ ] T054 [US4] Implement configuration, connection health, subscription, delivery, and binding-management panels solely from shared UI primitives in `apps/web/src/components/admin/feishu/FeishuIntegrationPanel.tsx`, `apps/web/src/components/admin/feishu/FeishuSubscriptionPanel.tsx`, and `apps/web/src/components/admin/feishu/FeishuBindingsPanel.tsx`.
- [ ] T055 [US4] Add Feishu navigation and localized labels/messages in `apps/web/src/components/admin/AdminSidebar.tsx`, `apps/web/messages/en.json`, and `apps/web/messages/zh-CN.json`.
- [ ] T056 [US4] Add bot connection heartbeat and health reporting through `apps/feishu-bot/src/health-reporter.ts` and `apps/web/src/server/services/feishu-config.ts`.
- [ ] T057 [US4] Run the US4 service, route, component, and Playwright suites named in `apps/web/src/server/services/feishu-admin.test.ts` and `apps/web/e2e/admin-feishu.spec.ts`.

**Checkpoint**: All operator workflows are self-service, credential-safe, and
URL-restorable.

---

## Phase 7: Polish & Cross-Cutting Concerns

**Purpose**: Verify the complete optional integration, observability, deployment,
and documentation without changing public-content delivery.

- [ ] T058 [P] Add structured, secret-redacted bot/web logs and readiness behavior in `apps/feishu-bot/src/logger.ts`, `apps/feishu-bot/src/health.ts`, and `apps/web/app/readyz/route.ts`.
- [ ] T059 [P] Add the Feishu profile deployment, callback/ingress, backup, recovery, and credential-rotation guidance in `README.md` and `docs/operations/feishu-bot.md`.
- [ ] T060 [P] Add public-contract regression tests confirming the private bot routes are absent from generated OpenAPI and no anonymous page route becomes dynamic in `apps/web/app/api/v1/public-route-architecture.test.ts` and `apps/web/app/(public)/public-content-delivery.test.ts`.
- [ ] T061 Add complete feature contract conformance coverage for `specs/019-feishu-bot/contracts/feishu-webhook.md` and `specs/019-feishu-bot/contracts/private-integration-api.md` in `apps/web/e2e/feishu-contracts.spec.ts`.
- [ ] T062 Run `pnpm db:generate` again after all schema changes and verify the generated migration/snapshot is clean in `apps/web/drizzle/`.
- [ ] T063 Run targeted Vitest, Playwright, `pnpm lint`, `pnpm typecheck`, and `pnpm test`; record results in `specs/019-feishu-bot/quickstart.md`.
- [ ] T064 Run `docker compose up -d --build` and the optional Feishu profile with the mock transport; record the end-to-end result in `specs/019-feishu-bot/quickstart.md`.
- [ ] T065 Review the complete change against Constitution P1, P3, P5, P7, P9, P10, P11, and P12 and add the PR verification notes in `specs/019-feishu-bot/plan.md`.

---

## Dependencies & Execution Order

### Phase dependencies

- **Phase 1 → Phase 2**: the bot package and shared schemas must exist before
  persistence, transport, and private contract work.
- **Phase 2 → US1/US2/US3/US4**: foundational schema, service auth, audit origin,
  inbox, and worker registration block all stories.
- **US1 → US2**: Q&A requires a binding. US2 may start after US1 service contracts
  are available, but ships after the US1 checkpoint.
- **US3 → US4**: notification management UI depends on the delivery/subscription
  service, but the configuration page shell may be prepared in parallel after Phase 2.
- **All desired stories → Phase 7**: cross-cutting validation follows completed
  functional increments.

### User story dependency graph

```text
Foundational
    └── US1 Binding
          └── US2 Grounded Q&A
                ├── US3 Durable notifications
                └── US4 Admin configuration
                      └── Polish
```

### Parallel opportunities

- T002–T005 can proceed in parallel after T001 where their files do not overlap.
- T006 and the initial test scaffolding can run in parallel; T007–T009 remain
  sequential because Drizzle generation follows schema changes.
- Within each user story, the explicitly marked `[P]` test tasks target distinct
  files and can be written in parallel before implementation.
- After Phase 2, US1 test tasks and an initial US4 page shell may be explored in
  parallel; do not ship US2 before US1 binding is complete or US4 subscriptions
  before US3 services are complete.

## Parallel Example: User Story 3

```text
Task: "T036 notification lifecycle tests in apps/web/src/server/services/feishu-notifications.test.ts"
Task: "T037 group policy tests in apps/web/src/server/services/feishu-notification-policy.test.ts"
Task: "T038 sender tests in apps/feishu-bot/src/delivery-poller.test.ts"
Task: "T039 Compose/E2E tests in apps/web/e2e/feishu-notifications.spec.ts"
```

## Implementation Strategy

### MVP first

1. Complete Phases 1 and 2.
2. Complete US1 and validate signed binding, single-use confirmation, and revocation.
3. Complete US2 and validate permission-safe grounded Q&A.
4. Stop for an internal MVP demonstration before enabling any notification profile.

### Incremental delivery

1. US1 provides safe identity binding.
2. US2 adds the primary Q&A value using the existing AI action lifecycle.
3. US3 adds durable, privacy-safe outbound notifications.
4. US4 makes configuration and operations self-service.
5. Phase 7 validates the optional deployment and all constitution gates.

### Task format validation

All 65 tasks use the required `- [ ] T### [P?] [US?] Description with file path`
format. Story tasks carry one `[US#]` label; setup, foundational, and polish tasks
do not.
