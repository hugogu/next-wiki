# Tasks: Client-Side Revision Diff

**Input**: Design documents from `/specs/018-revision-diff/`

**Prerequisites**: [plan.md](./plan.md), [spec.md](./spec.md), [research.md](./research.md), [data-model.md](./data-model.md), [revision-diff-ui.md](./contracts/revision-diff-ui.md), [quickstart.md](./quickstart.md)

**Tests**: Unit, component/integration, and Playwright end-to-end tests are required by the project instructions and the feature success criteria.

**Organization**: Tasks are grouped by user story so each increment can be implemented and tested independently after the shared foundations are complete.

## Format: `[ID] [P?] [Story] Description`

- **[P]**: Can run in parallel with other tasks in its phase because it changes different files and has no incomplete-task dependency.
- **[Story]**: Maps the task to a user story from [spec.md](./spec.md).
- Every task specifies an exact repository path.

## Phase 1: Setup (Shared UI Contract)

**Purpose**: Prepare the localized UI vocabulary required by all comparison states and controls.

- [ ] T001 Add typed revision-history and comparison message keys to `apps/web/src/i18n/keys.ts` and matching English/Chinese messages to `apps/web/messages/en.json` and `apps/web/messages/zh.json`.
- [ ] T002 [P] Extend catalog-parity coverage for the new revision Diff messages in `apps/web/src/i18n/messages.test.ts`.

---

## Phase 2: Foundational (Blocking Prerequisites)

**Purpose**: Establish the pure browser model and canonical URL helpers used by every user story.

**⚠️ CRITICAL**: Complete this phase before implementation of any user-story UI.

- [ ] T003 [P] Add failing pure-model tests for line tokenization, original line-number retention, replacement pairing, collapsed hunk ranges, `context=0`, default context, Full context, CRLF/EOF handling, and a representative 5,000-line comparison in `apps/web/src/lib/revision-diff.test.ts`.
- [ ] T004 Implement the browser-safe aligned-row, hunk/context, changed-line-range, whitespace-key, and comparison-timeout model in `apps/web/src/lib/revision-diff.ts` using the existing `diff` dependency without importing `apps/web/src/server/`.
- [ ] T005 [P] Add failing URL parser/serializer tests for single versions, ascending/reversed pairs, invalid/same-version pairs, default omission, and option preservation in `apps/web/src/lib/path.test.ts`.
- [ ] T006 Extend `apps/web/src/lib/path.ts` with canonical revision-pair href and comparison-option parse/serialize helpers that preserve unrelated search parameters.
- [ ] T007 [P] Add test coverage for existing anchor interpolation, boundary pinning, and bidirectional scroll echo suppression in `apps/web/src/components/editor/scrollSync.test.ts`.
- [ ] T008 Generalize only the reusable paired-pane mapping helpers in `apps/web/src/components/editor/scrollSync.ts` so source-row and preview-block panes can rebuild maps, clamp movement, and suppress scroll feedback loops.

**Checkpoint**: Pure diff data, URL semantics, and scroll primitives are verified; no API, migration, or server-side Diff behavior has been added.

---

## Phase 3: User Story 1 - Compare Any Two Page Revisions (Priority: P1) 🎯 MVP

**Goal**: A reader selects two visible revisions from history and reaches one permission-safe, canonical comparison route with earlier revision on the left.

**Independent Test**: From a page with three visible revisions, select two non-adjacent versions in either order and verify an ascending pair link restores the same pair after reload; verify a direct link containing an inaccessible revision exposes no partial data.

### Tests for User Story 1

- [ ] T009 [P] [US1] Add history-page selection, disabled-Compare, ascending-navigation, and existing publish-action regression tests in `apps/web/app/(public)/history/[...path]/page.test.tsx`.
- [ ] T010 [P] [US1] Add route tests for existing `/revisions/<n>/<path>`, valid/reversed `/revisions/<a>..<b>/<path>`, malformed/same-version pairs, two authorized reads, and all-or-nothing inaccessible outcomes in `apps/web/app/(public)/revisions/[revision]/[...path]/page.test.tsx`.

### Implementation for User Story 1

- [ ] T011 [US1] Create the keyboard-accessible two-revision selection, selection-status, and canonical Compare navigation component in `apps/web/src/components/pages/HistoryRevisionSelector.tsx`.
- [ ] T012 [US1] Integrate `HistoryRevisionSelector` into `apps/web/app/(public)/history/[...path]/page.tsx` while retaining revision links, visible-history rules, and `PublishButton` behavior.
- [ ] T013 [US1] Rename `apps/web/app/(public)/revisions/[n]/[...path]/page.tsx` to `apps/web/app/(public)/revisions/[revision]/[...path]/page.tsx` and retain the single-version branch while adding pair parsing, ascending canonical redirect, concurrent existing `pageService.getRevision` reads, and no-partial-data handling.
- [ ] T014 [US1] Create the pair metadata and URL-derived comparison shell in `apps/web/src/components/pages/RevisionDiffView.tsx`, receiving only the two already-authorized revision views from the route.
- [ ] T015 [US1] Add non-adjacent selection, copied-link restoration, reversed-pair normalization, and inaccessible-pair non-disclosure scenarios to `apps/web/e2e/revision-diff.spec.ts`.

