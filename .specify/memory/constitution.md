<!--
  Sync Impact Report
  ==================
  Version change: 2.0.0 -> 2.1.0
  Bump rationale: MINOR — adds a Core Principle and an Architectural Mandate
  that make static/ISR delivery of anonymous published content a binding
  product requirement.

  Modified principles:
    - None.

  Added principles:
    - New P12 "Public Reading Is Static by Default": published anonymous
      content and its public navigation must use static/ISR delivery, with
      explicit revalidation after public-content mutations.

  Added architectural mandates:
    - Public Content Delivery: public published content is an ISR/static
      representation and cannot vary its document body by request cookies,
      headers, or session state.

  Removed sections: none.

  Templates requiring updates:
    - .specify/templates/plan-template.md   — ✅ updated with the public
      content delivery gate.
    - .specify/templates/spec-template.md   — ✅ updated with public-content
      delivery requirements for affected features.
    - .specify/templates/tasks-template.md  — ✅ updated with an ISR and
      invalidation validation task.
    - docs/architecture/mandates.md         — ✅ updated with the binding
      Public Content Delivery rules.
    - README.md                             — ✅ updated to state the delivery
      model.
    - .specify/templates/commands/          — ✅ not present in this project.

  Follow-up TODOs: none. This file also restores governance content
  (Authoritative Sources, Compliance Review, Ratifiers) that was truncated by
  an earlier file-write error and had been silently missing from the working
  tree; no semantic change versus the last intact version (94b4940).
-->

# next-wiki Project Constitution

**Version**: 2.1.0
**Ratification Date**: 2026-05-30
**Last Amended**: 2026-07-13

---

## Mission

next-wiki is a personal, AI-native knowledge base service. It exists to let
one person build a durable, private knowledge base through conversation with
AI — and for that same knowledge base to serve as the grounding memory any AI
assistant draws on when talking with its owner. Writing, organizing, and
retrieving knowledge should feel like talking to an assistant that remembers
everything its owner has told it, without tying that memory to any single AI
company.

Each next-wiki deployment belongs to exactly one person by default: their
knowledge, their instance, their history. Multi-user sharing and group
permissions remain available as an optional extension for teams, but they are
not the product's primary story.

next-wiki is deployed via Docker Compose or Kubernetes, built on Next.js,
TypeScript, and PostgreSQL, and designed around a small default footprint. AI
is native to how the product works — the persistent AI chat side pane and MCP
are the default paths for creating and refining content — but the wiki never
depends on a live model connection to remain readable, searchable, and
editable. AI providers are interchangeable: next-wiki defines a
provider-agnostic contract so a person's knowledge outlives any specific AI
product, model, or pricing change.

The project optimizes for operational simplicity, clear architecture, reliable
permissions, versioned content, open integration surfaces, and grounded AI
retrieval over broad feature accumulation.

---

## Core Principles

### P1: Simple Deployment is a Feature, Personal by Default

The system MUST be deployable with a single `docker compose up`, and that
default deployment MUST be immediately usable by one person without any
multi-user setup, invitation flow, or organization concept. The default
deployment MUST require PostgreSQL as its only stateful service. The default
deployment MAY run separate app and worker containers, but they MUST use the
same application image and MUST NOT require Redis, Elasticsearch, object
storage, external queues, or an LLM provider.

Every new default dependency or service requires explicit justification in the
feature spec. Optional features such as multi-user sharing, Git sync, SSO,
Meilisearch, object storage, and MCP MUST NOT increase the baseline deployment
footprint or add setup steps to the single-owner default case.

Rationale: Self-hosted software succeeds when installation, backup, upgrade,
and debugging stay ordinary. A smaller core is easier to trust and maintain,
and a product that is personal by default must not force a new owner through
team or organization concepts before they can write their first page.

### P2: AI-Native Creation, Never Vendor-Locked

