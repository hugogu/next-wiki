# Feature Specification: Governed Web Research for Wiki AI

**Feature Branch**: `036-web-research`
**Created**: 2026-08-24
**Status**: Draft
**Input**: User description: "Enable Wiki AI to research the web using a governed, provider-independent search capability, starting with Tavily; preserve verifiable sources and permit deliberate evidence capture."

## User Scenarios & Testing *(mandatory)*

### User Story 1 - Answer with current external evidence (Priority: P1)

An authorized Wiki AI user can explicitly allow a question to use the web when
the Wiki does not contain enough current information. The assistant searches
only when that mode is selected, prefers relevant Wiki evidence first, and
returns an answer that clearly distinguishes Wiki sources from external web
sources.

**Why this priority**: This delivers the primary value: the Wiki remains the
owner's grounding memory while the assistant can safely fill explicitly
requested gaps with up-to-date information.

**Independent Test**: An authorized user asks a current-events or external
research question in web-enabled mode and receives a response with usable,
labelled external source links; the same question in Wiki-only mode makes no
external search request.

**Acceptance Scenarios**:

1. **Given** an authorized user selects Wiki-first web research and the configured
   source service is available, **When** they ask a question whose answer needs
   current external information, **Then** the assistant may obtain bounded
   external evidence and shows each source's title and original link separately
   from Wiki citations.
2. **Given** the same user selects Wiki-only research, **When** they ask the
   question, **Then** the assistant uses only permitted Wiki evidence and its
   own stated limitations, without contacting an external source service.
3. **Given** the Wiki already provides sufficient and relevant evidence in
   Wiki-first web research mode, **When** the user asks a question, **Then**
   the assistant answers from the Wiki and does not perform an unnecessary
   external search.
4. **Given** an external source is used, **When** the answer is displayed,
   **Then** a reader can identify it as an external source and open its original
   address without confusing it with a Wiki page.

---

### User Story 2 - Govern and safely operate external research (Priority: P2)

An administrator can configure the initial external research service, decide
who may use it, and set organization-wide boundaries such as allowed sources,
request limits, and availability. Users receive an understandable indication
before their research request is sent outside the Wiki.

**Why this priority**: External research introduces cost, privacy, reliability,
and prompt-injection risks. It must remain an intentional, controllable
capability rather than a hidden model behavior.

**Independent Test**: An administrator enables a configured research service
for one eligible user, confirms that user can research the web, then disables
the service and confirms that new requests do not leave the Wiki.

**Acceptance Scenarios**:

1. **Given** an administrator has no active external research service,
   **When** a user selects web research, **Then** the user receives a clear
   unavailable message and no external request is made.
2. **Given** a configured service is enabled only for selected users,
   **When** an ineligible user attempts web research, **Then** the request is
   refused without revealing configuration or credentials.
3. **Given** an administrator disables the service or a user's access while a
   request is waiting to start, **When** that request would begin, **Then** it
   does not contact the external service and reports the policy change.
4. **Given** a search would use a source outside the administrator's source
   policy, **When** the assistant evaluates candidates, **Then** it excludes
   that source and does not present it as evidence.

---

### User Story 3 - Preserve selected external evidence (Priority: P3)

A user can deliberately preserve an external source that informed a useful
answer as original evidence in the Wiki. Later readers can inspect that
captured evidence and see its source details before relying on a generated
conclusion.

**Why this priority**: Deliberate capture turns useful, transient research into
portable Wiki memory without automatically retaining every web request or
silently growing the knowledge base.

**Independent Test**: A user completes a web-research answer, chooses one
source to preserve, and can subsequently open a source record that identifies
the original address, retrieval time, content identity, and relationship to
the resulting draft or page revision.

**Acceptance Scenarios**:

1. **Given** a completed web-research answer with external sources, **When** a
   user selects a source for preservation, **Then** the system creates a
   clearly labelled original-evidence record with the source details and does
   not alter or publish any Wiki page.
2. **Given** preserved evidence supports a proposed Wiki change, **When** an
   authorized user reviews the change, **Then** they can navigate from the
   proposal or resulting revision to the preserved evidence.
