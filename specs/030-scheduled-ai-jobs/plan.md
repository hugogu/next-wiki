# Implementation Plan: Scheduled AI Jobs

**Branch**: `030-scheduled-ai-jobs` | **Date**: 2026-07-30 | **Spec**: [spec.md](./spec.md)

**Input**: Feature specification from `specs/030-scheduled-ai-jobs/spec.md`

## Summary

Add an Admin-managed, recurring Scheduled AI Jobs resource that turns a scoped natural-language instruction into a durable, auditable background run. The scheduler creates a durable run at the configured local-calendar time, then dispatches a dedicated AI action that calls the same governed Wiki AI tool runtime used by interactive chat. The feature introduces a small scheduling domain for job definitions and permanent run history, while extracting the existing tool-enabled question orchestration into a shared execution primitive.

The design deliberately does not make a scheduled job a more privileged chat turn. It resolves the execution owner and their current permissions at run time, passes a server-enforced target scope into every tool call, and forces every mutation to `admin_review`. Existing page drafts/revision diffs, non-page tool proposals, evidence links, action events, and audit records remain the authoritative change and provenance paths. A central one-minute pg-boss tick discovers due definitions; jobs are not registered dynamically with pg-boss.

## Technical Context

**Language/Version**: TypeScript 5.6 on Node.js 20.9+ (Node 24 in Docker); React 19.2 and Next.js 16 App Router.

**Primary Dependencies**: Existing Next.js route handlers, Drizzle ORM, PostgreSQL 16, pg-boss, Zod, TanStack Query, React Hook Form, existing AI action/provider/tool runtime, page revision/draft, tag, proposal, evidence, audit, and i18n systems. Add direct dependency `cron-parser` for strict cron/time-zone next-occurrence calculation; do not rely on pg-boss's transitive copy.

**Storage**: PostgreSQL tables for durable job definitions and permanent run history; existing `ai_actions`, encrypted `ai_action_inputs`, action events, tool workflows/calls, proposal records, drafts/revisions, Raw/source evidence, and audit records. No new service, queue broker, object store, or content store.

**Testing**: Vitest unit/integration tests for shared schemas, recurrence/time-zone calculation, due-run claiming, idempotency, lifecycle recovery, permission/scope enforcement, forced review, services, queue handlers, and API routes; React component tests for management and history views; Playwright E2E for Admin CRUD, run-now, pause, history/detail, URL state, authorization, and proposal-only mutations.

**Target Platform**: Existing full-stack web application and worker deployment via Docker Compose or Kubernetes, with PostgreSQL as the only required stateful service.

**Project Type**: Full-stack web-service monorepo using pnpm workspaces and Turborepo.

**Performance Goals**: The due-job tick completes its database claim and enqueue work within one minute of an eligible occurrence under normal conditions. Admin list/detail requests return ordinary paginated results without waiting for model work. A run exposes queued/running/terminal status through polling within two seconds of a persisted state change. A single job never overlaps itself.

**Constraints**: All model work remains asynchronous. Background paths enter through `runWithoutDataCache` before any potentially request-cached service. The execution owner, AI entitlement, enabled tool policy, page/resource permissions, and target scope are rechecked at run time. Scheduled mutations always create reviewable drafts/proposals; they cannot apply, publish, merge, or delete automatically. API responses are non-cacheable. No full tool result, secret, or inaccessible source material appears in job results. All schema changes use `pnpm db:generate`.

**Scale/Scope**: Admin-defined jobs only; strict five-field cron recurrence with IANA time zones; one central minute tick; one active run per definition; bounded tool-loop work per run. Initial target scope supports existing spaces and optional page-tree roots/tags. Personal schedules, event triggers, workflow chaining, notifications, arbitrary scripts/tools, and automatic durable changes are excluded.

## Constitution Check

*GATE: Must pass before Phase 0 research. Re-check after Phase 1 design.*

Source: `.specify/memory/constitution.md` v2.3.0 and binding architecture mandates.

