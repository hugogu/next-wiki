# Feature Specification: AI Curation API

**Feature Branch**: `010-ai-curation-api`
**Created**: 2026-07-04
**Status**: Draft
**Input**: User description: "按你推荐的落地顺序，我们先把第一步，第二步的链接、遍历和批量操作这些内容分析，做成 spec."
**Depends on**: 004-system-ai-support (embedding index, AI action lifecycle), 005-content-import-export (frontmatter parser round-trip), 007-public-wiki-api (v1 REST adapter contract, `withPublicApi`, `public-content` facade, existing `searchPages`).

> Scope note: This spec covers the search / frontmatter / links / batch layer of the AI curation roadmap. AI Q&A, summarization, working memory, content health, dedup modes, and analysis-bundle export are explicitly **out of scope** and will be addressed by sibling specs.

## Update history

- **2026-07-04 (A) — search split**: keyword and semantic search are modeled as two separate endpoints (`GET /api/v1/search/pages` + `POST /api/v1/search/semantic` + `GET /api/v1/search/semantic/{id}`) rather than one endpoint with a `mode` flag, because their lifecycle, cost, and permission shapes are incompatible. Design rationale recorded in the *Design rationale* subsection below.
- **2026-07-04 (B) — permission hardening**: FR-009 added as a dedicated cross-endpoint permission-filter requirement (keyword and semantic both filter at query time, no existence disclosure); pre-existing pgvector-without-permission gap in `ai-retrieval.retrieve()` is documented in Assumption 9 and is fixed as part of this spec; SC-004 split into endpoint-level and result-level guarantees; US-1 scenario 3 strengthened and US-3 scenario 7 added.
- **2026-07-04 (C) — speckit review pass**: frontmatter and Update history aligned with the 007/008 convention; stale cross-references and counts in the requirements checklist updated to match the post-renumber FR map; minor implementation-detail leakage in FR-009 trimmed (file:line references consolidated into Assumption 9).

## Summary

Enable AI agents and external automation to **organize and analyze** a next-wiki knowledge base through a small, coherent set of v1 capabilities that extend the existing Public Wiki Content API:

1. **Keyword search (extended)** — the existing `GET /api/v1/search/pages` endpoint gains frontmatter-based filters; response shape, scoring, and pagination remain byte-compatible with current callers.
2. **Semantic search (new endpoint)** — a separate `POST /api/v1/search/semantic` + `GET /api/v1/search/semantic/{id}` pair that submits an asynchronous search action and returns grounded citations (chunk-level). Synchronous keyword and asynchronous semantic are deliberately modeled as **two distinct resources**, not as one endpoint with a `mode` flag.
3. **Structured frontmatter** — page responses surface frontmatter as a queryable JSON object; list/search endpoints accept frontmatter-based filters.
4. **Link graph traversal** — first-class outbound links (wiki-links, markdown links, frontmatter `related_pages`) and bounded multi-hop neighborhood queries.
5. **Bulk write operations** — atomic batch update and batch soft-delete, both with `dry_run` support.

### Design rationale — why keyword and semantic are two endpoints, not one

Keyword and semantic search have fundamentally different shapes:

| Concern | Keyword | Semantic |
|---|---|---|
| Lifecycle | Synchronous request → response | Submit → poll for action → result |
| Response envelope | Ranked page list, final | Action resource with status, expires_at, items only on `succeeded` |
| Permission | `view` scope | `view` + new `ai.read` scope |
| Cost | Zero (database only) | Embedding API call per query |
| Failure surface | DB / permission errors | DB / permission / index-not-ready / model / expired |
| Observability | One-shot | Long-running action with TTL and partial results |

Conflating them under a single endpoint with a `mode` discriminator would force every client to handle two unrelated response shapes and two unrelated lifecycle contracts from the same verb. Per the project's REST and OpenAPI conventions, these are modeled as separate resources with separate Zod schemas, separate OpenAPI operation IDs, and separate MCP tools — exactly as the codebase already separates synchronous content reads from asynchronous AI actions elsewhere (e.g., 004 / `ai_actions`).