**Checkpoint**: User Story 1 independently delivers safe history selection and a bookmarkable pair route while existing single-revision links continue to work.

---

## Phase 4: User Story 2 - Inspect a Focused, Code-Style Source Diff (Priority: P1)

**Goal**: A reader sees aligned source panes with original line numbers, clear change states, and controlled context instead of an entire document by default.

**Independent Test**: Compare two multi-section revisions with additions, removals, replacements, and distant unchanged regions; verify aligned source rows and default three-line context, then verify `0` and Full context.

### Tests for User Story 2

- [ ] T016 [P] [US2] Add component tests for line numbers, paired added/removed/changed states, collapsed-range labels, no-difference status, and source context controls in `apps/web/src/components/pages/RevisionSourceDiff.test.tsx`.
- [ ] T017 [P] [US2] Add URL-state integration tests for source mode and context changes in `apps/web/src/components/pages/RevisionDiffView.test.tsx`.

### Implementation for User Story 2

- [ ] T018 [US2] Implement side-by-side aligned source rows, accessible change semantics, collapsed separators, and Full-context rendering in `apps/web/src/components/pages/RevisionSourceDiff.tsx` using `apps/web/src/lib/revision-diff.ts` as the only diff model source.
- [ ] T019 [US2] Wire source mode, context controls, normalized URL updates, no-difference state, and client-computation failure recovery into `apps/web/src/components/pages/RevisionDiffView.tsx` without mutating revision data.
- [ ] T020 [US2] Extend `apps/web/e2e/revision-diff.spec.ts` with source line-number, default-context, `context=0`, larger-context, Full-context, and no-difference scenarios.

**Checkpoint**: User Stories 1 and 2 provide a complete, line-oriented client-side source comparison with focused context.

---

## Phase 5: User Story 3 - Filter Cosmetic Differences and Navigate Both Panes Together (Priority: P2)

**Goal**: A reader can exclude whitespace-only differences and enable or disable stable bidirectional scrolling in source view.

**Independent Test**: Compare revisions containing spaces, tabs, blank lines, and substantive edits; enable Ignore whitespace and verify only substantive changes remain, then scroll each pane with sync on and off.

### Tests for User Story 3

- [ ] T021 [P] [US3] Add whitespace-regression cases for leading, trailing, internal, tab, and blank-line-only edits without source-text rewriting in `apps/web/src/lib/revision-diff.test.ts`.
- [ ] T022 [P] [US3] Add source-pane linked-scroll, disabled-scroll, and feedback-loop component tests in `apps/web/src/components/pages/RevisionSourceDiff.test.tsx`.

### Implementation for User Story 3

- [ ] T023 [US3] Add Ignore whitespace and linked-scroll controls with URL-derived state and accessible labels to `apps/web/src/components/pages/RevisionDiffView.tsx`.
- [ ] T024 [US3] Connect aligned source-row anchors to the generalized mapping helpers in `apps/web/src/components/pages/RevisionSourceDiff.tsx` so either pane synchronizes without oscillation and remains independent when `sync=0`.
- [ ] T025 [US3] Extend `apps/web/e2e/revision-diff.spec.ts` with whitespace-only/substantive changes, query restoration, two-direction scrolling, and disabled-sync regression coverage.

**Checkpoint**: User Stories 1–3 give readers a focused source comparison that can ignore cosmetic formatting and supports reliable independent or linked inspection.

---

## Phase 6: User Story 4 - Compare Rendered Document Previews (Priority: P2)

**Goal**: A reader can inspect the same revision pair as complete, side-by-side rendered documents with changed blocks identifiable and synchronized navigation.

**Independent Test**: Compare revisions containing headings, paragraphs, lists, a table or code block, and a frontmatter-only edit; switch views and verify pair/options persist, complete previews render, and no false block highlight is shown for frontmatter only.

### Tests for User Story 4

- [ ] T026 [P] [US4] Add changed-block range, frontmatter-offset, frontmatter-only indicator, and complete-document preview tests in `apps/web/src/components/pages/RevisionPreviewDiff.test.tsx`.
- [ ] T027 [P] [US4] Add source-to-preview option preservation and preview URL-state tests in `apps/web/src/components/pages/RevisionDiffView.test.tsx`.

### Implementation for User Story 4

- [ ] T028 [US4] Implement two stored-HTML preview panes, `data-line` changed-block marking, frontmatter-offset handling, resize-aware anchor rebuilding, and no-anchor fallback in `apps/web/src/components/pages/RevisionPreviewDiff.tsx` by reusing `ContentRenderer` and scroll helpers.
- [ ] T029 [US4] Wire source/preview switching, preview context semantics, shared options, and preview linked scrolling into `apps/web/src/components/pages/RevisionDiffView.tsx` without adding a browser Markdown renderer or a server preview/Diff request.
- [ ] T030 [US4] Extend `apps/web/e2e/revision-diff.spec.ts` with source-to-preview switching, rendered-block identification, preview scroll synchronization after asynchronous sizing, and frontmatter-only scenarios.

