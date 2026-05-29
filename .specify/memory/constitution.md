<!--
SYNC IMPACT REPORT
==================
Version change: 1.1.0 -> 1.2.0 (MINOR: added product/operations guidance and
clarified architecture rules for the Wiki.js rewrite goal)
Modified:
  - Mission: clarified that next-wiki is a product rewrite of Wiki.js, not a
    line-by-line port or architecture clone
  - P1: expanded deployment simplicity into a default-stateful-dependency rule
  - P2: expanded AI optionality with privacy, provenance, and no-hidden-network
    requirements
  - P3: corrected renderer prohibition wording and made plugins explicit
  - P8: reconciled tRPC and REST/OpenAPI derivation rules
  - P9: narrowed explicit-registration rules so framework-owned Next.js routing
    conventions remain valid
  - P10 added: Operator Experience is Product Surface
  - P11 added: Rewrite Wiki.js, Do Not Recreate Its Complexity
  - Page Tree & Path System: fixed locale-aware page identity and redirect
    permission leakage
  - Multi-language Content: aligned translations with the page identity model
  - API Architecture: clarified tRPC, REST, and MCP contracts and exceptions
  - AI Knowledge Layer: added grounding, source revision, rebuild, and privacy
    requirements
  - Technology Decisions: updated framework target to Next.js 16 + React 19.2
    and added Node.js runtime baseline
  - Project Structure: fixed Next.js server import boundary and added REST/MCP
    route locations
  - Frontend Data Flow: added React Server Component and client state boundaries
  - Governance: clarified two-maintainer ratification before amendment merge
Added sections:
  - Product Scope & Feature Tiers
  - Deployment & Operations Baseline
Removed sections:
  - None
Templates requiring updates: N/A (no templates exist yet)
Deferred TODOs: None
-->

# next-wiki Project Constitution

**Version**: 1.2.0
**Ratification Date**: 2026-05-29
**Last Amended**: 2026-05-30

---

## Mission

next-wiki is an open-source, self-hosted wiki system for personal and
enterprise knowledge management. It is a product rewrite of Wiki.js: it keeps
the user-facing promise of a capable, approachable, self-hosted wiki, but it
does not copy Wiki.js internals, dependency sprawl, or all historical extension
surfaces.

next-wiki is deployed via Docker Compose or Kubernetes, built on Next.js,
TypeScript, and PostgreSQL, and designed to be simple to operate, easy to
extend, and optionally enhanced by LLM-powered AI features.

The project exists to deliver what Wiki.js promised with a cleaner architecture,
a modern stack, a smaller default scope, and AI-native knowledge retrieval as a
first-class optional capability.

---

## Core Principles

### P1: Simple Deployment is a Feature

The system MUST be deployable with a single `docker compose up`. The default
deployment MUST require PostgreSQL as its only stateful service. The default
deployment MAY run separate app and worker containers, but they MUST use the
same application image and MUST NOT require Redis, Elasticsearch, object
storage, external queues, or an LLM provider.

Every new default dependency or service requires explicit justification in the
feature spec. Optional features such as AI, Git sync, SSO, Meilisearch, object
storage, and MCP MUST NOT increase the baseline deployment footprint.

Rationale: Wiki.js accumulated many storage backends, search engines, auth
modules, and optional services. next-wiki chooses a smaller core so self-hosting
stays ordinary.

### P2: AI as Optional Enhancement

The system MUST function as a fully capable wiki without any LLM configuration.
AI features are activated only by explicit provider configuration, either via
environment variables (`LLM_PROVIDER`, `LLM_API_KEY`) or an encrypted admin
setting. The AI layer MUST NOT make outbound model calls, embedding calls, or
provider discovery calls when AI mode is disabled.

AI output MUST be grounded in retrieved page revisions and MUST expose citations
or source links in user-facing answers. AI features MUST degrade to ordinary
search, links, and summaries when provider credentials are absent or invalid.

Rationale: Forcing LLM dependencies raises the barrier to self-hosting and
creates privacy concerns for air-gapped or compliance-sensitive deployments.

