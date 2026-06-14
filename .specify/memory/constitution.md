<!--
  Sync Impact Report
  ==================
  Version change: 1.2.0 -> 1.3.0
  Bump rationale: MINOR — restructure to separate durable governance
  (constitution: principles, anti-patterns, decisions) from detailed
  architecture reference. No principle removed or redefined; all mandates
  relocated verbatim to docs/architecture/ and referenced by a short index.
  P5 and P12 trimmed back to terse declarations since their operational
  detail now lives in docs/architecture/mandates.md.

  Relocated (binding text unchanged, now in docs/architecture/):
    - Architectural Mandates (12 mandates) -> docs/architecture/mandates.md
    - Project Structure                  -> docs/architecture/project-structure.md
    - Frontend Data Flow                 -> docs/architecture/frontend-data-flow.md

  Modified principles:
    - P5 trimmed (detail moved to docs/architecture/mandates.md)
    - P12 trimmed (URL schemes moved to docs/architecture/mandates.md)

  Added sections:
    - "Architectural Mandates" index (links to docs/architecture/)

  Removed sections (content relocated, not deleted):
    - Detailed Architectural Mandates body
    - Project Structure body
    - Frontend Data Flow body

  Templates requiring updates:
    - .specify/templates/plan-template.md       — no change (Constitution
      Check derives gates from principles + index, which remain in this file)
    - .specify/templates/spec-template.md        — no change (generic)
    - .specify/templates/tasks-template.md       — no change (generic)

  Follow-up TODOs: none. When a mandate in docs/architecture/ changes in a way
  that redefines an invariant, bump the constitution version per Governance.
-->

# next-wiki Project Constitution

**Version**: 1.3.0
**Ratification Date**: 2026-05-30
**Last Amended**: 2026-06-14

---

## Mission

next-wiki is an open-source, self-hosted wiki system for personal and
enterprise knowledge management. It exists to make durable knowledge easy to
write, organize, search, protect, integrate, and operate.

next-wiki is deployed via Docker Compose or Kubernetes, built on Next.js,
TypeScript, and PostgreSQL, and designed around a small default footprint. AI
capabilities are first-class integrations: when an LLM provider is configured,
a persistent AI chat side pane is available throughout the wiki, letting users
ask questions, explore content, and generate new pages through conversation.
The wiki remains fully useful without an LLM provider.

The project optimizes for operational simplicity, clear architecture, reliable
permissions, versioned content, open integration surfaces, and grounded AI
retrieval over broad feature accumulation.

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

Rationale: Self-hosted software succeeds when installation, backup, upgrade, and
debugging stay ordinary. A smaller core is easier to trust and maintain.

### P2: AI as Optional Enhancement, Chat as First-Class UI

The system MUST function as a fully capable wiki without any LLM configuration.
AI features are activated only by explicit provider configuration via environment
variables (`LLM_PROVIDER`, `LLM_API_KEY`) or an encrypted admin setting. The AI
layer MUST NOT make outbound model calls, embedding calls, or provider discovery
calls when AI mode is disabled.

When AI mode is active, a persistent **AI chat side pane** MUST be available
throughout the wiki — on reader pages, the editor, and the admin dashboard. The
chat pane is the primary AI interaction surface. It is context-aware (knows the
current page), permission-scoped (only retrieves content the user can read), and
capable of answering questions, generating page drafts, and suggesting edits.
Generated content MUST go through the normal page creation or edit flow and MUST
NOT be auto-published without user confirmation.

AI output MUST be grounded in retrieved page revisions and MUST expose citations
or source links in user-facing answers. AI features MUST degrade gracefully when
provider credentials are absent or invalid.

Rationale: AI should improve retrieval and synthesis without making the wiki
dependent on a model provider or unsafe for private deployments. The chat pane
makes AI interaction discoverable and consistent rather than scattered across
individual features.

### P3: Rendering Pipeline is Sacred

The content rendering pipeline (`source -> parse -> transform[] -> render`) MUST
be a first-class, pluggable pipeline from day one. Renderers MUST NOT be
hardcoded into page components. Every transformation step, including Markdown
parsing, syntax highlighting, math rendering, diagram rendering, embeds, and
link processing, MUST be a discrete, replaceable plugin with typed inputs and
outputs.

Rationale: Content rendering is core infrastructure. Keeping it explicit and
replaceable makes new content types possible without coupling editors, storage,
and page components together.

### P4: Permissions are First-Class

The permission model (per-page, per-operation, per-group) MUST be designed into
the data model and API layer from the start, not bolted on later. Every API
route, server component loader, background job, search query, and AI retrieval
operation MUST check permissions before returning data. Anonymous read access
MUST be a configurable permission, not a special code path.

Rationale: Permissions touch every query, every integration surface, and every
AI retrieval path. Treating them as infrastructure prevents expensive retrofits
and data leaks.

### P5: Style System Independence & UI Consistency

