# Feature Specification: Unified Agent Memory Integrations

**Feature Branch**: `040-openclaw-memory-integration`

**Created**: 2026-08-29

**Status**: Draft

**Input**: Redesign the existing Agent Memory capability so Hermes Memory and
OpenClaw Memory use one common, documented server interface. Keep the server
generic, evolve the 039 data model with one database change, and keep public API
documentation synchronized with the implementation.

## User Scenarios & Testing *(mandatory)*

### User Story 1 - Connect Different Agent Products to One Memory Service (Priority: P1)

As a Wiki owner who uses both Hermes and OpenClaw, I want each agent installation
to use the same durable memory service and permission model, so that I do not
have to operate or trust separate memory backends for each product.

**Why this priority**: A common service is the product boundary. Without it,
records, permissions, provenance, and recovery behavior will diverge for every
new agent integration.

**Independent Test**: Provision one Hermes credential and one OpenClaw
connection for the same owner. Save a record through each adapter and verify
that both receive the same form of stable citation while neither can write to
the other's private collection.

**Acceptance Scenarios**:

1. **Given** an owner has configured Hermes and OpenClaw, **When** either
   adapter connects, **Then** it uses the same documented Agent Memory
   interface and receives only the capabilities granted to its credential.
2. **Given** an owner creates two agent connections, **When** each adapter
   saves content, **Then** the content is kept in separately assigned private
   collections unless the owner later shares it deliberately.
3. **Given** an existing Hermes configuration is still in use, **When** the
   common service is extended for OpenClaw, **Then** its ordinary save, recall,
   evidence, status, and forget flows keep working without a client-specific
   server fork.

---

### User Story 2 - Preserve OpenClaw Session Evidence Reliably (Priority: P1)

As an OpenClaw operator, I want selected session material to survive meaningful
lifecycle boundaries and restarts, so that long-running work remains grounded
without making normal conversations wait for the Wiki.

**Why this priority**: OpenClaw's lifecycle observations can be duplicated or
interrupted. Durable external memory is useful only when retries do not create
duplicates and an attempted delivery is not mistaken for a saved record.

**Independent Test**: Enable capture for an OpenClaw agent, temporarily make
the Wiki unavailable across a compaction and restart, then verify that recovery
creates one attributable evidence record per event and that the completed turn
was never blocked.

**Acceptance Scenarios**:

1. **Given** capture is disabled, **When** an OpenClaw session ends or
   compacts, **Then** no session content is sent to the Wiki; explicit saves
   remain available.
2. **Given** capture is enabled, **When** a supported lifecycle event occurs,
   **Then** the bridge records a restart-safe delivery intent before returning
   and later reports success only after the service confirms durable evidence.
3. **Given** a capture is retried, duplicated, interrupted, or resumed after a
   credential rotation, **When** the common service receives it, **Then** it
   produces at most one durable record for that event and returns safe status
   information.
4. **Given** a runtime does not provide a reliable compaction veto, **When** a
   pre-compaction observation occurs, **Then** the bridge reports its actual
   preservation state and never claims that compaction was blocked or evidence
   was durably stored before confirmation.

---

### User Story 3 - Deliberately Share External Context (Priority: P2)

As a Wiki owner, I want to permit one agent to retrieve selected knowledge from
another agent while keeping both agents' private memory private by default, so
that cross-agent continuity does not become a broad data leak.

**Why this priority**: Sharing is valuable only when it is explicit,
reversible, and does not weaken the private-by-default boundary established for
the primary connection flow.

**Independent Test**: Save a decision for agent A, place an owner-curated copy
in a shared collection, grant agent B read access, and verify that B receives a
bounded citation while an ungranted agent cannot distinguish that collection
from an absent one.

**Acceptance Scenarios**:

1. **Given** no owner grant exists, **When** an agent retrieves external
   memory, **Then** it receives only its own private records.
2. **Given** the owner grants an agent access to a shared collection, **When**
   the agent requests permitted external context, **Then** it receives only
   bounded, cited records from that collection.
3. **Given** the grant, source collection, connection, or record changes after
   candidate selection, **When** a result is about to be returned, **Then** the
   now-ineligible result is omitted without exposing its title, excerpt, count,
   citation, or a grant-specific error.
