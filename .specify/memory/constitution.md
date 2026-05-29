<!--
SYNC IMPACT REPORT
==================
Version change: 1.0.0 → 1.1.0 (MINOR: new principles + sections + tech corrections)
Modified:
  - P8: updated to reflect tRPC as internal API, REST as public API
  - P9 added: Explicit Over Implicit (anti-autoload, anti-global-singleton)
  - Editor Extensibility: clarified Tiptap (client) vs remark (server) boundary
  - Anti-Patterns: GraphQL entry updated to cover REST-as-sole-internal-API
  - Technology Decisions: ORM Prisma→Drizzle, Auth NextAuth→Better Auth,
    Styling Tailwind-only→Mantine+Tailwind+CSS vars, API rows added
    (tRPC/REST+OpenAPI/MCP), Search updated to tsvector+Meilisearch(optional)
  - API Architecture mandate added: three-layer model (tRPC/REST/MCP), service
    layer rules, trpc-openapi derivation, versioning, token scoping
Added sections:
  - Project Structure (non-negotiable monorepo layout)
  - Frontend Data Flow (TanStack Query / Zustand / RHF boundaries)
Templates requiring updates: N/A (no templates exist yet)
Deferred TODOs: Git sync conflict resolution strategy (deferred to feature spec)
-->

# next-wiki Project Constitution

**Version**: 1.1.0
**Ratification Date**: 2026-05-29
**Last Amended**: 2026-05-29

---

## Mission

next-wiki is an open-source, self-hosted wiki system for personal and enterprise
knowledge management. It is deployed via Docker Compose or Kubernetes, built on
Next.js + TypeScript + PostgreSQL, and designed to be simple to operate, easy to
extend, and optionally enhanced by LLM-powered AI features.

The project exists to deliver what Wiki.js promised but with a cleaner
architecture, a modern stack, and AI-native knowledge retrieval as a first-class
optional capability.

---

## Core Principles

### P1: Simplicity Over Completeness

The system MUST be deployable with a single `docker compose up`. Every new
dependency or service added to the default deployment requires explicit
justification. Optional features (AI, Git sync, SSO) MUST NOT increase the
baseline deployment footprint.

Rationale: Wiki.js accumulated so many storage backends and optional services
that a "simple" deployment became a configuration maze. We reject that path.

### P2: AI as Optional Enhancement

The system MUST function as a fully capable wiki without any LLM configuration.
AI features are activated exclusively by the presence of `LLM_PROVIDER` and
`LLM_API_KEY` in the environment. The AI layer MUST NOT be imported or
initialized when these are absent.

Rationale: Forcing LLM dependencies raises the barrier to self-hosting and
creates privacy concerns for air-gapped deployments.

### P3: Rendering Pipeline is Sacred

The content rendering pipeline (source → AST → HTML) MUST be a first-class,
pluggable pipeline from day one. No renderer MUST be hardcoded into page
components. Every transformation step (Markdown parsing, syntax highlighting,
math rendering, diagram rendering) MUST be a discrete, replaceable plugin.

Rationale: Wiki.js's tight coupling between editor format and renderer made
adding new content types painful. A clean pipeline prevents this lock-in.

### P4: Permissions are First-Class

The permission model (per-page, per-operation, per-group) MUST be designed into
the data model and API layer from the start, not bolted on later. Every API
route MUST check permissions before returning data. Anonymous read access MUST
be a configurable permission, not a special code path.

Rationale: Retrofitting fine-grained permissions onto an existing system is
one of the most expensive refactors possible. It touches every query and every
API endpoint.

### P5: Style System Independence

The UI MUST be built on a design token system (CSS custom properties). No color,
spacing, or typography value MUST be hardcoded in component styles. Themes are
JSON files that map to CSS variables. The default theme references Wiki.js docs
visual style but the system MUST support full theme replacement without code
changes.

### P6: Async-First for Heavy Operations