All capabilities must respect existing read permissions, fail closed for unauthorized actors, and follow the project's synchronous / asynchronous contract (any work that touches embedding calls or moves more than one revision MUST run through the existing asynchronous AI-action pipeline — no synchronous model calls inside an HTTP request handler).

## User Scenarios & Testing *(mandatory)*

### User Story 1 — Find Pages by Keyword (Priority: P1)

As an AI agent running on top of next-wiki, I want a fast synchronous keyword search over page path, title, and Markdown source, so that I can locate exact terms and known phrases without any AI infrastructure dependency.

**Why this priority**: Keyword search is the foundation of every AI workflow and the only search mode that works on a default deployment with no AI provider configured. It is the smallest independently useful addition to the existing v1 surface and must remain zero-cost.

**Independent Test**: With an API key that has `view` scope, call `GET /api/v1/search/pages?q=...` and confirm the response shape, scoring, and pagination are byte-compatible with the current implementation (regression suite passes). Then call the same endpoint with a frontmatter filter (`filter[tag]=architecture`) and confirm the result set is narrowed accordingly while the response envelope is unchanged.

**Acceptance Scenarios**:

1. **Given** an API key with `view` scope and a query, **When** the agent calls `GET /api/v1/search/pages?q=<term>`, **Then** the response is synchronous, contains readable pages matching the query, and is byte-compatible with the current response shape.
2. **Given** an API key with `view` scope and a frontmatter filter, **When** the agent calls `GET /api/v1/search/pages?q=<term>&filter[tag]=architecture`, **Then** only pages whose parsed frontmatter contains `architecture` are returned, and the response envelope is otherwise unchanged.
3. **Given** an API key with `view` scope but a page that the key cannot read (because the key's actor role / space membership / anonymous-read policy disallows it), **When** that page would otherwise match the keyword query or the frontmatter filter, **Then** the page does not appear in the result, the `excerpt` does not contain any text from it, and the response gives no indication that the page exists.

---

### User Story 2 — Filter and Aggregate by Frontmatter (Priority: P1)

As an AI agent organizing the wiki, I want to filter pages by their frontmatter fields (tag, status, owner, related pages) and receive frontmatter as structured data in every page response, so that I can group, audit, and reorganize content without re-parsing Markdown.

**Why this priority**: Frontmatter-by-convention is already the de facto metadata system (used by the import/export pipeline and recommended by the MCP server README's memory conventions). Without structured access, AI agents must repeatedly re-parse YAML, which is expensive, error-prone, and breaks abstraction.

**Independent Test**: Create pages with varied frontmatter (`tags`, `status`, `owner`, `related_pages`). Call list endpoints with `filter[tag]=architecture`, `filter[status]=draft`, `filter[owner]=alice`. Confirm only matching pages are returned. Confirm page and revision responses include a parsed `frontmatter` JSON object that round-trips with the Markdown source.

**Acceptance Scenarios**:

1. **Given** pages with frontmatter `tags`, **When** the agent lists or searches with `filter[tag]=architecture`, **Then** only pages whose parsed frontmatter contains that tag are returned.
2. **Given** a page that has frontmatter, **When** the agent reads it via the public API, **Then** the response includes both the raw Markdown and a parsed `frontmatter` JSON object; the two views are consistent (the frontmatter in the JSON is the same as the frontmatter extracted from the Markdown).
3. **Given** a page that has no frontmatter, **When** the agent reads it, **Then** `frontmatter` is `null` (not an empty object, not absent) so the agent can branch on presence.
4. **Given** a filter that combines frontmatter and path predicates, **When** the agent lists pages, **Then** all predicates are AND-combined and pagination continues to operate correctly across the combined filter.
5. **Given** a page whose frontmatter contains a non-scalar value (array, nested object), **When** the agent reads it, **Then** the value is returned as a JSON-safe structure without truncation, throwing, or stringification.

---

### User Story 3 — Find Pages Semantically with Grounded Citations (Priority: P1)

As an AI agent that needs to answer natural-language questions about the wiki, I want a separate semantic-search endpoint that submits an asynchronous search and lets me poll for grounded citations, so that I can retrieve relevant content even when the literal words do not match and cite my sources.

**Why this priority**: Semantic search is the AI-native path that fulfills Constitution P3 (the wiki as portable AI memory with grounded citations). It must not share an endpoint with synchronous keyword search because the two have different lifecycle, cost, and permission shapes — see the design rationale above.

**Independent Test**: With an API key that has `view` + `ai.read` scope, submit `POST /api/v1/search/semantic` with a query whose literal words do not appear in any page and confirm the response is an action resource (id, status `queued`, expires_at). Poll `GET /api/v1/search/semantic/{id}` until `succeeded` and confirm results reference page, revision, chunk, and content hash. With an API key that has only `view`, submit the same and confirm a permission error that does not reveal index state.

**Acceptance Scenarios**:

1. **Given** an API key with `view` + `ai.read` scope and an active embedding index, **When** the agent submits `POST /api/v1/search/semantic` with a natural-language query, **Then** the response is synchronous and contains an action resource (id, status `queued`, created_at, expires_at); the response does NOT yet contain page results.
2. **Given** a previously submitted semantic search, **When** the agent polls `GET /api/v1/search/semantic/{id}`, **Then** the action resource reflects current status (`queued` / `running` / `succeeded` / `failed` / `expired`) and, when status is `succeeded`, includes `items[]` with at least `pageId`, `path`, `title`, `score`, and a `citations[]` array carrying `chunkId`, `revisionId`, `contentHash`.
3. **Given** an API key with only `view` scope, **When** the agent submits `POST /api/v1/search/semantic`, **Then** the request is rejected with a permission error that does not disclose whether the index exists or is ready.
4. **Given** an API key with `view` + `ai.read` scope but no active embedding index, **When** the agent submits `POST /api/v1/search/semantic`, **Then** the request is rejected with a domain-specific `INDEX_NOT_READY` error and no action is created.
5. **Given** a semantic search action whose TTL has elapsed, **When** the agent polls for it, **Then** the response carries `status: expired` and no items; clients MUST NOT be able to extend or reset the TTL.
6. **Given** a failed semantic search, **When** the agent polls for it, **Then** the response carries `status: failed` with a non-leaking error code so the agent can decide whether to retry, surface to the user, or fall back to keyword search.
7. **Given** an API key with `view` + `ai.read` scope and a query that semantically matches several pages, some of which the key cannot read, **When** the agent polls the action and it reaches `succeeded`, **Then** `items[]` contains only pages the key can read, no `chunkId` from an unreadable page appears in any `citations[]`, the count of items returned MAY be less than the requested `limit` (because filtered candidates are dropped, not back-filled), and the response gives no indication that filtered pages exist.

---

### User Story 4 — Traverse the Link Graph (Priority: P2)

As an AI agent analyzing the knowledge base, I want first-class outbound links and bounded multi-hop neighborhood queries, so that I can build a knowledge map, identify dead ends, and surface related content without scraping Markdown myself.

**Why this priority**: Outbound links are the dual of the existing `backlinks` endpoint and are needed for graph analysis, broken-link detection, and reorganization planning. Without outbound links, AI agents can only know what points *to* a page, not what a page points *from*.

**Independent Test**: Create a small graph (A → B → C, A → D, D → A) and call the outbound-links endpoint on A, then call the neighborhood endpoint at depth 2. Confirm classification (wiki-link vs. markdown link vs. frontmatter `related_pages`), depth-bounded traversal, cycle termination, and that unreadable targets are filtered.

**Acceptance Scenarios**:

1. **Given** a page with wiki-links, standard Markdown links, and a `related_pages` frontmatter entry, **When** the agent calls the outbound-links endpoint, **Then** all three categories are returned, each tagged with a discriminator so the agent can decide whether to follow or treat as soft reference.
2. **Given** the agent requests a multi-hop neighborhood at depth ≤ 3, **When** the response is returned, **Then** every visited page respects the caller's read permission — unreadable targets are omitted, never listed with a stub.
3. **Given** the wiki contains a cycle (A → B → A), **When** the agent requests depth 2 from A, **Then** A appears at most once per depth tier and the traversal terminates within the depth bound.
4. **Given** a link target that has been soft-deleted, **When** the agent requests outbound links, **Then** soft-deleted targets are reported as a separate `dangling` category, not omitted silently.
5. **Given** a wiki with up to 10,000 pages and up to 5 outbound links per page, **When** the agent requests depth-2 traversal from one page, **Then** the response is returned within one second on a default deployment.

---

### User Story 5 — Bulk Write Operations (Priority: P2)

As an AI agent reorganizing the knowledge base, I want to apply the same change to many pages in one batch (rename, retag, change path, soft-delete), with a dry-run preview and per-item reporting, so that I can complete large reorganization tasks safely and efficiently.

**Why this priority**: Without batch writes, any large reorganization is an N-step sequential script that is slow, fragile, and audit-hostile. Batch endpoints turn "rename every page under `legacy/` to `archive/`" into one transaction with one audit trail.

**Independent Test**: With an Editor or Admin API key, call batch update on 20 pages to add a `tags: [reorganized]` frontmatter key, then call the same batch with `dry_run=true` and confirm a preview is returned without state change. Call batch soft-delete on 10 pages, confirm each is soft-deleted with a new revision (P8), and confirm an attempted batch by a Reader-scoped key is denied at the batch level.

**Acceptance Scenarios**:

1. **Given** an Editor or Admin key and up to 50 pages in the batch, **When** the agent submits a batch update (title / path / frontmatter patch), **Then** each affected page receives a new revision capturing the change, the response lists per-item success or failure, and the operation is atomic per page.
2. **Given** any batch request with `dry_run=true`, **When** the agent submits it, **Then** the response contains a per-item preview of what would change, no database state is mutated, and no revisions are created.
3. **Given** a batch that includes both valid and invalid items (for example, a path collision on one item), **When** the agent submits it, **Then** valid items succeed, invalid items fail with a specific error, and the response makes the partial outcome unambiguous.
4. **Given** a Reader-scoped key, **When** the agent submits any batch write, **Then** the request is rejected at the batch boundary without inspecting individual items (no information disclosure about target pages).
5. **Given** a batch update that changes page paths, **When** the operation completes, **Then** internal links from other pages are not auto-rewritten in this spec (link rewrite is a separate, future capability), but the affected pages' backlinks are queryable so the agent can decide what to update.
6. **Given** a batch soft-delete, **When** the operation completes, **Then** every targeted page is soft-deleted (P8 — no hard delete), the deletion is reflected in subsequent list / search / tree queries, and the page remains recoverable through the revision history.

---

### Edge Cases

- **Empty wiki (0 pages)**: keyword endpoint returns empty list; semantic submit is still rejected with `INDEX_NOT_READY` rather than succeeding with zero results (otherwise success would mask configuration issues).
- **Page with frontmatter containing non-UTF8 or YAML-unsafe values**: parser must reject / sanitize safely; never echo raw YAML back as JSON.
- **Path collision in batch update**: the colliding item fails, others succeed; the response identifies the winner (existing path owner) without exposing its content.
- **Cycle in link graph**: traversal terminates at the requested depth bound; visited set is per-request, never global.
- **Soft-deleted link target**: surfaced as `dangling`, not omitted.
- **Permission downgrade between batch submission and execution**: each item is re-checked at execution time; late revocations cause that item to fail without rolling back already-completed items.
- **Concurrent batch updates touching the same page**: second writer sees a stale revision id and is rejected per page, consistent with single-page optimistic concurrency.
- **Embedding provider outage during semantic search**: action is marked `failed` with a non-leaking error; the agent can retry by submitting a new action.
- **Frontmatter filter referencing a key that exists on zero pages**: returns empty list, not 404.
- **Outbound-links on a soft-deleted page**: only the actor with `read_draft` for that page may call; otherwise the request is treated as "page not readable" (consistent with existing read endpoints).
- **Polling a semantic action that the caller never created**: 404 with no information disclosure about whether the action exists for another caller.
- **Semantic action submitted while index is being rebuilt**: the action MUST either be queued against the currently-active generation or rejected with `INDEX_NOT_READY`; mixed-generation results are forbidden.
- **Semantic result count < requested limit due to permission filtering**: when the pgvector top-K contains pages the caller cannot read, those are dropped from `items[]` and the response may return fewer than `limit` items; the agent MUST NOT infer that filtered pages exist or that the index is sparse.
- **Key with `ai.read` but narrower `view` (multi-space future)**: if a future change introduces per-space read scope, semantic results MUST be filtered to spaces the key can read; the current single-space deployment trivially satisfies this (the only space is either readable or not).

## Requirements *(mandatory)*

### Functional Requirements

#### Search — keyword (synchronous)

- **FR-001**: `GET /api/v1/search/pages` MUST remain a synchronous keyword-search endpoint. The response shape, scoring, and pagination MUST be byte-compatible with the current implementation for callers that supply no new parameters.
- **FR-002**: The keyword endpoint MUST additionally accept the optional frontmatter filters `filter[tag]`, `filter[status]`, `filter[owner]`, `filter[has_frontmatter]` (FR-011..FR-014). These extend the result predicate but MUST NOT change the response envelope.
- **FR-003**: The keyword endpoint MUST NOT introduce any asynchronous lifecycle, action identifier, polling URL, or model invocation. All work happens within the request.

#### Search — semantic (asynchronous)

- **FR-004**: `POST /api/v1/search/semantic` MUST be a separate endpoint that accepts `q`, `limit`, `pathPrefix`, `scope`, and the frontmatter filters. It MUST return synchronously with a search-action resource containing at least `id`, `status` (`queued`), `created_at`, and `expires_at`. It MUST persist the work for asynchronous execution and MUST NOT invoke any model synchronously inside the request handler.
- **FR-005**: `GET /api/v1/search/semantic/{id}` MUST return the search-action resource with current status (`queued` / `running` / `succeeded` / `failed` / `expired`). When status is `succeeded`, the response MUST include `items[]` where each item carries at least `pageId`, `path`, `title`, `score`, and a `citations[]` array with `chunkId`, `revisionId`, `contentHash` so the agent can ground its answers (Constitution P3).
- **FR-006**: Both semantic endpoints MUST be gated by a new `ai.read` API-key scope; a key lacking it MUST be rejected with a permission error that does not reveal index state, configuration, or the existence of pages.
- **FR-007**: If no active embedding index is available, `POST /api/v1/search/semantic` MUST return a domain error (`INDEX_NOT_READY`); the endpoint MUST NOT silently fall back to the keyword endpoint or return empty results.
- **FR-008**: Search-action resources MUST expire consistent with existing AI action retention. Once expired, `GET /api/v1/search/semantic/{id}` MUST return `status: expired` with no items; clients MUST NOT be able to extend or reset the TTL.
- **FR-009 (Permission filtering — applies to both search endpoints)**: Both `GET /api/v1/search/pages` and the semantic-search pair MUST filter their result sets by the caller's read permission at query time (not deferred to the client). Specifically:
  - The keyword endpoint MUST continue to enforce the per-page read filter that the existing public-content layer already applies today; this is regression-safe — the spec requires the existing behavior to remain in place as filters are added.
  - The semantic endpoints MUST additionally enforce a per-page read filter on every `item` in `items[]` AND on every chunk reference in every `citations[]` entry. The filtering MUST happen after vector retrieval but before the response is materialized, and it MUST be applied uniformly whether the caller supplied frontmatter filters, path filters, scope, or none.
  - Pages the caller cannot read MUST NOT appear in any list. The response MUST give no indication that filtered pages exist (no 404-vs-empty distinction, no count of filtered items, no error codes that depend on what was filtered).
  - The shared retrieval function used by both the new public semantic endpoint and the existing in-app Q&A flow MUST be updated to take a permission context and apply this filter; this closes a pre-existing gap where the in-app Q&A vector path did not consult read permission (the in-app Q&A full-context path already does — see Assumption 9 for the reference implementation and the Q&A regression test this fix must ship with).
- **FR-010**: The keyword endpoint and the semantic endpoints MUST have distinct OpenAPI operation IDs, distinct Zod request / response schemas, and distinct MCP tool names. They MUST NOT share a single OpenAPI operation or a single Zod discriminated-union schema.

#### Structured frontmatter

- **FR-011**: Page read, list, search, tree, and revision responses MUST include a parsed `frontmatter` field (JSON object or `null`); the parser MUST be shared with the existing import/export pipeline to guarantee round-trip parity.
- **FR-012**: `frontmatter` MUST be re-extracted server-side from the Markdown source at response time so that callers always see a value consistent with the Markdown they would receive in the same response.
- **FR-013**: `GET /api/v1/pages` and `GET /api/v1/search/pages` MUST accept `filter[tag]`, `filter[status]`, `filter[owner]` (multiple values combined with OR within the same key, AND across keys) and MUST return only pages whose parsed frontmatter contains the value. `filter[has_frontmatter]` (boolean) MUST allow filtering for pages with or without any frontmatter.
- **FR-014**: Frontmatter filters MUST respect read permission — pages that are unreadable to the caller MUST NOT appear in the result even if they match the filter. Because frontmatter filters are applied on top of the existing `listPagesInternal` permission filter, this is regression-safe: any new frontmatter predicate inherits the same per-page visibility check.

#### Link graph

- **FR-015**: `GET /api/v1/pages/{id}/links` MUST return the page's outbound links classified by source: `wiki` (Obsidian-style `[[wikilink]]`), `markdown` (standard Markdown link with relative or absolute path), and `frontmatter` (entry under a designated key such as `related_pages`).
- **FR-016**: Each link entry MUST carry at least: `target_path` (or `target_page_id` if resolvable), `link_text` (the visible label), and `source` (the discriminator above).
- **FR-017**: Targets that resolve to a known page MUST be enriched with `target_page_id` and `target_status` (published / draft / deleted); targets that do not resolve MUST be reported in a `dangling` array rather than silently dropped.
- **FR-018**: `GET /api/v1/graph/neighbors?node={id}&depth={1..3}&direction={out|in|both}` MUST return the multi-hop neighborhood; `depth` outside 1..3 MUST be rejected; cycles MUST NOT cause unbounded traversal.
- **FR-019**: Every link and neighborhood response MUST filter nodes the caller cannot read; unreadable targets MUST be reported as `dangling` only if the link itself was visible (e.g., explicit reference in readable content); pages the caller cannot see at all MUST NOT appear as nodes.

#### Bulk write operations

- **FR-020**: `POST /api/v1/pages/batch/update` MUST accept up to 50 items, each carrying `pageId`, optional `title`, optional `path`, optional `frontmatter` patch, and a `baseRevisionId` for optimistic concurrency.
- **FR-021**: `POST /api/v1/pages/batch/delete` MUST accept up to 50 `pageId` values and soft-delete each (P8 — no hard delete).
- **FR-022**: Both batch endpoints MUST accept `dry_run=true`; in dry-run, the response is a per-item preview with the predicted new state and any validation error, and NO database write or revision is created.
- **FR-023**: Batch operations MUST be atomic per page (each item either fully succeeds or fully fails) but MUST NOT be transactional across items — partial outcomes are reported explicitly with per-item success / failure.
- **FR-024**: Any successful title / path / frontmatter change MUST create a new revision (P8 — version everything); the batch response MUST return the new revision id per affected page.
- **FR-025**: Both batch endpoints MUST be gated by the existing `edit` and `delete` scopes (Editor / Admin API keys); Reader keys MUST be rejected at the batch boundary.

#### Cross-cutting

- **FR-026**: All new endpoints MUST be added to the next-open-api documentation, with request / response schemas derived from shared Zod definitions.
- **FR-027**: All new endpoint operations MUST be exposed as MCP tools in `@next-wiki/mcp-server` following the existing naming convention (`search_*`, `list_*`, `get_*`, `batch_*`). MCP tool names for this spec: `search_wiki` (existing keyword endpoint, extended with frontmatter filters — name preserved for backward compatibility), `submit_semantic_search`, `get_semantic_search_results`, `get_page_outbound_links`, `get_neighborhood`, `batch_update_pages`, `batch_soft_delete_pages`, `list_pages` (extended with filters).
- **FR-028**: Every new endpoint MUST respect the existing `withPublicApi` adapter contract — uniform error envelope, audit logging, pagination where applicable.
- **FR-029**: No new database tables are introduced by this spec; all data lives on existing tables (`pages`, `page_revisions`, `ai_knowledge_chunks`, `ai_actions`, etc.) and is derived at query time or via existing jobs.
- **FR-030**: No new default runtime dependency is introduced (Constitution P1); semantic search and frontmatter parsing reuse already-shipped components.

### Key Entities *(include if feature involves data)*

This spec introduces **no new entities**. It reuses:

- **Page / PageRevision** — existing. Frontmatter is parsed from `page_revisions.content_source` at response time.
- **AiIndexGeneration / AiKnowledgeChunk** — existing. Reused by semantic search for vector retrieval and citations.
- **AiAction / AiActionEvent** — existing. The lifecycle of a semantic search action is implemented as an `ai_actions` row with `feature='semantic_search'`, but exposed via the dedicated public-API-shaped endpoints above (so the v1 contract stays decoupled from internal AI action naming).

## Success Criteria *(mandatory)*

### Measurable Outcomes

- **SC-001**: An AI agent can complete a "find pages about X and list their tags" workflow in ≤ 3 API calls (one keyword or semantic search, one filtered list) without parsing any Markdown client-side.
- **SC-002**: An AI agent can rename and retag up to 50 pages in one batch request, and confirm the change with one subsequent read; the round-trip (batch submit + verify read) completes in ≤ 5 seconds on a default deployment.
- **SC-003**: A 2-hop neighborhood traversal on a wiki of ≤ 10,000 pages completes in ≤ 1 second on a default deployment.
- **SC-004**: 100% of new endpoints are permission-gated at TWO levels: (a) endpoint-level — unauthorized callers receive the standard error envelope without disclosing existence of resources, index state, or pages; (b) result-level — every item in every returned list (keyword `items[]`, semantic `items[]`, semantic `citations[]`, link `links[]` / `dangling[]`, neighborhood, batch results) reflects only what the caller can read, with no existence disclosure for filtered items.
- **SC-005**: 0% regression: existing `/api/v1/search/pages` callers receive byte-compatible responses (no new mandatory parameters, no envelope change, same scoring, same pagination); existing `search_wiki` MCP tool behavior is preserved when called without new parameters.
- **SC-006**: 100% of batch write operations support `dry_run=true` and return a non-mutating preview before any state change.
- **SC-007**: 100% of operations on this spec's endpoints complete without invoking a model synchronously inside an HTTP request handler (Constitution P7).
- **SC-008**: The keyword and semantic search endpoints MUST be discoverable as separate operations in the OpenAPI document (distinct `operationId`, distinct request / response schemas) and MUST NOT be reachable via a shared `mode=` flag on either endpoint.

## Assumptions

These defaults are documented so the plan stage can challenge them if needed:

1. **AI scope name**: `ai.read` is the new API-key scope for semantic search and (future) AI read operations; it is intentionally separate from `manage_ai` so an external agent cannot mutate AI configuration.
2. **Frontmatter parser**: YAML frontmatter delimited by `---` lines; the parser used by `005-content-import-export` is reused verbatim, guaranteeing round-trip parity with imports and exports.
3. **Frontmatter key conventions**: `tags` (array), `status` (string), `owner` (string), `related_pages` (array of paths) — these are the de facto conventions from the MCP server README; unknown keys are preserved verbatim in the response.
4. **Link extraction rules**:
   - `[[wikilink]]` and `[[wikilink|alias]]` → `source: wiki`
   - `[text](relative-or-absolute-path)` whose target matches a known wiki path → `source: markdown`
   - `[text](https://...)` external links are excluded from outbound-links (returned only as a separate `external` array)
   - frontmatter key `related_pages` → `source: frontmatter`
5. **Batch size cap**: 50, aligning with the existing `batch_create_pages` endpoint; larger batches must be split by the caller.
6. **Frontmatter filter values**: treated as exact string match within an array element; prefix / regex / fuzzy matching is out of scope for this spec.
7. **Async semantic results**: the action lifecycle reuses the existing `ai_actions` table internally; the public API shape (`/api/v1/search/semantic` and `/api/v1/search/semantic/{id}`) is a stable contract independent of internal action naming. The `ai_actions` retention setting (`ai_settings.artifact_retention_hours`) governs how long semantic results remain pollable.
8. **No new tables**: frontmatter is derived, links are derived, batch operations reuse existing revision machinery. If later review finds a need to denormalize (e.g., for performance), it becomes a new spec with a migration.
9. **Pre-existing semantic-search permission gap (must be fixed by this spec)**: the current pgvector retrieval path in `apps/web/src/server/ai/retrieval/vector-search.ts:32-52` does NOT consult the caller's read permission — its SQL `WHERE` clause only checks `deleted_at`, `current_published_version_id`, and `revision.status='published'`. The function `retrieve()` in `apps/web/src/server/services/ai-retrieval.ts:34` accepts no `PermCtx` and so cannot filter results. In the current default single-space deployment this is benign (every authenticated user can read every page), but it is a real data leak the moment API keys, multi-space, or per-page ACLs are introduced. The full-context path in `full-context.ts:55-58` already does the right thing (`can(ctx, 'read', { kind: 'page_list' }, { anonymousRead })`) and is the reference for the fix. This spec REQUIRES the shared `retrieve` function to take a `PermCtx` and apply a per-page read filter, so that the new public-API semantic endpoint and the existing Q&A flow both ship the corrected behavior together. Regression test: a Q&A question whose top-K matches an unreadable page MUST NOT surface that page in citations.
10. **`ai.read` API-key scope → permission action mapping**: the new `ai.read` API-key scope (FR-006) maps to the existing `use_ai_search` permission action in `apps/web/src/server/permissions/index.ts`. It is a *new* API-key scope (alongside the existing `view` / `create` / `edit` / `delete` / `storage` / `preferences` / `transfers` / `share` / `run` scopes) and is NOT one of the role-level actions that an API key can never hold (`manage_users` / `manage_ai` / `manage_appearance` / `use_ai_search` / `use_ai_qa` / `use_ai_text_optimization` / `use_ai_image_generation`). When in-app Q&A or other AI features ship their public counterparts in sibling specs, those endpoints will share the same `ai.read` scope so that an external agent granted "AI read" can use all of them without per-endpoint scope grants.

## Out of Scope (deferred to sibling specs)

- AI Q&A endpoint (`/api/v1/ai/qa`) and its MCP tool
- AI summarization endpoint (subtree overview, ad-hoc digest)
- Working memory tables (`ai_working_notes`, `ai_topic_summaries`, `ai_curation_runs`) — future `009-ai-memory-layers` follow-ups
- Content health / staleness endpoints (`/api/v1/health/pages`)
- Multi-mode duplicate detection (hash, MinHash, normalized-text) — extension of `find_similar`
- Analysis-bundle export (NDJSON / JSON Lines dump of metadata for offline analysis)
- Auto-rewriting of internal links when pages are renamed
- Bulk move across path prefixes as a single primitive (callers compose it from batch update today)
- Per-call LLM-based link classification (e.g., "is this link authoritative") — heuristic classification only in this spec