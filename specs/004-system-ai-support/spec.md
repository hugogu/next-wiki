# Feature Specification: System-Level AI Support

**Feature Branch**: `004-system-ai-support`
**Created**: 2026-06-20
**Status**: Implemented
**Input**: User description: "系统级配置多个 AI Provider，支持模型能力识别、Wiki 内容向量化与向量检索、基于 Wiki 内容生成配图、优化选中文本，以及以全文或 RAG 检索模式回答 Wiki 问题。生图、文本优化和问答由管理员按用户控制开关，暂不支持用户级 AI Provider。"

## User Scenarios & Testing *(mandatory)*

### User Story 1 - Configure Providers, Models, and AI Purposes (Priority: P1)

As a system administrator, I want to configure multiple system-wide AI
providers, discover or maintain their available models and capabilities, and
assign suitable models to each AI purpose, so that the wiki can use different
providers without coupling every feature to one vendor.

**Why this priority**: Every other AI capability depends on a valid provider,
known model capabilities, and an explicit model assignment. This is the
smallest independently useful administrative foundation.

**Independent Test**: Configure two providers, validate their credentials,
synchronize their model catalogs, manually correct one model capability, assign
models for text generation, embeddings, and image generation, and confirm that
only compatible models can be selected for each purpose.

**Acceptance Scenarios**:

1. **Given** an administrator opens AI settings, **When** they add a provider
   with valid connection details and credentials, **Then** the provider is
   saved at system scope and reports a successful connection test.
2. **Given** a configured provider exposes model metadata, **When** the
   administrator synchronizes its catalog, **Then** the system records each
   model and its declared capabilities, including text generation, embeddings,
   and image generation where applicable.
3. **Given** a provider does not expose sufficient model metadata, **When** the
   administrator maintains the model manually, **Then** they can declare its
   capabilities and use it like a discovered model.
4. **Given** several compatible models exist, **When** the administrator
   assigns models to the text-generation, embedding, and image-generation
   purposes, **Then** each AI feature uses the configured model for its purpose.
5. **Given** a model lacks a required capability, **When** the administrator
   attempts to assign it to that purpose, **Then** the assignment is rejected
   with a specific explanation.
6. **Given** a non-admin user, **When** they attempt to access AI provider or
   model settings directly, **Then** access is denied without exposing provider
   credentials or configuration.

---

### User Story 2 - Govern AI Features Per User (Priority: P1)

As a system administrator, I want to enable or disable image generation, text
optimization, and Wiki question answering for each user, so that access to
costly or sensitive AI features is explicitly controlled.

**Why this priority**: Per-user governance is a stated security and cost-control
boundary. It must exist before user-facing generation features are released.

**Independent Test**: Select two users, enable question answering and text
optimization for one but not the other, enable image generation for both, and
confirm each user sees and can invoke only the permitted features.

**Acceptance Scenarios**:

1. **Given** an administrator views a user, **When** they change that user's AI
   feature switches, **Then** the new permissions take effect on the user's
   next AI action.
2. **Given** a user whose question-answering switch is disabled, **When** they
   open any AI question entry point or invoke it directly, **Then** the feature
   is unavailable and no model request is made.
3. **Given** a user whose feature switch is enabled but whose role cannot edit
   pages, **When** they attempt text optimization or image insertion, **Then**
   the existing page-edit permission still denies the operation.
4. **Given** a newly registered user, **When** no administrator has granted AI
   access, **Then** image generation, text optimization, and Wiki question
   answering are disabled for that user by default.
5. **Given** AI is not configured or is globally disabled, **When** any user
   opens the wiki, **Then** the wiki remains fully usable and unavailable AI
   actions are hidden or clearly disabled.

---

### User Story 3 - Find Pages by Meaning (Priority: P1)

As a user, I want to search Wiki pages by semantic meaning rather than exact
keywords, so that I can find relevant knowledge even when my wording differs
from the page wording.

**Why this priority**: Semantic retrieval is the shared knowledge foundation for
both direct page search and retrieval-based question answering.

**Independent Test**: Publish several pages, wait for their knowledge-index
status to become ready, search using a conceptually related phrase that does not
appear verbatim, and confirm the relevant permitted pages rank above unrelated
pages with source links.

**Acceptance Scenarios**:

1. **Given** a page is published, **When** its knowledge representation is
   ready, **Then** a semantically related query can return that page even when
   the query shares no exact phrase with it.