### P3: Rendering Pipeline is Sacred

The content rendering pipeline (`source -> parse -> transform[] -> render`) MUST
be a first-class, pluggable pipeline from day one. Renderers MUST NOT be
hardcoded into page components. Every transformation step, including Markdown
parsing, syntax highlighting, math rendering, diagram rendering, embeds, and
link rewriting, MUST be a discrete, replaceable plugin with typed inputs and
outputs.

Rationale: Wiki.js tightly coupled editor format, render behavior, and runtime
module discovery. A clean pipeline prevents that lock-in while keeping Markdown
as the reference format.

### P4: Permissions are First-Class

The permission model (per-page, per-operation, per-group) MUST be designed into
the data model and API layer from the start, not bolted on later. Every API
route, server component loader, background job, search query, and AI retrieval
operation MUST check permissions before returning data. Anonymous read access
MUST be a configurable permission, not a special code path.

Rationale: Retrofitting fine-grained permissions onto an existing system is one
of the most expensive refactors possible. It touches every query, every API
endpoint, and every integration surface.

### P5: Style System Independence

The UI MUST be built on a design token system based on CSS custom properties.
Color, spacing, radius, and typography values MUST NOT be hardcoded in feature
component styles. Themes are JSON files that map to CSS variables. The default
theme MAY reference the visual character of Wiki.js documentation, but the
system MUST support full theme replacement without code changes.

### P6: Async-First for Heavy Operations

Any operation that may take more than 500ms (LLM calls, Git sync, bulk import,
export, search re-indexing, embedding rebuilds, email batches, or large asset
processing) MUST be executed as a background job via pg-boss. User-facing API
routes MUST return immediately with a job ID. The UI MUST reflect job status
asynchronously. Synchronous LLM calls in request handlers are PROHIBITED.

### P7: Version Everything

Every page save MUST create an immutable revision record. Deletion MUST be soft
by default (tombstone + retention policy). Diff between any two revisions MUST
be computable without reconstructing full history. The revision model MUST
support future Git sync without schema changes.

### P8: Open Standards Over Proprietary

The internal API MUST use tRPC for end-to-end TypeScript type safety, with Zod
schemas shared between server validation and client inference. The public API
for third-party integrations MUST be REST + JSON with OpenAPI documentation.
REST endpoints SHOULD be derived from tRPC procedures where the adapter can
preserve the contract cleanly. When a REST endpoint cannot be derived cleanly,
it MUST still use the same service layer and Zod schemas, and it MUST have an
explicit OpenAPI contract.

GraphQL is not the primary API. Local email/password authentication is the
baseline. Federated authentication MUST use OAuth 2.0 / OIDC standard flows
unless an enterprise SSO feature spec explicitly approves another protocol. AI
integration MUST use provider-agnostic interfaces, preferably OpenAI-compatible
HTTP APIs or explicit provider adapters. Export formats MUST include standard
Markdown + frontmatter. No vendor lock-in belongs in the critical path.

Rationale: tRPC eliminates the dual-maintenance burden of writing types twice
for internal CRUD-heavy UI work. REST + OpenAPI remains the stable public
contract for bots, scripts, integrations, and non-TypeScript clients.

### P9: Explicit Over Implicit

Application modules, services, render plugins, jobs, auth providers, AI
providers, and integration handlers MUST be explicitly registered in a single,
traceable entry point per subsystem. If a module exists but is not imported or
registered, it does not exist at runtime. Global singleton objects are
PROHIBITED. Dependencies are injected through function parameters or
framework-managed lifecycle such as Next.js App Router, route handlers, tRPC
context, and pg-boss job context.

Framework-owned conventions such as Next.js file-system routing are allowed.
Custom runtime discovery through filesystem scanning, filename conventions, or
dynamic imports is prohibited unless the feature spec defines a bounded registry
and testable loading contract.

Rationale: Wiki.js used `autoload()` for module discovery and a `WIKI` global
object for state sharing. That made the system fragile to restructure and hard
to test. next-wiki imports MUST be traceable.

