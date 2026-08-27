# Feature Specification: Hermes Memory Provider

**Feature Branch**: `039-hermes-memory-provider`
**Created**: 2026-08-27
**Status**: Draft
**Input**: User description: "提供对 HermesAgent Memory Provider Plugin的支持，以便让Hermes可以把这个Wiki作为其Memory系统。参考：https://hermes-agent.nousresearch.com/docs/developer-guide/memory-provider-plugin 。不仅仅要提供实现，还要提供方便Hermes用户配置的脚本或文档（比如可以作为服务Init 时的帮助Wiki页面之一）"

## User Scenarios & Testing *(mandatory)*

### User Story 1 - Connect Hermes to a Personal Wiki (Priority: P1)

As a Hermes user who owns a next-wiki instance, I want to install and configure
the next-wiki memory provider through the normal Hermes memory setup flow, so
that Hermes can use my Wiki as persistent, cross-session memory without
modifying Hermes itself.

**Why this priority**: A correctly discoverable and safely configured provider
is the entry point for every other memory capability.

**Independent Test**: Starting with a running Wiki and a newly created
least-privilege API key, install the provider, run the documented setup flow,
select it as Hermes's active memory provider, and confirm the status command
reports the configured Wiki identity without displaying the secret.

**Acceptance Scenarios**:

1. **Given** a supported Hermes installation and a reachable Wiki, **When** an
   owner follows the quick-start guide or setup helper, **Then** the provider is
   installed through a supported external-plugin distribution method and is
   selectable from `hermes memory setup` without patching Hermes source code.
2. **Given** a user has selected the provider, **When** the setup wizard asks
   for the Wiki address and credentials, **Then** it explains where to create a
   minimally scoped API key, keeps the secret outside ordinary configuration
   output, and records only the non-secret connection settings.
3. **Given** the configuration is incomplete, malformed, revoked, or points to
   an incompatible Wiki, **When** the user runs setup, status, or diagnostics,
   **Then** the command identifies the actionable problem and repair step
   without exposing the API key, response body, or protected Wiki content.
4. **Given** the provider is active for one Hermes profile, **When** a second
   external memory provider is selected, **Then** Hermes's single-provider rule
   remains intact and this provider neither bypasses nor competes with it.

---

### User Story 2 - Recall and Preserve Grounded Memory (Priority: P1)

As a configured Hermes user, I want Hermes to recall relevant Wiki memories and
save approved long-term knowledge back into my Wiki, so that answers carry
forward useful context while the Wiki remains the durable, inspectable source
of truth.

**Why this priority**: Cross-session recall and controlled persistence are the
core value of treating the Wiki as Hermes's memory system.

**Independent Test**: Save a project decision in one Hermes session, begin a
new session under the same profile, ask a relevant question, and confirm Hermes
receives a cited recall from the saved Wiki record. Repeat under another profile
and confirm the first profile's memory is absent.

**Acceptance Scenarios**:

1. **Given** a profile with relevant permitted records, **When** Hermes begins
   a related turn, **Then** it receives a bounded, clearly identified memory
   context containing the relevant content and durable Wiki references.
2. **Given** a profile has no relevant memory, **When** Hermes begins a turn,
   **Then** the turn proceeds normally without invented memories or misleading
   citations.
3. **Given** Hermes explicitly saves a memory, **When** the operation succeeds,
   **Then** the result is appended to the shared Raw space through the normal
   Raw writer, published once with its original source intact, and participates
   in the Wiki's common content, provenance, history, audit, and indexing
   pipelines rather than an untracked side store.
4. **Given** a user asks Hermes to forget a memory, **When** the matching record
   is identified and the user is authorized, **Then** it is excluded from future
   Hermes recall while the immutable Raw source remains unchanged and auditable.
5. **Given** separate Hermes profiles or configured memory namespaces, **When**
   either profile retrieves or writes memory, **Then** it cannot read, cite,
   modify, or discover the other profile's private memory unless an explicit
   shared destination was configured by an authorized owner.

