# Wiki AI Tool Contract

## Static Tools

| Tool ID | Category | Input | Result | Side effect |
| --- | --- | --- | --- | --- |
| `insert_page_content` | `page_draft` | `pageId`, `revisionId`, `edits[]` (each: `anchor`, `mode` ∈ {`insertBefore`,`insertAfter`,`replace`}, `text`) | New draft revision id/version, count of edits applied; or a safe rejection naming the failing anchor | Creates one new `page_revisions` draft row via `content.createDraft`, splicing `text` at each verified anchor. No other byte of the page changes. |

No public REST or MCP surface is added for this tool (spec Assumptions): it is
a Wiki AI built-in only, following the existing `insert_generated_images`
precedent, which is likewise builtin-only.

`save_draft` (existing) is unchanged in its input/output contract; it gains
one additional internal guard (see "Content-Loss Guard" below) that can change
its `effectiveReview` outcome but never its accepted argument shape.

## Execution Model

1. The AI-question tool-calling job resolves `insert_page_content` through the
   existing static registry/executor lookup exactly like every other tool
   (`ai-tool-registry.ts` → `ai-tool-executors.ts`), with the same permission,
   entitlement, and enable/disable resolution already applied to
   `save_draft`/`insert_generated_images`.
2. The executor loads the target page and its current latest revision. If
   `revisionId` does not match the page's current latest revision, it fails
   with the existing `STALE_REVISION` domain error before touching any
   content (mirrors `insertGeneratedImages`'s existing check).
3. For every requested edit, the executor locates `anchor` as an exact literal
   substring of the current `contentSource`. If any anchor is absent, occurs
   more than once, or its span overlaps another requested edit's span, the
   entire call fails with a safe error naming which anchor failed — no edit in
   the batch is applied (FR-003/FR-004).
4. Once every anchor resolves, the shared splice engine
   (`ai-page-content-patch.ts`, generalized from
   `insertGeneratedImagesIntoMarkdown`) applies all edits to the in-memory
   source in one pass (positions resolved from the original string, applied
   from the end of the document backward so earlier offsets stay valid) and
   calls `content.createDraft` exactly once with the resulting string and
   `baseRevisionId: revisionId`.
5. The result reports the new draft's page id, version, and the number of
   edits applied. It never echoes the full page body back to the model
   (`resultRetention: 'never_full_result'`, matching `save_draft`).
6. Existing review, diff, and publish controls apply unchanged afterward: the
   draft is reviewed and published exactly like one produced by `save_draft`
   or the manual editor, through the same page revision history and diff view
   (FR-010).

## Content-Loss Guard (save_draft addendum)

- `save_draft` gains one new optional argument: `acknowledgedContentReduction`
  (boolean, default `false`).
- Before `execSaveDraft` calls `createDraft`, it compares the submitted
  `contentSource` length against the current revision's `contentSource`
  length. When the submission is below the configured ratio (default 50%,
  research.md Decision 5) of the prior length AND
  `acknowledgedContentReduction` is not `true`, the call is rejected with a
  safe error identifying the size drop, and no draft is created.
  `effectiveReview` is intentionally NOT the mechanism here: it is resolved
  and recorded by the runtime before the executor runs
  (`ai-tool-runtime.ts`), and `page_draft`-category executors do not gate
  execution on it, so an executor cannot retroactively escalate it — see
  research.md Decision 5 for the trace that ruled this out.
- When `acknowledgedContentReduction: true` is set, the guard is skipped and
  the draft is created normally, whatever the length ratio. The tool-usage
  prompt guidance instructs the model to set this only when the user's own
  request explicitly asked to delete or drastically shorten the page — never
  as a default or a way to silence a retry.
- This check runs in addition to, not instead of, the existing
  `assertCompleteDraftSource` guard (which rejects short, instruction-shaped
  submissions outright regardless of `acknowledgedContentReduction`). The two
  guards catch different failure shapes: one catches "this isn't a document at
  all," the other catches "this is a document, but it looks like most of the
  real one is missing."
- The guard never blocks a submission whose length is at or above the ratio;
  ordinary edits are unaffected either way.

## Policy and Review Boundary

- `insert_page_content` uses the existing `page_draft` category,
  `draft_write` risk level, `edit` required scope, and `always_review` default
  review policy — identical to `save_draft` and `insert_generated_images`. No
  new `AiToolCategory`/`AiToolRiskLevel` value, no new branch in
  `ai-tool-policy.ts`'s review resolution.
- An Admin can enable or disable `insert_page_content` independently of
  `save_draft` through the existing Admin AI Tools panel, following the
  existing per-tool enable/disable model (no new UI surface required beyond
  the tool appearing in the existing list).
- When the tool is disabled or unavailable for a turn (for example, a Web
  Research turn per 036, whose tool profile excludes every page-mutation
  tool), Wiki AI falls back to describing the change or, when appropriate,
  using `save_draft`, exactly as it does today when any single content tool
  is unavailable — no new fallback mechanism.
- The static registry remains allowlisted: `edits[]` anchors and text are
  caller-supplied data, never caller-supplied code, tool names, or arbitrary
  file paths. No user-provided tool names or provider invocation can escape
  the registered executor.

## Authorization and Provenance

- Uses the resolved request actor, target page, and current revision exactly
  as `save_draft`/`insert_generated_images` do today; never trusts a
  model-generated page or revision identifier without re-resolving it through
  the existing permission-checked page lookup.
- Requires the same `edit` scope check as `save_draft` — no lighter
  permission bar for a "smaller" edit.
- Every call is recorded as a normal `ai_tool_calls` row (arguments, result
  summary, requested/effective review), and every resulting draft is a normal
  `page_revisions` row with the same provenance, diff, and audit trail as any
  other content edit (P8, FR-010). No new Raw-evidence category is needed:
  the source of truth is the page's own current revision, already inside the
  Wiki's permission-scoped store, not external captured evidence.

## Required Verification

- Splice-engine unit tests (`ai-page-content-patch.test.ts`): unique
  insertBefore/insertAfter/replace, missing anchor, duplicate/ambiguous
  anchor, overlapping anchors within one batch, anchor at document start/end,
  anchor adjacent to a fenced code block or table without corrupting it,
  multi-edit ordering/atomicity, byte-for-byte preservation of untouched
  content (property-style: diff the result against the input outside edited
  spans and assert equality).
- Executor tests (`ai-tool-runtime.permissions.test.ts`, alongside the
  existing `save_draft` coverage): permission/scope enforcement,
  stale-revision rejection, disabled-tool behavior, audit record shape,
  `resultRetention` never echoing full content.
- `save_draft` content-loss guard tests: below-threshold submission without
  `acknowledgedContentReduction` is rejected and creates no draft;
  below-threshold submission with `acknowledgedContentReduction: true`
  succeeds; at/above-threshold submission is unaffected either way; guard
  composes correctly with the existing `assertCompleteDraftSource`
  short-instruction check.
- Planner prompt test (`wiki-question-tool-planner.test.ts`): the tool catalog
  and usage guidance shown to the model prefers `insert_page_content` for
  incremental changes and reserves `save_draft` for full rewrites (spec
  FR-008), mirroring how the existing suite already pins
  `insert_generated_images`'s "do not use save_draft for image-only changes"
  guidance.
