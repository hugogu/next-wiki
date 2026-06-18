# Implementation Plan: Core Wiki Platform

**Branch**: `001-core-wiki-platform` | **Date**: 2026-06-14 | **Spec**: [spec.md](./spec.md)
**Input**: Feature specification from `/specs/001-core-wiki-platform/spec.md`

## Summary

Build the V1 read/author/admin core of next-wiki as a single Next.js service:
self-service registration + login, a flat wiki page list, Markdown authoring
with per-save immutable versions, a version-level draft/publish workflow,
three built-in roles (admin/editor/reader), and an admin panel for user and
role management. Pages are authored in Markdown and rendered to HTML at save
time so page reads are served as pre-rendered content with minimal dynamic
behavior. The whole system is one Node service backed by one PostgreSQL
database, deployed via a single `docker compose up`.

This slice is intentionally focused: spaces/hierarchy and multi-language are
hidden schema fields (not UI); delete/restore, search, import/export, AI,
public REST, and MCP are deferred. The data model stays space/path/locale- and
soft-delete-ready so these can be added without migration.

## Technical Context

**Language/Version**: TypeScript 5.x on Node.js 20.9+ (Next.js 16 runtime floor).
**Primary Dependencies**: Next.js 16 (App Router, RSC) + React 19.2; Drizzle ORM
(PostgreSQL); custom bcrypt session auth (DB-backed sessions); pg-boss (job queue,
in-PostgreSQL); unified/remark/rehype (Markdown pipeline); Toast UI Editor
(client Markdown editor); Mantine + Tailwind CSS (unified design system in
`src/components/ui/`); TanStack Query (client server state); Zustand (UI state);
React Hook Form (forms); Zod (schemas); REST + OpenAPI (HTTP API). **i18n**: custom
lightweight framework (`apps/web/src/i18n/`) with type-safe translation keys,
cookie-based locale detection, and standalone locale files. **Theme**: client-side
light/dark/auto toggle with `localStorage` persistence and CSS custom property tokens.
No external services in the default deployment.
**Storage**: PostgreSQL 16+ (single database; page content, revisions, users,
sessions, pg-boss queues all co-located).
**Testing**: Vitest (unit/integration) + Playwright (E2E, incl. the no-SPA
browser-navigation contract).
**Target Platform**: Linux server in Docker (Docker Compose one-shot).
**Project Type**: full-stack web service (Next.js App Router).
**Performance Goals**: Published page reads render with no perceptible
client-side delay (served from pre-rendered HTML stored at save time);
mutations return within the standard request budget (<500ms; nothing in this
slice exceeds the pg-boss 500ms threshold, so no background jobs are required).
**Constraints**: Single Node service + single PostgreSQL database only; no Redis,
Elasticsearch, object storage, email, or external services; no SPA (server-
rendered pages, real URLs, working browser history); server-only rendering of
Markdown to HTML; client editor serializes to raw Markdown only (Toast UI
Editor).
**Scale/Scope**: Single instance; personal/small-team wiki. Three roles,
authors + drafts, flat page list. Concurrent-edit policy: last-write-wins with
full version history (no CRDT).

## Constitution Check

*GATE: Must pass before Phase 0 research. Re-check after Phase 1 design.*

Source: `.specify/memory/constitution.md` v1.3.0. Detail for each mandate lives
in `docs/architecture/`.

