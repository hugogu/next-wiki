# Feature Specification: Wiki MVP Foundation

**Feature Branch**: `001-wiki-mvp`  
**Created**: 2026-05-30  
**Status**: Draft  
**Input**: User description: "Let's start build MVP of this project, it visual style could follow https://docs.requarks.io/ and should provider a style system like wordpress, all features that need backend tables should be built in MVP so that we get a clean db initialization as earlier as possible, it should be bring up easily by docker. It should maintain history of pages and tagging, start with markdown, but need to support mermaid diagram and latex, drawio diagram etc. It should allow define AI providers to enable AI based chatting to ask question against wiki."

## User Scenarios & Testing *(mandatory)*

### User Story 1 - Publish, link, search, and translate knowledge (Priority: P1)

An editor creates and maintains wiki pages in Markdown, organizes them through
hierarchical paths and tags, links pages to each other, supports multiple
languages, and trusts that every change is versioned and recoverable.

**Why this priority**: This is the heart of the product. If users cannot create,
connect, search, translate, and restore knowledge safely, the wiki does not
deliver its primary value.

**Independent Test**: Can be fully tested by creating a space, authoring
multiple linked pages with tags, publishing translations, moving one page,
searching by keyword and tag, and restoring an earlier revision after edits.

**Acceptance Scenarios**:

1. **Given** an editor has access to a wiki space, **When** they create a page
   with Markdown headings, links, code blocks, Mermaid, LaTeX, and a draw.io
   diagram reference, **Then** the saved page renders each supported content
   type correctly in the reading view.
2. **Given** a page already exists, **When** the editor updates its content,
   tags, and title, **Then** the system preserves the earlier page version,
   records a new immutable revision, and shows the updated metadata.
3. **Given** a page links to another page by internal wiki path, **When** a
   reader opens the page, **Then** the system marks the link as valid or invalid
   based on the current target state.
4. **Given** a page is moved to a new path, **When** a reader visits the old
   path, **Then** the reader is taken to the new path if they have permission to
   read the target.
5. **Given** a page has localized versions, **When** a reader requests a locale
   that is missing, **Then** the system falls back to the space default locale
   and clearly indicates that the requested translation is unavailable.
6. **Given** pages contain matching keywords and tags, **When** a reader uses
   search or tag filtering, **Then** they can discover relevant pages without
   seeing content they are not allowed to read.

---

### User Story 2 - Launch, authenticate, and administer the wiki (Priority: P1)

An operator brings up the wiki with Docker, completes first-run setup, signs in
through supported authentication methods, and gets an MVP system whose
data-backed capabilities are already initialized without destructive resets.

**Why this priority**: Easy deployment and a stable early database foundation
are explicit project goals. Authentication and permissions are required before
the rest of the product can be trusted.

**Independent Test**: Can be fully tested by starting the product from a clean
environment with Docker, completing first-run setup, signing in through local
credentials, configuring additional identity providers, and confirming the core
admin surfaces and permission rules are usable immediately.

**Acceptance Scenarios**:

1. **Given** a new operator has the published container setup, **When** they
   start the product and complete first-run setup, **Then** they can create the
   initial administrator and access the wiki without manual database edits.
2. **Given** local authentication is enabled, **When** an administrator signs
   in with a valid email and password, **Then** the system starts an
   authenticated session and applies the correct permission context.
3. **Given** an administrator configures an external identity provider, **When**
   a user signs in through that provider for the first time, **Then** the system
   creates a local account record and places the user into the configured access
   model.
4. **Given** the system is freshly initialized, **When** the operator visits
   administration areas for users, groups, permissions, themes, tags, assets,
   AI providers, and background tasks, **Then** each MVP data-backed feature is
   available as part of the initial product setup.
5. **Given** the operator restarts the product using the same persisted data,
   **When** the system comes back online, **Then** configuration, content,
   accounts, and history remain intact.

---

### User Story 3 - Customize the site visual identity (Priority: P2)

An administrator shapes the wiki's visual identity through a site-wide style
system so the product can look branded and polished while remaining readable and
consistent across reading, editing, and administration surfaces.

