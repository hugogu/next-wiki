# Data Model: Public Wiki API Maintenance

## No New Tables

This feature adds no new database tables or migrations. All new endpoints
operate on the existing schema:

- **pages**: uses existing `deleted_at` column for soft-delete; existing
  `path`, `title`, `status` (derived) for stats/similar.
- **page_revisions**: uses existing `content_source` for diff computation.
- No new indexes required at current scale.

## New Shared Schemas (packages/shared/src/pages.ts)

```typescript
// Batch create
publicPageBatchCreateInputSchema: {
  pages: PublicPageCreateInput[]  // 1-50 items
}
publicPageBatchCreateResponseSchema: {
  created: { id, path, title, revisionId }[]
  count: number
}

// Backlinks
publicBacklinkSchema: {
  pageId: string (uuid)
  path: string
  title: string
  linkText: string
}
publicBacklinksResponseSchema: {
  items: PublicBacklink[]
}

// Diff
publicRevisionDiffQuerySchema: {
  against: number (int, min 1)  // from version
}
publicRevisionDiffResponseSchema: {
  fromVersion: number
  toVersion: number
  diff: string              // unified diff
  additions: number         // added lines
  deletions: number         // removed lines
}

// Stats
publicStatsQuerySchema: {
  include?: 'orphans'       // optional orphan detection
}
publicStatsResponseSchema: {
  totalPages: number
  publishedPages: number
  draftPages: number
  deletedPages: number
  recentActivity: {
    createdInLast7Days: number
    updatedInLast7Days: number
  }
  directories: { segment: string, pageCount: number }[]
  orphans?: { id: string, path: string, title: string }[]
}

// Similar
publicSimilarQuerySchema: {
  title?: string
  path?: string
  threshold?: number  // default 0.5, range [0, 1]
}
publicSimilarResultSchema: {
  pageId: string
  path: string
  title: string
  score: number       // [0, 1]
}
publicSimilarResponseSchema: {
  results: PublicSimilarResult[]
  threshold: number
}
```

## MCP Tool Mapping

| MCP Tool | REST Endpoint | Response Shape (flattened) |
|---|---|---|
| `delete_page` | `DELETE /v1/pages/{id}` | `{ deleted, id, path }` |
| `get_backlinks` | `GET /v1/pages/{id}/backlinks` | `{ backlinks: [{ pageId, path, title, linkText }] }` |
| `get_diff` | `GET /v1/pages/{id}/revisions/{v}/diff?against={from}` | `{ fromVersion, toVersion, diff, additions, deletions }` |
| `batch_create_pages` | `POST /v1/pages/batch` | `{ created: [{ id, path, revisionId }], count }` |
| `get_stats` | `GET /v1/stats` | `{ totalPages, publishedPages, draftPages, recentActivity, directories }` |
| `find_similar` | `POST /v1/search/similar` | `{ results: [{ pageId, path, title, score }], threshold }` |