Any operation that may take more than 500ms (LLM calls, Git sync, bulk import,
search re-indexing) MUST be executed as a background job via pg-boss. User-facing
API routes MUST return immediately with a job ID. The UI MUST reflect job status
asynchronously. Synchronous LLM calls in request handlers are PROHIBITED.

### P7: Version Everything

Every page save MUST create an immutable revision record. Deletion MUST be soft
by default (tombstone + retention policy). Diff between any two revisions MUST
be computable without reconstructing full history. The revision model MUST
support future Git-backend sync without schema changes.

### P8: Open Standards Over Proprietary

The internal API MUST use tRPC — end-to-end TypeScript type safety with zero
code generation, Zod schema shared between server validation and client
inference. The public API (for third-party integrations) MUST be REST + JSON,
exposed as a subset of the tRPC router. GraphQL is not the primary API.
Authentication MUST use OAuth 2.0 / OIDC standard flows. AI integration MUST
use provider-agnostic interfaces (OpenAI-compatible API spec). Export formats
MUST include standard Markdown + frontmatter. No vendor lock-in in the
critical path.

Rationale: tRPC eliminates the dual-maintenance burden of writing types twice
(server + client). For a wiki with 60%+ CRUD and admin UI work, this is an
engineering efficiency multiplier, not a style preference.

### P9: Explicit Over Implicit

No module, route, or service may be discovered through filesystem scanning,
naming conventions, or dynamic imports at runtime. Every module MUST be
explicitly registered in a single, traceable entry point. If a module exists
but is not imported, it does not exist at runtime. Global singleton objects
are PROHIBITED. Dependencies are injected through function parameters or
framework-managed lifecycle (Next.js App Router, tRPC context).

Rationale: Wiki.js used `autoload()` for module discovery and a `WIKI` global
object for state sharing. This made the system untestable, fragile to
restructure, and impossible to understand by reading a single file. Every
import in next-wiki MUST be traceable to an explicit registration point.

---

## Architectural Mandates

These are non-negotiable structural decisions that MUST be reflected in the
data model, API design, and module boundaries from the first commit.

### Page Tree & Path System

Pages are addressed by a hierarchical path (e.g., `/engineering/backend/auth`).
The path IS the identity of a page — not a numeric ID. Path uniqueness is
scoped to a space: the composite key `(space_id, path)` is unique, not `path`
alone. Two spaces may each have a `/getting-started` page. The data model MUST
store path as a first-class indexed field on this composite key. Moving a page
MUST update the path and create a redirect record. A redirect record contains:
`(space_id, from_path, to_path, created_at)`. Redirect resolution happens at
the routing layer before permission checks. If a new page is created at a
previously redirected path, the redirect is deleted. Redirect chains are
resolved to their final target at write time, not at read time. The tree
structure MUST be derivable from paths alone, without a separate adjacency
table. Pages MUST be indexed for full-text search (PostgreSQL `tsvector`) at
save time; search queries MUST enforce the caller's permission context before
returning results. Search indexing respects the page's locale.

### Rendering Pipeline

The rendering pipeline MUST follow: `source → parse → transform[] → render`.
Each stage is a discrete function with a typed input/output contract.
Transformers (syntax highlight, math, diagrams, embeds) are registered plugins.
No transformer MUST have side effects or access the database. The pipeline MUST
be executable server-side (SSR) and cacheable per revision hash.

### Permission Model

The permission model has three axes: **subject** (user or group), **resource**
(space, page, or asset), **action** (read, write, delete, manage). Permissions
are evaluated in order: explicit deny > explicit allow > inherited from parent
page > space default > global default. The "parent" of a top-level page is its
space. When a page is moved between spaces, its explicit page-level permissions
are dropped and it inherits from the destination space; this is the only safe
default since the source space's permission context no longer applies. Every
data-fetching function MUST accept a permission context and enforce it — no
"admin bypass" shortcuts in query layer (see P4).

