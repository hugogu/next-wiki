# Research: System-Level AI Support

**Feature**: 004-system-ai-support
**Date**: 2026-06-20

## R1 — Vector storage and deployment

**Decision**: Use pgvector in the existing PostgreSQL 16 service. Switch the
Compose default image to the official `pgvector/pgvector:0.8.3-pg16` image and
enable the extension with an idempotent migration.

**Rationale**: The constitution already fixes pgvector as the vector-search
technology. pgvector supports exact and approximate nearest-neighbor search,
cosine distance, PostgreSQL joins, transactions, backup, and WAL replication.
The official project publishes PostgreSQL 16 Docker tags, so this adds no new
service. Drizzle supports vector columns and cosine-distance expressions, while
extension creation remains an explicit SQL migration.

**Alternatives considered**:

- Separate vector databases: rejected because they violate the PostgreSQL-only
  default footprint.
- PostgreSQL arrays with application-side similarity: rejected because it loses
  database-side ranking and pgvector indexing compatibility.
- Plain full-text search: retained as a separate future hybrid signal but does
  not satisfy semantic retrieval.

**Sources**:

- [pgvector project and Docker installation](https://github.com/pgvector/pgvector)
- [Drizzle pgvector similarity guide](https://orm.drizzle.team/docs/guides/vector-similarity-search)

## R2 — Embedding dimensions and search index strategy

**Decision**: Store embeddings in a dimensionless `vector` column, isolate rows
by knowledge-index generation, validate each row against that generation's
dimension, and use exact cosine search for the initial small-team scale.

**Rationale**: Models can return different embedding dimensions. pgvector
supports different dimensions in a `vector` column, but an approximate index can
cover only rows with one dimension through a partial/expression index. A static
Drizzle schema therefore cannot safely define one global HNSW index across
administrator-selectable models. Exact search restricted to one generation is
correct, avoids mixed dimensions, and preserves a future path to
generation-specific HNSW indexes.

**Alternatives considered**:

- Fixed `vector(1536)`: rejected because it hard-codes one model family.
- Pad/truncate every provider vector: rejected because it alters similarity and
  is unsupported by arbitrary models.
- Create a table per model: rejected because runtime DDL and table proliferation
  complicate migrations, cleanup, and query services.
- Dynamic HNSW index per generation in v1: deferred until measurements justify
  operational DDL and index lifecycle complexity.

**Source**:

- [pgvector FAQ: mixed dimensions and partial indexes](https://github.com/pgvector/pgvector#frequently-asked-questions)

## R3 — Provider integration shape

**Decision**: Implement a small internal provider interface with explicit
`openai_compatible` and `openrouter` adapters using native `fetch`.

**Rationale**: The project needs four bounded operations—model discovery, text
streaming, embeddings, and image generation—not a general agent framework.
OpenAI-compatible APIs provide a broad baseline. OpenRouter requires a
specialized adapter because its model catalog exposes richer modality and
context metadata, and its image generation uses chat-completion modalities.
Native HTTP keeps request/response validation under local Zod schemas and avoids
an SDK becoming the provider abstraction.

**Alternatives considered**:

- One generic adapter only: rejected because generic model-list APIs rarely
  provide trustworthy capability metadata and image-generation contracts vary.
- A large multi-provider AI SDK: rejected for the first slice because adapter
  behavior, secret handling, capability provenance, and job streaming remain
  necessary around it.
- Provider-specific code inside services: rejected because it violates explicit
  registration and makes capability tests difficult.

**Sources**:

- [OpenRouter model catalog metadata](https://openrouter.ai/docs/guides/overview/models)
- [OpenRouter image generation](https://openrouter.ai/docs/guides/overview/multimodal/image-generation)
- [OpenAI-compatible chat reference](https://developers.openai.com/api/reference/resources/chat)
- [OpenAI-compatible image reference](https://developers.openai.com/api/reference/resources/images)

## R4 — Model capability discovery

**Decision**: Treat discovered metadata as evidence with provenance, not as
unconditional truth. OpenRouter modality metadata maps directly to normalized
capabilities; generic provider models are created with unknown capabilities
until a provider-specific mapper or administrator override supplies them.

**Rationale**: OpenRouter exposes model ids, context length, input/output
modalities, and supported parameters. Generic OpenAI-compatible `/models`
responses generally expose identity but not endpoint compatibility. Persisting
raw discovery metadata plus per-capability source allows refreshes without
overwriting administrator knowledge.

**Alternatives considered**:

- Infer capabilities from model names: rejected as brittle and unsafe.
- Probe every model by making paid requests: rejected because discovery would
  incur cost, side effects, and rate limits.
- Trust one cross-provider catalog for every configured endpoint: rejected
  because local/private models may not exist there and identically named models
  may differ.

## R5 — Reliable asynchronous AI actions

**Decision**: Represent every outbound operation as an application-owned
`ai_action`, enqueue it through pg-boss, and append short-lived ordered events
for status, deltas, results, and terminal errors. Store content-bearing inputs
in an encrypted TTL row; the queue payload contains only the action id.

**Rationale**: The constitution prohibits synchronous LLM calls and mandates
pg-boss. pg-boss uses PostgreSQL locking for reliable asynchronous execution,
retries, backoff, scheduling, and transactional job creation. Application-owned
action rows provide stable authorization, model snapshots, progress, audit
metadata, and a client resource independent of internal pg-boss retention.
Keeping request content out of job data also prevents queue retention from
becoming an undeclared prompt archive.

**Alternatives considered**:

- Stream directly from provider in a route handler: rejected by P6 and loses
  work when the HTTP connection closes.
- Expose pg-boss job rows directly: rejected because queue internals are not a
  stable public contract and do not model ownership/citations/artifacts.
- In-memory event emitter: rejected because it fails across restarts and future
  separate worker processes.

**Source**:

- [pg-boss project](https://github.com/timgit/pg-boss)

## R6 — SSE with background workers

**Decision**: Workers write short-lived action events to PostgreSQL; an SSE
route authorizes the action and tails events after `Last-Event-ID`.

**Rationale**: This preserves the constitution's SSE chat experience while the
provider call remains in a job. Persisted cursors support reconnects and
cross-process operation. A 24-hour TTL prevents the event stream from becoming
persistent chat history.

**Alternatives considered**:

- PostgreSQL `LISTEN/NOTIFY` only: rejected because notifications are transient
  and a reconnect can miss output.
- Polling only: viable for admin/index jobs but inadequate for token-by-token
  chat UX.
- WebSockets: rejected because SSE is constitutionally fixed and unnecessary.

## R7 — Knowledge chunking

**Decision**: Build deterministic Markdown chunks using heading/paragraph
boundaries, conservative byte budgets, bounded overlap, and source hashes. Do
not ask an LLM to summarize or chunk content.

**Rationale**: Deterministic chunks are reproducible, inexpensive, and
idempotent. They preserve useful excerpts and avoid making index construction
depend on a text-generation model. Revision and chunk hashes permit stale-job
rejection and targeted rebuilding.

**Alternatives considered**:

- One embedding per page: rejected because long pages exceed embedding inputs
  and yield poor excerpt-level retrieval.
- Fixed character windows only: rejected because they split headings and
  paragraphs unnecessarily.
- LLM-generated summaries/entities in the first slice: deferred because they
  add cost and a second model dependency without being required for search/RAG.

## R8 — Index rebuild and model changes

**Decision**: Use immutable index generations with one active ready generation.
Build a new generation in parallel, reconcile concurrent page changes, and
activate atomically only after catch-up.

**Rationale**: Embeddings from different models are not comparable. Keeping the
old ready generation available prevents search downtime and guarantees that a
query uses one model/dimension consistently. Failed builds cannot corrupt active
search.

**Alternatives considered**:

- Delete and rebuild in place: rejected because it causes downtime and partial
  mixed results.
- Store only the newest embedding per page: rejected because a model switch
  would make search inconsistent until every page completed.

## R9 — Permission enforcement for RAG

**Decision**: Retrieve only from current published revisions and enforce
permission at candidate selection and again before output/citations.

**Rationale**: A user can lose access while a long-running action is executing.
Double checking prevents stale authorization from leaking a title, excerpt, or
citation. Jobs store an actor snapshot for traceability but re-resolve current
account status and role before disclosure.

**Alternatives considered**:

- Filter only after vector retrieval: rejected because intermediate application
  data would contain unauthorized excerpts and approximate indexes can return too
  few permitted rows.
- Embed only public pages: rejected because authenticated private knowledge must
  remain searchable by authorized users.
- Separate vectors per user: rejected because it duplicates data and becomes
  invalid whenever permissions change.

## R10 — Full-context capacity

**Decision**: Require known model context capacity and conservatively estimate
the complete prompt before queueing a provider request. Reserve 20% for system
instructions and output. If the whole readable corpus does not fit, fail closed
and direct the user to retrieval mode.

**Rationale**: The specification prohibits silent truncation. Provider catalogs
such as OpenRouter expose context length, while generic models can receive a
manual administrator value. UTF-8 byte length is intentionally conservative
across Latin and CJK content when a provider tokenizer is unavailable.

**Alternatives considered**:

- Send until the provider rejects: rejected because it wastes time/cost and
  produces poor UX.
- Truncate oldest or least relevant pages: rejected because that is no longer
  full-context mode.
- Bundle provider tokenizers: deferred because arbitrary self-hosted models use
  different tokenization and the conservative estimate is safe.

## R11 — Generated image lifecycle

**Decision**: Store generated bytes in a private temporary artifact row with a
24-hour expiry; promote them through the existing asset service only after user
confirmation.

**Rationale**: A preview must survive worker completion and browser reconnect,
but the specification forbids permanent storage/insertion before confirmation.
Promotion reuses existing validation, authoritative storage, permission, and
replication behavior.

**Alternatives considered**:

- Create a normal asset immediately: rejected because discarded generations
  become permanent unreferenced content.
- Keep only provider URLs: rejected because URLs may expire, expose provider
  credentials, or be unavailable during confirmation.
- Return large base64 payloads through SSE: rejected because it bloats event
  storage and browser memory.

## R12 — AI API authentication scope

**Decision**: Interactive AI search/generation endpoints are session-only in
this slice. Provider administration is also session-only and Admin-only. API-key
access and an `ai` scope are deferred.

**Rationale**: Existing API-key scopes do not define cost-bearing AI execution,
and the specification requests per-user switches rather than automation
permissions. Session-only endpoints keep entitlement semantics unambiguous and
avoid accidentally allowing unattended spending through `view` or `run`.

**Alternatives considered**:

- Map AI to existing `run`: rejected because that scope was reserved without a
  defined endpoint contract and does not distinguish search, Q&A, text, image,
  or administration.
- Add an `ai` scope now: deferred because it changes the feature's governance
  surface beyond the requested user-level switches.

## R13 — Secrets and privacy

**Decision**: Reuse the existing AES-GCM encrypted-setting helper and deployment
encryption key. Store credential payloads encrypted; redact prompts, responses,
authorization headers, and generated bytes from permanent audit/log fields.
Questions, search queries, and selected draft text are stored only in encrypted
short-lived action-input rows; queue jobs reference them by action id.

**Rationale**: This matches existing API-key/storage secret handling and avoids
another required secret. Short-lived action events carry content only long
enough for UX/reconnect and are TTL-cleaned.

**Alternatives considered**:

- Store credentials only in environment variables: rejected because multiple
  administrator-managed providers are required at runtime.
- Persist complete prompts/responses for debugging: rejected because it
  unnecessarily duplicates private Wiki content.

## R14 — Testing without paid providers

**Decision**: Use deterministic local HTTP fixtures implementing model,
chat-stream, embeddings, and image responses. E2E runs the fixtures alongside
the Compose application or injects fixture URLs reachable from the web
container.

**Rationale**: Tests must be repeatable, offline from paid APIs, and able to
exercise failure, timeout, malformed stream, capability, and permission cases.

**Alternatives considered**:

- Live OpenRouter/OpenAI tests: rejected because they require secrets, cost
  money, and are nondeterministic.
- Mock provider methods only: retained for unit tests, but HTTP fixtures are
  additionally needed to validate adapter parsing and timeout behavior.
