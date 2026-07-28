# Feature Specification: AI Image Tools

**Feature Branch**: `029-ai-image-tools`

**Created**: 2026-07-28

**Status**: Draft

**Input**: User description: "在AI Provider上已经集成了生成图片的能力，同时Wiki的编辑也有上传图片的功能。需要把这两个能力都包装成对外的OpenAPI及MCP，包装成AI Tools以便Wiki AI能把这两个能力用起来去生成图片并上传。"

**Depends on**: 004-system-ai-support (configured image-generation models and user entitlements), 007-public-wiki-api (versioned asset contract and external MCP server), 026-wiki-ai-tool-runtime (tool governance, audit, and review semantics).

## Summary

next-wiki already lets an authorized editor generate a private page illustration,
preview it, and promote it into a normal Wiki image asset; it also accepts image
uploads and returns a Markdown-ready asset reference. This feature makes that
complete media workflow a stable integration capability. External automations
can request an illustration from an editable page revision, observe its
asynchronous outcome, inspect or discard the private result, and promote it to
a normal Wiki asset. The existing image-upload capability remains part of the
same public workflow and continues to accept caller-supplied image bytes.

The versioned public REST contract is documented through OpenAPI, and the
published MCP server offers equivalent image-generation and artifact-promotion
tools alongside its existing image-upload tool. Wiki AI gains governed built-in
media tools so it can generate an illustration and make it available for later
insertion into a draft. Generating or uploading an asset never silently edits
or publishes a page: adding the returned Markdown reference remains a normal
draft/review operation.

## User Scenarios & Testing *(mandatory)*

### User Story 1 - Generate and Promote an Image Through the Public API (Priority: P1)

As an authorized external automation user, I want to request an illustration
from an editable Wiki page revision and promote the completed result into a
normal Wiki asset, so that my integration can create page-ready media without
using browser-only editor endpoints.

**Why this priority**: A stable, permission-scoped public image workflow is the
foundation needed by every external client and is independently useful without
MCP or Wiki AI.

**Independent Test**: With an eligible Editor or Admin API key, submit a
generation request for an editable revision, observe it reach a terminal state,
promote the resulting private image, and use the returned Markdown reference in
a separately saved draft.

**Acceptance Scenarios**:

1. **Given** an eligible external caller selects an editable page revision and
   valid page or selected-text source, **When** they request an illustration,
   **Then** the system accepts the request without waiting for image creation
   and returns a stable reference for observing its status.
2. **Given** an accepted generation request completes successfully, **When**
   its authorized caller retrieves the result, **Then** they receive its
   private artifact identity, safe image metadata, and the information needed
   to preview, promote, or discard it.
3. **Given** a ready private artifact belongs to the caller and its target page,
   **When** the caller promotes it, **Then** it becomes a normal Wiki image
   asset and the response contains the same Markdown-ready reference produced
   by a direct image upload.
4. **Given** a caller retries promotion of the same ready artifact, **When**
   the original promotion already succeeded, **Then** the existing asset is
   returned and no duplicate asset is created.
5. **Given** an external caller uploads valid image bytes instead of generating
   them, **When** the upload succeeds, **Then** the caller receives an
   equivalent normal asset reference that can be used in a draft.

---

### User Story 2 - Use Image Media Through MCP (Priority: P1)

As an AI-agent user, I want the next-wiki MCP server to expose image generation,
status retrieval, generated-image promotion, and upload as clearly described
tools, so that compatible clients can create and use Wiki media with the same
permissions and outcomes as the public API.

**Why this priority**: MCP is the agent-native integration surface. It turns
the public image workflow into a usable capability for Claude Code, Cursor,
OpenCode, OpenClaw, and comparable clients.

**Independent Test**: Configure the packaged MCP server with an eligible API
key, call its image-generation tool for an editable page, obtain the completed
artifact, promote it, and verify the returned Markdown reference resolves to
the same asset visible through the public API.

**Acceptance Scenarios**:

1. **Given** an MCP client is configured with an eligible key, **When** it
   lists tools, **Then** it can discover stable tools for creating an image
   request, checking its result, promoting a generated image, and uploading a
   caller-supplied image.