### Content Versioning

Every page mutation creates a `page_revision` row with: revision number,
author, timestamp, content hash, and full content snapshot. The current page
row holds a foreign key to the latest revision. Diff is always computed at the
source level (raw Markdown or raw AsciiDoc text), never on rendered HTML. This
means diff output is meaningful for any registered editor format without
requiring the editor plugin to be present. Revisions are NEVER deleted by
normal operations; only a configurable retention policy job may prune them.

### Multi-language Content

A page path is language-neutral. Translations are separate page records linked
by a `translation_group_id`. The default locale is configurable per space. The
UI MUST fall back gracefully when a translation is missing (show default locale
with a banner). The data model MUST NOT conflate locale with path hierarchy.
Permissions are NOT inherited across translations: each translation is an
independent page resource with its own permission entries. Write access to the
English version does not imply write access to the French translation. This
keeps the permission model uniform and avoids a special-case inheritance path.

### Editor Extensibility

The editor layer is a pluggable interface with separate write-side and
read-side contracts. The write-side interface is:
`{ id, label, contentType: string, EditorComponent, serialize(state): string }`.
`contentType` declares the MIME type of the serialized output (e.g.,
`text/markdown`, `text/asciidoc`). `serialize` MUST return raw source text —
never HTML. The read-side (rendering) is handled entirely by the Rendering
Pipeline mandate; editor plugins have no render responsibility.

The client-server boundary is strict: the default Markdown editor uses
**Tiptap** (ProseMirror-based) on the client. Tiptap's internal ProseMirror
AST MUST NEVER leave the browser. The editor serializes to raw Markdown text,
which is stored in the database. On the server, **remark/rehype** parses that
raw Markdown into a separate AST for rendering. These are two independent AST
systems connected only by the raw source text as their contract.

Markdown is the default and reference implementation. Additional editors
(WYSIWYG, AsciiDoc, reStructuredText) are registered plugins. Editor plugins
MUST NOT be required for reading or rendering existing content.

### Git Storage Sync

The Git sync feature is an optional, async, one-way or two-way bridge between
the wiki database and a Git repository. It MUST be implemented as a pg-boss
job, never as a synchronous operation. The page revision model MUST be
designed so that a Git commit hash can be stored alongside a revision record
without schema changes. For two-way sync, conflict resolution strategy is
deferred to the Git Sync feature spec; this mandate does not prescribe it.
Git sync is disabled by default.

### API Architecture

next-wiki exposes three API layers, all backed by the same service layer
and Zod schemas:

| Layer      | Consumers                          | Auth         | Format                |
|------------|------------------------------------|--------------|-----------------------|
| tRPC       | Next.js frontend                   | Session (Better Auth) | TypeScript-native |
| REST + OpenAPI | Bots, integrations, external clients | API Token | HTTP + JSON      |
| MCP Server | AI Agents (Claude, Cursor, etc.)   | API Token    | Model Context Protocol |

Rules:
- Business logic lives in the service layer ONLY. API layers are thin adapters.
- All three layers share the same Zod schemas for input validation.
- tRPC is the primary development interface; REST is derived from tRPC via
  `trpc-openapi` where possible.
- REST API versioning: URL-based (`/api/v1/`, `/api/v2/`). Breaking changes
  require a new major version prefix.
- MCP Server is optional and activated alongside the REST API.
- API Tokens are scoped (read, write, admin) and managed via the admin panel.
- No API layer may bypass the permission model (see P4).

### AI Knowledge Layer

When AI mode is active, each page has an associated knowledge record containing:
embedding vector (pgvector), LLM-generated summary, extracted entities, and
cross-reference links. This record is populated asynchronously by the Ingest
Worker after each page save. The knowledge layer follows the Karpathy LLM Wiki
pattern: raw pages are the source of truth; the knowledge layer is a derived,
maintainable index. The MemPalace hierarchy (space → section → page) maps
directly to the wiki's space/path structure for AI retrieval scoping.

