# Implementation Plan: Feishu Bot Integration

**Branch**: `019-feishu-bot` | **Date**: 2026-07-14 | **Spec**: [spec.md](./spec.md)

**Input**: Feature specification from `/specs/019-feishu-bot/spec.md`

## Summary

Add an optional Feishu integration that lives **inside the single web
application** as an explicitly registered module — no separate process, image,
or inter-process contract. The Feishu SDK maintains an outbound WebSocket long
connection; inbound messages resolve the active binding in-process, build the bound
user's normal `PermCtx`, and reuse the existing AI-question service directly.
Grounded answers and durable event notifications are sent by background workers
registered on the existing pg-boss runner. PostgreSQL-backed inbox/outbox rows
make inbound processing and delivery idempotent, and group notifications stay
useful without exposing private Wiki metadata. The default `docker compose up`
is unchanged: the module is inert until an administrator configures Feishu
credentials.

## Technical Context

**Language/Version**: TypeScript 5.6, Node.js 20.9+ (Docker Node 24)

**Primary Dependencies**: Next.js 16, React 19.2, Drizzle ORM, pg-boss, Zod,
existing provider-agnostic AI services; Feishu official Node SDK
(`@larksuiteoapi/node-sdk`) for the WebSocket event dispatcher and message
delivery, used in-process by the web app.

**Storage**: Existing PostgreSQL 16 / pgvector database; all Feishu bindings,
inbox records, sessions, configuration, notification events, and deliveries are
durable PostgreSQL state. The Feishu app secret uses the existing AES-256-GCM
key-encryption primitive.

**Testing**: Vitest unit and integration tests, Playwright admin/binding E2E
tests, and Docker Compose integration tests with a mocked Feishu transport.

**Target Platform**: The existing single `web` Docker service. The web app opens
an outbound Feishu WebSocket; no callback URL, ingress rule, new container,
Compose profile, or port is introduced.

**Project Type**: Web application. The Feishu integration is a module under
`apps/web/src/server/feishu` plus route handlers under `apps/web/app`.

**Performance Goals**: Accept inbound questions within 3 seconds (the SDK event
handler persists the inbox record and enqueues); grounded answer
with citations within 10 seconds p95; eligible notification within 30 seconds
p95; resumed delivery within 60 seconds in 95% of injected outage/restart cases.

**Constraints**: No new stateful service and no new process; no raw
credentials/question/answer in logs or audit metadata; all resource reads
re-check `PermCtx` at request and job time; Feishu events are at-least-once;
notification delivery is at-least-once with deterministic de-duplication; no new
anonymous Wiki content endpoint and no public-content cache impact. The SDK event
connection is not part of the public REST/OpenAPI surface.

**Scale/Scope**: One Feishu app per Wiki deployment; direct messages and
@-mentions only; three notification event families; one active configuration;
defaults of 10 Q&A requests per user per minute, 30 per chat per minute,
30-minute conversation inactivity window, five delivery attempts, and 72-hour
delivery retention.

## Constitution Check

| Rule | Status before design | Design response |
|---|---|---|
| P1 simple deployment | PASS | The integration is a module in the existing `web` service; `docker compose up` starts nothing new and needs no Feishu credentials. No new container, profile, port, or stateful service. |
| P2/P3 provider-agnostic grounded AI | PASS | Delegate to the existing AI-question service and provider registry in-process; retain existing grounded citations and disabled-AI fallback. |
| P5 permissions first-class | PASS | The module resolves the binding, creates the bound user's `PermCtx`, and rechecks it at action execution and delivery through the same `can()` chokepoint as the web UI; group membership never substitutes for Wiki authorization. |
| P7 async-heavy work | PASS | The WebSocket event handler persists the inbox row and enqueues quickly; Q&A uses the existing AI action/pg-boss lifecycle and delivery uses durable rows plus background workers on the same runner. |
| P8 versioning | N/A | The feature neither changes nor stores page content. |
| P9 API/open standards | PASS | The SDK connection exposes no public REST resource. Admin/binding operations reuse first-party authenticated routes with normal Zod/audit behavior. |
| P10 explicit registration | PASS | Feishu Event handlers, admin/binding routes, and pg-boss workers are registered explicitly through a single `registerFeishuModule` seam and the existing `registerJobs` runner. |
| P11 URL/navigation | PASS | Admin configuration, subscriptions, bindings, and health have one canonical admin integration entry point; filters/pagination state uses query parameters. |
| P12 public reading | N/A | No anonymous published representation, public metadata, or navigation changes. |