---

### User Story 3 - Capture Conversations Without Losing Evidence (Priority: P2)

As a Hermes user who opts into automatic capture, I want useful conversation
material to be preserved in the Wiki before it can be compressed or a session
ends, so that later memories can be traced to original evidence instead of only
to an opaque summary.

**Why this priority**: This makes the Wiki a self-growing memory system while
honoring the project's evidence-first and privacy-preserving model.

**Independent Test**: Enable automatic capture, complete a multi-turn session,
trigger a session boundary and a compaction boundary, then inspect the Wiki to
verify each captured source is attributable to the Hermes profile/session,
deduplicated across retries, private by default, and linked to any resulting
durable memory.

**Acceptance Scenarios**:

1. **Given** automatic capture has been explicitly enabled, **When** a Hermes
   turn completes, a session ends, switches, shuts down, or reaches a configured
   preservation checkpoint, **Then** the provider preserves the selected
   conversation evidence according to the configured capture policy.
2. **Given** automatic capture is not enabled, **When** Hermes has a
   conversation, **Then** no conversation text is silently persisted by this
   provider; explicit memory-save actions remain available.
3. **Given** a configured preservation checkpoint is required before lossy
   compression, **When** the Wiki cannot confirm durable capture, **Then** the
   conversation is not compacted through that path and Hermes reports a
   recoverable failure.
4. **Given** Hermes retries or overlaps a capture after a transient failure,
   **When** the same source material reaches the Wiki, **Then** the source is
   not duplicated and a successful later retry restores a consistent memory
   state.
5. **Given** a captured conversation includes sensitive tool output or content
   the Wiki key may not preserve, **When** capture is attempted, **Then** the
   provider follows the configured redaction and permission policy, records a
   safe failure where needed, and never broadens the key's access.

---

### User Story 4 - Configure with In-Product Guidance (Priority: P2)

As a new next-wiki owner who uses Hermes, I want the initial service setup and
product documentation to tell me exactly how to enable Wiki-backed memory, so
that I can finish a secure first connection without searching source code or
guessing configuration values.

**Why this priority**: A plugin that works only for developers who discover it
by chance does not make the Wiki practically usable as Hermes memory.

**Independent Test**: On a fresh Wiki, choose to generate the standard help
pages, open the Hermes memory guide from the welcome/help navigation, and use
only that guide plus the provided setup helper to reach a verified configured
provider on a supported Hermes installation.

**Acceptance Scenarios**:

1. **Given** an owner is completing the Wiki's initial setup, **When** they
   choose to generate help pages, **Then** the published help collection
   includes a Hermes memory guide and the existing welcome/help links make it
   discoverable.
2. **Given** a user-authored page already occupies the Hermes help address,
   **When** initial setup generates help pages, **Then** it reports the
   collision and never overwrites that page.
3. **Given** a user follows the in-product guide or packaged README, **When**
   they configure Hermes, **Then** they receive copyable install, activation,
   API-key, configuration, verification, upgrade, revocation, and
   troubleshooting instructions for local and remotely hosted Wikis.
4. **Given** a user prefers automation, **When** they run the supplied setup
   helper, **Then** it can safely install or prepare the provider configuration,
   validate non-secret inputs, and run a connectivity check without requiring
   them to manually edit opaque configuration files.
5. **Given** the helper is run in preview mode or fails validation, **When** it
   exits, **Then** it makes no configuration change and clearly shows the next
   safe action; command-line history, diagnostic output, and generated files do
   not reveal credentials.

---

### User Story 5 - Control and Audit an Integration (Priority: P3)

As a Wiki owner, I want Hermes-memory access to be bounded by ordinary API-key
permissions and visible in the existing audit surfaces, so that I can diagnose
or stop the integration just as I would any other external client.

**Why this priority**: A durable-memory integration handles highly personal
information and must be revocable, explainable, and safe to operate.

