# Quickstart: AI Curation API

**Phase 1 output** | **Date**: 2026-07-04
**Companion to**: [`plan.md`](../plan.md), [`v1-routes.md`](../contracts/v1-routes.md), [`mcp-tools.md`](../contracts/mcp-tools.md), [`permission-scope-map.md`](../contracts/permission-scope-map.md)

This document is a hands-on implementation smoke test. Each step is a runnable command and an expected outcome. An implementer should walk through these in order; each step is small enough to verify before moving to the next.

The full integration test suite is described in [`permission-scope-map.md` §6](./contracts/permission-scope-map.md); this document is the manual / "did I break the build?" sanity check that complements it.

---

## 0. Prerequisites

- A clean checkout of the `010-ai-curation-api` branch.
- Docker Compose running: `docker compose up -d --build` (per `AGENTS.md`).
- `pnpm install` and `pnpm db:migrate` already run.
- `NEXT_WIKI_API_KEY` for an admin API key with `view`, `create`, `edit`, `delete` scopes; export it as `export ADMIN_KEY=…`.
- `pnpm --filter @next-wiki/web test` and `pnpm --filter @next-wiki/web lint` and `pnpm --filter @next-wiki/web typecheck` all pass before any change (baseline).

## 1. Apply the permission scope change (FR-006)

This is the smallest possible first change. It touches six files plus one DB migration; nothing else moves.

### 1.1 Code changes

```bash
# 1. Add the scope to the Zod layer
$EDITOR packages/shared/src/api-keys.ts   # add 'ai.read' to apiKeyScopeSchema enum

# 2. Add the scope to the DB pgEnum
$EDITOR apps/web/src/server/db/schema/enums.ts   # add 'ai.read' to apiKeyScopeEnum

# 3. Add the scope to the scopeToActions table
$EDITOR apps/web/src/server/permissions/index.ts   # add 'ai.read': ['use_ai_search', 'use_ai_qa']

# 4. Lift the api-key deny for use_ai_search/use_ai_qa
# (same file, different section)
$EDITOR apps/web/src/server/permissions/index.ts   # remove the two actions from the deny list

# 5. Add the scope to the admin UI
$EDITOR apps/web/src/components/user-center/ApiKeyCreateDialog.tsx   # add 'ai.read' to SCOPE_ORDER

# 6. Add i18n strings
$EDITOR apps/web/src/i18n/locales/en.ts
$EDITOR apps/web/src/i18n/locales/zh.ts
```

### 1.2 Generate the migration

```bash
pnpm db:generate
git status  # confirm a single new file under apps/web/src/server/db/migrations/ + meta snapshot
```

### 1.3 Verify

```bash
pnpm --filter @next-wiki/web typecheck
pnpm --filter @next-wiki/web test -- ai-permissions
# Expected: existing tests pass; new tests (added later) for 'ai.read' should be absent here
```

```bash
# Manual API key creation
curl -X POST http://localhost:3000/api/api-keys \
  -H "Authorization: Bearer $ADMIN_KEY" \
  -H "Content-Type: application/json" \
  -d '{"name": "AI reader", "scopes": ["view", "ai.read"]}'
# Expected: 201 with a new key; record the returned key as $AI_KEY
```

```bash
# Verify the new key can use AI (will fail with INDEX_NOT_READY until step 6 below)
curl -X POST http://localhost:3000/api/v1/search/semantic \
  -H "Authorization: Bearer $AI_KEY" \
  -H "Content-Type: application/json" \
  -d '{"q": "anything"}'
# Expected: 409 INDEX_NOT_READY (because no index is active yet)
# Negative checks: the same call with a `view`-only key returns 403;
# a key with `ai.read` but no `view` also returns 403 before index-state disclosure.
```

## 2. Close the `retrieve()` permission gap (FR-009)

### 2.1 Code change

```bash
$EDITOR apps/web/src/server/services/ai-retrieval.ts
# - Add `ctx: PermCtx` to retrieve() signature (line 34)
# - Insert per-page filter step after exactCosineSearch() (after line 39)
# - Use the same `can(ctx, 'read', { kind: 'page_list' }, { anonymousRead })` pattern as full-context.ts:55-58

$EDITOR apps/web/src/server/jobs/ai-question.ts
# - Pass the existing ctx (line 38) to retrieve() (line 67)
```

### 2.2 Verify

