# v1 Route Contracts: AI Curation API

**Phase 1 output** | **Date**: 2026-07-04
**Companion to**: [`plan.md`](../plan.md), [`data-model.md`](../data-model.md)

Every contract below is grounded in the existing route patterns (`apps/web/app/api/v1/search/pages/route.ts`, `pages/batch/route.ts`, `pages/[id]/backlinks/route.ts`) and the existing Zod schema organization (`packages/shared/src/pages.ts`, `packages/shared/src/ai.ts`).

This document specifies the **contract surface** — request shape, response shape, error envelope, and audit expectations. It does not specify implementation; the plan phase is the source of truth for that.

---

## Conventions

- All routes are wrapped by `withPublicApi` (`apps/web/app/api/v1/_shared/route.ts:54-66`) → `withApiAudit` (`apps/web/src/server/api/audit-wrapper.ts:46-117`).
- Auth: `Authorization: Bearer nwk_…`. The `withPublicApi` wrapper resolves the actor via `createApiContext()` (`apps/web/src/server/api/session.ts:5-12`).
- Error envelope: `{ code: PublicApiErrorCode, message: string }` (see [`permission-scope-map.md`](./permission-scope-map.md) for the full list). HTTP status is set by `mapPublicDomainError` (`apps/web/src/server/api/public-errors.ts:33-57`).
- Query parsing: `parsePublicQuery` (line 40) → `safeParse` on the Zod schema. Bad query → `422` with `code: VALIDATION_FAILED`.
- Body parsing: `parsePublicJson` (line 24) → 422 on bad JSON or schema mismatch.
- Path params: each handler declares its own `z.object({ id: z.string().uuid() })` schema; the existing pattern is `apps/web/app/api/v1/pages/[id]/drafts/route.ts:7`.
- Pagination: opaque base64url cursor (`decodePublicCursor` / `encodePublicCursor` at `apps/web/src/server/api/public-pagination.ts`); the response carries `{ items, nextCursor: string | null }`.
- Per-item partial success: `{ results: BatchItemResult[], successCount: number, failureCount: number }` (new shape introduced by this spec).
- Dry-run: `?dry_run=true` (snake_case to match existing query params; not `dryRun`).

---

## Route 1: `GET /api/v1/search/pages` (extended, not new)

**Change**: adds optional `filter[tag]`, `filter[status]`, `filter[owner]`, `filter[has_frontmatter]` query parameters and the `frontmatter` field on each returned page.

**Request**:

| Param | Type | Notes |
|---|---|---|
| `q` | string, required, 1..200 | unchanged |
| `scope` | `'path' \| 'title' \| 'content' \| 'all'` | unchanged; default `all` |
| `pathPrefix` | string | unchanged |
| `path` | string | unchanged |
| `status` | `'published' \| 'draft' \| 'all'` | unchanged; default `published` |
| `createdStart`, `createdEnd`, `updatedStart`, `updatedEnd` | ISO-8601 datetime | unchanged |
| `include` | enum array | unchanged |
| `limit` | int 1..100, default 20 | unchanged |
| `cursor` | string, opaque | unchanged |
| `filter[tag]` | string, repeated | new; each value is an OR alternative; absent = no filter |
| `filter[status]` | string, repeated | new; same semantics |
| `filter[owner]` | string, repeated | new; same semantics |
| `filter[has_frontmatter]` | `'true' \| 'false'` | new; absent = no filter |

**Response**: `PublicPageSearchResponse` (unchanged envelope). Each `items[].page` now carries the new `frontmatter: Record<string, unknown> | null` field.

**Errors**:

| Code | When | HTTP |
|---|---|---|
| `VALIDATION_FAILED` | bad query params, bad filter values | 422 |
| `INTERNAL_ERROR` | parser failure on a page (e.g., 1MB YAML bomb) — soft-degraded, the page is dropped from results | 500 only if the entire response cannot be built |

**Audit**: one `apiAuditEntries` row with `(method: 'GET', path: '/api/v1/search/pages', statusCode, durationMs, actor)`. Same as today.

**Backward compatibility**: callers that omit the new filters receive byte-compatible responses. The `frontmatter` field is new but additive; clients that ignore unknown fields are unaffected.

---

## Route 2: `POST /api/v1/search/semantic` (new)