### P10: Operator Experience is Product Surface

Installation, first-run setup, upgrades, backups, restores, health checks, and
configuration are product features, not afterthoughts. A default deployment MUST
include a web first-run flow for creating the initial admin account, an
idempotent migration path, a documented `.env` surface, a `/healthz` endpoint,
and a supported backup/restore path for PostgreSQL data plus local assets.

The application MUST NOT require internet access after images and packages have
been obtained. Update checks, telemetry, marketplace calls, theme downloads, and
language downloads MUST be opt-in.

Rationale: The project is meant to be easy to deploy and keep running. Agents
MUST treat operations work as part of the core product, not as documentation to
write later.

### P11: Rewrite Wiki.js, Do Not Recreate Its Complexity

Wiki.js is the product reference for user expectations, not the implementation
template. next-wiki MUST prioritize the common wiki workflows: create, edit,
organize, search, protect, version, import, export, and integrate. It MUST NOT
chase feature parity when parity would add default dependencies, multiple core
storage models, hard-to-test plugin magic, or permanent feature-flag branches.

Migration support from Wiki.js SHOULD focus on documented exports, Markdown
content, assets, users/groups where practical, and page metadata. Compatibility
work MUST be implemented as import/export tooling around the next-wiki data
model, not as legacy architecture inside the runtime.

Rationale: A rewrite succeeds by preserving the product value while cutting the
architecture down to the parts that remain understandable.

---

## Product Scope & Feature Tiers

These tiers guide AI agents when a feature request is underspecified.

### V1 Core

V1 core features MUST work without AI, Git sync, SSO, object storage,
Meilisearch, or Kubernetes:

- Spaces and hierarchical pages addressed by paths
- Markdown editing, preview, rendering, and reading
- Page create, edit, move, delete, restore, revision history, diff, and revert
- Assets stored on local filesystem by default
- Search backed by PostgreSQL full-text search
- Groups, users, sessions, page permissions, and anonymous read configuration
- Admin setup, user management, theme selection, health status, and job status
- Import/export for Markdown + frontmatter and local assets
- Docker Compose deployment, database migrations, backup, and restore

### V1 Optional

These features MAY ship in v1.x only if they do not expand the baseline
deployment footprint:

- AI knowledge layer, semantic search, summaries, and Q&A
- MCP server for AI agents
- Git sync
- SSO providers
- Meilisearch for CJK and large-scale search
- S3-compatible object storage for assets
- Additional editor formats and render plugins
- Kubernetes manifests

### Not in Scope for v1.x

Redis, Elasticsearch, multiple SQL database engines, separate microservices,
native mobile apps, real-time collaborative editing (CRDT), and application
layer DDoS protection are out of scope for v1.x. Operators SHOULD use a reverse
proxy or edge service for rate limiting and DDoS protection.

---

## Architectural Mandates

These are non-negotiable structural decisions that MUST be reflected in the
data model, API design, and module boundaries from the first commit.

### Page Tree & Path System

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

### Rendering Pipeline

The rendering pipeline MUST follow `source -> parse -> transform[] -> render`.
Each stage is a discrete function with a typed input/output contract.
Transformers such as syntax highlight, math, diagrams, embeds, and link
rewriters are registered plugins. Transformers MUST NOT access the database
directly; they receive resolved inputs, capability objects, or asset loaders
from the pipeline context. The pipeline MUST be executable server-side and
cacheable per revision hash.

### Permission Model

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

### Content Versioning

Every page mutation creates a `page_revision` row with revision number, author,
timestamp, locale, content type, content hash, and full content snapshot. The
current page row holds a foreign key to the latest revision. Diff is always
computed at the source level (raw Markdown or raw source text), never on
rendered HTML. This means diff output is meaningful for any registered editor
format without requiring the editor plugin to be present.

Revisions are NEVER deleted by normal operations. Only a configurable retention
policy job MAY prune them, and that job MUST preserve enough metadata to
explain that pruning happened.

### Multi-language Content

