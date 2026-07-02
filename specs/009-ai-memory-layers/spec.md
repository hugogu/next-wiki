# Feature Specification: AI Memory Layers

**Feature Branch**: `009-ai-memory-layers`  
**Created**: 2026-07-02  
**Status**: Draft  
**Input**: User description: "next-wiki is a personal knowledge base shared by AI and humans. Personal means a single-owner product shape where other accounts are Reader or Editor collaborators, not separate user workspaces. Space should remain an organizational concept. Raw memory should be a layer, not a per-user space, and should usually become proposals that supplement or correct existing wiki pages rather than always creating new pages. The owner chat/search should cover all internal layers; external users should see only shared or published layers. The layers are raw, proposals, formal, and published/public."

## User Scenarios & Testing *(mandatory)*

### User Story 1 - Capture Raw Memory Without Filing Decisions (Priority: P1)

As an owner, Admin, Editor, or permitted AI assistant, I want to capture raw memory quickly without choosing a page or space first, so that useful information is not lost while a conversation or work session is still unfolding.

**Why this priority**: Raw capture is the entry point for the entire pipeline. Without it, AI-assisted memory either disappears after a session or is forced prematurely into formal wiki pages.

**Independent Test**: Capture several raw memory records during one session without selecting a page or space. Verify that the records are stored, visible to permitted internal users, and do not create or edit any formal page.

**Acceptance Scenarios**:

1. **Given** a user or assistant with permission to capture memory, **When** they save a raw memory record with text and a category, **Then** the record is stored immediately without requiring a page, space, or publish decision.
2. **Given** a saved raw memory record, **When** someone needs to correct it, **Then** they add a new correcting record rather than editing the original record in place.
3. **Given** a user without memory-capture permission, **When** they attempt to save a raw memory record, **Then** the system denies the action and explains that capture requires edit-level access.
4. **Given** raw records that have not been promoted or pinned after the configured retention period, **When** maintenance evaluates them, **Then** they become eligible for cleanup review without affecting any formal page.

---

### User Story 2 - Convert Raw Memory Into Page Proposals (Priority: P1)

As an Admin or Editor, I want raw memory to become reviewable proposals that prefer improving existing formal pages when there is a clear match, so that the wiki grows by consolidation instead of accumulating duplicate pages.

**Why this priority**: This is the main value of raw memory. It turns unstructured capture into reviewed wiki knowledge while keeping humans in control of what becomes formal content.

**Independent Test**: Capture one raw record related to an existing formal page and one raw record about a new topic. Generate proposals for both. Verify that the related record becomes an amendment proposal for the existing page, the unrelated record becomes a new-page proposal, and only an accepted proposal changes formal content.

**Acceptance Scenarios**:

1. **Given** raw records ready for review, **When** proposal generation runs, **Then** the system first checks whether each record clearly belongs to an existing formal page before suggesting a new page.
2. **Given** a clear existing-page match, **When** a proposal is created, **Then** it is presented as a suggested amendment to that page, including the source raw record and the affected page.
3. **Given** no clear existing-page match, **When** a proposal is created, **Then** it is presented as a suggested new page with a proposed location.
4. **Given** a pending proposal, **When** an Admin or Editor with permission for the target accepts it, **Then** the system creates or updates the formal page through the normal review and versioning flow.
5. **Given** a pending proposal, **When** it is rejected, **Then** no formal page is created or changed and the source raw record remains available for later review.
6. **Given** an amendment proposal whose target page changed after the proposal was created, **When** a reviewer opens it, **Then** the proposal is marked as needing recheck before acceptance.

---

### User Story 3 - Keep Formal Knowledge Separate From Published Knowledge (Priority: P2)

As the owner or Admin, I want to explicitly choose which formal pages are visible outside the private wiki, so that internal memory does not become public by accident.

**Why this priority**: The wiki must be useful as a private personal memory even when nothing is public. Publishing is important, but it is a deliberate outward step.

**Independent Test**: Create a formal page and verify that external visitors cannot see it by default. Mark the page or its containing area as public, verify external visibility, then revoke public visibility and verify that new external requests no longer show it.

**Acceptance Scenarios**:

1. **Given** a newly created formal page, **When** no public visibility has been granted, **Then** only permitted signed-in users can read it.
2. **Given** a formal page or area marked public by an Admin, **When** an external visitor requests it, **Then** the visitor can read only the content that has been explicitly published.
3. **Given** a page that was public, **When** public visibility is revoked, **Then** it immediately becomes unavailable to new external visitors while remaining available to permitted internal users.

---

### User Story 4 - Search and Chat Respect Layer Permissions (Priority: P1)

