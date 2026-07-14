# Architectural Mandates

**Status**: Constitutionally binding. Elaborates Core Principles P1–P12 in
`.specify/memory/constitution.md`.
**Change control**: These mandates are non-negotiable structural decisions. A
deviation requires a constitution amendment (see constitution § Governance).
Editorial refinement that does not change an invariant may proceed via normal
PR review.

These mandates MUST be reflected in the data model, API design, and module
boundaries from the first commit.

---

## Page Tree & Path System

Pages are addressed by hierarchical paths such as
`/engineering/backend/auth`. The canonical public page key is
`(space_id, path, locale)`. The path is language-neutral; the locale selects the
localized page record. A space MAY have one `/getting-started` page per locale,
and another space MAY have its own `/getting-started` pages. Internal surrogate
IDs MAY exist for foreign keys, but routing, imports, exports, permissions, and
public APIs MUST treat the path key as canonical.

The data model MUST store path and locale as first-class indexed fields. Pages
in the same translation group share a `translation_group_id`. The tree
structure MUST be derivable from paths alone, without a separate adjacency
table.

Moving a page MUST update the path and create redirect records. A redirect
record contains `(space_id, from_path, to_path, created_at)` and applies to all
locale variants unless a feature spec defines locale-specific redirects. If a
new page is created at a previously redirected path, the redirect is deleted.
Redirect chains are resolved to their final target at write time, not read time.

Redirect handling MUST NOT leak protected page existence or destination paths.
Routing MAY resolve a redirect internally to identify the final target, but the
response MUST check read permission against the final target before returning a
redirect, page content, or canonical URL. Unauthorized callers receive the same
not-found or forbidden behavior used for direct access to the target.

Pages MUST be indexed for PostgreSQL full-text search at save time. Search
queries MUST enforce the caller's permission context before returning results.
Search indexing respects the page locale.

## Search Retrieval Architecture

Search is a retrieval subsystem with stable product capabilities, not a set of database-specific endpoint branches. The initial capabilities are `full_text`, `fuzzy`, and `semantic`: their default adapters use PostgreSQL `tsvector`, PostgreSQL `pg_trgm`, and `pgvector` respectively. A capability ID, its setting, and its client-facing lifecycle MUST remain stable when an adapter is replaced by another PostgreSQL, self-hosted, or managed implementation.

Rules:

- Capability adapters are server-only and MUST be explicitly registered in one static registry. Dynamic module discovery is prohibited.
- The search coordinator is the only layer that selects enabled capabilities, starts them concurrently, resumes asynchronous work, de-duplicates candidates, fuses rank positions, and formats a public search result.
- An adapter MAY return only bounded internal candidates, local rank, and safe excerpt evidence. It MUST NOT construct a public page result, bypass the shared visibility projection, or expose raw engine/provider diagnostics.
- The coordinator MUST apply published-state, space, locale, and read permission checks before a page title, excerpt, count, rank, or source is returned. Failed or unavailable engines expose only non-sensitive lifecycle states and never protected-page existence.
- Enabled capabilities start independently. Immediate local retrieval may finish in the request; work that can exceed the request budget MUST have a durable resumable lifecycle. One capability's delay or failure MUST NOT hide another capability's usable results. Immediate PostgreSQL windows MUST use database-enforced cancellation, never a client-only timeout that leaves a query running.
- Cross-capability order MUST use engine-local rank fusion with deterministic exact path/title/term protection. Raw full-text, trigram, and vector scores MUST NOT be compared as a common scale.
- The legacy GET page-search operation remains a pure read. The interactive POST lifecycle is the single progressive search resource; it returns capability-level state additively and is never a public-reader cache input.

Page revisions remain the source of truth. All search indexes and engine runs are derived, rebuildable state. Search settings select capabilities for new attempts; each accepted attempt retains its own capability snapshot so a later administrator change cannot alter an in-progress result lifecycle. The bounded immediate-keyword timeout is an operational safety setting and applies to the current request; it is not a per-engine ranking control.

## Rendering Pipeline

The rendering pipeline MUST follow `source -> parse -> transform[] -> render`.
Each stage is a discrete function with a typed input/output contract.
Transformers such as syntax highlight, math, diagrams, embeds, and link
processors are registered plugins. Transformers MUST NOT access the database
directly; they receive resolved inputs, capability objects, or asset loaders
from the pipeline context. The pipeline MUST be executable server-side and
cacheable per revision hash.

## Permission Model

