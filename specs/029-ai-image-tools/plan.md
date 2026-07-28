# Implementation Plan: AI Image Tools

**Branch**: `029-ai-image-tools` | **Date**: 2026-07-28 | **Spec**: [spec.md](./spec.md)

**Input**: Feature specification from `specs/029-ai-image-tools/spec.md`

## Summary

Expose the existing provider-backed image-generation and Wiki image-upload capabilities through one governed media workflow. Add asynchronous, page-bound public REST resources for image generation, artifact polling, preview, discard, and promotion; transport the same resources through new MCP tools while preserving the existing `upload_image` tool; and add two built-in Wiki AI media tools that can generate then promote a private asset without mutating or publishing a page. Reuse the current AI action queue, generated-artifact provenance, normal content-asset storage, permission framework, and pg-boss worker.

## Technical Context

**Language/Version**: TypeScript 5.6; Node.js 20.9+ (Node 24 in Docker)

**Primary Dependencies**: Next.js 16 App Router, React 19.2, Drizzle ORM, Zod, pg-boss, PostgreSQL 16/pgvector, existing provider adapter, OpenAPI generator, MCP SDK package

**Storage**: Existing PostgreSQL `ai_actions`, encrypted `ai_action_inputs`, `ai_action_events`, `ai_generated_artifacts`, `content_assets`, and API audit entries; existing local/S3 content stores

**Testing**: Existing Vitest suites for web services/routes and `@next-wiki/mcp-server`; OpenAPI generation; web/MCP lint and type checks; focused browser verification for the admin tool category and editor flow

**Target Platform**: Next.js server deployment and external REST/MCP clients; no new browser entry point

**Project Type**: Monorepo web application with a standalone MCP server package

**Performance Goals**: Submit endpoints return an accepted action without waiting for model execution; public status/preview operations are bounded by normal database/content-store access; queued REST/MCP generations complete through the existing worker; a Wiki AI media invocation completes within its existing background-action tool budget

**Constraints**: API responses are non-cacheable; image source is limited to the selected text or current page/revision; never disclose image bytes in JSON, provider credentials, raw prompts, source selection text, or internal errors; no image-to-image/editing, remote URL ingestion, bulk generation, automatic page mutation, or automatic publication; generated asset remains private until the normal page publication model makes it visible

**Scale/Scope**: One new public image workflow, three MCP image-generation lifecycle tools plus the retained upload tool, two static built-in Wiki AI media tools, one narrow API-key scope, one new AI-tool category, and no new tables or worker deployment

## Constitution Check

| Principle | Plan compliance |
| --- | --- |
| I. Product scope and existing architecture | Pass. Reuse the provider assignment, AI action, generated artifact, asset, permission, REST, and MCP layers; no default external service or dependency is added. |
| II. AI provider and model governance | Pass. Generation remains capability-checked through the configured image-capable provider/model; no fallback model or provider is introduced. |
| III. Provenance and durable knowledge | Pass. Every generation retains the existing action and artifact provenance; promotion records the normal asset linkage. Image tools do not alter a page. A normal `save_draft`/review/publish flow remains the only path that places returned Markdown in a revision. |
| IV. Markdown as source of truth | Pass. Promoted assets use the existing Markdown asset reference and renderer path; no parallel content representation is created. |
| V. Authorization and tenant isolation | Pass. A new `ai.image` API-key scope is combined with Editor/Admin role, page edit scope, entitlement, owner binding, and fresh live-page/revision checks. The public facade does not relax internal user-only AI routes. |
| VI. UI reuse | Pass. Extend the existing Admin AI Tools category panel and its translations; no duplicate image-management surface is planned. |
| VII. Background work | Pass. REST/MCP submission uses the current pg-boss image worker. Wiki AI execution runs the same generation runner only inside the already-background AI-question worker, never in an HTTP request or a duplicate queued job. |
| VIII. Auditable lifecycle | Pass. Existing action/events/artifact/asset records and API audit metadata provide a traceable create, generate, discard, promote, expiry, and orphan-cleanup lifecycle. |
| IX. External API and OpenAPI | Pass. New v1 routes use the public API wrapper, explicit schemas/errors, no-store headers, generated OpenAPI, and the MCP package calls only those v1 routes. |
| X. Static tool registry | Pass. Both Wiki AI tools are explicit registry/executor/policy entries; no dynamic discovery or arbitrary server tool invocation is added. |
| XI. Routing | Pass. Only resource-oriented API routes are added. Existing Admin tools and chat/editor routes own their UI state. |
| XII. Public content caching | N/A. This feature creates private actions/artifacts/assets and does not change anonymous published content. If a user later inserts the returned Markdown, the existing page publish/revalidation path applies. |

**Background-job cache guard**: the shared image runner presently uses direct database/content-store access. Any implementation path that reaches a request-cached service from the worker must enter it through `runWithoutDataCache`.

## Project Structure

### Documentation (this feature)

```text
specs/029-ai-image-tools/
├── plan.md
├── research.md
├── data-model.md
├── quickstart.md
├── contracts/
│   ├── public-api.md
│   ├── mcp-tools.md
│   └── wiki-ai-tools.md
└── tasks.md                         # Created later by /speckit-tasks
```

### Source Code (repository root)

