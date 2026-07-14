# Tasks: Feishu Bot Integration

**Input**: Design documents from `/specs/019-feishu-bot/`

**Prerequisites**: [plan.md](./plan.md), [spec.md](./spec.md), [research.md](./research.md), [data-model.md](./data-model.md), and [contracts/](./contracts/)

**Architecture**: The Feishu integration is an **in-process module** in the
single `apps/web` application — no separate bot process, image, Compose profile,
or private HTTP delegation contract. The inbound callback is a Next.js route
handler; delegation resolves the binding in-process; delivery uses the existing
pg-boss job runner.

**Tests**: Tests are required by the feature specification, implementation plan,
and project rules. Add the listed Vitest, webhook/route, E2E, migration-generation,
and Compose validations before considering a story complete.

**Organization**: Tasks are grouped by user story so each increment has a focused
acceptance test. Foundational work is deliberately limited to shared persistence,
in-process transport, auditing, inbox de-duplication, and worker scaffolding.

## Format: `[ID] [P?] [Story] Description`

- **[P]**: Can run in parallel after its stated dependencies, in different files.
- **[Story]**: The user story served by the task.
- Every task lists exact implementation or test paths.

## Phase 1: Setup (Shared Infrastructure)

**Purpose**: Add the Feishu SDK, shared contracts, and the in-process transport
seam without changing default Wiki behavior. No new container or process.

- [x] T001 Add the official Feishu SDK (`@larksuiteoapi/node-sdk`) to `apps/web/package.json`, create the module directory `apps/web/src/server/feishu/`, and confirm `docker compose up` starts nothing new.
- [x] T002 [P] Add shared bounded Feishu Zod schemas, enums, and exports for the module contracts in `packages/shared/src/feishu.ts` and `packages/shared/src/index.ts`.
- [x] T003 [P] Define the in-process Feishu transport interface (verify/decrypt webhook + send message) in `apps/web/src/server/feishu/transport-types.ts` and a deterministic test double in `apps/web/src/server/feishu/transport.test-support.ts` with `apps/web/src/server/feishu/transport.test.ts`.
- [x] T004 Document that Feishu is optional and configured via the admin UI (encrypted DB config, not env), plus the single callback route, in `.env.example` and `README.md` — with no new Compose service.

---

## Phase 2: Foundational (Blocking Prerequisites)

**Purpose**: Establish permission-safe persistence, encrypted configuration,
audit provenance, durable inbox/delivery primitives, and the in-process Feishu
transport required by every story.

**⚠️ CRITICAL**: Complete this phase before user-story implementation.

- [x] T005 [P] Define Feishu statuses, subscription modes, delivery states, connection mode, and the `audit_origin` enum in `apps/web/src/server/db/schema/enums.ts`.
- [x] T006 Define `feishu_integration_config`, `feishu_bindings`, `feishu_binding_tokens`, `feishu_inbox_events`, `feishu_bot_sessions`, subscription, notification-event, and delivery tables with the documented indexes/uniqueness constraints in `apps/web/src/server/db/schema/index.ts`.
- [x] T007 Extend `api_audit_entries` with bounded `origin` and `external_correlation_id` fields plus indexes and relations in `apps/web/src/server/db/schema/index.ts`.
- [x] T008 Generate the schema migration and snapshot with `pnpm db:generate`; inspect the generated files under `apps/web/src/server/db/migrations/`, then rerun the command to confirm `No schema changes`.
- [x] T009 Add Feishu configuration encryption, write-only serialization, retention/limit validation, and an in-process `getDecryptedConfig` accessor using the existing key-encryption primitive in `apps/web/src/server/services/feishu-config.ts` and `apps/web/src/server/services/feishu-config.test.ts`.
- [x] T010 Extend audit writing/query mapping for `origin=feishu` and opaque correlations in `apps/web/src/server/services/audit.ts`, `apps/web/src/server/services/audit.test.ts`, and `apps/web/src/components/admin/AdminAuditTable.tsx`.
- [x] T011 Implement durable Feishu inbox de-duplication, rate-limit accounting, and normalized correlation/error helpers in `apps/web/src/server/services/feishu-inbox.ts` and `apps/web/src/server/services/feishu-inbox.test.ts`.
- [x] T012 Implement the in-process Feishu transport client (SDK-backed verify/decrypt + send, reading the decrypted config) in `apps/web/src/server/feishu/transport.ts` behind the T003 interface, with unit coverage using the test double.
- [x] T013 Add explicit Feishu delivery/recovery/cleanup queue names, worker registration, stale-claim recovery, and cleanup scheduling in `apps/web/src/server/jobs/runtime.ts` and `apps/web/src/server/jobs/register.ts` (worker bodies filled in US2/US3).
- [x] T014 Add foundational integration coverage for the generated schema, encrypted config serialization, audit origin, and inbox uniqueness in `apps/web/src/server/services/feishu-foundation.integration.test.ts`.

