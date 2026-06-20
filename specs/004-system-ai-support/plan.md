# Implementation Plan: System-Level AI Support

**Branch**: `004-system-ai-support` | **Date**: 2026-06-20 | **Spec**: [spec.md](./spec.md)
**Input**: Feature specification from `/specs/004-system-ai-support/spec.md`

## Summary

Add an optional, system-managed AI subsystem with multiple providers, explicit
model capability metadata, administrator-selected models for text, embeddings,
and image generation, and per-user entitlements for question answering, text
optimization, and image generation.

The implementation extends the existing Next.js/Drizzle/PostgreSQL application:

- provider calls are normalized behind an explicit server-only adapter registry;
- secrets reuse the existing encrypted-setting mechanism;
- every outbound AI operation runs as a pg-boss job and is represented by an
  `ai_action` resource;
- short-lived action events support reconnectable SSE without persisting chat
  history or prompt content in the audit record;
- pgvector stores rebuildable embeddings for deterministic Markdown chunks;
- index generations isolate embedding-model changes and allow atomic activation;
- permission checks occur before indexing output is exposed, before retrieval,
  and again before citations are returned;
- generated images are temporary until an authorized editor confirms promotion
  into the existing content-asset system.

The default deployment remains the web application plus PostgreSQL. The
PostgreSQL Compose image changes to the official pgvector PostgreSQL 16 image,
which adds an extension but no service.

## Technical Context

**Language/Version**: TypeScript 5.6; Node.js 20.9+ runtime floor, Node.js 24 in
the current Docker image; React 19.2 and Next.js 16.2.
**Primary Dependencies**: Existing Next.js App Router, Drizzle ORM, postgres.js,
pg-boss, Zod, TanStack Query, Zustand, React Hook Form, CodeMirror 6,
next-openapi-gen, unified/remark/rehype, and the existing content-asset service.
Native `fetch` implements provider HTTP clients; no general AI SDK is required.
**Storage**: PostgreSQL 16 with pgvector 0.8.x; existing Database/Local/S3 content
storage remains unchanged. New relational tables store provider/model metadata,
entitlements, index generations/chunks, AI actions/events, and temporary image
artifacts.
**Testing**: Vitest integration/unit tests against the dedicated PostgreSQL test
database; Playwright E2E; provider adapters tested with deterministic HTTP
fixtures and no real paid provider calls.
**Target Platform**: Linux server through Docker Compose; self-hosted,
single-instance default with an in-process pg-boss worker.
**Project Type**: Full-stack web application in the existing pnpm monorepo.
**Performance Goals**: 95% of published pages indexed within 2 minutes; grounded
answers complete or fail clearly within 30 seconds under normal provider
availability; semantic retrieval returns a bounded top-k result set without
loading full page bodies into application memory.
**Constraints**: PostgreSQL remains the only required stateful service; no model
call may execute synchronously in a route handler; AI-disabled mode performs no
provider discovery or generation calls; every result is permission-scoped;
Editor/Admin remains mandatory for page mutations; generated content is never
auto-saved or auto-published; all REST changes update next-openapi-gen metadata
and generated docs.
**Scale/Scope**: Personal and small-team installations, initially up to roughly
10,000 published pages / 100,000 knowledge chunks. Exact cosine search is the
initial baseline; generation-specific approximate indexes are deferred until
measured scale requires them.

## Constitution Check

*GATE: Must pass before Phase 0 research. Re-checked after Phase 1 design.*

Source: `.specify/memory/constitution.md` v1.4.0 and linked architecture
mandates.