The UI MUST be built on a design token system (CSS custom properties). Color,
spacing, radius, and typography MUST NOT be hardcoded in feature components.
Themes are JSON files mapping to CSS variables; the system MUST support full
theme replacement without code changes.

All visual resources (icons, fonts, stylesheets, components) MUST flow through
one unified design system surface in `src/components/ui/`. Vendored copies and
ad-hoc per-feature assets are PROHIBITED. The overall UI/UX style MUST be
consistent across every page (reader, editor, admin, auth, chat); divergence
MUST be expressed as tokens or shared components, never inline overrides.

Rationale: A single source of truth for styling and resources keeps the product
coherent and themeable as the codebase grows.

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

Rationale: tRPC keeps first-party development type-safe and fast. REST + OpenAPI
provides the stable public contract for scripts, integrations, bots, and
non-TypeScript clients.

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

Rationale: Explicit registration makes the system understandable by reading the
entry points and testable without hidden runtime state.

### P10: Operator Experience is Product Surface

Installation, first-run setup, upgrades, backups, restores, health checks, and
configuration are product features, not afterthoughts. A default deployment MUST
include a web first-run flow for creating the initial admin account, an
idempotent migration path, a documented `.env` surface, a `/healthz` endpoint,
and a supported backup/restore path for PostgreSQL data plus local assets.

The application MUST NOT require internet access after images and packages have
been obtained. Update checks, telemetry, marketplace calls, theme downloads, and
language downloads MUST be opt-in.

Rationale: next-wiki is meant to be easy to deploy and keep running. Agents MUST
treat operations work as part of the core product, not as documentation to write
later.

### P11: Focused Scope Over Feature Accumulation

next-wiki MUST prioritize common wiki workflows: create, edit, organize,
search, protect, version, import, export, and integrate. It MUST NOT add
default dependencies, storage models, runtime plugin systems, or permanent
feature-flag branches to satisfy rarely used workflows.

Migration support SHOULD focus on documented exports, Markdown content, assets,
users/groups where practical, and page metadata. Compatibility work MUST be
implemented as import/export tooling around the next-wiki data model, not as
legacy architecture inside the runtime.

Rationale: A focused product is easier to learn, operate, extend, and reason
about. Broad compatibility belongs at the edges, not in the core runtime.

### P12: Native Web Navigation & Unified Entry Points

Every user-facing surface MUST have a complete, server-aware route, and every
route MUST render a breadcrumb derived from the route hierarchy and the page
tree.

The application MUST preserve native browser behavior: back/forward, refresh,
deep linking, copy/share, bookmarking, and "open in new tab" MUST work on every
navigable URL. Client-side navigation MUST update the URL and history. Any
user-reachable state without a corresponding URL is PROHIBITED.

URLs MUST follow RESTful resource conventions — a URL identifies a resource,
not an action; mutations use HTTP methods or dedicated sub-resources, never
verb-style path segments. Every feature MUST have exactly one canonical entry
point; duplicate routes or shadow entry points to the same resource are
PROHIBITED.

Rationale: Respecting the web platform keeps next-wiki debuggable, shareable,
and bookmarkable. RESTful URLs are predictable for humans, scripts, and AI
agents. Unified entry points prevent drift between parallel navigation paths.

Concrete URL schemes, breadcrumb rules, and canonical-entry-point mechanics
live in `docs/architecture/mandates.md` (§ Frontend Routing & URL Contract).

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
data model, API design, and module boundaries from the first commit. The
full, binding rules for each mandate live in `docs/architecture/`; this
section is the constitutional index. Redefining any invariant below (or in
the linked docs) requires a constitution amendment.

