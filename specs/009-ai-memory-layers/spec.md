# Feature Specification: AI Memory Pipeline — Raw, Proposal, Formal, Public

**Feature Branch**: `009-ai-memory-layers`
**Created**: 2026-07-02
**Status**: Draft
**Input**: User description (paraphrased from Chinese, revised after constitution
v2.0.0): "next-wiki 的定位是给 AI 和人共享的、个人化的知识库——但'个人化'指的是单一
owner 的产品形态（其他账号只是 Reader/Editor），不是按用户隔离空间。space 应该按
别的维度划分。Raw memory 应该是一层，而不是每个用户一个独立空间；它主要应该转成对
现有 wiki 页面的补充/修正提案（page proposal），而不是总建新页面。Owner 自己的
chat/search 要覆盖所有内部层，外部用户只能看 shared/published 层。这几层大概率都要
建索引。分层明确为四层：raw / proposals / formal（对内）/ published（对外）。"
**Depends on**: 001-core-wiki-platform (pages, spaces, permissions), 004-system-ai-support
(AI providers, semantic index, chat), 007-public-wiki-api + 008-public-wiki-api-maintenance
(REST API, MCP tools, stats, similarity), constitution v2.0.0 (personal-by-default
mission, P2 AI-native creation, P3 knowledge base as portable AI memory, P5
permissions personal by default)

## Revision Note

This spec supersedes the first draft of 009, which modeled memory isolation as
**one private space per registered user**. That was wrong for this product:
constitution v2.0.0 P1/P5 establish next-wiki as **personal by default** — one
owner, one instance. Other accounts in a shared deployment are Reader/Editor
collaborators on the *same* knowledge base, not separate owners each needing
their own isolated space. `space_id` (per the Page Tree & Path System mandate)
remains a **topical/organizational** partition the owner defines (e.g. by
project or subject area) — it is not, and does not become, an identity
boundary.

The axis this feature actually needs is **maturity**, not identity: how far a
piece of content has traveled from an unstructured capture to something the
outside world can read. This revision replaces the space-per-user model with
an explicit four-layer pipeline: **raw -> proposal -> formal -> public**.

## Context

Constitution P3 ("The Knowledge Base is the User's Portable AI Memory") and P2
("AI-Native Creation, Never Vendor-Locked") establish that conversing with AI
is the *default* way content enters next-wiki, and that AI-authored and
human-authored content MUST be indistinguishable to storage and permissions
(anti-pattern: "AI content as second-class"). Today, 004 already lets AI write
directly into the same page/revision model a human uses. What's missing is
everywhere *before* that: a place for unstructured capture that hasn't earned
page status yet, and an explicit, reviewable step between "the AI thinks this
is worth remembering" and "this is now part of the formal wiki."

Two external systems were reviewed as prior art (see the original 009
discussion): **Karpathy's "LLM Wiki" pattern** (immutable raw sources -> an
LLM-maintained wiki layer -> a human reader, plus a periodic "lint" pass) and
**MemPalace** (verbatim per-agent capture with a temporal knowledge graph, no
publish workflow, no human-shared artifact). Neither fits next-wiki directly:
MemPalace has no notion of a reviewed, shared, permissioned artifact; Karpathy's
pattern assumes the LLM's wiki edits are trusted by default. next-wiki already
has strong versioning and permissions (P5, P8); what it needs from both
patterns is the *shape* of the pipeline — raw capture, a maintained middle
layer, and a lint/maintenance discipline — applied through next-wiki's
existing review model (drafts, explicit publish, citations) rather than
letting AI write formal content unreviewed.

**The four layers**:

1. **Raw** — unstructured, append-only capture. Agent session notes, facts
   learned mid-conversation, imported snippets. Not shaped like a page, not
   assigned to a space yet, never shown to Readers or the outside world.
2. **Proposal** — a structured, reviewable suggestion derived from one or more
   raw records: either a new page or, more commonly as the wiki matures, a
   patch against an existing formal page. Visible to whoever can edit the
   target; not yet part of the wiki's live content.
3. **Formal** — exactly what next-wiki already calls a published page today
   (001/007): the current live revision, versioned, permission-scoped to
   whoever can read that space. This spec does not change formal-page
   behavior; it only changes what feeds into it.
