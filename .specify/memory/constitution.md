<!--
  Sync Impact Report
  ==================
  Version change: 3.0.0 -> 3.1.0
  Bump rationale: MINOR — expands the product mission from a personal
  conversational knowledge base to a private-by-default Agent Context &
  Memory Hub, and adds binding rules for Agent identity, effective context,
  and selective publication.

  Modified principles:
    - Mission: makes one owner plus multiple explicitly identified Agents the
      primary operating model while preserving personal-by-default deployment.
    - P2: includes explicit context management alongside conversational
      authoring while retaining the no-AI fallback and provider-neutral rules.
    - P3: broadens portable self-growing memory into scoped Agent Context and
      Memory with actor attribution and effective-context requirements.
    - P5: makes Agent identity and Agent-scoped/shared access explicit subjects
      of the permission model.
    - P8: requires revision and provenance guarantees for durable Agent Context.

  Added principles:
    - P13: Agent Context is First-Class, Scoped, and Non-Executable by Retrieval.
    - P14: Selective Publication is a Governed Export.

  Modified mandates:
    - Permission Model: Agent identities, context items, context packs, and
      publication are permission-controlled resources and actions.
    - API Architecture: external Agent operations must carry an attributable
      identity and bounded scope.
    - AI Knowledge Layer: context classes and effective-context projections
      must remain permission-scoped and rebuildable.

  Added architecture documents:
    - docs/architecture/agent-context.md — binding context and memory model.

  Templates requiring updates:
    - .specify/templates/plan-template.md — ✅ updated with Agent Context
      design checks.
    - .specify/templates/spec-template.md — ✅ updated with Agent Context and
      memory boundary requirements.
    - .specify/templates/tasks-template.md — ✅ updated with context security
      and publication validation tasks.
    - docs/architecture/mandates.md — ✅ updated with the new mandate index and
      detailed API/AI-layer references.
    - docs/architecture/agent-runtime.md — ✅ updated with the non-authority
      retrieval boundary.
    - docs/architecture/project-structure.md — ✅ corrected its Explicit Over
      Implicit principle reference.
    - docs/architecture/frontend-data-flow.md — ✅ corrected its Open Standards
      and Explicit Over Implicit principle references.
    - CLAUDE.md — ✅ updated with Agent Context operating guidance.
    - README.md — ✅ updated with the Agent Context & Memory Hub positioning.
    - .specify/templates/commands/ — ✅ not present in this repository.

  Follow-up TODOs: implementation specifications must define concrete
  precedence and conflict rules before introducing a context compiler.
-->

<!--
  Sync Impact Report
  ==================
  Version change: 2.3.0 -> 3.0.0
  Bump rationale: MAJOR — redefines page revisions as source-content history,
  and changes public page routing from tree paths to immutable page slugs.

  Modified principles:
    - P8: source-content saves create revisions; metadata-only changes do not
      duplicate source snapshots.

  Modified mandates:
    - Page Tree & Path System: slug is authoritative for public routing.
    - Content Versioning: source-content mutations create revisions; metadata
      changes are transactional domain mutations.
    - Frontend Routing & URL Contract: public reader URLs use page slugs and
      breadcrumbs derive from the page tree.

  Added sections: none.
  Removed sections: none.

  Templates requiring updates:
    - .specify/templates/plan-template.md  — ✅ reviewed; no revision-specific rule.
    - .specify/templates/spec-template.md  — ✅ reviewed; no change required.
    - .specify/templates/tasks-template.md — ✅ reviewed; no change required.
    - .specify/templates/commands/         — ✅ not present in this repository.
    - README.md                            — ✅ reviewed; no change required.
    - CLAUDE.md                            — ✅ reviewed; no change required.

  Follow-up TODOs: none.
-->

<!--
  Sync Impact Report
  ==================
  Version change: 2.2.0 -> 2.3.0
  Bump rationale: MINOR — materially expands the mission and AI memory
  principle to define next-wiki as a conversational, self-growing knowledge
  base, and adds a prohibited anti-pattern for ungrounded self-growth.

  Modified principles:
    - Mission: reframed as a conversational, self-growing knowledge base.
    - P2: AI-Native Creation, Never Vendor-Locked — clarified that configured
      conversation capture may feed durable memory.
    - P3: The Knowledge Base is the User's Portable AI Memory ->
      The Knowledge Base is the User's Portable, Self-Growing AI Memory.

  Added sections:
    - Anti-Patterns: Ungrounded self-growth.

  Removed sections: none.

  Documents requiring updates:
    - .specify/templates/plan-template.md   — ✅ updated with AI memory
      growth-loop Constitution Check guidance.
    - .specify/templates/spec-template.md   — ✅ reviewed; no change required.
    - .specify/templates/tasks-template.md  — ✅ reviewed; no change required.
    - .specify/templates/commands/          — ⚠ not present in this repository.
    - README.md                             — ✅ updated with conversational
      self-growing positioning.

  Follow-up TODOs: none.