**Checkpoint**: Database migrations are generated and clean; configuration is
write-only encrypted; every Feishu-origin audit row records its origin; the
inbox rejects duplicates; the default deployment is unchanged.

---

## Phase 3: User Story 1 - Bind a Feishu Identity to a Wiki Account (Priority: P1) 🎯 MVP

**Goal**: An unbound direct-message or @-mention user can safely bind to their
Wiki account, receive confirmation, unbind, and be revoked by an administrator.

**Independent Test**: A signed unbound message produces one private 10-minute
link; the signed-in user completes it once, receives a welcome, can unbind, and
an admin revocation makes the next contact unbound without exposing a link in a
group.

### Tests for User Story 1

- [x] T015 [P] [US1] Add binding-token service tests for hashing, 10-minute expiry, one-time use, `open_id` matching, user deactivation, unbind, and admin revocation in `apps/web/src/server/services/feishu-bindings.test.ts`.
- [x] T016 [P] [US1] Add webhook route tests for invalid signature, stale payload, duplicate `message_id`, URL verification, direct binding disposition, and group-safe no-link fallback in `apps/web/app/webhooks/feishu/events/route.test.ts`.
- [x] T017 [P] [US1] Add Playwright binding/revocation coverage with private-message and group-fallback fixtures in `apps/web/e2e/feishu-binding.spec.ts`.

### Implementation for User Story 1

- [x] T018 [US1] Implement active-binding lookup, hashed token issuance/consumption, confirmation, unbind, revocation, and immediate session expiry in `apps/web/src/server/services/feishu-bindings.ts`.
- [x] T019 [US1] Implement the authenticated binding-confirmation page and mutation route in `apps/web/app/(user)/user-center/feishu/bind/page.tsx` and `apps/web/app/api/feishu/bindings/route.ts`.
- [x] T020 [US1] Implement the Feishu Event v2 callback route (URL-verification response, decrypt/verify-before-parse, durable inbox acknowledgement, hand-off to delegation) in `apps/web/app/webhooks/feishu/events/route.ts`.
- [x] T021 [US1] Implement the in-process delegation entry `handleInboundMessage` that resolves bindings server-side and returns only `bind`/`ignored`/safe dispositions in `apps/web/src/server/services/feishu-delegation.ts`.
- [x] T022 [US1] Implement direct-message sending and generic group fallback (never emitting a binding URL in a group) in `apps/web/src/server/services/feishu-messaging.ts` using the T012 transport.
- [x] T023 [US1] Add binding/unbinding confirmation copy and translations in `apps/web/messages/en.json` and `apps/web/messages/zh-CN.json`.
- [x] T024 [US1] Run the US1 Vitest, webhook route, and Playwright suites named in T015–T017.

**Checkpoint**: User Story 1 is independently demonstrable with no Q&A,
subscription, or notification implementation enabled.

---

## Phase 4: User Story 2 - Ask Wiki Questions in Feishu (Priority: P1)

**Goal**: A bound direct-message user or group @-mentioner receives a
permission-safe, grounded asynchronous answer with citations and isolated
conversation context.

