# Tasks: Public Wiki API Maintenance & Intelligence

**Spec**: [spec.md](./spec.md) | **Plan**: [plan.md](./plan.md)

---

## Phase 1: Soft-delete

- [ ] T001: Add `deletePage` to `public-content.ts` — sets `deleted_at`,
  enforces `can(ctx, 'delete', ...)` permission.
- [ ] T002: Add `DELETE` handler to `pages/[id]/route.ts`.
- [ ] T003: Update `listPagesInternal` and `getPageTree` to include deleted
  pages when `status=deleted` or `status=all`.
- [ ] T004: Add `deletePage` + `PublicDeleteResponse` to MCP api-client,
  shapes, tools, server registration.
- [ ] T005: Write route test for delete (success, 403 Reader, 404 missing).
- [ ] T006: Write MCP tool test for `delete_page`.

## Phase 2: Backlinks

- [ ] T010: Add `getBacklinks` to `public-content.ts` — scan published page
  content for Markdown links to target path/id.
- [ ] T011: Add `GET` handler to `pages/[id]/backlinks/route.ts`.
- [ ] T012: Add OpenAPI schema for `PublicBacklink` / `PublicBacklinksResponse`.
- [ ] T013: Add `getBacklinks` to MCP api-client, shapes, tools, server.
- [ ] T014: Write route test for backlinks (found, empty, 404 unreadable).

## Phase 3: Revision Diff

- [ ] T020: `pnpm --filter @next-wiki/web add diff` and
  `pnpm --filter @next-wiki/web add -D @types/diff`.
- [ ] T021: Add `getDiff` to `public-content.ts` — fetch both revisions,
  compute line diff with `diff.diffLines`, return unified string + counts.
- [ ] T022: Add `GET` handler to
  `pages/[id]/revisions/[version]/diff/route.ts` with `?against=` query.
- [ ] T023: Add OpenAPI schema for diff query/response.
- [ ] T024: Add `getDiff` to MCP api-client, shapes, tools, server.
- [ ] T025: Write route test for diff (changes, identical, 404, 422 bad params).

## Phase 4: Batch Create

- [ ] T030: Add `PublicPageBatchCreateInput` / `Response` schemas to
  `packages/shared/src/pages.ts`.
- [ ] T031: Add `batchCreatePages` to `public-content.ts` — wrap in
  `db.transaction()`, all-or-nothing.
- [ ] T032: Add `POST` handler to `pages/batch/route.ts`.
- [ ] T033: Add OpenAPI schema for batch input/response.
- [ ] T034: Add `batchCreatePages` to MCP api-client, shapes, tools, server.
- [ ] T035: Write route test for batch (success, conflict rollback, max size).

## Phase 5: Stats

- [ ] T040: Add `getStats` to `public-content.ts` — aggregate COUNT queries,
  recent activity, directory breakdown, optional orphan detection.
- [ ] T041: Add `GET` handler to `stats/route.ts`.
- [ ] T042: Add OpenAPI schema for stats query/response.
- [ ] T043: Add `getStats` to MCP api-client, shapes, tools, server.
- [ ] T044: Write route test for stats (counts, directory breakdown, Reader
  draft exclusion).

## Phase 6: Duplicate Detection

- [ ] T050: Add `findSimilar` to `public-content.ts` — Dice coefficient on path
  + Levenshtein on title, combined score, threshold filter.
- [ ] T051: Add `POST` handler to `search/similar/route.ts`.
- [ ] T052: Add OpenAPI schema for similar query/response.
- [ ] T053: Add `findSimilar` to MCP api-client, shapes, tools, server.
- [ ] T054: Write route test for similar (match, no match, threshold behavior).

## Phase 7: Integration

- [ ] T060: Regenerate `openapi.json` with `pnpm openapi:generate`.
- [ ] T061: Update `CLAUDE.md` MCP tool table with 6 new tools.
- [ ] T062: Update `packages/mcp-server/README.md` with new tool descriptions.
- [ ] T063: Run full `pnpm lint && pnpm typecheck && pnpm test`.
- [ ] T064: Commit spec docs + implementation.