Conversing with AI is the primary, default way to create and organize
knowledge in next-wiki — not a bolted-on assistant. The persistent AI chat
side pane, and MCP for external AI clients, MUST be the first-class path for
drafting pages, restructuring the page tree, and refining content through
dialogue. The manual editor MUST remain fully capable and MUST NOT require AI:
the system stays completely usable without any LLM configured, and browsing,
search, and manual editing MUST NOT depend on a live model connection.

AI features are activated only by explicit provider configuration via
environment variables (`LLM_PROVIDER`, `LLM_API_KEY`) or an encrypted admin
setting. The AI layer MUST NOT make outbound model calls, embedding calls, or
provider discovery calls when AI mode is disabled. Every AI integration MUST
go through a provider-agnostic interface — an OpenAI-compatible HTTP API or an
explicit provider adapter — so a user can switch AI vendors without losing
their knowledge base or workflow. No feature may hard-code a single vendor's
proprietary SDK or API as its only integration path.

Generated content MUST go through the normal page creation or edit flow and
MUST NOT be auto-published without user confirmation. AI features MUST degrade
gracefully when provider credentials are absent or invalid.

Rationale: The product's identity is AI-native knowledge building, but native
must not mean dependent. Vendor independence protects the user's knowledge
from any single AI company's pricing, availability, or policy changes, and the
"no-AI" fallback keeps the wiki trustworthy as durable storage regardless of
AI market conditions.

### P3: The Knowledge Base is the User's Portable AI Memory

next-wiki is not only a place AI writes to — it is the grounding memory an AI
assistant reads from when talking with its owner. Any MCP-compatible AI
client (Claude, GPT, Gemini, a local model, or a future assistant) MUST be
able to search, read, and — with appropriate scope — write into the same
permission-scoped store that backs the chat side pane and the web UI. Content
authored through AI conversation and content authored through the manual
editor MUST be stored identically: same page tree, same revision model, same
permission checks. There is no second-class "AI content" table or code path.

AI answers MUST be grounded in retrieved page revisions and MUST expose
citations or source links; if no permitted source supports an answer, the
response MUST say so instead of inventing content. The retrieval index
(embeddings, summaries, extracted entities) is a derived, rebuildable
projection over page revisions, never the source of truth, and MUST respect
the same space, path, locale, and permission scope as direct reads.

Rationale: A user who switches AI assistants must not lose the memory they
built. Treating the wiki as the durable, provider-agnostic memory layer — and
the AI vendor as a replaceable reasoning engine on top of it — is what makes
independence from any single AI supplier real rather than aspirational.

### P4: Rendering Pipeline is Sacred

The content rendering pipeline (`source -> parse -> transform[] -> render`) MUST
be a first-class, pluggable pipeline from day one. Renderers MUST NOT be
hardcoded into page components. Every transformation step, including Markdown
parsing, syntax highlighting, math rendering, diagram rendering, embeds, and
link processing, MUST be a discrete, replaceable plugin with typed inputs and
outputs.

Rationale: Content rendering is core infrastructure. Keeping it explicit and
replaceable makes new content types possible without coupling editors, storage,
and page components together.

### P5: Permissions are First-Class, Personal by Default

Every deployment MUST work correctly for a single owner with zero permission
configuration: the owner has full read/write access to their own space by
default. The permission model (per-page, per-operation, per-group) MUST still
be designed into the data model and API layer from the start, not bolted on
later, so that sharing, collaborators, and multi-user deployments remain a
configuration change rather than a rewrite. Every API route, server component
loader, background job, search query, and AI retrieval or MCP operation MUST
check permissions before returning data — even when only one user exists.
Anonymous read access MUST be a configurable permission, not a special code
path.

Rationale: Personal by default does not mean permission-free. A single
owner's data must still be provably isolated from other people's instances,
and the same checks that protect a shared deployment protect a personal one
from a compromised integration or a misconfigured AI tool.

### P6: Style System Independence & UI Consistency

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

