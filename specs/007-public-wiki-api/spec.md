# Feature Specification: Public Wiki Content API

**Feature Branch**: `007-public-wiki-api`  
**Created**: 2026-06-29  
**Status**: Draft  
**Input**: User description: "为 next-wiki 增加稳定的 Public Wiki Content API，使 OpenClaw、OpenCode 等外部工具能通过 API 高效访问、查询和更新 Wiki 内容，从而让 next-wiki 具备替代 Wiki.js 的基础自动化能力。本功能应把现有页面、版本、草稿、发布、资产、搜索和权限能力整理为清晰、版本化、长期稳定的外部接口，而不是让外部工具依赖当前内部前端 API。外部工具应能使用 API Key 按权限列出页面、读取页面元数据和 Markdown 源文、创建页面、保存草稿、发布版本、更新页面属性、查看历史版本、上传并引用图片/文件、搜索页面，并获得清晰的错误与审计记录。所有操作必须遵守现有 Reader/Editor/Admin 角色和 API Key scope 约束；Reader 只能读取，Editor/Admin 才能创建、编辑和发布。接口需纳入 OpenAPI 文档，提供可验证的端到端流程：创建页面、写入 Markdown、上传图片、发布、查询、更新、查看历史。MCP、AI 知识分层和高级治理能力不在本阶段范围内。"

## User Scenarios & Testing *(mandatory)*

### User Story 1 - Read Wiki Content Externally (Priority: P1)

As an external automation tool user, I want a stable public content API for
listing pages, reading page metadata, and retrieving Markdown source, so that
OpenClaw, OpenCode, scripts, and other tools can inspect the wiki without
depending on internal frontend routes.

**Why this priority**: Read access is the foundation for all external
automation and is the smallest independently useful Wiki.js replacement
capability.

**Independent Test**: Create API keys for Reader, Editor, and Admin users, then
use each key to list readable published pages, read one page's metadata, and
retrieve its Markdown source while confirming draft and protected content remain
hidden from unauthorized keys.

**Acceptance Scenarios**:

1. **Given** a Reader-owned key and published pages exist, **When** the key lists
   pages, **Then** only pages readable by that Reader are returned with stable
   identifiers, paths, titles, status, locale, and revision metadata.
2. **Given** a readable page, **When** an external tool requests the page source,
   **Then** the tool receives the current readable Markdown source and revision
   identity needed for subsequent updates.
3. **Given** a draft or unreadable page, **When** an unauthorized key requests
   it directly or through search, **Then** the response does not disclose the
   protected page's title, path, source, or existence beyond the standard access
   result.

---

### User Story 2 - Create, Update, and Publish Content (Priority: P1)

As an Editor or Admin using an external tool, I want to create pages, save
Markdown changes as drafts, update page properties, and publish revisions, so
that I can operate next-wiki from automation workflows as a practical Wiki.js
replacement.

**Why this priority**: External write and publish workflows are required before
OpenClaw or OpenCode can manage wiki content end to end.

**Independent Test**: With an Editor key, create a page, save Markdown, publish
the revision, update the page, publish a later revision, and confirm the public
reader view changes only after publication while the revision history remains
recoverable.

**Acceptance Scenarios**:

1. **Given** an Editor or Admin key, **When** it creates a page with path, title,
   and Markdown content, **Then** a draft page or draft revision is created and
   normal revision metadata is returned.
2. **Given** a published page, **When** an Editor or Admin key saves new
   Markdown, **Then** the new content is stored as a draft and the previously
   published content remains visible to Readers until publication.
3. **Given** a draft revision created through the public API, **When** an
   authorized key publishes it, **Then** the revision becomes the current
   published version and appears through read, search, and page-detail requests.
4. **Given** a Reader key, **When** it attempts to create, edit, update
   properties, upload mutable content, or publish, **Then** the operation is
   denied and no content changes.

---

### User Story 3 - Manage Assets for Page Automation (Priority: P2)

As an external tool, I want to upload images or files and receive stable
references suitable for Markdown insertion, so that automated page creation can
include local media without manual browser use.

**Why this priority**: Many wiki pages include images or attachments; migration
and daily authoring workflows are incomplete without asset support.

**Independent Test**: Upload an image with an Editor key, insert the returned
reference into a draft page, publish the page, and verify a Reader can load the
asset only when the owning page is readable.

**Acceptance Scenarios**:

