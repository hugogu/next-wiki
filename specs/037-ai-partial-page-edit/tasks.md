---

description: "Task list for AI Anchored Partial Page Edits"

---

# Tasks: AI Anchored Partial Page Edits

**Input**: Design documents from `/specs/037-ai-partial-page-edit/`

**Prerequisites**: [plan.md](plan.md), [spec.md](spec.md), [research.md](research.md), [data-model.md](data-model.md), [contracts/wiki-ai-tools.md](contracts/wiki-ai-tools.md), [quickstart.md](quickstart.md)

**Tests**: Included. plan.md's Testing section and contracts/wiki-ai-tools.md's "Required Verification" explicitly call for Vitest coverage at the splice-engine, executor, and prompt-guidance layers; tasks below write those tests first per story.

**Organization**: Tasks are grouped by user story (spec.md US1/US2/US3) so each is independently implementable and testable.

## Format: `[ID] [P?] [Story] Description`

- **[P]**: Can run in parallel (different files, no dependencies on incomplete tasks)
- **[Story]**: Maps the task to spec.md's US1/US2/US3
- Every task names its exact file path

## Path Conventions

Single project (Next.js monorepo, per plan.md Project Structure): all paths
are under `apps/web/src/server/`. No `frontend/`/`backend/` split applies —
this feature adds no UI, only built-in AI tool code.

## Phase 1: Setup

No project initialization is required. This feature adds code to existing
services (`apps/web/src/server/services/ai-tool-registry.ts`,
`ai-tool-executors.ts`, `apps/web/src/server/jobs/wiki-question-tool-planner.ts`)
and one new module; it introduces no new package dependency, environment
variable, or database migration (data-model.md: no schema change).

---

## Phase 2: Foundational

No cross-story blocking infrastructure exists for this feature: US3 (the
`save_draft` content-loss guard) is fully independent of US1/US2's new
splice engine and tool, so nothing needs to be built before *every* story can
start. Each story's own prerequisite tasks are listed in its phase below.

---

## Phase 3: User Story 1 - Refresh Part of a Large Page Without Losing the Rest (Priority: P1) 🎯 MVP

**Goal**: A new `insert_page_content` tool lets Wiki AI change one exact,
anchored passage of an existing page (insert before/after, or replace)
without resupplying any other Markdown, and the result is a normal
reviewable draft revision.

**Independent Test**: Ask Wiki AI to add or correct one specific passage on a
large existing page. Confirm the resulting draft is byte-identical to the
prior revision outside that passage, and that no `save_draft` call with a
full-body `contentSource` was needed.

### Tests for User Story 1 ⚠️

> Write these first; they must fail (module/executor/tool do not exist yet).

- [ ] T001 [P] [US1] Unit tests for the anchor-splice engine — unique
  `insertBefore`, unique `insertAfter`, unique `replace` (including
  `replace` with empty text), anchor missing, anchor at the very start/end of
  the document, anchor immediately bordering a fenced code block or table
  without corrupting it, byte-for-byte preservation of everything outside the
  edited span — in
  `apps/web/src/server/services/ai-page-content-patch.test.ts`
- [ ] T002 [P] [US1] Executor tests for `insert_page_content` single-edit
  happy path: successful insert/replace creates one new draft revision;
  `revisionId` not matching the page's current latest revision fails with
  `STALE_REVISION` before any change; `edit` permission scope is enforced;
  the tool result never echoes the full page body
  (`resultRetention: 'never_full_result'`) — in
  `apps/web/src/server/services/ai-tool-runtime.permissions.test.ts`
- [ ] T003 [P] [US1] Planner prompt test: the tool catalog shown to the model
  includes `insert_page_content` with its argument contract, and the
  write-tool guidance directs the model to prefer it for incremental changes
  to an existing page, reserving `save_draft` for full rewrites (FR-008) — in
  `apps/web/src/server/jobs/wiki-question-tool-planner.test.ts`

### Implementation for User Story 1