```bash
pnpm --filter @next-wiki/web test -- ai-retrieval
# Expected: existing tests pass; a new test (added by the implementer) that:
#   - Seeds an indexed page P the test actor cannot read
#   - Submits a semantic search with a query that would match P
#   - Asserts P does not appear in the results
#   ... must pass

pnpm --filter @next-wiki/web test -- ai-question
# Expected: existing tests pass; the regression test for the same scenario via the Q&A path
```

## 3. Add frontmatter exposure (FR-011..FR-014)

### 3.1 Code change

```bash
# 1. Extract the parser
$EDITOR apps/web/src/server/transfers/manifest.ts   # or create a new frontmatter.ts module
# - Export a new parsePageFrontmatter(markdown) function
# - Tolerates missing/malformed YAML (returns null)
# - Does not require the 005 archive sentinel

# 2. Inject into the public-content facade
$EDITOR apps/web/src/server/services/public-content.ts
# - visiblePageResource: add frontmatter field to the returned shape (after line 215)
# - visibleRevisionResource: same (after line 264)

# 3. Add frontmatter field to the Zod schemas
$EDITOR packages/shared/src/pages.ts
# - Add `frontmatter: z.record(z.unknown()).nullable()` to publicPageResourceSchema (line 81-101)
# - Same for publicRevisionResourceSchema (line 61-64)

# 4. Add the frontmatter filter Zod
$EDITOR packages/shared/src/pages.ts
# - Add filter[tag], filter[status], filter[owner], filter[has_frontmatter] to publicPageListQuerySchema
#   (line 103-113) and publicPageSearchQuerySchema (line 175-198)
# - Use a small helper for the repeated pattern; or inline the Zod shape

# 5. Apply the filter in the service
$EDITOR apps/web/src/server/services/public-content.ts
# - listPagesInternal: parse the new filters; AND with existing predicates
# - searchPages: same, after the existing substring match

# 6. OpenAPI doc
$EDITOR apps/web/src/server/api/openapi-schemas.ts
# - Mirror the new frontmatter field and filter params with .describe() annotations
```

### 3.2 Verify

```bash
pnpm --filter @next-wiki/web typecheck

# Manual: create a page with frontmatter
PAGE_ID=$(curl -X POST http://localhost:3000/api/v1/pages \
  -H "Authorization: Bearer $ADMIN_KEY" \
  -H "Content-Type: application/json" \
  -d '{"path": "test/frontmatter", "title": "Test", "contentSource": "---\ntags: [a, b]\nstatus: draft\n---\n# body"}' \
  | jq -r .id)

# Read it back and check the frontmatter field
curl -s "http://localhost:3000/api/v1/pages/$PAGE_ID" \
  -H "Authorization: Bearer $ADMIN_KEY" | jq .frontmatter
# Expected: {"tags":["a","b"],"status":"draft"}

# Filter by tag
curl -s "http://localhost:3000/api/v1/pages?filter[tag]=a" \
  -H "Authorization: Bearer $ADMIN_KEY" | jq '.items[].path'
# Expected: ["test/frontmatter"]
```

## 4. Add outbound links and graph traversal (FR-015..FR-019)

### 4.1 Code change

```bash
# 1. Add the link extractor
$EDITOR apps/web/src/server/transfers/markdown-links.ts
# - Add findMarkdownLinks(markdown) using the unified AST walk (mirror findMarkdownImages at line 18)
# - Add a wikilink regex pass for [[wikilink]] and [[wikilink|alias]]

# 2. Add the facade function
$EDITOR apps/web/src/server/services/public-content.ts
# - Add getOutboundLinks(ctx, pageId)
# - Add getNeighborhood(ctx, pageId, depth, direction)
# - Both reuse visiblePageResource for the read filter
# - Both apply per-target read permission (FR-019)

# 3. Add the route handlers
$EDITOR apps/web/app/api/v1/pages/[id]/links/route.ts   # new
$EDITOR apps/web/app/api/v1/graph/neighbors/route.ts    # new

# 4. Zod schemas
$EDITOR packages/shared/src/pages.ts
# - publicOutboundLinksResponseSchema
# - publicNeighborhoodResponseSchema
$EDITOR apps/web/src/server/api/openapi-schemas.ts
# - Mirror with .describe()
```

### 4.2 Verify

