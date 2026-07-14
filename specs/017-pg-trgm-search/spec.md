# Feature Specification: Complementary Page Search Engines

**Feature Branch**: `codex/017-pg-trgm-search`
**Created**: 2026-07-14
**Status**: Draft
**Input**: User description: "通过 pg_trgm 更好地支持中文搜索和模糊搜索，与013需求有机整合。同时需要有相应的后台开关。" Follow-up: "tsvector、pg_trgm 和 pgvector 使用范围不同、互补；已开启的引擎应并发并异步返回结果；设计必须允许以后替换引擎，并同步架构文档。"

## User Scenarios & Testing *(mandatory)*

### User Story 1 - Find pages through complementary search capabilities (Priority: P1)

A reader uses the existing interactive page search and finds the intended readable page whether their query is a precise term, a Chinese contiguous fragment, a slightly imperfect phrase, or a concept described in different words. Exact matches remain trustworthy while the other capabilities broaden useful recall.

**Why this priority**: Search quality is the feature's primary value. No single retrieval method covers terminology, Chinese fragments and typing variation, and semantic intent equally well.

**Independent Test**: With all capabilities enabled, run a representative fixture suite containing exact terminology, Chinese fragments, one-character near matches, and semantic paraphrases. Verify the intended readable page is returned in the unified list and that exact matches rank ahead of otherwise comparable approximate candidates.

**Acceptance Scenarios**:

1. **Given** a reader can access a published page matching an indexed term, **When** they submit a qualifying exact or multi-term query, **Then** the full-text capability returns it through the existing search experience.
2. **Given** a reader can access a published page with Chinese text or a near textual match, **When** they search with a meaningful contiguous Chinese fragment, a partial phrase, or a one-character imperfect variation, **Then** the fuzzy capability can return the intended page without adding unrelated low-similarity pages.
3. **Given** a readable page is conceptually relevant but does not use the exact query words, **When** semantic search is enabled and available, **Then** the semantic capability can contribute that page to the same result list.
4. **Given** exact and approximate candidates are both available, **When** the reader searches for the exact phrase, **Then** the exact candidate ranks ahead of the otherwise comparable approximate candidate.

---

### User Story 2 - Receive progressive results without waiting for every engine (Priority: P1)

A reader receives one de-duplicated result list as each enabled capability completes. Fast lexical results appear promptly, while semantic retrieval may arrive later. A slow, disabled, or failed capability never hides successful results from another capability.

**Why this priority**: The three capabilities have different response characteristics. The interaction must remain responsive without sacrificing the richer semantic contribution when it becomes available.

**Independent Test**: Start an interactive search with all three capabilities enabled, delay semantic retrieval in a test environment, and confirm that lexical results appear first. Repeat with one lexical capability unavailable and verify that the other completed capability remains visible and the response exposes only a generic reduced-coverage state.

**Acceptance Scenarios**:

1. **Given** multiple enabled capabilities can accept a query, **When** an interactive search starts, **Then** they are started concurrently rather than serially.
2. **Given** full-text and fuzzy retrieval finish before semantic retrieval, **When** the first response is returned, **Then** it includes their fused readable results and identifies semantic retrieval as pending without waiting for it.
3. **Given** a later response for the same search attempt is requested, **When** another capability has completed, **Then** the response returns the refreshed unified, de-duplicated list and that capability's completion state.
4. **Given** one enabled capability fails, times out, or is unavailable, **When** another capability returns readable candidates, **Then** those candidates remain usable and the response does not reveal implementation diagnostics or protected-page information.

---

### User Story 3 - Control each search capability safely (Priority: P2)

An administrator can independently enable or disable full-text, fuzzy, and semantic search from the existing Search Settings page. The controls explain the user-visible role of each capability and do not require a separate settings surface.

**Why this priority**: The capabilities have different operational dependencies and recall trade-offs. Administrators need reversible controls without coupling the semantic setting to Chinese/fuzzy behavior.

**Independent Test**: As an administrator, save each capability in enabled and disabled states, start new searches after each save, and verify that only the selected capability changes. Confirm that attempts to disable both lexical capabilities are rejected with a clear validation message.

**Acceptance Scenarios**:

1. **Given** an administrator opens the existing Search Settings page, **When** they view search controls, **Then** they see distinct full-text, fuzzy, and semantic capability controls with concise scope descriptions.
2. **Given** an administrator saves a changed capability setting, **When** they start a subsequent search, **Then** that search uses the saved setting while already accepted search attempts retain their original capability set.
3. **Given** an administrator attempts to disable both full-text and fuzzy search, **When** they save the settings, **Then** the system rejects the change and retains at least one lexical path for non-AI search.
4. **Given** a non-administrator attempts to read or change these settings, **When** they use the settings interface or resource, **Then** access is denied under the existing administration rules.