**Why this priority**: Visual identity is a product differentiator and a
prominent requirement, but it depends on the core content and admin foundation.

**Independent Test**: Can be fully tested by activating or editing a theme,
refreshing key product surfaces, and verifying that navigation, content layout,
and chrome update consistently without breaking usability.

**Acceptance Scenarios**:

1. **Given** an administrator has access to site appearance settings, **When**
   they activate a theme, **Then** the wiki updates to the selected visual style
   without changing content structure or navigation behavior.
2. **Given** a theme defines branded colors, typography, and chrome tokens,
   **When** it is applied, **Then** the reading experience, editor shell, and
   administration shell all use the same token-driven visual system.
3. **Given** a theme change would reduce usability or readability, **When** the
   administrator previews or saves it, **Then** the system preserves readable
   navigation and content presentation.

---

### User Story 4 - Ask questions against wiki knowledge with AI (Priority: P2)

An administrator configures AI providers and a user asks grounded questions
against permitted wiki content through the persistent AI chat experience.

**Why this priority**: AI-assisted retrieval is a major differentiator, but it
must remain optional, permission-scoped, and grounded in the wiki's revisioned
content model.

**Independent Test**: Can be fully tested by configuring one AI provider,
indexing existing pages, opening the AI chat side pane from a page, asking a
question whose answer exists in the wiki, and checking that the result includes
citations and respects permissions.

**Acceptance Scenarios**:

1. **Given** no AI provider is configured, **When** a user visits the AI chat
   settings or another AI-specific entry point, **Then** the default wiki
   layout does not render the AI chat pane, the product clearly indicates that
   AI is unavailable in those AI-specific surfaces, and the rest of the wiki
   remains fully usable.
2. **Given** an AI provider is configured and indexed content exists, **When** a
   user asks a question about wiki content they are allowed to read, **Then**
   the system returns a grounded answer with citations or links to source pages.
3. **Given** a user asks a question whose answer depends on content they cannot
   read, **When** the system prepares a response, **Then** it does not reveal the
   restricted content and answers only from permitted sources.
4. **Given** the AI system suggests draft content, **When** a user accepts the
   suggestion, **Then** the resulting page or edit still goes through the normal
   draft and save flow rather than bypassing page history.

---

### Edge Cases

- What happens when a page contains unsupported embedded content or malformed
  Mermaid, LaTeX, or draw.io data?
- What happens when a page contains allowed inline HTML and the content needs
  sanitization before rendering?
- How does the system behave when an editor removes or renames tags that are
  currently used across many pages?
- What happens when two users edit the same page at nearly the same time?
- What happens when a page is edited while AI indexing or summarization is still
  processing a previous revision?
- How does AI-assisted chat respond when relevant content exists but the user
  does not have permission to read it?
- What happens when an operator changes theme settings that would reduce color
  contrast or produce unreadable navigation elements?
- How does first-run setup behave if the product is restarted before setup is
  completed?
- What happens when a requested page path exceeds allowed limits or collides with
  an existing page or redirect?
- What happens when an AI provider is configured but credentials are expired or
  the service is unreachable?
- What happens to page permissions and child page accessibility when a page is
  moved into another space?
- What happens when a page move leaves other pages linking to the old path?
- What happens when a very large Markdown page causes long render or indexing
  time?
- What happens when Docker starts but the database is temporarily unavailable?

## Requirements *(mandatory)*

### Functional Requirements

#### Deployment, Setup, and Authentication

- **FR-001**: The system MUST provide a Docker-based first-run experience that
  allows an operator to initialize the wiki and create the first administrator
  account without manual database editing.
- **FR-002**: The MVP MUST include all persistent data structures required for
  its planned core capabilities at initial release so operators do not need a
  destructive reinitialization to adopt later MVP features.
- **FR-003**: The system MUST support local email/password authentication as the
  default sign-in method.
- **FR-004**: The system MUST allow administrators to configure one or more
  OAuth2/OIDC external authentication providers.
- **FR-005**: The system MUST allow administrators to configure LDAP-based
  authentication.
- **FR-006**: The system MUST allow administrators to configure SAML-based
  authentication.
