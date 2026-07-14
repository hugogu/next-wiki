# Implementation Plan: Feishu Bot Integration

**Branch**: `019-feishu-bot` | **Date**: 2026-07-14 | **Spec**: [spec.md](./spec.md)

**Input**: Feature specification from `/specs/019-feishu-bot/spec.md`

## Summary

Add an optional, stateless Feishu bot process that receives authenticated Feishu
events and uses a private, Feishu-specific wiki delegation boundary to bind users,
queue grounded AI questions, and deliver durable event notifications. The web app
remains the sole authority for binding resolution, permissions, audits, AI actions,
and notification state. PostgreSQL-backed inbox/outbox rows make inbound processing
and delivery idempotent; group notifications remain useful without exposing private
Wiki metadata.

## Technical Context

**Language/Version**: TypeScript 5.6, Node.js 20.9+ (Docker Node 24)

**Primary Dependencies**: Next.js 16, React 19.2, Drizzle ORM, pg-boss, Zod,
existing provider-agnostic AI services; Feishu official Node SDK for Event v2
decryption/verification and message delivery

**Storage**: Existing PostgreSQL 16 / pgvector database; all Feishu bindings,
inbox records, sessions, configuration, notification events, and deliveries are
durable PostgreSQL state. Feishu app secret uses the existing AES-256-GCM key
encryption primitive.

**Testing**: Vitest unit and integration tests, Playwright admin/binding E2E tests,
and Docker Compose integration tests with a mocked Feishu transport.

**Target Platform**: Docker Compose deployment; optional, stateless `bot` service
in a `feishu` profile sharing the web image and Compose network. Its only external
listener is the signed Feishu HTTPS callback, exposed through an operator-managed
ingress/reverse proxy or the optional bot port.

**Project Type**: Web application plus a private integration worker process.

**Performance Goals**: Acknowledge inbound questions within 3 seconds; successful
grounded answer with citations within 10 seconds p95; eligible notification within
30 seconds p95; recovery and resumed delivery within 60 seconds in 95% of injected
connection-loss cases.

**Constraints**: No new default stateful service; no raw credentials/question/answer
in logs or audit metadata; all resource reads re-check `PermCtx` at request and
job time; Feishu events are at-least-once; notification delivery is at-least-once
with deterministic de-duplication; no new anonymous endpoint or public-content
cache impact.

**Scale/Scope**: One bot per Wiki deployment; direct messages and @-mentions only;
three notification event families; one active configuration; defaults of 10 Q&A
requests per user per minute, 30 per chat per minute, 30-minute conversation
inactivity window, five delivery attempts, and 72-hour delivery retention.

## Constitution Check

| Rule | Status before design | Design response |
|---|---|---|
| P1 simple deployment | PASS | `bot` is an optional Compose-profile service using the same image and PostgreSQL; default `docker compose up` remains usable with no Feishu credentials or new stateful service. |
| P2/P3 provider-agnostic grounded AI | PASS | Delegate to the existing AI-question service and provider registry; retain existing grounded citations and disabled-AI fallback. |
| P5 permissions first-class | PASS | Web resolves the binding, creates the bound user's `PermCtx`, and rechecks it at action execution and delivery; group membership never substitutes for Wiki authorization. |
| P7 async-heavy work | PASS | Webhook acknowledgement is short; Q&A uses the existing AI action/pg-boss lifecycle and delivery uses durable rows plus background workers. |
| P8 versioning | N/A | The feature neither changes nor stores page content. |
| P9 API/open standards | PASS | Private, documented HTTP+JSON contract is used between bot and web. No public REST surface changes; any later public route must receive Zod/OpenAPI documentation. |
| P10 explicit registration | PASS | Feishu handlers, private routes, bot command, and pg-boss workers are registered explicitly. |
| P11 URL/navigation | PASS | Admin configuration, subscriptions, bindings, and health have one canonical admin integration entry point; filters/pagination state uses query parameters. |
| P12 public reading | N/A | No anonymous published representation, public metadata, or navigation changes. |

**Post-design re-check**: PASS. The data model and contracts preserve the gates
above; no constitution amendment or complexity exception is needed.