1. **Given** an Editor or Admin key, **When** it uploads a supported asset for a
   page workflow, **Then** the response includes asset metadata and a Markdown-
   usable reference.
2. **Given** an asset referenced by a published readable page, **When** a Reader
   accesses the rendered page or asset reference, **Then** the asset is
   available according to the page's read permissions.
3. **Given** an unsupported, oversized, or unsafe asset, **When** an external
   tool uploads it, **Then** the request is rejected with a specific, non-
   content-leaking error.

---

### User Story 4 - Search and Audit External Operations (Priority: P2)

As an administrator and automation user, I want external tools to search pages
and have their content operations documented and audited, so that automated
wiki work is discoverable, diagnosable, and accountable.

**Why this priority**: Search enables efficient tool workflows, while audit and
contract documentation make external automation supportable over time.

**Independent Test**: Use API keys to search by title/path/content terms, run a
create-update-publish workflow, inspect the documented contract, and verify the
operations appear in user-visible and administrator-visible audit history.

**Acceptance Scenarios**:

1. **Given** a key with read permission, **When** it searches for a term, **Then**
   results contain only readable pages with enough metadata for the tool to open
   or update a selected page.
2. **Given** a successful or denied API-key operation, **When** the user or an
   administrator reviews audit history, **Then** the operation, actor, status,
   and target route are visible without exposing page source in audit fields.
3. **Given** an external developer opens the API documentation, **When** they
   inspect the public content resources, **Then** the read, write, asset,
   search, and history workflows are discoverable with request and response
   schemas.

### Edge Cases

- A key has the right API scope but belongs to a role that lacks the page action.
- A page path differs only by case, contains invalid path segments, or collides
  after normalization.
- A page is updated by the browser editor and an external tool concurrently.
- A publish request targets a stale, missing, deleted, or already-published
  revision.
- An uploaded asset is not referenced by any published page or belongs to a page
  later unpublished or deleted.
- Search finds draft or protected content that the caller cannot read.
- The external tool retries create or update requests after a network failure.
- Existing internal routes evolve while external clients still use the stable
  public contract.
- A first-party frontend workflow overlaps with a stable public content API
  workflow, risking drift between browser behavior and external automation.

## Requirements *(mandatory)*

### Functional Requirements

- **FR-001**: The system MUST expose a versioned, stable public content API for
  external tools, separate from routes intended only for first-party frontend
  behavior.
- **FR-001a**: Public content API handlers MUST act only as contract adapters
  over the same underlying wiki capabilities used by the rest of the
  application; they MUST NOT contain unique page, revision, asset, search,
  publish, or permission business rules that can diverge from browser behavior.
- **FR-001b**: When a first-party client workflow needs a content operation that
  is available through the stable public content API, the frontend MUST prefer
  that public contract instead of an overlapping internal route, unless a
  feature spec explicitly documents why the workflow remains internal-only.
- **FR-002**: The public API MUST allow authorized callers to list pages with
  stable identifiers, canonical path, title, locale, status, author metadata,
  latest revision metadata, and current published revision metadata where
  visible.
- **FR-003**: The public API MUST allow authorized callers to retrieve one
  page's metadata and readable Markdown source.
- **FR-004**: The public API MUST allow authorized Editor and Admin callers to
  create pages with a requested path, title, locale, and Markdown source.
- **FR-005**: The public API MUST allow authorized Editor and Admin callers to
  save Markdown changes as draft revisions without automatically publishing
  them.
- **FR-006**: The public API MUST allow authorized callers to publish an
  eligible draft revision according to existing publish permissions.
- **FR-007**: The public API MUST allow authorized Editor and Admin callers to
  update page properties needed for automation, including title and path, while
  preserving existing content and revision rules.
- **FR-008**: The public API MUST allow authorized callers to list revision
  history and retrieve revision metadata and source that they are permitted to
  view.
- **FR-009**: The public API MUST allow authorized Editor and Admin callers to
  upload supported assets and receive references suitable for Markdown content.
- **FR-010**: Asset reads through public workflows MUST obey the same read
  permissions as the page or revision that makes the asset visible.
- **FR-011**: The public API MUST provide page search suitable for external
  automation, returning only pages readable by the caller.
- **FR-012**: Every public content API operation MUST enforce the intersection
  of API key scopes, owning user role, page permissions, and existing publish or
  edit rules.