2. **Given** an MCP client creates an image request, **When** the request is
   still running, **Then** the tool returns an observable pending state rather
   than blocking until the provider responds.
3. **Given** an MCP client receives a ready generated-image identity, **When**
   it promotes that identity, **Then** it does not need to download, encode, or
   resend the private image bytes to obtain a Wiki asset.
4. **Given** an existing MCP client uses the image-upload tool with valid
   encoded image bytes, **When** this feature is released, **Then** its
   established input and Markdown-reference response remain compatible.
5. **Given** the client lacks the necessary role or API-key scope, **When** it
   calls any media tool, **Then** the tool returns a clear authorization error
   and no generation request, artifact, or asset is created.

---

### User Story 3 - Let Wiki AI Generate Page Media Safely (Priority: P1)

As an authorized Wiki AI user, I want to ask the assistant to create a relevant
illustration and make it available for my page draft, so that I can add media
without leaving the conversational authoring workflow.

**Why this priority**: Wiki AI is the product's default AI-native authoring
path. It must be able to use the same image capabilities exposed to external
agents rather than relying on a separate, hidden media path.

**Independent Test**: Enable the media tools for an authorized Editor, ask Wiki
AI to create an illustration for an editable page, observe the tool activity,
let it promote the ready image, and save the returned Markdown reference in a
reviewable draft.

**Acceptance Scenarios**:

1. **Given** image media tools are enabled and the initiating user is eligible,
   **When** the user asks Wiki AI for a page illustration, **Then** Wiki AI can
   call the governed generation tool using only the user's permitted page
   content and receives a safe result summary.
2. **Given** the generated image becomes ready, **When** Wiki AI chooses to
   retain it, **Then** it can call the governed promotion tool and receive a
   normal asset reference suitable for Markdown insertion.
3. **Given** the user has not separately approved a page-content change,
   **When** Wiki AI generates or promotes an image, **Then** no page body,
   revision, or publication state changes automatically.
4. **Given** media tools, AI image access, or page-edit permission are disabled
   or revoked, **When** Wiki AI considers a media operation, **Then** it does
   not make the provider request and explains the unavailable capability safely.
5. **Given** Wiki AI invokes a media tool, **When** the chat is viewed live or
   later, **Then** it shows the tool name, status, and concise outcome without
   embedding the private image bytes or provider credentials in the transcript.

---

### User Story 4 - Govern Costly and Private Media Operations (Priority: P2)

As an administrator, I want image generation and image promotion to remain
explicitly governed, attributable, and private until the image is deliberately
used, so that external integrations and Wiki AI cannot bypass image access,
page permissions, or content-review controls.

**Why this priority**: Image generation can incur cost and produce sensitive or
unwanted media. Governance protects the owner while retaining the convenience
of agent-driven authoring.

**Independent Test**: Compare requests from an entitled Editor key, an
under-scoped Editor key, a Reader key, and a disabled user; verify only the
eligible caller can create and promote a result, and that all others leave no
new media state behind.

**Acceptance Scenarios**:

1. **Given** an administrator views the existing Wiki AI tool-management
   surface, **When** they inspect media capabilities, **Then** they can see
   their purpose, cost/write risk, required access, enabled state, and effective
   review policy.
2. **Given** a generated image is private and unpromoted, **When** a different
   user, API key, or anonymous visitor attempts to access it, **Then** the
   system does not reveal its existence or bytes.
3. **Given** a generated artifact expires or is discarded before promotion,
   **When** a caller later tries to preview or promote it, **Then** the request
   fails safely and no asset is created.
4. **Given** a configured provider, model, entitlement, or page edit right
   becomes unavailable after a request is queued, **When** the request is
   processed, **Then** it reaches a clear failed or cancelled state and no
   unvalidated output becomes a Wiki asset.

### Edge Cases

- A provider rejects the request, times out, returns malformed data, returns a
  non-image, or returns an image exceeding the existing size limit: the request
  reaches a safe terminal error, no asset is created, and the caller can retry
  with an actionable message.