## Project Structure

### Documentation (this feature)

```text
specs/019-feishu-bot/
├── plan.md
├── research.md
├── data-model.md
├── quickstart.md
├── contracts/
│   ├── feishu-webhook.md
│   └── private-integration-api.md
└── tasks.md                 # created later by /speckit-tasks
```

### Source Code (repository root)

```text
apps/
├── web/
│   ├── app/
│   │   ├── api/internal/feishu/       # private bot-to-wiki route adapters
│   │   └── (admin)/.../feishu/        # canonical admin integration entry point
│   └── src/
│       ├── server/
│       │   ├── db/schema/              # Drizzle schema additions
│       │   ├── services/feishu-*.ts    # binding, delegation, delivery, config
│       │   ├── jobs/feishu-*.ts        # durable delivery/recovery workers
│       │   └── api/                    # private service auth and audit adapter
│       └── components/                 # admin views using existing UI primitives
└── feishu-bot/
    └── src/                            # Event v2 webhook, validation, sender, poller
packages/
└── shared/src/                         # Zod contracts, bounded enums, shared types
docker/
└── Dockerfile                          # same-image web/bot build targets or command
docker-compose.yml                      # optional feishu profile and callback port only
```

**Structure Decision**: Keep Wiki domain state and business rules in `apps/web`.
Create `apps/feishu-bot` only for external Feishu transport and private-contract
calls, so it cannot directly access domain services or PostgreSQL. Shared schemas
belong in `packages/shared`; no generic impersonation layer is introduced.

## Phase 0 — Research Decisions

Resolved decisions and evidence are recorded in [research.md](./research.md):

1. Event v2 webhook validation with durable inbox de-duplication.
2. Public-safe group cards and private-recipient direct fan-out.
3. A Feishu-specific delegated private API, not API-key impersonation.
4. PostgreSQL outbox/delivery state plus pg-boss wake-up and retry.
5. AES-GCM secret storage, queryable audit origin, and bounded retention.
6. Same-image optional Compose bot profile and conservative rate limits.

## Phase 1 — Design

- Model all persisted state and transitions in [data-model.md](./data-model.md).
- Treat [private-integration-api.md](./contracts/private-integration-api.md) as the
  only bot-to-wiki contract. The bot sends Feishu identifiers and sanitized input;
  the web app resolves the effective user.
- Use a database transaction to write a notification event/delivery row with the
  originating domain event whenever the source service can participate in the same
  transaction. If a pre-existing source cannot, write a recoverable outbox record
  at its terminal transition and document the boundary in tests.
- Render private notification content only after the delivery worker re-checks
  binding, subscription status, and the recipient's current `PermCtx`.
- Generate every database migration from `apps/web/src/server/db/schema/*.ts` with
  `pnpm db:generate`; do not hand-author migration SQL or journal entries.
- Update generated OpenAPI only if a public route is introduced. Keep the private
  contract out of public discovery and validate it with shared Zod schemas.
- Use the existing design tokens and `src/components/ui/` primitives for the
  canonical administration surface; no inline feature-specific styling.

## Validation Strategy

1. Unit-test signature/decryption adapter boundaries, binding-token single use and
   expiry, service-auth rejection, inbox/delivery unique keys, group mode selection,
   encrypted secret serialization, and rate-limit accounting.
2. Integration-test delegated Q&A under an active binding, unbound/revoked/disabled
   user, role/entitlement change between queue and execution, unreadable retrieval
   candidate, and group @-mention isolation.
3. Integration-test notification outbox recovery, five-attempt pause, expiry,
   duplicate Feishu event, duplicate delivery claim, public-safe card, and private
   fan-out with no protected group metadata.
4. Playwright-test the canonical admin routes for credentials, health, direct/group
   subscription modes, binding list/revocation, and URL-restored filters.
5. Run `pnpm lint`, `pnpm typecheck`, targeted Vitest/Playwright suites, then
   `docker compose up -d --build` plus the Feishu profile/mock transport scenario.

## Complexity Tracking

No constitution violations require justification.
