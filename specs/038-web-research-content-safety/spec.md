# Feature Specification: Screened Draft Writes During Web Research

**Feature Branch**: `038-web-research-content-safety`

**Created**: 2026-08-26

**Status**: Partially implemented — see Implementation Status below

**Input**: User description: "Add automated content-safety screening for fetched web content in the Wiki AI web-research flow (036-web-research), and use a passing screen as the gate to allow draft-only page writes during a Web Research turn instead of the current hard block. Publish stays fully separate and human-gated, unchanged. This is a deliberate amendment to 036-web-research's FR-016, which currently requires zero page-mutation tools during a Web Research turn, enforced by filtering the tool catalog to read-only whenever web research is enabled. That structural defense stays in place as the fallback; it is only narrowed, not removed, and only when every web source used in the turn has passed a dedicated safety screen for prompt-injection / AI-manipulation patterns. Two weaker alternatives were considered and rejected: letting the model itself decide to allow a write once the user says it is fine (rejected because untrusted content already influenced the composed answer by then), and auto-resubmitting as a second separate session (rejected because conversation history carries the same potentially-influenced content forward with no new scrutiny). The publish step remains completely unchanged: a human must still separately review and publish through the existing revision/diff/publish flow before anything is public."

**Depends on / Amends**: 036-web-research (narrows FR-015, FR-016, SC-004, and the
"Research tool profile" table in `contracts/tool-and-citation-contract.md` —
see Amendment Summary below); 026-wiki-ai-tool-runtime (tool governance,
review, and audit semantics this feature reuses unchanged); 037-ai-partial-page-edit
(`insert_page_content`, one of the two tools this feature conditionally
un-blocks).

## Amendment Summary

036-web-research's FR-016 currently requires a Web Research turn to expose
**zero** page-mutation tools, full stop — enforced by filtering the tool
catalog to read-only whenever the turn's research mode is `wiki_first_web`.
This structural rule remains the default and the fallback for every case this
feature does not explicitly narrow. This feature adds exactly one conditional
exception: when every externally fetched source actually used in the turn has
passed a dedicated safety screen, two specific tools —
`insert_page_content` and `save_draft` — become available for that turn,
producing an ordinary **draft** revision. Nothing else changes: `create_page`,
`insert_generated_images`, and every metadata/permission/publish/tag tool
remain unavailable in a Web Research turn exactly as today (036-web-research
Assumptions), and publishing a draft into the publicly readable page remains
the same separate, human-gated action it already is (constitution P3, P8;
036-web-research FR-016's "separate user-initiated action" language now
describes the *publish* step specifically, not draft creation).

## Implementation Status

The gate that ships first (v1, implemented) is **not** the safety screen
described in FR-001–FR-003 and User Story 2/3 below — it is a simpler,
explicit **per-turn user opt-in**: a checkbox in the chat pane, off by
default, that the user must consciously enable for that turn
(`research.allowDraftWrites` in the request; never inferred from the model's
plan or from fetched content). This was a deliberate scope cut made after
review: building the safety screen first was judged too slow to unblock the
immediate need (closing the "research then update" friction gap), and the
explicit-opt-in gate is strictly a subset of the full design below — it can
be tightened into "opt-in AND every used source passed the screen" later
without changing the tool-availability mechanism itself (still exactly
`insert_page_content`/`save_draft`, still draft-only, still publish
untouched).

**What this means for the FRs below**: FR-004 through FR-010 describe the
target behavior and are satisfied today with "the explicit opt-in" standing
in for "the screen passed." FR-001, FR-002, and FR-003 (the screen itself)
and User Story 2/3's screen-specific acceptance scenarios are **not yet
implemented** — content fetched during a draft-write-eligible turn is not
currently screened for injection/manipulation patterns before use. This is a
known, accepted gap for v1: the user's own explicit per-turn action is real
authorization, but — as discussed during planning — it does not by itself
prevent a compromised source from influencing *what* gets written once
writes are enabled for that turn. The publish gate (FR-008, unaffected)
remains the actual backstop against that gap reaching readers. Closing FR-001
–FR-003 is tracked as required follow-up work, not abandoned scope.

## User Scenarios & Testing *(mandatory)*

### User Story 1 - Research Then Update a Page in One Conversation (Priority: P1)

As a Wiki user, I want to ask Wiki AI to look something up online and update
a page with what it found, without having to manually turn off Web Research
and repeat my request, so that "research this and update the page" feels like
one continuous request instead of a two-step workaround only power users
discover.

**Why this priority**: This is the exact friction reported after Web
Research's read-only restriction was made clearly visible: users understood
*why* they were blocked, but still had no path to finish the task without a
manual, undocumented two-step dance.

**Independent Test**: With Web Research enabled, ask Wiki AI to research a
current fact for an existing page and update it. When every source the answer
relied on passes the safety screen, confirm a new draft revision is created
in the same turn, without the user re-asking with Web Research off.

**Acceptance Scenarios**:

1. **Given** a Web Research turn where every externally fetched source used
   in the answer passes the safety screen, **When** the user's request calls
   for updating an existing page, **Then** Wiki AI uses `insert_page_content`
   or `save_draft` to create a new draft revision in that same turn.
2. **Given** the same successful scenario, **When** the draft is created,
   **Then** it is not published: the page's publicly readable content is
   unchanged until a separate reviewer explicitly publishes the draft through
   the existing review/publish flow.
3. **Given** a Web Research turn where the safety screen passes, **When** the
   user's request does not call for changing any page, **Then** behavior is
   unaffected — Wiki AI answers normally and creates no draft.

---

### User Story 2 - A Manipulative Source Never Gets a Path to Write (Priority: P1)

As the owner of this Wiki, I want a fetched web page that contains an attempt
to manipulate the assistant (hidden instructions, fake authority claims, or
similar) to be excluded from my answer and to never unlock write access, so
that a single compromised or malicious external page cannot use my own
research request as a path to alter my Wiki.

**Why this priority**: This is the entire reason a screen exists instead of
simply removing the restriction — it must hold even under active, adversarial
content, not just well-behaved pages.

**Independent Test**: Fetch a source whose content is crafted to instruct or
manipulate an AI assistant. Confirm it is excluded from the answer (not cited,
not used to inform the response), and confirm no page-mutation tool becomes
available for that turn even if other sources in the same turn passed.

**Acceptance Scenarios**:

1. **Given** a fetched source that fails the safety screen, **When** the
   answer is composed, **Then** that source is excluded from the answer and
   from citations, and is not incorporated into what the model reasons about
   or writes.
2. **Given** a turn with multiple fetched sources where at least one fails the
   safety screen, **When** the turn completes, **Then** no page-mutation tool
   is available for that turn, even though other sources passed — one failing
   source is enough to keep the entire turn read-only.
3. **Given** a source that fails the safety screen, **When** the user later
   asks Wiki AI to summarize what happened, **Then** the answer discloses that
   a source was excluded for failing the safety screen, without repeating its
   suspect content verbatim.

---

### User Story 3 - The Screen Failing Safe Never Silently Grants Write Access (Priority: P2)

As the owner of this Wiki, I want the system to always fall back to today's
fully read-only behavior whenever the safety screen itself is unavailable,
errors, or is misconfigured, so that a broken or disabled screening
dependency can never accidentally become an open door instead of a closed
one.

**Why this priority**: A probabilistic defense that fails open under its own
malfunction is worse than not having it — this guarantees the new capability
degrades to the existing, already-shipped protection rather than past it.

**Independent Test**: Simulate the safety screen being unavailable or erroring
for a Web Research turn that would otherwise be eligible for a draft write.
Confirm the turn behaves exactly like today: zero page-mutation tools, the
existing clear explanation of why.

**Acceptance Scenarios**:

1. **Given** the safety screen is unavailable, disabled, or errors while
   evaluating a source, **When** that source was used in the turn, **Then**
   the turn is treated exactly as if that source had failed the screen (falls
   back to fully read-only), never as if it had passed.
2. **Given** the screen dependency is down for an extended period, **When**
   multiple Web Research turns occur, **Then** every one of them falls back
   to today's existing read-only behavior without a degraded or confusing
   user experience — the same clear "no write tool this turn" explanation
   users already see today.

---

### Edge Cases

- What happens when a source is fetched via `web_open` but ultimately not
  used to compose the final answer (opened, then discarded as irrelevant)?
  It does not need to have passed the screen to leave the turn otherwise
  read-only, but it also cannot be cited or used — screening applies to any
  source that is actually used, and unused sources are simply not used
  (unaffected either way).
- What happens when the user's request would need `create_page` (a brand new
  page from web-sourced content) rather than updating an existing one? This
  remains outside this feature's exception — `create_page` stays unavailable
  in a Web Research turn regardless of screening outcome (Assumptions).
- What happens when a screened source passes, informs a draft, and is later
  found to have been wrong or misleading (not maliciously, just inaccurate)?
  Unaffected by this feature — the existing draft/review/publish flow is the
  backstop for ordinary inaccuracy, exactly as it is for any other AI-authored
  draft today.
- What happens when the same source is reused across multiple turns in one
  conversation? Each turn's write-eligibility is evaluated independently; a
  source passing once does not exempt it from being screened again when
  reused, since content at a live external URL can change between fetches.
- What happens when screening a source takes a long time or the source is
  very large? The turn's existing timeout/budget behavior applies; a timed-out
  screen is treated as a failure (falls back to read-only), not skipped.

## Requirements *(mandatory)*

### Functional Requirements

- **FR-001**: System MUST evaluate every source retrieved via the web-reading
  tool against a dedicated safety screen before that source's content is used
  to compose an answer, and MUST exclude a source that fails this screen from
  the answer and from citations.
- **FR-002**: The safety screen MUST specifically target attempts to instruct,
  redirect, or manipulate the assistant (for example: embedded commands,
  claims of elevated authority, or attempts to override prior instructions),
  distinct from general content-quality or relevance judgment.
