# Feature Specification: OpenClaw Memory Wiki Integration

**Feature Branch**: `040-openclaw-memory-wiki`
**Created**: 2026-08-29
**Status**: Draft
**Input**: User description: "编写一个openclaw的插件，完成以下功能：1. 将memory-wiki所capture到的内容（都是md），通过重用现有的memory api（不够可以加），保存到本服务中。注意保持原始的Memory Wiki的结构，参考：https://docs.openclaw.ai/plugins/memory-wiki ，同时需要更新setup init example wiki pages添加 openclaw的集成帮助。2. 提供Skill，以便直接从next-wiki中检索其中内容（不限于capture下的记忆，同账号下的所有wiki/generated/raw都可以检索，以便对openclaw的记忆进行扩充，以可以检索个人化，更关乎User本人的知识及与User交互的其它Agents的记忆。"

## User Scenarios & Testing *(mandatory)*

### User Story 1 - Preserve an OpenClaw Memory Wiki in next-wiki (Priority: P1)

As an OpenClaw operator who uses `memory-wiki`, I want its captured Markdown
knowledge to be mirrored into my next-wiki account without changing the
knowledge's established structure, so that I retain a durable, inspectable
copy of the source, compiled knowledge, and reports outside the local vault.

**Why this priority**: Preserving captured knowledge is the core user value;
the integration has no useful memory-expansion role if OpenClaw's source
knowledge cannot reliably reach the Wiki.

**Independent Test**: Starting with a representative Memory Wiki containing
root documents, entities, concepts, syntheses, sources, and reports, enable a
connection, run an initial import, then create and update Markdown documents.
Verify that the same logical document hierarchy, content, frontmatter, and
revision provenance can be inspected in the connected next-wiki account.

**Acceptance Scenarios**:

1. **Given** an enabled and authorized integration with an existing Memory
   Wiki vault, **When** the operator starts its initial import, **Then** every
   eligible Markdown document is saved to the operator's account under one
   distinct OpenClaw vault root, with its original relative path and content
   preserved.
2. **Given** a Memory Wiki capture, compilation, or managed-page update
   produces changed Markdown, **When** the integration observes the completed
   change, **Then** the corresponding remote document is created or revised
   once without changing the source vault or blocking OpenClaw's local memory
   workflow.
3. **Given** an OpenClaw document includes frontmatter, claims, evidence,
   provenance, internal links, or human-maintained blocks, **When** it is
   mirrored, **Then** those Markdown-level structures remain available in the
   stored source and the result identifies its original vault-relative path.
4. **Given** the same document version is delivered more than once because of
   a restart or transient failure, **When** next-wiki receives it, **Then** it
   records one logical update rather than duplicating the document.
5. **Given** next-wiki is temporarily unavailable, **When** OpenClaw captures
   or compiles knowledge, **Then** the local Memory Wiki remains usable, the
   operator can see a safe failure state, and a later retry can complete the
   remote mirror without data loss or duplicate content.

---

### User Story 2 - Search my complete next-wiki knowledge from OpenClaw (Priority: P1)

As an OpenClaw user, I want a dedicated skill to search my account's allowed
Wiki, Generated, and Raw content on demand, so that the agent can enrich its
memory with personal knowledge and knowledge captured by other agents without
pretending that only its own Memory Wiki exists.

**Why this priority**: The remote mirror becomes much more valuable when an
agent can ground a response in the user's wider, account-owned knowledge.

**Independent Test**: Seed one matching document in each of the Wiki,
Generated, and Raw spaces under one account and a similar document under
another account. Use the installed skill to search and open each permitted
result, then verify the first account's results include correct citations and
never expose the other account's content.

**Acceptance Scenarios**:

1. **Given** the operator has installed and enabled the next-wiki search
   skill, **When** the user asks a question that needs personal or
   cross-agent knowledge, **Then** the agent can issue an on-demand search of
   the connected account's permitted content instead of relying only on its
   local Memory Wiki.
2. **Given** matching, readable documents exist in one or more of Wiki,
   Generated, and Raw spaces, **When** the skill searches with a query,
   **Then** it returns concise, ranked results that identify the space, title,
   path, excerpt, and stable citation for each result.
