# Contract: Public Wiki API Maintenance Endpoints

All routes extend the v1 namespace (`/api/v1`) and follow the common rules
defined in [007's rest-api.md](../007-public-wiki-api/contracts/rest-api.md):
same auth, error codes, pagination conventions, and permission enforcement.

## Pages

### `DELETE /api/v1/pages/{id}`

Soft-delete a page. Sets `deleted_at`; preserves all revisions and assets.

- **Permission**: Editor or Admin (`can(ctx, 'delete', ...)`)
- **Response**: `204 No Content`
- **Errors**: `404` if page not found; `403` if Reader.

---

### `POST /api/v1/pages/batch`

Create up to 50 pages atomically in a single transaction.

- **Permission**: Editor or Admin
- **Body**: `PublicPageBatchCreateInput`

```json
{
  "pages": [
    { "path": "docs/intro", "title": "Intro", "contentSource": "# Intro" },
    { "path": "docs/guide", "title": "Guide", "contentSource": "# Guide" }
  ]
}
```

- **Response**: `201 Created` with `PublicPageBatchCreateResponse`
- **Errors**: `409 CONFLICT` if any path already exists (entire batch rolled
  back); `422` if batch exceeds 50 items or any item fails validation.

---

### `GET /api/v1/pages/{id}/backlinks`

List pages that contain Markdown links to the target page.

- **Permission**: Read (`can(ctx, 'read', ...)`)
- **Response**: `PublicBacklinksResponse`
- **Errors**: `404` if target page not found or not readable.
- **Note**: Scan-based extraction over published page content at query time.

```json
{
  "items": [
    {
      "pageId": "550e8400-e29b-41d4-a716-446655440000",
      "path": "docs/overview",
      "title": "Overview",
      "linkText": "see intro"
    }
  ]
}
```

---

## Revisions

### `GET /api/v1/pages/{id}/revisions/{version}/diff?against={fromVersion}`

Compute a structured diff between two revisions.

- **Permission**: Read (must be able to read both revisions)
- **Query**: `against` — the earlier version number to diff from
- **Response**: `PublicRevisionDiffResponse`

```json
{
  "fromVersion": 1,
  "toVersion": 3,
  "diff": "--- version 1\n+++ version 3\n@@ -1,3 +1,4 ...\n-old line\n+new line\n",
  "additions": 5,
  "deletions": 2
}
```

- **Errors**: `404` if either version doesn't exist; `422` if `against >= version`.

---

## Stats

### `GET /api/v1/stats`

Aggregate wiki health metrics.

- **Permission**: Read. Draft/deleted counts visible only to Editor/Admin.
- **Query**: `include=orphans` — optionally detect pages with zero inbound links.
- **Response**: `PublicStatsResponse`

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
  ]
}
```

---

## Search

### `POST /api/v1/search/similar`

Check for existing pages similar to a proposed title and/or path.

- **Permission**: Read
- **Body**: `PublicSimilarQuery`

```json
{
  "title": "payment routing",
  "path": "finance/payment-routing",
  "threshold": 0.5
}
```

- **Response**: `PublicSimilarResponse`

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
