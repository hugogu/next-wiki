# Feature Specification: AI Anchored Partial Page Edits

**Feature Branch**: `037-ai-partial-page-edit`

**Created**: 2026-08-26

**Status**: Draft

**Input**: User description: "Add an anchor-based partial page-edit tool for Wiki AI, generalizing the existing insert_generated_images pattern (afterText anchor + insertion, no full-body rewrite) to plain-text Markdown edits. Today the only AI-driven content-mutation tool for an existing page is save_draft, which requires the model to reproduce the ENTIRE page body verbatim in contentSource. For large pages this causes real, observed content loss in production: a user asked Wiki AI to update a ~36,000-character page with 2024-2026 data, and the resulting save_draft silently dropped large sections of the original content, because the model had to regenerate the whole document from memory/context instead of only writing what actually changed. get_page already paginates large pages via contentOffset/nextContentOffset for reads, but there is no equivalent chunked or incremental write path for existing pages. The new tool should let the model make one or more anchored edits to an existing page revision in a single call, analogous to insert_generated_images's afterText contract (a unique literal passage copied from the current revision, used as a splice point), supporting insert-after, insert-before, and exact-passage replacement, without ever requiring the model to reproduce unrelated Markdown. It reuses the existing draft/review governance (page_draft category, draft_write risk, always_review default, requiredScope: edit) and the same permission/action/audit chokepoints as save_draft and insert_generated_images. save_draft remains available for genuine full-document rewrites; the new tool is for incremental updates. Also consider whether save_draft itself needs a safety net rejecting or forcing stronger review when a submitted contentSource is drastically shorter than the current revision, suggesting silent content loss, as a complementary defense-in-depth measure."

**Depends on**: 026-wiki-ai-tool-runtime (tool governance, permission scope, review policy, and audit semantics that this feature reuses rather than redefines).

## Summary

Wiki AI's only way to change an existing page's content today is to resend the
entire page body. On a large page this forces the model to silently regenerate
thousands of characters of unrelated Markdown from its own context instead of
copying it, and any part it fails to reproduce exactly is lost from the
published draft with no warning to the model, the requesting user, or the
reviewer. This feature adds a second, narrower way to change an existing
page's content: the model names one or more short, exact passages already in
the page ("anchors") and says what to do at each one — insert new text before
it, insert new text after it, or replace it outright. Every other character of
the page is left untouched by construction, because the model never has to
retype it. The full-document tool remains available for genuine rewrites, and
gains its own safeguard against a rewrite that looks like it silently dropped
most of the page.

## User Scenarios & Testing *(mandatory)*

### User Story 1 - Refresh Part of a Large Page Without Losing the Rest (Priority: P1)