- **FR-007**: The system MUST create or attach a local user account record the
  first time a user successfully signs in through an external authentication
  provider.

#### Permissions and Access Control

- **FR-008**: The system MUST allow administrators to manage users, groups, and
  permission assignments for site, space, page, asset, AI, and integration
  access surfaces.
- **FR-009**: Permission evaluation MUST follow this precedence order: explicit
  deny, explicit allow, inherited page permission, space default, global default.
- **FR-010**: The system MUST treat the containing space as the parent
  permission context for top-level pages.
- **FR-011**: When a page is moved between spaces, the page's explicit page-level
  permissions MUST be cleared and replaced by inheritance from the destination
  space.
- **FR-012**: Every data retrieval path MUST execute with an explicit permission
  context and MUST NOT provide a hidden administrator bypass path.

#### Page Lifecycle, History, and Localization

- **FR-013**: The system MUST allow editors to create, update, move, tag,
  restore, and delete wiki pages using Markdown as the primary authoring format.
- **FR-014**: Page deletion MUST be a soft-delete operation by default. Deleted
  pages MUST remain recoverable during the configured retention period.
- **FR-015**: The system MUST preserve immutable page revision history for every
  content change and allow authorized users to inspect prior versions and revert
  a page to an earlier revision.
- **FR-016**: The system MUST support hierarchical page organization by path and
  treat page path plus space and locale as the canonical public identity of a
  page.
- **FR-017**: The system MUST support multilingual page content where localized
  page records are connected through a translation group rather than encoded in
  the path hierarchy.
- **FR-018**: Each space MUST have a configurable default locale.
- **FR-019**: When a requested translation is missing, the system MUST fall back
  to the space default locale and clearly indicate that the requested translation
  is unavailable.
- **FR-020**: Translation permissions MUST remain independent, so write access to
  one locale does not automatically grant write access to another locale.

#### Tags, Search, Links, and Redirects

- **FR-021**: The system MUST support tagging as a first-class content feature,
  including tag assignment, tag removal, tag management, and page retrieval by
  tag.
- **FR-022**: The system MUST automatically build or refresh full-text search
  indexes when page content is saved.
- **FR-023**: Search queries MUST enforce the caller's permission context before
  returning any result.
- **FR-024**: Search indexing and search results MUST respect page locale.
- **FR-025**: Readers MUST be able to discover content through keyword search,
  tag filtering, and page hierarchy.
- **FR-026**: The system MUST detect internal wiki links during rendering and
  mark them as valid or invalid based on the current target state.
- **FR-027**: The system MUST maintain an outbound link record for each page so
  backlinks and broken-link detection can be supported.
- **FR-028**: When a page is moved, the system MUST create a redirect record
  from the old path to the new path.
- **FR-029**: If a new page is created at a previously redirected path, the
  redirect record for that path MUST be removed.
- **FR-030**: Redirect chains MUST be resolved to the final target when redirect
  records are written, not by chained resolution during reads.

#### Rendering Pipeline and Supported Content

- **FR-031**: Markdown MUST be the primary authoring format in the MVP.
- **FR-032**: The system MUST render Markdown pages with support for Mermaid
  diagrams, LaTeX math, and draw.io diagram content in the reading experience.
- **FR-033**: Content rendering MUST execute through a structured
  `source -> parse -> transform[] -> render` pipeline.
- **FR-034**: Each transformation step in the rendering pipeline MUST be a
  discrete, replaceable plugin.
- **FR-035**: Rendering transformers MUST NOT mutate persistent data or perform
  direct data retrieval as part of rendering.
- **FR-036**: The rendering pipeline MUST support server-side execution and
  cache output by revision identity.
- **FR-037**: The final rendered output MUST always pass through a non-optional
  sanitization step before user display.
- **FR-038**: The system MUST preserve unsupported or temporarily unrenderable
  embedded content in stored source content so it can be corrected and
  re-rendered without data loss.

#### Assets and Theme System

- **FR-039**: The system MUST provide asset storage and retrieval for media,
  uploaded files, and supported diagram source artifacts referenced by wiki
  pages.