| Principle / Mandate | Status | Design compliance |
| --- | --- | --- |
| P1 Simple Deployment | PASS | Reuses PostgreSQL and pg-boss already required by the product. `cron-parser` is an in-process library, not a service or new deployment prerequisite. |
| P2 AI-Native / Never Vendor-Locked | PASS | The runner calls the existing provider-agnostic Wiki AI/provider assignment and capability checks; no vendor SDK or fallback provider is introduced. AI-disabled or unsupported states terminate safely. |
| P3 Portable, Self-Growing AI Memory | PASS | Runs reuse tool evidence/citation contracts; suggestions retain job/run/action provenance and are drafts/proposals before review. No source evidence is silently overwritten or published. |
| P4 Rendering Pipeline | PASS | Jobs create no alternate render path. Page suggestions remain source revisions/drafts and use the existing renderer. |
| P5 Permissions First-Class | PASS | A worker resolves the active execution owner and builds a current permission context. Scope guards apply to every tool read/write; run, proposal, and evidence detail reads recheck access. |
| P6 Style System & UI Consistency | PASS | The canonical Admin route reuses existing Layout, SettingsTabs, DataTable, form controls, status badges, pagination, proposal detail, translations, and action-history patterns. |
| P7 Async-First | PASS | HTTP routes persist/return resources only. A fixed pg-boss tick claims due work; a dedicated scheduled-AI queue performs model/tool work off the request path. |
| P8 Version Everything | PASS | Page content remains draft/revision based. Job definitions version their snapshots; runs are durable append-only history. Existing proposal conflict/review and soft retirement rules apply. |
| P9 Open Standards | PASS | Admin REST routes use shared Zod contracts and generated OpenAPI documentation. Cron is a documented standard syntax; persisted dates are UTC with an IANA time-zone identifier. |
| P10 Explicit Over Implicit | PASS | New queues, worker handlers, action handler, schedule parser, scope guard, routes, and navigation entry are explicit static registrations. No dynamic tool or filesystem discovery is introduced. |
| P11 Native Navigation & Unified Entries | PASS | `/admin/ai/jobs` is the sole management entry; list tabs/filters/pagination use URL search params; definition and run detail have canonical resource routes and breadcrumbs. |
| P12 Public Reading Static by Default | PASS | Job data is authenticated Admin-only. A job changes public content only after existing review/apply/publish flow, which performs normal public invalidation. |
| API Architecture | PASS | Thin route handlers call a scheduled-jobs service; shared schemas are in `packages/shared`; no route talks to a tool executor or database directly. |
| AI Knowledge / Chat / Search | PASS | The tool-loop primitive, evidence links, policy, and retrieval services remain shared. A server-side scope guard further narrows the tool/runtime surface for scheduled work. |
| Frontend Data Flow | PASS | Server state uses route handlers and TanStack Query; form state uses React Hook Form; filters, tabs, and pagination are URL state; active-run polling uses normal query refresh. |

### AI Memory Growth-Loop Gate

PASS. Source-of-truth state is the job definition/run record, normal AI action/workflow, page revisions/drafts, non-page proposals, and Raw/source evidence. A run stores an immutable effective-definition snapshot but resolves live permissions and model/tool policy at execution. Model output may only prepare existing reviewable change types; reviewers recheck conflicts and permissions before application. Derived summaries, UI counters, and schedule next-run values are recomputable and not canonical knowledge.

- If the feature creates or changes anonymously readable published content,
  document its static/ISR representation, cache lifetime, and exact
  invalidation paths/tags. Document why it is N/A otherwise.
- If the feature captures source material, feeds AI memory, generates durable
  knowledge, or lets an AI agent mutate content, document the source-of-truth,
  provenance/citation model, permission re-checks, generated-content review or
  publication boundary, and how derived indexes or suggestions are rebuilt.

## Project Structure

### Documentation (this feature)

```text
specs/030-scheduled-ai-jobs/
├── plan.md              # This file (/speckit-plan command output)
├── research.md          # Phase 0 output (/speckit-plan command)
├── data-model.md        # Phase 1 output (/speckit-plan command)
├── quickstart.md        # Phase 1 output (/speckit-plan command)
├── contracts/           # Phase 1 output (/speckit-plan command)
└── tasks.md             # Phase 2 output (/speckit-tasks command - NOT created by /speckit-plan)
```