The permission model has three axes: **subject** (user or group), **resource**
(space, page, asset, job, or integration token), and **action** (read, write,
delete, manage, execute). Permissions are evaluated in order: explicit deny >
explicit allow > inherited from parent page > space default > global default.
The parent of a top-level page is its space.

When a page is moved between spaces, its explicit page-level permissions are
dropped and it inherits from the destination space. This is the only safe
default because the source space's permission context no longer applies. Admin
capability is modeled inside the permission context; data-fetching functions
MUST NOT contain hardcoded admin bypass branches.

Every data-fetching function MUST accept a permission context and enforce it.
Background jobs and AI retrieval jobs MUST run with an explicit actor context:
the user who requested the job, a scoped system actor, or a scoped integration
token.

## Content Versioning

Every page mutation creates a `page_revision` row with revision number, author,
timestamp, locale, content type, content hash, and full content snapshot. The
current page row holds a foreign key to the latest revision. Diff is always
computed at the source level (raw Markdown or raw source text), never on
rendered HTML. This means diff output is meaningful for any registered editor
format without requiring the editor plugin to be present.

Revisions are NEVER deleted by normal operations. Only a configurable retention
policy job MAY prune them, and that job MUST preserve enough metadata to
explain that pruning happened.

## Multi-language Content

A page path is language-neutral. Translations are localized page records keyed
by `(space_id, path, locale)` and linked by `translation_group_id`. The default
locale is configurable per space. The UI MUST fall back gracefully when a
translation is missing by showing the default locale with a clear banner. The
data model MUST NOT conflate locale with path hierarchy.

Permissions are NOT inherited across translations. Each localized page record is
an independent page resource with its own permission entries. Write access to
the English page does not imply write access to the French page. This keeps the
permission model uniform and avoids a special-case inheritance path.

## Editor Extensibility

The editor layer is a pluggable interface with separate write-side and read-side
contracts. The write-side interface is:
`{ id, label, contentType: string, EditorComponent, serialize(state): string }`.
`contentType` declares the MIME type of the serialized output, such as
`text/markdown` or `text/asciidoc`. `serialize` MUST return raw source text,
never HTML. The read-side is handled entirely by the rendering pipeline; editor
plugins have no render responsibility.

