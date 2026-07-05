# Data Model: AI Curation API

**Phase 1 output** | **Date**: 2026-07-04

This spec introduces **no new database tables, no new columns, and no new pgEnums** beyond a single value addition to one existing enum. The "data model" is therefore a description of what the spec reuses, what it derives at response time, and what the one DB change is.

---

## 1. Reused entities (no changes)

| Entity | File:line | How the spec uses it |
|---|---|---|
| `pages` | `apps/web/src/server/db/schema/index.ts:129-157` | Source of `path`, `title`, `authorId`, `currentPublishedVersionId`, `latestVersionId`, `deletedAt`. The new `/links` and `/graph/neighbors` endpoints read from this table for target resolution and `dangling` reporting. |
| `page_revisions` | `apps/web/src/server/db/schema/index.ts:159-186` | Source of `contentSource` (the Markdown, including any `---` frontmatter block) and `contentHash` (used in semantic search citations). The spec reads this table to extract frontmatter and outbound links at response time. |
| `ai_actions` | `apps/web/src/server/db/schema/index.ts:853-882` | New `feature='semantic_search'` actions are persisted here (the enum already lists this value at `apps/web/src/server/db/schema/enums.ts:134-142`). The new `submit_semantic_search` endpoint writes a row; `get_semantic_search_results` reads it. |
| `ai_action_events` | `apps/web/src/server/db/schema/index.ts:894-909` | The new endpoint's `citations[]` are enriched by reading the `search_results` event payload (written by `runSemanticSearchAction` at `apps/web/src/server/services/ai-retrieval.ts:84`). |
| `ai_index_generations` | `apps/web/src/server/db/schema/index.ts` (ai_index_generations) | Used as before by `exactCosineSearch` (filtered by `is_active = true`). The spec does not change how the index is built or selected. |
| `ai_knowledge_chunks` | `apps/web/src/server/db/schema/index.ts` (ai_knowledge_chunks) | The pgvector table the semantic search runs against. The new permission filter is applied *post*-SQL in the `retrieve()` facade (not pushed into the SQL itself) per Decision 2. |
| `spaces` | `apps/web/src/server/db/schema/index.ts` (spaces) | The `anonymousRead` column is joined by `loadReadableFullContext` and now by the refactored `retrieve()` to feed the per-page `can(ctx, 'read', …)` check. |
| `api_keys` | `apps/web/src/server/db/schema/index.ts:188-207` | The `scopes` column is `apiKeyScopeEnum('scopes').array()`. After the migration, it accepts the new `'ai.read'` value. |
| `api_audit_entries` | `apps/web/src/server/db/schema/index.ts:213-233` | Every new v1 route is automatically audited by `withPublicApi` → `withApiAudit`. No new column or enum. The audit pattern is one row per request, method+path+status, no body capture. |

## 2. The one DB change: `apiKeyScopeEnum` gains `'ai.read'`

**Migration** (Drizzle-generated, never hand-authored per `AGENTS.md`):

- Edit `apps/web/src/server/db/schema/enums.ts:7-17` to add `'ai.read'` to the `apiKeyScopeEnum` array.
- Run `pnpm db:generate` to produce the migration SQL + snapshot.
- The migration is a single `ALTER TYPE api_key_scope_enum ADD VALUE 'ai.read';` (Drizzle emits the exact DDL).
- **Caveat**: PostgreSQL's `ALTER TYPE ... ADD VALUE` cannot run inside a transaction block; Drizzle handles this by emitting the statement outside a transaction. No data is affected; the column's `array()` type already accommodates any number of new values.

**Code changes that go with the migration** (no migration is required for these — they are pure TS):

- `packages/shared/src/api-keys.ts:3-13` — add `'ai.read'` to `apiKeyScopeSchema`'s Zod enum.
- `apps/web/src/server/permissions/index.ts:58-68` — add `'ai.read': ['use_ai_search', 'use_ai_qa']` to `scopeToActions`.
- `apps/web/src/server/permissions/index.ts:132-144` — remove `use_ai_search` and `use_ai_qa` from the api-key hard-deny list. The carve-out is gated by the new scope (verified by the new `ai-permissions.test.ts` tests).

**Behavior change visible to existing code**: an API key that previously could not use AI features can now do so when granted the new `ai.read` scope. No other behavior changes. The migration is **additive**; no rollback script is required for the data, only the enum (Drizzle generates a droppable migration).

## 3. Derived projections (no DB storage)

Three pieces of "data" appear in API responses that are derived at response time, not stored:

### 3.1 Parsed frontmatter

- **Source**: `page_revisions.contentSource` (the full Markdown, including the `---` block).
- **Parser**: new function `parsePageFrontmatter(markdown: string): { frontmatter: object | null; markdown: string }` extracted from `apps/web/src/server/transfers/manifest.ts:40-48` per Decision 3.
- **Storage**: none. The parse is recomputed for every page response that includes `frontmatter`.
- **Shape** (response field on `PublicPageResource` and `PublicRevisionResource`):

  ```ts
  frontmatter: Record<string, unknown> | null
  ```

  The shape is intentionally untyped beyond `Record<string, unknown>` because the spec requires unknown keys to be preserved verbatim (Assumption 3). Frontmatter filter keys (`tag`, `status`, `owner`) are first-class in the public Zod schema, but the response itself is a generic key/value map.