As the owner, I want chat and search to use my raw notes, proposals, formal pages, and public pages by default, while collaborators and external visitors only retrieve layers they are allowed to access, so that AI assistance is complete for me and safe for everyone else.

**Why this priority**: Layered memory is only trustworthy if retrieval follows the same visibility rules as direct reading. The owner should not need extra setup to use their own memory.

**Independent Test**: Ask a question whose answer exists only in raw memory. Verify that the owner can receive an answer with a raw-memory citation, an Editor receives only content they are permitted to read, and an external visitor receives no internal content or existence hint unless a public page supports the answer.

**Acceptance Scenarios**:

1. **Given** any user asks a question or searches, **When** results are gathered, **Then** each layer is filtered by that user's current permission to read that layer.
2. **Given** the owner or Admin has default full internal access, **When** they ask chat or search a question, **Then** results may include raw records, proposals, formal pages, and public pages without an extra opt-in.
3. **Given** an Editor with limited access, **When** they ask chat or search a question, **Then** results include only the raw records, proposals, formal pages, and public pages they are permitted to read.
4. **Given** a Reader or external visitor, **When** they ask chat or search a question, **Then** results exclude raw memory and proposals unless a specific permission grants access.
5. **Given** any answer includes supporting content, **When** it is displayed, **Then** every citation clearly identifies whether it came from raw memory, a proposal, formal content, or public content.
6. **Given** permissions change while an answer is being prepared, **When** the answer is delivered, **Then** content that is no longer permitted is not shown.

---

### User Story 5 - Review Memory Health Across Layers (Priority: P2)

As the owner or Admin, I want a periodic review of stale raw records, aging proposals, duplicates, contradictions, and orphaned formal pages, so that the memory pipeline stays useful over time.

**Why this priority**: The pipeline can function without maintenance, but its value decays if raw capture and proposals accumulate without review.

**Independent Test**: Seed the wiki with old raw records, overdue proposals, duplicate suggestions, contradictory claims, and an orphaned formal page. Run a maintenance review and verify that all issues are listed without any automatic content changes.

**Acceptance Scenarios**:

1. **Given** raw records older than the configured review age with no proposal, **When** maintenance runs, **Then** they are listed as unprocessed raw memory.
2. **Given** proposals pending longer than the configured review age, **When** maintenance runs, **Then** they are listed as overdue for human review.
3. **Given** duplicate or contradictory content across proposals or formal pages, **When** maintenance runs, **Then** the system flags the issue and leaves resolution to a human reviewer.
4. **Given** a maintenance finding, **When** a reviewer acts on it, **Then** they can resolve, dismiss, or navigate to the affected content without automatic acceptance, deletion, or merging.

### Edge Cases

- A raw memory record is created by an assistant or collaborator whose access is later removed: existing records remain governed by normal permissions, while future writes are denied.
- Multiple raw records match the same formal page at the same time: the system groups or flags them for review rather than creating conflicting silent updates.
- A proposal targets a formal page that has been deleted or moved: the proposal is marked invalid or needs retargeting before acceptance.
- A raw record appears to match multiple formal pages: the proposal shows the competing candidates so a reviewer can choose.
- A formal page becomes public and later receives a new formal revision: the page's current public visibility rule continues to apply unless an Admin changes it.
- A raw citation used in a previous answer is later removed through cleanup: already delivered answers are unchanged, and future retrieval no longer uses that raw record.
- External visitors request content that exists only as raw memory or a proposal: the system behaves as though no permitted content exists and does not reveal internal existence.

## Requirements *(mandatory)*

### Functional Requirements