---

## Anti-Patterns (Lessons from Wiki.js)

These patterns are PROHIBITED. Any PR introducing them MUST be rejected.

- **REST as sole API for internal consumption**: Using REST for internal
  frontend-backend communication means writing types twice (server + client)
  with no compiler enforcement. Internal API MUST use tRPC. REST is reserved
  for the public third-party integration API only.
- **GraphQL as primary API**: Adds schema maintenance overhead without benefit.
- **Multiple storage backends in core**: Wiki.js supported Git, S3, local,
  Azure, etc. as first-class storage backends, creating a maintenance burden.
  next-wiki uses PostgreSQL + local filesystem only. S3/object storage is an
  optional asset backend, not a page storage backend.
- **Synchronous LLM/heavy operations in request handlers**: See P6. Any
  operation that calls an external service or takes >500ms MUST go through
  pg-boss. This is non-negotiable.
- **Hardcoded admin bypass in permission checks**: See P4. Every query goes
  through the permission layer without exception.
- **Editor format stored as rendered HTML**: Always store raw source. HTML
  is always derived, never canonical.
- **Monolithic page component that owns rendering**: The rendering pipeline
  is a separate, testable module. Page components call it; they don't contain it.
- **Feature flags as permanent code paths**: Feature flags are for rollout,
  not permanent conditional logic. Ship the feature or don't.

---

## Technology Decisions

These decisions are fixed for v1.x. Changes require a constitution amendment.

| Concern              | Decision                              | Rationale                                           |
|----------------------|---------------------------------------|-----------------------------------------------------|
| Framework            | Next.js 15 + TypeScript               | Full-stack, SSR, App Router, large ecosystem        |
| Database             | PostgreSQL 16+                        | Full-text search, pgvector, pg-boss, JSONB          |
| ORM                  | Drizzle ORM                           | SQL-first, pure TS schema, zero generation step, native Zod integration |
| Job Queue            | pg-boss                               | Runs in PostgreSQL, zero extra services             |
| Auth                 | Better Auth                           | OAuth2/OIDC/LDAP/SAML, native Drizzle adapter, self-host friendly |
| API (internal)       | tRPC                                  | End-to-end type safety, zero codegen, Zod schema shared |
| API (public REST)    | REST + OpenAPI (trpc-openapi)         | Third-party integrations, derived from tRPC router      |
| API (AI agents)      | MCP Server (optional)                 | Model Context Protocol, activated alongside REST API    |
| Markdown Parser      | unified / remark / rehype             | AST-based, pluggable, server-side rendering         |
| Editor (client)      | Tiptap (ProseMirror)                  | Rich Markdown editing; AST stays in browser         |
| Vector Search        | pgvector (PostgreSQL extension)       | No extra service, integrates with Drizzle           |
| Full-text Search     | PostgreSQL tsvector (default) + Meilisearch (optional) | Zero-dep baseline; Meilisearch for CJK and scale |
| Styling & UI         | Mantine + Tailwind CSS + CSS custom props | Mantine for admin components; Tailwind for content; CSS vars for theming |
| Containerization     | Docker Compose + Kubernetes           | Single compose for dev, K8s manifests for prod      |
| Testing              | Vitest + Playwright                   | Unit/integration + E2E                              |
| LLM Integration      | OpenAI-compatible API (optional)      | Provider-agnostic, works with any compatible LLM    |
| Monorepo             | pnpm workspaces + Turborepo           | Shared packages, fast incremental builds            |

**Not in scope for v1.x**: Redis, Elasticsearch, separate microservices,
native mobile apps, real-time collaborative editing (CRDT).

**Out of operator scope**: Rate limiting and DDoS protection for public-facing
deployments are the responsibility of the operator's reverse proxy (nginx,
Caddy, Cloudflare, etc.). next-wiki does not implement application-layer rate
limiting in v1.x.

