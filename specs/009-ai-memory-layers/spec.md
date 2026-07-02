# Feature Specification: AI Memory Layers & Personal Knowledge Spaces

**Feature Branch**: `009-ai-memory-layers`
**Created**: 2026-07-02
**Status**: Draft
**Input**: User description (paraphrased from Chinese): "next-wiki 的定位是给 AI 和人共享的、个人化的知识库。分层不应只是长期/短期记忆，还要区分原始记录（diary）与整理后知识（wiki）、面向 AI 与面向人的呈现差异，并参考 Karpathy 的 LLM Wiki 模式（不可变原始来源 -> LLM 维护的 wiki 层 -> 人查阅）和 MemPalace（按 agent/项目分 wing、逐字记忆、带失效窗的时序知识图谱）的分层设计，同时要结合用户管理（个人空间、隐私边界、多用户/多 agent 归属）。"
**Depends on**: 001-core-wiki-platform (pages, spaces, permissions), 004-system-ai-support (AI providers, semantic index, chat), 007-public-wiki-api + 008-public-wiki-api-maintenance (REST API, MCP tools, stats, similarity)

## Context

next-wiki's mission (constitution Mission) is "personal and enterprise knowledge
management" with AI as a first-class integration. Today that promise is only
half built: the wiki has one flat, shared content space (constitution:
Page Tree & Path System mandate defines `(space_id, path, locale)` as the
canonical key, but 001-core-wiki-platform ships a single default space only),
three global roles (admin/editor/reader), and AI capabilities (004) that read
and write the *same* published/draft pages a human would. There is no notion
of content that is private to one user, no lightweight place for an agent to
jot down what it learned without going through the full draft-review-publish
workflow, and no distinction between a verbatim record of what happened and
the curated knowledge derived from it.

Two external systems were reviewed for prior art:

- **[Karpathy's "LLM Wiki" pattern](https://gist.github.com/karpathy/442a6bf555914893e9891c11519de94f)**
  proposes three layers: immutable **raw sources** the LLM only reads, a
  **wiki layer** the LLM writes and a human reads (summaries, entity pages,
  cross-references), and a **schema** document (like `CLAUDE.md`) describing
  conventions. Maintenance ("lint") is a periodic pass that finds
  contradictions, staleness, and orphans.
- **[MemPalace](https://github.com/MemPalace/mempalace)** is a local-first,
  agent-facing conversational memory system: verbatim session capture
  organized into wings (person/project) -> rooms (topic) -> drawers (raw
  text), plus a temporal entity-relationship graph with validity windows
  (add/query/invalidate/timeline). It has no web UI, no publish workflow, and
  no human-reader concept — the audience is the agent itself.

Neither system matches next-wiki's mission on its own. MemPalace optimizes for
an agent's own recall and has no notion of a human-shared, permissioned,
versioned artifact. Karpathy's pattern assumes a single LLM maintainer and a
single human reader, with no multi-user ownership, roles, or access control.
next-wiki already has the durable, permissioned, versioned "wiki" layer
(001/004/007/008); what is missing is the **raw/working layer beneath it**,
the **personal ownership boundary around it**, and **explicit, auditable
promotion between the two** — designed against next-wiki's existing
multi-user permission model rather than assuming a single owner.

This feature defines that missing layer and the personal-space/user-management
work required to host it safely.

## User Scenarios & Testing *(mandatory)*

### User Story 1 — Every User Gets a Private Personal Space (Priority: P1)

As a signed-in user (human or an agent acting through that user's API key), I
want a private space that behaves like a normal wiki space (paths, Markdown,
revisions, search) but is visible only to me and administrators by default, so
that I can keep notes, drafts, and AI-authored memory without exposing them to
every reader of the shared wiki.

**Why this priority**: Every other layer in this spec (raw capture, promotion,
layer-aware retrieval) needs somewhere private to live first. Without a
permission boundary, "personal" memory is just more shared wiki content.

**Independent Test**: Register two users. Confirm each has exactly one
personal space auto-created, that user A cannot read, list, or search into
user B's personal space through any surface (web, REST, MCP), and that an
Admin can view both for support/compliance purposes.

**Acceptance Scenarios**:

1. **Given** a new user completes registration, **When** their account is
   created, **Then** the system provisions exactly one personal space owned by
   that user, using the existing page/path/revision model.
2. **Given** a personal space with pages in it, **When** any other non-admin
   user browses, searches, or calls the public API/MCP tools, **Then** none of
   that content is listed, returned, or disclosed to exist.
3. **Given** an Admin, **When** they need to inspect a user's personal space
   for support or compliance, **Then** they can access it, and the access is
   audited like any other administrative action.
4. **Given** a user's personal space, **When** the user creates, edits, and
   publishes pages inside it, **Then** the normal versioning, diff, and
   revision behaviors (P7) apply unchanged.

---

### User Story 2 — Agents Capture Raw Memory Without the Publish Workflow (Priority: P1)

As an AI agent operating through a scoped API key, I want to append short,
timestamped, verbatim memory records (what I did, what I learned, a session
summary) directly into the acting user's personal space, so that I can build
continuity across sessions without drafting and publishing a formal page for
every fact.

**Why this priority**: This is the "diary" / raw-capture primitive that both
Karpathy's pattern (immutable raw sources) and MemPalace (drawers) identify as
the foundation everything else is built from. Without a lightweight write
path, agents either skip memory entirely or pollute the curated wiki with
half-formed notes.

**Independent Test**: Using an Editor-scoped API key, call the memory-append
tool three times in one session. Confirm three immutable records exist under
the caller's personal space, each independently retrievable and timestamped,
with no page-revision/publish ceremony required.

**Acceptance Scenarios**:

1. **Given** an Editor or Admin API key, **When** the caller appends a memory
   record with a `kind` (e.g. `session_summary`, `fact`, `note`) and body text,
   **Then** the system stores it immediately as an immutable record owned by
   the acting user, without requiring a draft/publish step.
2. **Given** a memory record, **When** it is written, **Then** it is never
   edited in place; corrections are new records that supersede or reference
   the old one (append-only, mirrors P7's "version everything" for the wiki
   layer).
3. **Given** a Reader-scoped API key, **When** it attempts to append a memory
   record, **Then** the operation is denied (memory writes require the same
   write capability as page edits).
4. **Given** a memory record with no explicit `expiresAt`, **When** the
   configured default retention window elapses, **Then** the record becomes
   eligible for pruning unless it has been promoted (User Story 3) or pinned.
5. **Given** a memory record, **When** the caller marks it `audience: agent`
   vs `audience: human`, **Then** human-facing surfaces (web UI, digest views)
   hide `agent`-audience records by default while API/MCP access is
   unaffected — the distinction controls presentation, not access.

---

### User Story 3 — Promote Raw Memory into Curated Knowledge (Priority: P1)

As a human or an agent with write access, I want to promote a raw memory
record (or a personal-space page) into a normal wiki page — in my personal
space or, if I choose, into a shared space — so that durable, reviewed
knowledge compounds in the wiki instead of staying trapped in disposable
notes.

**Why this priority**: This is the load-bearing link between "raw" and
"curated" that Karpathy's pattern calls out as the actual value driver: raw
capture alone is not useful; what compounds is the synthesized wiki. Without
an explicit promotion action, memory records would either be manually
copy-pasted or never leave the raw layer.

**Independent Test**: Append a memory record, call the promotion action, and
confirm a normal draft page is created in the target space with the record's
content, a back-reference to the source record, and the source record marked
`promoted`. Publish the draft and confirm it now behaves as an ordinary wiki
page (searchable, versioned, backlink-eligible).

**Acceptance Scenarios**:

1. **Given** one or more memory records, **When** the owner (or an agent
   acting for them) requests promotion, **Then** the system creates a new page
   (or a new draft revision of an existing page) whose initial content is
   derived from the record(s), and links back to the source record id(s).
2. **Given** a promoted record, **When** the promotion completes, **Then** the
   source record is marked `promoted` (not deleted) so provenance is never
   lost, and it is excluded from future staleness/duplicate prompts.
3. **Given** a page in a personal space, **When** the owner promotes it to a
   shared space, **Then** it goes through the same create/move + permission
   rules as any other cross-space page move — it does not silently become
   world-readable without an explicit target-space choice.
4. **Given** a promotion request from a Reader-scoped or read-only API key,
   **When** it is attempted, **Then** it is denied, identical to any other
   write operation.

---

### User Story 4 — Layer-Aware Retrieval and Chat (Priority: P2)

As a user asking the AI chat a question, or as an agent calling semantic
search, I want answers to distinguish curated wiki knowledge from raw or
personal memory, and to default to the curated, shared layer, so that
unverified notes are never presented with the same authority as reviewed wiki
content.

**Why this priority**: Depends on US1–US3 existing. This is what makes the
layering meaningful rather than cosmetic — it is the "for AI vs. for human"
presentation split, applied to retrieval instead of just storage.

**Independent Test**: With a published wiki page and an unpromoted personal
memory record covering the same topic, ask the chat a question. Confirm the
default answer cites only the published page. Re-ask with "include my
memory" enabled and confirm the personal record is now included and clearly
labeled as personal/unreviewed, distinct from the wiki citation.

**Acceptance Scenarios**:

1. **Given** the default chat/search scope, **When** a user asks a question,
   **Then** only content from spaces they can read and from the `shared`
   layer is used, matching current 004 behavior unchanged.
2. **Given** a user opts in to "include my memory," **When** they ask a
   question, **Then** their own personal-space pages and memory records may
   also be retrieved, and every citation indicates its layer (`shared wiki`
   vs `personal note` vs `raw memory`).
3. **Given** an answer is grounded partly in a raw, unpromoted memory record,
   **When** the answer is presented, **Then** the UI/response marks that
   portion as unreviewed/agent-authored rather than presenting it with wiki
   authority.
4. **Given** a memory record or personal page the requesting user does not
   own, **When** any retrieval path runs, **Then** it is excluded exactly as
   today's permission-scoped retrieval excludes unreadable pages (P4
   unchanged, extended to the new layers).

---

### User Story 5 — Memory Maintenance ("Lint") (Priority: P2)

As a user or administrator, I want periodic visibility into stale, duplicate,
contradictory, or orphaned memory records and personal pages, so that my
personal knowledge space does not silently rot the way Karpathy's pattern
warns unattended wikis do.

**Why this priority**: Depends on the raw/personal layers existing (US1–US2)
and reuses 008's stats/duplicate-detection primitives rather than building new
ones. It is P2 because the layers are useful without it, but unmaintained
memory degrades in value quickly.

**Independent Test**: Create two near-duplicate memory records and one record
untouched for longer than the staleness threshold. Run the maintenance job and
confirm both conditions are surfaced to the owner without any content being
auto-deleted or auto-merged.

**Acceptance Scenarios**:

1. **Given** a user's personal space and memory records, **When** the periodic
   maintenance job runs, **Then** it surfaces (does not auto-fix) stale
   records past the configured age, records similar enough to be candidate
   duplicates (reusing 008's similarity scoring), and personal pages with no
   inbound or outbound links.
2. **Given** two memory records about the same subject with conflicting
   content (e.g., differing `valid_from` claims about the same fact), **When**
   maintenance runs, **Then** both are flagged as a contradiction for the
   owner to resolve; the system does not silently pick one.
3. **Given** maintenance findings, **When** the owner reviews them, **Then**
   they can promote, delete, or dismiss each finding; dismissing suppresses
   that specific finding until the underlying content changes.
4. **Given** an Admin, **When** they view system-wide maintenance health,
   **Then** they see aggregate counts (reusing 008's stats shape) without
   reading into the content of other users' personal spaces.

---

### User Story 6 — Structured Temporal Facts (Priority: P3, optional)

As an agent tracking information that changes over time (a role, a status, a
decision), I want to record it as a structured fact with a validity window
rather than free text, so that later queries can ask "what was true on date
X" instead of re-reading prose.

**Why this priority**: This is MemPalace's temporal knowledge-graph
capability. It is explicitly P3/optional: constitution P11 (Focused Scope
Over Feature Accumulation) cautions against adding structural machinery ahead
of demonstrated need. US1–US5 deliver the core mission gap; this user story is
scoped so it can be deferred to a follow-up spec without blocking the rest of
this feature.

**Independent Test**: Record a fact (`subject`, `predicate`, `object`,
`validFrom`), then record a superseding fact for the same subject/predicate
with a later `validFrom`. Query the subject "as of" a date before and after
the change and confirm the correct fact is returned for each.

**Acceptance Scenarios**:

1. **Given** a fact with an open-ended validity window, **When** a new fact
   for the same `(subject, predicate)` is recorded, **Then** the prior fact's
   `validUntil` is set and both remain queryable (invalidate, not delete).
2. **Given** a subject with a fact history, **When** a timeline query is run,
   **Then** all versions are returned in chronological order with their
   validity windows.
3. **Given** a fact query "as of" a specific timestamp, **When** it is run,
   **Then** exactly the fact(s) valid at that timestamp are returned.

### Edge Cases

- A memory record is appended by an agent whose API key is later revoked: the
  already-written record remains attributed to the acting user and is
  unaffected; only future writes are blocked.
- A personal space page is promoted, then the original personal page is
  further edited: the shared copy and the personal original diverge as two
  independent pages (promotion is a copy/move action with a provenance link,
  not a live sync).
- A user is deleted: personal-space content follows the same
  retention/anonymization policy as their authored wiki content today,
  extended to memory records — it is not silently destroyed.
- Two memory records reference each other's promoted pages, forming a cycle in
  the "back-reference" links: retrieval and lint treat this as a normal
  backlink graph (reuses 008 backlinks), not an error.
- Chat retrieval spans both a shared-space citation and a personal-memory
  citation the user does not currently have "include my memory" enabled for,
  because a background job started before the toggle changed: the response
  MUST reflect the permission/scope state at answer time, re-checked before
  streaming, not the state at request start (mirrors 004's existing
  revalidate-before-return rule).
- A memory record's `audience: agent` content is requested through the public
  REST API by a human-driven integration: audience is a presentation hint, not
  an access boundary, so it is still returned subject to normal read
  permissions.
- Retention pruning of an unpromoted, expired raw memory record that is the
  sole citation of a past chat answer already shown to a user: pruning removes
  the record but MUST NOT retroactively alter or invalidate a previously
  delivered chat transcript.

## Requirements *(mandatory)*

### Functional Requirements

#### Personal Spaces & User Management

- **FR-001**: The system MUST provision exactly one personal space per user,
  automatically at registration, using the existing space/path/revision data
  model (no parallel content model).
- **FR-002**: A personal space's default permission MUST be readable and
  writable only by its owner and by Admins; it MUST NOT inherit the shared
  default-space's anonymous-read configuration.
- **FR-003**: Moving or copying a page from a personal space to a shared space
  MUST be an explicit action distinct from normal edit/publish, and MUST
  require the same write permission on the destination space as creating a
  page there directly.
- **FR-004**: API keys (002-user-center-api-keys) used by an agent MUST act
  within the owning user's permission context; this feature MUST NOT introduce
  a separate "agent identity" with permissions independent of a human owner.
- **FR-005**: Admin access to a user's personal space MUST be audited
  identically to other administrative content access.

#### Raw Memory Capture

- **FR-006**: The system MUST provide an append-only memory record primitive,
  separate from the page/page_revision model, scoped to the acting user's
  personal space, requiring only write-level permission (no draft/publish
  ceremony).
- **FR-007**: Each memory record MUST carry: owner, acting API key/agent
  reference, a `kind` (e.g. `session_summary`, `fact`, `note`, `imported`), an
  `audience` hint (`agent` | `human` | `both`), body text, optional structured
  `subjectRefs`, creation timestamp, optional `expiresAt`, and optional
  `promotedPageId`.
- **FR-008**: Memory records MUST be immutable after creation; corrections
  MUST be new records, optionally referencing the record they supersede.
- **FR-009**: Memory records MUST default to a bounded retention window
  (administrator-configurable); unpromoted, unpinned records past that window
  become eligible for pruning by a background job, mirroring the retention
  pattern already used for AI action ephemera (004).
- **FR-010**: Pruning a memory record MUST NOT alter or invalidate any page,
  revision, or previously delivered chat answer that referenced it; pruning
  only removes future retrievability of the raw record itself.

#### Promotion

- **FR-011**: The system MUST provide a promotion action that creates a new
  page (or a new revision of an existing page) from one or more memory records
  or a personal-space page, in a caller-chosen target space.
- **FR-012**: Promotion MUST preserve provenance: the resulting page revision
  MUST reference its source memory record id(s) or source page, and the source
  record(s) MUST be marked `promoted` without being deleted.
- **FR-013**: Promoted pages MUST behave as ordinary pages thereafter (normal
  versioning, diff, backlinks, search, permissions) — promotion is a one-time
  content transfer, not an ongoing sync.
- **FR-014**: Promotion MUST require write permission on the destination space
  and MUST be denied for Reader-scoped or read-only credentials.

#### Layer-Aware Retrieval

- **FR-015**: Default semantic search and chat scope MUST remain unchanged
  from 004: shared, permission-readable, published content only.
- **FR-016**: Users MUST be able to explicitly opt in, per query or as a
  standing preference, to include their own personal-space content and memory
  records in retrieval.
- **FR-017**: Every citation or retrieved excerpt MUST indicate its source
  layer (`shared wiki`, `personal page`, or `raw memory`) so a human or agent
  consumer can weight its authority accordingly.
- **FR-018**: Retrieval MUST re-check permission and opt-in scope at answer
  time (not only at request start) before returning or streaming content,
  consistent with 004's existing revalidation rule.
- **FR-019**: Raw memory content included in retrieval MUST NOT be mixed into
  the same embedding index/generation as curated wiki content; it MUST be
  distinguishable at the storage layer as well as in the response.

#### Maintenance ("Lint")

- **FR-020**: A periodic background job MUST identify, per user, stale memory
  records/personal pages (past a configurable age with no update or access),
  candidate-duplicate records (reusing 008's similarity scoring), and orphaned
  personal pages (no backlinks, reusing 008's backlink/orphan detection).
- **FR-021**: The system MUST also detect direct contradictions: two
  non-superseded records for the same declared subject with overlapping
  validity and differing content MUST be flagged, not silently resolved.
- **FR-022**: Maintenance findings MUST be presented to the owner (and, in
  aggregate, to Admins) as actionable items (promote, delete, dismiss); the
  system MUST NOT auto-delete or auto-merge content.
- **FR-023**: Dismissing a finding MUST suppress that specific finding until
  the underlying content changes; it MUST NOT suppress the entire maintenance
  category.

#### Structured Temporal Facts (P3, optional slice)

- **FR-024**: If implemented, structured facts MUST use an
  `add / invalidate / timeline` model: a new fact for the same
  `(subject, predicate)` closes the prior fact's validity window rather than
  overwriting or deleting it.
- **FR-025**: If implemented, "as of" queries MUST return the fact(s) valid at
  a given timestamp, and timeline queries MUST return the full ordered
  history.

### Key Entities

- **Personal Space**: A space (existing `spaces` concept per the constitution's
  Page Tree mandate) owned by exactly one user, auto-created at registration,
  with owner+admin-only default permissions. Holds ordinary pages/revisions.
- **Memory Record**: An immutable, append-only unit distinct from a page
  revision — owner, acting agent/API key, kind, audience, body, optional
  subject references, optional validity window, optional promoted-page link,
  optional expiry. The raw-capture layer.
- **Promotion Link**: The provenance relationship from one or more memory
  records (or a personal page) to the resulting page revision created by
  promotion. Never deleted, even after the source record is pruned (the link
  record survives; the raw body may not).
- **Maintenance Finding**: A surfaced observation (stale / duplicate /
  contradiction / orphan) about a user's memory records or personal pages,
  with a status (open / dismissed / resolved) and a reference to the
  content it concerns.
- **Fact** *(P3, optional)*: A structured `(subject, predicate, object,
  validFrom, validUntil, sourceRecordId)` tuple enabling "as of" and timeline
  queries, layered on top of memory records rather than replacing them.

### Assumptions and Dependencies

- Depends on 001's page/space/revision/permission primitives; this feature
  activates multi-space support that 001 deliberately deferred (space kept as
  a "hidden schema field") rather than redesigning it.
- Depends on 004's AI provider/entitlement/semantic-index infrastructure for
  layer-aware retrieval (US4); without AI configured, US1–US3 and US5 (minus
  similarity/contradiction scoring) still function as plain permissioned
  content and manual review.
- Depends on 008's backlink and similarity-scoring primitives, reused rather
  than reimplemented for maintenance (US5).
- Assumes 002's API keys remain the sole agent-identity mechanism (FR-004); a
  future spec MAY introduce first-class agent identities independent of a
  single human owner, but that is out of scope here.
- Page-level (as opposed to space-level) permission entries remain deferred
  per 001's appendix A7. This feature relies on space-level permissioning
  (whole personal space is private) rather than per-page ACLs; finer-grained
  in-space sharing is out of scope until that gap is closed.

### Out of Scope

- First-class agent identities with permissions independent of a human owner
  (agents act only through their owner's scoped API key, per FR-004).
- Cross-user memory sharing beyond explicit promotion into a shared space
  (e.g., no "share this note with user X only").
- Automatic contradiction resolution or automatic merging of duplicates
  (maintenance only flags; a human or explicitly-invoked agent action
  resolves).
- Real-time sync between a promoted page and its personal-space original after
  promotion (promotion is a one-time transfer).
- MemPalace-style multi-agent "wings" as a distinct data model — agents are
  represented by their acting API key within the owner's existing space, not
  a new entity type.
- Full structured knowledge-graph querying (multi-hop relations, graph
  traversal UI) beyond the single-hop `(subject, predicate, object)` facts in
  US6.

## Success Criteria *(mandatory)*

### Measurable Outcomes

- **SC-001**: Every newly registered user has a private personal space within
  the same request/transaction that creates their account; zero personal
  spaces are missing when audited against the user table.
- **SC-002**: In permission testing, a non-owner, non-admin user has zero
  successful reads of another user's personal space or memory records across
  web, REST, and MCP surfaces.
- **SC-003**: An agent can append a memory record and have it durably
  retrievable in under 200ms at the write path (no draft/publish round trip
  required), verified by automated timing tests.
- **SC-004**: Promotion provenance is verifiable end-to-end: for any promoted
  page, the source memory record(s) or personal page are discoverable from the
  resulting page revision, confirmed by automated tests.
- **SC-005**: Default chat/search answers are unaffected by the existence of
  unpromoted memory records — a regression suite re-running all existing
  004/007/008 acceptance tests continues to pass unchanged.
- **SC-006**: When a user opts in to "include my memory," 100% of returned
  citations in test scenarios correctly label their source layer (shared /
  personal / raw).
- **SC-007**: A maintenance run on a seeded personal space with known stale,
  duplicate, and contradictory records surfaces all seeded cases with zero
  false auto-modifications (nothing is deleted or merged without owner
  action).
- **SC-008**: Pruning an expired, unpromoted memory record leaves previously
  delivered chat transcripts and all page revisions referencing it unchanged,
  confirmed by a regression test that captures a transcript, prunes the
  source, and re-reads the transcript.