### 3.2 Outbound links

- **Source**: `page_revisions.contentSource`, parsed by a new `findMarkdownLinks` function (Decision 4).
- **Storage**: none. Recomputed at response time.
- **Shape** (response field on `getOutboundLinks`):

  ```ts
  type OutboundLink = {
    source: 'markdown' | 'wiki' | 'frontmatter';
    targetPath: string;            // canonical path the link points to
    targetPageId?: string;          // populated when the target resolves to a known page
    targetStatus?: 'published' | 'draft' | 'deleted';  // populated when target resolves
    linkText: string;               // visible label
  };
  // Response also includes a parallel `dangling[]` array with the same shape minus `targetPageId`/`targetStatus`.
  ```

  `source: 'frontmatter'` is reserved for entries from the `related_pages` frontmatter key (per Assumption 4). External links (`https://...`) are excluded from `links[]` and surfaced in a separate `external[]` array.

### 3.3 Graph neighborhood

- **Source**: derived from `getOutboundLinks` at each hop, bounded by `depth ∈ [1,3]`.
- **Storage**: none.
- **Shape** (response field on `getNeighborhood`):

  ```ts
  type Neighborhood = {
    root: { pageId: string; path: string; title: string };
    tiers: Array<Array<{ pageId: string; path: string; title: string; viaLinkSource: 'markdown' | 'wiki' | 'frontmatter' }>>;
    // tiers[0] is the root, tiers[1] is depth 1, etc.
    // `direction=both` adds inbound edges; `direction=out` (default) follows only outbound edges.
  };
  ```

  A page appears at most once per tier; cycle handling is by per-request visited set (Decision 4).

## 4. State transitions (no new ones)

The spec reuses all existing state transitions:

- **Page soft-delete** — `pages.ts::remove` (L235-265) is unchanged. Soft-deleted pages appear in `dangling[]` (link) and as filtered-out (search) per spec FR-019.
- **Revision creation** — `pages.ts::newDraft` (L345-430) is unchanged. Frontmatter patches go through it with a rebuilt `contentSource` that includes the new `---` block (the parser is the inverse of the extractor, so round-trip is lossless).
- **Action lifecycle** — `ai_actions` `queued → running → completed | failed | expired` is unchanged internally, while the public response normalizes completed actions to `status: succeeded`. `submit_semantic_search` only adds the `api_key` actor path; the lifecycle itself is reused.
- **Index generation epochs** — `ai_index_generations` epoch transitions (`building → ready → superseded`) are unchanged. The new `/api/v1/search/semantic` endpoint does not alter how generations are built.

## 5. Validation rules added to existing entities

| Entity | Field | Rule |
|---|---|---|
| `api_keys` | `scopes` | May now include `'ai.read'`. Validation enforced by `apiKeyScopeSchema` (Zod) at the request boundary. The migration is required for the DB column to accept the new value. |
| `PublicPageResource` | `frontmatter` | New optional field; `null` when the page has no frontmatter or the YAML is malformed. Tolerated by the parser per Decision 3. |
| `PublicRevisionResource` | `frontmatter` | Same as above, computed from the specific revision's `contentSource`. |
| Frontmatter filters | `filter[tag]`, `filter[status]`, `filter[owner]`, `filter[has_frontmatter]` | Treated as exact string match within an array element (`has_frontmatter` is a boolean). Multiple values within the same key are OR-combined; across keys are AND-combined. |
| `ai_actions` | `feature` | `'semantic_search'` is the new public-API entry point. The column already accepts this value; no change. |

## 6. Things explicitly NOT introduced

To keep the spec honest:

- **No new pgEnum**. Only an additive value to the existing `apiKeyScopeEnum`.
- **No new column on `pages` or `page_revisions`** (e.g., a hypothetical `frontmatter_json` for caching). FR-029 forbids this; a future spec may add it for performance.
- **No new index on `ai_knowledge_chunks`**. The spec reuses the existing pgvector index; the post-SQL permission filter is the only access-path change.
- **No new row-level locking strategy**. The existing per-page `STALE_REVISION` check (via `baseRevisionId` against `pages.latestVersionId`) is reused.
- **No new write-side hook** (e.g., a "frontmatter changed" trigger). The existing `enqueueGitExport` and `reconcilePageAcrossIndexes` post-write hooks handle side effects for any page mutation.
- **No new audit column**. `withPublicApi` → `withApiAudit` audits every v1 route automatically. The audit row's `path` field captures the endpoint, `statusCode` captures the outcome, and `errorMessage` is populated for 4xx+ responses.

## 7. Migration ordering

The one DB migration must run **before** any deployment that grants the new scope to a key. The runtime code can be deployed first (it accepts `'ai.read'` strings in the Zod layer even before the migration, but the DB will reject inserts with the new value until the migration runs). The recommended order is:

1. Merge code that adds the Zod / scopeToActions / deny-list changes.
2. Run `pnpm db:generate` to produce the migration.
3. Apply the migration in the same release.
4. Enable the new scope in the admin UI.
