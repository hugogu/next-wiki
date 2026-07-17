# Implementation Plan: Model Capability Detector

**Branch**: `codex/020-model-capability-detector` | **Date**: 2026-07-17 | **Spec**: [spec.md](./spec.md)
**Input**: Feature specification from `/specs/020-model-capability-detector/spec.md`
**Depends on**: 004-system-ai-support

## Summary

Refactor the current OpenRouter-specific model detector into an explicitly
registered Model Capability Detector subsystem, then add Cloudflare as a second
detector source. Model synchronization will ask the selected detector for a
normalized `DetectedModel` list, merge detector-owned metadata into the existing
AI model catalog, and preserve manual capability overrides as the highest-trust
source.

The detector boundary is separate from runtime AI provider adapters. OpenRouter
continues to enrich known hosted vendors through its global detector credential.
Cloudflare detection uses provider-scoped Cloudflare account configuration and
encrypted credentials to call Cloudflare model search and per-model schema
inspection. Long detector runs use the existing `model_sync` action lifecycle so
the admin page is not blocked by per-model schema requests.

## Technical Context

**Language/Version**: TypeScript 5.6, Node.js 20.9+ minimum

**Primary Dependencies**: Next.js 16.2 App Router, React 19.2, Drizzle ORM, Zod,
PostgreSQL 16+, pg-boss, TanStack Query; native `fetch`; no new runtime
dependency

**Storage**: Existing PostgreSQL AI tables: `ai_settings`, `ai_providers`,
`ai_models`, `ai_model_capabilities`, `ai_actions`; provider config JSON,
encrypted provider credentials, model `raw_metadata`, capability `details`, and
action metadata carry detector-specific state

**Testing**: Vitest unit and service tests for detector registry, OpenRouter
regression, Cloudflare fixtures, sync merge behavior, route contracts, and
secret redaction; Playwright admin AI model sync and manual override regression

**Target Platform**: Linux containers through Docker Compose or Kubernetes;
same single web app and PostgreSQL deployment baseline

**Project Type**: Next.js App Router monorepo with first-party admin UI and
server-only AI service modules

**Performance Goals**: Provider model-sync route returns an accepted action
within 500 ms for detector-backed syncs; detector calls use bounded per-request
timeouts; one failed per-model schema lookup does not block other model updates

**Constraints**: AI-disabled mode performs no detector network calls; detector
credentials are encrypted and redacted; no default service or dependency is
added; manual overrides have precedence; no hard delete of catalog models;
model names are never capability proof; admin APIs are not cached

**Scale/Scope**: Two detector sources in this slice, OpenRouter and Cloudflare;
one provider sync run at a time per provider; expected catalog size is provider
marketplace scale, with per-model enrichment concurrency bounded by the service

No `NEEDS CLARIFICATION` items remain. Phase 0 decisions are recorded in
[research.md](./research.md).

## Constitution Check

*Gate: passed before Phase 0 research and re-checked after Phase 1 design.*

| Principle / mandate | Status | Design evidence |
|---|---|---|
| P1 Simple Deployment | PASS | Reuses the existing web app, PostgreSQL, pg-boss, and native `fetch`; no new container, service, queue, SDK, or default AI dependency is added. |
| P2 AI-native, vendor-independent | PASS | OpenRouter and Cloudflare are implementations behind one detector contract. AI-disabled mode blocks all detector calls. |
| P3 Portable AI memory | PASS | This feature changes provider/model metadata only. It does not change page storage, AI-authored content, retrieval citations, or the knowledge index source of truth. |
| P5 Permissions first-class | PASS | Detector configuration, status, and sync operations remain admin-only through the existing `manage_ai` chokepoint. |
| P7 Async-first | PASS | Cloudflare schema enrichment can exceed request budget, so provider model sync is action-backed and worker-executed. Routes return quickly with resumable status. |
| P9 Open standards over proprietary | PASS | Cloudflare-specific API calls are isolated inside the Cloudflare detector adapter; product services consume only normalized detector results. |
| P10 Explicit over implicit | PASS | Detector implementations are registered in one registry. No filesystem discovery, dynamic vendor loading, or global singleton provider client is introduced. |
| API architecture | PASS | Existing admin REST routes remain thin adapters over shared schemas and server services. No public client API is added. |
| Project structure / frontend data flow | PASS | Detector code stays server-only. Admin UI reads server state through existing AI admin resources and action status, with transient form state local to components. |
| P12 Public content delivery | PASS - N/A | The feature affects authenticated admin AI configuration only. It does not change anonymous published page body, public metadata, navigation, cache tags, or ISR paths. |

**Anti-pattern check**: no vendor-locked model management path, no detector
credentials in client responses, no provider discovery when AI is disabled, no
hard delete of models that disappear from a catalog, no public-reader cache
change, and no duplicate admin entry point. All gates pass after design.

## Project Structure

### Documentation

```text
specs/020-model-capability-detector/
├── plan.md
├── research.md
├── data-model.md
├── quickstart.md
├── contracts/
│   ├── model-capability-detector.md
│   └── admin-model-sync.md
└── tasks.md                       # Created later by /speckit-tasks
```

### Source changes

```text
apps/web/
├── app/api/ai/
│   ├── providers/[id]/model-syncs/route.ts       # return/resume model_sync action
│   └── actions/[id]/route.ts                     # existing status resource reused
├── src/
│   ├── components/admin/ai/
│   │   ├── ModelDetectorPanel.tsx                # detector credential/status controls
│   │   ├── ModelCatalog.tsx                      # provenance and partial status display
│   │   └── ProviderForm.tsx                      # Cloudflare account detector config
│   └── server/
│       ├── ai/
│       │   ├── model-detectors/
│       │   │   ├── types.ts                      # detector contract and normalized result
│       │   │   ├── registry.ts                   # explicit detector registration
│       │   │   ├── openrouter.ts                 # moved current detector behavior
│       │   │   └── cloudflare.ts                 # model search + schema enrichment
│       │   └── types.ts                          # shared discovered model shape updates
│       ├── db/schema/
│       │   ├── enums.ts                          # shared enum additions only if needed
│       │   └── index.ts                          # existing AI tables reused
│       └── services/
│           ├── ai-admin.ts                       # sync orchestration and merge behavior
│           └── ai-actions.ts                     # existing model_sync action lifecycle
└── e2e/admin-ai*.spec.ts                         # admin sync and override coverage

packages/shared/
└── src/ai.ts                                     # detector source/config schemas
```

**Structure Decision**: The feature stays inside the existing AI subsystem. The
detector registry is a sibling to provider adapters because detection is a
catalog capability, not runtime inference. `ai-admin.ts` remains the model sync
orchestrator and owns database merge behavior; individual detectors never write
database rows or evaluate assignments.

## Complexity Tracking

| Addition | Why Needed | Simpler Alternative Rejected Because |
|---|---|---|
| Detector registry and contract | OpenRouter and Cloudflare provide different catalog and schema shapes, but sync, overrides, and assignment validation need one normalized result. | Keeping OpenRouter functions in `ai-admin.ts` and adding Cloudflare branches would deepen vendor lock-in and violate explicit registration. |
| Action-backed detector sync | Cloudflare requires list plus per-model schema calls, which can exceed the request budget and partially fail. | A synchronous route would block the admin page and violate P7 once catalog size grows or Cloudflare rate limits. |
