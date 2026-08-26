# Research: AI Anchored Partial Page Edits

Technical Context in plan.md left no `NEEDS CLARIFICATION` markers — every
dependency and pattern this feature needs already exists in the codebase. This
document records the design decisions made while translating the spec into an
implementation approach, and the alternatives rejected for each.

## Decision 1: Generalize the existing image-insertion splice engine rather than write a new one

`insertGeneratedImagesIntoMarkdown` (`apps/web/src/server/services/ai-generated-image-insertion.ts`)
already implements exact-literal-anchor matching, uniqueness verification,
multi-insertion ordering (sorted by position, later-requested-first at equal
positions), and pure string splicing with no Markdown parse/reserialize step.
Extract and generalize it into a shared module (`ai-page-content-patch.ts`)
that accepts an operation kind (`insertBefore` / `insertAfter` / `replace`)
instead of always inserting after, and keep `insertGeneratedImagesIntoMarkdown`
as a thin caller of it (or migrate it to call the shared engine) so there is
one splice algorithm, not two.

**Rationale**: This algorithm is exactly what prevents the fidelity loss this
feature exists to fix — it never re-derives untouched Markdown. Reusing it
means reusing its already-covered edge cases (duplicate anchor rejection,
missing anchor rejection, deterministic multi-insert ordering) instead of
re-discovering them.

**Alternatives considered**:
- *Parse the page to an AST, locate nodes, mutate, and re-serialize.* Rejected:
  re-serialization can reflow or reformat untouched Markdown (list markers,
  emphasis characters, table padding), which would violate FR-005 (byte-
  identical outside the edited spans) — trading one fidelity risk for another.
- *Accept a unified diff/patch from the model and apply it.* Rejected: still
  requires the model to compute line-accurate context against content it may
  not have reproduced perfectly, which reintroduces the transcription-fidelity
  risk this feature removes, just moved into diff computation instead of full-
  document regeneration.

## Decision 2: Three operation kinds, no separate delete

Support `insertBefore`, `insertAfter`, and `replace` (of the exact anchor
passage). A deletion is a `replace` with empty `text`.

**Rationale**: Matches spec FR-001 exactly and keeps the argument surface
small. `insertAfter` is a direct generalization of the existing `afterText`
contract; `insertBefore` and `replace` are the two additions the spec calls
for to cover "add a new section" and "correct/refresh one passage" without
adding a fourth verb for what `replace` with empty text already expresses.

**Alternatives considered**:
- *Range-based edits (start-anchor + end-anchor bounding a region to replace).*
  More powerful (e.g., "replace this whole table" without repeating it as one
  giant anchor), but needs two independently-verified unique anchors per
  operation plus well-formedness checks on the bounded region. Not required by
  any spec user story (all reported and specified cases are single-passage
  inserts/replacements); noted as a natural follow-up if a future need
  appears, not built now.

## Decision 3: Reuse `createDraft`'s `baseRevisionId` for stale-revision safety

Require `revisionId` in the request (mirroring `insert_generated_images`), and
before applying any edit, verify it equals the page's current latest revision
id — exactly the check `insertGeneratedImages` already performs
(`page.latestRevision?.id !== input.revisionId`) — then pass it through to
`createDraft` as `baseRevisionId`.

