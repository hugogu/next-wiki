# Implementation Plan: AI Anchored Partial Page Edits

**Branch**: `037-ai-partial-page-edit` | **Date**: 2026-08-26 | **Spec**: [spec.md](spec.md)

**Input**: Feature specification from `/specs/037-ai-partial-page-edit/spec.md`

## Summary

Give Wiki AI a second, narrower page-content-mutation tool — `insert_page_content`
— that edits an existing page by naming one or more exact, unique anchor
passages already in the current revision and what to do at each one (insert
before, insert after, replace). The server splices the change into the page's
`contentSource` by plain string manipulation; the model never resupplies
Markdown outside the changed spans, eliminating the class of failure already
observed in production (a large page's `save_draft` update silently dropping
most of the original content because the model had to regenerate it from
memory). The implementation generalizes the existing
`insertGeneratedImagesIntoMarkdown` splice algorithm and `afterText` anchor
contract (`ai-generated-image-insertion.ts`) from "images only, single
insert-after" to "arbitrary text, insert-before/insert-after/replace,"
registers it in the built-in tool catalog and executor map alongside
`save_draft`, and reuses `content.createDraft`'s `baseRevisionId` optimistic
concurrency check for stale-revision safety. `save_draft` gains one
complementary guard — reject/escalate-review a submission that is
dramatically shorter than the current revision — as defense-in-depth for the
full-rewrite path this feature does not replace.

## Technical Context

**Language/Version**: TypeScript 5.x on Node.js 20.9+ (existing monorepo floor).

**Primary Dependencies**: Existing `@/server/services/public-content`
(`createDraft`, `getPageById`), existing `ai-tool-registry.ts` /
`ai-tool-executors.ts` / `ai-tool-runtime.ts` tool-calling pipeline (026), Zod
for argument validation (existing pattern for every tool executor). No new
runtime dependency.

**Storage**: PostgreSQL via Drizzle — no schema change. The new tool writes a
normal `page_revisions` row through the existing `createDraft` path, exactly
like `save_draft` and `insert_generated_images` today.

**Testing**: Vitest unit tests for the splice/anchor-matching function (mirrors
existing `ai-generated-image-insertion.test.ts` coverage: unique match, no
match, ambiguous match, adjacent/overlapping anchors, boundary positions) plus
executor-level tests (mirrors `ai-tool-runtime.permissions.test.ts`'s existing
`save_draft` coverage) and a `wiki-question-tool-planner` prompt-catalog test asserting the tool's
argument contract is shown to the model. No new Playwright surface: this is a
model-invoked tool, not a new UI.

**Target Platform**: Existing Next.js server runtime (API routes / AI action
worker), no platform change.

**Project Type**: Existing web application — this is additive work inside
`apps/web/src/server/services/` and `apps/web/src/server/jobs/`, not a new
project or app.

**Performance Goals**: N/A beyond existing tool-call latency budget; splicing
is O(page length) string work, negligible next to the LLM round-trip it
replaces (and strictly cheaper than a full-document regeneration).

**Constraints**: Every Markdown byte outside the requested anchors and their
associated insert/replace text MUST be byte-identical to the prior revision
(FR-005). Anchor matching MUST be exact literal substring matching, not regex
or fuzzy matching (spec Assumptions).

**Scale/Scope**: Bounded by the existing per-turn tool-call limit
(`maxCallsPerTurn` / `maxToolCalls`) and per-call anchor count already
implied by `insert_generated_images`'s `images` array pattern; no new scale
dimension.

## Constitution Check

*GATE: Must pass before Phase 0 research. Re-check after Phase 1 design.*

- **Public Content Delivery (P12)**: N/A. This feature only ever creates a new
  `page_draft`-category revision (a draft), which is not publicly readable
  until a separate, human-governed publish action — identical to `save_draft`
  and `insert_generated_images` today. No anonymously readable path changes.
- **AI mutation / self-growth loop (P2, P3, Anti-Pattern "Ungrounded
  self-growth")**: This feature lets an AI agent mutate page content, so it
  must satisfy: source-of-truth stays `page_revisions` (unchanged — the new
  tool writes through the same `content.createDraft` path as every other
  content-mutation tool, no parallel storage); provenance is the existing
  `ai_tool_calls` audit record plus the normal revision/diff history (FR-010);
  permission re-check is the existing `requiredScope: 'edit'` chokepoint
  reused verbatim (FR-006); the publication boundary is unchanged — the tool
  produces a draft, never a publish, and inherits `defaultReviewPolicy:
  'always_review'` like `save_draft`/`insert_generated_images` (FR-006). No
  derived index (embeddings/search) needs a new rebuild path: a draft isn't
  indexed for retrieval until published, same as today.
- **P8 Version Source Content**: Satisfied by construction — every anchored
  edit is a normal `createDraft` call, producing one immutable revision per
  successful multi-anchor batch (FR-004), diffable through the existing
  revision-diff machinery (FR-010). No new content-versioning concept.
- **P10 Explicit Over Implicit**: The new tool is a code registration in
  `ai-tool-registry.ts` (`BUILTIN_TOOLS`) and `ai-tool-executors.ts`
  (`TOOL_EXECUTORS` map), exactly like every existing tool — no filesystem
  scanning or dynamic discovery.
- **P7 Async-First**: N/A — tool execution already runs inside the existing
  pg-boss `ai_question`/scheduled-job worker (026); this feature adds no new
  synchronous heavy operation and no new job type.

No violations. No entries required in Complexity Tracking.

## Project Structure

### Documentation (this feature)

```text
specs/037-ai-partial-page-edit/
├── plan.md              # This file
├── research.md          # Phase 0 output
├── data-model.md         # Phase 1 output
├── quickstart.md        # Phase 1 output
├── contracts/           # Phase 1 output (tool contract)
└── tasks.md             # Phase 2 output (/speckit.tasks — not created here)
```

### Source Code (repository root)

```text
apps/web/src/server/
├── services/
│   ├── ai-tool-registry.ts              # + insert_page_content ToolDefinition
│   ├── ai-tool-executors.ts             # + execInsertPageContent, + save_draft shrink guard
│   ├── ai-tool-runtime.permissions.test.ts  # + coverage for both (existing home of
│   │                                         #   save_draft's executor-level tests)
│   ├── ai-generated-image-insertion.ts  # existing splice engine to generalize/extract from
│   ├── ai-generated-image-insertion.test.ts
│   ├── ai-page-content-patch.ts         # NEW: generalized anchor splice engine (insert
│   │                                     #   before/after, replace) shared by the new tool
│   ├── ai-page-content-patch.test.ts    # NEW
│   └── public-content.ts                # existing createDraft/getPageById — reused, unchanged
└── jobs/
    ├── wiki-question-tool-planner.ts    # + tool-usage guidance (prefer anchored edits;
    │                                     #   save_draft for full rewrites — spec FR-008)
    └── wiki-question-tool-planner.test.ts
```

**Structure Decision**: Additive changes inside the existing
`apps/web/src/server/services/` (tool registry, executors, new shared splice
module) and `apps/web/src/server/jobs/` (planner prompt guidance) layers that
already host `save_draft` and `insert_generated_images`. No new app, package,
or route; this is a built-in AI tool exactly like its siblings, not a public
REST/MCP surface (spec Assumptions).

## Complexity Tracking

*No Constitution Check violations — this section is intentionally empty.*