4. **Public** — formal content additionally exposed to anonymous readers
   and/or external callers of the Public Wiki Content API (007/008). This is
   today's existing configurable anonymous-read permission, reframed as the
   deliberate, explicit outward tip of the pipeline rather than an
   afterthought.

A record's or page's layer is a property of *maturity and review state*, not
of who authored it or which space it lives in — an owner can hand-write
straight into formal, and an agent's raw note can be promoted all the way to
public. The pipeline describes how content *can* flow, not who is allowed to
skip steps.

## User Scenarios & Testing *(mandatory)*

### User Story 1 — Capture Raw Memory (Priority: P1)

As an AI agent (or the owner, directly) operating through a write-scoped API
key, I want to append short, timestamped, verbatim memory records without
choosing a space or a page up front, so that capture stays fast and nothing
requires a filing decision before it happens.

**Why this priority**: This is the entry point for everything else in this
feature. Without a zero-friction capture primitive, agents either skip memory
entirely or force unstructured notes into full pages, defeating the purpose of
a separate raw layer.

**Independent Test**: Using a write-scoped API key, append three memory
records with different `kind`s in one session, with no `spaceId` supplied.
Confirm all three are stored immediately, are independently retrievable, and
none produced a page, page revision, or space assignment as a side effect.

**Acceptance Scenarios**:

1. **Given** a write-scoped API key, **When** the caller appends a memory
   record with a `kind` (e.g. `session_summary`, `fact`, `note`, `imported`)
   and body text, **Then** the record is stored immediately as an immutable
   entry in the wiki-wide raw stream, with no space, page, or draft/publish
   step required.
2. **Given** a memory record, **When** it is written, **Then** it is never
   edited in place; corrections are new records that reference the record
   they supersede.
3. **Given** a read-only API key, **When** it attempts to append a memory
   record, **Then** the operation is denied — writing memory requires the
   same write capability as editing a page.
4. **Given** a memory record with no explicit `expiresAt`, **When** the
   configured default retention window elapses without the record being
   referenced by a proposal, **Then** it becomes eligible for pruning.
5. **Given** the owner's account, **When** they or an Admin browse the raw
   stream, **Then** they see all records regardless of which account wrote
   them; **Given** a non-owner Editor, **When** they browse the raw stream,
   **Then** they see only records their own key wrote — raw capture is never
   exposed to Readers.

---

### User Story 2 — Raw Memory Becomes Page Proposals, Enrichment First (Priority: P1)

As the owner (or an Editor with matching permissions), I want raw memory to
turn into a reviewable proposal that, whenever the content clearly relates to
an existing formal page, **amends that page** rather than defaulting to a new
one, so that the wiki consolidates knowledge instead of fragmenting it into
near-duplicate pages over time.

**Why this priority**: This is the mechanism that makes raw capture valuable
instead of just accumulating notes. Depends on US1 (something to promote) and
reuses 008's similarity scoring so it does not reinvent duplicate detection.

**Independent Test**: Append a raw record whose content closely matches an
existing formal page's topic; confirm the generated proposal is an *amend*
proposal (a patch against that page), not a new-page proposal. Append a second
raw record on an unrelated topic with no matching formal page; confirm it
produces a *new-page* proposal. Accept the first, reject the second, and
confirm only the accepted one produced a new page revision.

**Acceptance Scenarios**:

1. **Given** one or more raw records ready for proposal generation, **When**
   the system (via AI, on request or on a schedule) builds a proposal,
   **Then** it MUST first run similarity matching (reusing 008's scoring)
   against existing formal pages before deciding the proposal's kind.
2. **Given** a match above the configured confidence threshold, **When** the
   proposal is generated, **Then** it MUST be an *amend* proposal: a
   structured patch (add section / update fact / append reference) against
   the matched formal page, referencing that page's current revision as its
   base.
3. **Given** no match above the threshold, **When** the proposal is
   generated, **Then** it MUST be a *new-page* proposal, with a caller- or
   AI-suggested target space and path.
4. **Given** a pending proposal, **When** the owner (or an Editor with edit
   rights on the target page) accepts it, **Then** the system creates a new
   page (or a new revision of the target page) applying the proposal content,
   and that acceptance itself satisfies the "no auto-publish without
   confirmation" requirement (constitution P2) — no separate publish click is
   required beyond the accept action.
5. **Given** a pending proposal, **When** it is rejected, **Then** no page or
   revision is created or changed, and the source raw record(s) remain intact
   (not deleted) so they can be revisited or re-matched later.
6. **Given** an amend proposal, **When** the target formal page has been
   edited again since the proposal's base revision, **Then** the proposal is
   marked stale and MUST be re-checked against the new current revision
   before it can be accepted (it MUST NOT silently overwrite intervening
   edits).
7. **Given** a read-only API key or a Reader account, **When** either
   attempts to accept, reject, or directly generate a proposal, **Then** the
   operation is denied.

---

### User Story 3 — Publish Formal Pages to the Public Layer (Priority: P2)

As the owner, I want to explicitly decide which formal pages are additionally
visible to anonymous readers and external Public API/MCP callers, so that my
internal knowledge base and my public-facing wiki are not the same thing by
accident.

**Why this priority**: Depends on formal pages existing (unchanged 001/007
behavior). It is P2 because a next-wiki instance is fully useful with zero
public content — this only matters for owners who choose to expose part of
their knowledge base.

**Independent Test**: Create and publish a formal page (default: internal
only). Confirm an anonymous request and an external Public API key without
elevated scope cannot read it. Explicitly mark it public. Confirm both can now
read it, and that unrelated formal pages remain internal-only.

**Acceptance Scenarios**:

1. **Given** a newly published formal page, **When** no explicit action has
   been taken, **Then** it is readable by signed-in accounts per the existing
   permission model but NOT by anonymous callers or external Public API keys
   without elevated scope (unchanged default from 001/007).
2. **Given** the owner marks a formal page (or a whole space) public,
   **When** an anonymous reader or an external Public API/MCP caller requests
   it, **Then** it is returned, reusing the existing configurable
   anonymous-read permission rather than a new access-control mechanism.
3. **Given** a public formal page, **When** the owner later revokes public
   visibility, **Then** it reverts to internal-only immediately for new
   requests; already-cached/delivered external responses are out of scope for
   retraction.

---

### User Story 4 — Owner's Chat Spans Every Layer; Outside Callers See Only Public (Priority: P1)

As the owner, I want the AI chat pane and semantic search to draw on my raw
notes, pending proposals, and formal pages by default with no extra toggle,
because it is all my own memory — while anonymous visitors and external API
callers only ever see the public layer, and Editors/Readers see only what
their role already allows.

**Why this priority**: This is what makes the layering meaningful rather than
cosmetic, and directly reflects the single-owner mission (P1/P5): there is no
reason to gate the owner's own chat behind an opt-in for their own memory.
Depends on US1–US3 for there to be anything layered to retrieve.

**Independent Test**: As the owner, ask the chat a question whose answer only
exists in a raw memory record. Confirm it is used and labeled as raw/unreviewed.
Ask the same question through the public API with no key (anonymous) or with
a public-scoped external key. Confirm the raw record is never surfaced and, if
no public page answers it, the response says so rather than falling back to
internal content.

**Acceptance Scenarios**:

1. **Given** the owner (authenticated session or an owner-scoped API
   key/MCP session), **When** they ask a question, **Then** retrieval spans
   raw, proposal, and formal content they can read, by default, with no
   opt-in step.
2. **Given** an anonymous visitor or an external Public API/MCP caller,
   **When** they ask a question or search, **Then** retrieval is scoped to
   the public layer only, matching 004's and 007's existing default
   permission-scoped behavior.
3. **Given** an Editor or Reader account in a shared deployment, **When**
   they ask a question, **Then** retrieval covers formal (and public) content
   they can read, plus proposals targeting pages they can edit; raw content is
   never included for non-owner, non-admin accounts.
4. **Given** any answer, **When** it is presented, **Then** every citation
   indicates its layer (`raw`, `proposal`, `formal`, or `public`) so the
   reader can weight its authority — raw and proposal citations are marked
   unreviewed/provisional, formal and public are not.
5. **Given** a permission or layer-scope change between retrieval and answer
   delivery, **When** the answer is about to stream, **Then** the system
   re-checks scope before returning content, consistent with 004's existing
   revalidate-before-return rule.

---

### User Story 5 — Memory Maintenance Across All Layers (Priority: P2)

As the owner, I want periodic visibility into stale raw records, an aging
unreviewed proposal backlog, duplicate or contradictory content, and orphaned
formal pages, so the pipeline does not silently clog or rot the way an
unattended wiki does.

**Why this priority**: Depends on US1–US3 existing; reuses 008's stats and
similarity primitives rather than building new ones. P2 because the pipeline
functions without it, but value decays without maintenance.

**Independent Test**: Seed a raw record older than the staleness threshold
with no proposal generated from it, and two proposals that conflict with each
other's claims about the same subject. Run the maintenance job and confirm
both conditions are surfaced without anything being auto-deleted, auto-merged,
or auto-accepted.

**Acceptance Scenarios**:

1. **Given** the raw and proposal layers, **When** the periodic maintenance
   job runs, **Then** it surfaces: raw records older than a configurable age
   that never produced a proposal ("unprocessed backlog"), proposals pending
   review past a configurable age, candidate-duplicate proposals/pages
   (reusing 008's similarity scoring), and orphaned formal pages (reusing
   008's backlink/orphan detection).
2. **Given** two open proposals (or a proposal and an existing formal fact)
   that conflict about the same subject, **When** maintenance runs, **Then**
   both are flagged as a contradiction; the system does not silently pick a
   winner.
3. **Given** maintenance findings, **When** the owner reviews them, **Then**
   they can act (accept/reject a proposal, delete a raw record, promote a
   backlog item) or dismiss a finding; dismissal suppresses only that
   specific finding until the underlying content changes.

---

### User Story 6 — Structured Temporal Facts (Priority: P3, optional)

As an agent tracking information that changes over time (a role, a status, a
decision), I want to record it as a structured fact with a validity window
instead of free text, so that later queries can ask "what was true on date X."

**Why this priority**: MemPalace's temporal knowledge-graph capability.
Explicitly P3/optional per constitution P1 (personal-by-default simplicity)
and the general preference for the smallest viable slice — this can be
deferred to a follow-up spec without blocking US1–US5.

**Independent Test**: Record a fact (`subject`, `predicate`, `object`,
`validFrom`), then record a superseding fact for the same subject/predicate
with a later `validFrom`. Query "as of" a date before and after the change and
confirm the correct fact is returned for each.

**Acceptance Scenarios**:

1. **Given** a fact with an open-ended validity window, **When** a new fact
   for the same `(subject, predicate)` is recorded, **Then** the prior fact's
   `validUntil` is set and both remain queryable (invalidate, not delete).
2. **Given** a fact query "as of" a specific timestamp, **When** it is run,
   **Then** exactly the fact(s) valid at that timestamp are returned.

### Edge Cases

- A raw record is written by an agent whose API key is later revoked: the
  record and any proposal already generated from it are unaffected; only
  future writes/generation are blocked.
- Two raw records, written minutes apart, both match the same formal page
  above the confidence threshold: the system MUST NOT create two competing
  amend proposals against the same base revision without surfacing the
  collision — the second proposal generation attempt MUST detect the first
  pending proposal and either merge into it or flag the conflict.
- An amend proposal's target page is deleted (soft-delete) while the proposal
  is pending: the proposal is marked invalid rather than silently
  resurrecting the page on accept.
- A raw record is capable of matching two unrelated formal pages with similar
  scores: the proposal generation step MUST surface both candidates rather
  than silently picking one, so the reviewer chooses.
- A formal page is marked public, then later a new formal revision is
  published: the newest revision inherits the public flag; visibility is a
  page/space property, not tied to a specific revision.
- The owner's chat retrieval spans a raw citation that is pruned (US1's
  retention) moments after an answer was streamed: the already-delivered
  answer is unaffected; a follow-up question loses access to that specific
  raw source.
- An Editor account (non-owner) generates a proposal from their own raw
  records: it follows the same matching and review rules as an owner-
  generated proposal, but only against pages that Editor can already edit.
- External Public API traffic requests content that exists only as a
  proposal or raw record: the response MUST behave identically to the content
  not existing at all (no existence disclosure of internal-layer content).

## Requirements *(mandatory)*

### Functional Requirements

#### Raw Capture

- **FR-001**: The system MUST provide an append-only memory record primitive,
  independent of the page/page_revision model, requiring only write-level
  permission and no space, page, or draft/publish step at write time.
- **FR-002**: Each memory record MUST carry: id, writer (API key/account
  reference), `kind`, body text, optional structured `subjectRefs`, creation
  timestamp, optional `expiresAt`, and a nullable link to the proposal it fed
  (`generatedProposalId`).
- **FR-003**: Memory records MUST be immutable after creation; corrections
  MUST be new records optionally referencing the record they supersede.
- **FR-004**: The raw layer MUST be visible in full to the owner and Admins
  regardless of writer; non-owner Editors MUST see only records their own
  credential wrote. The raw layer MUST NOT be visible to Readers, anonymous
  callers, or external Public API/MCP callers under any scope.
- **FR-005**: Unreferenced (not linked to any proposal), unpinned memory
  records past a configurable default retention window become eligible for
  background pruning; pruning MUST NOT alter any page, revision, or
  previously delivered chat answer that referenced the record.

#### Proposals

- **FR-006**: The system MUST provide a proposal generation action (on
  request or scheduled) that consumes one or more raw records and, before
  deciding the proposal's kind, MUST run similarity matching against existing
  formal pages (reusing 008's similarity scoring).
- **FR-007**: When a match exceeds a configurable confidence threshold, the
  system MUST generate an *amend* proposal: a structured patch against the
  matched formal page's current revision. Below the threshold, it MUST
  generate a *new-page* proposal with a suggested target space and path.
- **FR-008**: A proposal MUST reference its source raw record(s), its kind
  (amend | new-page), and — for amend proposals — the base revision id it was
  computed against.
- **FR-009**: Proposals MUST be visible to the owner/Admins and to any
  Editor who already holds edit permission on the proposal's target (existing
  page for amend, target space for new-page); Readers and external callers
  MUST NOT see proposals.
- **FR-010**: Accepting a proposal MUST create a new page or a new page
  revision applying the proposal content, through the same versioning model
  as any other edit (P8/existing P7 "version everything"); the accept action
  itself satisfies the "confirmation before content becomes live" requirement
  — no separate publish action is required.
- **FR-011**: Rejecting or dismissing a proposal MUST NOT delete or alter its
  source raw record(s).
- **FR-012**: If a formal page's current revision changes after an amend
  proposal was generated against it, the proposal MUST be marked stale and
  re-validated before it can be accepted.
- **FR-013**: The system MUST detect and surface (not silently resolve) the
  case where two pending proposals target the same page or overlapping
  content.

#### Formal & Public Layers

- **FR-014**: Formal-page behavior (create, edit, draft, publish, revision,
  diff, permissions) is unchanged from 001/007; this feature does not modify
  it beyond making proposal-acceptance a new entry point into it.
- **FR-015**: The system MUST let the owner mark a formal page (or space)
  public, reusing the existing configurable anonymous-read permission and the
  Public Wiki Content API's existing scope model, rather than introducing a
  new access-control mechanism.
- **FR-016**: Public visibility MUST default to off for newly published
  formal pages.

#### Layer-Aware Retrieval

- **FR-017**: Raw, proposal, and formal content MUST each be embedded into
  the semantic index (extending 004's index-generation model), tagged with
  their layer and review status; a public-layer query is a permission-filtered
  view over the formal-layer embeddings, not a separate index.
- **FR-018**: The owner's chat and semantic search MUST default to retrieving
  across raw, proposal, and formal layers with no opt-in step required.
- **FR-019**: Anonymous callers and external Public API/MCP callers MUST be
  scoped to the public layer only, matching 004's and 007's existing default
  behavior unchanged.
- **FR-020**: Non-owner Editor/Reader accounts MUST be scoped to formal and
  public content they can read, plus (Editors only) proposals targeting pages
  they can edit; raw is excluded for all non-owner, non-admin accounts.
- **FR-021**: Every citation or retrieved excerpt MUST indicate its source
  layer; raw and proposal citations MUST be visually/structurally marked as
  unreviewed, distinct from formal/public citations.
- **FR-022**: Retrieval MUST re-check permission and layer scope at answer
  time, not only at request start, consistent with 004's existing
  revalidate-before-return rule.

#### Maintenance ("Lint")

- **FR-023**: A periodic background job MUST identify: raw records past a
  configurable age with no generated proposal, proposals pending review past
  a configurable age, candidate-duplicate proposals/pages (reusing 008), and
  orphaned formal pages (reusing 008).
- **FR-024**: The job MUST flag direct contradictions between open proposals
  or between a proposal and existing formal content covering the same
  subject, without auto-resolving them.
- **FR-025**: Findings MUST be actionable (accept/reject/promote/delete) but
  MUST NOT trigger any automatic content change; dismissing a finding
  suppresses only that specific finding until the underlying content changes.

### Key Entities

- **Memory Record** (raw layer): immutable, append-only — writer, kind, body,
  optional subject references, optional expiry, optional link to the proposal
  it produced. Not scoped to a space.
- **Proposal** (proposal layer): kind (`amend` | `new-page`), source memory
  record id(s), target (existing page + base revision id, or suggested
  space/path), generated content/patch, status (`pending` | `stale` |
  `accepted` | `rejected`), reviewer.
- **Page / Page Revision** (formal layer): unchanged from 001 — no new
  entity, only a new creation path (proposal acceptance) alongside the
  existing manual editor and AI-chat-direct-write paths.
- **Public Visibility Flag**: reuses the existing anonymous-read permission
  and Public API scope model on a page or space; not a new entity.
- **Maintenance Finding**: kind (stale-raw | stale-proposal | duplicate |
  contradiction | orphan-formal), status (open | dismissed | resolved),
  reference to the content it concerns.
- **Fact** *(P3, optional)*: `(subject, predicate, object, validFrom,
  validUntil, sourceRecordId)`, layered on top of memory records.

### Assumptions and Dependencies

- Depends on 001's page/space/revision/permission primitives; `space_id`
  remains a topical partition and is explicitly NOT repurposed as a per-user
  boundary by this feature (see Revision Note).
- Depends on 004's AI provider/entitlement/semantic-index infrastructure for
  proposal generation and layer-aware retrieval; without AI configured, raw
  capture and manual proposal review still function, but automatic matching
  (FR-006/007) does not run.
- Depends on 008's backlink and similarity-scoring primitives, reused rather
  than reimplemented for both proposal matching (US2) and maintenance (US5).
- Assumes 002's API keys remain the sole credential mechanism; there is no
  agent identity independent of the account whose key was used, consistent
  with constitution P5 (permissions personal by default, no bolted-on
  identity concepts).
- Assumes the single-owner default from constitution P1/P5: exactly one
  account is "the owner" per deployment; multi-user (Editor/Reader) is the
  existing optional team extension, not redesigned by this feature.

### Out of Scope

- Per-user private spaces or any per-identity content isolation (explicitly
  rejected — see Revision Note).
- Automatic contradiction resolution or automatic merging of duplicate
  proposals (maintenance only flags; a human resolves).
- Automatic proposal acceptance under any condition — every formal-page
  change from this pipeline requires an explicit accept action.
- Real-time sync between an accepted amend proposal and the raw records that
  produced it after acceptance (acceptance is a one-time content transfer).
- Full structured knowledge-graph querying beyond the single-hop
  `(subject, predicate, object)` facts in US6.
- Redacting or transforming content specifically for public exposure (US3
  reuses the existing all-or-nothing anonymous-read permission; selective
  public-safe rewriting of a formal page is a future enhancement).

## Success Criteria *(mandatory)*

### Measurable Outcomes

- **SC-001**: An agent can append a memory record and have it durably
  retrievable in under 200ms at the write path, with zero space/page
  selection required, verified by automated timing tests.
- **SC-002**: Given raw content that closely matches an existing formal page
  (above the confidence threshold in a seeded test corpus), proposal
  generation produces an amend proposal, not a new-page proposal, in 100% of
  seeded cases; given unrelated raw content, it produces a new-page proposal.
- **SC-003**: Zero formal page revisions are created without a corresponding
  explicit accept action, confirmed by an audit query correlating every
  proposal-sourced revision to an acceptance event.
- **SC-004**: In permission testing, Readers and external Public API/MCP
  callers have zero successful reads of raw records or proposals across web,
  REST, and MCP surfaces, in 100% of tested scopes.
- **SC-005**: The owner's chat, with no configuration change, retrieves and
  correctly layer-labels content from all four layers in a seeded test wiki
  containing raw, proposal, formal, and public content on the same topic.
- **SC-006**: External/anonymous chat and search on the same seeded wiki
  return only public-layer content, and existing 004/007/008 acceptance
  tests continue to pass unchanged.
- **SC-007**: A maintenance run on a seeded wiki with known stale raw
  backlog, an aging proposal, a duplicate pair, and a contradiction surfaces
  all seeded cases with zero automatic content modification.
- **SC-008**: Pruning an expired, unreferenced raw record leaves all formal
  page revisions and previously delivered chat transcripts referencing it
  unchanged, confirmed by a regression test.