**Independent Test**: A bound user receives a cited answer from readable sources;
unreadable/mixed sources do not leak, a group answer is direct unless all
citations remain public, duplicate messages do not create another action, and a
reset/expiry clears only that user's session.

### Tests for User Story 2

- [x] T025 [P] [US2] Add delegation-service tests for in-process binding resolution, effective-user-from-binding-only, AI-disabled fallback, and audit attribution in `apps/web/src/server/services/feishu-delegation.test.ts`.
- [ ] T026 [P] [US2] Add permission-isolation tests for unreadable retrieval candidates, group @-mention actor selection, direct-only protected answers, and public-only group replies in `apps/web/src/server/services/feishu-question.test.ts`.
- [x] T027 [P] [US2] Add answer-delivery worker tests for queued/running/completed/insufficient-evidence outcomes and duplicate handling in `apps/web/src/server/jobs/feishu-deliveries.test.ts`.
- [ ] T028 [P] [US2] Add end-to-end bound Q&A, session reset/expiry, entitlement change, and citation-link coverage in `apps/web/e2e/feishu-question.spec.ts`.

### Implementation for User Story 2

- [x] T029 [US2] Implement per-binding-per-chat session lifecycle, reset command, 30-minute default expiry, and 5–240-minute configuration validation in `apps/web/src/server/services/feishu-sessions.ts`.
- [x] T030 [US2] Extend the in-process delegation flow to build the bound user's `PermCtx`, invoke `createWikiQuestion`, set Feishu request metadata, and recheck normal AI permissions in `apps/web/src/server/services/feishu-delegation.ts`.
- [x] T031 [US2] On `wiki_question` terminal state, create a sanitized answer-delivery row (citations only, group-vs-direct policy) and persist Feishu origin/correlation without raw prompts/answers in `apps/web/src/server/services/feishu-notifications.ts` and `apps/web/src/server/jobs/ai-question.ts`.
- [x] T032 [US2] Implement the answer/notification delivery worker (claim, re-check binding + citation visibility, render card, send via transport, record outcome, backoff) in `apps/web/src/server/jobs/feishu-deliveries.ts`.
- [x] T033 [US2] Assert worker-time actor/entitlement rechecks and Feishu metadata in `apps/web/src/server/jobs/ai-question.test.ts`.
- [ ] T034 [US2] Run the US2 service, worker, and Playwright suites named in T025–T028.

**Checkpoint**: User Stories 1 and 2 work independently with existing AI
providers and no new public Wiki API route.

---

## Phase 5: User Story 3 - Receive Wiki Event Notifications (Priority: P2)

**Goal**: Supported Wiki events become durable, permission-safe direct or group
notifications with retry, recovery, and administrator-visible failure states.

**Independent Test**: Public page events produce one public-safe group card;
protected group events fan out only to currently authorized bound recipients; AI
completion is direct to its actor; restart/retry preserve one logical delivery
and stop after five attempts or expiry.

### Tests for User Story 3

- [ ] T035 [P] [US3] Add notification-event/delivery service tests for unique event-to-subscription keys, lease claims, exponential retries, fifth-failure pause, expiry, and stale-claim recovery in `apps/web/src/server/services/feishu-notifications.test.ts`.
- [ ] T036 [P] [US3] Add group-policy tests for public-safe resource rechecks, private-recipient fan-out, unbound/unauthorized members, and zero protected group metadata in `apps/web/src/server/services/feishu-notification-policy.test.ts`.
- [ ] T037 [P] [US3] Add delivery-worker tests for deterministic request UUIDs, Feishu QPS throttling, outcome idempotency, and normalized provider errors in `apps/web/src/server/jobs/feishu-deliveries.test.ts`.
- [ ] T038 [P] [US3] Add Compose/E2E coverage for page publish, AI completion, transfer completion, web-app restart recovery, five failures, and explicit expiry in `apps/web/e2e/feishu-notifications.spec.ts`.

### Implementation for User Story 3