| Principle / Mandate | Status | Design compliance |
|---|---|---|
| P1 Simple Deployment | PASS | pgvector is installed in the existing PostgreSQL service by switching to the official PostgreSQL 16 pgvector image. No Redis, vector database, object service, or required AI provider is added. |
| P2 AI Optional / First-Class Chat | PASS | Global disable blocks all outbound AI work. The persistent chat side pane is the canonical Wiki Q&A surface, is URL-addressable, permission-scoped, citation-based, and hidden when unavailable. |
| P3 Rendering Pipeline | PASS | Knowledge extraction consumes immutable raw Markdown through a separate deterministic chunker. Rendering plugins and stored HTML are not used as the knowledge source and are not modified. |
| P4 Permissions First-Class | PASS | AI services accept `PermCtx`; jobs persist an actor snapshot and re-resolve current user status/role. Retrieval joins back to pages/spaces and rechecks readability before returning excerpts or citations. Text/image insertion also requires existing edit permission. |
| P5 UI Consistency | PASS | Admin AI screens, chat pane, editor dialogs, job states, and notices use shared UI primitives, design tokens, icons, and bilingual locale files. |
| P6 Async-First | PASS | Provider tests, catalog sync, embeddings, semantic query embeddings, Q&A, optimization, and image generation are pg-boss jobs. Routes return `202` with an action id. SSE only relays persisted short-lived events. |
| P7 Version Everything | PASS | Embeddings reference immutable published revisions and source hashes. AI suggestions change only client drafts; accepted edits enter normal revision history when the user saves. |
| P8 Open Standards | PASS | Provider interfaces favor OpenAI-compatible HTTP shapes with explicit adapters. REST + JSON contracts and OpenAPI documentation remain the external interface. |
| P9 Explicit Registration | PASS | Provider adapters and AI job handlers are registered in explicit registries. No filesystem scanning, dynamic model-provider discovery, or global provider singleton is introduced. |
| P10 Native Navigation | PASS | Admin resources and semantic search have canonical routes; chat open/mode state and search filters use URL search parameters. Transient confirmation dialogs remain local UI state. |
| AI Knowledge Layer mandate | PASS | The index is derived and rebuildable, versioned by embedding assignment, idempotent, permission-scoped, and returns revision citations. |
| AI Chat Side Pane mandate | PASS | Responses are delivered through SSE, history remains session-scoped, current page context is passed explicitly, and mutations require confirmation. |
| API Architecture mandate | PASS | Route handlers are thin adapters over shared Zod schemas and server services. New routes carry next-openapi-gen annotations and use the existing authentication/error/audit wrappers where applicable. |
| Deployment & Operations mandate | PASS | Compose remains the required test/deploy path; extension creation is an idempotent migration; AI action and index status are visible to administrators; provider failures do not block Wiki readiness. |
| Frontend Data Flow mandate | PASS | TanStack Query owns server state and job polling; Zustand owns session chat UI; SSE tokens are local/chat-store state; URL parameters own searchable/shareable state. |

### Post-Design Re-check

PASS. Phase 1 design adds no constitution violation. The potentially conflicting
requirements—background-only model calls and streamed chat—are reconciled by
persisting short-lived action events from the worker and streaming those events
from a route that performs no provider call.

## Design Decisions

### D1 — Provider adapter registry

Create `src/server/ai/providers/` with a normalized interface:

```ts
interface AiProviderAdapter {
  readonly kind: AiProviderKind;
  testConnection(config: ProviderRuntimeConfig): Promise<ProviderHealth>;
  listModels(config: ProviderRuntimeConfig): Promise<DiscoveredModel[]>;
  streamText(input: TextGenerationInput): AsyncIterable<TextGenerationEvent>;
  embed(input: EmbeddingInput): Promise<EmbeddingOutput>;
  generateImage(input: ImageGenerationInput): Promise<ImageGenerationOutput>;
}
```

The explicit registry initially contains:

- `openai_compatible`: configurable base URL and headers. It supports standard
  model listing, chat-completions text streaming, embeddings, and image
  generation when the configured server implements those endpoints. Generic
  `/models` results do not imply capabilities; administrators confirm or
  override them.
- `openrouter`: OpenAI-compatible text/embedding requests plus enriched model
  discovery from OpenRouter metadata. Image output uses OpenRouter's
  chat-completions modalities contract rather than assuming an images endpoint.

Provider records store non-secret connection configuration separately from one
encrypted credential payload. Adapters receive decrypted credentials only
inside workers or connection-test jobs.

