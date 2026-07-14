# Implementation Plan: Client-Side Revision Diff

**Branch**: `codex/018-revision-diff` | **Date**: 2026-07-14 | **Spec**: [spec.md](./spec.md)

**Input**: Feature specification from `/specs/018-revision-diff/spec.md`

## Summary

Add revision-pair selection and the side-by-side comparison to one history page. The canonical history URL carries `compare=a..b`; its route performs the existing permission-checked reads of two revisions and passes their already stored source and rendered HTML to a client component. In the browser, the component uses the existing `diff` package to create an aligned line model, filters whitespace-only changes, collapses unchanged context, coordinates scrolling, and switches between source and rendered-preview presentations. No database change, background work, new HTTP endpoint, or call to the existing server-side Diff operation is involved.

## Technical Context

**Language/Version**: TypeScript 5.6; Node.js 20.9+; Next.js 16.2.9; React 19.2.7

**Primary Dependencies**: Existing `diff` 9.x package; Next.js App Router; React client components; existing stored revision HTML; existing renderer and scroll-anchor helpers; shared UI primitives and i18n catalog

**Storage**: Existing immutable `page_revisions.content_source` and `page_revisions.content_html` only; no schema, migration, persisted preference, or cached comparison result

**Testing**: Vitest 3 pure-model and component tests; Playwright end-to-end tests; production type check, lint, and build

**Target Platform**: Modern desktop and mobile browsers in the existing self-hosted Node.js web application

**Project Type**: Turborepo web application (`apps/web`) with a Next.js App Router frontend and server-side permission services

**Performance Goals**: For two representative revision sources of up to 5,000 lines each, make the browser comparison interactive in under one second after the authorized revision payloads are available; retain responsive two-pane scrolling for the visible hunk set

**Constraints**: All comparison computation, whitespace treatment, hunk selection, option changes, and scroll synchronization run in the browser; no new or invoked server-side Diff API; no new default service, job, migration, or client import from `src/server/`; source displays original text and line numbers; all shareable state is URL-derived

**Scale/Scope**: One history page, exactly two accessible revisions, source and preview modes, four URL-controlled options, and one URL-controlled history selection surface; this release does not compare pages/locales or persist user settings

## Constitution Check

*GATE: Pass before Phase 0 research. Re-checked after Phase 1 design.*

| Principle / mandate | Design response | Gate |
|---|---|---|
| P1: Simple deployment | Reuses existing application dependencies and persisted revision fields; no service, queue, migration, or setup change is introduced. | Pass |
| P4: Rendering pipeline | Preview receives the already sanitized, stored rendered HTML for each immutable revision and mounts it through the shared renderer. The client does not duplicate or bypass the rendering pipeline. | Pass |
| P5: Permissions | The pair route uses two existing permission-checked revision reads. It renders no pair metadata, source, preview, or difference statistic unless both revisions are visible. | Pass |
| P6: UI consistency | Selection, controls, messages, panes, empty states, and errors use shared UI primitives, tokens, and localized catalog keys; no bespoke alert dialogs or inline visual system is introduced. | Pass |
| P7: Async-first | Browser-side comparison is bounded interactive work, not a server operation. There is no request handler computation or background job. | Pass |
| P8: Version everything | The feature treats revisions as immutable inputs and never creates, changes, publishes, restores, or deletes a revision. | Pass |
| P10: Explicit registration | A pure revision-diff model, URL parser, preview-line mapper, and synchronized-scroll hook have named imports and testable contracts; individual route shells do not embed the algorithm. | Pass |
| P11: Navigation and URL contract | History is the sole revision-pair selection and comparison surface. A sorted `/history/<path>?compare=<a>..<b>` address restores the pair; mode and options are canonical search parameters. | Pass |
| P12: Public content delivery | History and revision comparison remain dynamic, permission-dependent views. Public reader HTML, metadata, navigation, cache tags, and invalidation behavior are unchanged. | Pass, static/ISR N/A |

**Pre-design gate result**: Pass. The key risks are accidentally using the legacy server Diff operation, duplicating the server rendering pipeline in the client, or allowing a partial pair to reveal revision information. Phase 0 selects existing single-revision reads, stored HTML, and all-or-nothing route loading to avoid those outcomes.

**Post-design gate result**: Pass. The selected design has no server-contract, database, public-cache, or deployment change. It explicitly separates existing server authorization/reading from browser-only comparison and presentation.

## Project Structure

### Documentation (this feature)

```text
specs/018-revision-diff/
├── plan.md
├── research.md
├── data-model.md
├── quickstart.md
├── contracts/
│   └── revision-diff-ui.md
└── tasks.md                 # Created later by /speckit-tasks
```

### Source Code (repository root)

```text
apps/web/
├── app/(public)/
│   ├── history/[...path]/page.tsx            # existing history server shell; supplies selectable summaries
│   └── revisions/[revision]/[...path]/page.tsx
│                                               # renamed/extended single-revision route; parses n or a..b
├── src/
│   ├── components/
│   │   ├── pages/
│   │   │   ├── HistoryRevisionSelector.tsx    # client selection and canonical navigation
│   │   │   ├── RevisionDiffView.tsx           # URL-derived browser diff orchestration and controls
│   │   │   ├── RevisionSourceDiff.tsx         # aligned source panes and hunk presentation
│   │   │   └── RevisionPreviewDiff.tsx        # stored-HTML previews, changed-block marking, sync anchors
│   │   ├── renderer/ContentRenderer.tsx       # reused sanitized-HTML renderer and islands
│   │   └── editor/scrollSync.ts               # reused/extracted monotonic anchor interpolation helpers
│   ├── lib/
│   │   ├── path.ts                            # canonical revision-pair URL helper
│   │   └── revision-diff.ts                   # pure line tokens, diff model, hunk/context, URL parsing
│   └── i18n/                                  # new localized history/diff keys and catalogs
├── e2e/                                       # browser comparison scenarios
└── package.json                               # existing `diff` dependency retained, no dependency change
```

**Structure Decision**: Keep the algorithm as browser-safe pure utilities in `apps/web/src/lib/` and present it through page-domain components. The route shell may import existing `src/server/services/pages` only to load authorized revision inputs; client modules never import server pipeline, permission, or database code. The existing `ContentRenderer` remains the single client-side mount point for revision HTML and its code/Mermaid islands.

## Complexity Tracking

No constitutional violations or additional architectural complexity require justification.