### Source Code (repository root)
```text
apps/web/
├── app/
│   ├── (admin)/admin/ai/jobs/
│   │   ├── page.tsx
│   │   └── [id]/
│   │       ├── page.tsx
│   │       └── runs/[runId]/page.tsx
│   └── api/ai/
│       ├── scheduled-jobs/
│       │   ├── route.ts
│       │   └── [id]/
│       │       ├── route.ts
│       │       ├── duplicate/route.ts
│       │       └── runs/{route.ts,[runId]/route.ts,cancel/route.ts}
│       └── scheduled-job-runs/route.ts
├── src/
│   ├── components/admin/ai/
│   │   ├── ScheduledAiJobForm.tsx
│   │   ├── ScheduledAiJobList.tsx
│   │   ├── ScheduledAiJobDetail.tsx
│   │   ├── ScheduledAiJobRunList.tsx
│   │   └── ScheduledAiJobRunDetail.tsx
│   ├── server/
│   │   ├── db/schema/{enums.ts,index.ts,ai-tools.ts}
│   │   ├── jobs/{runtime.ts,register.ts,scheduled-ai-jobs.ts,ai-actions.ts}
│   │   └── services/
│   │       ├── scheduled-ai-jobs.ts
│   │       ├── scheduled-ai-execution.ts
│   │       ├── ai-actions.ts
│   │       ├── ai-tool-runtime.ts
│   │       ├── ai-tool-executors.ts
│   │       └── ai-tool-proposals.ts
│   └── i18n/{keys.ts,types.ts}
├── messages/{en.json,zh.json}
└── e2e/scheduled-ai-jobs.spec.ts

packages/shared/
└── src/{scheduled-ai-jobs.ts,index.ts}
```

**Structure Decision**: Keep all business rules in server-only services and reuse the AI Action/Tool Runtime rather than creating a scheduler-specific AI stack. Keep Admin route shells thin and client server state behind existing REST routes. The new shared module owns Zod contracts and views only; it has no server dependencies. Job-run history is a scheduling domain record, while action/workflow/proposal/evidence remain existing runtime records linked to it.

## Phase 0: Research Decisions

See [research.md](./research.md) for the resolved decisions on shared runtime extraction, scheduled-action identity, recurrence, atomic due claims/recovery, target-scope enforcement, forced review, retention/provenance, and UI/API entry points. No `NEEDS CLARIFICATION` items remain.

## Phase 1: Design and Contracts

1. Define definition/run entities, durable links to actions/proposals, validation, indexes, and transitions in [data-model.md](./data-model.md).
2. Define Admin REST resource and error contracts in [contracts/admin-api.md](./contracts/admin-api.md), including non-cacheable responses and OpenAPI generation requirements.
3. Define how a scheduled run enters and constrains the shared tool runtime in [contracts/runtime.md](./contracts/runtime.md).
4. Define canonical Admin routes, URL state, reusable components, polling, and redaction behavior in [contracts/ui.md](./contracts/ui.md).
5. Capture local setup and end-to-end verification in [quickstart.md](./quickstart.md).
6. Update the managed Spec Kit context block in `AGENTS.md` to reference this plan.

## Implementation Sequence

1. Add `cron-parser`, shared schedule/job schemas and views, Drizzle enums/tables/indexes, action/proposal links, and generate the migration. Commit this schema/contract unit separately.
2. Extract the minimal shared governed tool-workflow orchestration from the interactive Wiki-question handler. Preserve existing chat behavior with focused regression tests; add a scheduled execution policy that forces mutations to review and passes a typed target scope to executor guards. Commit this refactor separately from scheduling behavior.
3. Implement definition/run services: validation, next-occurrence calculation, scope checks, immutable snapshots, soft retirement, due tick/atomic claim, active-run exclusion, enqueue, cancellation, and startup recovery.
4. Register the tick and dedicated scheduled-AI queue/action handler. Run the shared workflow in `runWithoutDataCache`; persist bounded safe summaries and links back to drafts/proposals/evidence.
5. Add Admin routes, generated OpenAPI contract annotations, canonical routes/navigation, localized list/form/detail components, URL-backed filters/pagination, and active-run polling. Link to the existing proposal and page-diff review surfaces rather than reproducing them.
6. Add unit/integration/route/component/E2E coverage; run migration/OpenAPI/i18n generation, Docker Compose verification, lint, type-check, and UI automation. Re-run `pnpm db:generate` and require no schema changes.

## Post-Design Constitution Check

PASS. The data model uses PostgreSQL and pg-boss only; all side-effecting AI work is durable and asynchronous. A job definition cannot widen tool access, and the scheduled-policy override removes the existing Admin immediate-apply path. New scheduling records explain when/why work ran but do not become a second content store or a public route. All page/public mutations remain behind normal drafts, proposals, approval, versioning, and invalidation.

## Complexity Tracking

No constitution violations or justified complexity exceptions.