**Independent Test**: Use a dedicated Hermes API key to retrieve and save a
memory, inspect its audit entries, revoke the key, and confirm future provider
operations fail safely while previously stored Wiki records remain intact.

**Acceptance Scenarios**:

1. **Given** the provider calls the Wiki, **When** an operation is accepted or
   rejected, **Then** the Wiki applies the API key owner's role together with
   the key's immutable scopes and records the operation in the existing audit
   trail without recording the secret.
2. **Given** the owner revokes or restricts the provider's API key, **When**
   Hermes next contacts the Wiki, **Then** the operation is denied before it
   can read or write protected content and diagnostics describe the recovery
   path.
3. **Given** a provider operation cannot complete, **When** Hermes continues
   the conversation, **Then** it distinguishes unavailable or unverified Wiki
   memory from successful recall and does not claim that a write was saved.

### Edge Cases

- The Wiki URL is reachable from a browser but not from the Hermes host (for
  example, a container-local address or reverse-proxy misconfiguration).
- An address redirects to an unexpected origin, uses an insecure transport for
  a remote deployment, or includes an invalid API base path.
- A secret is supplied through an unsafe command-line argument, is accidentally
  included in a config file, or would appear in a diagnostic error.
- A supported Hermes version lacks a lifecycle or checkpoint capability selected
  by the user.
- A user changes the active Hermes profile, forks/resumes a session, or starts
  two sessions concurrently while automatic capture is pending.
- The Wiki becomes unavailable, slow, or returns an authorization, rate, or
  validation error during recall, save, capture, or a required checkpoint.
- A memory record's Raw page is moved, externally retained/deleted, unpublished,
  or becomes unreadable after it has been referenced by a prior Hermes session;
  Hermes must treat the citation as unavailable without mutating the source.
- Setup help-page generation is rerun after a previous success, after a partial
  failure, or after a user has replaced the managed guide.
- The instance has no external AI provider configured; Hermes memory support
  must remain usable because it connects to the Wiki API, not to the Wiki's own
  model-provider settings.

## Requirements *(mandatory)*

### Functional Requirements

- **FR-001**: The system MUST provide a separately installable `next-wiki`
  Hermes memory provider that uses Hermes's documented memory-provider
  discovery, configuration, and single-provider lifecycle, without requiring a
  fork or core-file change to Hermes.
- **FR-002**: The provider MUST declare its compatible Hermes contract and
  fail with a clear upgrade/downgrade instruction when an installed Hermes
  version cannot support a requested capability.
- **FR-003**: The provider MUST be selectable through Hermes's normal memory
  setup experience and declare only the configuration fields necessary for a
  first secure connection; advanced options MUST be documented separately.
- **FR-004**: The provider configuration MUST identify the Wiki API base URL,
  the API credential, a profile-scoped memory destination, and explicit
  recall/capture preferences. API credentials MUST be stored only in the
  secret-handling location expected by Hermes and never in generated Wiki
  content, ordinary provider configuration, logs, status output, or errors.
- **FR-005**: The provider MUST offer a non-destructive setup/diagnostic helper
  with install-or-prepare, configure, status, and connectivity-validation
  paths. It MUST support a no-change preview mode and MUST never require a
  credential as a visible command-line argument.
- **FR-006**: Connection validation and normal provider operations MUST use the
  existing versioned Wiki API and a dedicated API key; they MUST honor the
  key's immutable scopes and owner role and MUST NOT reuse browser sessions,
  database credentials, or a privileged internal interface.
- **FR-007**: The provider MUST expose Hermes memory capabilities for relevant
  recall, explicit memory save, and reversible forgetting. Each capability MUST
  use the Wiki's normal authorization, provenance, revision/history, common
  content/index pipelines, and audit behavior. Save and evidence capture MUST
  append immutable records through the shared Raw-space writer; forget MUST
  change only the Hermes record's recall state and MUST NOT mutate or delete the
  Raw source.