| Principle / Mandate | Status | How this slice satisfies it |
|---|---|---|
| P1 Simple Deployment | PASS | One Node service + one PostgreSQL DB; `docker compose up` brings up app + DB + runs migrations. No optional deps introduced. |
| P2 AI Optional Enhancement | PASS (N/A) | AI is not part of this slice. No LLM calls, embeddings, or chat pane. The AI layer is simply absent. |
| P3 Rendering Pipeline is Sacred | PASS | Authoring is Markdown; rendering uses the pluggable `source -> parse -> transform[] -> render` pipeline (remark/rehype). Rendered HTML is cached per revision (stored on the revision row at save time). Page components call the pipeline; they do not contain it. |
| P4 Permissions are First-Class | PASS (scoped) | Every data fetch accepts a permission context and is enforced through one `can(actor, action, resource)` chokepoint. This slice resolves permissions from role + authorship; per-page permission *entries* are deferred (see Complexity Tracking). Anonymous read is the configurable default. |
| P5 Style System & UI Consistency | PASS | All UI built on the unified design system in `src/components/ui/` (Mantine wrappers + Tailwind + tokens). No per-page bespoke styling. |
| P6 Async-First for Heavy Operations | PASS (N/A) | No operation in this slice exceeds 500ms; rendering at save is fast. pg-boss is wired and available but not required by this slice's features. |
| P7 Version Everything | PASS | Every save creates an immutable `page_revision`. Drafts and published versions are both revisions. Diff computed at source level. Soft-delete field present (UI deferred). |
| P8 Open Standards Over Proprietary | PASS (scoped) | Internal frontend↔backend uses REST + OpenAPI with shared Zod schemas. Public REST is the same surface (no separate private/public API); MCP is deferred. |
| P9 Explicit Over Implicit | PASS | Routers, services, plugins, and auth are explicitly registered in traceable entry points. No filesystem-scan discovery. Next.js file-system routing is the allowed framework convention. |
| P10 Operator Experience is Product Surface | PASS | First-run flow creates the initial admin; idempotent migrations; `/healthz` + `/readyz`; documented backup/restore; no internet access required post-install. |
| P11 Focused Scope | PASS | Slice is tightly scoped to read/author/admin. Deferred items (search, delete UI, import/export, AI, spaces UI, i18n, public REST/MCP) are explicit non-goals. |
| P12 Native Web Navigation | PASS | Server-rendered pages at RESTful resource URLs (`/<slug>`, `/<slug>/edit`, `/<slug>/revisions/<n>`, `/admin/users`, `/auth/login`). Breadcrumbs derived from route + page tree. Browser back/forward/refresh/deep-link/open-in-new-tab must work everywhere. Not an SPA. |
| Mandate: Page Tree & Path | PASS (scoped) | Pages carry hidden `space_id` + `path` (single default space); canonical key `(space_id, path, locale)`. Slug is author-chosen, unique within the space, immutable. |
| Mandate: Rendering Pipeline | PASS | `source -> parse -> transform[] -> render`; transformers receive resolved inputs, never touch the DB; output cached per revision hash. Extended with `remark-math`, `rehype-katex`, `rehype-highlight`, and custom Mermaid rehype plugin. |
| Mandate: Permission Model | PASS (scoped) | 3-axis model in place; for this slice evaluation resolves via role + authorship + anonymous-default; no hardcoded admin bypass; no per-page entries yet. Includes `delete` action (admin or author-of-page). |
| Mandate: Content Versioning | PASS | `page_revision` with author, timestamp, locale, content_type, content_hash, full source snapshot; diff at source level; revisions never deleted by normal ops. |
| Mandate: Multi-language | PASS (scoped) | `locale` field present (single default locale); **UI i18n added** (EN/ZH) with standalone locale files and cookie detection; content translations deferred. Permissions not inherited across translations is trivially satisfied (one content locale). |
| Mandate: Editor Extensibility | PASS | Toast UI Editor write-side; serialize to raw Markdown only; client AST never leaves browser; server parses raw Markdown via remark into an independent AST. Markdown is the default editor. |
| Mandate: Deployment & Ops | PASS | Docker Compose with PostgreSQL + app (+ worker if needed, same image) on named volumes; idempotent migrations; `/healthz`, `/readyz`, structured logs, backup/restore docs. |
| Mandate: Frontend Routing & URL | PASS | URL schemes in `contracts/urls.md`; breadcrumbs server-derived; canonical entry points (one URL per resource); GET never mutates; 404/403 are real routes. |
| Mandate: Frontend Data Flow | PASS | RSC for server data with permission context; TanStack Query + fetch for client server state; Zustand for UI state; URL state in search params. |

No gate failures. Two scoped items (P4 per-page entries; P8 public REST/MCP)
are intentional slice boundaries documented in the spec (A7, A11) and tracked
below — they do not violate the constitution's invariants because the
architectural machinery (permission chokepoint; shared service layer) is present
from the start.

## Project Structure

### Documentation (this feature)

```text
specs/001-core-wiki-platform/
├── plan.md              # This file
├── research.md          # Phase 0 output
├── data-model.md        # Phase 1 output
├── quickstart.md        # Phase 1 output
├── contracts/           # Phase 1 output
│   ├── urls.md          # Public URL / navigation contract (P12)
│   ├── rest-api.md      # REST + OpenAPI endpoint contract
│   └── services.md      # Service-layer interface (shared by all API layers)
└── tasks.md             # Phase 2 output (/speckit.tasks — not created here)
```

### Source Code (repository root)

Follows the non-negotiable layout in `docs/architecture/project-structure.md`.
This slice touches:

```text
apps/web/
├── app/
│   ├── (public)/
│   │   ├── page.tsx                  # Wiki home: published page list
│   │   ├── [...path]/page.tsx        # Read a published page (stored HTML)
│   │   ├── edit/[...path]/page.tsx   # Editor (editor/admin only)
│   │   ├── revisions/[n]/[...path]/page.tsx   # View a specific revision
│   │   ├── history/[...path]/page.tsx   # Version history (author/editor/admin)
│   │   └── properties/[...path]/page.tsx  # Page Properties (change path)
│   ├── (auth)/
│   │   ├── login/page.tsx
│   │   └── register/page.tsx
│   ├── (admin)/
│   │   └── admin/users/page.tsx      # User management (admin only)
│   ├── not-found.tsx                 # Real 404 route
│   ├── forbidden.tsx                 # Real 403 route
│   ├── api/
│   │   ├── auth/
│   │   │   ├── login/route.ts          # POST register/login/set-password/setup/logout
│   │   │   ├── register/route.ts
│   │   │   ├── logout/route.ts
│   │   │   ├── me/route.ts
│   │   │   └── setup/route.ts
│   │   ├── pages/
│   │   │   ├── route.ts                # GET listPublished, POST create
│   │   │   └── [...path]/
│   │   │       ├── route.ts            # GET getLive, DELETE remove
│   │   │       ├── edit/route.ts       # GET getForEdit, POST newDraft
│   │   │       ├── history/route.ts    # GET getHistory
│   │   │       └── revisions/
│   │   │           └── [n]/route.ts    # GET getRevision
│   │   ├── revisions/
│   │   │   └── publish/route.ts        # POST publish
│   │   └── users/
│   │       ├── route.ts                # GET list
│   │       └── [id]/
│   │           ├── role/route.ts       # POST setRole
│   │           ├── status/route.ts     # POST setStatus
│   │           └── reset-password/route.ts # POST resetPassword
└── src/
    ├── server/
    │   ├── api/                        # OpenAPI contract + shared REST helpers
    │   │   ├── openapi.ts              # OpenAPI document builder
    │   │   ├── errors.ts               # HTTP error response helpers
    │   │   └── contracts/              # Per-route OpenAPI operation definitions
    │   ├── services/{auth,pages,revisions,users}.ts   # Business logic (thin API)
    │   ├── db/schema/*.ts              # Drizzle schema (users, spaces, pages, page_revisions, sessions)
    │   ├── db/migrations/              # Idempotent Drizzle migrations
    │   ├── auth/                       # Custom bcrypt session auth + first-run admin bootstrap
    │   ├── pipeline/                   # Markdown pipeline (remark/rehype); cache per revision
    │   │   └── transformers/           # remark-math, rehype-katex, rehype-highlight, custom mermaid
    │   ├── permissions/                # can(actor, action, resource) chokepoint + contexts
    │   └── seed/                       # Built-in roles + default space + welcome page
    ├── components/
    │   ├── ui/                         # Unified design system (Mantine wrappers + tokens)
    │   ├── editor/                     # Toast UI Editor Markdown editor (client)
    │   ├── renderer/                   # ContentRenderer, CodeBlock, MermaidBlock (client hydration)
    │   ├── common/                     # Layout, breadcrumbs, page-list, empty/error states
    │   ├── admin/                      # User management UI
    │   ├── theme/                      # ThemeProvider, ThemeToggle (client)
    │   ├── i18n/                       # LanguageSwitcher (client)
    │   └── layout/                     # Header, Navigator, Footer
    ├── i18n/                           # i18n framework: config, types, utils, server.ts, client.tsx
    │   └── locales/                    # Standalone locale files: en.ts (canonical), zh.ts
    ├── hooks/                          # useSession, useHistory, useTranslation, etc.
    └── lib/                            # Shared client utilities
```

**Structure Decision**: Strict adherence to the mandated monorepo layout. The
`[...path]` dynamic segment realizes the RESTful page URL contract. Read routes
are React Server Components that stream the pre-rendered HTML stored on the
revision row; edit/admin/auth routes use client islands where interaction is
needed, but every route remains a real URL with browser history.

## Complexity Tracking

> Justified deviations from full constitution scope. None are violations; all
> preserve the architectural invariants while deferring *data/features*.

| Deviation | Why Needed | Simpler Alternative Rejected Because |
|---|---|---|
| Role-based permissions only (no per-page permission entries yet) | Spec A7 scopes this slice to 3 roles + authorship; no per-page overrides in any user story. | A per-page permission_entry table now would add schema + UI surface with zero acceptance-test coverage in this slice. The `can()` chokepoint and permission-context concept are built now, so adding entries later touches one service, not every query. |
| No public REST + MCP in this slice | Spec user stories are UI-only (read/author/admin); no external API consumers. | Building MCP adapter now is dead surface. The REST + OpenAPI surface is the same one the frontend uses; public consumers can use it once documented. |
| No background jobs exercised | Nothing in this slice exceeds the 500ms async threshold (Markdown render-at-save is fast). | Spawning pg-boss jobs for sub-ms renders adds latency and operational complexity for no benefit. pg-boss is still wired and ready. |
| Client-side `createRoot()` for enhanced blocks | `ContentRenderer` hydrates code/Mermaid blocks via isolated `createRoot()` trees that do not inherit parent React context. Each root must be manually wrapped with `I18nProvider` and `ThemeProvider`, reading locale from `document.documentElement.lang`. | Using a single root would require restructuring the static HTML pipeline; isolated roots are simpler but require explicit provider propagation. |
| Slug immutable (no rename/redirect) | Spec A12 defers rename + redirects. | Building the redirect table + write-time chain resolution now is unused surface. Schema is path-aware so redirects add cleanly later. |
| Single default space + single content locale (hidden fields) | Spec A9/A10. UI i18n added (EN/ZH) but content remains single-locale. | Exposing multi-space UI now contradicts the focused slice; the schema fields are present to avoid migration. |

Post-design Constitution Check (Phase 1): no regressions. The data model
satisfies every mandated invariant (canonical path key, immutable revisions,
source-level diff, permission chokepoint, hidden space/locale/soft-delete
fields). Deferred items are pure scope boundaries, not invariant removals.
