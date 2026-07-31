# Implementation Plan: Static Site Publishing

**Branch**: `031-static-site-publishing` | **Date**: 2026-07-31 | **Spec**: [spec.md](./spec.md)

**Input**: Feature specification from `/specs/031-static-site-publishing/spec.md`

## Summary

Publish a reader-facing static website of the wiki's publicly readable pages to
a Git-served static host (GitHub Pages first), as ready-to-serve HTML that the
host does not build.

The approach is to reuse, not re-create: page bodies come from the existing
`renderMarkdown()` pipeline, the document shell is composed from the existing
`@/components/ui` primitives through React's static renderer, the stylesheet is
the existing `globals.css` compiled once at image build time, the interactive
islands are the existing `ContentRenderer` bundled once at image build time, and
delivery reuses the Git transport already proven by Git export (extracted into a
shared helper first). The only genuinely new machinery is the eligibility filter,
the snapshot assembler, the Pagefind search index step, and the admin surface.

Eligibility is the architectural centerpiece: one query decides the publishable
set, and navigation, breadcrumbs, sitemap, links, assets, and the search index
are all derived from that single set, so a page that is not eligible has no path
into the artifact at all.

## Technical Context

**Language/Version**: TypeScript 5.x on Node.js 20.9+ (image runs `node:24-alpine`)

**Primary Dependencies**: existing — unified/remark/rehype pipeline, React 19.2
(`react-dom/server` static rendering), Tailwind CSS 3.4 CLI, KaTeX, mermaid,
pg-boss, Drizzle, `git` + `openssh-client` (already installed in the runner
image). New — `esbuild` (build-time `devDependency`), `pagefind_extended`
(pinned binary in the runner image, publish-time only).

**Storage**: PostgreSQL — two new tables (`static_site_targets`,
`static_site_publications`). Transient snapshot assembly in a temp directory.
Delivered state lives in the target Git repository, never read back.

**Testing**: Vitest (unit + integration) and Playwright (E2E), using the
existing `apps/web/e2e/` layout.

**Target Platform**: Linux container for generation; the artifact targets any
static file host with no server-side runtime.

**Project Type**: Web application inside the existing pnpm/Turborepo monorepo —
server-side generator, admin UI, plus two build-time asset artifacts.

**Performance Goals**: full snapshot of 1,000 published pages generated and
delivered in under 5 minutes; reader search results under 1 second (SC-006);
first page view must not require downloading the whole search corpus (FR-023).

**Constraints**: no read-time request from the published site to the wiki or any
third-party CDN (FR-020); snapshot replacement must be atomic from the reader's
perspective (FR-031); zero disclosure of non-eligible content (SC-002, release
blocking).

**Scale/Scope**: up to ~10,000 published pages per snapshot; a single target per
deployment in this iteration.

## Constitution Check

*GATE: evaluated before Phase 0, re-evaluated after Phase 1 design.*

| Principle | Assessment |
|---|---|
| **P1 Simple Deployment, Personal by Default** | PASS with a noted cost. No new stateful service, no new environment variable required for the default deployment, and the feature is inert unless an Admin configures a target. It does add a pinned `pagefind_extended` binary to the runner image (image size) and an `esbuild` build-time dependency. Recorded in Complexity Tracking. |
| **P2 AI-Native, Never Vendor-Locked** | N/A. No AI involvement. The feature must not require an LLM and does not call one. |
| **P3 Portable, Self-Growing AI Memory** | PASS. Read-only over published revisions; produces a derived, fully rebuildable projection. Generated-knowledge and raw-capture spaces are excluded from publication (FR-013), so the feature cannot turn ungoverned AI output into public knowledge. |
| **P4 Rendering Pipeline is Sacred** | PASS. Page bodies come from `renderMarkdown()` unchanged. No renderer is duplicated or hardcoded in the static shell; if a pipeline plugin changes, the published site changes with it. |
| **P5 Permissions are First-Class** | PASS. Publishable-set selection is a single permission-derived query (FR-007). All admin operations go through the existing `assertCanManage*` chokepoint (FR-036). The publish job re-derives eligibility at run start rather than trusting anything cached. |
| **P6 Style System Independence & UI Consistency** | PASS. The shell composes `@/components/ui` primitives and the compiled `globals.css`; per-deployment appearance tokens are serialized by the existing `buildUserAppearanceCss()`. No vendored styles, no site-specific component tree. |
| **P7 Async-First for Heavy Operations** | PASS. Publishing is a pg-boss job on its own queue; the API returns a run id immediately (FR-028) and the UI polls status. |
| **P8 Version Everything** | PASS / N/A. The feature reads published revisions and creates none. Publish runs are operational history in their own table, not content revisions. |
| **P9 Open Standards Over Proprietary** | PASS. Admin surface is REST + OpenAPI like every other admin API. The artifact is plain HTML/CSS/JS with no host-proprietary constructs, so it is servable anywhere. |
| **P10 Explicit Over Implicit** | PASS. The new queue and handler are registered explicitly in `jobs/register.ts`; no filesystem scanning or dynamic discovery. Build-time asset generation is an explicit script invoked by the build, not a convention. |
| **P11 Native Web Navigation & Unified Entry Points** | PASS. Exactly one admin entry point (`/admin/static-site`), deliberately not folded into `/admin/storage` where Git export lives, because the spec's core premise is that these are different features. Published addresses mirror the reader's own URL shape, so links stay shareable and bookmarkable. |
| **P12 Public Reading Is Static by Default** | PASS, and reinforced. The feature does not alter the wiki's own ISR representation. The artifact is the strongest possible form of the principle: every document is pre-rendered with no query, session, cookie, or header read. |