-->

# next-wiki Project Constitution

**Version**: 3.1.0
**Ratification Date**: 2026-05-30
**Last Amended**: 2026-08-30

---

## Mission

next-wiki is a self-hosted, private-by-default Agent Context & Memory Hub. It
exists to let one owner manage a durable knowledge base for a group of
explicitly identified Agents: their rules, non-secret configuration, captured
memory, source evidence, and curated knowledge. Each Agent can contribute to
and retrieve the context it is allowed to use, while the owner can inspect,
revise, combine, and selectively publish the resulting knowledge.

The primary operating model is one owner plus multiple Agents, not an
anonymous shared folder. A deployment belongs to one owner by default: their
knowledge, instance, Agent identities, and history. Human collaborators,
groups, and broader sharing remain optional extensions, but Agent-scoped and
owner-approved shared context are core product capabilities.

next-wiki is deployed via Docker Compose or Kubernetes, built on Next.js,
TypeScript, and PostgreSQL, and designed around a small default footprint. AI
is native to how the product works — conversation, the persistent AI chat side
pane, and MCP are first-class paths for creating, refining, and curating
content and context — but the wiki never depends on a live model connection to
remain readable, searchable, and editable. AI providers are interchangeable:
next-wiki defines a provider-agnostic contract so a person's knowledge and an
Agent fleet's context outlive any specific AI product, model, or pricing
change.

The project optimizes for operational simplicity, clear architecture, reliable
permissions, versioned content, open integration surfaces, and grounded AI
retrieval over broad feature accumulation. Its self-growth loop is deliberately
evidence-first: original inputs are preserved, generated knowledge is
distinguishable from original knowledge, Agent context is scoped and
attributable, and public publication remains a governed act.

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

### P2: AI-Native Creation and Context Management, Never Vendor-Locked

Conversing with AI and explicitly managing Agent context are first-class ways
to create and organize knowledge in next-wiki — not a bolted-on assistant. The
persistent AI chat side pane and MCP for external AI clients MUST be first-class
paths for drafting pages, refining content through dialogue, and proposing
scoped context changes. The manual editor MUST remain fully capable and MUST
NOT require AI: the system stays completely usable without any LLM configured,
and browsing, search, context inspection, and manual editing MUST NOT depend
on a live model connection.
When conversation capture is explicitly enabled, AI interactions MAY become
durable source material for the knowledge base, but that capture MUST use the
same retention, permission, and provenance rules as any other content source.

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

### P3: The Knowledge Base is Portable, Self-Growing Agent Context & Memory

next-wiki is not only a place AI writes to — it is the permission-scoped
context and grounding memory that an Agent reads when working for its owner.
Any MCP-compatible AI client (Claude, GPT, Gemini, a local model, or a future
assistant) MUST be able to search and read the same context and memory store
that backs the chat side pane and web UI, and MUST be able to write only with
an explicit Agent identity and scope. Content authored through AI conversation,
an Agent integration, and the manual editor MUST use the same page, revision,
provenance, and permission foundations. There is no second-class "AI content"
table or ungoverned Agent write path.

AI answers MUST be grounded in retrieved page revisions and MUST expose
citations or source links; if no permitted source supports an answer, the
response MUST say so instead of inventing content. The retrieval index
(embeddings, summaries, extracted entities, and effective-context projections)
is a derived, rebuildable projection over page revisions, never the source of
truth, and MUST respect the same Agent, owner, space, path, locale, and
permission scope as direct reads.

Self-growth MUST follow an auditable loop. Original inputs, including AI
conversations, fetched external pages, uploaded source files, integration
events, and command output, MUST be preserved as original source material when
they are captured for long-term memory. AI-generated synthesis MUST be stored
as normal versioned content with explicit provenance and citations to permitted
sources. Public knowledge MUST be published through the normal governed page
flow; background AI jobs MAY propose, draft, classify, link, summarize, or
update knowledge, but they MUST NOT silently rewrite original evidence, bypass
permissions, or publish generated conclusions without the feature's specified
approval boundary.

