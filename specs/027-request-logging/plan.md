# Implementation Plan: Outbound Request Logging

**Branch**: `027-request-logging` | **Date**: 2026-07-26 | **Spec**: [spec.md](./spec.md)

**Input**: Feature specification from `/specs/027-request-logging/spec.md`

## Summary

Add a reusable, opt-in outbound-request capture layer for the existing AI
provider adapters and future explicitly registered external integrations. The
layer stores one common request record with level-dependent headers, bodies, and
error detail, while a separate singleton controls the global switch, detail
level, and retention period. The first delivery exposes records and settings
through an Admin-only `REQUEST LOG` page under `DATA & OPERATIONS`.

The implementation keeps provider-specific request handling in the existing AI
HTTP boundary, but moves capture decisions and persistence into a generic
request-log service. Sensitive raw fields are encrypted at rest and only
decrypted for an authorized Admin detail view. Request logging is best effort:
capture failures never alter the original provider result. Existing pg-boss
cleanup work removes expired records; no new service is added to the default
deployment.

## Technical Context

**Language/Version**: TypeScript 5.6 on Node.js 20.9+ (Docker image tracks Node 24); React 19.2 and Next.js 16 App Router.

**Primary Dependencies**: Existing Next.js route handlers and Admin App Router pages, Drizzle ORM, PostgreSQL 16, pg-boss cleanup worker, Zod schemas in `packages/shared`, existing AES-256-GCM key encryption, TanStack Query, existing table/pagination/UI primitives, and the existing AI provider adapter registry.

**Storage**: PostgreSQL 16. Add a singleton `request_log_settings` row and one generic `outbound_request_logs` table. Store metadata needed for filtering in normal columns; store raw target/header/body/error envelopes encrypted at rest. Generate the migration from Drizzle schema changes with `pnpm db:generate`; never hand-author SQL, journal entries, or snapshots.

**Testing**: Vitest unit/integration tests for capture levels, body/header preservation, streaming and transport failures, encryption/decryption, settings and retention services, permissions, and routes; React tests for the settings/list/detail states; Playwright E2E for Admin capture, AI reproduction, filters, detail inspection, and non-Admin denial. Run lint, typecheck, and the relevant test suites.

**Target Platform**: Existing Docker Compose/Kubernetes deployment with the Next.js web app, worker process, and PostgreSQL. No new default container, queue backend, cache service, or object store.

**Project Type**: Full-stack web-service monorepo using pnpm workspaces and Turborepo.

**Performance Goals**: Disabled capture adds no payload serialization and only the existing settings decision check at the AI request boundary. Enabled capture must not delay the original provider result on a logging write failure. The Admin list must return the first page of 1,000 records within 2 seconds under normal conditions; detail payload reads may be larger and are authenticated/non-cached. Expired-record cleanup runs in the existing background cleanup schedule.

**Constraints**: Capture is off by default and only Admins can change settings or read records. `Status`, `Header`, and `All` have strict field boundaries. Raw values may contain credentials and user content, so they are encrypted at rest, omitted from list responses, excluded from ordinary application logs/URLs, and revealed only on the Admin detail surface. The provider request must continue to support streaming, timeout, cancellation, retry, and malformed-response behavior. The logging path must not call or recursively log another outbound service. All API responses are dynamic and must not be cached.

**Scale/Scope**: One global capture setting and one shared log collection. First delivery instruments all requests traversing the existing AI provider HTTP boundary: provider tests/model discovery, chat streaming, embeddings, and image generation. A future integration can opt in through the explicit common contract; broad interception of arbitrary browser `fetch` calls or retrofitting every existing external integration is out of scope. Initial retention is 24 hours and configurable from 1 to 168 hours.

## Constitution Check

*GATE: Must pass before Phase 0 research. Re-check after Phase 1 design.*

Source: `.specify/memory/constitution.md` v2.3.0 and the repository's managed
Spec Kit context.

