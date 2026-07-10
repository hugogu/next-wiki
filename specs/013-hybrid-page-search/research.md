# Research: Hybrid Page Search

**Feature**: [Hybrid Page Search](./spec.md)
**Date**: 2026-07-10

## Decision 1: Extend the existing page-search resource with POST; retain GET unchanged

**Decision**: Keep `GET /api/v1/search/pages` as the legacy synchronous keyword-search contract. Add an idempotent `POST` operation on that same path for the Header's hybrid search lifecycle and user behaviors. Do not add a new search route.

**Rationale**:

- The existing GET route is used by public clients and its `{ items, nextCursor }` response is regression-tested.
- Creating a semantic action from GET would violate the project rule that reads are idempotent and non-mutating.
- A POST with a client-provided search-record identifier safely creates or resumes the same search, permits retry after transport failure, and gives the Header one canonical resource to poll.
- A behavior POST on the same path meets the explicit requirement to extend the existing search API rather than adding an analytics endpoint.

**Alternatives considered**:

- Start semantic work inside GET: rejected because it makes a GET write analytics/action rows and breaks idempotency.
- Add `/api/v1/search/hybrid`: rejected by the feature requirement and would fragment clients.
- Reuse the standalone `/api/ai/searches` UI path: rejected because it is a separate SSE-oriented semantic UI and does not produce keyword/hybrid results.

## Decision 2: Preserve instant keyword results; run semantic retrieval through the existing action lifecycle

**Decision**: The hybrid POST synchronously returns permission-filtered keyword candidates. For an eligible signed-in/API-key actor with a ready index, it creates or reuses the existing semantic-search action and returns `semanticState: "pending"`; later retries of the same POST merge the completed semantic candidates. Anonymous users and unavailable/unauthorized AI configurations get keyword-only results with a non-sensitive reduced-coverage state.

**Rationale**:

- Embedding a new query calls an external provider and therefore exceeds the synchronous-operation boundary.
- The existing semantic-search action, pg-boss execution, and pgvector retrieval are already the durable, provider-neutral way to perform that work.
- Keyword-only fallback keeps search usable without AI and avoids inventing anonymous action ownership.

**Alternatives considered**:

- Synchronously embed the query in the page-search route: rejected by Constitution P7.
- Require AI for all Header searches: rejected by the no-AI usability requirement.
- Return separate keyword and semantic lists: rejected because the feature requires one consolidated list.

## Decision 3: Fuse result ranks, not raw relevance scores

**Decision**: Normalize keyword and semantic candidates by page ID, apply reciprocal-rank fusion (RRF) to their rank positions, and use deterministic tie breakers. Show a keyword excerpt when a page has one; otherwise show the highest-ranked semantic chunk excerpt.

**Rationale**:

- The current keyword score is heuristic while the vector score is cosine similarity. Their raw numeric scales are not comparable.
- RRF combines rank signals without pretending they share a calibrated score range.
- Page-ID de-duplication prevents the same page appearing twice when both retrieval paths match it.

**Alternatives considered**:

- Sort raw scores together: rejected because it produces unstable, meaningless cross-method ordering.
- Prefer keyword results and append semantic results: rejected because it is not a hybrid ranking.
- Store rendered snippets: rejected because raw revision content remains the source of truth and analytics must not retain excerpts.

## Decision 4: Apply visibility filtering to every candidate before merging

**Decision**: Reuse the existing page-read/visible-resource policy for keyword candidates and filter vector candidates through the same read policy before title, excerpt, score, or count is returned. Revalidate the selected page through normal navigation and before recording a successful behavior.

**Rationale**:

- The vector SQL candidate query only knows indexed/published state; page visibility is a separate responsibility.
- A shared policy prevents future page-level permission changes from creating a semantic disclosure path.
- Returning fewer than the requested number is safe; filling gaps from unreadable candidates is not.

**Alternatives considered**:

- Filter only in the Header: rejected because data would already have crossed the server boundary.
- Treat an inaccessible match as a placeholder: rejected because it reveals page existence.

## Decision 5: Model search demand and user outcomes as separate additive data

**Decision**: Create `search_records` for qualified query attempts and `search_behaviors` for explicit `result_open` and `escape` outcomes. Do not overload `api_audit_entries` or `ai_actions`.

**Rationale**:

- API audit captures transport metadata, not query/session/selected-page relationships.
- AI actions have a temporary job lifecycle and do not represent keyword-only or anonymous searches.
- Separate records enable analysis of query demand, selection, abandonment, and retrieval availability without retaining result content.

**Alternatives considered**:

- Log queries in API audit: rejected for privacy, missing semantics, and lack of behavior linkage.
- One wide table with nullable outcome fields: rejected because one query can have no outcome or distinct behavior events and would not enforce the requested separation.

## Decision 6: Use client-generated IDs for retries and exactly-once behavior recording

**Decision**: On each distinct qualified input attempt, the Header creates a UUID search-record ID and sends it with an overlay-session UUID. It uses a UUID event ID for each explicit click or Escape action. The database treats these IDs as uniqueness keys; duplicate requests become no-ops.

**Rationale**:

- UI retries, `keepalive` behavior sends, and rapid keyboard events cannot otherwise distinguish duplication from a new event.
- A per-overlay random session groups interaction without creating a persistent identifier for anonymous visitors.
- The UI may navigate or close immediately; analytics failure cannot delay it.

**Alternatives considered**:

- Server-generated IDs only: rejected because a client retry could create duplicate searches or behaviors.
- Browser cookies/fingerprints for anonymous tracking: rejected as unnecessary and privacy-invasive.

## Cross-cutting observations

- Existing Header title checks in browser tests must change because the title is intentionally replaced.
- The Header overlay is transient interaction state, not a new navigable page; result URLs remain canonical page paths.
- The repository already provides `Input`, `SearchIcon`, i18n dictionaries, public route wrappers, OpenAPI Zod schemas, Drizzle migrations, Vitest, and Playwright. No library is needed.
- Analytics persistence is best-effort but operationally logged. Search response, navigation, and Escape behavior are never blocked by analytics failure.