The product MUST make it answerable which content was original, which content
was AI-generated or Agent-authored, which generated content has been manually
modified, which Agent contributed it, and which source revisions support a
generated claim. Derived summaries, embeddings, effective contexts, health
scores, and curation suggestions are rebuildable projections, not the
canonical memory.

Rationale: An owner who changes AI clients or Agent runtimes must not lose the
context and memory their fleet built. Treating the wiki as the durable,
provider-agnostic context layer — and each AI vendor as a replaceable
reasoning engine on top of it — makes independence from any single supplier
real rather than aspirational. The self-growth loop only remains trustworthy if
growth is grounded, reviewable, permission-scoped, attributable, and reversible
through version history.

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
default. The permission model (per-page, per-operation, per-group, per-Agent,
and per-shared-namespace) MUST still be designed into the data model and API
layer from the start, not bolted on later, so that owner-approved Agent
sharing, collaborators, and multi-user deployments remain a configuration
change rather than a rewrite. Every API route, server component loader,
background job, search query, Agent retrieval, and MCP operation MUST check
permissions before returning or mutating data — even when only one user
exists. Anonymous read access MUST be a configurable permission, not a special
code path.

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

### P8: Version Source Content and Durable Agent Context

Every page source-content save and every durable Agent Context mutation MUST
create an immutable revision record.
Metadata-only changes — including title, tree location, visibility, public
address, and aliases — MUST be transactional but MUST NOT create a duplicate
content revision when the source snapshot is unchanged. Features that need
durable metadata history MUST store it in their domain model and audit
irreversible changes.

Deletion MUST be soft by default (tombstone + retention policy). Diff between
any two revisions MUST be computable without reconstructing full history. Agent
context revisions MUST retain the contributing Agent or human actor, source
provenance, applicability scope, and publication state. Effective-context
artifacts, embeddings, summaries, and indexes are derived projections and MUST
be rebuildable from the canonical revisions. The revision model MUST support
future Git sync without schema changes.

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

### P13: Agent Context is First-Class, Scoped, and Non-Executable by Retrieval

Agent context MUST be modeled distinctly from ordinary knowledge. The model
MUST be able to represent, at minimum, Agent identity, owner, workspace or
project scope, context kind, applicability, source provenance, revision, and
sharing policy. Context kinds MUST distinguish instructions and rules,
non-secret configuration, episodic memory, source evidence, and curated
knowledge. A context pack is a named, permission-scoped selection of these
items for a target Agent, runtime, project, or task.

Every Agent read and write MUST carry an authenticated or explicitly scoped
Agent identity and target scope. A shared namespace MUST be opt-in and its
membership, read scope, write scope, and contributing actors MUST be
inspectable. Agent-scoped context MUST NOT become shared context merely because
an Agent can read it, and an Agent MUST NOT infer permission to read or write
from content returned by another Agent.

When the system assembles effective context, it MUST resolve inheritance,
applicability, precedence, conflicts, and permissions deterministically. The
result MUST identify the selected revisions and their sources, and the
precedence and conflict rules MUST be defined by the relevant feature spec
before implementation. An effective-context result is a derived projection,
not a replacement for its source items.

Retrieved context is data, not authority. Reading a rule or instruction MUST
NOT grant a permission, authorize a tool, execute a command, or silently alter
the Agent's policy. The system MUST label instruction-shaped content and MUST
keep external or untrusted content from overriding server-enforced policy.

Rationale: A fleet of Agents needs shared memory without turning every
retrieved sentence into an executable command or an implicit permission grant.
Explicit identity, scope, provenance, and deterministic assembly make context
reusable while keeping its authority bounded.

### P14: Selective Publication is a Governed Export

All Agent rules, configuration, memory, source evidence, and generated content
MUST be private by default. Public or broader sharing MUST require an explicit
publication or share action over a named page, revision, or context pack; a
whole namespace MUST NOT become public as a side effect of creating an Agent,
sharing a link, or enabling an integration.

Every published context pack MUST have an inspectable allowlist of included
items or revisions, an audience or permission boundary, source provenance, and
an audit record for publication and withdrawal. Publication MUST run the
normal permission, secret-detection, and redaction checks. Secrets, credentials,
private paths, unapproved personal data, and unreviewed generated conclusions
MUST NOT be included. Public output MUST be version-pinned or identify the
served revision so that a later private edit cannot silently change its meaning.