2. **Given** a published page is updated and republished, **When** background
   processing completes, **Then** searches reflect the new published content
   rather than the superseded content.
3. **Given** a page is deleted, unpublished, or no longer readable by a user,
   **When** that user searches, **Then** the page and its excerpts do not appear
   in results.
4. **Given** indexing is delayed or fails, **When** an administrator views AI
   status, **Then** they can see affected pages, failure reasons, and trigger a
   retry or full rebuild.
5. **Given** an embedding-model assignment changes, **When** the administrator
   confirms the change, **Then** the existing knowledge index is marked for
   rebuild and mixed, incompatible representations are not used together.

---

### User Story 4 - Ask Questions Across the Wiki (Priority: P2)

As an authorized user, I want to ask questions about the Wiki in either
full-context mode or retrieval mode, so that I can choose between exhaustive
small-Wiki analysis and scalable, focused answers.

**Why this priority**: Wiki question answering is the primary user-facing
synthesis capability, but it depends on provider configuration, per-user
governance, and—when retrieval mode is used—the semantic index.

**Independent Test**: Enable question answering for a user, ask the same
question in both modes, verify each answer cites readable Wiki pages, and verify
that a page the user cannot read is neither cited nor revealed.

**Acceptance Scenarios**:

1. **Given** question answering is enabled for a user, **When** they select
   full-context mode and ask a question, **Then** the answer is based on all
   current Wiki content that the user is allowed to read and includes source
   links.
2. **Given** question answering is enabled and the semantic index is ready,
   **When** the user selects retrieval mode and asks a question, **Then** the
   system first identifies relevant readable pages and produces an answer
   grounded in those pages with source links.
3. **Given** the accessible Wiki content exceeds the selected model's
   full-context capacity, **When** the user selects full-context mode, **Then**
   the system explains why that mode cannot run and offers retrieval mode
   without silently omitting content.
4. **Given** relevant pages contain insufficient evidence, **When** the model
   cannot ground an answer, **Then** it states that the Wiki does not provide
   enough information rather than presenting an unsupported answer as fact.
5. **Given** a user lacks access to a page, **When** they ask a related
   question, **Then** neither the answer, citations, excerpts, nor error
   messages reveal that page or its contents.
6. **Given** a provider fails or times out, **When** the user asks a question,
   **Then** the user sees a recoverable failure message and can retry without
   losing the question.

---

### User Story 5 - Optimize Selected Wiki Text (Priority: P2)

As an editor or administrator who has been granted text optimization, I want AI
to improve selected text while I am editing, so that I can refine clarity,
grammar, tone, or structure without rewriting the passage manually.

**Why this priority**: Text optimization provides immediate authoring value and
uses the same governed text-generation foundation as Wiki question answering.

**Independent Test**: As an enabled editor, select a paragraph, request an
optimization, compare the original and suggestion, accept it, save the page,
and verify the normal revision history contains the user-confirmed change.

**Acceptance Scenarios**:

1. **Given** an enabled Editor or Admin selects non-empty text in the page
   editor, **When** they request optimization, **Then** they receive a proposed
   replacement while the original selection remains available for comparison.
2. **Given** an optimization suggestion, **When** the user accepts it, **Then**
   only the selected text is replaced and the page is not automatically saved
   or published.
3. **Given** an optimization suggestion, **When** the user rejects it, **Then**
   the page content remains unchanged.
4. **Given** a Reader or a user whose text-optimization switch is disabled,
   **When** they attempt the operation directly, **Then** it is denied and no
   model request is made.
5. **Given** the selected text is empty or exceeds the configured model's input
   capacity, **When** optimization is requested, **Then** the request is
   rejected with actionable guidance and no editor content is lost.

---

### User Story 6 - Generate a Relevant Page Illustration (Priority: P3)

As an editor or administrator who has been granted image generation, I want to
generate an image from existing Wiki content or my selected content and insert
the chosen result into the page, so that pages can gain relevant illustrations
without leaving the editor.

**Why this priority**: Image generation is valuable but depends on provider
capability discovery, model assignment, user governance, edit permissions, and
the existing page-image workflow.

**Independent Test**: As an enabled editor, generate an image first from the
whole current page and then from a selected passage, preview each result, insert
one into the draft, and verify that it follows normal asset permissions and is
not published until the page revision is published.

**Acceptance Scenarios**:

1. **Given** an enabled Editor or Admin is editing a page, **When** they request
   an image based on the current page, **Then** the system creates a relevant
   image using the globally assigned image-generation model and presents a
   preview before insertion.
2. **Given** the user has selected text, **When** they choose selected content
   as the image source, **Then** the generation request is based on that
   selection rather than unrelated page content.
3. **Given** a generated preview, **When** the user confirms insertion, **Then**
   the image becomes a normal page asset and a reference is inserted into the
   draft at the chosen location.
4. **Given** a generated preview, **When** the user discards it, **Then** no
   page reference is inserted and the draft remains unchanged.
5. **Given** no enabled model is assigned for image generation, **When** an
   otherwise authorized user opens the feature, **Then** the action is
   unavailable with an administrator-facing configuration explanation.
6. **Given** a Reader or a user whose image-generation switch is disabled,
   **When** they attempt generation or insertion directly, **Then** it is
   denied and no model request is made.

### Edge Cases

- A configured provider is disabled, deleted, rate-limited, or loses
  authorization while assigned to a purpose: dependent features stop using it,
  show a clear unavailable state, and never silently switch to an unapproved
  model.
- Provider catalog data conflicts with an administrator's manual capability
  override: the manual override remains effective and is visibly identified as
  such until the administrator removes it.
- A catalog refresh no longer lists an assigned model: the model is marked
  unavailable, its assignment is retained for diagnosis, and dependent calls
  are blocked until the administrator chooses a valid replacement.
- Multiple providers expose models with the same display name: models remain
  distinguishable by provider and stable model identifier.
- A page changes repeatedly while indexing is queued: only the latest eligible
  published revision becomes searchable; stale work cannot overwrite it.
- Search or retrieval runs during a full index rebuild: results use one
  consistent ready index and clearly indicate temporary unavailability if no
  consistent index exists.
- A user's access is revoked between retrieval and answer generation: the
  system revalidates access before returning citations or content.
- A provider returns unsafe, empty, malformed, or non-image output: the result
  is rejected, the page remains unchanged, and the event is recorded for
  diagnosis.
- AI-generated text contains Markdown that is invalid or changes more than the
  selected range: the user sees a preview and nothing is applied without
  explicit confirmation.
- The current Wiki has no published content: semantic search and question
  answering explain that no indexed knowledge is available.

## Requirements *(mandatory)*

### Functional Requirements

#### Provider and Model Administration

- **FR-001**: The system MUST allow administrators to create, update, enable,
  disable, test, and remove multiple system-wide AI provider configurations.
- **FR-002**: AI provider configurations and credentials MUST be available only
  to administrators; stored secrets MUST never be displayed in full after
  saving and MUST be protected at rest.
- **FR-003**: The system MUST NOT allow individual users to add, override, or
  supply their own AI providers or credentials in this feature.
- **FR-004**: The system MUST maintain a model catalog for each provider,
  containing a stable model identifier, display name, availability state,
  supported capabilities, metadata source, and last synchronization time.
- **FR-005**: The system MUST support model capability discovery from a
  provider or trusted model catalog when available, and manual model creation
  or capability override when automated metadata is unavailable or incomplete.
- **FR-006**: The initial capability taxonomy MUST distinguish at least text
  generation, embedding generation, and image generation.
- **FR-007**: Administrators MUST be able to refresh a provider's model catalog
  on demand and see whether each capability was provider-declared,
  catalog-derived, or manually declared.
- **FR-008**: The system MUST let administrators assign one enabled compatible
  model to each purpose: Wiki text generation, Wiki embedding generation, and
  Wiki image generation.
- **FR-009**: The system MUST reject purpose assignments that conflict with the
  model's known capabilities, and MUST prevent AI calls when the assigned
  provider or model is disabled or unavailable.
- **FR-010**: Changing a purpose assignment MUST affect new work only; work
  already accepted by the system MUST retain the provider and model identity
  with which it began.

#### Governance, Privacy, and Auditability

- **FR-011**: The system MUST provide separate per-user switches for image
  generation, text optimization, and Wiki question answering.
- **FR-012**: All three per-user switches MUST default to disabled for newly
  registered users and for existing users when this feature is introduced.
- **FR-013**: Only administrators MUST be able to change another user's AI
  feature switches, and changes MUST apply no later than the user's next AI
  action.