**Checkpoint**: All user stories work independently for the selected pair, and preview remains faithful to the existing rendering pipeline.

---

## Phase 7: Polish & Cross-Cutting Concerns

**Purpose**: Verify contracts, accessibility, compatibility, and release quality across the completed stories.

- [ ] T031 [P] Add focused route, history, and renderer regression coverage for canonical pair URLs, breadcrumbs/back navigation, existing single revision behavior, and localized accessible names in `apps/web/app/(public)/history/[...path]/page.test.tsx`, `apps/web/app/(public)/revisions/[revision]/[...path]/page.test.tsx`, and `apps/web/src/components/pages/RevisionDiffView.test.tsx`.
- [ ] T032 [P] Add browser-level regression assertions that no comparison flow calls `apps/web/app/api/v1/pages/[id]/revisions/[version]/diff/route.ts` and that no comparison action writes page/revision data in `apps/web/e2e/revision-diff.spec.ts`.
- [ ] T033 Run the documented lint, typecheck, unit/component, Playwright, and production-build commands from `specs/018-revision-diff/quickstart.md` and resolve every issue in the affected `apps/web/` files.
- [ ] T034 Record completed manual quickstart checks, including permissions and public-content cache invariance, in `specs/018-revision-diff/quickstart.md` without changing implementation scope.

---

## Dependencies & Execution Order

### Phase Dependencies

- **Phase 1 (Setup)**: Starts immediately; T001 is required before visual UI implementation, while T002 can run in parallel.
- **Phase 2 (Foundational)**: Depends on the feature decisions in Phase 1 and blocks all user stories. T004 depends on T003, T006 depends on T005, and T008 depends on T007.
- **US1 (Phase 3)**: Depends on T004 and T006; establishes the pair route and selection entry point.
- **US2 (Phase 4)**: Depends on the US1 pair shell and T004; adds independently testable source comparison.
- **US3 (Phase 5)**: Depends on US2 and T008; adds whitespace and source-pane synchronization.
- **US4 (Phase 6)**: Depends on US1 and T008; its preview presentation can be implemented after the pair shell, but should merge after US2/US3 to preserve one control surface.
- **Phase 7 (Polish)**: Depends on every desired user-story phase.

### User Story Dependencies

```text
Setup → Foundation → US1 (pair selection and route)
                       ├─→ US2 (source diff) ─→ US3 (whitespace and source sync)
                       └─→ US4 (rendered preview and preview sync)
US2 + US3 + US4 → Polish
```

- **US1** is the MVP: it can be verified with history selection, canonical navigation, and permission-safe pair loading.
- **US2** requires the US1 pair route because it presents the selected pair.
- **US3** requires US2's source panes and shared scroll helpers.
- **US4** requires the US1 pair route and can use the shared control shell; it must preserve the options introduced by US2 and US3.

### Parallel Opportunities

- T001 and T002 can proceed in parallel.
- T003 and T005 can proceed in parallel; T007 can also proceed independently of the diff model.
- T009 and T010 can be written in parallel before their respective implementation tasks.
- T016 and T017 can be written in parallel; T021 and T022 can be written in parallel; T026 and T027 can be written in parallel.
- Once US1 is stable, the preview component work in T026/T028 and source diff preparation in T016/T018 can proceed in parallel, with shared changes coordinated in `RevisionDiffView.tsx`.

## Parallel Example: User Story 2

```text
Task: "Add source diff component cases in apps/web/src/components/pages/RevisionSourceDiff.test.tsx"
Task: "Add URL state cases in apps/web/src/components/pages/RevisionDiffView.test.tsx"
```

## Parallel Example: User Story 4

```text
Task: "Add preview range and frontmatter tests in apps/web/src/components/pages/RevisionPreviewDiff.test.tsx"
Task: "Add view-state preservation tests in apps/web/src/components/pages/RevisionDiffView.test.tsx"
```

## Implementation Strategy

### MVP First (User Stories 1 and 2)

1. Complete Setup and Foundational work.
2. Implement US1 selection and canonical pair routing with all-or-nothing authorization.
3. Implement US2 source presentation and context control so the selected pair has a useful client-side Diff.
4. Run the US1/US2 route, history, pure-model, component, and focused Playwright scenarios.
5. Demonstrate copied-link restoration, inaccessible-pair non-disclosure, and default source context before adding whitespace, scroll, and preview complexity.

### Incremental Delivery

1. Deliver US1 for selectable, permission-safe revision pairs.
2. Add US2 for useful code-style source comparison and context control.
3. Add US3 for whitespace filtering and source synchronization.
4. Add US4 for complete rendered previews and block-level change guidance.
5. Finish Polish only after all relevant automation and manual quickstart checks pass.

## Notes

- All 34 tasks use the required checkbox, sequential ID, optional parallel marker, story label where applicable, and concrete file path format.
- No task adds a database migration, public API, server-side Diff call, browser Markdown renderer, default deployment dependency, or persisted comparison preference.
- Commit each completed logical implementation group separately; keep refactoring of generic scroll helpers isolated from feature behavior changes where practical.