- **FR-008**: Recalled context MUST be bounded, clearly identified as stored
  memory rather than new user input, and include a durable Wiki address and
  revision/source reference for every recalled record. A no-result response
  MUST be distinguishable from an unavailable or unauthorized Wiki.
- **FR-009**: The provider MUST keep memory isolated by Hermes profile and
  configured destination. Cross-profile or shared-memory access MUST require an
  explicit, owner-authorized configuration and remain constrained by the API
  key's permission scope.
- **FR-010**: Explicitly saved memories and automatically captured conversation
  evidence MUST be stored as immutable, inspectable entries in the shared Raw
  space, using the common page/revision/content-storage and indexing paths, with
  source, profile/session, creation-time, category, and provider provenance.
  They MUST be restricted by default and MUST NOT publish or alter anonymously
  readable Wiki content without the normal governed action. Hermes metadata
  tables MAY hold only locators, namespace/state, idempotency, and evidence
  relationships; they MUST NOT duplicate the source body.

- **FR-019**: The provider MUST report an actionable unavailable result when the
  instance has no usable Raw space (including an instance still in Copilot mode)
  and setup documentation MUST identify enabling the Raw/LLM Wiki capability as
  a prerequisite for Wiki-backed Hermes memory.
- **FR-011**: Automatic conversation capture MUST be opt-in during setup. When
  enabled, it MUST preserve selected original conversation evidence at completed
  turns and relevant session lifecycle boundaries; if the operator enables a
  required pre-compression preservation checkpoint, compression MUST not proceed
  until the provider confirms a durable, idempotent capture.
- **FR-012**: Capture and recall failures MUST be recoverable: normal Hermes
  conversation continues where safe, failures are reported without secrets or
  protected content, and retries cannot create duplicate evidence or memories.
- **FR-013**: The provider MUST not make nonessential network calls while
  Hermes is only checking whether it can activate; routine background sync must
  not block the user's completed turn.
- **FR-014**: The provider's package, README, and in-product documentation MUST
  describe installation, activation, minimum API-key permissions, secure secret
  placement, configuration fields, profile/destination isolation, automatic
  capture, checkpoint behavior, memory tools, verification, upgrade, key
  rotation/revocation, backup, and troubleshooting.
- **FR-015**: The initial setup's optional help-page generation MUST add a
  managed Hermes memory guide at a stable Help address and link it from the
  generated welcome/help content. Generation MUST be idempotent and collision
  safe: managed content may be enriched once, but user-authored content MUST
  never be overwritten.
- **FR-016**: The Hermes help guide and automation output MUST be useful for
  both same-machine development and remote self-hosted deployments, including
  reachable-address, transport-security, reverse-proxy, and container-network
  considerations; examples MUST use placeholders, never real credentials.
- **FR-017**: Every Wiki request from the provider MUST remain visible in the
  existing API audit trail with safe provider attribution. The provider's own
  status and diagnostics MUST expose only non-secret connection identity,
  selected destination, compatibility, and last safe outcome.
- **FR-018**: Enabling this feature MUST add no required stateful service,
  external model provider, or background service to the Wiki's default
  deployment. A Wiki with no Hermes provider installed or configured MUST retain
  its existing behavior.

### Public Content Delivery *(required when a feature changes anonymously readable published content)*

- The feature adds an optional, generated Help page and a corresponding
  discoverability link to the generated welcome/help material. These are normal
  published Wiki documents, not personalized controls; they follow the existing
  published-page representation, navigation, revision, and invalidation flow.
- Provider status, API-key management, diagnostics, capture state, private
  memory records, and raw conversation evidence are authenticated surfaces and
  MUST NOT be embedded in the cached public help document or exposed through
  anonymous reader routes.
- Rerunning initial help generation must invalidate and refresh only the
  affected published help/welcome documents after a successful governed change;
  collisions and skipped generation must leave existing public output unchanged.

### Key Entities *(include if feature involves data)*

- **Hermes Memory Provider**: The independently distributed integration that
  connects a selected Hermes profile to the Wiki through the standard Hermes
  memory-provider lifecycle.