Submits a semantic search action. Returns the action resource immediately; the actual embedding and retrieval happen in the background.

**Request**:

```json
{
  "q": "string, 1..8000, required",
  "limit": "int 1..50, default 10, optional",
  "pathPrefix": "string, optional",
  "scope": "'path' | 'title' | 'content' | 'all', default 'all', optional",
  "filter[tag]": "string, repeated, optional",
  "filter[status]": "string, repeated, optional",
  "filter[owner]": "string, repeated, optional",
  "filter[has_frontmatter]": "'true' | 'false', optional"
}
```

**Response** (HTTP 202):

```json
{
  "id": "uuid",
  "feature": "'semantic_search'",
  "status": "'queued'",
  "createdAt": "ISO-8601",
  "expiresAt": "ISO-8601",
  "pollUrl": "'/api/v1/search/semantic/{id}'"
}
```

**Errors**:

| Code | When | HTTP |
|---|---|---|
| `VALIDATION_FAILED` | bad body | 422 |
| `FORBIDDEN` | API key lacks `ai.read` scope (the request is rejected with no disclosure of index state per FR-007) | 403 |
| `INDEX_NOT_READY` | no active embedding generation exists (or generation status is not `'ready'`) | 409 |
| `INTERNAL_ERROR` | unhandled | 500 |

**Audit**: one `apiAuditEntries` row with `path: '/api/v1/search/semantic', statusCode: 202`. The downstream AI action has its own lifecycle in `ai_actions` (the public-api wrapper does not duplicate audit for the action itself).

**Async behavior**: this endpoint MUST NOT invoke the embedding model synchronously. The semantic-search job runs in the `ai-action` pg-boss queue (`apps/web/src/server/jobs/runtime.ts:10`); the route returns 202 as soon as the row is persisted.

**Timeout**: the worker has up to 4 hours (`expireSecondsForFeature` at `ai-actions.ts:37` defaults to 15 minutes; the override for `index_rebuild` is 4h and is not applied to `semantic_search`).

---

## Route 3: `GET /api/v1/search/semantic/{id}` (new)

Polls for the status and results of a previously-submitted semantic search.

**Path params**: `{ id: uuid }`.

**Response** (HTTP 200, shape depends on `status`):

```json
{
  "id": "uuid",
  "feature": "'semantic_search'",
  "status": "'queued' | 'running' | 'succeeded' | 'failed' | 'expired'",
  "createdAt": "ISO-8601",
  "startedAt": "ISO-8601 | null",
  "finishedAt": "ISO-8601 | null",
  "expiresAt": "ISO-8601",
  "items": [
    {
      "pageId": "uuid",
      "path": "string",
      "title": "string",
      "score": "number in [0,1]",
      "excerpt": "string, <= 1200 chars",
      "citations": [
        {
          "chunkId": "uuid",
          "revisionId": "uuid",
          "contentHash": "string"
        }
      ]
    }
  ],
  "error": {
    "code": "string, optional — present when status is 'failed'",
    "message": "string, optional"
  },
  "usage": {
    "inputTokens": "number, optional",
    "requestId": "string, optional"
  }
}
```

- When `status` is `queued` or `running`, `items` is an empty array and `error` is absent.
- When `status` is `succeeded`, `items` carries the filtered, permission-cleared results with citations.
- When `status` is `failed`, `error` is present; `items` is absent (or empty).
- When `status` is `expired`, the action's TTL has elapsed (per the existing `ai_settings.event_retention_hours` setting); `items` is absent.

**Errors**:

| Code | When | HTTP |
|---|---|---|
| `NOT_FOUND` | unknown action id, OR the action belongs to a different API key's owner (existence non-disclosure per FR-006) | 404 |
| `VALIDATION_FAILED` | bad id format | 422 |

**Authorization**: the action's `actor_user_id` must match the API key's `userId`. Otherwise `404` (not `403`) — same no-disclosure rule as the internal `requireActionAccess` (`apps/web/src/server/services/ai-actions.ts:243-254`).

**Pagination / streaming**: not in this spec. The endpoint returns the full result set in one response. The existing internal SSE stream (`apps/web/app/api/ai/actions/[id]/events/route.ts`) is not exposed via v1 in this spec — a sibling spec may add it.