```text
apps/web/
├── app/api/v1/
│   ├── _shared/route.ts
│   ├── assets/route.ts
│   └── ai/
│       ├── images/route.ts
│       ├── images/[actionId]/route.ts
│       └── generated-artifacts/[artifactId]/
│           ├── route.ts
│           └── asset/route.ts
├── src/app/admin/ai/                 # Existing AI-tool management UI
├── src/components/admin/AiToolsPanel.tsx
├── src/server/api/openapi-schemas.ts
├── src/server/db/schema/
│   ├── enums.ts
│   └── ai.ts
├── src/server/jobs/
│   ├── ai-image-generation.ts
│   └── ai-question.ts
├── src/server/services/
│   ├── ai-image-generation.ts
│   ├── ai-artifacts.ts
│   ├── ai-actions.ts
│   ├── ai-tool-registry.ts
│   ├── ai-tool-executors.ts
│   ├── ai-tool-policy.ts
│   ├── ai-tool-runtime.ts
│   ├── public-ai-images.ts
│   └── public-errors.ts
└── tests/
    ├── server/services/
    └── app/api/v1/

packages/shared/
├── src/api-keys.ts
└── src/ai-tools.ts

packages/mcp-server/
├── src/api-client.ts
├── src/shapes.ts
├── src/tool-metadata.ts
├── src/server.ts
├── src/tools/
│   ├── upload-image.ts
│   ├── generate-image.ts
│   ├── get-image-generation.ts
│   └── promote-generated-image.ts
└── tests/
```

**Structure Decision**: extend the existing web server and MCP transport package. Domain behavior stays in existing image-generation/artifact services, with a narrowly scoped public facade so public API-key authorization cannot broaden the internal `/api/ai/*` user-only routes.

## Phase 0: Research

Resolve and record the following decisions in [research.md](./research.md):

1. The public action/artifact resource model and private preview behavior.
2. The new least-privilege API-key scope and its relationship to roles, page edit scope, and artifact ownership.
3. The shared runner boundary that lets a Wiki AI job generate an image inline without executing model work in a request or queueing the action twice.
4. The static MCP/Wiki-tool surface and backward compatibility of `upload_image`.
5. Lifecycle, audit, expiry, retention, and no-page-mutation behavior using current tables.

## Phase 1: Design and Contracts

1. Define REST request/response, authorization, error, and cache contracts in [contracts/public-api.md](./contracts/public-api.md), then mirror schemas in the OpenAPI scanner source and regenerate `apps/web/public/openapi.json`.
2. Define MCP transport contracts in [contracts/mcp-tools.md](./contracts/mcp-tools.md), including the retained upload tool and polling/promotion response shapes.
3. Define the Wiki AI media tool policy, executor behavior, review boundary, and evidence/provenance limits in [contracts/wiki-ai-tools.md](./contracts/wiki-ai-tools.md).
4. Document existing entity reuse and the two required enum additions in [data-model.md](./data-model.md). Generate the single Drizzle migration from schema changes; do not hand-author SQL or journal entries.
5. Capture local setup, authorization checks, lifecycle verification, and test commands in [quickstart.md](./quickstart.md).
6. Refresh the managed Spec Kit context block in `AGENTS.md` after the plan is complete.

## Implementation Sequence

1. Add shared API-key scope/type/UI labels and the `media` AI-tool category. Generate and verify the Drizzle migration.
2. Refactor the existing image job body into a shared, authorization-safe runner. Keep queue submission as the default; expose an explicit background-only inline mode for the AI-question worker.
3. Add the public-image facade, REST routes, error mapping, audit metadata, OpenAPI annotations/literal schemas, and route/service tests.
4. Extend the MCP API client, shapes, tool metadata, server registration, README, and transport tests.
5. Register `generate_image` and `promote_generated_image` in the Wiki AI tool registry, policy, executors, runtime tests, and existing Admin category UI.
6. Run migration/OpenAPI generation, focused tests, lint/type checks, and editor/Admin browser verification. Re-run `pnpm db:generate` and confirm it reports no schema changes.

## Post-Design Constitution Check

All gates remain satisfied. The sole schema impact is extending existing PostgreSQL enums for the narrow `ai.image` key scope and `media` tool category; it does not require a new table or a separate service. The only intentional synchronous generation is inside an existing pg-boss AI-question action, so it preserves the no-model-in-request rule. Promotion creates a normal private asset but leaves page revision, review, publication, embeddings, and anonymous caching untouched until the user invokes the existing draft/publish workflow.

## Complexity Tracking

No constitution violations or justified complexity exceptions.

## Implementation Validation

The implemented REST, MCP, and Wiki AI flows conform to the contracts: image
generation remains asynchronous for REST/MCP, inline generation is limited to
the existing pg-boss Wiki AI worker, and promotion returns Markdown without
changing a page revision or publication state. The migration was generated by
Drizzle and the final `pnpm db:generate` reported no changes. Focused Web/MCP
tests, OpenAPI generation, lint, type checks, and package builds passed.

The Docker Compose production image build completed and recreated the Web
container. The affected Playwright suites also passed (9/9) using the
repository's isolated E2E Next server and Docker Compose PostgreSQL service.
The browser environment has no configured image provider, so the separate
configured-provider success lifecycle in T018 remains pending; the service,
route, MCP, and Wiki AI runner tests cover that lifecycle without exposing
provider diagnostics or image bytes.
