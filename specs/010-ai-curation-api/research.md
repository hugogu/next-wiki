# Research: AI Curation API

**Phase 0 output** | **Date**: 2026-07-04
**Source**: 6 parallel research agents dispatched from `/speckit.plan`; this file consolidates their findings into the decision/rationale/alternatives format the plan phase requires.

All file:line references are to the source tree at the time of writing. Every behavior claim in [`plan.md`](./plan.md) is grounded in one of the six decisions below.

---

## Decision 1 — `ai.read` scope: where to wire it and what it unlocks

**Decision**: Add a new API-key scope `ai.read` that maps to the existing `use_ai_search` permission action (and, when Q&A ships, to `use_ai_qa`). The new scope is added in four places: the shared Zod schema (`packages/shared/src/api-keys.ts:3-13`), the DB pgEnum (`apps/web/src/server/db/schema/enums.ts:7-17`), the `scopeToActions` table (`apps/web/src/server/permissions/index.ts:58-68`), and the API-key creation dialog's `SCOPE_ORDER` (`apps/web/src/components/user-center/ApiKeyCreateDialog.tsx:11`). The api-key hard-deny list at `apps/web/src/server/permissions/index.ts:132-144` is updated to remove `use_ai_search` and `use_ai_qa` (with a comment explaining the carve-out is gated by the new scope).

**Rationale**: The existing `use_ai_search` and `use_ai_qa` permission actions already exist in the codebase (`apps/web/src/server/permissions/index.ts:39-40`); no new action constant is required. The `view` scope is too coarse — granting `view` would expose drafts and would conflate read with AI. A dedicated `ai.read` scope is the only way to satisfy Constitution P5 ("every API route MUST check permissions") while keeping the new endpoints behind a per-endpoint key grant. The migration is a single `ALTER TYPE` to add a value to the `apiKeyScopeEnum` (Drizzle generates it from `pnpm db:generate` per `CLAUDE.md`).

**Alternatives considered**:

- **Reuse `view`**: rejected — `view` also maps to `read_draft`, which would expose drafts to AI features that have no business seeing them. The granularity of the API-key scope model is meant to be a feature, not a workaround.
- **Add a new permission action like `read_ai_results`**: rejected — the action model is the wrong axis. The new constraint is at the API-key scope level, not the role-action level. Actions already exist; the missing piece is the scope.
- **Make AI features admin-only via `manage_ai`**: rejected — `manage_ai` is forbidden to API keys by the existing deny list. AI search needs to be accessible to user-owned API keys, not just admins.

**Verification**: `apps/web/src/server/permissions/ai-permissions.test.ts:14` already asserts that `use_ai_search` is denied to api_keys today; that test must be inverted to assert that `use_ai_search` is now permitted *only* when the api_key has the `ai.read` scope. The same role ∩ scope matrix is the existing test pattern from `apps/web/e2e/api-keys.spec.ts:38-80`.

---

## Decision 2 — Permission filter on the shared `retrieve()` function

**Decision**: Refactor `apps/web/src/server/services/ai-retrieval.ts:34` `retrieve()` to take a `PermCtx` as its first parameter. Apply the `can(ctx, 'read', { kind: 'page_list' }, { anonymousRead: row.anonymousRead })` filter against each candidate page returned by `exactCosineSearch`, *after* the pgvector over-fetch but *before* the per-page grouping (lines 39-66). Drop unreadable pages from the result; do not back-fill. The 10× over-fetch multiplier already in place (`Math.max(limit * 10, 100)`) provides headroom for the post-filter.