The client-server boundary is strict. The default Markdown editor uses
CodeMirror 6 on the client. Any client-side editor state (CodeMirror's
document/editor state, or another editor's internal AST) MUST NEVER leave the
browser. The editor serializes to raw Markdown text, which is stored in the
database. On the server, remark/rehype parses that raw Markdown into a separate
AST for rendering. These are independent representations connected only by raw
source text.

Markdown is the default and reference implementation. Additional editors
(WYSIWYG, AsciiDoc, reStructuredText) are registered plugins. Editor plugins
MUST NOT be required for reading or rendering existing content.

## Git Storage Sync

Git sync is an optional, async, one-way or two-way bridge between the wiki
database and a Git repository. It MUST be implemented as a pg-boss job, never as
a synchronous request operation. The page revision model MUST allow a Git commit
hash to be stored alongside a revision record without schema changes. Git sync
is disabled by default.

Two-way sync implementation MUST NOT ship until its feature spec defines
conflict detection, conflict presentation, conflict resolution, retry behavior,
and permission checks. The default product MUST remain database-backed even when
Git sync is enabled.

## API Architecture

next-wiki exposes two API layers, both backed by the same service layer and Zod
schemas:

| Layer | Consumers | Auth | Format |
|-------|-----------|------|--------|
| REST route handlers (+ OpenAPI) | Next.js frontend, bots, integrations, external clients | Session cookie (first-party) or API token (external) | HTTP + JSON |
| MCP Server | AI agents and coding assistants | API token | Model Context Protocol |

The first-party web app uses the same REST route handlers (Next.js App Router
`app/api/*`) via `fetch` through TanStack Query; there is no separate tRPC
layer. A typed client wrapper MAY be generated from the OpenAPI contract, but
the wire protocol is plain HTTP + JSON shared with external consumers.

Rules:

- Business logic lives in the service layer only. API layers are thin adapters.
- All API layers share Zod schemas for input validation and output contracts.
- The REST route handlers are the primary interface for the first-party web app
  and the public contract for external clients; they are the same surface.
- Public REST endpoints require explicit OpenAPI contracts and MUST call the
  same services.
- REST API versioning is URL-based (`/api/v1/`, `/api/v2/`). Breaking public
  API changes require a new major version prefix. (The current slice ships
  unversioned internal routes; the `/api/v1/` prefix is introduced when the
  public REST contract is frozen.)
- `apps/web/public/openapi.json` is a generated artifact. API contract changes
  MUST update route annotations and OpenAPI-facing Zod schemas first, then run
  `pnpm --filter @next-wiki/web openapi:generate`; direct hand edits to the
  generated JSON are not allowed.
- Public API route annotations MUST use the next-openapi-gen-supported tags
  (`@body`, `@response`, `@queryParams`, `@params`) and schema names exported
  from `apps/web/src/server/api/openapi-schemas.ts`. Public request and
  response schemas SHOULD be generated from those Zod definitions; post-
  generation scripts MAY only normalize generator output or document transport
  details that the generator cannot express, such as multipart upload and binary
  download media types.
- `/api/openapi.json` serves the full generated REST specification. `/api-docs`
  and `/api/public-openapi.json` expose the filtered Public v1 contract for
  external automation clients.
- MCP is optional and MAY be enabled independently of public REST, but it uses
  the same token scopes, permission model, and services.
- API tokens are scoped (`read`, `write`, `admin`, `ai`, `mcp`) and managed via
  the admin panel.
- MCP tools that return page content MUST return source revision identifiers or
  citations. MCP tools that mutate content MUST require write scope and MUST
  create normal page revisions.
- API layers MUST NOT bypass the permission model.

## Deployment & Operations Baseline

The default Docker Compose deployment MUST include PostgreSQL, the next-wiki
application, and any required worker process. PostgreSQL data and local assets
MUST be mounted on named volumes. The application image MUST run migrations
idempotently or provide a documented one-command migration step.

The application MUST expose:

- `/healthz` for process and dependency health
- `/readyz` for readiness after migrations and required startup checks
- A job status surface for long-running imports, exports, AI ingestion, search
  indexing, and Git sync
- Structured logs suitable for container runtimes
- A documented backup and restore procedure for PostgreSQL plus local assets

Configuration MUST be expressible through environment variables and persisted
admin settings. Secrets stored in the database MUST be encrypted at rest using a
deployment-provided secret key.

## AI Knowledge Layer

When AI mode is active, each indexed page revision MAY have an associated
knowledge record containing embedding vector, provider/model metadata,
LLM-generated summary, extracted entities, cross-reference links, source
revision hash, and ingestion timestamp. This record is populated asynchronously
by an ingest worker after each page save.

Raw page revisions are the source of truth. The knowledge layer is a derived,
rebuildable index. AI retrieval MUST respect space, path, locale, and permission
scope. AI answers MUST be grounded in retrieved revisions and expose citations
or source links. If no permitted source supports an answer, the UI MUST say so
instead of inventing unsupported content.

Embedding and summary jobs MUST be restartable and idempotent. Changing the
embedding model or summary prompt MUST create a new index version or trigger a
tracked rebuild job.

## AI Chat Side Pane

The AI chat side pane is the primary user-facing AI interaction surface. It is
a persistent, collapsible panel rendered alongside the main content area on
reader pages, the editor, and the admin dashboard. It is only rendered when AI
mode is active.

**Context and scope:**
- The pane is context-aware: it receives the current page's `(space_id, path,
  locale, revision_hash)` as implicit context for every message.
- Users MAY explicitly expand scope to the full wiki or a specific space.
- All retrieval is permission-scoped: the pane MUST NOT surface content the
  current user cannot read.

**Capabilities:**
- Answer questions grounded in retrieved page revisions with citations.
- Generate a new page draft from a conversation; the draft opens in the editor
  and MUST NOT be auto-published.
- Suggest edits to the current page; suggestions appear as a diff the user
  reviews and accepts or rejects before any write occurs.
- Summarize the current page or a set of search results.

**Streaming and state:**
- Responses MUST stream via Server-Sent Events (SSE). The pane renders tokens
  as they arrive.
- Chat history is session-scoped by default and is NOT persisted to the
  database unless a future feature spec defines a persistence model.
- Each assistant turn MUST include source citations (page path + revision hash)
  for any retrieved content used in the answer.

**Boundaries:**
- The chat pane MUST NOT auto-execute write operations. Every mutation
  (create page, update page) requires explicit user confirmation.
- The chat pane MUST NOT expose content from spaces or pages the user cannot
  read, even as indirect evidence in an answer.
- If AI mode is disabled, the pane is hidden entirely; no placeholder or
  upsell UI is shown in the default layout.

## Frontend Routing & URL Contract

The frontend is a Next.js App Router application. Every user-facing state that a
user would reasonably want to share, bookmark, or return to MUST have a distinct
URL. Routing, breadcrumbs, and navigation MUST satisfy the rules below. These
rules are non-negotiable; any PR that violates them is an architecture defect.

**URL design:**

- Public page URL: `/<space-slug>/<path>` (for example,
  `/engineering/backend/auth`). The space slug and the page path together form
  the canonical resource identifier shown in the address bar.
- Editor URL for a page: `/<space-slug>/<path>/edit`.
- Revision URL: `/<space-slug>/<path>/revisions/<n>`. Diff URL:
  `/<space-slug>/<path>/revisions/<a>..<b>`.
- History URL: `/<space-slug>/<path>/history`.
- Admin URLs live under `/admin/<resource>` and use the same RESTful
  conventions as content URLs (collection, member, sub-resource).
- Auth URLs live under `/auth/<action>` (for example, `/auth/login`,
  `/auth/register`).
- Search queries, filters, sort order, pagination, and view mode MUST be
  expressed as URL search params so that refresh and share preserve the view.
- Verb-style path segments (`/createPage`, `/doSave`, `/deleteUser`) are
  PROHIBITED. Mutations use HTTP methods, server actions, or dedicated
  sub-resources.

**Breadcrumbs:**

- A breadcrumb component MUST render on every page except the site root and
  full-screen flows that a feature spec explicitly exempts (for example, a
  distraction-free preview mode).
- Breadcrumb segments are derived from the current URL and the page tree, never
  hand-coded per page.
- The final breadcrumb segment represents the current resource. Intermediate
  segments link to their parent collection, space, or dashboard.
- Breadcrumbs MUST NOT reveal the existence of a resource the current user
  cannot read. Segments that resolve to protected ancestors collapse to the
  nearest visible ancestor.

**Browser-native behavior:**

- Back, forward, and refresh MUST return the user to a valid, equivalent state.
- Form submissions and mutations MUST use POST/PUT/DELETE semantics or server
  actions. GET MUST never mutate state.
- Modals, drawers, and panels that represent distinct user-reachable states
  MUST be backed by a URL (typically a search param). Transient confirm
  dialogs and hover popovers are exempt.
- The 404 and 403 surfaces MUST be real navigable URLs so that browser history
  stays linear and the user can back out of them.
- Client-side navigation MUST push a history entry for every route change. URLs
  that change content without updating the address bar or history are
  PROHIBITED.

**Canonical entry points:**

- Each resource

## Public Content Delivery

An anonymously readable, published page is a public document, not a
session-specific application view. Its document body, public metadata, and
published navigation MUST be delivered from a static or ISR representation at
the canonical reader URL. The cached representation MUST use only anonymous
published data; it MUST NOT contain drafts, permission-dependent content, or
values derived from cookies, request headers, or a session.

Authenticated controls (edit/history actions, AI chat, user appearance, and
other personal preferences) are dynamic client or server boundaries around the
public document. They MAY be hydrated after the document has been delivered,
but MUST NOT turn the document body into a per-request render. Authorization is
still enforced by every edit, history, AI, and API endpoint; a visible control
is never authorization.

The cache contract is explicit:

- Published reader routes use ISR with a bounded revalidation interval and
  support on-demand revalidation.
- A publish, unpublish, delete, path/title/metadata change, translation state
  change, language availability change, or public tree change MUST invalidate
  the affected reader URL(s), the public listing/homepage when relevant, and
  the public navigation representation.
- Page content uses a shared public-content cache tag so data and route output
  are invalidated together. Cache invalidation is performed only after the
  underlying transaction commits.
- Private spaces, private pages, previews, and drafts are always dynamic and
  are excluded from public cache keys and public static output.

### UI locale separation

The interface language is resolved by `apps/web/src/i18n/resolve.ts` and is
limited to the registered UI locales (`en`, `zh`). It is selected from the
authenticated preference, the `next-wiki-locale` cookie, weighted
`Accept-Language`, and finally English. UI locale changes MUST NOT add a URL
segment, redirect, rewrite a reader path, or invoke public-content
revalidation.

The content-translation locale in `pages.locale` and the existing `/{locale}`
reader convention are independent domain data. A leading `zh` in `/zh/guide`
continues to identify translated page content, never a Chinese UI around
`/guide`. Public document and SEO output MUST use request-independent locale
inputs; personalized labels may hydrate through the client boundary after
delivery.