- **FR-013**: Reader-owned keys MUST be unable to create, edit, update
  properties, upload mutable content, delete, restore, or publish through the
  public content API.
- **FR-014**: Public API errors MUST be stable and actionable for external
  tools, with consistent codes for unauthorized, forbidden, not found,
  validation, conflict, stale revision, unsupported asset, and rate or size
  limit cases.
- **FR-015**: Protected pages, drafts, unreadable revisions, and protected asset
  relationships MUST NOT be disclosed through list, read, search, history,
  asset, validation, conflict, or error responses.
- **FR-016**: Operations performed with API keys MUST be recorded in audit
  history with actor, operation, target, status, and timing, without storing
  full Markdown source or uploaded file content in audit records.
- **FR-017**: The public content API MUST be documented in the generated API
  contract and visible in the online API documentation.
- **FR-018**: The system MUST provide a complete externally driven workflow:
  create page, write Markdown, upload asset, reference asset, publish, query,
  update, and inspect history.
- **FR-019**: The feature MUST NOT introduce MCP tools, AI knowledge layering,
  AI governance workflows, or new AI-specific behavior.
- **FR-020**: Existing first-party wiki reading, editing, publishing, asset, and
  administration workflows MUST continue to work while external public API
  routes are added.
- **FR-021**: Shared behavior between public content APIs, existing internal
  routes, and first-party UI flows MUST be verified through tests that prove the
  same permissions, validation, revision creation, publication, search
  visibility, and asset visibility decisions are applied.

### Key Entities

- **Public Page Resource**: A stable external representation of a wiki page,
  including canonical identity, path, title, locale, publication state, and
  visible revision metadata.
- **Public Revision Resource**: A stable external representation of one page
  revision, including revision number, status, author, timestamps, content type,
  source visibility, and publication state.
- **Public Asset Resource**: A stable external representation of an uploaded
  image or file that can be referenced by Markdown and read according to page
  visibility.
- **API Key Actor**: The external caller identity, combining key scopes with
  the owning user's role and status.
- **Audit Entry**: A non-content-bearing record of an external API operation
  and its result.

### Assumptions and Dependencies

- Existing Reader, Editor, and Admin roles remain authoritative for what an API
  key may do.
- "Internal API" means the application's shared service capabilities and
  validation contracts, not a requirement for public routes to make nested HTTP
  calls to existing internal route handlers.
- Existing API key scopes are reused unless planning shows a public content
  workflow cannot be represented safely with the current scope set.
- Markdown remains the source format exposed to external tools for this stage.
- Public content APIs are versioned so internal frontend route changes do not
  break OpenClaw, OpenCode, scripts, or future integrations.
- Existing first-party client routes may migrate incrementally to the public
  content API when matching public operations become available; server-rendered
  loaders may continue to call shared services directly when no client-side API
  round trip is needed.
- Search in this feature means reliable wiki content discovery; semantic search
  may be offered only when already available and permission-safe, but it is not
  required for the baseline replacement workflow.

### Out of Scope

- MCP server or MCP tool generation.
- AI knowledge layering, shared memory, or AI governance workflows.
- User-owned AI providers or AI-specific API scopes.
- Wiki.js protocol compatibility beyond supporting comparable content
  automation workflows.
- Automatic merge resolution for concurrent page edits.

## Success Criteria *(mandatory)*

### Measurable Outcomes

- **SC-001**: An external tool can complete the full create, write, upload
  asset, publish, query, update, and history workflow using only the public
  content API.
- **SC-002**: 100% of public content API authorization tests enforce both key
  scope and owning user role, including denial of write and publish actions for
  Reader-owned keys.
- **SC-003**: Permission leakage tests expose zero unreadable page titles,
  paths, Markdown source, revision details, asset relationships, or search
  results.
- **SC-004**: A developer can discover every supported public content workflow
  from the generated API documentation without reading frontend source code.
- **SC-005**: Repeated automation runs can identify created or updated pages and
  revisions through stable returned identifiers and revision metadata.
- **SC-006**: All successful, denied, and failed API-key operations in the
  supported workflow appear in audit history without retaining full page source
  or file content.
- **SC-007**: Existing browser-based reading, editing, publishing, and asset
  workflows continue to pass their acceptance tests after the public API is
  added.
- **SC-008**: For each content workflow exposed both to external tools and the
  first-party frontend, tests show equivalent outcomes for permissions,
  validation failures, created revisions, published content, search visibility,
  and audit behavior.