**Post-design re-check**: PASS. Collapsing the former separate-process design
into an in-process module strengthens P1 and removes the inter-process trust
boundary while preserving every permission, audit, idempotency, and privacy
gate. No constitution amendment or complexity exception is needed.

## Project Structure

### Documentation (this feature)

```text
specs/019-feishu-bot/
├── plan.md
├── research.md
├── data-model.md
├── quickstart.md
├── contracts/
│   ├── feishu-long-connection.md  # SDK WebSocket inbound connection
│   └── integration-module.md      # in-process module boundaries + admin routes
└── tasks.md
```

### Source Code (repository root)

```text
apps/web/
├── app/
│   ├── (user)/user-center/feishu/  # authenticated binding-confirmation page
│   ├── (admin)/admin/feishu/       # canonical admin integration entry point
│   └── api/
│       ├── feishu/bindings/        # first-party binding confirm/unbind route
│       └── admin/feishu/           # first-party admin config/subscription routes
└── src/
    ├── server/
    │   ├── db/schema/              # Drizzle schema additions
    │   ├── feishu/                 # transport client (SDK wrapper) + test double
    │   ├── services/feishu-*.ts    # binding, delegation, sessions, notifications, config
    │   └── jobs/feishu-*.ts        # durable delivery/recovery workers + registration
    └── components/admin/feishu/    # admin views using existing UI primitives
packages/
└── shared/src/feishu.ts            # Zod contracts, bounded enums, shared types
```

**Structure Decision**: Keep all Feishu domain logic in `apps/web`, alongside
the services it reuses (AI question, permissions, audit, jobs). The transport
client (Feishu SDK wrapper for receive/send) is isolated in
`src/server/feishu` behind a small interface so tests substitute a deterministic
double. No separate application, no private HTTP delegation contract, and no
generic impersonation layer are introduced.

## Phase 0 — Research Decisions

Resolved decisions and evidence are recorded in [research.md](./research.md):

1. SDK WebSocket event dispatcher with durable inbox de-duplication.
2. Public-safe group cards and private-recipient direct fan-out.
3. In-process delegation: resolve the binding and build the bound user's
   `PermCtx`, then call the existing AI-question service directly.
4. PostgreSQL outbox/delivery state plus pg-boss workers for send + retry.
5. AES-GCM secret storage, queryable audit origin, and bounded retention.
6. Single-container deployment with conservative in-process rate limits.

## Phase 1 — Design

- Model all persisted state and transitions in [data-model.md](./data-model.md).
- Treat [integration-module.md](./contracts/integration-module.md) as the
  in-process module boundary: the SDK event dispatcher hands a validated, deduplicated
  command to the delegation service, which resolves the effective user. No
  service token or cross-process call exists.
- Write a notification event/delivery row transactionally with the originating
  domain transition where the source service can participate; otherwise write a
  recoverable outbox record at the terminal transition and document the boundary
  in tests.
- Render private notification content only after the delivery worker re-checks
  binding, subscription status, and the recipient's current `PermCtx`.
- Generate every database migration from `apps/web/src/server/db/schema/*.ts`
  with `pnpm db:generate`; do not hand-author migration SQL or journal entries.
- Keep the SDK event connection out of generated OpenAPI; validate the
  first-party admin/binding routes with shared Zod schemas.
- Use the existing design tokens and `src/components/ui/` primitives for the
  canonical administration surface; no inline feature-specific styling.

## Validation Strategy

1. Unit-test SDK event normalization boundaries, binding-token single use
   and expiry, inbox/delivery unique keys, group mode selection, encrypted
   secret serialization, and rate-limit accounting.
2. Integration-test in-process delegated Q&A under an active binding,
   unbound/revoked/disabled user, role/entitlement change between queue and
   execution, unreadable retrieval candidate, and group @-mention isolation.
3. Integration-test notification outbox recovery, five-attempt pause, expiry,
   duplicate Feishu event, duplicate delivery, public-safe card, and private
   fan-out with no protected group metadata.
4. Playwright-test the canonical admin routes for credentials, health, direct/
   group subscription modes, binding list/revocation, and URL-restored filters.
5. Run `pnpm lint`, `pnpm typecheck`, targeted Vitest/Playwright suites, then
   `docker compose up -d --build` plus the mock-transport WebSocket scenario.

## Complexity Tracking

No constitution violations require justification. The in-process design removes
the previously tracked inter-process delegation boundary.