---

## Route 4: `GET /api/v1/pages/{id}/links` (new)

Returns the page's outbound links, classified by source.

**Path params**: `{ id: uuid }`.

**Response** (HTTP 200):

```json
{
  "pageId": "uuid",
  "links": [
    {
      "source": "'markdown' | 'wiki' | 'frontmatter'",
      "targetPath": "string",
      "targetPageId": "uuid | null — populated when target resolves",
      "targetStatus": "'published' | 'draft' | 'deleted' | null",
      "linkText": "string"
    }
  ],
  "dangling": [
    { "source": "...", "targetPath": "string", "linkText": "string" }
  ],
  "external": [
    { "source": "'markdown'", "href": "string (https://...)", "linkText": "string" }
  ]
}
```

- `links[]` — targets the caller can read AND that resolve to a known page.
- `dangling[]` — targets the caller can see referenced in the content (because the *linker* page is readable) but the *target* is either unknown (no page with that path) or unreadable. Carries `targetPath` and `linkText` but no `targetPageId`.
- `external[]` — `https://...` Markdown links. Not subject to the wiki's permission model.
- Targets that point to soft-deleted pages are surfaced in `dangling[]` with `targetStatus: 'deleted'` if and only if the caller has `read_draft` or admin access; otherwise the soft-deleted target is omitted entirely.

**Errors**:

| Code | When | HTTP |
|---|---|---|
| `NOT_FOUND` | unknown page id OR page unreadable to the caller (existence non-disclosure) | 404 |
| `VALIDATION_FAILED` | bad id format | 422 |

**Audit**: one row, `path: '/api/v1/pages/{id}/links'`.

---

## Route 5: `GET /api/v1/graph/neighbors` (new)

Returns the multi-hop neighborhood of a page.

**Query parameters**:

| Param | Type | Notes |
|---|---|---|
| `node` | uuid, required | the root page id |
| `depth` | int 1..3, default 1, required | the traversal depth bound |
| `direction` | `'out' \| 'in' \| 'both'`, default `'out'`, optional | which edges to follow |

**Response** (HTTP 200):

```json
{
  "root": {
    "pageId": "uuid",
    "path": "string",
    "title": "string"
  },
  "tiers": [
    [
      {
        "pageId": "uuid",
        "path": "string",
        "title": "string",
        "viaLinkSource": "'markdown' | 'wiki' | 'frontmatter' | 'backlink' (for direction=in|both)"
      }
    ]
  ]
}
```

- `tiers[0]` is the root (a single-element array).
- `tiers[1]` is the depth-1 neighborhood.
- A page appears at most once per tier (per-request visited set).
- All pages in `tiers` satisfy the caller's read permission. Unreadable targets are silently omitted (no `dangling` for graph — that's a property of a single edge, not of a multi-hop path).

**Errors**:

| Code | When | HTTP |
|---|---|---|
| `NOT_FOUND` | root page id unknown or unreadable | 404 |
| `VALIDATION_FAILED` | `depth` outside [1,3], or bad id format | 422 |

**Cycle handling**: per-request visited set; the algorithm never re-enters a page it has already visited at the current or shallower tier.

**Performance budget**: ≤ 1 second for a 10,000-page wiki at `depth=2` (spec SC-003). The traversal is bounded by `min(depth, 3) × fanout` where `fanout` is the avg outbound links per page; with the codebase's typical 5 outbound links, depth=2 caps at 25 page lookups.

---

## Route 6: `POST /api/v1/pages/batch/update` (new)

**Request** (up to 50 items):

```json
{
  "items": [
    {
      "pageId": "uuid, required",
      "title": "string 1..200, optional",
      "path": "string, optional (must match pathSchema)",
      "frontmatter": {
        "<key>": "<scalar | array | object, optional patch>"
      },
      "baseRevisionId": "uuid, required for stale detection"
    }
  ]
}
```

`frontmatter` is a **patch** (partial): only the keys present in the patch are written; other keys are preserved from the existing frontmatter. To delete a key, send `null` (Zod-distinct from absence).

**Response** (HTTP 200):