### P7: Async-First for Heavy Operations

Any operation that may take more than 500ms (LLM calls, Git sync, bulk import,
export, search re-indexing, embedding rebuilds, email batches, or large asset
processing) MUST be executed as a background job via pg-boss. User-facing API
routes MUST return immediately with a job ID. The UI MUST reflect job status
asynchronously. Synchronous LLM calls in request handlers are PROHIBITED.

### P8: Version Everything

Every page save MUST create an immutable revision record. Deletion MUST be soft
by default (tombstone + retention policy). Diff between any two revisions MUST
be computable without reconstructing full history. The revision model MUST
support future Git sync without schema changes.

### P9: Open Standards Over Proprietary

The public API for client integrations MUST be REST + JSON with OpenAPI documentation.

Federated authentication MUST use OAuth 2.0 / OIDC standard flows
unless an enterprise SSO feature spec explicitly approves another protocol. AI
integration MUST use provider-agnostic interfaces, preferably OpenAI-compatible
HTTP APIs or explicit provider adapters. Export formats MUST include standard
Markdown + frontmatter. No vendor lock-in belongs in the critical path.

Rationale: REST + OpenAPI provides the stable public contract for scripts, 
integrations, bots, and non-TypeScript clients.

### P10: Explicit Over Implicit

Application modules, services, render plugins, jobs, auth providers, AI
providers, and integration handlers MUST be explicitly registered in a single,
traceable entry point per subsystem. If a module exists but is not imported or
registered, it does not exist at runtime. Global singleton objects are
PROHIBITED. Dependencies are injected through function parameters or
framework-managed lifecycle such as Next.js App Router, route handlers, API
context, and pg-boss job context.

Framework-owned conventions such as Next.js file-system routing are allowed.
Custom runtime discovery through filesystem scanning, filename conventions, or
dynamic imports is prohibited unless the feature spec defines a bounded registry
and testable loading contract.

Rationale: Explicit registration makes the system understandable by reading the
entry points and testable without hidden runtime state.

### P11: Native Web Navigation & Unified Entry Points

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

### P12: Public Reading Is Static by Default

Every anonymously readable, published wiki page MUST have a static or
incrementally statically regenerated (ISR) content representation. Its
document body, public metadata, and public navigation MUST NOT require a
database query, session lookup, cookie read, or request-header read on every
visitor request. Private pages, drafts, and permission-dependent data remain
dynamic and MUST NOT leak into a public representation.

User-specific controls — such as editor actions, AI panes, locale or theme
preferences — MUST be composed outside the cacheable content or hydrated after
the public document is delivered. They MUST NOT make the published document
body vary by session. Publishing, unpublishing, deleting, changing a public
page's path/title/metadata, or changing public navigation/locale state MUST
explicitly invalidate the affected ISR paths and public-data tags.