- **FR-003**: System MUST treat a screen that is unavailable, errors, times
  out, or is not conclusively passed as a failure for that source — the
  system MUST NOT default to treating an inconclusive or failed screen result
  as a pass.
- **FR-004**: In a Web Research turn where every source actually used to
  compose the answer has passed the safety screen, System MUST make
  `insert_page_content` and `save_draft` available for that turn, producing a
  normal draft revision exactly as either tool would outside a Web Research
  turn.
- **FR-005**: In a Web Research turn where any source used in the answer has
  failed or not conclusively passed the safety screen, System MUST make zero
  page-mutation tools available for that turn (unchanged from 036-web-research
  FR-016's existing default).
- **FR-006**: `create_page`, `insert_generated_images`, and every
  metadata/permission/publish/tag-mutation tool MUST remain unavailable in a
  Web Research turn regardless of the safety screen's outcome — this
  feature's exception is scoped to updating an existing page's draft content
  only.
- **FR-007**: A draft created under this feature's exception MUST be
  indistinguishable in storage, versioning, and governance from a draft
  created any other way (P3: no second-class AI content path) — same
  revision model, same review/publish gate, same audit trail.
- **FR-008**: System MUST NOT publish, or otherwise make publicly visible,
  any draft created under this feature's exception without the same separate,
  human-initiated publish action every other draft already requires.
- **FR-009**: When a source is excluded for failing the safety screen, System
  MUST make this outcome disclosable in the answer (the user can learn a
  source was excluded and why) without reproducing the excluded source's
  suspect content verbatim in the disclosure.
- **FR-010**: System MUST record, for each Web Research turn, whether the
  draft-write exception was granted or withheld and why (screen outcome per
  source), as part of the turn's existing privacy-safe operational history
  (036-web-research FR-017), without retaining full excluded source bodies
  beyond that existing retention policy.

### Key Entities *(include if feature involves data)*

- **Source Safety Screen Result**: The per-source outcome of the safety
  screen for one retrieved external source within one turn — pass, fail, or
  inconclusive/unavailable (treated as fail) — and enough context to explain
  the disposition without retaining the excluded content beyond existing
  retention rules.
- **Draft-Write Eligibility**: The per-turn derived state (all used sources
  passed vs. not) that gates whether `insert_page_content`/`save_draft` are
  offered for that turn; not a new durable entity, but a computed condition
  evaluated fresh each turn.

## Success Criteria *(mandatory)*

### Measurable Outcomes

- **SC-001**: Users can complete a "research this, then update the page"
  request in one continuous conversation, without manually disabling Web
  Research and re-asking, whenever every source used passed the safety
  screen — closing the gap that previously required two separate requests in
  100% of eligible cases.
- **SC-002**: In a test set of sources deliberately crafted to instruct or
  manipulate an AI assistant, the safety screen excludes them from being used
  or cited in at least 95% of cases, and in 100% of cases where such a source
  is used anyway (a screen miss), the resulting page change is still only a
  draft — never published without separate human action.
- **SC-003**: 100% of turns where the safety screen is unavailable, erroring,
  or misconfigured fall back to today's fully read-only behavior — zero
  turns ever grant draft-write access on an inconclusive screen result.
- **SC-004**: 100% of publication, metadata, and permission state remains
  unchanged until a user separately confirms a normal Wiki mutation, in every
  Web Research turn regardless of screening outcome — this feature narrows
  036-web-research's SC-004 to page *draft content* specifically; publication,
  metadata, and permissions remain fully protected exactly as before.
- **SC-005**: In usability review, a user who successfully completes User
  Story 1 needs no more manual steps than a normal (non-Web-Research) update
  request — no extra toggle, no re-typing the request.

## Assumptions

- Scope is deliberately narrow: only `insert_page_content` and `save_draft`
  (updating an existing page's draft content) are conditionally un-blocked.
  `create_page` (authoring an entirely new page from just-fetched external
  content) is materially riskier and out of scope — it remains unavailable in
  a Web Research turn unconditionally, matching 036-web-research's existing
  behavior. `insert_generated_images` and every metadata/permission/publish/
  tag tool are likewise unconditionally out of scope and remain unavailable.
- The safety screen's exact mechanism (a dedicated model call, a rules-based
  classifier, or a combination) is a planning-phase decision, not a product
  decision — this spec requires only that it (a) specifically targets
  instruction/manipulation attempts, (b) fails closed on any inconclusive
  result, and (c) evaluates each source's content before that content is
  usable at all, independent of whether draft-write eligibility is relevant
  to the current turn.
- "Every source used in the turn" is evaluated per turn, not per conversation
  or per session — a prior turn's passing sources do not carry forward
  write-eligibility into a later turn, and a later turn's re-fetch of the same
  URL is screened again.
- This feature does not change anything about how `insert_page_content` or
  `save_draft` behave once available — their existing governance (edit scope,
  `always_review` default, `never_full_result` retention, the anchor/
  content-loss safeguards from 037-ai-partial-page-edit) applies unmodified.
