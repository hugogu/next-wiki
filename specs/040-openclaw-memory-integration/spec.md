# Feature Specification: OpenClaw Agent Memory Bridge

**Feature Branch**: `040-openclaw-memory-integration`

**Created**: 2026-08-29

**Status**: Draft

**Input**: Add OpenClaw as a second adapter to the existing 039 Agent Memory
service, alongside Hermes. Ship a separately installable OpenClaw plugin that
persists selected session material without ever blocking a conversation turn
on the Wiki being reachable.

## Scope

The 039 Agent Memory service already provides everything a single-owner,
single-Wiki deployment needs to connect multiple agent installations: a
generic `/api/v1/memory/*` REST contract, a "Memory provider" API-key preset
in User Center that binds a key to its own private destination, and an
existing **share this destination with another key** option. Recall is
isolated per `(destination, agent identity)`, so sharing a destination alone
only groups keys for administration; an owner who wants two of their own
agents to actually draw on the same memory also gives both keys the same
agent identity. None of that needs to change.

What's actually missing is an OpenClaw-side integration: nothing today lets
an OpenClaw Gateway install persist session material into that existing
service. This feature adds exactly that — a hook-only OpenClaw plugin
(`@next-wiki/openclaw-memory-bridge`) — and nothing else. It deliberately does
**not** introduce a new sharing/grant model, a separate "connection" identity
distinct from the API key, or a local-memory import tool: the first two
already exist in a simpler form, and the third has no real adopter yet to
justify building it (tracked as a future addition, not in this feature).

## User Scenarios & Testing *(mandatory)*

### User Story 1 - Use the Same Memory Service OpenClaw Already Uses for Hermes (Priority: P1)

As a Wiki owner who uses both Hermes and OpenClaw, I want each agent
installation to use the same durable memory service and permission model, so
that I do not have to operate or trust separate memory backends for each
product.

**Why this priority**: A common service is the product boundary. Without it,
records, permissions, provenance, and recovery behavior diverge for every new
agent integration.

**Independent Test**: Provision one Hermes-bound API key and one
OpenClaw-bound API key for the same owner (as two independent destinations,
or the same destination via the existing shared-destination option). Save a
record through each adapter and verify each receives the same form of stable
citation.

**Acceptance Scenarios**:

1. **Given** an owner has configured Hermes and OpenClaw, **When** either
   adapter connects, **Then** it uses the same documented Agent Memory
   interface and receives only the capabilities granted to its key's scopes.
2. **Given** an owner creates two separate memory-provider keys without
   choosing to share a destination, **When** each adapter saves content,
   **Then** the content stays in its own destination, invisible to the other
   key's default recall.
3. **Given** an existing Hermes configuration is in use, **When** OpenClaw is
   added, **Then** Hermes's ordinary save, recall, evidence, status, and
   forget flows keep working unchanged.

---

### User Story 2 - Preserve OpenClaw Session Evidence Reliably (Priority: P1)

As an OpenClaw operator, I want selected session material to survive
meaningful lifecycle boundaries and restarts, so that long-running work
remains grounded without making normal conversations wait for the Wiki.

**Why this priority**: OpenClaw's lifecycle observations can be duplicated or
interrupted. Durable external memory is useful only when retries do not
create duplicates and an attempted delivery is not mistaken for a saved
record. This is the actual new capability this feature ships.

**Independent Test**: Enable capture for an OpenClaw agent, temporarily make
the Wiki unavailable across a compaction and restart, then verify that
recovery creates one attributable evidence record per event and that the
completed turn was never blocked.

**Acceptance Scenarios**:

1. **Given** capture is disabled, **When** an OpenClaw session ends or
   compacts, **Then** no session content is sent to the Wiki; explicit saves
   remain available through the optional tools.
2. **Given** capture is enabled, **When** a supported lifecycle event occurs,
   **Then** the bridge records a restart-safe delivery intent before
   returning and later reports success only after the service confirms
   durable evidence.
3. **Given** a capture is retried, duplicated, or interrupted and resumed,
   **When** the common service receives it, **Then** it produces at most one
   durable record for that event and returns safe status information.
4. **Given** a runtime does not provide a reliable compaction veto, **When**
   a pre-compaction observation occurs, **Then** the bridge reports its
   actual preservation state and never claims that compaction was blocked or
   evidence was durably stored before confirmation.

### Edge Cases