- [ ] T039 [US3] Implement notification-event creation, minimal safe payloads, subscription expansion, delivery claims, retry scheduling, terminal states, and cleanup in `apps/web/src/server/services/feishu-notifications.ts`.
- [ ] T040 [US3] Implement delivery-time page/action/transfer authorization and the `public_safe_group` / `private_recipients_group` policy in `apps/web/src/server/services/feishu-notification-policy.ts`.
- [ ] T041 [US3] Add page-publish outbox creation in `apps/web/src/server/services/pages.ts`, AI-action terminal outbox creation in `apps/web/src/server/services/ai-actions.ts`, and transfer-terminal outbox creation in `apps/web/src/server/services/transfers.ts`.
- [ ] T042 [US3] Extend the registered durable delivery worker, add the recoverer and cleanup worker in `apps/web/src/server/jobs/feishu-deliveries.ts`, `apps/web/src/server/jobs/feishu-cleanup.ts`, and `apps/web/src/server/jobs/register.ts`.
- [ ] T043 [US3] Add notification delivery audit/correlation entries and administrator-safe blocked/failure reasons in `apps/web/src/server/services/audit.ts` and `apps/web/src/server/services/feishu-notifications.ts`.
- [ ] T044 [US3] Run the US3 service, policy, worker, and Compose/E2E suites named in T035–T038.

**Checkpoint**: Notifications survive web-app restarts and never weaken Wiki
resource visibility.

---

## Phase 6: User Story 4 - Admin Configures the Bot Connection and Subscriptions (Priority: P2)

**Goal**: An administrator can configure credentials and limits, operate
subscriptions, revoke bindings, and inspect connection/delivery health through
one canonical, URL-restorable Feishu administration surface.

**Independent Test**: An admin saves masked credentials, sees connection health,
adds each subscription mode, filters/revokes a binding, pauses a failure, and
reloads a shared filtered URL with the same state.

### Tests for User Story 4

- [ ] T045 [P] [US4] Add admin service/route tests for role enforcement, write-only secrets, connection health, subscription validation, pause/resume, binding revocation, and URL query validation in `apps/web/src/server/services/feishu-admin.test.ts` and `apps/web/app/api/admin/feishu/route.test.ts`.
- [ ] T046 [P] [US4] Add component tests for masked configuration, subscription mode warnings, health/error rendering, and bindings filters in `apps/web/src/components/admin/feishu/FeishuIntegrationPanel.test.tsx`.
- [ ] T047 [P] [US4] Add Playwright canonical-route, deep-link, subscription, health, and revocation coverage in `apps/web/e2e/admin-feishu.spec.ts`.

### Implementation for User Story 4

- [ ] T048 [US4] Implement admin configuration, health, subscription, delivery-history, and binding-management services with `manage_ai`/admin permission checks in `apps/web/src/server/services/feishu-admin.ts`.
- [ ] T049 [US4] Implement first-party admin API routes for configuration/health, subscriptions, deliveries, and bindings in `apps/web/app/api/admin/feishu/route.ts`, `apps/web/app/api/admin/feishu/subscriptions/route.ts`, `apps/web/app/api/admin/feishu/deliveries/route.ts`, and `apps/web/app/api/admin/feishu/bindings/route.ts`.
- [ ] T050 [US4] Implement the canonical `/admin/feishu` page, server loader, breadcrumb, and query-parameter restoration in `apps/web/app/(admin)/admin/feishu/page.tsx`.
- [ ] T051 [US4] Implement configuration, connection health, subscription, delivery, and binding-management panels solely from shared UI primitives in `apps/web/src/components/admin/feishu/FeishuIntegrationPanel.tsx`, `apps/web/src/components/admin/feishu/FeishuSubscriptionPanel.tsx`, and `apps/web/src/components/admin/feishu/FeishuBindingsPanel.tsx`.
- [ ] T052 [US4] Add Feishu navigation and localized labels/messages in `apps/web/src/components/admin/AdminSidebar.tsx`, `apps/web/messages/en.json`, and `apps/web/messages/zh-CN.json`.
- [ ] T053 [US4] Surface connection/delivery health (last inbound event, last delivery, last error, config validity) through `apps/web/src/server/services/feishu-config.ts` and the admin panel.
- [ ] T054 [US4] Run the US4 service, route, component, and Playwright suites named in T045–T047.

