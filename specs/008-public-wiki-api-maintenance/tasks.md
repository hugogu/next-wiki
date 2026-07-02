# Tasks: Public Wiki API Maintenance & Intelligence

**Spec**: [spec.md](./spec.md) | **Plan**: [plan.md](./plan.md)

---

## Phase 1: Soft-delete

- [x] T001: Add `deletePage` to `public-content.ts` — sets `deleted_at`,
  enforces `can(ctx, 'delete', ...)` permission.
- [x] T002: Add `DELETE` handler in `pages/[id]/route.ts`.
- [x] T003: Update `listPagesInternal` to include deleted pages when
  `status=deleted` or `status=all` (gated by delete permission).
- [x] T004: Add `deletePage` to MCP api-client, tools, server registration.
- [x] T005: Write route test for delete (success, 404 missing).
- [x] T006: Write MCP tool test for `delete_page`.

## Phase 2: Backlinks

- [x] T010: Add `getBacklinks` to `public-content.ts` — scan published page
  content for Markdown links to target path/id.
- [x] T011: Add `GET` handler to `pages/[id]/backlinks/route.ts`.
- [x] T012: Add OpenAPI schema for `PublicBacklink` / `PublicBacklinksResponse`.
- [x] T013: Add `getBacklinks` to MCP api-client, tools, server.
- [x] T014: Write route test for backlinks (delegation).

## Phase 3: Revision Diff

- [x] T020: Install `diff` npm package and `@types/diff`.
- [x] T021: Add `getDiff` to `public-content.ts` — fetch both revisions,
  compute line diff with `diff.diffLines`, return unified string + counts.
- [x] T022: Add `GET` handler to
  `pages/[id]/revisions/[version]/diff/route.ts` with `?against=` query.
- [x] T023: Add OpenAPI schema for diff query/response.
- [x] T024: Add `getDiff` to MCP api-client, tools, server.
- [x] T025: Write route test for diff (delegation).

## Phase 4: Batch Create

- [x] T030: Add `PublicPageBatchCreateInput` / `Response` schemas to
  `packages/shared/src/pages.ts`.
- [x] T031: Add `batchCreatePages` to `public-content.ts` — wrap in
  `db.transaction()`, all-or-nothing.
- [x] T032: Add `POST` handler to `pages/batch/route.ts`.
- [x] T033: Add OpenAPI schema for batch input/response.
- [x] T034: Add `batchCreatePages` to MCP api-client, tools, server.
- [x] T035: Write route test for batch (delegation).

## Phase 5: Stats

- [x] T040: Add `getStats` to `public-content.ts` — aggregate COUNT queries,
  recent activity, directory breakdown, optional orphan detection.
- [x] T041: Add `GET` handler to `stats/route.ts`.
- [x] T042: Add OpenAPI schema for stats query/response.
- [x] T043: Add `getStats` to MCP api-client, tools, server.
- [x] T044: Write route test for stats (delegation).

## Phase 6: Duplicate Detection

- [x] T050: Add `findSimilar` to `public-content.ts` — Dice coefficient on path
  + Levenshtein on title, combined score, threshold filter.
- [x] T051: Add `POST` handler to `search/similar/route.ts`.
- [x] T052: Add OpenAPI schema for similar query/response.
- [x] T053: Add `findSimilar` to MCP api-client, tools, server.
- [x] T054: Write route test for similar (delegation).

## Phase 7: Integration

- [x] T060: Regenerate `openapi.json` with `pnpm openapi:generate`.
- [x] T061: Update `CLAUDE.md` MCP tool table with 7 new tools.
- [x] T062: Update `packages/mcp-server/README.md` with new tool descriptions.
- [x] T063: Run full `pnpm lint && pnpm typecheck`.
- [ ] T064: End-to-end integration test with live API key (deferred to CI).