- **Provider Connection Configuration**: Secret-safe connection settings,
  selected Wiki destination, profile isolation rules, capture preferences, and
  compatibility information for one Hermes profile.
- **Memory Destination**: The owner-authorized namespace mapped to immutable
  entries in the shared Raw space, to which a Hermes profile can recall, save,
  and optionally capture memory. It is a logical security boundary, not a
  second content store.
- **Memory Record**: An immutable Raw-space page/revision used for explicit
  long-term memory, carrying common Wiki provenance/index metadata and
  references to supporting source evidence.
- **Conversation Evidence Record**: An optional restricted, immutable Raw-space
  entry preserving selected original Hermes conversation material before it is
  summarized or compressed.
- **Capture Checkpoint**: The durable confirmation that selected conversation
  evidence has been preserved before an operator-required lossy compression
  boundary can continue.
- **Provider Diagnostic Report**: A credential-safe local result describing
  installation, configuration completeness, compatibility, reachability,
  permission outcome, and recommended repair actions.
- **Hermes Memory Help Page**: Managed onboarding documentation explaining how
  to connect and operate Hermes with the owner's Wiki.

## Success Criteria *(mandatory)*

### Measurable Outcomes

- **SC-001**: A user with a running Wiki, a supported Hermes version, and a
  newly created API key can install, configure, select, and verify the provider
  in 10 minutes or less using only the supplied guide and setup helper.
- **SC-002**: In automated compatibility tests, 100% of supported Hermes
  lifecycle flows needed for activation, recall, explicit save, forget, session
  completion, and shutdown reach the expected Wiki outcome or a safe,
  actionable failure; no flow requires a Hermes core modification.
- **SC-003**: In profile-isolation tests, 100% of recall, save, and forget
  attempts are confined to their configured profile/destination unless an
  authorized shared destination is explicitly selected.
- **SC-004**: In retry and required-checkpoint tests, repeated or overlapping
  capture requests create no duplicate source record, and 100% of failed
  required checkpoints prevent the affected lossy compression from completing.
- **SC-005**: In setup-help regression tests, initial generation creates the
  Hermes guide and discoverability link on a fresh instance, reruns without
  duplicate revisions, and preserves 100% of user-authored colliding help
  pages.
- **SC-006**: In secret-safety tests covering setup, preview, diagnostics,
  failure output, documentation examples, and audit displays, no API credential
  or protected Wiki content is revealed.

## Assumptions

- Hermes users will install this as a standalone external memory-provider
  package or user plugin; Hermes intentionally does not accept new in-tree
  third-party memory providers.
- The first release targets a personal Wiki owner/administrator who can create
  a dedicated API key and select a private memory destination. Broader shared
  multi-user memory policies can build on the same permission model later.
- A selected Hermes provider complements rather than replaces Hermes's built-in
  `MEMORY.md` and `USER.md`; Hermes permits only one external memory provider at
  a time.
- Conversation capture is a deliberate privacy choice. It is disabled until the
  user enables it during configuration and is limited by the configured Wiki
  key and destination.
- The configured Wiki endpoint is reachable from the machine or container
  running Hermes. Remote deployments use an operator-managed secure transport;
  same-machine development may use the documented local endpoint.
- Existing API-key, audit, Raw page/revision, private-content, indexing, and
  first-run help-page behavior are reused. The instance must expose the Raw
  space (currently enabled by LLM Wiki writing mode), but the feature does not
  require a separately configured model provider for the Hermes API path.

## Scope Boundaries

- This feature does not add a new external model provider, a hosted memory SaaS,
  or a new required Wiki service.
- It does not make Hermes conversations publicly readable, automatically publish
  memories, or bypass existing page-review and permission boundaries.
- It does not change Hermes core source code or permit multiple external memory
  providers to run together.
- Importing historical memory from other Hermes providers, cross-instance memory
  federation, and a general UI for arbitrary third-party provider management are
  out of scope for this release.