**Rationale**: This is the only correct way to close the pre-existing data leak documented in spec Assumption 9: the SQL in `vector-search.ts:32-52` does not (and cannot, without a join against `users` / `space_members`) consult per-page read permission. The post-filter pattern is the one already used by the reference implementation `apps/web/src/server/ai/retrieval/full-context.ts:55-58` — bringing `retrieve()` to parity with `loadReadableFullContext` is the correct fix. The `ai-question.ts:67` caller already builds `ctx` at line 38 (via `buildUserCtx(user.id, user.role)`) and can pass it through with a one-line change. The new public-API semantic search submits with an `api_key` actor that already has a `userId`; the action row's `actor_user_id` (column at `apps/web/src/server/db/schema/index.ts:855`) carries the API-key owner, so the worker can reconstruct `ctx` at job dispatch via `buildUserCtx(user.id, user.role)` exactly the way `ai-question.ts:38` does.

**Alternatives considered**:

- **Add a SQL join against `users` / `space_members`**: rejected — adds query complexity (and table joins for a per-row filter) for a problem that's already solved cleanly in JS at the row level. The codebase consistently applies read permission at the JS layer (`pages.ts:70, 114, 136, 211, 241, 276`; `public-content.ts:167, 297, 597, 638, 715, 855, 987`; `content-assets.ts:155`).
- **Filter only for api_key actors, not for user actors**: rejected — Constitution P5 requires the same checks everywhere. The leak is benign in the default single-space deployment today but is a real data leak the moment multi-space or per-page ACLs are introduced. The fix is one line; not fixing it for user actors would leave the vector path asymmetric with the full-context path.
- **Move the filter to `exactCosineSearch` (the SQL layer)**: rejected — the filter requires the `spaces.anonymous_read` column, which means a join, which means the current top-K ordering by vector distance becomes harder to express. Cleaner to do it post-SQL with the existing top-K and a generous over-fetch multiplier.

**Verification**: The spec mandates a regression test (spec.md Assumption 9): "a Q&A question whose top-K matches an unreadable page MUST NOT surface that page in citations." The new test goes in `apps/web/src/server/services/ai-retrieval.test.ts` and is the canonical regression for the fix.

---

## Decision 3 — Frontmatter parser: extract from the transfer manifest into a shared utility

**Decision**: Extract a new function `parsePageFrontmatter(markdown: string): { frontmatter: object | null; markdown: string }` from the existing `apps/web/src/server/transfers/manifest.ts:40-48` `parsePage()`. Place it in a new `apps/web/src/server/transfers/frontmatter.ts` (or directly in `apps/web/src/server/services/public-content.ts` if the transfer subtree is judged too narrow for a general utility). The new function:

- Strips the `---` block and returns the body verbatim.
- Parses the YAML with `yaml@2` (`apps/web/package.json:59` — already a direct dependency) using the default schema (which is already JS-safe; no `!!js/function` etc.).
- Returns `frontmatter: null` for pages without a `---` block, instead of throwing.
- Tolerates malformed YAML by returning `frontmatter: null` plus a `console.warn` (not a 5xx — the user can still see the page, just without parsed frontmatter). The spec's FR-012 requires the server to re-extract at response time; a parse failure is a soft degradation, not a request failure.
- **Does not** validate against a Zod schema (unknown keys preserved verbatim, per spec Assumption 3).
- **Does not** require the `nextWikiArchiveVersion: 1` sentinel — the new function is for user-authored Markdown, not 005 portable archives.

**Rationale**: The 005 pipeline already has the only YAML frontmatter parser in the codebase (`manifest.ts:40-48`); reusing it is the spec's explicit round-trip requirement (FR-011). But the existing `parsePage` is bound to the 005 archive format (it requires `nextWikiArchiveVersion: 1` and throws on missing frontmatter) — neither is acceptable for user-authored pages. The fix is a parallel function that drops the archive-format assumptions. The `yaml` package is already a direct dependency; no new install is needed.

**Alternatives considered**:

- **Add a new `pages.frontmatter_json jsonb` column to avoid per-request parsing**: rejected — explicit FR-029 ("No new database tables are introduced by this spec"). Also: every existing read already calls `visiblePageResource` per row, and the parse cost is microseconds. A derived column is a future optimization, not a current one.
- **Add a `remark-frontmatter` plugin to the rendering pipeline**: rejected — the rendering pipeline (`apps/web/src/server/pipeline/index.ts:117-121`) is for HTML rendering, not metadata extraction. Adding a transformer just to extract a JSON object for a separate endpoint is an over-coupling.
- **Reuse the existing `parsePage` as-is, ignoring the `nextWikiArchiveVersion` sentinel**: rejected — the function throws when the sentinel is missing, which would 5xx every real user page on the public API. The exception path is hard-coded in `manifest.ts:44-46`.

**Verification**: The existing round-trip test in `apps/web/src/server/transfers/manifest.test.ts:11-26` is the template. A new test in `apps/web/src/server/services/public-content-read.test.ts` adds a user-authored Markdown page with `tags`, `status`, `owner`, `related_pages` and asserts the response contains the parsed object with all four keys, and that an inline-only page returns `frontmatter: null`.

---

## Decision 4 — Outbound link extraction: extend the existing `findMarkdownImages` pattern

**Decision**: Add a new function `findMarkdownLinks(markdown: string): MarkdownLink[]` in `apps/web/src/server/transfers/markdown-links.ts` (alongside the existing `findMarkdownImages` at line 18). It uses the same `unified().use(remarkParse)` AST walk pattern but visits the `link` node type instead of `image`, and additionally regex-matches `[[wikilink]]` and `[[wikilink|alias]]` syntax (which AST `link` nodes do not capture). The output shape:

```ts
type MarkdownLink = {
  href: string;
  text: string;
  source: 'markdown' | 'wiki';
};
```

A second function `findFrontmatterRelatedPages(frontmatter: object | null): string[]` reads the `related_pages` key (if present and an array of strings). The three sources are combined in the new `getOutboundLinks(ctx, pageId)` facade function, which:

1. Reads the page's current published revision via `visiblePageResource` (ensures read permission).
2. Calls `readMarkdownFromDatabase` for the content.
3. Calls `parsePageFrontmatter` → `findFrontmatterRelatedPages` + `findMarkdownLinks`.
4. For each candidate target, looks up the target page by path (resolving to `{ targetPageId, targetStatus }` or marking as `dangling`).
5. Applies read permission to each *target* (per FR-019): if the target is unreadable and the link itself is invisible to the caller, drop silently; if the target is unreadable but the link is visible (i.e., the caller's own content references an unreadable page), report as `dangling` with the `target_path` only, no `targetPageId`.

The graph neighborhood endpoint `getNeighborhood(ctx, pageId, depth, direction)` reuses `getOutboundLinks` recursively up to `depth ∈ [1,3]`, maintaining a per-request visited set to terminate cycles. Cycle handling matches the spec: a page appears at most once per depth tier.

**Rationale**: The codebase has one AST-walk precedent (`findMarkdownImages` at `transfers/markdown-links.ts:18-36`) and one regex-only pattern (`MARKDOWN_LINK_RE` at `public-content.ts:700` used by `getBacklinks`). The new function needs both: AST for standard Markdown links, regex for Obsidian-style wikilinks. Reusing the existing regex pattern from `getBacklinks` (and extending it with `[[...]]` syntax) keeps the codebase consistent. The current `links(page)` helper at `public-content.ts:94-101` is unrelated (it returns the page's own API URLs, not links in the page's content); a new helper for outbound content links does not collide.

**Alternatives considered**:

- **Use only AST walking, no regex for wikilinks**: rejected — the spec mandates Obsidian-style `[[wikilink]]` parsing (FR-015, Assumption 4). The `remark` AST does not have a `wikilink` node type; the syntax must be handled with a regex pass.
- **Compute outbound links on write and store them in a `page_outbound_links` table**: rejected — explicit FR-029 (no new tables). Also: the spec calls for cycle-safe, depth-bounded traversal; pre-computing edges does not help with multi-hop queries.
- **Reuse `getBacklinks` and reverse its SQL**: rejected — backlinks is the dual relationship (inbound) and is computed by a completely different query (scan all pages for a link *to* the target). Outbound links require parsing the target page's own content. The two operations share no code.

**Verification**: The existing `apps/web/src/server/services/public-content-read.test.ts:35-63` test is the template. A new test seeds a graph (A → B → C, A → D, D → A), calls `getOutboundLinks` and `getNeighborhood`, and asserts classification, depth-bounded traversal, cycle handling, and the `dangling` array for unreadable targets.

---

## Decision 5 — Batch write shape: per-item partial success via facade-thrown `DomainError`

**Decision**: `batchUpdatePages` and `batchDeletePages` follow the spec's per-item partial-success model: each item is processed inside the existing `pages.ts::updateProperties` (L432-500) / `pages.ts::remove` (L235-265) / `pages.ts::newDraft` (L345-430) code paths, each wrapped in its own `db.transaction`. The facade function:

1. Iterates over `input.items` (up to 50).
2. For each item, calls the appropriate per-page function.
3. Catches `DomainError` per item; converts to a `BatchItemResult` with `{ itemId?, pageId, status: 'success' | 'failed', error?: { code, message } }`.
4. Returns `{ results: BatchItemResult[], successCount, failureCount }` — never throws (unless the *batch envelope itself* is malformed, which is rejected at the Zod layer before any iteration).

The `dry_run=true` mode (FR-022) is a separate code path: each item runs through a "compute-only" version of the per-page function that performs all validation (path collision, STALE_REVISION, permission) and returns the predicted new state (`{ title?, path?, frontmatter?, revisionId? }`) without writing. No `pageRevisions` row is created in dry-run; the response is `{ results: BatchPreviewResult[], dryRun: true }`.

**Rationale**: The codebase has exactly one batch endpoint today (`batchCreatePages` at `public-content.ts:807-830`) which is *atomic* — any `DomainError` aborts the entire transaction. The spec explicitly requires *per-item* partial success (FR-023) — a different shape. The implementation reuses the per-page transaction helpers rather than opening an outer transaction, so a `STALE_REVISION` on item 7 doesn't roll back items 1-6. The 50-item cap matches the existing `batchCreatePages` (which uses `.min(1).max(50)` at `packages/shared/src/pages.ts:246`); the spec already calls for the same cap (FR-020, FR-021).

**Alternatives considered**:

- **Wrap the entire batch in a single outer transaction**: rejected — contradicts FR-023's "atomic per page, NOT transactional across items" requirement. The spec is explicit on this.
- **Have the batch endpoint throw on the first failure**: rejected — the spec requires per-item reporting, and the agent use case is "reorganize 50 pages; tell me which ones failed so I can retry them."
- **Run each item as a pg-boss job**: rejected — P7 says any operation >500ms runs async, but each per-item update is a single revision insert plus index reconciliation (well under 500ms). The batch as a whole is bounded by 50 × (per-item cost) and the spec's SC-002 sets a 5-second budget for 50 items, which is achievable without a job.

**Verification**: The existing `public-content-write.test.ts:12-86` integration test is the template. New tests assert: (a) 20-item happy path, all `success`; (b) one invalid item (path collision) with 19 `success` and 1 `failed`; (c) `dry_run=true` returns preview without state change; (d) Reader-scoped key is rejected at the batch boundary; (e) `STALE_REVISION` on item 5 doesn't roll back items 1-4.

---

## Decision 6 — Facade boundary: extend `public-content` for content ops, new `public-ai` for AI ops

**Decision**: The five capabilities split across two facades:

- **`public-content.ts`** (extend): all frontmatter changes, all link/graph changes, both batch endpoints. The architectural guard test `apps/web/app/api/v1/public-route-architecture.test.ts:17-31` already forbids v1 routes from importing anything other than `public-content`; reusing it for the new content endpoints keeps the guard's invariant intact.
- **`public-ai.ts`** (new): `submitSemanticSearch` and `getSemanticSearchResults`. This is a small (~150 line) sibling of `public-content.ts` that wraps the existing `createSemanticSearch` / `runSemanticSearchAction` lifecycle, holds the `PermCtx` for the duration of the API-key actor (the internal `createAction` rejects non-`user` actors at `ai-actions.ts:79-81`), and maps the public-API success response to the public Zod schema (with `citations[]` enriched by joining `ai_action_events`).

**Rationale**: The split is intentional. `public-content` today has zero AI code (verified by reading the full file: 1021 lines, no imports from `@/server/ai/`). Adding AI search / Q&A to it would mix concerns. The new `public-ai.ts` is justified by:
- The existing internal AI-action routes (`apps/web/app/api/ai/...`) already form a coherent "AI surface" with their own `ai-actions` audit pattern, their own status / events endpoints, and their own SSE stream (`apps/web/app/api/ai/actions/[id]/events/route.ts`).
- The spec's `submit_semantic_search` and `get_semantic_search_results` are 1:1 mirrors of `POST /api/ai/searches` and `GET /api/ai/actions/{id}` (minus the session-only restrictions).
- A sibling facade matches the codebase's `ai-actions` / `ai-retrieval` / `ai-question` service split; the public surface should follow the internal structure.

**Alternatives considered**:

- **Add everything to `public-content`**: rejected — the architectural guard is intentionally permissive about new content endpoints, but mixing AI-action lifecycle (which is its own subsystem with its own error codes, retention, and event model) into a content facade is a coupling that the spec's P10 explicitly discourages.
- **Create a single new `public-ai.ts` for everything (including frontmatter / links)**: rejected — frontmatter and links are content-derived, not AI-derived. The P10 "explicit over implicit" rule says facades should match subsystem boundaries, not feature groupings.
- **Skip the facade entirely and have the route handlers call internal services directly**: rejected — the architectural guard at `public-route-architecture.test.ts:17-31` would fail (it forbids `import * as publicContent from '@/server/services/public-content'`-style facade usage, but also prohibits other patterns; the guard is a *positive* check, not a negative one). More importantly, the facade is where the per-item result formatting, the dry-run path, the frontmatter parsing, and the permission filter live — splitting that into route handlers would re-implement the public-content-shape logic in 7+ places.

**Verification**: After implementation, the architectural guard test must still pass with no source modifications (it asserts that the only import pattern is `@/server/services/public-content` or a sibling). The new `public-ai.ts` is added to the allowed set; `public-route-architecture.test.ts:17-31` is extended to permit `import * as publicAi from '@/server/services/public-ai'` alongside the existing one.

---

## Notes on inputs we deliberately did NOT consult

- **`docs/architecture/mandates.md`** — not opened in research; the plan phase relies on the constitution's one-line invariants (which were copied into the Constitution Check table). If a plan-stage reader needs the underlying detail, the constitution's index table cites the file.
- **Frontend routing** — the spec is server-side-only, so the Frontend Routing & URL Contract mandate is not in scope. The `AGENTS.md` reference to `specs/009-ai-memory-layers/plan.md` is updated to point to this spec by the agent-context-update hook (see Decision 6's verification step).
- **Meilisearch** — the spec's search enhancement is exclusively about frontmatter filters and the semantic path; the existing PostgreSQL FTS path is unchanged. Meilisearch is mentioned in the constitution as an *optional* path; this spec does not adopt it.

## How to read this file

The plan is intentionally short. Every claim in `plan.md` (file:line, behavior, table shape) is sourced from one of the six decisions above. If a Phase 1 artifact (`data-model.md`, `contracts/*.md`, `quickstart.md`) references a file path or behavior, the underlying decision is here.