- **FR-001**: The system MUST support a raw memory layer for unstructured captured records that do not require page, space, or publish decisions at capture time.
- **FR-002**: Raw memory records MUST preserve their original captured content, creator, category, creation time, review status, and any relationship to later proposals.
- **FR-003**: Raw memory records MUST be append-only; corrections MUST be represented as additional records linked to the original.
- **FR-004**: Raw memory visibility MUST be controlled by the same permission principles as the rest of the wiki. By default, the owner and Admins can read all raw memory, Editors can read raw memory they created unless granted more access, Readers and external visitors cannot read raw memory.
- **FR-005**: The system MUST let permitted reviewers pin, promote, or mark raw records for cleanup review.
- **FR-006**: The system MUST support proposal generation from one or more raw memory records.
- **FR-007**: Proposal generation MUST prefer an amendment to an existing formal page when there is a clear content match, and MUST suggest a new page only when no clear match exists.
- **FR-008**: Each proposal MUST identify its source raw records, proposed change type, target page or proposed page location, generated content, current status, and reviewer decision history.
- **FR-009**: Proposal visibility and review actions MUST be permission-controlled. By default, owner/Admin users can review all proposals, and Editors can review proposals only for pages or areas they are allowed to edit.
- **FR-010**: Accepting a proposal MUST create or update formal content only through the normal page review and version history behavior.
- **FR-011**: Rejecting a proposal MUST NOT delete or change its source raw memory.
- **FR-012**: Amendment proposals MUST be marked for recheck when their target formal page changes before acceptance.
- **FR-013**: The system MUST detect and surface overlapping pending proposals that could modify the same topic or page.
- **FR-014**: Formal content MUST remain the reviewed internal wiki layer, subject to existing page visibility, edit permission, revision, and deletion rules.
- **FR-015**: Published/public content MUST be an explicit visibility state for formal pages or areas, not a separate copy that can drift from formal content.
- **FR-016**: New formal pages MUST NOT be publicly visible by default.
- **FR-017**: Chat and search MUST retrieve content from raw, proposal, formal, and public layers only when the requesting user is permitted to read those layers.
- **FR-018**: The owner/Admin default experience MUST include internal retrieval across raw memory, proposals, formal pages, and public pages without additional setup.
- **FR-019**: External visitor retrieval MUST be limited to explicitly public content unless an additional permission grants broader access.
- **FR-020**: Search results, chat citations, and proposal references MUST clearly label the source layer so users can distinguish unreviewed memory, pending proposals, reviewed internal knowledge, and public knowledge.
- **FR-021**: The system MUST re-evaluate permissions before delivering retrieved content if permissions may have changed during processing.
- **FR-022**: The system MUST provide a maintenance review that identifies unprocessed raw memory, overdue proposals, likely duplicates, contradictions, and orphaned formal pages.
- **FR-023**: Maintenance findings MUST require human action for acceptance, deletion, merging, or contradiction resolution.
- **FR-024**: Dismissing a maintenance finding MUST suppress only that finding unless the underlying content changes again.

### Key Entities

- **Raw Memory Record**: An append-only captured note or fact that may later feed one or more proposals. Key attributes include original content, creator, category, creation time, review status, retention status, and proposal links.
- **Proposal**: A reviewable suggestion generated from raw memory. It may amend an existing formal page or propose a new page. Key attributes include source records, target, proposed content, status, reviewer, and decision history.
- **Formal Page**: Reviewed internal wiki content. It remains governed by normal page visibility, edit permission, version history, and deletion behavior.
- **Public Visibility**: The explicit decision that makes selected formal content available to external readers.
- **Maintenance Finding**: A review item that identifies stale, duplicate, contradictory, or orphaned content across the memory layers.

### Assumptions

- A deployment has one owner by default; other accounts are collaborators with Reader, Editor, or Admin responsibilities rather than separate personal workspaces.
- Spaces remain topical or organizational partitions and are not used as per-user memory boundaries.
- Admin and Editor are the roles that can edit pages; proposal acceptance follows the same edit-permission rule.
- AI assistance may help create raw records and proposals, but formal content still requires a permitted human review action before it changes the wiki.
- Public visibility is opt-in and can be revoked.
- Retention periods, match thresholds, and maintenance review ages are configurable policy choices with sensible defaults.

### Out of Scope

- Per-user private workspaces or identity-based wiki partitions.
- Automatic acceptance of proposals into formal content.
- Automatic resolution of contradictions or silent merging of duplicate content.
- Public-safe rewriting or redaction of internal content during publication.
- A full structured knowledge graph or time-travel fact query system.
- Designing a new permissions model separate from the existing wiki permission principles.

## Success Criteria *(mandatory)*

### Measurable Outcomes

- **SC-001**: In usability testing, 90% of permitted users can capture a raw memory record without selecting a page or space in under 30 seconds.
- **SC-002**: In seeded review scenarios, 95% of raw records that clearly relate to an existing formal page are presented as amendment proposals rather than new-page proposals.
- **SC-003**: 100% of proposal-driven formal page changes have a recorded accept action by a user with edit permission.
- **SC-004**: In permission testing, Readers and external visitors have zero successful access to raw memory or proposals unless an explicit permission grants access.
- **SC-005**: In seeded retrieval tests, owner/Admin chat and search results include permitted content from all four layers and label every cited source with its layer.
- **SC-006**: In seeded external-access tests, anonymous or public visitors receive only explicitly public content and receive no indication that internal raw memory or proposals exist.
- **SC-007**: In maintenance testing, the review identifies all seeded stale raw records, overdue proposals, duplicate candidates, contradictions, and orphaned formal pages without automatically changing content.
- **SC-008**: In reviewer workflow testing, 90% of Admin or Editor users can decide whether to accept, reject, or recheck a proposal within 2 minutes when the source raw record and target page are provided.