```bash
pnpm --filter @next-wiki/web test -- public-content

# Manual: create a page with all three link types
SOURCE_ID=$(curl -s -X POST http://localhost:3000/api/v1/pages \
  -H "Authorization: Bearer $ADMIN_KEY" \
  -H "Content-Type: application/json" \
  -d '{"path": "test/links-source", "title": "Source",
       "contentSource": "---\nrelated_pages: [\"test/links-target\"]\n---\n# body\n\n[[test/links-target]]\n[ext](https://example.com)\n[local](test/links-target)"}' \
  | jq -r .id)

# Get outbound links
curl -s "http://localhost:3000/api/v1/pages/$SOURCE_ID/links" \
  -H "Authorization: Bearer $ADMIN_KEY" | jq
# Expected: 3 entries in links[] (one frontmatter, one wiki, one markdown)
#           0 in dangling[]; 1 in external[]

# Get neighborhood at depth 2
curl -s "http://localhost:3000/api/v1/graph/neighbors?node=$SOURCE_ID&depth=2" \
  -H "Authorization: Bearer $ADMIN_KEY" | jq
# Expected: 2 tiers; tier[0] is source; tier[1] is target

# Negative: depth=4
curl -s "http://localhost:3000/api/v1/graph/neighbors?node=$SOURCE_ID&depth=4" \
  -H "Authorization: Bearer $ADMIN_KEY" -o /dev/null -w "%{http_code}"
# Expected: 422
```

## 5. Add batch update and delete (FR-020..FR-025)

### 5.1 Code change

```bash
# 1. Add the facade functions
$EDITOR apps/web/src/server/services/public-content.ts
# - batchUpdatePages(ctx, input) — per-item, per-item partial success
# - batchSoftDeletePages(ctx, input) — same
# - Both branch on the parsed REST `dry_run` query flag and return preview without writing

# 2. Add the route handlers
$EDITOR apps/web/app/api/v1/pages/batch/update/route.ts   # new
$EDITOR apps/web/app/api/v1/pages/batch/delete/route.ts   # new

# 3. Zod schemas
$EDITOR packages/shared/src/pages.ts
# - publicPageBatchUpdateInputSchema
# - publicPageBatchUpdateResultSchema
# - publicPageBatchDeleteInputSchema
# - publicPageBatchDeleteResultSchema
# - publicBatchItemResultSchema
# - publicBatchPreviewSchema (for dry_run)
$EDITOR apps/web/src/server/api/openapi-schemas.ts
# - Mirror all of the above
```

### 5.2 Verify

```bash
pnpm --filter @next-wiki/web test -- public-content

# Manual: create 3 pages, then run a batch update with one path collision
P1_JSON=$(curl -s -X POST http://localhost:3000/api/v1/pages \
  -H "Authorization: Bearer $ADMIN_KEY" -H "Content-Type: application/json" \
  -d '{"path": "test/batch-1", "title": "Batch 1", "contentSource": "# B1"}')
P2_JSON=$(curl -s -X POST http://localhost:3000/api/v1/pages \
  -H "Authorization: Bearer $ADMIN_KEY" -H "Content-Type: application/json" \
  -d '{"path": "test/batch-2", "title": "Batch 2", "contentSource": "# B2"}')
P3_JSON=$(curl -s -X POST http://localhost:3000/api/v1/pages \
  -H "Authorization: Bearer $ADMIN_KEY" -H "Content-Type: application/json" \
  -d '{"path": "test/batch-3", "title": "Batch 3", "contentSource": "# B3"}')
P1=$(echo "$P1_JSON" | jq -r .id); R1=$(echo "$P1_JSON" | jq -r .latestVersionId)
P2=$(echo "$P2_JSON" | jq -r .id); R2=$(echo "$P2_JSON" | jq -r .latestVersionId)
P3=$(echo "$P3_JSON" | jq -r .id); R3=$(echo "$P3_JSON" | jq -r .latestVersionId)

curl -X POST http://localhost:3000/api/v1/pages/batch/update \
  -H "Authorization: Bearer $ADMIN_KEY" -H "Content-Type: application/json" \
  -d "{\"items\": [
        {\"pageId\": \"$P1\", \"title\": \"Updated 1\", \"baseRevisionId\": \"$R1\"},
        {\"pageId\": \"$P2\", \"title\": \"Updated 2\", \"path\": \"test/batch-1\", \"baseRevisionId\": \"$R2\"},
        {\"pageId\": \"$P3\", \"title\": \"Updated 3\", \"baseRevisionId\": \"$R3\"}
      ]}" | jq
# Expected: 3 results; item 2 is failed with PAGE_PATH_CONFLICT; items 1 and 3 succeeded

# Dry-run
curl -X POST "http://localhost:3000/api/v1/pages/batch/update?dry_run=true" \
  -H "Authorization: Bearer $ADMIN_KEY" -H "Content-Type: application/json" \
  -d "{\"items\": [{\"pageId\": \"$P1\", \"title\": \"Dry Run\", \"baseRevisionId\": \"$R1\"}]}" | jq
# Expected: dryRun: true; no revisionId; preview.title = "Dry Run"
# Verify: re-read P1 and confirm title is unchanged

# Reader key rejected at the batch boundary
READER_KEY=...
curl -X POST http://localhost:3000/api/v1/pages/batch/update \
  -H "Authorization: Bearer $READER_KEY" -H "Content-Type: application/json" \
  -d "{\"items\": [{\"pageId\": \"$P1\", \"title\": \"x\", \"baseRevisionId\": \"$R1\"}]}" -o /dev/null -w "%{http_code}"
# Expected: 403
```