### D2 — Capability provenance and purpose assignments

Capabilities are normalized to `text_generation`, `embedding`, and
`image_generation`. Each model-capability row records `supported`, source
(`provider`, `catalog`, or `manual`), and update time. A manual row takes
precedence over discovered metadata but does not destroy the raw provider
metadata.

Three singleton purpose assignments select the active model for:

- Wiki text generation;
- Wiki embeddings;
- Wiki image generation.

Assignment validation requires an enabled provider, available model, and a
positive compatible capability. Workers snapshot provider/model ids when the
action is accepted so later administrator changes cannot redirect in-flight
work.

### D3 — Background action protocol and SSE

Every outbound AI operation creates an `ai_actions` row in the same service
transaction that validates authorization and snapshots its provider/model. The
route stores content-bearing request data in a short-lived
`ai_action_inputs` row, enqueues only `{ actionId }` in pg-boss, and returns
`202 { id, status: "queued" }`. This prevents prompts, questions, selected
draft text, and search queries from entering pg-boss retention or permanent
audit metadata.

Workers update action status and append ordered `ai_action_events`:

- `status`
- `text_delta`
- `search_results`
- `citations`
- `optimization`
- `image_ready`
- `completed`
- `error`

`GET /api/ai/actions/{id}/events` is an SSE endpoint. It checks ownership/admin
visibility, accepts `Last-Event-ID`, reads events after that cursor, emits
heartbeats, and closes after a terminal event. It never contacts a provider.
Input and event payloads expire after 24 hours and a scheduled cleanup job
removes them. The durable audit row retains only non-content operational
metadata.

This design allows reconnects and a separate worker container later without
changing the client contract.

### D4 — pgvector deployment and storage

Compose uses `pgvector/pgvector:0.8.3-pg16` (overrideable through
`POSTGRES_IMAGE`). A custom Drizzle migration runs `CREATE EXTENSION IF NOT
EXISTS vector`.

`ai_knowledge_chunks.embedding` uses the dimensionless PostgreSQL `vector` type.
Embedding dimension is recorded on the index generation and validated before
insert. This supports changing between models with different dimensions.

Initial search uses exact cosine distance restricted to one active generation:

```sql
WHERE generation_id = $activeGeneration
ORDER BY embedding <=> $queryVector
LIMIT $candidateLimit
```

No HNSW index is created in this slice. pgvector permits mixed dimensions in a
dimensionless column, but approximate indexes require same-dimension partial
indexes. Exact search is simpler and correct for the intended small-team scale.
A future measured optimization may create generation-specific partial HNSW
indexes without changing the data model or API.

### D5 — Deterministic page chunking

Only the latest published revision is globally indexed. A server-only Markdown
chunker:

1. reads raw Markdown through the authoritative content store;
2. removes non-semantic markup while preserving headings, prose, code labels,
   link text, and image alt text;
3. splits first at heading/paragraph boundaries;
4. combines small segments and splits oversized segments using a conservative
   UTF-8 byte budget;
5. includes a bounded overlap between adjacent chunks;
6. computes a content hash from chunker version + revision hash + normalized
   chunk text.

Chunking is deterministic and does not call an LLM. A page-generation state row
tracks target revision, status, attempts, and error. Idempotent uniqueness on
`(generation_id, revision_id, chunk_index)` prevents duplicates.

### D6 — Index generation lifecycle

Embedding assignment changes create a `building` knowledge-index generation
instead of mutating the active generation. The existing ready generation
continues serving searches during rebuild.

Lifecycle:

1. create generation with assigned model and expected dimension;
2. enqueue every eligible published page;
3. page publish/delete/restore events enqueue reconciliation for both the active
   and any building generation;
4. a final catch-up pass verifies every eligible page points to its latest
   published revision;
5. atomically mark the new generation `ready/active` and the old generation
   `superseded`;
6. asynchronously remove superseded chunk rows after a retention window.

No query mixes generations. A failed rebuild leaves the previous ready
generation active.

### D7 — Permission-safe semantic retrieval