As a Wiki user asking Wiki AI to update or refresh part of an existing page
(for example, "this page's data only goes to 2023, can you bring it up to
date?"), I want the assistant to add or change only the relevant part of the
page, so that the rest of the page — its structure, examples, and any content
I already trust — survives the update untouched.

**Why this priority**: This is the exact failure users have already hit in
production. Without it, every "update this page" request against a
non-trivial page carries real risk of silent, unreviewable-at-a-glance content
loss, which undermines trust in Wiki AI's write capability generally.

**Independent Test**: Ask Wiki AI to update one subsection of an existing page
that is large enough that its full body would not comfortably fit in one
model turn. Confirm the resulting draft's content outside the requested
change is byte-identical to the prior revision, and that the requested change
is present.

**Acceptance Scenarios**:

1. **Given** an existing page and a request to add new information after a
   specific existing section, **When** Wiki AI identifies a short, unique
   passage marking that location and requests an insertion there, **Then** a
   new draft revision is created containing the original content plus the
   inserted text at that exact location, with no other part of the page
   changed.
2. **Given** an existing page and a request to correct or refresh a specific
   passage (for example, one outdated table row or figure), **When** Wiki AI
   requests that the exact passage be replaced with corrected text, **Then**
   the new draft revision contains the replacement in place of the original
   passage, with the surrounding content unchanged.
3. **Given** a page large enough that reproducing it in full would risk
   incomplete or truncated output, **When** Wiki AI performs an anchored edit
   instead of a full rewrite, **Then** the edit succeeds without requiring the
   model to have restated the untouched portions of the page.

---

### User Story 2 - Apply Several Related Edits Together, or Not at All (Priority: P2)

As a Wiki user asking for an update that touches more than one place in a page
(for example, refreshing three different data tables and adding a new closing
section), I want those changes to land together as one coherent draft, so
that a reviewer sees one complete, reviewable change instead of a sequence of
partial edits that could leave the page in an inconsistent in-between state.

**Why this priority**: Real update requests usually touch more than one spot.
Without atomic multi-anchor edits, users would need one tool call per change,
multiplying the chance that some changes land and others silently don't.

**Independent Test**: Ask Wiki AI to make three unrelated small changes to the
same page in one request. Confirm exactly one new draft revision is created
containing all three changes, or, if any one of the requested anchors cannot
be safely located, confirm zero changes are applied and the page is left
exactly as it was.

**Acceptance Scenarios**:

1. **Given** a request naming several distinct anchored edits to the same
   page, **When** every named anchor is found and unambiguous, **Then** all
   edits are applied together in a single new draft revision.
2. **Given** a request naming several anchored edits where one anchor cannot
   be found or is not unique, **When** the edit is attempted, **Then** no
   partial draft is created, the page is left unchanged, and the response
   identifies which anchor failed so the request can be corrected and retried.

---

### User Story 3 - Catch a Full-Page Rewrite That Silently Dropped Most of the Page (Priority: P3)

As an Admin or reviewer responsible for content quality, I want a full-page
save that would replace a large existing page with dramatically less content
to be flagged automatically, so that a reviewer is alerted to likely
unintentional content loss before it can be approved, instead of having to
notice it by eye in a long diff.

**Why this priority**: Anchored edits remove most of the risk, but the
full-rewrite path must remain available for genuine restructuring, so it
needs its own defense-in-depth safeguard for the failure already observed in
production.

**Independent Test**: Submit a full-page rewrite for an existing large page
whose new content is a small fraction of the current revision's length, with
no other request to shorten the page. Confirm the system does not let it
proceed as an ordinary, immediately-actionable draft; it is either rejected
with actionable feedback, or held for the strongest available review.

**Acceptance Scenarios**:

1. **Given** an existing page with substantial content, **When** a full-page
   rewrite is submitted whose length is dramatically smaller than the current
   revision, **Then** the system does not silently accept it as a routine
   draft; it responds with a result that makes the likely content loss visible
   before anyone could publish it.
2. **Given** an existing page, **When** a full-page rewrite is submitted whose
   length is comparable to (or larger than) the current revision, **Then** it
   proceeds exactly as it does today, unaffected by this safeguard.

---

### Edge Cases

- What happens when the named anchor text does not appear anywhere in the
  page's current content (for example, it was paraphrased rather than copied
  exactly)? The edit MUST be rejected before changing anything, identifying
  which anchor could not be found.
- What happens when the named anchor text appears more than once in the page?
  The edit MUST be rejected as ambiguous rather than guessing a location,
  identifying which anchor was ambiguous.
- What happens when the page changed (a newer revision exists) between when
  the model last read it and when it submits the anchored edit, so the anchor
  no longer matches the current revision? The edit MUST fail safely against
  the current revision rather than silently applying to stale content.
- What happens when two or more anchors in the same request would overlap or
  conflict with each other? The whole batch MUST be rejected rather than
  applying some and skipping others.
- What happens when the target page does not exist yet, or has no editable
  revision? The tool MUST behave like other existing-page-only content tools:
  it does not create a page, and directs the caller to page creation instead.
- What happens when an anchor sits at the very start or end of the page, or
  immediately borders a structural element such as a table or fenced code
  block? An insertion there MUST NOT corrupt the document's structure (for
  example, it must not merge into an adjacent table row or split open a code
  fence).
- What happens when an Admin disables the anchored-edit tool? Wiki AI MUST
  fall back to the existing full-document tool for content changes, exactly
  as it behaves today with the anchored-edit tool absent.

## Requirements *(mandatory)*

### Functional Requirements

- **FR-001**: System MUST provide a Wiki AI tool that changes an existing
  page's draft content by specifying one or more anchors, where each anchor is
  an exact, unique excerpt already present in the current revision, together
  with the change to make at that anchor: insert new content before it, insert
  new content after it, or replace it outright with new content.
- **FR-002**: System MUST NOT require the caller to resupply any part of the
  page's Markdown other than the anchor excerpts and the new content being
  inserted or substituted.