- **FR-040**: The system MUST provide a site-wide style system that allows
  administrators to choose or configure themes, including brand-oriented visual
  settings such as colors, typography, spacing feel, and navigation
  presentation.
- **FR-041**: Theme definitions MUST be stored as structured theme configuration
  mapped to design tokens and CSS custom properties.
- **FR-042**: No color, spacing, or typography value required for themeable
  product surfaces may require direct hardcoding in feature-specific styles.
- **FR-043**: The default visual presentation MUST feel calm, documentation-led,
  and easy to scan, with a polished reading experience inspired by modern
  product documentation.
- **FR-044**: Theme changes MUST apply consistently across public reading,
  authenticated reading, editing, and administration surfaces unless a surface
  explicitly requires a fixed functional treatment for usability.
- **FR-045**: The MVP MUST support one active site-wide theme at a time.

#### AI, Background Work, and Integration Surfaces

- **FR-046**: The system MUST allow administrators to define, enable, disable,
  and rotate one or more AI providers without making AI mandatory for core wiki
  usage.
- **FR-047**: When AI mode is active, the system MUST provide a persistent
  permission-scoped chat experience that is available throughout the wiki.
- **FR-048**: When AI is enabled, the system MUST allow authorized users to ask
  questions against wiki content and receive answers grounded in content they are
  permitted to read.
- **FR-049**: AI-assisted answers MUST include citations, links, or equivalent
  source references back to the wiki content used to answer the question.
- **FR-050**: Generated AI content MUST go through the normal page draft, edit,
  and save flow and MUST NOT bypass revision history or user confirmation.
- **FR-051**: The system MUST continue to provide full non-AI wiki functionality
  when no AI provider is configured or when an AI provider is temporarily
  unavailable. When AI mode is disabled, the default wiki layout MUST hide the
  AI chat pane entirely.
- **FR-052**: Any operation likely to exceed 500 milliseconds, including AI
  inference, indexing, search rebuilds, and bulk import, MUST execute as a
  background task and return a task identifier immediately to the caller.
- **FR-053**: The system MUST provide administrative visibility into background
  task type, status, progress, and result.
- **FR-054**: Synchronous AI inference during user-facing request handling MUST
  NOT be required for normal page reads or writes.
- **FR-055**: The front-end product surfaces MUST communicate with the backend
  through an internal typed application API.
- **FR-056**: The system MUST expose a public REST API for external integrations
  and automation clients.
- **FR-057**: The public REST API MUST be described by an OpenAPI contract.
- **FR-058**: The system MUST support API token authentication for external API
  consumers.
- **FR-059**: API tokens MUST support scoped access at minimum for read, write,
  and administrative operations.
- **FR-060**: All API surfaces, including internal application APIs, public REST
  APIs, and optional agent-facing protocols, MUST share the same underlying
  service behaviors and validation rules.
- **FR-061**: The system MAY expose an agent-facing protocol surface for AI
  tools to search, read, and update wiki content under the same permission rules
  as human users.
- **FR-062**: The MVP MUST initialize and expose administrative surfaces for all
  MVP data-backed domains, including site settings, themes, tags, permissions,
  assets, AI providers, AI conversations, and background task visibility. This
  feature spec explicitly defines AI conversations as a persisted MVP domain
  rather than using the constitution's default session-only chat history.
- **FR-063**: The system MUST preserve page history, tags, theme settings, AI
  provider configuration, and AI conversation records across restarts when
  persistent data volumes are retained.

### Key Entities *(include if feature involves data)*

- **User**: A person who reads, edits, administers, or chats with the wiki,
  with identity, role, and permission context.
- **Group**: A reusable collection of users used for permission assignment and
  administrative organization.
- **Space**: A top-level wiki area that groups pages, permissions, defaults, and
  navigation boundaries.
- **Translation Group**: A logical grouping that connects localized page records
  representing the same conceptual page.
- **Page**: A wiki document identified by path and locale, with authorable
  source content, rendered output, status, and organization metadata.
- **Page Revision**: An immutable historical snapshot of a page's source
  content, author, timestamp, and change context.