Semantic search is available to authenticated session users when global AI is
enabled. The three per-user switches govern generation features only, matching
the feature specification. API-key and anonymous semantic search are deferred
to avoid introducing an unrequested cost-bearing API permission.

The search worker records the requesting user id. Before embedding the query it
re-resolves that user's active status. Candidate SQL joins chunks to pages,
spaces, and published revisions. The service applies the same page-read
permission rules before returning any title or excerpt. Before Q&A output is
made visible, cited pages are checked again to handle permissions changing
during the job.

Retrieval groups chunk matches by page, preserves the highest similarity score,
and returns bounded excerpts and canonical page/revision citations.

### D8 — Full-context and retrieval Q&A

The persistent AI side pane uses `?ai=open&aiMode=full|retrieval` and receives
current page identity as contextual metadata.

- **Full-context mode** loads all readable current published revisions in a
  deterministic order. It computes a conservative input estimate from UTF-8
  byte length plus prompt/message overhead and reserves 20% of the model context
  for instructions and output. If the complete corpus does not fit, no request
  is sent and the action returns `FULL_CONTEXT_TOO_LARGE` with retrieval mode as
  the suggested alternative.
- **Retrieval mode** embeds the question with the model belonging to the active
  knowledge generation, retrieves top chunks, then sends only those grounded
  sources to the text model.

Prompts require source identifiers and an explicit insufficient-evidence
response. The worker normalizes citations against the supplied source set;
unknown citations are dropped and unsupported answers are returned as
insufficient rather than uncited.

Chat messages remain in a Zustand session store. Only short-lived action events
carry response text; no conversation table is introduced.

### D9 — Selected-text optimization

CodeMirror exposes the selected text and its original `{ from, to, selectedText
hash }`. The client creates a `text_optimization` action. The worker returns a
single replacement suggestion through action events.

Acceptance occurs entirely in CodeMirror:

- compare current selected range and hash with the original request;
- if unchanged, replace exactly that range in one editor transaction;
- if changed, refuse automatic replacement and offer copy/manual application.

No optimization endpoint writes a page or revision. Existing save/publish flows
remain authoritative.

### D10 — Image generation and temporary promotion

An authorized editor chooses current-page or selected-text context. The worker
uses the assigned image model, validates the returned image bytes with the
existing image validator, and stores them in `ai_generated_artifacts` with a
24-hour expiry. Provider URLs are fetched with timeout, response-size, redirect,
and content-type limits; base64/data responses are decoded under the same size
limit.

The preview is readable only by the action owner or an administrator.
`POST /api/ai/generated-artifacts/{id}/asset`:

1. rechecks action ownership, user entitlement, active status, and page edit
   permission;
2. writes the bytes through the existing authoritative asset write path;
3. records `promoted_asset_id`;
4. returns the normal `/api/assets/{id}` URL.

The client then inserts the Markdown reference. Discarded/expired artifacts are
deleted without creating a content asset.

### D11 — Entitlements and administration

`user_ai_entitlements` is a one-to-one user record with three booleans defaulting
to false. Admin UI uses `/admin/users/{id}/ai`; provider/model/index management
uses canonical resources under `/admin/ai`.

The permission model adds:

- actions: `manage_ai`, `use_ai_search`, `use_ai_qa`,
  `use_ai_text_optimization`, `use_ai_image_generation`;
- resources: AI settings, AI action, knowledge index, and page-scoped AI use.

`manage_ai` is Admin only. User feature actions require an active signed-in
session, the corresponding entitlement, and—where applicable—normal page
read/edit permission. Existing `can()` remains the chokepoint; service-level
entitlement checks supplement rather than bypass it.

### D12 — Privacy, audit, and operational controls

The UI shows the configured provider name before content-bearing actions.
Provider/model/action status, duration, usage, and sanitized errors are retained
in `ai_actions`; prompts, selected text, response text, and generated bytes are
not copied into permanent audit fields.

