# Feature Specification: OpenClaw Shared Memory Bridge

**Feature Branch**: `040-openclaw-memory-integration`

**Created**: 2026-08-28

**Status**: Draft

**Input**: User description: "参考 Mino Externalized Memory Architecture 及 OpenClaw 插件文档，给出可用于 OpenClaw 记忆外部化的集成方案。多个智能体共享一个公共、通用的服务端；只有插件层负责 OpenClaw 适配。"

**Source material**:

- [Mino Externalized Memory Architecture](https://kb.hugogu.cn/wiki/reflections/meta/2026-08-27-mino-externalized-memory-architecture)
- [OpenClaw: Building plugins](https://docs.openclaw.ai/plugins/building-plugins)
- [OpenClaw: Plugin architecture](https://github.com/openclaw/openclaw/blob/main/docs/plugins/architecture.md)
- [OpenClaw: Plugin hooks](https://docs.openclaw.ai/plugins/hooks)

## User Scenarios & Testing *(mandatory)*

### User Story 1 - Connect an OpenClaw Agent to Shared Durable Memory (Priority: P1)

As a next-wiki owner operating several OpenClaw agents, I want to connect each
agent through a separately installed bridge, so that all agents use one durable
memory service without the service becoming specific to OpenClaw or to any one
agent.

**Why this priority**: A client-neutral server boundary is the foundation for
cross-agent memory and prevents every future agent integration from recreating
storage, authorization, and provenance behavior.

**Independent Test**: Create two separately configured agent connections for
the same owner, save a record through each one, and confirm that both records
are inspectable in the same Wiki while each connection has only its assigned
write destination.

**Acceptance Scenarios**:

1. **Given** a Wiki owner has created an Agent Memory connection for an
   OpenClaw agent, **When** the bridge verifies its connection, **Then** the
   server identifies the agent and its memory destination from the connection
   itself rather than from a client-supplied path or agent name.
2. **Given** two OpenClaw agents use the same Wiki, **When** each saves or
   captures memory, **Then** both use the common Agent Memory service and
   content lifecycle while neither can write to the other's private destination.
3. **Given** a future non-OpenClaw agent needs the same memory behavior,
   **When** it connects through its own adapter, **Then** it can use the same
   server contract and security model without an OpenClaw-specific server path,
   storage type, or permission exception.

---

### User Story 2 - Preserve Reliable Session Evidence (Priority: P1)

As an OpenClaw operator, I want selected session material to be durably
externalized at meaningful lifecycle boundaries, so that useful long-term
memory and its original evidence survive compaction, resets, and process
restarts without making normal conversations wait on the Wiki.

**Why this priority**: Externalization is valuable only if it preserves the
information that would otherwise be lost and remains trustworthy when delivery
is delayed or retried.

**Independent Test**: Enable automatic capture for one agent, run a session
through a compaction and a normal end, temporarily make the Wiki unavailable,
and confirm that a later retry produces one attributable evidence record per
capture event without blocking the completed conversation.

**Acceptance Scenarios**:

1. **Given** automatic capture is enabled, **When** OpenClaw reaches a
   supported compaction, session-end, or shutdown boundary, **Then** the bridge
   preserves the configured summary or source snapshot with agent, session,
   time, and capture provenance.
2. **Given** capture has not been explicitly enabled, **When** an OpenClaw
   session runs, **Then** the bridge does not persist session content; an
   explicitly requested memory save remains available.
3. **Given** a delivery attempt is interrupted, duplicated, or completes after
   a restart, **When** the same capture is retried, **Then** the durable memory
   service records it at most once and reports a safe, recoverable status.
4. **Given** a configured pre-compaction preservation check cannot complete,
   **When** the OpenClaw runtime can enforce that check, **Then** the bridge
   reports that protection could not be verified rather than claiming that the
   source was saved.

---

### User Story 3 - Retrieve Cross-Agent Context Without Replacing Local Memory (Priority: P2)

As an OpenClaw agent user, I want the agent to find permitted memories created
by other agents while retaining its own fast local working memory, so that I
can resume work across assistants without losing the behavior of OpenClaw's
native memory facilities.

**Why this priority**: Cross-agent retrieval is the user-visible benefit of
the shared store, but it must not introduce loops, prompt bloat, or regress the
local memory experience.

**Independent Test**: Save a decision through agent A, configure agent B with
read access to that decision, and verify that B can retrieve a cited result
while agent A's local memory search continues to work independently.

**Acceptance Scenarios**:

1. **Given** an agent has permission to read selected shared or other-agent
   memory, **When** the user or model explicitly requests external memory,
   **Then** the bridge returns only bounded, cited, permitted results and never
   includes the calling agent's own destination by default.
2. **Given** an operator enables automatic cross-agent context, **When** a
   supported OpenClaw turn begins, **Then** the bridge may add a bounded,
   clearly labelled external-memory context only after the runtime has granted
   the required authority for that turn.
3. **Given** external recall is unavailable, unauthorized, empty, or exceeds
   its budget, **When** the OpenClaw turn continues, **Then** local memory and
   the normal conversation continue without fabricated context or a claim that
   external memory was consulted.
4. **Given** a memory is private, forgotten, or outside a granted share,
   **When** another agent searches, **Then** its existence, title, excerpt,
   count, and citation are not disclosed.

---

### User Story 4 - Govern Sharing, Privacy, and Recovery (Priority: P2)

As a Wiki owner, I want to decide exactly what each agent may write and read,
including deliberately shared knowledge, so that a compromised or misconfigured
bridge cannot turn a multi-agent memory system into a broad data leak.

**Why this priority**: The bridge handles highly personal conversation content
and OpenClaw plugins run with the trust level of the Gateway process.

**Independent Test**: Grant agent B read access to one shared collection but
not agent A's private collection, attempt reads and writes with both valid and
revoked credentials, and inspect the resulting audit history and recovery
guidance.

**Acceptance Scenarios**:

1. **Given** an owner configures an agent connection, **When** they grant its
   access, **Then** write authority is limited to its assigned destination and
   cross-agent reading is limited to explicit owner-approved shares.
2. **Given** an owner revokes a connection or disables a destination, **When**
   the bridge next calls the service, **Then** it is denied before protected
   content is returned or changed and the bridge gives a credential-safe repair
   instruction.
3. **Given** the bridge records an operation or failure, **When** the owner
   reviews the Wiki audit surfaces, **Then** they can identify the agent,
   operation, destination, and safe outcome without seeing credentials,
   prompts, raw tool output, or protected content in audit metadata.
4. **Given** a plugin package requires access to conversations or prompt
   enrichment, **When** it is installed or enabled, **Then** the required
   permissions are explicit, the operator can disable the integration, and the
   guide explains the in-process trust boundary.

---

### User Story 5 - Migrate and Operate the Integration Safely (Priority: P3)

As an OpenClaw operator with existing local memory files and session records,
I want a one-time migration path and clear operating guidance, so that I can
adopt shared memory without silently importing sensitive history or depending
on undocumented manual configuration.

**Why this priority**: Continuous synchronization and historical import have
different risk profiles; separating them makes the ordinary bridge small and
keeps import reviewable.

**Independent Test**: Run a preview of a legacy-memory migration, confirm it
does not change local or Wiki content, approve a selected import, and verify
that every imported item has source attribution and can be excluded from future
recall without deleting its evidence.

**Acceptance Scenarios**:

1. **Given** an operator wants to import legacy OpenClaw memory, **When** they
   run the migration preview, **Then** it shows the proposed source categories,
   destinations, and privacy implications without writing anything.
2. **Given** an operator explicitly approves an import, **When** it completes,
   **Then** imported entries are attributable to their original source and use
   the same common Agent Memory lifecycle as newly captured material.
3. **Given** a new operator follows the published guide, **When** they install,
   configure, verify, upgrade, rotate credentials, or disable the bridge,
   **Then** they can complete the flow without placing a secret in a command
   line, normal configuration output, or documentation example.

### Edge Cases

- The Wiki is reachable from a browser but not from the Gateway host, such as
  through a container-only address, DNS failure, proxy error, or invalid
  transport configuration.
- An OpenClaw lifecycle event is not emitted by the active harness, lacks an
  agent/session identifier, arrives more than once, or its observation timeout
  expires while a later event is already running.
- The Gateway stops while local capture work is pending. Shutdown may end
  before all work is delivered, so the next startup must reconcile safely
  rather than treating an attempted flush as confirmation.
- An agent is renamed, recreated, or configured with an identifier that
  conflicts with an existing destination; an identifier supplied by the bridge
  must never silently change the server-side binding.
- A sharing rule changes, a record is forgotten, or a destination is disabled
  between result selection and external-context use.
- A requested automatic context is too large, irrelevant, unsupported by the
  active OpenClaw runtime, or blocked by its tool/prompt authority; it must be
  omitted safely rather than partially injected.
- Local OpenClaw memory search, its indexes, or an embedding provider are
  absent or unavailable; external memory remains separately diagnosable and
  does not become a hidden replacement.
- A legacy import contains duplicate, malformed, private, or oversized source
  material, or the import is resumed after an interrupted run.

## Requirements *(mandatory)*

### Functional Requirements

#### Generic Agent Memory Service

- **FR-001**: The system MUST provide one client-neutral Agent Memory service
  for all supported agent products. Its public behavior, stored entities,
  authorization rules, and audit terminology MUST NOT be named for OpenClaw.
- **FR-002**: The system MUST make every Agent Memory connection resolve to an
  immutable owner-authorized agent identity and memory destination. Client
  configuration, requested path, and requested share MUST NOT be authorization
  inputs.
- **FR-003**: The system MUST let one owner create multiple independent agent
  connections against the same Wiki and must keep their private write
  destinations isolated by default.
- **FR-004**: The system MUST support an owner-managed shared-memory boundary.
  An agent may read only its own destination plus explicitly granted shared or
  other-agent destinations; an agent MUST NOT write to a shared destination
  without a separate owner-authorized grant.
- **FR-005**: The system MUST store memory, source evidence, and generated
  summaries through the normal restricted content, revision, provenance,
  indexing, retention, and audit lifecycle. Integration metadata may identify
  records and delivery state but MUST NOT become a duplicate canonical copy of
  the memory body.
- **FR-006**: The system MUST preserve whether a captured item is original
  evidence or generated synthesis, which agent/session created it, when it was
  captured, and which source records support it.
- **FR-007**: The system MUST offer bounded recall, explicit save, evidence
  capture, capture-status inspection, and reversible forgetting through the
  common service. Recall results MUST have a stable source reference; forgetting
  MUST remove the item from recall without deleting immutable evidence.
- **FR-008**: The system MUST evaluate access at each operation and again before
  returning a recall result. Unauthorized material MUST not leak through result
  bodies, excerpts, counts, titles, citations, error distinctions, or timing
  hints intended for normal users.
- **FR-009**: The system MUST make normal capture delivery idempotent and
  asynchronous from the bridge's completed-turn path. It MUST expose a durable
  outcome that lets a bridge retry safely after timeout, restart, or duplicate
  event delivery.
- **FR-010**: The system MUST operate without a configured Wiki model provider
  and MUST add no required service, queue, cache, or deployment component to a
  default next-wiki installation.

#### OpenClaw Bridge Adapter

- **FR-011**: The OpenClaw integration MUST be distributed as a separately
  installable native bridge plugin with an explicit manifest, compatibility
  declaration, configuration schema, and declared ownership of every exposed
  runtime surface.
- **FR-012**: The bridge MUST contain all OpenClaw-specific lifecycle handling,
  prompt integration, configuration adaptation, and local delivery-retry
  behavior. The shared service MUST NOT load, discover, or rely on an OpenClaw
  runtime, plugin, workspace file, or local Gateway state.
- **FR-013**: The bridge MUST use supported OpenClaw lifecycle observation to
  capture configured compaction and session boundaries. It MUST treat those
  observations as at-least-once inputs and must not assume that a callback is a
  durable queue or a veto of compaction.
- **FR-014**: Automatic capture MUST be disabled by default. When enabled, the
  operator MUST be able to select summary-level capture and, separately,
  original-evidence capture before a lossy boundary; the bridge MUST describe
  the privacy and storage effect of each choice.
- **FR-015**: The bridge MUST keep a bounded, restart-safe local delivery state
  for pending captures, retry transient failures with stable request identity,
  and perform only a bounded best-effort flush during Gateway shutdown. It MUST
  never report a memory as saved until the shared service confirms durability.
- **FR-016**: The bridge MUST provide an optional external-memory query tool
  that is explicitly enabled by the operator. The tool MUST return only the
  calling connection's permitted results, preserve citations, bound output, and
  exclude the caller's own destination unless the operator deliberately enables
  it.
- **FR-017**: The bridge MUST NOT call or wrap OpenClaw's model-facing local
  memory tools. OpenClaw local memory remains an independent low-latency working
  memory layer; external retrieval is a separate, clearly labelled capability.
- **FR-018**: The bridge MAY offer automatic external-context enrichment only
  for OpenClaw runtimes that explicitly support it and only when the operator
  enables the required conversation and prompt permissions. It MUST use the
  runtime's authorized prompt-enrichment phase, apply a configurable size and
  result bound, and fail open to a normal turn when retrieval is unavailable.
- **FR-019**: The bridge MUST not send raw content to the shared service from
  model-call telemetry or other hooks that do not promise the required content
  semantics. It MUST validate and redact selected content according to the
  owner-configured policy before capture.
- **FR-020**: The bridge MUST surface a safe status and diagnostic report that
  distinguishes package compatibility, configuration completeness, reachability,
  authorization, pending delivery, and last durable outcome without exposing
  credentials or protected content.
- **FR-021**: The bridge documentation MUST state that native plugins run in
  the Gateway process, list every required permission and optional tool, and
  provide install, enable, inspection, upgrade, disable, credential rotation,
  and incident-recovery steps.

#### Lifecycle, Sharing, and Migration

- **FR-022**: The first continuous-release bridge MUST be useful with capture
  alone; cross-agent query and automatic context enrichment MUST remain
  independently enableable so an operator can adopt them later without changing
  stored data or connection identity.
- **FR-023**: The system MUST represent three memory roles consistently:
  immutable original evidence, generated/reviewable synthesis, and deliberately
  curated shared knowledge. Promotion from a private agent destination to a
  shared role MUST be an explicit, attributable action and never an automatic
  side effect of capture.
- **FR-024**: A one-time OpenClaw migration capability MUST be separate from
  the continuous bridge. It MUST require an explicit source selection and
  destination, support preview and resumable execution, preserve source
  provenance, and never remove local source files or history.
- **FR-025**: The system MUST support retention and archival policies without
  weakening the availability of citations for still-recallable material. A
  policy change MUST not silently expand another agent's access.
- **FR-026**: The system MUST record safe provider attribution for every
  accepted, rejected, or durable Agent Memory operation. Owner-facing audit and
  diagnostics MUST not include secrets, raw prompts, raw tool output, or memory
  bodies.
- **FR-027**: The system MUST publish a managed OpenClaw integration guide
  alongside the existing Agent Memory documentation. The guide MUST be
  collision-safe and idempotent, link from generated help content, and use
  placeholders rather than live endpoints or credentials.

### Public Content Delivery

- The feature adds an optional published OpenClaw bridge guide and a
  discoverability link from the generated Agent Memory help material. Both are
  normal public Wiki documents and may contain only generic configuration and
  security guidance; connection state, destinations, agent names, audit data,
  and credentials remain authenticated.
- Creating or updating the managed guide MUST use the normal published-document
  representation and invalidate only the changed guide and help-navigation
  representations after a successful governed update. A collision, disabled
  guide, or failed update MUST leave existing public content and cache state
  unchanged.

### Key Entities

- **Agent Memory Connection**: An owner-authorized, revocable identity that
  binds one external agent to its memory destination and allowed operations.
- **Memory Destination**: The server-enforced private or shared boundary that
  determines which Agent Memory records an external connection may read or
  write. It is not a separate content store.
- **Memory Record**: A durable, recallable item with a stable source reference,
  provenance, visibility, and reversible recall state.
- **Evidence Record**: Restricted original material captured from a session or
  import and linked to the memory or synthesis it supports.
- **Shared Memory Grant**: An owner-managed permission allowing a connection to
  read a specified shared or other-agent destination without granting write
  access.
- **Capture Delivery**: A uniquely identified attempt to preserve a configured
  lifecycle snapshot, with pending, durable, and safe failure outcomes.
- **OpenClaw Memory Bridge**: The separately installed adapter that translates
  OpenClaw lifecycle events and optional model tools into the common Agent
  Memory service; it is not the service's authorization boundary.
- **Migration Run**: A separately initiated, reviewable import of selected
  legacy OpenClaw material into the standard memory and evidence lifecycle.

## Success Criteria *(mandatory)*

### Measurable Outcomes

- **SC-001**: In an acceptance environment, an owner can connect two OpenClaw
  agents to one Wiki, verify isolated writes, and retrieve an explicitly shared
  cited record in 15 minutes or less using only the supplied guide.
- **SC-002**: In a test with at least 100 independently configured agent
  connections on one Wiki, 100% of attempted writes remain within the
  server-assigned destination and no unauthorized read reveals any result
  metadata.
- **SC-003**: In lifecycle, retry, and restart tests, 100% of duplicate
  deliveries for the same capture produce at most one durable evidence record;
  a completed OpenClaw turn is not delayed by a transient Wiki outage.
- **SC-004**: In supported OpenClaw compatibility tests, 100% of declared
  lifecycle hooks, optional query tools, and optional prompt-enrichment paths
  either produce the documented bounded outcome or disable safely with an
  actionable compatibility message.
- **SC-005**: In cross-agent retrieval tests, every returned external-memory
  item includes a usable source reference, and 100% of private, forgotten, or
  ungranted records are absent from result content and metadata.
- **SC-006**: In security regression tests covering setup, package inspection,
  status, diagnostics, failures, audit views, and published documentation, no
  credential or protected memory body is exposed.
- **SC-007**: Re-running guide generation or a migration preview creates no
  content change; a completed approved migration imports each selected source
  at most once and leaves all local OpenClaw source material intact.

## Assumptions

- The existing generic Agent Memory contract introduced for the Hermes
  integration is the starting point; OpenClaw is a second adapter, not a reason
  to fork that service contract.
- Each OpenClaw agent receives a dedicated least-privilege Agent Memory
  connection. Human owners administer sharing, promotion, retention, and
  revocation from the Wiki; the bridge does not self-authorize these actions.
- OpenClaw's native local memory and its memory-search tooling remain enabled
  or disabled according to ordinary OpenClaw configuration. This feature does
  not replace, index, or invoke them.
- The initial continuous bridge captures summaries by default when capture is
  enabled. Original session evidence and automatic prompt enrichment are
  higher-sensitivity options that require explicit configuration and runtime
  support.
- The Gateway host can reach the Wiki over an operator-managed secure network
  path. The Wiki's normal Raw/content, permissions, provenance, audit, and
  asynchronous-job capabilities are available.
- External-memory recall and automatic injection are assistive context only;
  an agent must still distinguish recalled evidence from current user input and
  must not claim unsupported facts.

## Scope Boundaries

- This feature does not replace OpenClaw's built-in local memory, modify
  OpenClaw core, add an OpenClaw dependency to the next-wiki server, or make
  next-wiki discover/install Gateway plugins.
- It does not create a separate per-agent server deployment, a proprietary
  memory store, anonymous access to captured sessions, or automatic promotion
  from private agent memory to shared knowledge.
- It does not make automatic capture mandatory, guarantee that every external
  harness emits every lifecycle event, or claim a pre-compaction veto where the
  OpenClaw runtime only provides observation.
- It does not include unreviewed bulk import, arbitrary cross-Wiki federation,
  shared write access, or self-modifying sharing rules in the first release.