3. **Given** a user does not explicitly preserve a source, **When** the
   research interaction expires, **Then** the source's retrieved body is not
   retained as durable Wiki knowledge.

### Edge Cases

- The selected research service is missing, disabled, rate-limited, unavailable,
  or exceeds the request's time or source budget: show a recoverable failure
  and retain the Wiki-only answer path where applicable.
- A search has no trustworthy results, all results are excluded by policy, or a
  selected source can no longer be opened: state the limitation rather than
  inventing an answer or citation.
- A web page contains instructions intended to influence the assistant,
  requests credentials, or asks the assistant to alter Wiki content: treat it
  only as untrusted reference material and do not carry out those instructions.
- A source URL redirects, changes after retrieval, is malformed, or uses an
  unsupported protocol: do not follow or cite it unless it remains a permitted
  public source under the configured policy.
- A user cancels a request, exhausts its budget, or loses authorization while it
  is running: stop further external retrieval and show only already-authorized,
  bounded results.
- A user tries to preserve a source whose content cannot be lawfully or safely
  retained: preserve neither the body nor a misleading evidence record, and
  explain why the source cannot be captured.
- A later attempt to create or edit a page is based on external research: it
  remains a separately confirmed Wiki change and is never auto-published.

## Requirements *(mandatory)*

### Functional Requirements

- **FR-001**: The system MUST provide a Wiki AI research mode that uses only
  permitted Wiki knowledge by default and a separately selected Wiki-first web
  research mode for eligible signed-in users.
- **FR-002**: The system MUST show the selected research mode and keep it
  recoverable when a user refreshes, shares, or returns to the same AI
  conversation.
- **FR-003**: The system MUST not contact an external research service unless
  web research is selected, the user is eligible, the service is active, and
  the request remains within the effective policy.
- **FR-004**: Before a user's first external research request in a conversation,
  the system MUST identify the service that will receive the search request and
  state that external sources may process the request.
- **FR-005**: The system MUST send only the minimum request information needed
  for external research; Wiki page bodies, private metadata, credentials, and
  unrelated conversation content MUST NOT be sent to the source service merely
  to perform a search.
- **FR-006**: In Wiki-first web research mode, the assistant MUST prefer
  permitted Wiki evidence and use external research only when the user asks for
  it, asks for freshness, or the available Wiki evidence is insufficient for
  the answer.
- **FR-007**: The system MUST limit every research interaction to the
  administrator's effective number of searches, opened sources, source size,
  and elapsed-time budget; it MUST identify when an answer was limited by one
  of those bounds.
- **FR-008**: The system MUST allow administrators to configure, enable,
  disable, test, and replace the external research service without changing the
  user-facing research modes or invalidating already preserved evidence.
- **FR-009**: The initial external research service MUST be Tavily; the product
  MUST allow a future administrator to select another supported service without
  converting the user's captured evidence or changing citation meaning.
- **FR-010**: Administrators MUST be able to control which users may perform
  web research and independently enable or disable the capability for the
  whole deployment.
- **FR-011**: Administrators MUST be able to set source inclusion and exclusion
  policies that are applied before external sources are offered as evidence.
- **FR-012**: Every external source used in an answer MUST be represented as an
  external citation containing, at minimum, a source title, original address,
  source type, retrieval time, and source identity sufficient to distinguish it
  from other retrieved material.
- **FR-013**: The answer interface MUST render Wiki citations and external
  citations distinctly; an external citation MUST open the original external
  address rather than a Wiki reader route.
- **FR-014**: The system MUST not claim that an external source is a Wiki page,
  a verified fact, or durable Wiki knowledge unless the user has explicitly
  preserved it as evidence.
- **FR-015**: External material MUST be handled as untrusted reference content.
  It MUST NOT independently authorize a Wiki action, alter metadata, create or
  update a page, change permissions, or publish content.
- **FR-016**: A web-research interaction MUST expose only read-only research
  capabilities. Any resulting Wiki draft, edit, or publication MUST begin as a
  separate user-initiated action and follow the normal review and publication
  rules.