## 6. Add semantic search submit + poll (FR-004..FR-009)

This step depends on an active embedding index, which requires the AI admin to have configured a provider and run an index rebuild. The unit tests for this step should use the existing `apps/web/src/server/services/ai-retrieval.test.ts` patterns and not require a live provider.

### 6.1 Code change

```bash
# 1. New facade
$EDITOR apps/web/src/server/services/public-ai.ts   # new file, ~150 lines
# - submitSemanticSearch(ctx, input): builds an ai_actions row, enqueues the job
#   Mirrors the existing createSemanticSearch at ai-retrieval.ts:13 but accepts api_key actors
# - getSemanticSearchResults(ctx, actionId): reads ai_actions, joins ai_action_events['search_results'],
#   enriches with citations[] per FR-005
# Both return AiActionAccepted / AiActionView enriched for the public API

# 2. Route handlers
$EDITOR apps/web/app/api/v1/search/semantic/route.ts          # new — POST submit
$EDITOR apps/web/app/api/v1/search/semantic/[id]/route.ts     # new — GET poll

# 3. Zod schemas
$EDITOR packages/shared/src/ai.ts
# - publicSemanticSearchSubmitInputSchema (q, limit, pathPrefix, scope, filters)
# - publicSemanticSearchActionSchema (the action resource shape with citations)
# - publicSemanticSearchCitationSchema (chunkId, revisionId, contentHash)

# 4. Add chunkId to aiCitationSchema (the underlying type)
$EDITOR packages/shared/src/ai.ts
# - aiCitationSchema gains chunkId (so retrieve() can pass it through)

# 5. OpenAPI doc
$EDITOR apps/web/src/server/api/openapi-schemas.ts
# - Mirror all new schemas with .describe()
```

### 6.2 Verify

```bash
pnpm --filter @next-wiki/web test -- public-ai ai-retrieval

# Manual (requires an active embedding index — configure via /admin/ai first)
AI_KEY=...   # view + ai.read

# Submit
ACTION_ID=$(curl -s -X POST http://localhost:3000/api/v1/search/semantic \
  -H "Authorization: Bearer $AI_KEY" -H "Content-Type: application/json" \
  -d '{"q": "how do I authenticate"}' | jq -r .id)

# Poll
curl -s "http://localhost:3000/api/v1/search/semantic/$ACTION_ID" \
  -H "Authorization: Bearer $AI_KEY" | jq
# Expected: status='succeeded' (after a few seconds); items[] with citations[]

# Negative: a view-only key is rejected
VIEW_KEY=...
curl -s -X POST http://localhost:3000/api/v1/search/semantic \
  -H "Authorization: Bearer $VIEW_KEY" -H "Content-Type: application/json" \
  -d '{"q": "anything"}' -o /dev/null -w "%{http_code}"
# Expected: 403

# Negative: an ai.read-only key is also rejected because it lacks page-read scope
AI_ONLY_KEY=...
curl -s -X POST http://localhost:3000/api/v1/search/semantic \
  -H "Authorization: Bearer $AI_ONLY_KEY" -H "Content-Type: application/json" \
  -d '{"q": "anything"}' -o /dev/null -w "%{http_code}"
# Expected: 403

# Polling a non-existent action returns 404 (existence non-disclosure)
curl -s "http://localhost:3000/api/v1/search/semantic/00000000-0000-0000-0000-000000000000" \
  -H "Authorization: Bearer $AI_KEY" -o /dev/null -w "%{http_code}"
# Expected: 404
```