- **FR-014**: Per-user AI switches MUST only restrict access; they MUST NOT
  grant page read or edit permissions that the user's role and page permissions
  do not already provide.
- **FR-015**: Text optimization and image generation MUST require both the
  corresponding user switch and existing page edit permission; only Editor or
  Admin roles can modify page content.
- **FR-016**: Wiki question answering and semantic retrieval MUST use only
  content the requesting user is authorized to read, including all excerpts,
  prompts, intermediate retrieval results, answers, and citations.
- **FR-017**: Before a user sends Wiki content to an external AI provider, the
  interface MUST identify that an external AI service will process the content
  and identify the configured provider used for that action.
- **FR-018**: The system MUST keep an operational audit record for every AI
  action, including actor, feature, provider, model, status, start time,
  duration, and usage measurements when supplied by the provider.
- **FR-019**: AI audit records MUST NOT retain full Wiki prompts, selected text,
  generated answers, or generated images by default; administrators MUST still
  receive enough error information to diagnose failures without exposing page
  content unnecessarily.
- **FR-020**: Disabling global AI support MUST prevent provider discovery,
  embedding, image generation, text generation, and question-answering calls
  while leaving all non-AI Wiki capabilities operational.

#### Semantic Knowledge Index and Search

- **FR-021**: The system MUST create a rebuildable semantic knowledge
  representation of each page's latest published revision.
- **FR-022**: Publishing, republishing, unpublishing, soft-deleting, or restoring
  a page MUST schedule the corresponding knowledge representation to be
  created, replaced, removed, or restored without blocking the page action.
- **FR-023**: The system MUST prevent stale page processing from replacing the
  knowledge representation of a newer eligible revision.
- **FR-024**: Semantic search MUST return ranked readable pages with title,
  relevant excerpt, and canonical page link, and MUST apply access checks before
  exposing any result.
- **FR-025**: Administrators MUST be able to inspect indexing health, see
  pending and failed page counts, retry failed pages, and request a complete
  rebuild.
- **FR-026**: Changing the assigned embedding model MUST require a new
  consistent index generation; representations produced by incompatible model
  assignments MUST NOT be mixed in one search.
- **FR-027**: Search and indexing failures MUST degrade gracefully: page saves
  and reads continue to work, affected AI features report their status, and
  retryable work remains recoverable.

#### Wiki Question Answering

- **FR-028**: The system MUST offer authorized users two explicit Wiki
  question-answering modes: full-context and retrieval.
- **FR-029**: Full-context mode MUST provide the selected text-generation model
  with all current published Wiki content readable by the requesting user; it
  MUST NOT silently truncate or omit pages.
- **FR-030**: If all readable Wiki content cannot fit within the selected
  model's known input capacity, full-context mode MUST be unavailable for that
  request and the user MUST be directed to retrieval mode.
- **FR-031**: Retrieval mode MUST select relevant readable Wiki pages using the
  semantic knowledge index before generating an answer.
- **FR-032**: Every Wiki-grounded answer MUST include citations or source links
  to the pages used, and the system MUST avoid asserting an answer when the
  selected sources do not provide sufficient support.
- **FR-033**: The question interface MUST preserve the user's question and
  selected mode when a recoverable provider or indexing error occurs, allowing
  a retry.

#### Selected-Text Optimization

- **FR-034**: An authorized Editor or Admin MUST be able to request AI
  optimization for a non-empty selection in the Wiki editor.
- **FR-035**: The system MUST present the proposed replacement alongside the
  original text and require explicit acceptance before changing the draft.
- **FR-036**: Accepting an optimization MUST replace only the selected range;
  it MUST NOT automatically save or publish the page.
- **FR-037**: Rejecting or failing an optimization MUST leave the draft
  unchanged.

#### Wiki Illustration Generation

- **FR-038**: An authorized Editor or Admin MUST be able to generate an image
  from either the current page's content or an explicitly selected passage.
- **FR-039**: All image-generation requests MUST use the globally assigned
  image-generation model; users MUST NOT select an unapproved provider or model
  for an individual request.
- **FR-040**: The system MUST show generated images for review and require
  explicit confirmation before storing or inserting one into a draft.
- **FR-041**: A confirmed generated image MUST become a normal page asset,
  inherit the page's access controls, and follow the normal draft and
  publication lifecycle.
- **FR-042**: Discarded, failed, or invalid generated output MUST NOT change the
  page draft or create a visible page reference.