| Mandate | One-line invariant | Detail |
|---------|--------------------|--------|
| Page Tree & Path System | Pages addressed by canonical key `(space_id, path, locale)`; path is language-neutral and authoritative for routing, imports, exports, and permissions. | `docs/architecture/mandates.md` |
| Rendering Pipeline | Pipeline is `source -> parse -> transform[] -> render` with discrete, typed, registered plugins; transformers never touch the DB directly. | `docs/architecture/mandates.md` |
| Permission Model | Three axes (subject, resource, action); evaluation order explicit deny > allow > parent > space default > global default; no hardcoded admin bypass. | `docs/architecture/mandates.md` |
| Content Versioning | Every mutation creates an immutable `page_revision`; diff at source level only; revisions never deleted by normal operations. | `docs/architecture/mandates.md` |
| Multi-language Content | Translations keyed by `(space_id, path, locale)` via `translation_group_id`; permissions NOT inherited across translations. | `docs/architecture/mandates.md` |
| Editor Extensibility | Pluggable editor interface; client-side AST never leaves browser; serialize to raw source only; Markdown is default. | `docs/architecture/mandates.md` |
| Git Storage Sync | Optional, async, pg-boss job; two-way sync blocked until conflict model specified; DB stays source of truth. | `docs/architecture/mandates.md` |
| API Architecture | Three layers (tRPC internal, REST + OpenAPI public, MCP optional) sharing one service layer and Zod schemas; none bypass permissions. | `docs/architecture/mandates.md` |
| Deployment & Operations Baseline | Single `docker compose up`; PostgreSQL + named volumes; `/healthz`, `/readyz`, job status, structured logs, documented backup/restore. | `docs/architecture/mandates.md` |
| AI Knowledge Layer | Derived, rebuildable index over page revisions; retrieval permission-scoped; answers grounded with citations. | `docs/architecture/mandates.md` |
| AI Chat Side Pane | Persistent, context-aware, permission-scoped AI surface; SSE streaming; every mutation requires confirmation; hidden when AI disabled. | `docs/architecture/mandates.md` |
| Frontend Routing & URL Contract | RESTful resource URLs; breadcrumbs derived from route + page tree; browser-native behavior preserved; one canonical entry point per resource. | `docs/architecture/mandates.md` |
| Project Structure | Non-negotiable monorepo layout; `src/server/` server-only; Mantine isolated to `src/components/ui/`; `packages/shared/` zero-dep. | `docs/architecture/project-structure.md` |
| Frontend Data Flow | Server state via TanStack Query + tRPC; UI state via Zustand; never mix; URL state in search params. | `docs/architecture/frontend-data-flow.md` |

---

## Anti-Patterns

These patterns are PROHIBITED. Any PR introducing them MUST be rejected.

- **Scope expansion by comparison**: Matching another product's feature is not a
  reason to add a default dependency, architecture branch, or permanent runtime
  option. The feature MUST fit next-wiki's focused model.
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
- **Broken browser navigation**: Any route where back, forward, refresh, deep
  link, or "open in new tab" fails or silently loses user state. The web
  platform's navigation contract is mandatory, not optional.
- **State without a URL**: User-reachable application states that cannot be
  shared, bookmarked, or reached via browser history. If a user can arrive at
  a state, that state MUST have a URL.
- **Verb-style URLs**: Path segments that encode actions (`/createPage`,
  `/doSave`, `/deleteUser`) instead of resources. URLs identify resources;
  HTTP methods and sub-resources express mutations.
- **Duplicate feature entry points**: Multiple navigation links, routes, or
  menus that lead to the same resource under different URLs or labels. Each
  resource has exactly one canonical entry point.
- **Per-page bespoke styling**: Feature components that bypass the unified
  design system with inline colors, spacing, fonts, icons, or copy-pasted
  styles. All visual resources flow through `src/components/ui/` and the token
  system.

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
| Styling & UI | Mantine + Tailwind CSS + CSS custom properties | Unified design system in `src/components/ui/`; Mantine for controls, Tailwind for content layout, tokens for themes; single source of truth for all resources and cross-page UX consistency |
| Containerization | Docker Compose + Kubernetes manifests | Single compose for normal install; K8s for production operators |
| Testing | Vitest + Playwright | Unit/integration plus E2E coverage |
| LLM Integration | OpenAI-compatible API plus provider adapters | Provider-agnostic, works with self-hosted or commercial compatible LLMs |
| AI Chat Streaming | Server-Sent Events (SSE) via Next.js Route Handler | Token-by-token streaming to chat pane; no WebSocket dependency |
| Monorepo | pnpm workspaces + Turborepo | Shared packages, fast incremental builds |

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
5. All dependent templates, the Architectural Mandates index in this file, and
   the linked `docs/architecture/` documents MUST be updated in the same PR.

### Versioning Policy

- **MAJOR**: Removal or redefinition of a Core Principle, Anti-Pattern, or the
  one-line invariant of any Architectural Mandate (including in
  `docs/architecture/`).
- **MINOR**: New principle, mandate, anti-pattern, technology decision, or
  material restructure of how governance is organized.
- **PATCH**: Clarifications, wording fixes, typo fixes, non-semantic refinements
  to this file or to `docs/architecture/`.

Editorial refinement of `docs/architecture/` detail that does not change an
invariant does not require a constitution version bump; it is reviewed via
normal PR.

### Authoritative Sources

This constitution is the source of truth for principles, anti-patterns, and
technology decisions. `docs/architecture/` holds the binding detailed rules for
each Architectural Mandate and is governed by this constitution. When the two
appear to conflict, this file prevails; resolve the conflict via an amendment.

### Compliance Review

Every feature PR MUST include a checklist item confirming no Anti-Patterns were
introduced. Architecture-affecting PRs MUST reference the relevant Core
Principle or Architectural Mandate they satisfy or amend. Features that touch
deployment, permissions, AI, import/export, or public APIs MUST include tests or
manual verification notes for those surfaces.

### Ratifiers

This constitution was ratified by the project founder on 2026-05-30.
Subsequent amendments are ratified by any two active maintainers, or by the
founder while the project has fewer than two active maintainers.