A page path is language-neutral. Translations are localized page records keyed
by `(space_id, path, locale)` and linked by `translation_group_id`. The default
locale is configurable per space. The UI MUST fall back gracefully when a
translation is missing by showing the default locale with a clear banner. The
data model MUST NOT conflate locale with path hierarchy.

Permissions are NOT inherited across translations. Each localized page record is
an independent page resource with its own permission entries. Write access to
the English page does not imply write access to the French page. This keeps the
permission model uniform and avoids a special-case inheritance path.

### Editor Extensibility

The editor layer is a pluggable interface with separate write-side and read-side
contracts. The write-side interface is:
`{ id, label, contentType: string, EditorComponent, serialize(state): string }`.
`contentType` declares the MIME type of the serialized output, such as
`text/markdown` or `text/asciidoc`. `serialize` MUST return raw source text,
never HTML. The read-side is handled entirely by the rendering pipeline; editor
plugins have no render responsibility.

The client-server boundary is strict. The default Markdown editor uses Tiptap
(ProseMirror-based) on the client. Tiptap's internal ProseMirror AST MUST NEVER
leave the browser. The editor serializes to raw Markdown text, which is stored
in the database. On the server, remark/rehype parses that raw Markdown into a
separate AST for rendering. These are independent AST systems connected only by
raw source text.

Markdown is the default and reference implementation. Additional editors
(WYSIWYG, AsciiDoc, reStructuredText) are registered plugins. Editor plugins
MUST NOT be required for reading or rendering existing content.

### Git Storage Sync

Git sync is an optional, async, one-way or two-way bridge between the wiki
database and a Git repository. It MUST be implemented as a pg-boss job, never as
a synchronous request operation. The page revision model MUST allow a Git commit
hash to be stored alongside a revision record without schema changes. Git sync
is disabled by default.

Two-way sync implementation MUST NOT ship until its feature spec defines
conflict detection, conflict presentation, conflict resolution, retry behavior,
and permission checks. The default product MUST remain database-backed even when
Git sync is enabled.

### API Architecture

next-wiki exposes three API layers, all backed by the same service layer and Zod
schemas:

| Layer | Consumers | Auth | Format |
|-------|-----------|------|--------|
| tRPC | Next.js frontend | Session (Better Auth) | TypeScript-native |
| REST + OpenAPI | Bots, integrations, external clients | API token | HTTP + JSON |
| MCP Server | AI agents and coding assistants | API token | Model Context Protocol |

Rules:

- Business logic lives in the service layer only. API layers are thin adapters.
- All API layers share Zod schemas for input validation and output contracts.
- tRPC is the primary development interface for the first-party web app.
- REST is derived from tRPC where possible; hand-written REST endpoints require
  explicit OpenAPI contracts and MUST call the same services.
- REST API versioning is URL-based (`/api/v1/`, `/api/v2/`). Breaking public
  API changes require a new major version prefix.
- MCP is optional and MAY be enabled independently of public REST, but it uses
  the same token scopes, permission model, and services.
- API tokens are scoped (`read`, `write`, `admin`, `ai`, `mcp`) and managed via
  the admin panel.
- MCP tools that return page content MUST return source revision identifiers or
  citations. MCP tools that mutate content MUST require write scope and MUST
  create normal page revisions.
- API layers MUST NOT bypass the permission model.

### Deployment & Operations Baseline

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

### AI Knowledge Layer

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

---

## Anti-Patterns (Lessons from Wiki.js)

These patterns are PROHIBITED. Any PR introducing them MUST be rejected.

- **Feature parity chase with Wiki.js**: Matching a Wiki.js feature is not a
  reason to add a default dependency, architecture branch, or permanent runtime
  option. The feature MUST fit next-wiki's smaller model.
- **REST as sole API for internal consumption**: Internal frontend-backend
  communication MUST use tRPC. REST is reserved for the public integration API.
- **GraphQL as primary API**: Adds schema maintenance overhead without enough
  benefit for this product.
