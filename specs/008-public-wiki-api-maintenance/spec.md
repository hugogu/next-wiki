# Feature Specification: Public Wiki API Maintenance & Intelligence

**Feature Branch**: `007-public-wiki-api`
**Created**: 2026-07-02
**Status**: Draft
**Depends on**: 007-public-wiki-api (v1 REST API + MCP Server)

## Context

Feature 007 delivered a stable Public Wiki Content API with page CRUD, revision
history, search, a directory tree, and an MCP Server. However, the API is
**append-only with no cleanup and no referential awareness**. An AI agent (or
human automation) can create pages but cannot safely delete, reorganize, detect
duplicates, review changes at a glance, or understand aggregate wiki health.

This feature closes the P0 (core maintenance gaps) and P1 (efficiency at scale)
gaps identified during the post-007 API surface review:

**P0 — Core maintenance:**
- Delete / archive (soft-delete) pages
- Backlinks ("what links here") for referential integrity
- Revision diff (structured change view between two versions)

**P1 — Efficiency at scale:**
- Batch create pages (atomic subtree creation)
- Wiki stats / overview (aggregate health metrics)
- Duplicate detection (similarity-based pre-creation check)

## User Scenarios & Testing *(mandatory)*

### User Story 1 — Delete / Archive Pages (Priority: P0)

As an Editor or Admin using an external tool or AI agent, I want to soft-delete
pages that are outdated, duplicated, or no longer needed, so that I can keep the
wiki clean and prevent knowledge-base rot without losing revision history.

**Acceptance Scenarios**:

1. **Given** an Editor or Admin key and a page exists, **When** the key sends
   `DELETE /v1/pages/{id}`, **Then** the page is soft-deleted (sets
   `deleted_at`), disappears from default list/search/tree responses, and a 204
   is returned.
2. **Given** a soft-deleted page, **When** the key lists pages with
   `status=all`, **Then** the deleted page is visible with `status: "deleted"`
   and can be restored.
3. **Given** a Reader key, **When** it attempts to delete a page, **Then** the
   operation is denied with 403.
4. **Given** a page that has inbound links from other pages, **When** the key
   deletes it, **Then** the deletion succeeds and the backlinks endpoint on the
   deleted page returns the referencing pages (so the caller can update them).

### User Story 2 — Backlinks (Priority: P0)

As an AI agent or automation tool, I want to query which pages link to a target
page, so that I can maintain referential integrity before deleting, renaming, or
restructuring the wiki.

**Acceptance Scenarios**:

1. **Given** pages A and B both contain Markdown links to page C, **When** the
   key calls `GET /v1/pages/{id}/backlinks` for C, **Then** the response lists
   A and B with their paths, titles, and the link text used.
2. **Given** a page with no inbound links, **When** the key queries backlinks,
   **Then** an empty list is returned.
3. **Given** a page that the caller cannot read, **When** the key queries its
   backlinks, **Then** a 404 is returned (no existence disclosure).

### User Story 3 — Revision Diff (Priority: P0)

As an AI agent reviewing change history, I want a structured diff between two
revisions, so that I can understand what changed without downloading and
comparing two full Markdown documents.

**Acceptance Scenarios**:

1. **Given** a page with revisions v1 and v3, **When** the key calls
   `GET /v1/pages/{id}/revisions/{version}/diff?against={fromVersion}`, **Then**
   the response contains a unified diff string and a structured list of added /
   removed / unchanged line ranges.
2. **Given** two identical revisions, **When** the key requests a diff, **Then**
   the response indicates no changes (empty diff, zero additions/removals).
3. **Given** a version that doesn't exist, **When** the key requests a diff,
   **Then** a 404 is returned.

### User Story 4 — Batch Create Pages (Priority: P1)

As an AI agent building a knowledge base, I want to create multiple pages in a
single request, so that I can efficiently bootstrap a subtree without N round
trips and with transactional consistency.

**Acceptance Scenarios**:

1. **Given** an Editor or Admin key, **When** the key sends
   `POST /v1/pages/batch` with up to 50 page definitions, **Then** all pages are
   created in a single transaction, each with its first draft revision, and the
   response lists every created page with its id, path, and revision id.
2. **Given** a batch where one page path already exists, **When** the key sends
   the batch, **Then** the entire batch is rejected with a 409 conflict and no
   pages are created (atomic).
3. **Given** a batch exceeding the maximum size, **When** the key sends it,
   **Then** a 422 validation error is returned before any processing.

### User Story 5 — Wiki Stats / Overview (Priority: P1)

As an AI agent or administrator performing periodic maintenance, I want an
aggregate overview of wiki health, so that I can identify stale pages, drafts
needing review, and overall knowledge-base coverage without paginating through
every page.

**Acceptance Scenarios**:

1. **Given** a wiki with published pages, drafts, and deleted pages, **When**
   the key calls `GET /v1/stats`, **Then** the response includes total counts
   by status, recent activity (pages created/updated in the last 7 days), and
   the top-level directory breakdown.
2. **Given** a wiki with orphan pages (not linked from any other page), **When**
   the key calls `GET /v1/stats?include=orphans`, **Then** the response includes
   a list of orphan page paths.
3. **Given** a Reader key, **When** it calls stats, **Then** only published-page
   counts are returned (drafts are excluded).

### User Story 6 — Duplicate Detection (Priority: P1)

As an AI agent about to create a page, I want to check whether similar pages
already exist, so that I can avoid creating duplicates and the "重复和混乱"
problem.

**Acceptance Scenarios**:

1. **Given** a wiki with a page titled "Payment Routing", **When** the key calls
   `POST /v1/search/similar` with title "payment routing" and path
   "finance/payment-routing", **Then** the response lists the existing page with
   a high similarity score.
2. **Given** a wiki with no similar pages, **When** the key calls similar check,
   **Then** an empty result list is returned with no false positives above the
   threshold.
3. **Given** a proposed page with a similar path but different topic, **When**
   the key calls similar check, **Then** path similarity is reported but title
   dissimilarity lowers the overall score.

### Edge Cases

- Concurrent delete + edit on the same page.
- Backlinks to a page that is soft-deleted.
- Diff between a draft and a published revision.
- Batch create with mixed valid and invalid paths (all-or-nothing).
- Stats on an empty wiki (zero counts everywhere).
- Similar check with very short titles (high false-positive risk).
- MCP tool for delete returns a confirmation shape, not raw HTTP status.
- Reader-scoped MCP configuration attempting delete/batch operations.

## Requirements *(mandatory)*

### Functional Requirements

- **FR-001**: The system MUST expose `DELETE /v1/pages/{id}` for soft-deleting a
  page, restricted to Editor and Admin roles.
- **FR-002**: Soft-deleted pages MUST disappear from default `status=published`
  and `status=draft` list/search/tree responses, and MUST appear only when
  `status=all` or `status=deleted` is explicitly requested.
- **FR-003**: Soft-delete MUST preserve all revision history, assets, and audit
  records; the page MUST be restorable (restore endpoint is P2 and MAY be
  deferred, but the data must not be destroyed).
- **FR-004**: The system MUST expose `GET /v1/pages/{id}/backlinks` returning
  pages that contain Markdown links to the target page, limited to pages
  readable by the caller.
- **FR-005**: Backlink extraction MUST parse Markdown link syntax including
  `[text](path)`, `[text](/path)`, and wiki-style path references; it MUST NOT
  require a separate link-tracking table for this feature (scan-based is
  acceptable at current scale).
- **FR-006**: The system MUST expose
  `GET /v1/pages/{id}/revisions/{version}/diff?against={fromVersion}` returning
  a structured diff (unified diff string + line-level add/remove/unchanged
  summary).
- **FR-007**: The diff endpoint MUST compute the diff server-side from stored
  Markdown source; it MUST NOT require the client to download both revisions.
- **FR-008**: The system MUST expose `POST /v1/pages/batch` for creating up to
  50 pages in a single atomic transaction.
- **FR-009**: Batch creation MUST be all-or-nothing: if any page in the batch
  fails validation or conflicts (duplicate path), the entire transaction rolls
  back and no pages are created.
- **FR-010**: The system MUST expose `GET /v1/stats` returning aggregate wiki
  metrics: page counts by status, recent activity summary, and top-level
  directory breakdown.
- **FR-011**: The stats endpoint MUST optionally include orphan detection
  (`?include=orphans`) listing pages with zero inbound links.
- **FR-012**: The system MUST expose `POST /v1/search/similar` accepting a
  proposed title and/or path and returning existing pages ranked by similarity
  score.
- **FR-013**: Similarity scoring MUST combine path similarity and title
  similarity; results MUST include a score in [0, 1] and the matched page
  metadata.
- **FR-014**: Every new endpoint MUST enforce the same permission model as
  existing v1 routes: Reader keys can only read (backlinks, diff, stats,
  similar); Editor/Admin keys can additionally delete and batch-create.
- **FR-015**: All new operations MUST be audited identically to existing v1
  operations, without storing full page source in audit records.
- **FR-016**: The MCP Server MUST gain tools for each new endpoint: `delete_page`,
  `get_backlinks`, `get_diff`, `batch_create_pages`, `get_stats`,
  `find_similar`. Each tool MUST map 1:1 to its v1 REST endpoint.
- **FR-017**: The new endpoints MUST be documented in the generated OpenAPI
  document and visible in the API docs UI.
- **FR-018**: Existing v1 read/write/search/tree workflows MUST continue to pass
  their acceptance tests after the new endpoints are added.

### Out of Scope

- Hard delete or permanent page destruction (retention policy is a separate
  concern).
- Restore endpoint (P2, deferred — soft-deleted data is preserved).
- Move-with-redirect (P2).
- Structured frontmatter / tags API (P2).
- Export/import bundles (P3).
- Webhook / change feed (P3).
- Semantic similarity using embeddings (current scale uses string-distance
  heuristics; embedding-based similarity is a future enhancement when AI index
  is available).

## Success Criteria *(mandatory)*

- **SC-001**: An AI agent can delete an outdated page, check backlinks before
  renaming, review the diff of the last change, batch-create a new subtree, get
  wiki stats, and check for duplicates — all through the public API.
- **SC-002**: Soft-deleted pages are excluded from all default-browsing surfaces
  (list, search, tree) and included only on explicit `status=all/deleted`
  request.
- **SC-003**: Batch creation is provably atomic — a conflicting batch leaves
  zero pages created.
- **SC-004**: Stats endpoint returns in O(1) aggregated queries without
  paginating all pages.
- **SC-005**: Duplicate detection has zero false positives above the configured
  similarity threshold on a test corpus of 50 distinct pages.
- **SC-006**: All six new MCP tools pass integration tests with both
  Reader-scoped (read-only tools succeed, delete/batch denied) and Editor-scoped
  (all tools succeed) API keys.
- **SC-007**: All existing 007-public-wiki-api acceptance tests continue to pass.