- **FR-017**: The system MUST record a privacy-safe operational history for
  each external research attempt, including actor, time, selected service,
  outcome, policy disposition, and bounded usage measures, without permanently
  retaining full search results or external page bodies by default.
- **FR-018**: Retrieved external material that the user has not chosen to
  preserve MUST expire within 24 hours and MUST not enter the durable Wiki
  knowledge corpus.
- **FR-019**: Users with permission to create evidence MUST be able to select
  an external source from a completed answer and explicitly preserve it as an
  original-evidence record. The record MUST retain its original address, title,
  retrieval time, content identity, applicable source details, and a link to
  the research interaction that produced it.
- **FR-020**: Preserving external evidence MUST create neither an implicit Wiki
  page edit nor a public publication. Any generated draft that relies on it
  MUST identify the preserved evidence as provenance.
- **FR-021**: The system MUST gracefully report unavailable, denied, empty,
  expired, timed-out, and policy-blocked research outcomes, while leaving
  ordinary Wiki reading and Wiki-only AI questions usable.
- **FR-022**: When the external research capability is globally disabled, the
  system MUST prevent new external research activity and prevent queued work
  that has not started from contacting an external service.

### Key Entities *(include if feature involves data)*

- **External Research Service**: An administrator-configured source of current
  web research, its availability, permitted use, and operational limits.
- **Research Policy**: The deployment, user, source, budget, and privacy rules
  that decide whether a research request and a candidate source may be used.
- **Research Interaction**: One user-initiated, bounded attempt to supplement
  Wiki evidence with external research, including its status and privacy-safe
  operational history.
- **External Source**: A retrieved public source and its title, original
  address, retrieval details, identity, and policy disposition.
- **External Citation**: The presentation-safe reference from an answer to an
  external source, distinct from a citation to a Wiki page revision.
- **Preserved External Evidence**: An explicitly saved, original-evidence
  record that preserves a selected external source and its provenance for
  future Wiki use.

## Success Criteria *(mandatory)*

### Measurable Outcomes

- **SC-001**: In a test set of 50 permitted web-research questions with an
  available source service, at least 95% complete with either an answer and
  labelled source list or a clear recoverable outcome within 45 seconds.
- **SC-002**: 100% of answers that use external material present at least one
  labelled external citation for each external source represented as supporting
  evidence; each citation opens its original permitted address or clearly
  reports that the source is no longer available.
- **SC-003**: 100% of Wiki-only requests, globally disabled requests, and
  requests from ineligible users produce zero external research attempts.
- **SC-004**: 100% of web-research test runs leave page content, metadata,
  permissions, and publication state unchanged until a user separately confirms
  a normal Wiki mutation.
- **SC-005**: 100% of preserved-evidence records in acceptance testing expose
  their original address, title, retrieval time, source identity, and a
  navigable relationship to the source interaction.
- **SC-006**: When an administrator disables external research, 100% of queued
  but not yet started research requests are stopped before an external source
  is contacted.
- **SC-007**: In usability testing, at least 90% of participants correctly
  identify whether an answer's supporting source is a Wiki page or an external
  web page from the displayed citation treatment alone.

## Assumptions

- The first release is limited to the AI chat experience for signed-in users;
  scheduled jobs, bots, public anonymous chat, and MCP clients do not gain web
  research in this scope.
- Tavily is the initial configured service. Its credentials and connectivity
  are optional; the Wiki and Wiki-only AI behavior remain usable without it.
- Administrators are responsible for choosing a service, source policy, and
  retention practices that meet their local legal, contractual, and network
  obligations.
- The initial release performs bounded search and deliberate retrieval of
  selected public sources. Unbounded crawling, browser automation, arbitrary
  URL fetching, automatic source ingestion, and automatic publication are out
  of scope.
- Existing signed-in AI access remains the prerequisite for research; web
  research adds a separate administrator-controlled entitlement rather than
  broadening ordinary page-read access.
- Existing evidence, revision, permission, audit, and normal publication rules
  remain authoritative for material the user chooses to preserve or use in a
  Wiki change.