- **Multiple database engines in core**: next-wiki uses PostgreSQL. Other SQL
  engines are not supported in v1.x.
- **Multiple page storage backends in core**: next-wiki uses PostgreSQL for page
  records and local filesystem for default assets. S3-compatible object storage
  is an optional asset backend, not a page storage backend.
- **Synchronous LLM or heavy operations in request handlers**: Any operation
  that calls an external service or may take more than 500ms goes through
  pg-boss.
- **Hardcoded admin bypass in permission checks**: Every query goes through the
  permission layer with an explicit actor context.
- **Editor format stored as rendered HTML**: Always store raw source. HTML is
  always derived, never canonical.
- **Monolithic page component that owns rendering**: The rendering pipeline is a
  separate, testable module. Page components call it; they do not contain it.
- **AI answers without citations**: User-facing AI output MUST be grounded in
  permitted source revisions.
- **Hidden network calls**: Update checks, telemetry, provider discovery, theme
  downloads, and language downloads are opt-in.
- **Feature flags as permanent code paths**: Feature flags are for rollout, not
  permanent conditional logic. Ship the feature or remove it.

---

## Technology Decisions

These decisions are fixed for v1.x. Changes require a constitution amendment.

| Concern | Decision | Rationale |
|---------|----------|-----------|
| Framework | Next.js 16 + React 19.2 + TypeScript | Modern App Router, React Server Components, current React baseline |
| Runtime | Node.js 20.9+ minimum; Docker image tracks current LTS | Matches Next.js 16 runtime floor while keeping deployment conservative |
| Database | PostgreSQL 16+ | Full-text search, pgvector, pg-boss, JSONB |
| ORM | Drizzle ORM | SQL-first, pure TS schema, zero generation step, native Zod integration |
| Job Queue | pg-boss | Runs in PostgreSQL, zero extra services |
| Auth | Better Auth | Local auth baseline, OAuth/OIDC support, Drizzle adapter, self-host friendly |
| API (internal) | tRPC | End-to-end type safety, zero codegen, Zod schema shared |
| API (public REST) | REST + OpenAPI | Third-party integrations, scriptable clients, stable public contract |
| API (AI agents) | MCP Server (optional) | AI-agent integration over permissioned tools |
| Markdown Parser | unified / remark / rehype | AST-based, pluggable, server-side rendering |
| Editor (client) | Tiptap (ProseMirror) | Rich Markdown editing; AST stays in browser |
| Vector Search | pgvector (PostgreSQL extension) | No extra service, integrates with PostgreSQL |
| Full-text Search | PostgreSQL tsvector default + Meilisearch optional | Zero-dependency baseline; Meilisearch for CJK and scale |
| Styling & UI | Mantine + Tailwind CSS + CSS custom properties | Mantine for admin controls; Tailwind for content layout; tokens for themes |
| Containerization | Docker Compose + Kubernetes manifests | Single compose for normal install; K8s for production operators |
| Testing | Vitest + Playwright | Unit/integration plus E2E coverage |
| LLM Integration | OpenAI-compatible API plus provider adapters | Provider-agnostic, works with self-hosted or commercial compatible LLMs |
| Monorepo | pnpm workspaces + Turborepo | Shared packages, fast incremental builds |

---

## Project Structure

This layout is NON-NEGOTIABLE. AI agents MUST NOT generate a different
directory structure. Any deviation requires a constitution amendment.

