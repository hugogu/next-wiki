# MCP Tool Contracts: AI Curation API

**Phase 1 output** | **Date**: 2026-07-04

The MCP tool surface is a 1:1 mirror of the v1 surface, following the existing pattern (`packages/mcp-server/src/server.ts:28-119` registers one tool per v1 endpoint). Every new tool is a thin wrapper: it calls `WikiApiClient.<method>()` and applies a flattener from `packages/mcp-server/src/shapes.ts`.

This document specifies the **MCP contract surface** — tool name, input Zod shape (the schema is duplicated in the MCP server, not imported from `@next-wiki/shared` per the existing convention), the flattener's output shape, and any divergence from the v1 shape (flatteners intentionally hide cursors and verbose fields to keep the LLM context lean).

---

## Conventions

- Tool names use the existing verbs: `search_*`, `list_*`, `get_*`, `batch_*`. No new verb patterns.
- Input schemas are **raw Zod shapes** (a `Record<string, ZodType>`, not a `ZodObject`) per the existing pattern (`packages/mcp-server/src/tools/search-wiki.ts:5-21`).
- Every input field carries a `.describe()` call for LLM-friendliness.
- Response shapes are **flatteners** (`packages/mcp-server/src/shapes.ts:1-241`) — nested objects collapsed, opaque cursors converted to `hasMore: boolean` (and dropped for search results, kept for list results).
- All tools call the v1 endpoint over HTTP. They do not call internal services directly.

---

## Tool 1: `search_wiki` (extended, not new)

**Change**: input schema gains the four frontmatter filter parameters; output shape gains `frontmatter: object | null` per result.

**Input**:

```ts
{
  query: z.string().min(1).max(200).describe('Search term'),
  scope: z.enum(['path', 'title', 'content', 'all']).optional().describe('Search scope; defaults to all'),
  pathPrefix: z.string().optional().describe('Restrict matching to a directory subtree'),
  limit: z.number().int().min(1).max(100).default(20).describe('Max results to return'),
  filterTag: z.string().optional().describe('Frontmatter tag filter (exact match within array)'),
  filterStatus: z.string().optional().describe('Frontmatter status filter (exact match)'),
  filterOwner: z.string().optional().describe('Frontmatter owner filter (exact match)'),
  filterHasFrontmatter: z.boolean().optional().describe('Filter for pages with / without any frontmatter'),
}
```

**Output** (flattener `searchWikiResponse` — extended):

```ts
{
  results: [
    {
      id: string,        // page id
      path: string,
      title: string,
      matchType: 'path' | 'title' | 'content',
      excerpt: string | null,
      score: number,
      frontmatter: Record<string, unknown> | null,    // NEW
    }
  ],
  hasMore: boolean,    // always false for search (cursor intentionally dropped)
}
```

**Backward compat**: existing `search_wiki` callers (no new params) receive byte-compatible results modulo the new `frontmatter` field. The MCP server's input Zod is permissive about missing optional fields.

---

## Tool 2: `submit_semantic_search` (new)

**Input**:

```ts
{
  query: z.string().min(1).max(8000).describe('Natural-language query'),
  limit: z.number().int().min(1).max(50).default(10).describe('Max results'),
  pathPrefix: z.string().optional().describe('Restrict matching to a directory subtree'),
  filterTag: z.string().optional().describe('Frontmatter tag filter'),
  filterStatus: z.string().optional().describe('Frontmatter status filter'),
  filterOwner: z.string().optional().describe('Frontmatter owner filter'),
  filterHasFrontmatter: z.boolean().optional().describe('Filter by frontmatter presence'),
}
```

**Output** (flattener `submitSemanticSearchResponse` — new):

```ts
{
  id: string,                // action id (UUID)
  status: 'queued',          // always 'queued' on submit
  createdAt: string,         // ISO-8601
  expiresAt: string,         // ISO-8601
  pollUrl: string,           // the URL the agent should poll
}
```

**Authorization**: the MCP server passes through `NEXT_WIKI_API_KEY`; the key MUST have the `ai.read` scope (see [`permission-scope-map.md`](./permission-scope-map.md)). Otherwise the underlying v1 endpoint returns 403 and the tool surfaces a `WikiApiClientError` with `code: 'FORBIDDEN'`.

---

## Tool 3: `get_semantic_search_results` (new)

**Input**:

```ts
{
  id: z.string().uuid().describe('The semantic search action id returned by submit_semantic_search'),
}
```

**Output** (flattener `getSemanticSearchResultsResponse` — new):

```ts
{
  id: string,
  status: 'queued' | 'running' | 'succeeded' | 'failed' | 'expired',
  createdAt: string,
  startedAt: string | null,
  finishedAt: string | null,
  expiresAt: string,
  items: [
    {
      pageId: string,
      path: string,
      title: string,
      score: number,
      excerpt: string,
      citations: [
        { chunkId: string, revisionId: string, contentHash: string }
      ],
    }
  ],                                  // empty when status != 'succeeded'
  error: { code: string, message: string } | null,   // present when status = 'failed'
}
```

**Note**: this tool flattens `usage.inputTokens` and `usage.requestId` into a single optional `usage` field on the response, matching the pattern of `searchResultsResponse`. The LLM can decide whether to surface cost info to the user.