## 7. Add the MCP tool surface (FR-027)

### 7.1 Code change

```bash
# 1. Add WikiApiClient methods
$EDITOR packages/mcp-server/src/api-client.ts
# - submitSemanticSearch, getSemanticSearchResults
# - getOutboundLinks, getNeighborhood
# - batchUpdatePages, batchSoftDeletePages
# (plus their input/output Zod schemas, duplicated per existing convention)

# 2. Add flattener functions
$EDITOR packages/mcp-server/src/shapes.ts
# - submitSemanticSearchResponse, getSemanticSearchResultsResponse
# - getOutboundLinksResponse, getNeighborhoodResponse
# - batchUpdatePagesResponse, batchSoftDeletePagesResponse
# - extend searchWikiResponse with frontmatter field

# 3. New tool files
$EDITOR packages/mcp-server/src/tools/submit-semantic-search.ts
$EDITOR packages/mcp-server/src/tools/get-semantic-search-results.ts
$EDITOR packages/mcp-server/src/tools/get-page-outbound-links.ts
$EDITOR packages/mcp-server/src/tools/get-neighborhood.ts
$EDITOR packages/mcp-server/src/tools/batch-update-pages.ts
$EDITOR packages/mcp-server/src/tools/batch-soft-delete-pages.ts

# 4. Register
$EDITOR packages/mcp-server/src/server.ts
# - import + server.tool() for each of the 6 new tools
# - extend search_wiki tool definition in place (input + flattener)
```

### 7.2 Verify

```bash
pnpm --filter @next-wiki/mcp-server build
pnpm --filter @next-wiki/mcp-server test

# Manual: connect the MCP server to a Claude Desktop / Cursor / OpenCode client
# Verify that the 6 new tools are listed in the tool discovery
# Submit a semantic search via the tool; confirm the response shape
```

## 8. OpenAPI regeneration and final checks

```bash
# 1. Regenerate
pnpm --filter @next-wiki/web openapi:generate

# 2. Verify the doc UI shows the new endpoints
open http://localhost:3000/api-docs
# Expected: 6 new operations (search/semantic POST + GET, pages/{id}/links, graph/neighbors, batch/update, batch/delete)
# Expected: search/pages shows the new filter parameters

# 3. Public-only filter
curl -s http://localhost:3000/api/public-openapi.json | jq '.paths | keys'
# Expected: only /v1/* paths

# 4. Lint + typecheck + test
pnpm --filter @next-wiki/web lint
pnpm --filter @next-wiki/web typecheck
pnpm --filter @next-wiki/web test
pnpm --filter @next-wiki/mcp-server test
pnpm --filter @next-wiki/web test:e2e -- ai-curation
# All must pass with 0 failures
```

## 9. Acceptance against the spec

Walk through the spec's success criteria one by one:

| SC | How to verify |
|---|---|
| SC-001 "find pages about X and list their tags in ≤ 3 API calls" | Submit keyword or semantic search; if the search response does not already include frontmatter, call filtered list once and read `items[].frontmatter.tags` |
| SC-002 "batch update 50 pages + verify in ≤ 5s" | `time` the batch + verify round-trip from §5.2 above |
| SC-003 "2-hop neighborhood ≤ 1s on 10k pages" | Seed 10k pages; time the call from §4.2 above |
| SC-004 "100% endpoints permission-gated" | Run the matrix from [`permission-scope-map.md` §6](./contracts/permission-scope-map.md) |
| SC-005 "0% regression" | Run the existing 007 + 008 acceptance suites; all must still pass |
| SC-006 "100% batch write support `dry_run=true`" | `dryRun: true` returned in §5.2 above |
| SC-007 "no synchronous model calls" | grep the new v1 routes for `.embed(` and `.streamText(`; should be empty |
| SC-008 "keyword and semantic are distinct OpenAPI operations" | OpenAPI doc shows two separate `operationId` values; no `mode` query parameter on either |

If every line above passes, the spec is implemented. Hand it to the reviewer for sign-off.