- **Page Link**: A record of one page referencing another internal page path for
  link validation, backlinks, and broken-link detection.
- **Page Redirect**: A redirect mapping from an old page path to the current
  canonical path after moves.
- **Tag**: A reusable label assigned to pages for discovery, grouping, and
  filtering.
- **Asset**: A stored media file or supporting source artifact referenced by
  wiki content or theming.
- **Theme**: A site-wide appearance configuration containing visual settings and
  reusable style tokens.
- **Permission Rule**: A rule assigning allow or deny effects to a user or group
  over a resource and action.
- **AI Provider**: An administrator-managed configuration that defines how the
  wiki connects to an external or self-hosted AI service.
- **AI Knowledge Record**: Derived AI-ready metadata associated with page
  revisions for retrieval, summarization, and grounded answering.
- **AI Conversation**: A record of user questions, assistant answers, citations,
  and related session context.
- **Background Task**: A persistent status record for long-running tasks such as
  indexing, imports, restores, or AI processing.

### Key Relationships

- A **Space** contains many **Pages**, and page paths are unique within a space
  and locale.
- A **Page** has many **Page Revisions**, and each save creates one new
  immutable revision.
- A **Page** has a many-to-many relationship with **Tags**.
- A **Page** has many outbound **Page Links**.
- A moved **Page** may have one or more **Page Redirect** records pointing from
  prior paths to the current canonical path.
- A **Page** belongs to one **Translation Group** when localized variants exist.
- A **User** belongs to zero or more **Groups**.
- **Groups** and **Users** receive access through **Permission Rules**.
- An **AI Provider** is associated with many **AI Conversations**.
- A **Page Revision** may have zero or more associated **AI Knowledge Records**
  depending on indexing state.
- A **Background Task** may reference a page, import run, AI process, or other
  long-running wiki operation.

## Assumptions

- MVP includes the full set of persistent domains required for the planned core
  wiki experience, but not every possible future integration or extension.
- The initial authoring experience centers on Markdown, with supported diagram
  and math content embedded within or referenced from Markdown pages.
- draw.io support in MVP focuses on storing and presenting diagrams within wiki
  content rather than advanced collaborative diagram editing workflows.
- AI chat is scoped to question-answering and draft generation over wiki
  content, not autonomous editing or workflow orchestration.
- This MVP intentionally invokes the constitution's AI chat persistence
  exception by defining AI conversations as persistent, admin-visible records.
- A single site-wide visual system is sufficient for MVP, with room for
  multiple saved themes even if only one is active at a time.
- The MVP should feel production-capable for self-hosted use even if later
  releases broaden integration depth or editor variety.

## Non-Goals

- Git-backed page storage or two-way Git synchronization
- Real-time collaborative editing
- A non-Markdown primary editor for MVP
- Elasticsearch or Meilisearch as a required deployment dependency
- Multiple simultaneously active site themes
- A page comment system
- Application-layer rate limiting for public internet exposure
- Native mobile applications

## Success Criteria *(mandatory)*

### Measurable Outcomes

- **SC-001**: A new operator can start the product, complete first-run setup,
  and reach a usable wiki home experience in under 15 minutes using the
  documented container workflow.
- **SC-002**: Editors can create, tag, revise, and publish a page containing
  Markdown, Mermaid, LaTeX, and draw.io content in a single editing session
  without losing any authored material.
- **SC-003**: 100% of page edits create a recoverable revision entry that an
  authorized user can view and restore from the product interface.
- **SC-004**: Readers can successfully find tagged or keyword-matching content
  within three interactions from the primary content navigation surface.
- **SC-005**: A moved page remains reachable from its former path for authorized
  readers immediately after the move completes.
- **SC-006**: Administrators can apply a site-wide visual style change and see
  it reflected across key reading and administration surfaces without manual file
  editing.
- **SC-007**: When AI is configured, users receive source-grounded answers to
  wiki questions with at least one citation or source link in 95% of successful
  answer responses.
- **SC-008**: When AI is not configured or unavailable, 100% of core wiki
  reading, editing, tagging, searching, and administration workflows remain
  usable.