---

## Project Structure

This layout is NON-NEGOTIABLE. AI agents MUST NOT generate a different
directory structure. Any deviation requires a constitution amendment.

```
next-wiki/
├── apps/
│   └── web/                        # Next.js full-stack application
│       ├── app/                    # App Router (page routes)
│       │   ├── (public)/           # Public content pages (SSR + SEO)
│       │   ├── (auth)/             # Login / register
│       │   ├── (admin)/            # Admin dashboard
│       │   ├── (editor)/           # Page editor
│       │   └── api/trpc/[trpc]/    # tRPC HTTP handler
│       └── src/
│           ├── server/             # Server-only code (never imported by client)
│           │   ├── trpc/           # tRPC routers and procedures
│           │   ├── services/       # Business logic layer
│           │   ├── db/             # Drizzle schema + migrations
│           │   ├── pipeline/       # Rendering pipeline (remark/rehype)
│           │   └── jobs/           # pg-boss job definitions
│           ├── client/             # Client-only code
│           ├── components/
│           │   ├── ui/             # Mantine wrappers (external code MUST NOT
│           │   │                   # import Mantine directly — use this layer)
│           │   ├── admin/          # Admin dashboard components
│           │   ├── editor/         # Editor components (Tiptap)
│           │   └── common/         # Shared components
│           └── hooks/              # Custom React hooks
├── packages/
│   ├── shared/                     # Zod schemas, types, constants (no runtime deps)
│   └── editor/                     # Tiptap extensions, CodeMirror configs
├── docker/                         # Dockerfiles and compose files
├── turbo.json
└── pnpm-workspace.yaml
```

Key rules derived from this structure:
- `src/server/` MUST NEVER be imported by any file under `app/(public)/`,
  `app/(auth)/`, `app/(editor)/`, or `src/client/`. Next.js server-only
  boundary enforces this at build time.
- Mantine MUST only be imported inside `src/components/ui/`. All other
  components use the `ui/` wrappers. This isolates the component library
  from the rest of the codebase.
- `packages/shared/` has zero runtime dependencies. It contains only types,
  Zod schemas, and pure utility functions.

---

## Frontend Data Flow

These rules are NON-NEGOTIABLE. Violations are architecture defects.

| Data type            | Storage                  | Access pattern                    |
|----------------------|--------------------------|-----------------------------------|
| Server state (CRUD)  | TanStack Query cache     | `useQuery` / `useMutation` (tRPC) |
| Client UI state      | Zustand                  | `useStore`                        |
| Form state           | React Hook Form          | `useForm` / `useController`       |
| URL / filter state   | Next.js searchParams     | `useSearchParams`                 |
| Auth session         | Better Auth session      | `useSession`                      |

**PROHIBITED**: Storing server-derived data in Zustand. TanStack Query IS the
server state manager. Caching API responses in Zustand is an architecture
violation. If a component needs server data, it uses `useQuery`. If it needs
to share UI state between components, it uses Zustand. These two concerns MUST
NOT be mixed.

---

## Governance

### Amendment Procedure

1. Open a GitHub Discussion proposing the amendment with rationale.
2. Allow 7 days for community comment.
3. A maintainer merges the amendment PR and increments the version.
4. All dependent templates and docs MUST be updated in the same PR.

### Versioning Policy

- **MAJOR**: Removal or redefinition of a Core Principle or Architectural Mandate.
- **MINOR**: New principle, mandate, or technology decision added.
- **PATCH**: Clarifications, wording fixes, non-semantic refinements.

### Compliance Review

Every feature PR MUST include a checklist item confirming no Anti-Patterns
were introduced. Architecture-affecting PRs MUST reference the relevant
Architectural Mandate they satisfy or amend.

### Ratifiers

This constitution was ratified by the project founder on 2026-05-29.
Subsequent amendments are ratified by any two active maintainers.