**Anti-pattern review**:

- *Per-page bespoke styling*: avoided by construction (research R2, R3).
- *Duplicate feature entry points*: one admin route; Git export keeps its own.
  The UI must state plainly that these are different features so an operator
  does not read them as two paths to one outcome.
- *Session-bound public documents*: impossible here — the artifact has no
  session concept, and FR-019 forbids shipping personalized controls.
- *Broken browser navigation / state without a URL*: the site is ordinary
  documents at ordinary addresses; search state is reflected in the URL.

**Public Content Delivery documentation** (required by the template): this
feature does not change the wiki's public page body, public metadata, or public
navigation, nor their cache representation or lifetime. It adds an external
representation of already-anonymous content. The mutations that already
revalidate public ISR paths and tags — publish, unpublish, delete, path/title/
metadata change, visibility change, space anonymous-read change, navigation and
locale changes — additionally mark the published site stale and, when automatic
publishing is enabled, enqueue a republish. No new cache tag is introduced on
the wiki side.

**AI/knowledge documentation** (required by the template): not applicable. The
feature captures no source material, feeds no AI memory, generates no knowledge,
and permits no agent mutation. Its only interaction with the AI domain is
negative: content in generated-knowledge and raw-capture spaces is excluded from
publication.

**Gate result**: PASS. One justified cost recorded in Complexity Tracking.

## Project Structure

### Documentation (this feature)

```text
specs/031-static-site-publishing/
├── plan.md              # This file
├── spec.md              # Feature specification
├── research.md          # Phase 0 output
├── data-model.md        # Phase 1 output
├── quickstart.md        # Phase 1 output
├── contracts/           # Phase 1 output
│   └── admin-api.md
├── checklists/
│   └── requirements.md
└── tasks.md             # Phase 2 output (/speckit.tasks — not created here)
```

### Source Code (repository root)

```text
packages/shared/src/
└── static-site.ts                    # Zod schemas + types (zero-dep)

apps/web/src/server/static-site/      # Snapshot generation (server-only)
├── eligibility.ts                    # The single publishable-set query
├── paths.ts                          # Address form, base path, collision detection
├── links.ts                          # Internal link rewrite + non-eligible downgrade
├── navigation.ts                     # Page tree, breadcrumbs, language switcher data
├── document.tsx                      # Static document shell (renderToStaticMarkup)
├── assets.ts                         # Asset selection and export
├── search-index.ts                   # Pagefind invocation over generated HTML
├── preflight.ts                      # Size/limit checks before delivery
└── snapshot.ts                       # Orchestrates a complete snapshot into a directory

apps/web/src/server/git/
├── export.ts                         # (existing) Git export materializer
└── transport.ts                      # (new, extracted) shared git env + invocation

apps/web/src/server/services/
└── static-site.ts                    # Target CRUD, trigger, run history, permissions

apps/web/src/server/jobs/
├── static-site-publish.ts            # pg-boss handler
├── register.ts                       # (modified) explicit queue registration
└── runtime.ts                        # (modified) new queue id + expiry

apps/web/src/static-site/client/      # Client runtime, bundled at image build time
├── index.tsx                         # Mounts ContentRenderer islands, theme, language
└── search.tsx                        # Search UI over the Pagefind JS API

apps/web/src/components/
├── static-site/SearchPanel.tsx       # Shared search UI built on components/ui
└── admin/static-site/                # Admin panel components

apps/web/app/(admin)/admin/static-site/page.tsx    # Single admin entry point
apps/web/app/api/admin/static-site/...             # REST route handlers

apps/web/src/server/db/schema/index.ts             # (modified) two new tables
apps/web/messages/{en,zh}.json                     # (modified) new shell strings

scripts/build-static-site-assets.mjs               # Tailwind CLI + esbuild, build time
docker/Dockerfile                                  # (modified) pinned pagefind binary
```

