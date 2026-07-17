# Implementation Plan: First-Run Onboarding

**Branch**: `codex/021-first-run-onboarding` | **Date**: 2026-07-17 | **Spec**: [spec.md](./spec.md)
**Input**: Feature specification from `/specs/021-first-run-onboarding/spec.md`
**Depends on**: 001-core-wiki-platform, 004-system-ai-support, 020-model-capability-detector

## Summary

Extend the existing `/setup` first-admin bootstrap into a multi-step first-run
onboarding surface. The implementation reuses the current setup route,
session-backed Admin creation, AI administration services, OpenRouter model
detection, normal wiki page creation, and public-content cache invalidation.

The only new persistent state is a small singleton setup-progress record used
to resume post-account steps and report a final summary. Admin users, AI
settings/providers/models/assignments, and generated help pages continue to use
the existing domain tables and services.

## Technical Context

**Language/Version**: TypeScript 5.6, Node.js 20.9+ minimum

**Primary Dependencies**: Next.js 16.2 App Router, React 19.2, Drizzle ORM,
Zod, PostgreSQL 16+, pg-boss, TanStack Query, react-hook-form; existing AI
provider/detector services and Markdown rendering pipeline; no new runtime
dependency

**Storage**: PostgreSQL via Drizzle. Reuse `users`, `sessions`, `ai_settings`,
`ai_providers`, `ai_models`, `ai_model_capabilities`, `ai_purpose_assignments`,
`ai_user_entitlements`, `ai_actions`, `spaces`, `pages`, and `page_revisions`.
Add one singleton setup-progress table through a Drizzle-generated migration.

**Testing**: Vitest unit/service/route tests for setup state, first-admin
concurrency, OpenRouter bootstrap, secret redaction, sample page idempotency,
cache invalidation, and API contracts; Playwright first-run onboarding flows
for skip-AI, valid OpenRouter, retry/failure, and sample-page choices

**Target Platform**: Existing Linux container deployment through Docker Compose
or Kubernetes, with the same single web application and PostgreSQL baseline

**Project Type**: Next.js App Router monorepo with first-party setup UI,
server-only services, REST route handlers, shared Zod schemas, and published
wiki content

**Performance Goals**: First setup state read renders within normal page-load
budget; Admin account creation completes in under 2 seconds in normal
deployment; onboarding route handlers return within 500 ms when queuing
long-running AI detection; sample page generation completes in under 5 seconds
for the three built-in pages

**Constraints**: No new container, queue, cache, object store, or required AI
provider; no outbound AI or detector call when AI is skipped or globally
disabled; setup APIs are uncached; OpenRouter secrets are encrypted/redacted;
sample pages are versioned Markdown pages; public page/nav cache is invalidated
when sample pages are created or updated; `/setup` remains the single canonical
setup entry point

**Scale/Scope**: One setup flow per deployment; one initial Admin; optional
OpenRouter bootstrap for three AI purposes (`wiki_text`, `wiki_embedding`,
`wiki_image`); three optional sample/help pages (`welcome`,
`help/markdown-syntax`, `help/main-features`)

No `NEEDS CLARIFICATION` items remain. Phase 0 decisions are recorded in
[research.md](./research.md).

## Constitution Check

*Gate: passed before Phase 0 research and re-checked after Phase 1 design.*

| Principle / mandate | Status | Design evidence |
|---|---|---|
| P1 Simple Deployment | PASS | Reuses the current app and PostgreSQL. OpenRouter is optional and skipping AI leaves the wiki usable. The setup-progress table does not add a service. |
| P2 AI-native, vendor-independent | PASS | OpenRouter is only a bootstrap option behind existing provider/detector abstractions. No model call occurs when AI is skipped or disabled. |
| P3 Portable AI memory | PASS | Generated pages are normal wiki pages/revisions. AI features continue to use existing permission-scoped retrieval and assignments. |
| P4 Rendering pipeline | PASS | Sample/help pages store Markdown source and use the existing render pipeline; no rendered HTML is authored by setup code. |
| P5 Permissions first-class | PASS | First-admin creation is only available before an Admin exists. Post-account onboarding steps require the signed-in initial Admin. Normal Admin AI/page permissions are reused. |
| P6 UI consistency | PASS | `/setup` uses existing layout, design tokens, i18n keys, and UI primitives. No page-specific styling or duplicated setup entry is introduced. |
| P7 Async-first | PASS | OpenRouter detection/model sync uses existing AI action/job behavior when it can exceed 500 ms; setup route handlers return resumable status. |
| P8 Version everything | PASS | Example/help pages are created or updated as published revisions with normal version history. No hard delete is introduced. |
| P9 Open standards | PASS | OpenRouter integration remains OpenAI-compatible/provider-adapter based. Admin-facing contracts are REST + JSON and shared Zod schemas. |
| P10 Explicit over implicit | PASS | New setup service, schemas, routes, sample definitions, and job usage are explicitly imported/registered. No filesystem discovery is used. |
| P11 Native navigation | PASS | `/setup` is the single canonical setup URL. Step state is resumable via server state; final links go to normal wiki/Admin resources. |
| P12 Public content delivery | PASS | Sample pages use normal published-page cache representation. Creating/updating/skipping sample pages invalidates affected page paths and public navigation; setup controls are never embedded in cached page bodies. |
| API architecture | PASS | Route handlers stay thin and delegate to services with shared schemas. Public wiki APIs are unchanged. |
| Project structure / frontend data flow | PASS | Server state is fetched/mutated through setup resources. Client-only state is limited to form fields and step UI. |