**Rationale**: Existing, tested mechanism. If the page changed between when
the model read it and when it submits the edit, the anchor may no longer mean
what the model thinks it means; failing safely here converts a possible silent
misapplication into a clear, retryable rejection (spec Edge Cases: "the page
changed since the model last read it").

**Alternatives considered**:
- *No concurrency check; splice against whatever the row currently holds.*
  Rejected — an anchor that still happens to match by coincidence after a
  concurrent edit could land the insertion in a different logical location
  than the model intended, silently.

## Decision 4: Validate-all-before-applying-any for multi-anchor atomicity

For a request with multiple `edits`, resolve every anchor's position against
the *original* `contentSource` first (rejecting the whole request if any
anchor is missing, non-unique, or overlaps another requested edit's span);
only after every anchor resolves does the engine apply all splices to produce
the new document and make exactly one `createDraft` call.

**Rationale**: Because validation happens before any string mutation, there is
no partial-application state to roll back — satisfies FR-003/FR-004 ("all of
them, or none of them") without needing a transaction or compensating action.
This is the same shape `insertGeneratedImagesIntoMarkdown` already uses for
multiple images.

**Alternatives considered**:
- *Apply sequentially and roll back on failure.* Rejected as unnecessary
  complexity — validating first is simpler, cheaper, and already proven by the
  images path.

## Decision 5: `save_draft` content-loss guard rejects unless the caller explicitly acknowledges the reduction

**Correction during planning**: the original draft of this decision proposed
forcing the tool call's `effectiveReview` to `admin_review`. Tracing the
runtime (`ai-tool-runtime.ts`) showed this does not work: `effectiveReview` is
resolved and recorded *before* the executor ever runs (`ai-tool-runtime.ts`
around the `params.resolveReview(...)` call, ~line 950), and it is informational
metadata only for `page_draft`-category tools — `execSaveDraft` calls
`content.createDraft` unconditionally today, unlike the `metadata`/`tag`
category executors that branch on `execCtx.effectiveReview` via
`proposeOrApply`. A page-content draft's real review gate is the normal
page-revision publish flow, which happens later and outside this tool call
entirely. An executor cannot retroactively change a decision the runtime
already made and recorded before invoking it, so "force admin_review" would be
a no-op for this tool family.

The guard therefore acts at the one point `execSaveDraft` actually controls:
whether `createDraft` is called at all. Extend `execSaveDraft` with a check
comparing the submitted `contentSource`'s length to the current revision's
`contentSource.length`. When the submission is below a fixed fraction of the
prior length, reject the call — exactly like `assertCompleteDraftSource`'s
existing short-instruction guard — *unless* the request carries a new,
explicit `acknowledgedContentReduction: true` argument, in which case the
draft is created normally.

**Threshold**: 50% of the prior character length. A conservative round number:
unlikely to trip on ordinary edits (typo fixes, trimming a paragraph, removing
one stale section) while reliably catching "regenerated the whole page and
silently dropped most of it," which is the observed failure mode and is an
order of magnitude larger than normal editing shrinkage. Exposed as a named
constant, not hardcoded inline, so it can be tuned without hunting for it (spec
Assumptions marks the exact number as a planning-phase, not product, decision).

**Rationale**: Rejection is the only lever this executor actually has, so the
guard must default to it — matching FR-009's "reject... or route to stronger
review" (spec.md explicitly allows rejection as a valid fulfillment). The
`acknowledgedContentReduction` flag is the escape hatch for a legitimate large
deletion: the tool-usage prompt guidance instructs the model to set it only
when the user's own request explicitly called for deleting or drastically
shortening the page, so an unintentional loss (the reported incident's
shape — the model never *meant* to drop content) still fails safely by
default, while a real "delete most of this page" request still succeeds in
one call instead of looping on repeated rejections with no way out.

**Alternatives considered**:
- *Force `effectiveReview` to `admin_review`.* Rejected once the runtime trace
  showed this field is fixed before the executor runs and page_draft tools
  never branch on it — it would compile and record a value, but change no
  observable behavior, silently failing to close the gap it was meant to
  close.
- *Hard rejection with no escape hatch.* Rejected as the sole behavior: it
  cannot distinguish "the model lost content" from "the user asked to delete
  most of the page," and blocks every genuine large-deletion request
  indefinitely, since a model retrying the same full document tends to
  produce a similarly-sized result each time.

## Decision 6: Governance tuple identical to `save_draft`

`insert_page_content`: category `page_draft`, riskLevel `draft_write`,
requiredScope `edit`, resultRetention `never_full_result`, defaultReviewPolicy
`always_review` — the same five values as `save_draft` and
`insert_generated_images`.

**Rationale**: Spec FR-006 requires identical governance to existing content
tools. Reusing the exact existing tuple needs no new `AiToolCategory` /
`AiToolRiskLevel` enum value and no new branch in `ai-tool-policy.ts`'s
review-resolution logic.

**Alternatives considered**:
- *A dedicated, lighter risk level for "partial" writes*, on the theory that a
  bounded anchored edit is inherently safer than a full rewrite. Rejected: no
  requirement asks reviewers to treat the two differently, and introducing a
  new enum value ripples through `ai-tool-policy.ts` policy resolution and the
  Admin tool-policy UI for no spec-required benefit. Reviewers still see and
  approve every call by default (`always_review`), same as today.