**Structure Decision**: The generator lives inside `apps/web` rather than in a
new workspace package, because it must import the app's own rendering pipeline,
UI primitives, message catalogs, and appearance builder. Extracting it to a
package would either duplicate those or invert the dependency. `src/server/` is
server-only per the project-structure mandate; the client runtime is the one new
client-side entry point and is confined to `src/static-site/client/`, importing
shared components rather than defining its own.

## Phase Summary

**Phase 0 — Research** (complete): see [research.md](./research.md). Twelve
decisions recorded, covering HTML generation, stylesheet production, client
runtime bundling, search engine selection, configuration storage, Git delivery,
address scheme, locale handling, appearance tokens, filter enforcement, run
atomicity, and testing strategy. No unresolved unknowns remain.

**Phase 1 — Design** (complete): see [data-model.md](./data-model.md) and
[contracts/admin-api.md](./contracts/admin-api.md) for the two new tables, the
derived in-memory model, the artifact layout contract, and the admin REST
surface. [quickstart.md](./quickstart.md) documents the operator path end to
end.

**Phase 2 — Tasks**: not produced by this command. Run `/speckit.tasks`.

**Suggested delivery order** (each independently shippable, matching the spec's
priorities):

1. Extract the shared Git transport as a standalone refactoring commit, with
   Git export's tests green and unchanged.
2. Schema, shared schemas, service layer, admin REST surface, and admin UI with
   validation but no generation — target configuration becomes possible.
3. Eligibility, paths, links, assets, and snapshot assembly with the document
   shell — plus the negative leak test, which gates everything after it.
4. Build-time asset pipeline (Tailwind CSS + esbuild bundle) and the client
   runtime, delivering rendering parity, dark mode, and anchors.
5. Pagefind index step and the search UI.
6. Multi-locale addressing, language switcher, and the missing-translation stub.
7. Automatic and scheduled triggers, run history, and staleness marking.
8. Takedown and credential destruction.

## Complexity Tracking

| Violation | Why Needed | Simpler Alternative Rejected Because |
|---|---|---|
| `pagefind_extended` binary added to the runner image (P1 baseline footprint) | FR-022 requires Chinese fragment search and FR-023 forbids making the reader download the whole corpus. A chunked, CJK-segmented index is the requirement, and Pagefind is the established implementation of exactly that shape. | Pure-JS engines (Orama, MiniSearch, FlexSearch, lunr) are all in-memory and all-or-nothing: the browser must fetch the entire index before the first query, directly failing FR-023 at the spec's stated scale. A hand-built sharded CJK index would reinvent Pagefind's core without its testing. The binary adds no service, no setup step, and no runtime dependency for deployments that never publish. |
| A second client-side entry point (`src/static-site/client/`) outside the Next app | The published artifact must run without the wiki, so its JavaScript cannot come from Next's build output for the app's routes. | Shipping no JavaScript would drop mermaid diagrams and client-side search (FR-015, FR-021). Hand-writing vanilla JS for the static site would fork the renderer components and violate P6. Bundling the existing components is the option that keeps one implementation. |
| Two new tables rather than reusing `storage_backends` | FR-002 mandates independence, and run history (FR-032) has no home in a single-row backend record. | Extending `storage_backends` with a `static_site` purpose would couple the two features through a shared unique index and force meaningless columns (`replica_state`, `is_read_preferred`) onto a target that is never read from. |