**Checkpoint**: All operator workflows are self-service, credential-safe, and
URL-restorable.

---

## Phase 7: Polish & Cross-Cutting Concerns

**Purpose**: Verify the complete optional integration, observability, and
documentation without changing public-content delivery.

- [ ] T055 [P] Add structured, secret-redacted Feishu logs and readiness behavior in `apps/web/src/server/feishu/` and `apps/web/app/readyz/route.ts`.
- [ ] T056 [P] Add Feishu setup, callback/ingress, backup, recovery, and credential-rotation guidance in `README.md` and `docs/operations/feishu-bot.md`.
- [ ] T057 [P] Add public-contract regression tests confirming the webhook route is absent from generated OpenAPI and no anonymous page route becomes dynamic in `apps/web/app/api/v1/public-route-architecture.test.ts` and `apps/web/app/(public)/public-content-delivery.test.ts`.
- [ ] T058 Add feature contract conformance coverage for `specs/019-feishu-bot/contracts/feishu-webhook.md` and `specs/019-feishu-bot/contracts/integration-module.md` in `apps/web/e2e/feishu-contracts.spec.ts`.
- [ ] T059 Run `pnpm db:generate` again after all schema changes and verify the generated migration/snapshot is clean.
- [ ] T060 Run targeted Vitest, Playwright, `pnpm lint`, `pnpm typecheck`, and `pnpm test`; record results in `specs/019-feishu-bot/quickstart.md`.
- [ ] T061 Run `docker compose up -d --build` with the mock transport webhook scenario; record the end-to-end result in `specs/019-feishu-bot/quickstart.md`.
- [ ] T062 Review the complete change against Constitution P1, P3, P5, P7, P9, P10, P11, and P12 and add the PR verification notes in `specs/019-feishu-bot/plan.md`.

---

## Dependencies & Execution Order

### Phase dependencies

- **Phase 1 → Phase 2**: shared schemas and the transport seam must exist before
  persistence, transport, and worker work.
- **Phase 2 → US1/US2/US3/US4**: foundational schema, encrypted config, audit
  origin, inbox, transport, and worker registration block all stories.
- **US1 → US2**: Q&A requires a binding. US2 ships after the US1 checkpoint.
- **US2 → US3/US4**: US3 reuses the US2 delivery worker; US4 configuration shell
  may be prepared in parallel after Phase 2 but ships after US3 services exist.
- **All desired stories → Phase 7**: cross-cutting validation follows completed
  functional increments.

### User story dependency graph

```text
Foundational
    └── US1 Binding
          └── US2 Grounded Q&A (+ answer delivery worker)
                ├── US3 Durable notifications
                └── US4 Admin configuration
                      └── Polish
```

### Parallel opportunities

- T002–T004 can proceed in parallel after T001 where files do not overlap.
- T005 and initial test scaffolding can run in parallel; T006–T008 remain
  sequential because Drizzle generation follows schema changes.
- Within each user story, the `[P]` test tasks target distinct files and can be
  written in parallel before implementation.

## Implementation Strategy

### MVP first

1. Complete Phases 1 and 2.
2. Complete US1 and validate signed binding, single-use confirmation, and revocation.
3. Complete US2 and validate permission-safe grounded Q&A with answer delivery.
4. Stop for an internal MVP demonstration before enabling any notification subscriptions.

### Incremental delivery

1. US1 provides safe identity binding.
2. US2 adds the primary Q&A value using the existing AI action lifecycle plus the
   durable delivery worker.
3. US3 adds durable, privacy-safe outbound event notifications on the same worker.
4. US4 makes configuration and operations self-service.
5. Phase 7 validates the optional integration and all constitution gates.

### Task format validation

All 62 tasks use the required `- [ ] T### [P?] [US?] Description with file path`
format. Story tasks carry one `[US#]` label; setup, foundational, and polish
tasks do not.