```json
{
  "results": [
    {
      "pageId": "uuid",
      "status": "'success' | 'failed'",
      "revisionId": "uuid — present on success",
      "preview": { "...": "predicted new state" },
      "error": {
        "code": "PublicApiErrorCode, present on failure",
        "message": "string"
      }
    }
  ],
  "successCount": "int",
  "failureCount": "int",
  "dryRun": "boolean — present and true when ?dry_run=true"
}
```

- **Atomic per item, NOT transactional across items** (FR-023). A `STALE_REVISION` on item 5 does not roll back items 1-4.
- The response always carries `results[]`; the route never throws after the request envelope is validated.
- On `dry_run=true`: no write happens, no revision is created, but the same per-item validation runs (path collision, STALE_REVISION, permission). The `preview` field is populated in place of `revisionId`.

**Errors** (envelope-level, not per-item):

| Code | When | HTTP |
|---|---|---|
| `VALIDATION_FAILED` | bad body, item count outside 1..50, missing `baseRevisionId` | 422 |
| `FORBIDDEN` | API key lacks `edit` scope (rejected at the batch boundary, no per-item inspection) | 403 |

**Per-item error codes** (in the `error.code` field of each failed result):

| Code | When |
|---|---|
| `NOT_FOUND` | page id unknown or unreadable |
| `FORBIDDEN` | actor cannot `edit` the page (e.g., editor not the author) |
| `STALE_REVISION` | `baseRevisionId` does not match `pages.latestVersionId` |
| `CONFLICT` | `path` collides with an existing (non-deleted) page's path |
| `PAGE_PATH_CONFLICT` | legacy alias for the same; `mapPublicDomainError` maps to the public code |

**Audit**: one `apiAuditEntries` row, `path: '/api/v1/pages/batch/update'`. Per-item outcome is NOT in the audit row; it is in the response body and is **not durable** (the response is the only record).

**Behavior re: revisions**: every successful item creates a new `page_revisions` row (P8). The `revisionId` in the response is the new revision's id.

---

## Route 7: `POST /api/v1/pages/batch/delete` (new)

**Request** (up to 50 items):

```json
{
  "pageIds": ["uuid", "..."]
}
```

**Response** (HTTP 200):

```json
{
  "results": [
    {
      "pageId": "uuid",
      "status": "'success' | 'failed'",
      "error": {
        "code": "PublicApiErrorCode, present on failure",
        "message": "string"
      }
    }
  ],
  "successCount": "int",
  "failureCount": "int",
  "dryRun": "boolean — present and true when ?dry_run=true"
}
```

- **Soft delete only** (P8). The existing `pages.ts::remove` (L235-265) is the canonical implementation; this endpoint reuses it per item.
- No revision is created (matches today's single-page `DELETE /pages/{id}`).
- `dry_run=true` returns the per-item preview (which pages would be deleted) without state change.

**Errors** (envelope-level):

| Code | When | HTTP |
|---|---|---|
| `VALIDATION_FAILED` | bad body, item count outside 1..50 | 422 |
| `FORBIDDEN` | API key lacks `delete` scope | 403 |

**Per-item error codes**:

| Code | When |
|---|---|
| `NOT_FOUND` | page id unknown, unreadable, or already soft-deleted (existence non-disclosure) |
| `FORBIDDEN` | actor cannot `delete` the page |

**Audit**: one row, `path: '/api/v1/pages/batch/delete'`.

---

## Common error envelope (for reference)

Every error response uses this shape, with the `code` drawn from the public-API error code set:

```json
{
  "code": "PublicApiErrorCode",
  "message": "string"
}
```

The public-API error code set and the HTTP status mapping are documented in [`permission-scope-map.md`](./permission-scope-map.md).

---

## Audit envelope (for reference)

Every successful and failed request produces one `apiAuditEntries` row. The shape (`apps/web/src/server/db/schema/index.ts:213-233`):

```text
{
  id: uuid,
  keyId: uuid | null,
  userId: uuid | null,
  method: 'GET' | 'POST' | 'PATCH' | 'DELETE',
  path: string,
  statusCode: int,
  durationMs: int,
  authStatus: 'authenticated' | 'invalid_key' | 'revoked_key' | 'disabled_user' | 'malformed_token',
  errorMessage: string | null,
  createdAt: timestamp
}
```

**No body is captured** — the audit does not record request bodies, response bodies, or per-item results. The response itself is the only record of batch outcomes.