3. **Given** a result needs more context, **When** the agent opens that
   result through the skill, **Then** it receives the requested readable
   source content and a citation while retaining the same account and
   permission boundary as the search.
4. **Given** the account has no readable match, **When** the search completes,
   **Then** the agent receives an explicit empty result and does not invent a
   memory, citation, or access failure.
5. **Given** a key lacks access to Raw or Generated content, **When** a search
   would otherwise match such a document, **Then** that content is omitted and
   the skill explains that the available result set is permission-limited
   without disclosing hidden titles, paths, or excerpts.

---

### User Story 3 - Install and operate the OpenClaw plugin safely (Priority: P2)

As an OpenClaw operator, I want a separately installable plugin with clear
configuration, connection checking, initial-import, and status guidance, so
that I can connect the right account without modifying OpenClaw itself or
placing credentials in unsafe locations.

**Why this priority**: The integration handles highly personal data; a safe
and understandable setup path is essential before capture or search can be
trusted.

**Independent Test**: Install the packaged plugin into a clean supported
OpenClaw environment, configure a dedicated next-wiki credential through the
documented secret mechanism, validate the connection, run a preview and then
an initial import, and confirm status reports the selected account and vault
without showing protected content or credentials.

**Acceptance Scenarios**:

1. **Given** a supported OpenClaw installation, **When** the operator installs
   and enables the package using the documented plugin workflow, **Then** the
   plugin is discoverable without a fork or core-file modification and reports
   incompatible versions with a clear repair action.
2. **Given** the operator configures the connection, **When** the plugin asks
   for the next-wiki address and credential, **Then** it stores only
   non-secret settings in ordinary configuration and uses OpenClaw's approved
   secret mechanism for the credential.
3. **Given** the operator runs a connection check, status command, or
   no-change preview, **When** the configuration is valid or invalid, **Then**
   it provides actionable account, authorization, reachability, and
   synchronization guidance without writing content in preview mode or
   revealing secrets, protected documents, or raw service responses.
4. **Given** `memory-wiki` is also enabled, **When** this plugin starts,
   **Then** it operates alongside the active memory and Memory Wiki plugins;
   it does not replace their recall, promotion, compilation, or local vault
   ownership.

---

### User Story 4 - Discover the integration during next-wiki setup (Priority: P2)

As a new next-wiki administrator who uses OpenClaw, I want the optional sample
pages created during setup to explain this integration, so that I can discover
how to connect, mirror, and search my knowledge without having to find the
source repository.

**Why this priority**: Setup guidance makes the feature usable for operators
who did not encounter the external package first.

**Independent Test**: On a fresh next-wiki instance, choose to create example
pages, open the OpenClaw guide from the welcome or main-features pages, and
complete a documented connection and first search using only the guide and
released package instructions.

**Acceptance Scenarios**:

1. **Given** an administrator elects to create setup example pages, **When**
   initialization completes, **Then** it includes a discoverable OpenClaw
   integration guide and links to it from the existing welcome and
   main-features guidance.
2. **Given** setup sample-page initialization is rerun, **When** a guide is
   missing or is still owned by setup, **Then** it is restored or refreshed
   idempotently; a user-authored page at the same address is never overwritten.
3. **Given** an operator reads the guide, **When** they follow it, **Then** it
   explains supported deployment addresses, creating a least-privilege key,
   protecting the credential, initial import, continuous synchronization,
   installing/enabling the search skill, result citations, account isolation,
   revocation, and diagnosis.

---

### User Story 5 - Keep accounts and source history protected (Priority: P3)

As a next-wiki account owner, I want all OpenClaw mirror and search operations
to be constrained by my account and existing access rights, so that one
agent's integration cannot browse another user's knowledge or erase historic
source material.

**Why this priority**: Cross-agent enrichment is useful only if it preserves
the same privacy and audit boundary as the rest of next-wiki.

**Independent Test**: Configure two accounts with different credentials and
vaults, attempt search, import, retry, revocation, and modified-client
requests from each, and verify that every successful operation is attributed
to the correct account while cross-account and revoked attempts fail safely.

**Acceptance Scenarios**:

1. **Given** a client sends a modified account, vault, space, or document
   selector, **When** it attempts a mirror, search, or source read, **Then**
   the service derives ownership and allowed scope from its authenticated
   credential rather than trusting the client-provided selector.
2. **Given** a credential is revoked, expired, or has insufficient permission,
   **When** the plugin next tries to mirror or retrieve content, **Then** the
   operation is refused before data is returned or written and the operator
   receives a safe recovery instruction.
3. **Given** a mirrored source is updated, removed locally, or later retained
   under a different lifecycle policy, **When** the integration reconciles
   it, **Then** next-wiki preserves its normal immutable history and audit
   evidence; the plugin does not hard-delete source content.

### Edge Cases

- The configured OpenClaw vault contains the expected root Markdown files,
  nested folders, a hidden state folder, missing optional folders, or paths
  whose names only differ by case; only eligible Markdown knowledge documents
  are mirrored, preserving their unambiguous relative structure.
- A Markdown document is renamed, moved, revised, or refers to another
  document through a relative link; the remote representation remains
  traceable to the source path and does not silently become a second unrelated
  document.
- A document exceeds the service's accepted size, contains malformed
  frontmatter, unsupported encoding, or a broken link; the plugin reports the
  individual item safely and continues eligible independent items.
- An initial import, background synchronization, and a manual retry overlap;
  the final remote state represents each accepted source version once.
- The OpenClaw host cannot reach the configured next-wiki address, encounters
  an unexpected redirect, a transport error, or a rate limit; local Memory
  Wiki capture and agent operation continue and recovery does not expose
  credentials.
- A query matches both a personal Raw document and an OpenClaw-mirrored
  document, or matches a document the credential may not read; results retain
  source-space and citation context while excluding inaccessible content.
- The server is not configured to expose Raw or Generated spaces to the
  credential's owner; searches remain useful for permitted Wiki content and
  clearly report restricted coverage rather than treating it as a complete
  account search.
- A sample-page address is occupied by a user-authored page, an earlier
  setup run ended partially, or setup is rerun after the guide changed; sample
  initialization remains collision-safe and gives per-page outcomes.

## Requirements *(mandatory)*

### Functional Requirements

- **FR-001**: The system MUST provide a separately installable OpenClaw plugin
  that can be enabled alongside `memory-wiki` without modifying OpenClaw core
  or replacing the active memory plugin.
- **FR-002**: The plugin MUST make its compatible OpenClaw and `memory-wiki`
  versions explicit and provide a safe, actionable explanation when a requested
  capability is unsupported.
- **FR-003**: The plugin MUST support an operator-controlled initial import
  and ongoing synchronization of eligible Markdown knowledge captured or
  maintained by Memory Wiki.
- **FR-004**: The plugin MUST preserve the Memory Wiki's navigable Markdown
  hierarchy, including the root documents and the standard `inbox`, `entities`,
  `concepts`, `syntheses`, `sources`, `reports`, and `_views` areas, under a
  distinct remote vault root bound to the authenticated account and connection.
- **FR-005**: For every mirrored document, the system MUST retain its original
  vault-relative path, Markdown body, frontmatter, source identity, and source
  version information so that users can inspect and trace the original
  structure without reconstruction from a summary.
- **FR-006**: The system MUST preserve Markdown-level links and references as
  authored, and make the source-relative path available with each mirrored
  document so link resolution or repair remains possible.
- **FR-007**: The system MUST use the existing Agent Memory service boundary
  and its existing Page/Revision relationship for persistence, provenance,
  retries, and access control. If a required source-document snapshot
  capability is absent, the system MUST add it as a generic Agent Memory
  extension rather than bypassing it with direct storage access or introducing
  an OpenClaw-only page-mapping entity.
- **FR-008**: The persistence boundary MUST accept an unambiguous source
  identity and version or content digest, making retries idempotent and
  creating a new immutable history entry only when the source document has
  meaningfully changed.
- **FR-009**: The system MUST return a per-document outcome for initial import
  and synchronization, including accepted, unchanged, deferred, and failed
  states, without returning protected Markdown to routine status output.
- **FR-010**: The plugin MUST not block Memory Wiki's capture, compilation, or
  the agent's normal response path on a remote persistence attempt; failed or
  deferred work MUST remain diagnosable and retryable.