```
next-wiki/
├── apps/
│   └── web/                        # Next.js full-stack application
│       ├── app/                    # App Router routes and route shells
│       │   ├── (public)/           # Public content pages (SSR + SEO)
│       │   ├── (auth)/             # Login / register
│       │   ├── (admin)/            # Admin dashboard
│       │   ├── (editor)/           # Page editor
│       │   └── api/
│       │       ├── trpc/[trpc]/    # tRPC HTTP handler
│       │       ├── v1/             # Public REST route handlers
│       │       └── mcp/            # Optional MCP transport handlers
│       └── src/
│           ├── server/             # Server-only code
│           │   ├── trpc/           # tRPC routers and procedures
│           │   ├── rest/           # REST adapters and OpenAPI metadata
│           │   ├── mcp/            # MCP tool adapters
│           │   ├── services/       # Business logic layer
│           │   ├── db/             # Drizzle schema + migrations
│           │   ├── auth/           # Better Auth integration
│           │   ├── pipeline/       # Rendering pipeline (remark/rehype)
│           │   ├── ai/             # Optional AI provider and retrieval layer
│           │   └── jobs/           # pg-boss job definitions
│           ├── client/             # Client-only code
│           ├── components/
│           │   ├── ui/             # Mantine wrappers
│           │   ├── admin/          # Admin dashboard components
│           │   ├── editor/         # Editor components (Tiptap)
│           │   └── common/         # Shared components
│           └── hooks/              # Custom React hooks
├── packages/
│   ├── shared/                     # Zod schemas, types, constants
│   └── editor/                     # Tiptap extensions, CodeMirror configs
├── docker/                         # Dockerfiles and compose files
├── turbo.json
└── pnpm-workspace.yaml
```

Key rules derived from this structure:

- `src/server/` MUST NOT be imported by Client Components, `src/client/`, or
  browser-only packages.
- Server Components, route handlers, and server actions MAY import `src/server/`
  through designated server entry modules.
- Files under `app/` are route shells. Business logic lives in `src/server/`.
- Mantine MUST only be imported inside `src/components/ui/`. All other
  components use the `ui/` wrappers. This isolates the component library from
  the rest of the codebase.
- `packages/shared/` has zero runtime dependencies. It contains only types, Zod
  schemas, constants, and pure utility functions.

---

## Frontend Data Flow

These rules are NON-NEGOTIABLE. Violations are architecture defects.

| Data type | Storage | Access pattern |
|-----------|---------|----------------|
| Server-rendered page data | React Server Components | Server service calls with permission context |
| Client server state (CRUD) | TanStack Query cache | `useQuery` / `useMutation` via tRPC |
| Client UI state | Zustand | `useStore` |
| Form state | React Hook Form | `useForm` / `useController` |
| URL / filter state | Next.js search params | `searchParams` / `useSearchParams` |
| Auth session | Better Auth session | Server auth context / `useSession` |
| Job progress | TanStack Query polling or subscription adapter | Job status endpoint |

Storing server-derived data in Zustand is PROHIBITED. TanStack Query is the
client server-state manager. Caching API responses in Zustand is an architecture
violation. If a client component needs server data, it uses tRPC through
TanStack Query. If it needs shared UI state, it uses Zustand. These concerns
MUST NOT be mixed.

React Server Components MAY fetch server data directly through service-layer
entry points, but they MUST construct and pass a permission context. Client
Components MUST NOT import server services.

---

## Governance

### Amendment Procedure

1. Open a GitHub Discussion or issue proposing the amendment with rationale.
2. Allow 7 days for community comment unless the project founder declares the
   amendment urgent before a public community exists.
3. Open an amendment PR that updates the constitution version.
4. Obtain approval from two active maintainers before merge. If the project has
   fewer than two active maintainers, approval from the founder satisfies this
   ratification requirement.
5. All dependent templates and docs MUST be updated in the same PR.

### Versioning Policy

- **MAJOR**: Removal or redefinition of a Core Principle or Architectural Mandate.
- **MINOR**: New principle, mandate, section, or technology decision added.
- **PATCH**: Clarifications, wording fixes, typo fixes, non-semantic refinements.

### Compliance Review

Every feature PR MUST include a checklist item confirming no Anti-Patterns were
introduced. Architecture-affecting PRs MUST reference the relevant Core
Principle or Architectural Mandate they satisfy or amend. Features that touch
deployment, permissions, AI, import/export, or public APIs MUST include tests or
manual verification notes for those surfaces.

### Ratifiers

This constitution was ratified by the project founder on 2026-05-29.
Subsequent amendments are ratified by any two active maintainers, or by the
founder while the project has fewer than two active maintainers.