---

### User Story 4 - Evolve search technology without changing the product contract (Priority: P3)

A maintainer can replace an implementation behind a stable search capability, or add an approved capability later, without changing the existing search route, user settings semantics, visibility safeguards, or client result-list flow.

**Why this priority**: Search technology and scale requirements evolve. Coupling the product contract directly to a database extension or vendor would make future improvements disproportionately risky.

**Independent Test**: Substitute a test implementation for one registered capability and run the search contract suite. Verify the same capability setting, response shape, permission filtering, progressive lifecycle, and rank-fusion behavior continue to work.

**Acceptance Scenarios**:

1. **Given** a registered capability implementation is replaced, **When** it returns valid candidates and lifecycle states, **Then** clients continue to use the same search resource and capability-level settings.
2. **Given** a future capability needs asynchronous work, **When** it reports pending and later completion for an accepted search attempt, **Then** the existing progressive result flow can resume it without a new client route.
3. **Given** a capability implementation returns an internal error or score, **When** the response is produced, **Then** only stable capability state and user-safe result information are exposed.

---

### Edge Cases

- What happens when a query is shorter than the existing minimum search length? The existing minimum-length behavior is preserved; no capability is started.
- How does the system handle mixed Chinese, Latin, numeric, or punctuation-containing queries? Every enabled capability receives the same normalized query and may return only qualifying readable candidates within its documented scope.
- What happens when no candidate is sufficiently similar? The fuzzy capability returns no candidate; it must not add speculative unrelated pages.
- What happens if all enabled capabilities return no result? The unified result is empty and does not disclose unavailable indexes or inaccessible content.
- What happens if semantic search is disabled, unavailable, or unauthorized? Full-text and fuzzy search continue independently; the response gives only a generic coverage state.
- What happens to pages a reader cannot access? They are never returned, counted, excerpted, or inferred through any capability.
- What happens if an administrator changes a setting during a search? The accepted search attempt uses its saved capability snapshot; the new setting applies only to later attempts.
- What happens to installations upgrading from the prior release? The three current capabilities are enabled by default after normal deployment, and an administrator can independently disable one while preserving at least one lexical capability.

## Requirements *(mandatory)*

### Functional Requirements

- **FR-001**: The system MUST provide three complementary page-search capabilities: full-text retrieval for term-oriented matches, fuzzy retrieval for Chinese contiguous fragments and near textual matches, and semantic retrieval for conceptually related content.
- **FR-002**: The current implementations MUST use PostgreSQL `tsvector` for full-text retrieval, PostgreSQL `pg_trgm` for fuzzy retrieval, and `pgvector` for semantic retrieval, while preserving capability-level names as the product-facing contract.
- **FR-003**: The system MUST run every enabled and available capability concurrently for an interactive search attempt; a capability MUST NOT wait for another capability's result before starting.
- **FR-004**: The existing feature-013 `POST /api/v1/search/pages` lifecycle MUST return progressive snapshots for one idempotent search attempt, including a unified result list and non-sensitive per-capability states. The client MUST continue to poll this existing resource while a capability is pending; no parallel public search route is introduced.
- **FR-005**: Full-text and fuzzy retrieval MUST return in the initial snapshot whenever they complete within the request budget. Semantic retrieval MAY remain pending and MUST resume through the existing asynchronous action lifecycle without requiring a live model call in the request handler.
- **FR-006**: The system MUST de-duplicate candidates by page identity, apply visibility and read-permission checks before returning a page, excerpt, count, or source, and rank the unified list using capability-internal rank signals rather than directly comparing native engine scores.
- **FR-007**: Exact path, title, and term matches MUST have deterministic ranking protection over otherwise comparable fuzzy or semantic candidates.
- **FR-008**: A failed, timed-out, disabled, or unavailable capability MUST NOT prevent completed candidates from another capability from being returned. Responses MUST expose only stable, non-sensitive coverage states and MUST NOT expose engine diagnostics, raw scores, index state, or protected-page existence.
- **FR-009**: Administrators MUST be able to independently enable or disable the full-text, fuzzy, and semantic capabilities through the existing Search Settings page and settings resource. The system MUST reject a saved configuration that disables both full-text and fuzzy retrieval.
- **FR-010**: A successful settings save MUST persist the selected capability set. Each accepted search attempt MUST retain a snapshot of that set so later configuration changes do not alter its progressive results.
- **FR-011**: The legacy `GET /api/v1/search/pages` operation MUST remain a non-mutating, response-compatible search contract. It MAY use enabled immediate lexical capabilities but MUST NOT start asynchronous semantic work. Interactive first-party search MUST use the existing feature-013 POST lifecycle when all three capabilities are desired.
- **FR-012**: Existing POST clients MUST retain the `semanticState` and conceptual `matchSources` fields defined by feature 013. Any capability states or per-result capability sources added to the response MUST be additive and use stable capability identifiers rather than database or vendor names.
- **FR-013**: Search capability implementations MUST be explicitly registered behind a common server-side contract. Coordinating, candidate fusion, permission-safe result projection, and response formatting MUST remain outside individual capability implementations so that an implementation can be replaced without changing the route, client flow, or settings semantics.
- **FR-014**: The system MUST retain the current normal database migration and deployment workflow, reuse the already provisioned PostgreSQL search extensions and indexes where valid, and require no additional default search service.
- **FR-015**: Search remains request-time, permission-dependent API data. It MUST NOT be cached as public reader content or make a published reader route dynamic.

