# Research: Complementary Page Search Engines

**Feature**: [Complementary Page Search Engines](./spec.md)
**Date**: 2026-07-14

## Decision 1: Keep three stable capabilities, not three technology-branded APIs

**Decision**: Define stable capability IDs `full_text`, `fuzzy`, and `semantic`. The initial adapters use `tsvector`, `pg_trgm`, and `pgvector` respectively, but those implementation names do not become settings, route, or client-contract identifiers.

**Rationale**:

- Full-text retrieval is most useful for known terminology, word-oriented multi-term queries, and direct document matches.
- Trigram retrieval supplements that with Chinese contiguous fragments, substring/prefix-like matching, and small textual variations. It is not a Chinese word-segmentation promise.
- Vector retrieval covers semantic paraphrases, not exact names or spelling correction.
- Stable capability names allow a future PostgreSQL, self-hosted, or managed implementation to change without creating a new user setting or response contract.

**Alternatives considered**:

- Publish `tsvector`, `pg_trgm`, and `pgvector` in the API and UI: rejected because it couples users and integrations to current storage technologies.
- Treat fuzzy search as a flag inside the existing keyword engine: rejected because its execution, thresholding, failure state, and future replacement boundary are distinct.

## Decision 2: Use one coordinator with an explicit static adapter registry

**Decision**: Introduce a `SearchEngine` capability contract, a static `SearchEngineRegistry`, and a `SearchCoordinator`. Adapters return only internal candidate references, engine-local rank, safe excerpt evidence, and lifecycle state. The coordinator owns enablement, deadlines, concurrency, resume behavior, permission-safe hydration, fusion, and response projection.

**Rationale**:

- It satisfies P10's explicit-registration rule and makes the active capabilities auditable in one file.
- It prevents route handlers and `public-content.ts` from knowing SQL, vector, provider, or vendor details.
- It makes replacement an adapter/registry change with contract tests rather than an API rewrite.

**Alternatives considered**:

- Add another conditional branch to `searchPublishedPagesByKeyword()`: rejected because this would continue to combine orchestration, query implementation, and public projection.
- Runtime module discovery: rejected by P10 because it hides what is active and makes testing/loading nondeterministic.

## Decision 3: Run enabled capabilities concurrently and return progressive snapshots through the existing POST

**Decision**: On the feature-013 POST query operation, the coordinator creates or resumes the search record, snapshots enabled capabilities, and starts all included adapters with `Promise.allSettled`. `full_text` and `fuzzy` run as bounded request-time PostgreSQL queries. `semantic` starts or resumes the existing AI action and reports `pending` until it is complete. Later retries of the same idempotent POST return the latest fused snapshot and per-capability states.

**Rationale**:

- A normal JSON response cannot independently push three streams. Feature 013 already supplies an idempotent poll/resume protocol on the same resource.
- The two PostgreSQL queries are expected to stay inside the request budget; moving them to a background queue would add delay and operational complexity without user value.
- Query embeddings can call a provider and therefore remain asynchronous under P7.

**Alternatives considered**:

- Add a new SSE or WebSocket search endpoint: rejected because it creates a parallel search route and duplicates the established POST lifecycle.
- Start the engines serially: rejected because a pending semantic action must not delay immediate lexical results.
- Fire untracked in-process promises after the response: rejected because Next.js process lifetime and retries cannot safely resume them.

## Decision 4: Persist one capability run per accepted search attempt

**Decision**: Add `search_engine_runs`, uniquely keyed by `(search_record_id, capability_id)`, and store the accepted capability snapshot on `search_records`. A run records only capability state, safe aggregate result count, timing, and an opaque continuation reference. The existing semantic fields remain a compatibility materialization for feature-013 clients.

**Rationale**:

- An individual pending capability needs durable ownership and continuation across retries.
- The snapshot prevents an administrator's later setting change from altering the capabilities for a query already in progress.
- The model generalizes the current semantic action into a future adapter lifecycle without persisting result bodies or provider diagnostics.

**Alternatives considered**:

- Add only JSON state to `search_records`: rejected because independent state transitions, uniqueness, retry ownership, and future continuation references need relational integrity.
- Persist full result lists: rejected for privacy, staleness, and duplicated derived data; results are rebuilt from current readable candidates.

## Decision 5: Fuse ranks after central permission filtering

**Decision**: Each adapter obtains a bounded candidate list. The coordinator resolves those IDs through the published/readable page projection, drops everything not visible to the actor, de-duplicates by page ID, and applies weighted reciprocal-rank fusion with deterministic exact-match and path/title tie protection. It does not compare `ts_rank`, trigram similarity, or vector cosine values directly.

**Rationale**:

- Native scores are not calibrated across engines. The existing feature-013 research already chose rank fusion, while the current implementation incorrectly finishes by comparing heterogeneous raw relevance scores.
- Central visibility filtering prevents a vector, full-text, or fuzzy path from revealing a title, excerpt, count, or even candidate existence.
- Rank fusion preserves complementary recall while exact matches remain predictable.

**Alternatives considered**:

- Sort raw scores together: rejected because their scales and meaning differ.
- Filter permissions in the Header: rejected because protected data would have already crossed the server boundary.

## Decision 6: Retain current PostgreSQL indexes and validate their actual behavior

**Decision**: Reuse migration `0007_fast_keyword_search.sql`, which already creates `pg_trgm`, `tsvector` GIN expression indexes, and trigram GIN indexes. The full-text adapter uses exactly the indexed `simple` configuration/expression. The fuzzy adapter uses trigram similarity to bound candidates and engine-local ranking. No duplicate search-index migration is created in this slice.

**Rationale**:

- PostgreSQL expression indexes are used only when the query expression matches the indexed expression. [PostgreSQL full-text index documentation](https://www.postgresql.org/docs/current/textsearch-tables.html)
- `pg_trgm` supports similarity and `LIKE`/`ILIKE` index paths; its documented full-text integration is specifically useful for spelling-tolerant recall. [PostgreSQL pg_trgm documentation](https://www.postgresql.org/docs/current/pgtrgm.html)
- Actual Chinese token/character behavior depends on the deployed PostgreSQL locale and configuration, so a Chinese regression corpus and query-plan checks are required.

**Alternatives considered**:

- Add duplicate trgm indexes for the new adapter: rejected because equivalent indexes already exist and impose write/storage cost.
- Declare `tsvector('simple')` a Chinese tokenizer: rejected because it is a term-oriented engine; Chinese fuzzy recall is the fuzzy capability's responsibility.

## Decision 7: Keep pgvector exact until measured scale justifies approximate indexing

**Decision**: Retain the current exact cosine retrieval inside the initial semantic adapter. If data volume requires approximate vector indexing later, change the adapter internally after validating permission-filtered recall and operational memory trade-offs.

**Rationale**:

- The existing system has no HNSW or IVFFlat index. Exact retrieval is predictable at the current scale.
- pgvector documents HNSW's speed/recall and build/memory trade-offs, and approximate search requires special care when filters remove candidates. [pgvector indexing and filtering](https://github.com/pgvector/pgvector#hnsw)

**Alternatives considered**:

- Add HNSW immediately: rejected because no measured scale problem requires its added build and memory cost.

## Decision 8: Evolve the API additively and keep GET pure

**Decision**: `GET /api/v1/search/pages` retains its current query and `{ items, nextCursor }` response contract. It can use immediate enabled lexical adapters but never starts semantic work. Header POST retains `semanticState` and conceptual `matchSources` while adding `engineStates` and `engineSources` based on stable capability IDs.

**Rationale**:

- GET must stay idempotent and cannot create an AI action or analytics lifecycle.
- Existing clients can ignore additive fields; the Header can poll any pending capability without a new route.
- Conceptual `keyword`/`semantic` labels remain compatible while detailed capability provenance stays technology-neutral.

**Alternatives considered**:

- Replace GET with a POST-only API: rejected because it breaks existing public clients.
- Expose database extensions in `matchSources`: rejected because it makes the client contract impossible to evolve safely.