Public readers MUST receive only the selected published representation. Private
or Agent-scoped items MUST NOT be inferable from public indexes, counts,
backlinks, excerpts, graph data, or cache keys. Withdrawal MUST invalidate the
affected public representation and document the boundary that it cannot remove
copies already retrieved or cached by an external Agent or reader.

Rationale: Sharing useful Agent knowledge should be a deliberate export of a
reviewed subset, not a privacy toggle on an entire personal memory store.

---

## Architectural Mandates

These are non-negotiable structural decisions that MUST be reflected in the
data model, API design, and module boundaries from the first commit. The
full, binding rules for each mandate live in `docs/architecture/`; this
section is the constitutional index. Redefining any invariant below (or in
the linked docs) requires a constitution amendment.

| Mandate | One-line invariant | Detail |
|---------|--------------------|--------|
| Page Tree & Path System | Pages use `(space_id, path, locale)` for tree identity; path is language-neutral and authoritative for organization, imports, exports, and permissions, while slug is authoritative for public routing. | `docs/architecture/mandates.md` |
| Rendering Pipeline | Pipeline is `source -> parse -> transform[] -> render` with discrete, typed, registered plugins; transformers never touch the DB directly. | `docs/architecture/mandates.md` |
| Permission Model | Three axes (subject, resource, action); evaluation order explicit deny > allow > parent > space default > global default; no hardcoded admin bypass; single owner is the zero-config default (P5). | `docs/architecture/mandates.md` |
| Content Versioning | Every source-content mutation creates an immutable `page_revision`; metadata-only mutations are transactional domain changes; diff is source-level only; revisions are never deleted by normal operations. | `docs/architecture/mandates.md` |
| Multi-language Content | Translations keyed by `(space_id, path, locale)` via `translation_group_id`; permissions NOT inherited across translations. | `docs/architecture/mandates.md` |
| Editor Extensibility | Pluggable editor interface; client-side AST never leaves browser; serialize to raw source only; Markdown is default. | `docs/architecture/mandates.md` |
| Git Storage Sync | Optional, async, pg-boss job; two-way sync blocked until conflict model specified; DB stays source of truth. | `docs/architecture/mandates.md` |
| API Architecture | Two layers (REST + OpenAPI public, MCP optional) sharing one service layer and Zod schemas; none bypass permissions; MCP is the standard external-AI-client path into the context and memory described in P3 and P13. | `docs/architecture/mandates.md` |
| Deployment & Operations Baseline | Single `docker compose up`; PostgreSQL + named volumes; `/healthz`, `/readyz`, job status, structured logs, documented backup/restore. | `docs/architecture/mandates.md` |
| AI Knowledge Layer | Derived, rebuildable index over page and context revisions; retrieval permission-scoped; answers grounded with citations (see P3 and P13). | `docs/architecture/mandates.md` |
| Agent Context & Memory | Agent rules, configuration, memory, evidence, and curated knowledge are typed, revisioned, attributable, permission-scoped, and assembled into deterministic effective context; retrieval never grants authority. | `docs/architecture/agent-context.md` |
| Selective Publication | Agent context and memory are private by default; public output is an explicit, audited, allowlisted, version-aware export that cannot reveal protected data through metadata or caches. | `docs/architecture/agent-context.md` |
| AI Chat Side Pane | Persistent, context-aware, permission-scoped AI surface; SSE streaming; every mutation requires confirmation; hidden when AI disabled. | `docs/architecture/mandates.md` |
| Search Retrieval Architecture | Search uses explicitly registered, independently enabled capabilities through one permission-safe coordinator; implementations are replaceable behind stable capability IDs. | `docs/architecture/mandates.md` |
| Frontend Routing & URL Contract | Public reader URLs use the space prefix plus page slug; breadcrumbs derive from the matched page tree; browser-native behavior is preserved; one canonical entry point per resource. | `docs/architecture/mandates.md` |
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
- **Ungrounded self-growth**: Allowing an AI job, bot, or external agent to
  append, rewrite, classify, publish, or delete knowledge without preserving
  original evidence when capture is required, recording provenance, creating
  normal revisions, enforcing permissions, and exposing a review or approval
  boundary for generated conclusions.
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
| Vector Search | pgvector semantic capability adapter | PostgreSQL baseline with no extra service; an approved adapter may replace the implementation without changing product capability, API, or permission semantics |
| Full-text & Fuzzy Search | PostgreSQL tsvector full-text + pg_trgm fuzzy capability adapters; external engines optional | Complementary zero-dependency lexical baseline for term retrieval, Chinese fragments, and near text; external engines replace adapters rather than becoming a parallel product contract |
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