- **FR-011**: The plugin MUST restrict source mirroring to eligible Markdown
  knowledge documents. It MUST NOT upload binary attachments, credentials,
  secret configuration, cache files, or arbitrary local files merely because
  they are adjacent to the vault.
- **FR-012**: The system MUST provide a ready-to-install OpenClaw skill that
  tells an agent when and how to search next-wiki for personal and
  cross-agent knowledge, retrieve a selected result for context, cite it, and
  avoid claiming unsupported facts.
- **FR-013**: The skill MUST provide an on-demand next-wiki search action and
  a follow-up source-read action. It MUST NOT automatically inject the whole
  account's knowledge into every prompt.
- **FR-014**: A next-wiki search through the skill MUST consider all readable
  content owned by the authenticated account across Wiki, Generated, and Raw
  spaces, including but not limited to OpenClaw-mirrored memory documents.
- **FR-015**: Each search result MUST identify its content space, title,
  canonical path or address, concise matching excerpt, and stable revision or
  source citation. The follow-up read MUST return only the content the same
  credential is allowed to read.
- **FR-016**: The search interface MUST support bounded queries and result
  counts, return an explicit empty state when no readable match exists, and
  distinguish incomplete permission coverage from a no-match result without
  revealing inaccessible content metadata.
- **FR-017**: The service MUST derive account ownership, readable content
  spaces, connection scope, and mirror destination from the authenticated
  credential and existing user permissions on every request. Client-supplied
  account or destination identifiers MUST NOT broaden access.
- **FR-018**: The integration MUST use a dedicated, least-privilege
  credential. Credentials MUST be accepted and stored only through the secret
  handling mechanism approved by OpenClaw and MUST NOT appear in command-line
  arguments, normal plugin configuration, generated Wiki pages, logs, search
  results, audit metadata, status output, or error messages.
- **FR-018a**: Agent Memory provider credentials MUST use the generic API-key
  `memoryProvider` contract. Agent-specific adapters such as OpenClaw, Hermes,
  or Pi MUST be represented by `agentIdentity` on the binding and MUST NOT
  require a provider-specific key type, provisioning endpoint, or permission
  model.
- **FR-019**: The service MUST use the existing account permissions when
  granting Raw and Generated search coverage. It MUST never grant access to
  those spaces simply because an OpenClaw plugin requests them.
- **FR-020**: Successful and failed mirror, search, source-read, credential,
  and retry operations MUST be traceable through the existing audit facilities
  using safe operation metadata that excludes Markdown bodies, queries,
  excerpts, and credentials.
- **FR-021**: The setup example-page collection MUST add an OpenClaw
  integration guide and discoverable links from the welcome and main-features
  pages. It MUST be created, refreshed, restored, and collision-checked with
  the same marker-owned, idempotent sample-page behavior as existing guides.
- **FR-022**: The OpenClaw guide and packaged documentation MUST cover
  prerequisite checks, least-privilege key creation, safe configuration,
  address selection for local and remote deployments, initial import,
  continuous synchronization, skill installation and use, citations,
  permission limitations, retries, credential rotation, revocation, backup,
  and diagnosis.
- **FR-023**: Removing a source from the local vault, revoking a connection,
  or forgetting a related memory MUST NOT hard-delete next-wiki source history.
  It MUST follow the account's ordinary retention, visibility, and audit
  controls.

### Public Content Delivery

- Published page bodies and public navigation change: first-run sample pages
  gain an OpenClaw integration guide plus links from the welcome and
  main-features guides. No personal account, vault, credential, connection,
  status, search result, or control appears in anonymously readable content.
- The guide and amended sample pages MUST use the normal published
  static/ISR page representation. Creating, refreshing, restoring, or
  publishing any affected sample page MUST invalidate that page's published
  representation and relevant navigation/cache tags so a visitor does not see
  stale links or help text.

### Key Entities

- **Agent Memory Provider Connection**: An operator-authorized, account-bound
  relationship between one agent adapter (such as OpenClaw, Hermes, or Pi) and
  one next-wiki account, including the remote source settings, non-secret
  configuration, permission coverage, and health. The adapter identity is
  metadata on the generic Memory provider binding, not a new key type.
