# Implementation Plan: Public Wiki API Maintenance & Intelligence

**Branch**: `007-public-wiki-api` | **Date**: 2026-07-02 | **Spec**: [spec.md](./spec.md)
**Input**: Feature specification from `/specs/008-public-wiki-api-maintenance/spec.md`

## Summary

Extend the v1 Public Wiki Content API with six new capabilities: page
soft-delete, backlinks, revision diff, batch page creation, wiki stats, and
duplicate detection. Each REST endpoint gets a matching MCP tool. All new
endpoints are thin contract adapters over the service layer, reusing the
existing permission model, audit pipeline, and Zod schemas.

## Technical Context

**Language/Version**: TypeScript 5.x on Node.js 20.9+ (Next.js 16 runtime floor)
**Primary Dependencies**: Next.js 16 App Router, Drizzle ORM, Zod,
next-openapi-gen, `@modelcontextprotocol/sdk`
**Storage**: Existing PostgreSQL 16 — no new tables or migrations required
**Diff library**: `diff` npm package (unified line diff, MIT, 0 deps at runtime)
**Testing**: Vitest route/service tests, MCP tool tests
**Target Platform**: Linux server (Docker Compose / Kubernetes), same image as
existing web container
**Project Type**: web-service (pnpm workspaces + Turborepo monorepo)
**Performance Goals**: Stats response under 500 ms on 10,000 pages (SC-004);
backlink scan sub-second at current scale (≤10k pages, few KB each)
**Constraints**: No new stateful services or DB extensions (P1); no new
database migrations; backlink extraction scan-based at query time
**Scale/Scope**: ≤10k pages current; batch limit 50 pages per request;
similarity check over all visible page titles+paths in memory

## Constitution Check

| Principle | Status | Compliance |
|---|---|---|
| P1 Simple Deployment | PASS | No new service or dependency beyond `diff` npm package (pure JS, zero native). |
| P4 Permissions First-Class | PASS | Every endpoint calls `can()` before returning data. Delete and batch require Editor/Admin. |
| P7 Version Everything | PASS | Soft-delete sets `deleted_at` (tombstone). All revisions preserved. Diff computes from immutable revision sources. |
| P8 Open Standards | PASS | REST + JSON + OpenAPI. MCP tools map 1:1. |
| P9 Explicit Over Implicit | PASS | New routes, schemas, and tools are explicitly registered. No dynamic discovery. |
| API Architecture mandate | PASS | New routes are contract adapters over services. No business logic in route handlers. |

## Project Structure

### Documentation (this feature)

```text
specs/008-public-wiki-api-maintenance/
├── plan.md              # This file
├── research.md          # Phase 0: decisions R1-R7
├── data-model.md        # Phase 1: no new tables, shared schemas
├── quickstart.md        # Phase 1: endpoint usage examples
├── contracts/
│   ├── rest-api.md      # Phase 1: REST endpoint contracts
│   └── mcp-tools.md     # Phase 1: MCP tool contracts
├── checklists/
│   └── requirements.md  # Spec quality validation
└── tasks.md             # Phase 2: task breakdown (separate command)
```

### Source Code (repository root)

```text
packages/shared/src/
└── pages.ts                    # extend with batch/stats/similar/backlink/diff schemas

packages/mcp-server/src/
├── api-client.ts               # add 6 new client methods
├── server.ts                   # register 6 new tools
├── shapes.ts                   # add 6 new response shapes
└── tools/
    ├── delete-page.ts          # maps to DELETE /v1/pages/{id}
    ├── get-backlinks.ts        # maps to GET /v1/pages/{id}/backlinks
    ├── get-diff.ts             # maps to GET /v1/pages/{id}/revisions/{v}/diff
    ├── batch-create-pages.ts   # maps to POST /v1/pages/batch
    ├── get-stats.ts            # maps to GET /v1/stats
    └── find-similar.ts         # maps to POST /v1/search/similar

apps/web/app/api/v1/
├── pages/
│   ├── batch/route.ts          # POST batch create
│   └── [id]/
│       ├── route.ts            # add DELETE handler
│       └── backlinks/route.ts  # GET backlinks
├── stats/route.ts              # GET wiki stats
└── search/
    └── similar/route.ts        # POST similar check

apps/web/src/server/
├── api/openapi-schemas.ts      # register new schemas for generator
└── services/
    ├── public-content.ts       # add delete/backlinks/diff/batch/stats/similar
    └── wiki-diff.ts            # thin diff computation wrapper
```