---

## Tool 4: `get_page_outbound_links` (new)

**Input**:

```ts
{
  pageId: z.string().uuid().describe('The page id'),
}
```

**Output** (flattener `getOutboundLinksResponse` — new):

```ts
{
  pageId: string,
  links: [
    {
      source: 'markdown' | 'wiki' | 'frontmatter',
      targetPath: string,
      targetPageId: string | null,
      targetStatus: 'published' | 'draft' | 'deleted' | null,
      linkText: string,
    }
  ],
  dangling: [
    { source: 'markdown' | 'wiki' | 'frontmatter', targetPath: string, linkText: string }
  ],
  external: [
    { source: 'markdown', href: string, linkText: string }
  ],
}
```

The LLM sees three buckets (resolvable, dangling, external) and can decide which to traverse.

---

## Tool 5: `get_neighborhood` (new)

**Input**:

```ts
{
  node: z.string().uuid().describe('The root page id'),
  depth: z.number().int().min(1).max(3).default(1).describe('Traversal depth bound'),
  direction: z.enum(['out', 'in', 'both']).default('out').describe('Which edges to follow'),
}
```

**Output** (flattener `getNeighborhoodResponse` — new):

```ts
{
  root: { pageId: string, path: string, title: string },
  tiers: [
    [
      {
        pageId: string,
        path: string,
        title: string,
        viaLinkSource: 'markdown' | 'wiki' | 'frontmatter' | 'backlink',
      }
    ]
  ],
}
```

The LLM can walk the tiers array (each tier is one hop) to reason about the knowledge graph.

---

## Tool 6: `batch_update_pages` (new)

**Input**:

```ts
{
  items: z.array(z.object({
    pageId: z.string().uuid(),
    title: z.string().min(1).max(200).optional(),
    path: z.string().optional(),
    frontmatter: z.record(z.unknown()).optional().describe('Frontmatter patch; null value removes a key'),
    baseRevisionId: z.string().uuid().describe('For stale detection; must match current latestVersionId'),
  })).min(1).max(50),
  dryRun: z.boolean().default(false).describe('If true, returns per-item preview without writing'),
}
```

**Output** (flattener `batchUpdatePagesResponse` — new):

```ts
{
  results: [
    {
      pageId: string,
      status: 'success' | 'failed',
      revisionId: string | null,   // populated on success
      preview: { title?: string, path?: string, frontmatter?: Record<string, unknown> } | null,  // populated on dry_run
      error: { code: string, message: string } | null,
    }
  ],
  successCount: number,
  failureCount: number,
  dryRun: boolean,
}
```

**Per-item semantics**: the LLM can iterate `results[]` and decide per result whether to retry (e.g., for `STALE_REVISION`) or surface to the user.

---

## Tool 7: `batch_soft_delete_pages` (new)

**Input**:

```ts
{
  pageIds: z.array(z.string().uuid()).min(1).max(50),
  dryRun: z.boolean().default(false),
}
```

**Output** (flattener `batchSoftDeletePagesResponse` — new):

```ts
{
  results: [
    {
      pageId: string,
      status: 'success' | 'failed',
      error: { code: string, message: string } | null,
    }
  ],
  successCount: number,
  failureCount: number,
  dryRun: boolean,
}
```

---

## Tool registration order (in `server.ts`)

The existing `server.ts:28-119` orders tools by frequency of expected use. The new tools are inserted in this order:

1. `submit_semantic_search` (line ~30, after `search_wiki`) — the most common AI workflow is "search, then if results aren't good, do semantic search."
2. `get_semantic_search_results` (line ~32) — paired with the above.
3. `get_page_outbound_links` (line ~92, after `get_backlinks`) — paired with the existing inbound-link tool.
4. `get_neighborhood` (line ~94) — paired with the above.
5. `batch_update_pages` (line ~99, after `batch_create_pages`) — paired with the existing batch primitive.
6. `batch_soft_delete_pages` (line ~101) — paired with the above.

The `search_wiki` tool is **extended in place** (not registered anew) — its input Zod gains the four filter params and its flattener gains the `frontmatter` field.

---

## MCP resources (unchanged)

The existing `wiki-page` and `wiki-pages` resources at `packages/mcp-server/src/server.ts:121-140` are not extended in this spec. They expose the same `PublicPageResource` shape; the new `frontmatter` field appears there automatically (via the Zod schema change in `packages/shared/src/pages.ts`).

---

## Error handling (unchanged)

The `WikiApiClient` (`packages/mcp-server/src/api-client.ts:283-296`) throws `WikiApiClientError(message, statusCode, code)` on non-2xx. The MCP tool wrapper surfaces the error message verbatim to the LLM. There is no MCP-specific error code set; the LLM sees the same `code` values as a direct v1 caller.

For `submit_semantic_search` specifically, the `403` (no `ai.read` scope) and `409 INDEX_NOT_READY` are the two errors an agent is most likely to see and should handle explicitly. The tool description should mention them:

> "Returns 403 if the API key lacks the `ai.read` scope, or 409 if no embedding index is currently active. The latter is normal during initial setup — the agent should retry after the index becomes ready."