**Anti-pattern check**: no duplicate setup entry point, no vendor-locked AI
runtime path, no generated content stored outside page revisions, no public page
depending on session-bound setup state, no direct DB schema changes outside
Drizzle migrations, and no cached backend setup API. All gates pass after
design.

## Project Structure

### Documentation

```text
specs/021-first-run-onboarding/
├── plan.md
├── research.md
├── data-model.md
├── quickstart.md
├── contracts/
│   ├── rest-api.md
│   └── setup-ui-flow.md
└── tasks.md                       # Created later by /speckit-tasks
```

### Source changes

```text
apps/web/
├── app/
│   ├── setup/page.tsx                         # extend existing canonical setup page
│   └── api/
│       ├── auth/setup/route.ts                # preserve first-admin creation endpoint
│       └── setup/
│           ├── route.ts                       # setup state and summary resource
│           ├── ai-bootstrap/route.ts          # optional OpenRouter bootstrap resource
│           └── sample-pages/route.ts          # optional generated page set resource
├── src/
│   ├── components/auth/
│   │   └── SetupForm.tsx                      # evolve into first step or wrapper
│   ├── components/setup/
│   │   ├── FirstRunOnboarding.tsx
│   │   ├── OpenRouterBootstrapStep.tsx
│   │   ├── SamplePagesStep.tsx
│   │   └── SetupSummary.tsx
│   ├── i18n/
│   │   ├── en.ts
│   │   ├── zh.ts
│   │   └── keys.ts
│   └── server/
│       ├── db/schema/
│       │   ├── index.ts                       # setup_progress table
│       │   └── enums.ts                       # setup status enums if needed
│       ├── seed/index.ts                      # keep core seed; delegate sample definitions
│       └── services/
│           ├── setup.ts                       # first-run state machine and account step
│           ├── setup-ai.ts                    # OpenRouter bootstrap orchestration
│           └── setup-sample-pages.ts          # idempotent sample/help page writer
└── e2e/
    └── setup-onboarding.spec.ts

packages/shared/
└── src/
    ├── auth.ts                                # extend setup account schema if needed
    └── setup.ts                               # setup state/bootstrap/sample schemas
```

**Structure Decision**: Keep first-run setup in the existing auth/setup
boundary for account creation, add a small `setup` service boundary for
post-account onboarding, and reuse AI/page services instead of introducing a
separate installer subsystem. Sample page definitions should be plain,
versioned Markdown fixtures owned by the setup sample-page service, with seed
code reusing the same definitions where practical.

## Complexity Tracking

| Addition | Why Needed | Simpler Alternative Rejected Because |
|---|---|---|
| Singleton setup-progress record | The flow must resume after Admin creation, remember skipped/failed AI and sample-page choices, and avoid duplicate side effects across refreshes. | Deriving everything from existing tables cannot distinguish "not asked" from "declined" or recover partial example generation. |
| Dedicated setup sample-page writer | Welcome enrichment, Markdown guide, and feature overview need idempotent collision handling and public cache invalidation. | Leaving content in boot seed only would not let the Admin opt in/out during onboarding and would not handle retries cleanly. |
| Setup AI bootstrap orchestration | Onboarding needs a one-click OpenRouter path that reports per-purpose results while using existing AI admin primitives. | Forcing users into the full Admin AI screen misses the requested quick-start value; duplicating AI configuration logic would drift from canonical AI management. |