### Key Entities

- **AI Provider**: A system-wide connection to an external AI service, including
  its name, provider type, connection state, protected credentials, enabled
  state, and model-catalog synchronization status.
- **AI Model**: A provider-scoped model identified by a stable external
  identifier, with display metadata, availability, supported capabilities,
  capacity metadata where known, metadata source, and optional administrator
  overrides.
- **AI Purpose Assignment**: The administrator's active selection of a
  compatible provider model for text generation, embedding generation, or image
  generation.
- **User AI Entitlement**: The three administrator-controlled user switches for
  Wiki question answering, selected-text optimization, and image generation.
- **Page Knowledge Representation**: Rebuildable semantic data derived from one
  specific published page revision, associated with the embedding-model
  assignment that produced it and its processing status.
- **Knowledge Index Generation**: A consistent set of page knowledge
  representations produced by one embedding-model assignment, with lifecycle
  states for building, ready, failed, and superseded.
- **AI Action Record**: Operational metadata for one AI request or background
  AI task, recording the actor, feature, provider/model, status, timing, and
  non-content usage or error details.
- **Generated Page Asset**: An AI-produced image that becomes a regular
  permission-controlled page asset only after user confirmation.

### Assumptions and Dependencies

- The AI layer is optional; the wiki remains fully functional with no provider
  configured.
- The initial searchable and question-answerable corpus is each page's latest
  published revision. Drafts are excluded from the global knowledge corpus;
  current draft text may be sent only when an authorized editor explicitly
  invokes optimization or page-based image generation.
- Existing page read permissions determine semantic search and question-answer
  visibility. Existing role and page edit permissions determine whether
  generated text or images can modify a draft.
- Provider model catalogs may come directly from a provider or from a trusted
  cross-provider catalog. Because metadata quality varies, administrator
  overrides are required and take precedence.
- The existing page asset capability is available for storing confirmed
  generated images.
- The selected model's advertised input capacity is treated as authoritative
  for deciding whether full-context mode is available. If capacity is unknown,
  full-context mode remains unavailable until an administrator supplies a safe
  capacity value.
- AI results are suggestions. No generated text, image, page change, save, or
  publication occurs without explicit user confirmation through existing Wiki
  workflows.

### Out of Scope

- User-owned providers, user-supplied credentials, or per-request provider/model
  selection.
- Provider billing management, purchasing, cost settlement, or user quotas.
- Training or fine-tuning models on Wiki content.
- Automatically publishing AI-generated text or images.
- Indexing historical superseded revisions or treating unpublished drafts as
  part of the global Wiki knowledge corpus.
- Guaranteeing factual correctness for information not supported by readable
  Wiki sources.

## Success Criteria *(mandatory)*

### Measurable Outcomes

- **SC-001**: An administrator can configure two providers, synchronize or
  manually define their models, and assign compatible models to all three AI
  purposes in under 10 minutes.
- **SC-002**: In catalog validation tests, 100% of models assigned to a purpose
  have that purpose's required capability, and incompatible assignments are
  rejected before use.
- **SC-003**: After a page is published or republished, 95% of pages become
  available to semantic search within 2 minutes under normal operating load,
  without delaying the publish action.
- **SC-004**: For a benchmark set of conceptually related queries, at least 90%
  return a relevant readable page within the first five semantic-search
  results.
- **SC-005**: Permission tests across semantic search and both question modes
  produce zero titles, excerpts, citations, or answer details from pages the
  requesting user cannot read.
- **SC-006**: At least 95% of grounded Wiki questions complete with an answer or
  a clear "insufficient Wiki information" response within 30 seconds under
  normal provider availability.
- **SC-007**: 100% of Wiki answers that use source content include at least one
  working citation, and every citation points to a page readable by the user.
- **SC-008**: An enabled editor can request, review, and either accept or reject
  a selected-text optimization without losing unselected draft content in 100%
  of acceptance tests.
- **SC-009**: An enabled editor can generate, preview, and insert a page
  illustration in under 2 minutes, while discarded or failed generations leave
  the draft unchanged in 100% of acceptance tests.
- **SC-010**: Disabling any per-user AI switch prevents the corresponding model
  request on the user's next attempt in 100% of authorization tests.
- **SC-011**: With AI globally disabled or all providers unavailable, all
  non-AI reading, editing, publishing, and administration acceptance tests
  continue to pass.