**Structure Decision**: This feature extends the existing monorepo layout
established by 007-public-wiki-api. No new packages or apps are introduced.
New code is added to existing files (`public-content.ts`, `openapi-schemas.ts`,
`pages.ts`) and new route/tool files follow the established naming convention.
The `diff` computation wrapper (`wiki-diff.ts`) is the only new file in the
server layer, kept as a thin isolated module for testability.

## Implementation Phases

### Phase 1: Soft-delete (FR-001..003)

**Service**: Add `deletePage(ctx, pageId)` to `public-content.ts`. Sets
`deleted_at = now()` on the page row. Reuses existing `can(ctx, 'delete', ...)`
permission check.

**Route**: Add `DELETE` handler in `pages/[id]/route.ts`.

**MCP**: `delete_page` tool returns `{ deleted: true, id, path }`.

**Impact on existing**: `listPagesInternal` and `getPageTree` already filter
`isNull(deletedAt)`. Need to update when `status=deleted` or `status=all` is
requested — currently those queries don't include deleted pages at all.

### Phase 2: Backlinks (FR-004..005)

**Service**: Add `getBacklinks(ctx, pageId)` to `public-content.ts`. Scans
published page `content_source` for Markdown links matching the target page's
path or id. Uses a regex-based extraction (`/\[([^\]]*)\]\(([^)]+)\)/` and
wiki-path patterns). Returns referencing pages with link text.

**Route**: `GET /v1/pages/{id}/backlinks`.

**MCP**: `get_backlinks` tool returns flat array of `{ pageId, path, title,
linkText }`.

**Scale note**: Scan-based is O(n) over all published pages' content. At current
scale (10k pages, each a few KB) this is sub-second. A `page_links` materialized
table is deferred to P2.

### Phase 3: Revision Diff (FR-006..007)

**Dependency**: Add `diff` npm package (`pnpm --filter @next-wiki/web add diff`
and `pnpm --filter @next-wiki/web add -D @types/diff`).

**Service**: Add `getDiff(ctx, pageId, toVersion, fromVersion)` to
`public-content.ts`. Fetches both revisions' Markdown source, computes unified
diff using `diff.createPatch` or `diff.diffLines`. Returns `{ diff: string,
additions: number, deletions: number }`.

**Route**: `GET /v1/pages/{id}/revisions/{version}/diff?against={fromVersion}`.

**MCP**: `get_diff` tool returns `{ diff, additions, deletions }`.

### Phase 4: Batch Create (FR-008..009)

**Schema**: `PublicPageBatchCreateInput` — array of up to 50 page definitions
(same shape as `PublicPageCreateInput` each).

**Service**: Add `batchCreatePages(ctx, input)` to `public-content.ts`. Wraps
all `pageService.create` calls in a single `db.transaction()`. If any call
throws (duplicate path, validation), the transaction rolls back.

**Route**: `POST /v1/pages/batch`.

**MCP**: `batch_create_pages` tool returns `{ created: [{ id, path, revisionId
}], count }`.

### Phase 5: Stats (FR-010..011)

**Service**: Add `getStats(ctx, options)` to `public-content.ts`. Runs aggregate
count queries (`COUNT(*) ... GROUP BY status`), recent-activity query
(`WHERE updated_at > now() - interval '7 days'`), and directory breakdown
(group by first path segment). Orphan detection optionally scans for pages with
zero inbound links (reuses backlink scan logic).

**Route**: `GET /v1/stats`.

**MCP**: `get_stats` tool returns flat metrics object.

### Phase 6: Duplicate Detection (FR-012..013)

**Service**: Add `findSimilar(ctx, input)` to `public-content.ts`. Fetches all
visible page paths+titles, computes similarity using
`diceCoefficient`/`levenshtein`-based scoring from the `diff` package or a
simple inline implementation. Returns pages with score ≥ threshold (default
0.5).

**Route**: `POST /v1/search/similar`.

**MCP**: `find_similar` tool returns `{ results: [{ pageId, path, title, score
}], threshold }`.

### Phase 7: MCP Server + OpenAPI + Tests

Wire all 6 MCP tools, update `openapi-schemas.ts`, regenerate `openapi.json`,
write route tests and MCP tool tests, run full lint/typecheck/test.

## Complexity Tracking

No constitution violations. The `diff` npm package is a pure-JS, MIT-licensed,
zero-runtime-dependency library — it does not violate P1 (Simple Deployment).
Backlink scan and orphan detection are O(n) at current scale; a materialized
link table is explicitly deferred and documented in research notes.
