# Implementation Plan: Page Tags and Metadata

**Branch**: `014-page-tags-metadata` | **Date**: 2026-07-11 | **Spec**: [spec.md](./spec.md)

## Summary

Introduce a reusable tag registry and typed page metadata (`title`, `date`,
`tags`, `summary`) stored on immutable page revisions. Markdown frontmatter is
an optional synchronization target selected per edit; raw Markdown remains
portable and is never generated unless the editor opts into frontmatter.
Single-page edits are synchronous revision writes. Tag rename/delete fan-out
uses pg-boss, so affected pages converge without blocking a request.

Reader views display structured metadata before the rendered Markdown body.
The rendering path strips valid YAML frontmatter before rendering while
preserving raw source. REST and MCP evolve existing page surfaces additively.

## Technical Context

**Language/Version**: TypeScript 5.x on Node.js 20.9+; Next.js 16 App Router and React 19

**Primary Dependencies**: Drizzle ORM, PostgreSQL 16, pg-boss, Zod, `yaml`, TanStack Query, Zustand, MCP SDK

**Storage**: PostgreSQL for tags, metadata snapshots, page revisions and tag-mutation operations; existing pluggable content store retains raw Markdown

**Testing**: Vitest unit/service/route tests, Playwright E2E, typecheck/lint, OpenAPI generation checks

**Target Platform**: Browser, REST/OpenAPI clients, stdio MCP clients, Docker Compose

**Project Type**: Monorepo web application with public REST API and companion MCP package

**Performance Goals**: Metadata/tag reads and a single metadata save stay within normal interactive budgets; list descriptions have no per-card request; fan-out operations are asynchronous and status-visible.

**Constraints**: No new default service; preserve raw Markdown and unrelated frontmatter; keep structured metadata usable without frontmatter; permission checks on every surface; every mutation creates a revision; retain `frontmatter`, `filter[tag]`, generic page PATCH, and MCP `filterTag` compatibility.

**Scale/Scope**: Wiki-wide tag registry, reader, homepage/page lists, editor properties, v1 API and MCP; fan-out acceptance covers at least 100 pages.

## Constitution Check

| Gate | Status | Design response |
| --- | --- | --- |
| P1 — Simple deployment | PASS | PostgreSQL and existing pg-boss only; no new dependency/service. |
| P2/P3 — AI-native portable memory | PASS | MCP uses the same page/revision service; no model calls. |
| P4 — Rendering pipeline | PASS | Frontmatter stripping is typed pipeline preprocessing, not page-local parsing. |
| P5 — Permissions | PASS | `view`/`edit` remain page-scoped; global tag lifecycle receives an elevated `manage_tags` action. |
| P6 — UI consistency | PASS | Shared primitives/tokens and localized labels only. |
| P7 — Async heavy work | PASS | Tag rename/delete is a pg-boss mutation operation. |
| P8 — Version everything | PASS | Revision metadata/tag snapshots record every change. |
| P9 — Open standards | PASS | YAML, REST/JSON/OpenAPI, and MCP are existing standards surfaces. |
| P10/P11 — Explicit/canonical | PASS | One metadata writer, registered job, tag resources, and canonical reader routes. |

**Post-design re-check**: PASS. The data model uses only PostgreSQL, mutation
fan-out is delegated to the existing worker, revision snapshots preserve
history, and the REST/MCP contract is additive. No new constitutional exception
or clarification is required.

## Project Structure

### Documentation

```text
specs/014-page-tags-metadata/
├── plan.md
├── research.md
├── data-model.md
├── quickstart.md
├── contracts/rest-api.md
└── tasks.md                 # generated later
```

### Source layout

```text
apps/web/
├── app/(public)/[...path]/page.tsx       # reader metadata
├── app/(public)/page.tsx                 # homepage card description
├── app/(public)/pages/page.tsx           # page-list card description
├── app/api/v1/pages/[id]/metadata/       # typed metadata resource
├── app/api/v1/tags/                      # tag resources
├── app/api/v1/tag-mutations/             # fan-out status
└── src/
    ├── components/pages/                 # reader/editor metadata UI
    ├── i18n/
    └── server/
        ├── db/schema/
        ├── jobs/
        ├── metadata/
        ├── pipeline/
        └── services/
packages/shared/src/pages.ts              # REST Zod contracts
packages/mcp-server/src/                  # client/shapes/tools
```

**Structure Decision**: Extend existing `apps/web` server/UI layers,
`packages/shared` contracts, and the REST-backed MCP package. No second content
or tag service is introduced.

## Complexity Tracking

No constitutional violations require justification.
