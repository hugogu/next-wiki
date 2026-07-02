# Quickstart: Public Wiki API Maintenance & Intelligence

This guide shows how to use the six new v1 Public Wiki Content API endpoints.
All examples assume an API key in the `Authorization: Bearer <key>` header and
a base URL of `http://localhost:3000/api/v1`.

## Prerequisites

- A working next-wiki instance with the 008 feature deployed.
- An API key with the appropriate scope (Reader for read-only operations,
  Editor/Admin for delete and batch create).

## 1. Delete a page

Soft-delete a page. The page becomes invisible to default list/search/tree
queries but its revision history is preserved.

```bash
curl -X DELETE http://localhost:3000/api/v1/pages/550e8400-e29b-41d4-a716-446655440000 \
  -H "Authorization: Bearer nwk_..."
```

Expected: `204 No Content`.

To verify the page is soft-deleted:

```bash
curl "http://localhost:3000/api/v1/pages/550e8400-e29b-41d4-a716-446655440000" \
  -H "Authorization: Bearer nwk_..."
```

Expected: `404 Not Found` (default filters exclude deleted pages).

To see the deleted page, use `status=all`:

```bash
curl "http://localhost:3000/api/v1/pages?status=all" \
  -H "Authorization: Bearer nwk_..."
```

## 2. Check backlinks

Find which pages link to a target page before deleting or renaming it.

```bash
curl "http://localhost:3000/api/v1/pages/550e8400-e29b-41d4-a716-446655440000/backlinks" \
  -H "Authorization: Bearer nwk_..."
```

Expected response:

```json
{
  "items": [
    {
      "pageId": "6ba7b810-9dad-11d1-80b4-00c04fd430c8",
      "path": "docs/overview",
      "title": "Overview",
      "linkText": "see intro"
    }
  ]
}
```

## 3. Diff two revisions

Review what changed between two versions of a page.

```bash
curl "http://localhost:3000/api/v1/pages/550e8400-e29b-41d4-a716-446655440000/revisions/3/diff?against=1" \
  -H "Authorization: Bearer nwk_..."
```

Expected response:

```json
{
  "fromVersion": 1,
  "toVersion": 3,
  "diff": "--- version 1\n+++ version 3\n@@ -1,3 +1,4 @@\n-old line\n+new line\n",
  "additions": 5,
  "deletions": 2
}
```

## 4. Batch create pages

Create up to 50 pages atomically in a single request.

```bash
curl -X POST http://localhost:3000/api/v1/pages/batch \
  -H "Authorization: Bearer nwk_..." \
  -H "Content-Type: application/json" \
  -d '{
    "pages": [
      { "path": "docs/intro", "title": "Intro", "contentSource": "# Intro\n" },
      { "path": "docs/guide", "title": "Guide", "contentSource": "# Guide\n" }
    ]
  }'
```

Expected response:

```json
{
  "created": [
    {
      "id": "...",
      "path": "docs/intro",
      "title": "Intro",
      "revisionId": "..."
    },
    {
      "id": "...",
      "path": "docs/guide",
      "title": "Guide",
      "revisionId": "..."
    }
  ],
  "count": 2
}
```

If any path already exists, the entire batch is rejected with `409 Conflict`
and zero pages are created.

## 5. Get wiki stats

Get aggregate health metrics. Omit `include=orphans` for the basic overview.

```bash
curl "http://localhost:3000/api/v1/stats?include=orphans" \
  -H "Authorization: Bearer nwk_..."
```

Expected response:

```json
{
  "totalPages": 42,
  "publishedPages": 38,
  "draftPages": 3,
  "deletedPages": 1,
  "recentActivity": {
    "createdInLast7Days": 5,
    "updatedInLast7Days": 12
  },
  "directories": [
    { "segment": "docs", "pageCount": 15 },
    { "segment": "finance", "pageCount": 8 }
  ],
  "orphans": [
    { "id": "...", "path": "archive/old-page", "title": "Old Page" }
  ]
}
```

Reader-scoped keys receive published-page counts only.

## 6. Check for similar pages

Before creating a page, check whether a similar one already exists.

```bash
curl -X POST http://localhost:3000/api/v1/search/similar \
  -H "Authorization: Bearer nwk_..." \
  -H "Content-Type: application/json" \
  -d '{
    "title": "payment routing",
    "path": "finance/payment-routing",
    "threshold": 0.5
  }'
```

Expected response:

```json
{
  "results": [
    {
      "pageId": "...",
      "path": "finance/payment-routing",
      "title": "Payment Routing",
      "score": 0.92
    }
  ],
  "threshold": 0.5
}
```

At least one of `title` or `path` must be provided.

## MCP quick reference

If you are using an MCP client, the mapped tools are:

| Endpoint | MCP Tool |
|---|---|
| `DELETE /v1/pages/{id}` | `delete_page` |
| `GET /v1/pages/{id}/backlinks` | `get_backlinks` |
| `GET /v1/pages/{id}/revisions/{version}/diff` | `get_diff` |
| `POST /v1/pages/batch` | `batch_create_pages` |
| `GET /v1/stats` | `get_stats` |
| `POST /v1/search/similar` | `find_similar` |

See [contracts/mcp-tools.md](./contracts/mcp-tools.md) for parameter and
response details.