- **Mirrored Memory Wiki Document**: One eligible Markdown document from a
  Memory Wiki vault, identified by its vault-relative path and source version,
  with immutable next-wiki history and provenance.
- **Synchronization Outcome**: The durable result for one attempted document
  import or update, used to report progress, safely retry failures, and avoid
  duplicates.
- **next-wiki Search Skill**: The OpenClaw agent instruction set and its
  search/source-read capabilities for retrieving account-permitted content on
  demand.
- **Knowledge Retrieval Result**: A permission-filtered match from Wiki,
  Generated, or Raw content that includes enough source identity and citation
  information for an agent to ground a response.

## Success Criteria *(mandatory)*

### Measurable Outcomes

- **SC-001**: A representative Memory Wiki containing root documents and at
  least one Markdown document in each standard knowledge area can be imported
  with 100% of eligible documents retaining their relative paths, bodies, and
  frontmatter when compared with the source vault.
- **SC-002**: For a healthy connection, at least 95% of eligible Markdown
  changes are acknowledged for synchronization within 5 seconds and become
  inspectable in next-wiki within 60 seconds; duplicate delivery of a single
  source version produces no additional logical document.
- **SC-003**: In a test account containing matching content in Wiki, Generated,
  and Raw spaces, at least 95% of bounded on-demand searches return their
  readable results within 2 seconds, with every result identifying its source
  space and citation.
- **SC-004**: Account-isolation tests show 100% of attempts to mirror, search,
  or read another account's content are rejected or return no protected
  metadata, including when client-supplied selectors are modified.
- **SC-005**: A clean supported OpenClaw installation can complete package
  installation, connection validation, a no-change preview, first import, and
  one cited next-wiki search in 15 minutes using the released documentation,
  without editing OpenClaw source code.
- **SC-006**: Fresh setup and a rerun of setup sample-page initialization both
  make the OpenClaw guide reachable from the welcome or main-features pages,
  while collision tests confirm that 100% of user-authored pages at managed
  sample addresses remain unchanged.
- **SC-007**: Test coverage confirms that routine status, diagnostics, audit
  records, documentation samples, and failure messages contain 0 credentials,
  protected Markdown bodies, search queries, or result excerpts.

## Assumptions

- The deployed OpenClaw version supports external tool plugins and loading a
  user-visible skill; `memory-wiki` remains the local owner of its vault and
  compilation process.
- The first release is a one-way mirror from Memory Wiki to next-wiki. Remote
  editing, restoring a local vault from next-wiki, and two-way conflict
  resolution are out of scope.
- Memory Wiki inputs in scope are Markdown knowledge documents. Attachments,
  non-Markdown state, and private plugin caches are excluded unless a future
  feature explicitly adds a safe content model for them.
- An operator provisions one dedicated credential per next-wiki account and
  grants only the read and persistence rights required for the configured
  feature set. Raw and Generated coverage remains subject to existing account
  roles and explicit space access.
- next-wiki's existing Agent Memory and page-search capabilities are the base
  service boundaries. The feature may add documented, permission-checked
  capability only where those boundaries cannot preserve source hierarchy or
  serve account-wide retrieval.
- Search is retrieval on demand, not a replacement for OpenClaw's active
  memory plugin, automatic promotion, local compilation, or every-turn prompt
  assembly.
- next-wiki's normal backup and retention process protects mirrored content
  and its immutable history; the plugin does not introduce a separate backup
  system.

## Out of Scope

- Replacing or altering OpenClaw's active memory provider, Memory Wiki's
  compile pipeline, dashboards, or local vault ownership.
- Synchronizing arbitrary local files, binary attachments, credentials, or
  OpenClaw private state outside the eligible Markdown knowledge set.
- Writing arbitrary next-wiki Wiki, Generated, or Raw content from the search
  skill; this release provides retrieval, while persistence is limited to the
  controlled Memory Wiki mirror.
- Sharing, searching, or mirroring content across next-wiki accounts, even
  when an agent can name another account or vault.
- Two-way content synchronization, automatic conflict resolution, or local
  vault restoration from next-wiki.