### Public Content Delivery *(mandatory when published content is affected)*

No public reader-page content delivery changes are introduced. Search results are generated through the existing uncached search resource after client interaction. The capabilities and their settings do not alter cached published reader HTML, metadata, navigation, or their invalidation behavior.

### Key Entities *(include if feature involves data)*

- **Search Capability**: A stable, product-level retrieval role (`full_text`, `fuzzy`, or `semantic`) with an independently enabled setting and a replaceable server-side implementation.
- **Search Engine Run**: The persisted lifecycle snapshot for one capability within one accepted search attempt. It records only the capability state, safe aggregate count, timing, and an optional continuation reference; it never stores result bodies or provider diagnostics.
- **Search Attempt**: The existing idempotent feature-013 search record, extended to retain the accepted capability-set snapshot and its capability runs.
- **Search Candidate**: An internal page/revision reference, engine-local rank, and optional safe excerpt evidence returned by a capability. It is not a public page representation and must pass central visibility projection before use.
- **Unified Search Result**: The existing feature-013 result representation that de-duplicates readable candidates and fuses their ranked capability contributions.

## Success Criteria *(mandatory)*

### Measurable Outcomes

- **SC-001**: At least 95% of a representative Chinese-search regression suite, covering exact phrases, meaningful fragments, and one-character near matches, returns the intended readable page within the first five results while fuzzy retrieval is enabled.
- **SC-002**: At least 95% of a representative exact-term and multi-term suite returns the intended readable page within the first five results while full-text retrieval is enabled.
- **SC-003**: At least 95% of qualifying interactive searches receive an initial result snapshot from enabled immediate lexical capabilities within 500 ms under the reference dataset and load profile; semantic enrichment never delays that first snapshot.
- **SC-004**: In 100% of capability-failure tests, candidates from another completed capability remain available and no internal error, index state, or inaccessible page is disclosed.
- **SC-005**: In 100% of authorization and visibility regression tests, no capability returns a page, excerpt, count, or source that the requester is not allowed to read.
- **SC-006**: All existing page-search contract regression tests pass without requiring a new route, request field, or result-list rendering path. Additive capability-state fields are safely ignored by existing clients.
- **SC-007**: In 100% of settings tests, each saved capability state persists for new searches, applies independently, and a configuration with both lexical capabilities disabled is rejected.
- **SC-008**: A replacement test implementation can satisfy the common capability contract and pass coordinator, permission, rank-fusion, and existing HTTP contract tests without changing the route or client code.

## Assumptions

- The existing feature-013 two-character minimum query threshold remains the protection against broad, low-signal searches; Chinese two-character and near-match behavior is validated against the deployed PostgreSQL image rather than assumed from English fixtures.
- Full-text retrieval is the term-oriented baseline, fuzzy retrieval is the Chinese/near-match supplement, and semantic retrieval is optional conceptual enrichment; none is a substitute for the others.
- The three current capability settings are enabled by default. At least one lexical capability remains enabled so that search remains usable without an AI provider.
- The existing POST polling model is the progressive delivery mechanism. Server-Sent Events are not introduced for this search feature because the established resource lifecycle already supports idempotent partial-result refreshes.
- Per-capability relevance thresholds and ranking weights are implementation safeguards, not administrator controls in this release.

## Technical Constraints (User-Mandated)

The current full-text, fuzzy, and semantic implementations MUST use `tsvector`, `pg_trgm`, and `pgvector` respectively. The design MUST isolate them behind stable capability contracts so a future PostgreSQL, self-hosted, or managed-search implementation can replace one without changing the product contract. The feature MUST not add a default deployment service.