| Principle / Mandate | Status | Design compliance |
|---|---|---|
| P1 Simple Deployment | PASS | Reuses PostgreSQL and the existing worker cleanup schedule; no new service, queue backend, cache, or object store is required. |
| P2 AI-Native / Never Vendor-Locked | PASS | Capture is below the provider adapter boundary and applies equally to configured provider kinds and future integrations; no vendor SDK is introduced. |
| P3 Portable, Self-Growing AI Memory | PASS | Request records are operational evidence only and do not become durable wiki knowledge automatically. If later used as source material, existing Raw/provenance rules remain the governing path. |
| P4 Rendering Pipeline | PASS | No page rendering or content pipeline changes. |
| P5 Permissions First-Class | PASS | Add a dedicated Admin-only `manage_request_logs` permission action; API-key actors and non-Admins have no access, and every route/service checks current permission. |
| P6 Style System & UI Consistency | PASS | Reuses existing Admin layout, DataTable, Pagination, Button, Select, disclosure, and design tokens; adds no feature-local visual system. |
| P7 Async-First | PASS | AI calls remain in existing pg-boss actions; capture persistence and expiry cleanup are non-blocking/batch worker work, not new synchronous model work. |
| P8 Version Everything | PASS | The feature does not mutate pages or revisions. Request records are append-only operational attempts with an explicit expiry policy. |
| P9 Open Standards | PASS | Admin routes use REST + JSON and shared Zod/OpenAPI schemas; the capture contract is provider-agnostic. |
| P10 Explicit Over Implicit | PASS | AI provider capture is registered at the explicit provider HTTP boundary; future sources must explicitly adopt the request-log contract. No global runtime interception or filesystem discovery is used. |
| P11 Native Navigation & Unified Entries | PASS | One canonical `REQUEST LOG` entry is added to the existing Data & Operations group; list filters and pagination are URL-restorable and detail navigation has a back link. |
| P12 Public Reading Static by Default | PASS | The authenticated Admin surface and request records never enter anonymous public documents or caches. |
| API Architecture | PASS | Route handlers stay thin over shared schemas and services; all request-log endpoints are dynamic and non-cached. |
| AI Knowledge Layer | PASS | Captured request data is diagnostic operational data, not canonical knowledge or an index source. |
| Background Job Cache Context | PASS | Cleanup runs in a worker and uses direct DB/service paths without request cache context. |

### Gate result

PASS. No constitution violation or new default dependency is introduced. The
feature's sensitive data boundary is explicit and the normal no-AI/no-capture
deployment remains usable.

## Project Structure

### Documentation (this feature)

```text
specs/027-request-logging/
├── plan.md
├── research.md
├── data-model.md
├── quickstart.md
├── contracts/
│   ├── api-delta.md
│   └── ui-contract.md
└── tasks.md              # Created later by /speckit-tasks
```

### Source Code (repository root)

```text
apps/web/
├── app/
│   ├── (admin)/admin/request-log/{page.tsx,[id]/page.tsx}
│   └── api/request-log/{route.ts,settings/route.ts,[id]/route.ts}
├── src/
│   ├── components/admin/request-log/{RequestLogPanel.tsx,RequestLogDetail.tsx}
│   ├── server/
│   │   ├── db/schema/{enums.ts,index.ts,request-logs.ts}
│   │   ├── services/request-log.ts
│   │   ├── ai/providers/http-client.ts
│   │   ├── permissions/index.ts
│   │   ├── jobs/ai-cleanup.ts
│   │   └── api/openapi-schemas.ts
│   └── i18n/keys.ts
├── messages/{en.json,zh.json}
└── public/openapi.json

packages/shared/src/{index.ts,request-log.ts}
```

**Structure Decision**: Keep durable records in PostgreSQL and the capture
boundary in `apps/web/src/server/ai/providers/http-client.ts`, because every
current AI provider operation already passes through that explicit boundary.
Expose the reusable capture interface from
`apps/web/src/server/services/request-log.ts`; future outbound integrations opt
in by calling that service/wrapper explicitly. Keep shared request-log enums,
query schemas, settings views, list summaries, and detail envelopes in
`packages/shared/src/request-log.ts`. Keep Admin route handlers thin and put
filtering, authorization, decryption, retention, and settings transitions in
the service.

## Complexity Tracking

> No constitution violations. This feature uses the existing PostgreSQL and
> worker footprint, so no complexity exception is required.

| Violation | Why Needed | Simpler Alternative Rejected Because |
|---|---|---|
| — | — | — |

## Phase 0 -> Phase 1 Outputs

- `research.md` — decisions covering the common capture boundary, level semantics, encrypted storage, streaming capture, permissions, retention, and API/UI shape.
- `data-model.md` — settings/log entities, encrypted payload envelopes, indexes, retention state, and relationships to existing user/audit records.
- `contracts/api-delta.md` — Admin-only settings, paginated list, detail, filters, and OpenAPI schemas.
- `contracts/ui-contract.md` — Data & Operations navigation, settings confirmation, URL-restorable list, detail disclosure, and permission/empty states.
- `quickstart.md` — Docker-backed and fixture-backed validation scenarios for capture, failure diagnosis, security, and retention.

## Post-Design Constitution Re-check

Re-evaluated after Phase 1 design: all gates still PASS. The design keeps the
request logger explicit and provider-agnostic, encrypts sensitive fields at
rest, denies API-key/non-Admin access, keeps raw diagnostic data outside public
content, and reuses the existing background cleanup path without adding a
default service.