4. **Given** the owner wants to make a private record shared, **When** they
   curate it, **Then** a separately attributable shared record is created; an
   agent capture never publishes or shares a record automatically.

---

### User Story 4 - Keep Local Agent Memory and Migrate Deliberately (Priority: P2)

As an OpenClaw operator, I want external Wiki memory to coexist with native
local memory and have a reviewed one-time import path, so that adopting the
integration does not replace local behavior or silently ingest sensitive
history.

**Why this priority**: The Wiki is a durable shared layer, not a replacement
for a product's local working-memory implementation. Historical material needs
an explicit privacy decision.

**Independent Test**: Enable the external-memory bridge next to a configured
local memory provider, run an external search, and confirm the local provider
is unchanged. Preview a selected local-memory import and verify that no source
file or Wiki record changes until approval.

**Acceptance Scenarios**:

1. **Given** OpenClaw has a local memory provider, **When** the external bridge
   is enabled, **Then** the local provider remains available and the bridge is
   a separately labelled optional capability.
2. **Given** an operator has selected legacy local-memory material, **When**
   they preview an import, **Then** they see the proposed items and privacy
   implications without creating or changing records.
3. **Given** the operator explicitly approves an import, **When** it is
   interrupted and resumed, **Then** every accepted item is attributable,
   idempotent, and does not require changing the source files.

### Edge Cases

- A client credential is rotated, revoked, or no longer bound while a capture
  is pending.
- An adapter retries the same request with a different body or source event.
- An adapter omits or forges an agent, destination, share, page path, or local
  session identifier.
- A shared-read grant expires or is revoked while a result is being assembled.
- A backing restricted page or its cited revision has been deleted or made
  unavailable.
- The Gateway stops before all local delivery entries can be sent.
- An OpenClaw lifecycle event lacks the content or correlation fields required
  by the configured capture mode.
- A local-memory import is malformed, duplicated, oversized, or includes data
  that the operator excludes.

## Requirements *(mandatory)*

### Functional Requirements

- **FR-001**: The system MUST provide one product-neutral Agent Memory service
  and one documented integration interface for Hermes, OpenClaw, and future
  adapters. Server storage, authorization, audit terminology, and public
  resources MUST NOT be named for a particular agent product.
- **FR-002**: The common interface MUST extend the existing Hermes-compatible
  behavior rather than require a second product-specific server interface.
  Existing ordinary Hermes memory operations MUST remain usable during the
  extension.
- **FR-003**: The system MUST resolve an active connection, its owner, and its
  private memory destination from the authenticated credential. An adapter MUST
  NOT select an owner, destination, share, page path, or effective agent
  identity through a request value.
- **FR-004**: One owner MUST be able to create multiple isolated agent
  connections. Normal save and capture operations MUST target only the calling
  connection's private destination.
- **FR-005**: The owner MUST be able to grant and revoke read access from a
  connection to a shared destination. Shared status alone MUST NOT grant
  access, and agents MUST NOT create, change, or select grants.
- **FR-006**: Memory, source evidence, and owner-curated shared knowledge MUST
  use the normal restricted content, immutable revision, provenance, indexing,
  and audit lifecycle. Integration metadata MUST NOT become a second canonical
  copy of a memory body.
- **FR-007**: The common service MUST preserve source type, creation origin,
  producing connection, stable source reference, and supporting evidence for
  every durable item where applicable. Owner curation MUST create a new
  attributable record rather than change an original source.
- **FR-008**: The common interface MUST support bounded recall, explicit save,
  evidence capture, capture-status inspection, and reversible forgetting.
  Forgetting MUST remove a record from recall without deleting immutable source
  evidence.
- **FR-009**: The service MUST authorize every operation and re-evaluate
  eligibility immediately before returning a recall result. Ineligible material
  MUST NOT leak through result bodies, excerpts, titles, counts, citations, or
  distinguishable errors.
- **FR-010**: Evidence capture MUST be idempotent and asynchronous. A durable
  result MAY be reported only after the canonical restricted revision and its
  memory record are committed.
- **FR-011**: Hermes-specific setup, tools, and checkpoint behavior MUST stay
  in the Hermes adapter. The server MUST expose only the common service
  contract and must not require Hermes at runtime.