- A client credential is rotated or revoked while a capture is pending.
- An adapter retries the same request with a different body or source event.
- The Gateway stops before all local delivery entries can be sent.
- An OpenClaw lifecycle event lacks the content or correlation fields
  required by the configured capture mode.

## Requirements *(mandatory)*

### Functional Requirements

- **FR-001**: OpenClaw MUST use the same generic, already-documented
  `/api/v1/memory/*` interface Hermes uses. No OpenClaw-specific server route,
  table, or column is introduced.
- **FR-002**: The existing per-key destination resolution (a credential
  resolves to exactly one bound destination, optionally shared with another
  key at creation time) is unchanged and sufficient; this feature adds no new
  authorization concept.
- **FR-003**: OpenClaw-specific lifecycle observation, configuration, local
  retry state, and prompt integration MUST stay in a separately installable
  OpenClaw plugin package. The server MUST NOT require an OpenClaw runtime,
  plugin, local workspace, or Gateway state.
- **FR-004**: The OpenClaw plugin MUST NOT replace or invoke OpenClaw's local
  memory provider. It is a hook-only, non-capability plugin that never claims
  the exclusive memory slot.
- **FR-005**: Automatic OpenClaw capture MUST be disabled by default. When
  enabled, it MUST use only supported lifecycle observations, retain pending
  content locally only within the recovery limits defined in Bounded Limits,
  and perform a best-effort shutdown flush within the same local delivery
  budget.
- **FR-006**: Every public interface the plugin depends on is already
  described by the project's generated API documentation; this feature adds
  no new route requiring new documentation.
- **FR-007**: The system MUST add one collision-safe, idempotent public guide
  for OpenClaw, alongside the existing Hermes guide.

### Bounded Limits

- **Local outbox** (OpenClaw bridge): at most 500 pending entries per key,
  each at most 256 KB; an entry not durably delivered within 7 days is
  dropped and only its count is logged, never its content.
- **Local delivery budget**: a lifecycle hook MUST persist its local outbox
  entry within 200 ms so a conversation turn or compaction is never
  network-bound.
- **Delivery retry**: failed delivery attempts back off exponentially,
  starting at 5 seconds and capped at 10 minutes between attempts, until the
  7-day outbox TTL above is reached.

### Key Entities

No new entities. This feature reuses the existing 039 model unchanged:

- **Memory destination** (`agent_memory_namespaces`): an owner-controlled
  collection of Agent Memory records, optionally bound to more than one API
  key when the owner chooses to share it at key-creation time.
- **Key binding** (`agent_memory_key_bindings`): resolves one API key to its
  destination and agent identity.
- **Memory record** (`agent_memory_records`): a recallable projection
  pointing to one immutable, restricted source revision.
- **Evidence capture** (`agent_memory_captures`): an idempotent delivery
  record for transient selected evidence until it becomes a durable memory
  record.

## Success Criteria *(mandatory)*

### Measurable Outcomes

- **SC-001**: An owner can connect one Hermes installation and one OpenClaw
  installation to one Wiki, save through each, and verify destination
  isolation (or intentional sharing, if configured) in an end-to-end test.
- **SC-002**: A duplicated or restarted OpenClaw capture produces no more
  than one durable cited evidence record for the same capture identity in
  100 consecutive retry simulations.
- **SC-003**: A normal OpenClaw completed turn remains independent of remote
  Wiki availability; its capture intent is recorded locally within the
  200 ms local delivery budget defined in Bounded Limits.
- **SC-004**: An operator can install, configure, diagnose, and rotate the
  OpenClaw bridge's key without placing a credential in a command line,
  ordinary configuration output, or published guide.

## Assumptions

- The existing 039 Agent Memory tables, routes, and Hermes adapter are the
  unmodified starting point. No schema migration is part of this feature.
- OpenClaw lifecycle hooks are observational and at-least-once. They cannot
  be treated as a compaction veto or as proof of remote durability.
- A local-memory import tool (importing an operator's pre-existing local
  OpenClaw memory) is explicitly out of scope. Revisit only once the bridge
  has real adopters who need it — see the "Not building yet" note below.

## Not building yet

An earlier draft of this feature added a full multi-tenant sharing model
(separate connection identity from credential, owner-granted/revocable read
grants, curated promotion into a shared destination) and a local-memory
import utility. Both were removed after review: the sharing problem they
solved was already solved more simply by the existing shared-destination
option on key creation, and the import tool has no current adopter to build
it for. If either becomes genuinely needed later, design it against the
concrete need at that time rather than speculatively now.
