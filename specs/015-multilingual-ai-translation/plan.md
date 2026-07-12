# Implementation Plan: AI Page Translation

**Branch**: `015-multilingual-ai-translation` | **Date**: 2026-07-12 | **Spec**: [spec.md](./spec.md)

**Input**: Feature specification from `/specs/015-multilingual-ai-translation/spec.md`

## Summary

Add administrator-controlled AI translation of published wiki pages. The implementation keeps the unprefixed URL as the source page and serves each translation through `/{language}/{path}`. It reuses the existing page, revision, Markdown-rendering, and asset-reference pipeline for translated documents, while adding durable translation groups, provenance, and resumable one-language batch runs. A dedicated PostgreSQL-backed worker queue performs model calls and source-freshness checks; rendered HTML stored on each page revision is the persistent cache for both originals and translations.

## Technical Context

**Language/Version**: TypeScript 5.6; Node.js 20.9+; Next.js 16.2 / React 19.2

**Primary Dependencies**: Next.js App Router, Drizzle ORM, Zod, pg-boss, TanStack Query, unified/remark/rehype, existing provider-neutral AI adapters

**Storage**: PostgreSQL 16+ (page/revision HTML cache, translation records, and pg-boss); configured content-storage replica path remains responsible for raw Markdown replication

**Testing**: Vitest unit/integration tests and Playwright end-to-end tests

**Target Platform**: Docker Compose deployment and Node.js web/worker runtime

**Project Type**: pnpm/Turborepo web application with shared schemas and an optional MCP package

**Performance Goals**: At least 95% of unchanged public original/translation reads return cached rendered content in under one second; accepted batch creation/control returns a task id without waiting for model work

**Constraints**: Original URLs remain unprefixed; translated URLs begin with a configured lowercase ISO 639-1 code; only one active run may mutate a target language at a time; model calls are background-only; no extra stateful service; source content, prompts, credentials, and unredacted provider errors never appear in transient/public analytics

**Scale/Scope**: One background run handles one target language and all or a selected set of published source pages. It persists page-level outcomes, supports pause/cancel/resume/replacement, coalesces rapid source updates, and retains historical translated revisions and usage records.

## Constitution Check

### Pre-design gates

| Gate | Status | Plan evidence |
|---|---|---|
| P1 Simple deployment | PASS | Adds tables, routes, and pg-boss work in the existing PostgreSQL deployment; no queue, cache, or AI vendor service is added. |
| P2 AI-native, provider-neutral | PASS | Reuses the registered text-generation adapter and model catalog; a run freezes the selected model/provider but no provider-specific SDK or fallback is introduced. |
| P3 Portable AI memory | PASS | AI output becomes ordinary translated pages and immutable page revisions; source content remains authoritative and permission checks occur before generation, writes, and reads. |
| P4 Rendering pipeline | PASS | Generated Markdown passes through the established `source -> parse -> transform[] -> render` pipeline before a revision is written; generated HTML is never canonical input. |
| P5 Permissions | PASS | Translation management is administrator-only; reader delivery evaluates source and translation visibility through the established permission chokepoint, without leaking hidden source/translation existence. |
| P6 UI consistency | PASS | Admin pages use existing admin layouts, UI primitives, tokens, and i18n dictionaries; no feature-local styling system is introduced. |
| P7 Async-first | PASS | Runs, refreshes, pause/resume, and generation use a dedicated pg-boss queue and return `202`/task identifiers. |
| P8 Version everything | PASS | Each accepted output creates a normal immutable `page_revision`; provenance maps it to the exact source revision, run item, model, and prompt version. |
| P9 Open standards | PASS | Admin REST uses shared Zod schemas and generated OpenAPI; model invocation uses the existing provider-neutral adapter. |
| P10 Explicit registration | PASS | Queue, worker, provider prompt builder, routes, and services are explicitly registered at existing runtime entry points. |
| P11 Native navigation | PASS | `/{language}/{path}` is one canonical reader address per translation; source addresses remain unprefixed, and task/detail views have deep-linkable admin routes. |
| Multi-language mandate | PASS | Translations are keyed by a `translation_group_id` plus `(space_id, path, locale)`. Translation page access is evaluated independently and is never copied/inherited blindly from its source. |

### Post-design re-check

All gates remain **PASS**. The data model, contracts, and validation guide use only the existing database, rendering pipeline, revision model, provider adapter, permission service, and explicit job registry. No complexity exception is required.

## Project Structure

### Documentation (this feature)

```text
specs/015-multilingual-ai-translation/
├── plan.md
├── research.md
├── data-model.md
├── quickstart.md
└── contracts/
    ├── rest-api.md
    └── content-routing.md
```

### Source Code (repository root)

```text
packages/shared/src/
├── ai.ts                         # extend typed model/action metadata only where needed
├── pages.ts                      # locale-aware public page resource schemas
└── translations.ts               # translation REST schemas and views

apps/web/
├── app/
│   ├── (public)/[language]/[[...path]]/page.tsx
│   ├── (admin)/admin/translations/{page.tsx,[id]/page.tsx}
│   └── api/translations/...       # admin translation REST endpoints
├── src/
│   ├── components/admin/translations/
│   ├── i18n/locales/{en,zh}.ts
│   ├── lib/path.ts                # original and language-prefixed URL builders
│   └── server/
│       ├── ai/prompts/translation.ts
│       ├── db/schema/{enums.ts,index.ts}
│       ├── jobs/{runtime.ts,register.ts,translation.ts}
│       └── services/{pages.ts,revisions.ts,translations.ts,translation-writer.ts}
└── e2e/translation-*.spec.ts
```

**Structure Decision**: This is a web application feature. Shared schemas stay in `packages/shared`; browser/API adapters remain thin over server services; the translation worker and source-publish hook are server-only. The MCP package is deliberately unchanged because this feature's management operations are administrator-only and the current API-key permission model cannot safely grant them.

## Complexity Tracking

No constitution violations require justification.