- [ ] T004 [US1] Implement the anchor-splice engine — exported function(s)
  accepting the current source and an ordered list of `{ anchor, mode:
  'insertBefore' | 'insertAfter' | 'replace', text }` operations, returning
  the spliced result; exact-literal anchor matching; throws the existing
  `DomainError('STALE_REVISION', ...)` shape for a missing anchor and
  `DomainError('BAD_REQUEST', ...)` for an ambiguous (non-unique) anchor,
  mirroring `insertGeneratedImagesIntoMarkdown`'s existing error shapes — in
  `apps/web/src/server/services/ai-page-content-patch.ts` (make T001 pass)
- [ ] T005 [US1] Define `insertPageContentArgs` Zod schema (`pageId`,
  `revisionId`, `edits`: non-empty array of `{ anchor, mode, text }`, 1–20
  items per data-model.md) in
  `apps/web/src/server/services/ai-tool-executors.ts`
- [ ] T006 [US1] Implement `execInsertPageContent`: load the page and its
  current latest revision via existing `content.getPageById`, verify
  `revisionId` matches (else `STALE_REVISION`), call the splice engine from
  T004, then `content.createDraft(ctx, pageId, { title: page.title,
  contentSource: spliced, baseRevisionId: revisionId })`, and return
  `{ pageId, version, editsApplied: edits.length }` — in
  `apps/web/src/server/services/ai-tool-executors.ts` (depends on T004, T005)
- [ ] T007 [US1] Register `insert_page_content` in the `TOOL_EXECUTORS` map —
  in `apps/web/src/server/services/ai-tool-executors.ts` (depends on T006)
- [ ] T008 [US1] Register the `insert_page_content` `ToolDefinition`
  (`category: 'page_draft'`, `riskLevel: 'draft_write'`, `requiredScope:
  'edit'`, `resultRetention: 'never_full_result'`, `defaultReviewPolicy:
  'always_review'`, `inputSchema` mirroring T005, description per
  contracts/wiki-ai-tools.md) in
  `apps/web/src/server/services/ai-tool-registry.ts`
- [ ] T009 [US1] Add `insert_page_content` usage guidance to
  `WRITE_TOOL_GUIDANCE` in `wiki-question-tool-planner.ts`: prefer it for
  incremental changes to an existing page; use the exact `pageId`/`revisionId`
  from `get_page`; each `anchor` must be copied verbatim (same
  backslash-preservation rule that already applies to `save_draft`'s
  `contentSource`); reserve `save_draft` for genuine full rewrites (FR-008) —
  in `apps/web/src/server/jobs/wiki-question-tool-planner.ts` (depends on
  T008)
- [ ] T010 [US1] Run T001–T003 and confirm they pass; reconcile any drift
  between the contract and the implementation

**Checkpoint**: A single anchored edit works end to end — tool call, draft
creation, byte-identical untouched content — independently of US2/US3.

---

## Phase 4: User Story 2 - Apply Several Related Edits Together, or Not at All (Priority: P2)

**Goal**: A request naming several anchored edits against the same page
either lands as exactly one new draft revision containing all of them, or
none of them — never a partial subset.

**Independent Test**: Ask Wiki AI to make three unrelated small changes to
one page in a single request; confirm one draft with all three changes.
Repeat with one intentionally invalid anchor among three; confirm zero
changes and a clear error naming the failing anchor.

### Tests for User Story 2 ⚠️

- [ ] T011 [P] [US2] Unit tests for multi-edit atomicity in the splice engine:
  all anchors valid → all edits applied in one pass; any one anchor missing
  or ambiguous → no edits applied (result unchanged from input); two
  requested edits whose anchor spans overlap → the whole batch rejected;
  deterministic output when multiple edits resolve to the same or adjacent
  positions — in `apps/web/src/server/services/ai-page-content-patch.test.ts`
- [ ] T012 [P] [US2] Executor tests for `insert_page_content` multi-edit
  requests: several valid edits produce exactly one new draft revision
  containing all of them; one invalid anchor among several leaves the page
  unchanged (no draft created) and the rejection names which anchor failed —
  in `apps/web/src/server/services/ai-tool-runtime.permissions.test.ts`

### Implementation for User Story 2