Rationale: A wiki is principally durable published documents. Serving those
documents as reusable HTML keeps first reads fast across long-distance networks,
reduces load on the application and database, and preserves the same canonical
URL for readers and search engines without weakening authenticated editing.

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
| Permission Model | Three axes (subject, resource, action); evaluation order explicit deny > allow > parent > space default > global default; no hardcoded admin bypass; single owner is the zero-config default (P5). | `docs/architecture/mandates.md` |
| Content Versioning | Every mutation creates an immutable `page_revision`; diff at source level only; revisions never deleted by normal operations. | `docs/architecture/mandates.md` |
| Multi-language Content | Translations keyed by `(space_id, path, locale)` via `translation_group_id`; permissions NOT inherited across translations. | `docs/architecture/mandates.md` |
| Editor Extensibility | Pluggable editor interface; client-side AST never leaves browser; serialize to raw source only; Markdown is default. | `docs/architecture/mandates.md` |
| Git Storage Sync | Optional, async, pg-boss job; two-way sync blocked until conflict model specified; DB stays source of truth. | `docs/architecture/mandates.md` |
| API Architecture | Two layers (REST + OpenAPI public, MCP optional) sharing one service layer and Zod schemas; none bypass permissions; MCP is the standard external-AI-client path into the memory described in P3. | `docs/architecture/mandates.md` |
| Deployment & Operations Baseline | Single `docker compose up`; PostgreSQL + named volumes; `/healthz`, `/readyz`, job status, structured logs, documented backup/restore. | `docs/architecture/mandates.md` |
| AI Knowledge Layer | Derived, rebuildable index over page revisions; retrieval permission-scoped; answers grounded with citations (see P3). | `docs/architecture/mandates.md` |
| AI Chat Side Pane | Persistent, context-aware, permission-scoped AI surface; SSE streaming; every mutation requires confirmation; hidden when AI disabled. | `docs/architecture/mandates.md` |
| Frontend Routing & URL Contract | RESTful resource URLs; breadcrumbs derived from route + page tree; browser-native behavior preserved; one canonical entry point per resource. | `docs/architecture/mandates.md` |
| Public Content Delivery | Anonymous published documents, their metadata, and public navigation are static/ISR; personalized controls are separate; every public-content mutation revalidates the affected paths. | `docs/architecture/mandates.md` |
| Project Structure | Non-negotiable monorepo layout; `src/server/` server-only; all UI primitives isolated to `src/components/ui/`; `packages/shared/` zero-dep. | `docs/architecture/project-structure.md` |
| Frontend Data Flow | Server state via TanStack Query; UI state via Zustand; never mix; URL state in search params. | `docs/architecture/frontend-data-flow.md` |

---

## Anti-Patterns

These patterns are PROHIBITED. Any PR introducing them MUST be rejected.

- **Editor format stored as rendered HTML**: Always store raw source. HTML is
  always derived, never canonical.
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
- **AI content as second-class**: Storing, versioning, or permission-checking
  AI-authored content differently from manually-authored content (e.g. a
  separate table, an unversioned write path, or a retrieval query that skips
  permission checks). AI and human authorship MUST be indistinguishable to the
  storage and permission layers.
- **Vendor-locked AI integration**: Hard-coding a single AI vendor's
  proprietary SDK or API as the only integration path for a feature, instead
  of going through the provider-agnostic interface required by P2 and P3.
- **Session-bound public documents**: Marking an anonymous published reader
  route dynamic, or embedding session-, cookie-, or header-dependent content
  in its cached document body, merely to render personalized controls. Those
  controls belong in a dynamic boundary or client hydration, while the document
  remains static/ISR.

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
| Auth | Custom bcrypt + DB-backed sessions | Zero-dependency local email/password baseline; `bcryptjs` hashing, server-issued session cookies stored in PostgreSQL; OAuth/OIDC adapters added later behind the same `can()` chokepoint |
| API (public REST) | REST + OpenAPI | Third-party integrations, scriptable clients, stable public contract |
| API (AI agents) | MCP Server (optional) | AI-agent integration over permissioned tools; the standard path for external AI clients to use the wiki as memory (P3) |
| Markdown Parser | unified / remark / rehype | AST-based, pluggable, server-side rendering |
| Editor (client) | CodeMirror 6 | Lightweight split Markdown editor; serializes to raw Markdown only; no heavy WYSIWYG/AST runtime shipped to the client; modular `@codemirror/*` packages |
| Vector Search | pgvector (PostgreSQL extension) | No extra service, integrates with PostgreSQL |
| Full-text Search | PostgreSQL tsvector default + Meilisearch optional | Zero-dependency baseline; Meilisearch for CJK and scale |
| Styling & UI | Tailwind CSS + CSS custom properties + in-house components | Unified design system in `src/components/ui/`; in-house primitives (Button, Input, Alert, …) for controls, Tailwind for content layout, CSS-variable tokens for themes; no third-party component library; single source of truth for all resources and cross-page UX consistency |
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