- A caller supplies a stale, unreadable, deleted, or no-longer-editable page
  revision: generation is rejected without disclosing protected page content.
- A selected-text source is altered after its identity is computed: the request
  is rejected rather than generating from text the caller did not authorize.
- A direct upload contains unsupported, corrupted, oversized, or unsafe image
  data: it is rejected using the same media-validation rules as editor uploads.
- A caller attempts to promote another user's artifact or promote an artifact
  for a different page: the operation is denied without exposing the artifact.
- A user cancels a running image request: completed work is never promoted
  implicitly; an already-completed private artifact remains subject to its
  normal retention and explicit promotion rule.
- An asset is promoted but never referenced by a page revision: it follows the
  existing unreferenced-upload access and cleanup policy, and it never becomes
  anonymously readable merely because it was generated by AI.
- A Wiki AI turn reaches its tool-call limit or is cancelled while waiting for a
  generated image: it reports the pending or incomplete outcome without
  claiming that an image was uploaded or inserted.

## Requirements *(mandatory)*

### Functional Requirements

**Public media workflow**

- **FR-001**: The system MUST expose a versioned public image-generation
  workflow, documented in the generated OpenAPI contract, for creating a
  request from an editable page revision, observing its state, obtaining safe
  completed-result metadata, previewing or discarding an owned result, and
  promoting that result to a Wiki asset.
- **FR-002**: An image-generation request MUST be asynchronous: its initial
  response identifies the request, and subsequent reads report pending,
  successful, failed, cancelled, or expired outcomes without requiring a
  client to keep a request open while an AI provider runs.
- **FR-003**: The public generation input MUST preserve the existing
  page-illustration choices: a caller identifies an editable page revision and
  chooses either its page content or a bounded selected-text source; selected
  text MUST be bound to the version the caller supplied.
- **FR-004**: A successful generation result MUST remain a private,
  owner-bound temporary artifact until an explicit promotion succeeds. Public
  responses and MCP results MUST expose only its identity, media metadata,
  lifecycle state, and authorized preview reference—never provider credentials
  or raw binary data by default.
- **FR-005**: Promotion MUST validate that the caller is entitled to generate
  images, may edit the target page, owns the unexpired artifact, and is
  promoting it for the page to which the request was bound. Promotion MUST be
  idempotent.
- **FR-006**: A successful promotion MUST use the ordinary Wiki image-asset
  lifecycle and return the same stable asset metadata and Markdown-ready
  reference supplied by the public image-upload workflow.
- **FR-007**: The existing versioned image-upload operation MUST remain
  externally documented and continue to validate and sanitize supported image
  data, enforce the established size limits, and return a normal asset reference
  for authorized callers.
- **FR-008**: Generated and uploaded media MUST not alter a page's Markdown,
  create a revision, publish content, or make content anonymous-readable. A
  caller that wants to use an asset in a page MUST perform the existing draft
  and publication workflow, including any applicable review policy.

**Authorization, privacy, and availability**

- **FR-009**: Image generation through the public API and MCP MUST require an
  active Editor or Admin identity, the account's existing image-generation
  entitlement, page-edit permission, and a dedicated image-generation API-key
  scope. A key's role and scope MUST both be sufficient.
- **FR-010**: Image upload through the public API and MCP MUST continue to use
  the existing create/edit authorization boundary. All media operations MUST
  reject anonymous callers and MUST never expand a caller's page permissions.
- **FR-011**: The system MUST use only the administrator-selected,
  capability-compatible image model. It MUST not silently fall back to another
  provider or model when the selected one is disabled, unavailable, or invalid.
- **FR-012**: Every public media response that can reveal an owned private
  artifact MUST be private and non-cacheable. Missing, expired, or inaccessible
  artifacts MUST not disclose whether another caller owns an artifact.
- **FR-013**: The system MUST record image generation, cancellation, discard,
  and promotion outcomes with the initiating user or API-key owner, the
  relevant page, selected model identity, and safe lifecycle metadata. Audit
  records MUST NOT contain provider secrets or private image bytes.

**MCP and Wiki AI tools**