- **FR-012**: OpenClaw-specific lifecycle observation, configuration,
  permission handling, local retry state, and prompt integration MUST stay in
  a separately installable OpenClaw adapter. The server MUST not require an
  OpenClaw runtime, plugin, local workspace, or Gateway state.
- **FR-013**: The OpenClaw adapter MUST not replace or invoke OpenClaw's local
  memory provider. External retrieval and optional context enrichment MUST be
  clearly labelled, explicitly enabled, bounded, and safe to omit.
- **FR-014**: Automatic OpenClaw capture MUST be disabled by default. When
  enabled, it MUST use only supported lifecycle observations, retain pending
  content locally only within bounded recovery limits, and perform a bounded
  best-effort shutdown flush.
- **FR-015**: The system MUST apply bounded lifetime and access controls to
  transient capture payloads and local delivery state. Destination-specific
  long-term retention or archival policy management is out of scope for this
  feature; canonical content follows the Wiki's existing retention rules.
- **FR-016**: A local-memory import capability, if enabled, MUST be separate
  from continuous capture, require explicit source selection and approval,
  support safe resume, preserve provenance, and never remove or alter source
  files.
- **FR-017**: Every public interface change MUST be described by the project's
  generated API documentation. Runtime validation, route documentation, and
  generated documentation MUST be verified together so they cannot silently
  drift.
- **FR-018**: The system MUST add collision-safe, idempotent public guidance
  for OpenClaw alongside generic Agent Memory guidance. Guidance MUST contain
  placeholders and safe operating instructions only; live connection state,
  destinations, agent names, and credentials remain authenticated.

### Public Content Delivery

- The feature changes only the managed generic Agent Memory guide and adds an
  OpenClaw integration guide. Both are normal published Wiki documents with
  static/ISR public representations.
- A successful creation or update invalidates only the affected guide and its
  help-navigation representation. Collision, disabled, or failed updates do
  not invalidate public content. Connection, grant, capture, audit, and memory
  data are authenticated and never part of a public representation.

### Key Entities

- **Memory destination**: An owner-controlled private or shared collection of
  Agent Memory records. It is a permission boundary, not a separate content
  store.
- **Agent connection**: A stable, revocable identity for one external agent
  installation, independent of credentials that may be rotated.
- **Connection credential**: A dedicated credential bound to one connection;
  it grants operations but does not itself define the durable agent identity.
- **Read grant**: An owner-created, revocable permission allowing one
  connection to retrieve from one shared destination.
- **Memory record**: A recallable projection pointing to one immutable,
  restricted source revision, with origin and producer attribution.
- **Evidence capture**: An idempotent delivery record for transient selected
  evidence until it becomes a durable Memory record.

## Success Criteria *(mandatory)*

### Measurable Outcomes

- **SC-001**: An owner can connect one Hermes installation and two OpenClaw
  installations to one Wiki, save through each, and verify private-destination
  isolation in an end-to-end test.
- **SC-002**: A duplicated or restarted OpenClaw capture produces no more than
  one durable cited evidence record for the same capture identity in 100
  consecutive retry simulations.
- **SC-003**: Revoking a shared-read permission before response serialization
  produces no protected record metadata in the caller's response in all
  authorization regression tests.
- **SC-004**: A normal OpenClaw completed turn remains independent of remote
  Wiki availability; its capture intent is recorded locally within the
  configured bounded delivery budget.
- **SC-005**: Generated API documentation contains every Agent Memory route
  and its request/response schemas, and the documentation-sync test passes in
  continuous integration.
- **SC-006**: An operator can install, configure, diagnose, rotate, and disable
  the OpenClaw bridge without placing a credential in a command line, ordinary
  configuration output, or published guide.

## Assumptions

- The existing 039 Agent Memory tables and Hermes adapter are the starting
  point. Existing rows do not require automatic data migration when their
  semantics cannot be safely converted.
- The existing versioned Agent Memory interface remains the common interface;
  extensions are additive and capability-discoverable.
- The default deployment continues to use its existing database, content
  storage, and background-job facilities; no new required service is added.
- OpenClaw lifecycle hooks are observational and at-least-once. They cannot be
  treated as a compaction veto or as proof of remote durability.
- Per-destination long-term retention policy is deliberately deferred. Bounded
  cleanup of transient capture material remains mandatory.