- **FR-003**: System MUST verify, before changing anything, that each named
  anchor is present in the page's current revision exactly once. If any named
  anchor is missing or not unique, the system MUST reject the entire request
  without applying any of its edits, and MUST identify which anchor failed.
- **FR-004**: When a single request names multiple anchored edits, System MUST
  apply all of them together as exactly one new draft revision, or none of
  them, never a partial subset.
- **FR-005**: The resulting draft revision MUST be identical to the prior
  revision outside the content added, removed, or replaced by the requested
  anchored edits.
- **FR-006**: The anchored-edit tool MUST be governed by the same permission
  scope, default review requirement, enable/disable control, and audit
  recording as other page-content-mutation tools, so it can be independently
  enabled, disabled, and reviewed the way existing content tools are.
- **FR-007**: The existing full-document content tool MUST remain available
  and unrestricted for cases where a caller intends a genuine full rewrite of
  a page (for example, restructuring or replacing its entire content).
- **FR-008**: Wiki AI's guidance to the model MUST direct it to prefer the
  anchored-edit tool for incremental changes to an existing page, reserving
  the full-document tool for requests that are genuinely full rewrites.
- **FR-009**: When a full-document content submission for an existing page is
  dramatically shorter than that page's current revision, System MUST NOT let
  it proceed as an ordinary, immediately reviewable draft; it MUST either
  reject the submission with actionable feedback, or route it to the
  strongest available review disposition, so a human reviewer is alerted
  before the apparent content loss could be published.
- **FR-010**: Every change made by the anchored-edit tool MUST be visible
  through the same page revision history and diff view used for any other
  page edit, so a reviewer evaluates it exactly like any other change.

### Key Entities

- **Anchored Edit Operation**: One requested change within an anchored-edit
  call: the anchor (an exact excerpt of the page's current content), the kind
  of change (insert before, insert after, or replace), and the new content.
- **Anchored Edit Request**: One or more Anchored Edit Operations submitted
  together against one existing page revision, applied atomically.
- **Content-Loss Check Outcome**: The result of evaluating a full-document
  content submission against the page's current revision to decide whether it
  looks like it dropped a large portion of the existing content, used to
  route the submission to stronger review or reject it.

## Success Criteria *(mandatory)*

### Measurable Outcomes

- **SC-001**: For pages large enough that today's full-document rewrite would
  risk incomplete reproduction, updating one part of the page no longer
  requires the model to restate the rest of the page, and unrelated content
  is preserved byte-for-byte in 100% of a test set of at least 20 such
  updates.
- **SC-002**: In a test set of 50 "update/refresh part of an existing page"
  requests, at least 90% are completed using the anchored-edit tool rather
  than a full-document rewrite.
- **SC-003**: 100% of anchored-edit requests whose anchor text is missing,
  non-unique, or stale (page changed since it was read) are rejected before
  any content changes, leaving the page in exactly its prior state.
- **SC-004**: 100% of full-document submissions that reduce an existing page's
  content by a large majority are routed to the strongest review disposition
  or rejected, rather than being accepted as an ordinary draft — closing the
  gap that let the originally reported incident reach a draft unnoticed.
- **SC-005**: Reviewers can evaluate every AI-authored anchored edit using the
  same page diff view they already use for human edits, with no additional
  manual step to detect what changed.

## Assumptions

- The anchored-edit tool is a Wiki AI built-in tool only, following the
  precedent of the existing image-insertion tool; it is not additionally
  exposed through the public REST API or MCP server in this feature (unlike
  image generation/upload, which are also public-API capabilities).
- "Dramatically shorter" (FR-009, SC-004) and the anchor-matching rules
  (exact, unique excerpt) reuse the same kind of literal-match contract
  already used by the existing image-insertion tool; exact numeric thresholds
  are an implementation decision for the planning phase, not a product
  decision requiring user clarification.
- Deleting a passage outright is covered by a "replace" operation whose new
  content is empty; no separate delete operation is required.
- The anchored-edit tool only operates on existing pages with an editable
  revision, matching the existing full-document tool's scope; creating a new
  page remains the full-document/creation tool's responsibility.
- Anchors are plain literal text matches (not regular expressions or fuzzy
  matching), consistent with the existing image-insertion tool's contract,
  so the model must copy the anchor text exactly from what it already read.