Logs redact authorization headers, encrypted credentials, prompt bodies, raw
provider responses, text deltas, and generated image data. Error records use
stable codes plus a bounded provider message stripped of request content.
Short-lived action inputs are encrypted at rest, and pg-boss payloads contain
only action identifiers.

Global disable is stored in a singleton AI setting. All service entry points and
workers check it. Disabling AI prevents new jobs and causes queued jobs to fail
closed before any outbound call; normal Wiki health/readiness remains healthy.

### D13 — REST/OpenAPI and UI routes

All new REST route handlers use shared Zod schemas, thin service adapters,
existing error conventions, and next-openapi-gen annotations. After route
changes, run `pnpm --filter @next-wiki/web openapi:generate` and commit the
updated `apps/web/public/openapi.json`.

Canonical user routes:

- `/search?q=...&mode=semantic`
- existing reader/editor/admin layouts with `?ai=open&aiMode=...`
- `/admin/ai`
- `/admin/ai/providers`
- `/admin/ai/providers/{id}`
- `/admin/ai/models`
- `/admin/ai/indexes`
- `/admin/ai/actions`
- `/admin/users/{id}/ai`

## Project Structure

### Documentation (this feature)

```text
specs/004-system-ai-support/
├── spec.md
├── plan.md
├── research.md
├── data-model.md
├── quickstart.md
├── contracts/
│   ├── rest-api.md
│   ├── provider-adapter.md
│   └── urls.md
├── checklists/
│   └── requirements.md
└── tasks.md                 # Created later by /speckit.tasks
```

### Source Code (new and modified)

```text
apps/web/
├── app/
│   ├── (admin)/admin/
│   │   ├── ai/
│   │   │   ├── page.tsx
│   │   │   ├── providers/
│   │   │   ├── models/page.tsx
│   │   │   ├── indexes/page.tsx
│   │   │   └── actions/page.tsx
│   │   └── users/[id]/ai/page.tsx
│   ├── (public)/search/page.tsx
│   └── api/ai/
│       ├── settings/route.ts
│       ├── providers/
│       ├── models/
│       ├── assignments/route.ts
│       ├── entitlements/
│       ├── indexes/
│       ├── actions/
│       ├── searches/route.ts
│       ├── questions/route.ts
│       ├── optimizations/route.ts
│       ├── images/route.ts
│       └── generated-artifacts/[id]/
├── src/
│   ├── server/
│   │   ├── ai/
│   │   │   ├── registry.ts
│   │   │   ├── types.ts
│   │   │   ├── providers/
│   │   │   ├── chunking/
│   │   │   ├── prompts/
│   │   │   ├── retrieval/
│   │   │   └── events/
│   │   ├── services/
│   │   │   ├── ai-admin.ts
│   │   │   ├── ai-actions.ts
│   │   │   ├── ai-entitlements.ts
│   │   │   ├── ai-index.ts
│   │   │   └── ai-retrieval.ts
│   │   ├── jobs/
│   │   │   ├── ai-actions.ts
│   │   │   ├── ai-index.ts
│   │   │   └── ai-cleanup.ts
│   │   └── db/schema/
│   ├── components/
│   │   ├── admin/ai/
│   │   ├── chat/
│   │   ├── editor/
│   │   └── search/
│   └── hooks/
│       ├── use-ai-action.ts
│       └── use-ai-chat.ts
├── public/openapi.json
└── e2e/
    ├── ai-admin.spec.ts
    ├── ai-search.spec.ts
    ├── ai-chat.spec.ts
    └── ai-editor.spec.ts

packages/shared/src/
├── ai.ts
└── index.ts

docker-compose.yml
```

**Structure Decision**: Extend the constitutionally mandated full-stack
`apps/web` application. Provider integrations, retrieval, and jobs remain
server-only; shared Zod contracts live in the dependency-light
`packages/shared`; UI is split by existing admin/chat/editor component
boundaries.

## Complexity Tracking

No constitution violation requires an exception. The PostgreSQL image change is
an extension of the mandated database service, not an additional service. The
short-lived event table is justified by the combination of background-only
provider calls, reconnectable SSE, and non-persistent chat history.