- [ ] T013 [US2] Add overlap/conflict detection between requested edit spans
  to the splice engine — resolve every anchor's position against the
  *original* source first, reject the entire batch (not just the conflicting
  pair) if any two resolved spans overlap, and only then apply all splices in
  one pass — in `apps/web/src/server/services/ai-page-content-patch.ts`
  (depends on T004; extends US1's module)
- [ ] T014 [US2] Ensure `execInsertPageContent` surfaces which specific
  anchor failed (missing, ambiguous, or overlapping) in the rejection
  message returned to the model, so a retry can target the right edit — in
  `apps/web/src/server/services/ai-tool-executors.ts` (depends on T006, T013)
- [ ] T015 [US2] Run T011–T012 and confirm they pass

**Checkpoint**: US1 and US2 both independently functional — single and
multi-anchor edits, atomic by construction.

---

## Phase 5: User Story 3 - Catch a Full-Page Rewrite That Silently Dropped Most of the Page (Priority: P3)

**Goal**: A `save_draft` submission whose content is dramatically shorter
than the page's current revision is rejected by default instead of silently
becoming an ordinary draft, unless the caller explicitly acknowledges the
reduction.

**Independent Test**: Submit a `save_draft` call for an existing large page
whose new `contentSource` is a small fraction of the current revision's
length, with no acknowledgement flag. Confirm no draft is created and the
result explains the apparent content loss. Repeat with the acknowledgement
flag set and confirm it succeeds.

> This story is fully independent of US1/US2 — it only touches the existing
> `execSaveDraft` and does not depend on `insert_page_content` existing.

### Tests for User Story 3 ⚠️

- [ ] T016 [P] [US3] Unit/executor tests for the content-loss guard in
  `execSaveDraft`: submission below the configured ratio (50% of the current
  revision's `contentSource.length`) without `acknowledgedContentReduction`
  is rejected and creates no draft; the same submission with
  `acknowledgedContentReduction: true` succeeds; a submission at or above the
  ratio succeeds regardless of the flag; the guard composes correctly with
  the existing `assertCompleteDraftSource` short-instruction check (both can
  independently reject the same call for different reasons) — in
  `apps/web/src/server/services/ai-tool-runtime.permissions.test.ts`

### Implementation for User Story 3

- [ ] T017 [US3] Add an `acknowledgedContentReduction` optional boolean field
  (default `false`) to `saveDraftArgs` — in
  `apps/web/src/server/services/ai-tool-executors.ts`
- [ ] T018 [US3] Add a named `CONTENT_LOSS_MIN_RATIO` constant (0.5) and a
  guard function alongside `assertCompleteDraftSource` that compares the
  resolved submission length against `page.contentSource.length` and throws
  `DomainError('BAD_REQUEST', ...)` naming the size drop when below the ratio
  and `acknowledgedContentReduction` is not `true`; call it from
  `execSaveDraft` before `createDraft` — in
  `apps/web/src/server/services/ai-tool-executors.ts` (depends on T017)
- [ ] T019 [US3] Add `acknowledgedContentReduction` usage guidance to
  `WRITE_TOOL_GUIDANCE`: set it to `true` only when the user's own request
  explicitly asked to delete or drastically shorten the page, never as a
  default or to silence a rejection — in
  `apps/web/src/server/jobs/wiki-question-tool-planner.ts`
- [ ] T020 [US3] Run T016 and confirm it passes

**Checkpoint**: All three stories independently functional.

---

## Phase 6: Polish & Cross-Cutting Concerns

- [ ] T021 [P] Regression run of
  `apps/web/src/server/services/ai-generated-image-insertion.test.ts` — if
  `insertGeneratedImagesIntoMarkdown` was refactored to call the shared
  engine from T004 (research.md Decision 1), confirm no behavior change
- [ ] T022 [P] Check `apps/web/src/server/services/ai-tool-registry.test.ts`
  and `ai-tool-policy.test.ts` for any assertion that enumerates
  `BUILTIN_TOOLS` by count or full list; update to account for
  `insert_page_content`
- [ ] T023 Run `pnpm lint && pnpm typecheck && pnpm test` at the repository
  root; fix any drift
- [ ] T024 Execute the manual walkthroughs in
  [quickstart.md](quickstart.md) (anchored edit preserves the rest of the
  page, multi-anchor atomicity, content-loss guard reject/acknowledge,
  Admin per-tool enable/disable) and record results
- [ ] T025 [P] Once implementation lands, add a "Recent Changes" entry for
  `037-ai-partial-page-edit` to `CLAUDE.md`, following the existing entry
  format (project convention, not a Spec Kit template step)

---

## Dependencies & Execution Order

### Phase Dependencies

- **Setup (Phase 1)**: none — no tasks.
- **Foundational (Phase 2)**: none — no tasks; nothing blocks all three
  stories at once.
- **User Stories (Phase 3–5)**: US1 (Phase 3) and US3 (Phase 5) can start in
  parallel immediately. US2 (Phase 4) depends on US1's module existing
  (T004) since it extends the same splice engine and executor.
- **Polish (Phase 6)**: depends on whichever stories are in scope for the
  release being completed.

### User Story Dependencies

- **US1 (P1)**: no dependency on US2/US3.
- **US2 (P2)**: extends the module and executor US1 creates (T004, T006);
  not independently buildable before US1, but independently *testable* once
  built — its acceptance scenarios are distinct from US1's.
- **US3 (P3)**: no dependency on US1/US2 — touches only `execSaveDraft`.

### Within Each User Story

- Tests before implementation (written first, confirmed failing, per the
  Tests subsection of each phase).
- Splice engine / schema before executor wiring.
- Executor wiring before registry registration.
- Registry registration before prompt-guidance updates (the guidance
  references the now-registered tool).

### Parallel Opportunities

- T001, T002, T003 (US1 tests, different files) run in parallel.
- T011, T012 (US2 tests, different files) run in parallel.
- US3's entire phase (T016–T020) can proceed in parallel with US1/US2 by a
  different contributor, since it touches only `execSaveDraft` and shares no
  file with T004–T009/T013–T014 other than `ai-tool-executors.ts` (coordinate
  merge order if worked concurrently by different people).
- T021, T022, T025 (Polish) run in parallel with each other.

---

## Parallel Example: User Story 1

```bash
# Launch all three US1 tests together (different files):
Task: "Unit tests for the anchor-splice engine in apps/web/src/server/services/ai-page-content-patch.test.ts"
Task: "Executor tests for insert_page_content single-edit happy path in apps/web/src/server/services/ai-tool-runtime.permissions.test.ts"
Task: "Planner prompt test for insert_page_content catalog/guidance in apps/web/src/server/jobs/wiki-question-tool-planner.test.ts"
```

---

## Implementation Strategy

### MVP First (User Story 1 Only)

1. Complete Phase 3 (US1): the anchored single-edit tool, end to end.
2. **STOP and VALIDATE**: run T001–T003, then the first quickstart.md
   walkthrough (anchored edit preserves the rest of the page) against the
   exact large-page scenario that was originally reported.
3. This alone closes the reported incident's failure mode for the common
   case (one part of a page updated at a time).

### Incremental Delivery

1. US1 (Phase 3) → validate independently → this is the MVP fix.
2. US2 (Phase 4) → adds atomic multi-anchor requests → validate independently.
3. US3 (Phase 5) → adds the `save_draft` defense-in-depth guard → fully
   independent, can be delivered before, after, or alongside US1/US2.
4. Phase 6 (Polish) → repo-wide checks and manual sign-off.

### Parallel Team Strategy

With two contributors: one takes US1 → US2 (US2 depends on US1's files);
the other takes US3 in parallel from the start, since it shares no logic
with the splice engine and only needs light coordination on
`ai-tool-executors.ts` merge order.

---

## Notes

- [P] tasks touch different files and have no incomplete-task dependency.
- [Story] labels trace every task back to spec.md's US1/US2/US3.
- Every task names its exact target file per plan.md's Project Structure.
- No `[NEEDS CLARIFICATION]` remained after planning; the one design
  correction made during this phase (research.md Decision 5: reject +
  explicit acknowledgement, not a review-disposition override) is reflected
  throughout data-model.md, contracts/wiki-ai-tools.md, quickstart.md, and
  this file.
- Commit after each task or logical group, per repository convention (one
  commit does one thing).
