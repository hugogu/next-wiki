# Permission Scope Map: AI Curation API

**Phase 1 output** | **Date**: 2026-07-04
**Companion to**: [`plan.md`](../plan.md), [`v1-routes.md`](./v1-routes.md), [`mcp-tools.md`](./mcp-tools.md)

This document specifies the exact permission wiring for the new `ai.read` API-key scope, including the six code locations that must change, the public-API error code set, and the test matrix that proves no leaks. Every reference is grounded in the existing permission chokepoint (`apps/web/src/server/permissions/index.ts:123-151`).

---

## 1. The new `ai.read` API-key scope

`ai.read` is a new value in the existing `apiKeyScopeEnum`. It maps to two permission actions:

- `use_ai_search` — the existing action at `apps/web/src/server/permissions/index.ts:39`
- `use_ai_qa` — the existing action at `apps/web/src/server/permissions/index.ts:40` (no public API uses it today, but the scope reserves access for the future `009-ai-memory-layers` follow-up Q&A endpoint)

### 1.1 Six code locations

| File:line | Change |
|---|---|
| `apps/web/src/server/db/schema/enums.ts:7-17` | Add `'ai.read'` to `apiKeyScopeEnum` (the `pgEnum` array). This is a schema migration. |
| `packages/shared/src/api-keys.ts:3-13` | Add `'ai.read'` to `apiKeyScopeSchema`'s Zod `z.enum([...])`. Pure TS, no migration. |
| `apps/web/src/server/permissions/index.ts:58-68` | Add `'ai.read': ['use_ai_search', 'use_ai_qa']` to `scopeToActions`. The TypeScript `Record<ApiKeyScope, Action[]>` type guarantees the new key is required. |
| `apps/web/src/server/permissions/index.ts:132-144` | **Remove** `use_ai_search` and `use_ai_qa` from the api-key hard-deny list. Replace with a comment that the carve-out is now gated by the new scope (and cite the unit test in `apps/web/src/server/permissions/ai-permissions.test.ts` for the new behavior). |
| `apps/web/src/components/user-center/ApiKeyCreateDialog.tsx:11` | Add `'ai.read'` to `SCOPE_ORDER` so admins can grant it via the UI. |
| `apps/web/src/i18n/locales/en.ts:643-660` and `zh.ts:625-642` | Add i18n keys for the new scope's display name and description. |

### 1.2 The migration

- The pgEnum change is a single `ALTER TYPE api_key_scope_enum ADD VALUE 'ai.read';`.
- Drizzle generates the migration from the schema change via `pnpm db:generate` (per `AGENTS.md`: never hand-author migrations).
- The migration is **additive**; rolling it back requires dropping the enum value (Drizzle handles this on the down-migration).

### 1.3 Why a dedicated scope (not reusing `view`)

`view` already maps to `['read', 'read_draft']` (`apps/web/src/server/permissions/index.ts:58-68`). Reusing it as the only semantic-search gate would conflate two concerns:

1. `read_draft` is a stronger capability than `read` — it exposes drafts. AI features should not see drafts (the embedding index is built only from published revisions, so there is no semantic content to expose, but the principle holds).
2. The scope-grant model is meant to be per-capability. A key with only `view` can read pages directly, but it should not be able to invoke AI retrieval unless `ai.read` is also granted.

A dedicated `ai.read` is the only way to satisfy Constitution P5 ("every API route MUST check permissions") without weakening the `view` scope or the `use_ai_search` / `use_ai_qa` actions. Public semantic search requires both scopes: `ai.read` for the AI capability gate and `view` for result-level page-read filtering.

## 2. Public-API error code set

The error code set returned in the `{ code, message }` envelope extends the existing `PublicApiErrorCode` union at `apps/web/src/server/api/public-errors.ts:5-17` with one new public value, `INDEX_NOT_READY`, because semantic-search clients need to distinguish "embedding index not available yet" from generic conflicts:

```text
UNAUTHORIZED | FORBIDDEN | NOT_FOUND | VALIDATION_FAILED | CONFLICT
| STALE_REVISION | PAGE_PATH_CONFLICT | REVISION_ALREADY_PUBLISHED
| UNSUPPORTED_ASSET_TYPE | ASSET_TOO_LARGE | RATE_LIMITED | INDEX_NOT_READY
| INTERNAL_ERROR
```

`INDEX_NOT_READY` is returned by `createSemanticSearch` at `apps/web/src/server/services/ai-retrieval.ts:16` and must be preserved in the public envelope by `mapPublicDomainError` (`apps/web/src/server/api/public-errors.ts:33-57`) with HTTP 409. This is the only new public error code in this spec.

The status code mapping for the relevant `DomainError` codes is unchanged:

| `DomainErrorCode` | HTTP status (public) | Notes |
|---|---|---|
| `UNAUTHORIZED` | 401 | missing or invalid bearer |
| `FORBIDDEN` | 403 | API key lacks the required scope or role |
| `NOT_FOUND` | 404 | resource doesn't exist OR caller can't see it (existence non-disclosure) |
| `CONFLICT` | 409 | path collision, etc. |
| `INDEX_NOT_READY` | 409 | no active embedding index is available for semantic search |
| `STALE_REVISION` | 409 | optimistic concurrency check failed |
| `VALIDATION_FAILED` | 422 | Zod schema mismatch (default for unmapped internal codes) |
| `INTERNAL_ERROR` | 500 | last-resort fallback |

## 3. The api-key hard-deny list — before and after

**Before** (`apps/web/src/server/permissions/index.ts:132-144`, current behavior):

```ts
if (action === 'manage_users'
 || action === 'manage_ai'
 || action === 'manage_appearance'
 || action === 'use_ai_search'
 || action === 'use_ai_qa'
 || action === 'use_ai_text_optimization'
 || action === 'use_ai_image_generation') {
  return false;
}
```

**After** (this spec):

```ts
if (action === 'manage_users'
 || action === 'manage_ai'
 || action === 'manage_appearance'
 || action === 'use_ai_text_optimization'
 || action === 'use_ai_image_generation') {
  return false;
}
// use_ai_search and use_ai_qa are now permitted when the api_key has
// the 'ai.read' scope (see ai-permissions.test.ts for the role ∩ scope matrix).
```

The carve-out is intentionally narrow: it only affects `use_ai_search` and `use_ai_qa`. The other AI actions (`use_ai_text_optimization`, `use_ai_image_generation`) remain api-key-forbidden — those endpoints ship to admin/editor users only and are out of scope for this spec.

## 4. Permission filter on the shared `retrieve()` function (FR-009)

The pre-existing `retrieve()` function at `apps/web/src/server/services/ai-retrieval.ts:34` is refactored:

**Before**:

```ts
export async function retrieve(
  generationId: string,
  queryVector: number[],
  limit: number,
): Promise<AiSearchResult[]>
```

**After**:

```ts
export async function retrieve(
  ctx: PermCtx,
  generationId: string,
  queryVector: number[],
  limit: number,
): Promise<AiSearchResult[]>
```

The function's body gains a per-page filter step (between the existing line 39 `exactCosineSearch` call and the existing line 40 grouping):

```ts
const space = await getDefaultSpace();   // existing helper
const matches = await exactCosineSearch(generationId, queryVector, Math.max(limit * 10, 100));
const readable = matches.filter((m) =>
  can(ctx, 'read', { kind: 'page_list' }, { anonymousRead: space?.anonymousRead ?? false }),
);
// ... existing grouping and excerpt logic, but on `readable` instead of `matches`
```

**Pattern source**: this is the same pattern used by `apps/web/src/server/ai/retrieval/full-context.ts:55-58` (the in-app Q&A full-context path). The vector path is brought to parity.

**Behavior change for the existing Q&A flow**:

- The existing in-app Q&A flow (`apps/web/src/server/jobs/ai-question.ts:67`) calls `retrieve(generation.id, vector, 8)` with no `ctx`. The fix passes the already-constructed `ctx` (line 38) through.
- In the default single-space deployment, this is a no-op: every authenticated user can read every page, so the filter is identity. But the moment an API key, multi-space, or per-page ACL is introduced, the filter is correct.

## 5. Per-endpoint permission gate (the spec's table)

| v1 endpoint | `view` | `ai.read` | `edit` | `delete` | Notes |
|---|---|---|---|---|---|
| `GET /api/v1/search/pages` | ✓ | — | — | — | unchanged |
| `POST /api/v1/search/semantic` | ✓ | ✓ | — | — | new; `view` feeds result read filtering, `ai.read` gates AI retrieval |
| `GET /api/v1/search/semantic/{id}` | ✓ | ✓ | — | — | new; also requires `actorUserId === ctx.actor.userId` |
| `GET /api/v1/pages/{id}/links` | ✓ | — | — | — | new |
| `GET /api/v1/graph/neighbors` | ✓ | — | — | — | new |
| `POST /api/v1/pages/batch/update` | — | — | ✓ | — | new; rejected at batch boundary if scope missing |
| `POST /api/v1/pages/batch/delete` | — | — | — | ✓ | new; same |

A key can have multiple scopes. The matrix above is the **minimum** required scope per endpoint; the codebase's `can()` evaluation is `scope ∩ role`, so a `reader` role + `['view', 'ai.read']` scope set is sufficient for the semantic endpoints, but the same role + `edit` scope is rejected on `batch/update` (because `reader` role lacks `edit`).

## 6. Test matrix (the regression suite)

### 6.1 Permission unit tests (`apps/web/src/server/permissions/ai-permissions.test.ts` — extend)

For each combination below, assert that `can(apiKeyCtx, action, resource)` returns the expected value:

| Actor | Scope | Action | Expected |
|---|---|---|---|
| anonymous | — | `use_ai_search` | false (no actor) |
| `api_key` `reader` | none | `use_ai_search` | false (no scope) |
| `api_key` `reader` | `['view']` | `use_ai_search` | false (`view` doesn't include AI) |
| `api_key` `reader` | `['ai.read']` | `use_ai_search` | **true** (the new path) |
| `api_key` `editor` | `['ai.read']` | `use_ai_search` | true |
| `api_key` `admin` | `['ai.read']` | `use_ai_search` | true |
| `api_key` `reader` | `['ai.read']` | `use_ai_qa` | **true** (the new path) |
| `api_key` `reader` | `['ai.read']` | `use_ai_text_optimization` | false (still denied) |
| `api_key` `reader` | `['ai.read']` | `manage_ai` | false (still denied) |
| `user` `reader` | n/a (no scopes) | `use_ai_search` | true (user roles bypass the deny list) |

Route-level tests must additionally prove that a semantic-search API request with only `ai.read` and no `view` is rejected with `FORBIDDEN`, because `ai.read` alone authorizes the AI capability but not page reads.

### 6.2 No-leakage integration tests

For each endpoint, assert the same pattern as `apps/web/src/server/services/public-content-read.test.ts:65-81`:

| Test | Setup | Assert |
|---|---|---|
| `keyword search filters unreadable` | seeded page P (caller cannot read) + searchable term that matches P's content | `searchPages` result does not include P; `excerpt` does not contain P's text |
| `semantic search filters unreadable` | indexed page P (caller cannot read) + query whose vector is nearest to P's chunks | `retrieve()` result does not include P; `citations[]` does not include P's chunkId |
| `Q&A vector path filters unreadable` | same as above, but through the in-app Q&A path | the Q&A prompt's `sources[]` does not include P |
| `outbound links: dangling not page-stubs` | page A links to unreadable page B | A's `/links` response has B in `dangling[]` (not `links[]`); no `targetPageId` is leaked |
| `graph: unreadable target silently omitted` | page A links to unreadable page B | A's `/neighbors` response does not include B in any tier; response gives no indication B exists |
| `batch update: unreadable page rejected at item` | page P unreadable + batch contains P | P's `result.status === 'failed'` with code `NOT_FOUND`; other items in the batch succeed |

### 6.3 Route-level no-existence-disclosure tests (mirror `public-pages-read-routes.test.ts:38-51`)

| Route | 404 trigger | Assert |
|---|---|---|
| `GET /api/v1/pages/{id}/links` | id of unreadable page | HTTP 404, body `{code: 'NOT_FOUND', message: 'Not found'}` (identical to "page doesn't exist" response) |
| `GET /api/v1/graph/neighbors?node={id}` | id of unreadable page | HTTP 404, same body |
| `GET /api/v1/search/semantic/{id}` | id of action submitted by a different user | HTTP 404, same body |
| `POST /api/v1/pages/batch/update` | key has `view` only (no `edit`) | HTTP 403, body `{code: 'FORBIDDEN', ...}` (no per-item inspection) |

### 6.4 Round-trip test (frontmatter parser)

New test in `apps/web/src/server/services/public-content-read.test.ts`:

```ts
const page = await publicContent.createPage(ctx, {
  path: 'docs/curation-test',
  title: 'Curation Test',
  contentSource: `---\ntags: [architecture, curation]\nstatus: draft\n---\n# Body\n`,
});
const result = await publicContent.getPageByPath(ctx, 'docs/curation-test');
expect(result?.frontmatter).toEqual({
  tags: ['architecture', 'curation'],
  status: 'draft',
});
```

Plus a malformed-YAML soft-failure test (returns `frontmatter: null` instead of throwing) and a no-frontmatter test (returns `frontmatter: null`).

### 6.5 E2E (Playwright) tests in `apps/web/e2e/`

Two new spec files:

- `ai-curation-search.spec.ts` — boots Docker Compose, seeds a wiki, runs the keyword + semantic + frontmatter-filter flows end-to-end, asserts the response shape and the audit log entries.
- `ai-curation-batch.spec.ts` — runs the batch update and delete flows, including the dry-run path and the partial-success path (one item with a path collision among 20 otherwise-valid items).

## 7. Migration safety

The pgEnum change is `ALTER TYPE ... ADD VALUE`, which is **non-transactional** in PostgreSQL. Drizzle handles this by emitting the statement outside a transaction block. The migration is safe to run while the application is live; the runtime code accepts the new value as soon as it's deployed, and the DB starts accepting it as soon as the migration is applied. The two can be deployed in either order, but the recommended order is:

1. Deploy code that adds the new scope to the Zod layer and the scopeToActions map.
2. Run the migration.
3. Enable the scope in the admin UI (the dialog already accepts the new value once the i18n strings are in place).
4. Admins can now grant the new scope to existing or new API keys.

The migration is **additive** and does not require any data backfill. The only rollback risk is dropping the enum value if any existing key was granted the new scope — Drizzle's down-migration would fail loudly in that case, which is the desired safety property.