- **FR-014**: The published next-wiki MCP server MUST expose stable, documented
  tools for starting image generation, observing its status, promoting a ready
  generated result, and uploading caller-provided image bytes. These tools MUST
  use the same validation, authorization, lifecycle, and result semantics as
  the public API.
- **FR-015**: The existing MCP image-upload tool MUST remain backward compatible
  for callers supplying supported base64-encoded image bytes; generated-image
  promotion MUST let MCP callers retain a ready artifact without downloading and
  re-uploading its bytes.
- **FR-016**: Wiki AI MUST expose built-in tools for image generation and
  generated-image promotion through the existing managed tool provider. The
  tools MUST be explicitly registered, discoverable in the existing AI Tools
  management surface, and independently enableable under its media capability
  category.
- **FR-017**: Wiki AI media tools MUST execute under the initiating user's
  permission and entitlement context, honor the effective tool policy, appear
  in the chat tool timeline, and return only bounded safe summaries to the
  model and transcript.
- **FR-018**: An image asset returned to Wiki AI MUST be treated as an ordinary
  Markdown asset reference. Adding that reference to a page MUST use the
  existing draft-writing tool and its review rules; media tools MUST NOT bypass
  page-revision history or publication governance.

### Key Entities

- **Image generation request**: An attributable, asynchronous request to create
  one page illustration with its initiating identity, target page revision,
  selected image-model identity, source choice, lifecycle status, and safe
  outcome metadata.
- **Generated image artifact**: A private, temporary validated image associated
  with exactly one completed generation request. It may be previewed, discarded,
  or promoted only by an authorized owner before expiry.
- **Wiki image asset**: A durable, validated image available through the normal
  asset workflow after direct upload or generated-artifact promotion. Its
  visibility is determined by the existing page-reference and owner rules.
- **Media tool**: A governed capability exposed through MCP and the built-in
  Wiki AI tool provider for generating, observing, promoting, or uploading an
  image under the caller's permissions and policy.

## Success Criteria *(mandatory)*

### Measurable Outcomes

- **SC-001**: In an integration test with a configured image model, an eligible
  external client can create an image request, observe a completed result,
  promote it, and receive a Markdown-ready asset reference in 100% of successful
  provider-response runs without using editor-only routes.
- **SC-002**: In the same configured test environment, at least 95% of valid
  image-generation requests reach either a successful result or an actionable
  terminal failure within two minutes; no request remains indefinitely pending.
- **SC-003**: Across the role, API-key-scope, entitlement, and page-permission
  denial matrix, 100% of denied media-operation attempts create no generation
  request, private artifact, or durable asset.
- **SC-004**: A compatible MCP client can complete the generated-image
  promotion flow without transferring the generated image bytes back through
  the client, and receives the same asset identity and Markdown reference as an
  API caller.
- **SC-005**: In a Wiki AI acceptance flow, a user can request an illustration,
  see every media-tool status in the chat timeline, and retain the result as a
  draft-ready asset reference while the page remains unchanged until a separate
  draft action is approved or applied.

## Assumptions

- The current image-provider configuration, selected image-generation model,
  per-user image entitlement, image validation rules, artifact retention, and
  ordinary asset lifecycle are reused; this feature does not introduce a new
  provider type, storage system, or image format.
- The versioned public asset-upload operation and its MCP `upload_image` tool
  are already supported contracts. This feature preserves them while making the
  complete generated-image flow equally available and documented.
- A caller generates an illustration from an editable page revision or its
  selected text, matching the existing editor experience. Arbitrary remote-image
  URL ingestion, image editing, image-to-image generation, and bulk generation
  are out of scope.
- The public image-generation scope is a new explicit API-key permission. Its
  final identifier and migration details are design decisions, but it cannot be
  implied by general read, write, or AI-question scopes.
- No new end-user page, admin screen, or anonymous public-content route is
  required beyond extending the existing AI Tools management and chat timeline
  to represent the media tools.
- This feature exposes only next-wiki's own media capabilities. Registering or
  activating arbitrary third-party MCP media providers remains out of scope.
