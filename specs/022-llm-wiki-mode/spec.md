# Feature Specification: Wiki Writing Modes — Copilot and LLM Wiki

**Feature Branch**: `022-llm-wiki-mode`

**Created**: 2026-07-18

**Status**: Draft

**Input**: User description: "为wiki支持两种编写模式（在管理后台配置），一种是Copilot，公共空间，人和AI都可以共同编写（虽然从系统角度，分不出外部用户是人还是AI），现在的模式本质上就是这种；另一种是LLM Wiki模式，使用一个独立的raw空间在存放原始的输入（比如和AI的聊天记录（可来自Channel的集成）、所参考外部页面的原始内容、程序脚本运行过程使用的命令及输出），这个空间是只读的，只能持续地append内容，第二个是独立的generated空间用于存放AI通过分析raw空间的输入、查询到的外部信息（又会落成新的raw页面）来生成的Wiki页面，这些生成的页面，需要按Google OKF规范格式来存放，这个空间默认只有owner才能访问、编辑（用户手工修改和机器修改需要在Audit记录中有区分，以便判断一个generated空间的页面是否被人为修改过）；当然最后就是现有的wiki结构保留作为第三个wiki空间，这个空间是公开的对外空间，用户可以把generated空间的内容softlink到wiki空间的指定路径上，而不是把generated的内容又复制一次。（所以wiki空间的页面会有两类，一类是创建出来的，一类是link到另一个空间的）。对于选择了LLM Wiki模式的，wiki页面左侧的导航栏，也会显示raw/generated/wiki三个可切换的区域空间。管理员用户可对generated/wiki进行编辑。通过MCP创建的页面，直接进入generated空间。API层需要添加一个表明是创建者或内容性质是原创还是生成的字段。MCP需要额外对raw和generated空间提供支持，以便AI能方便地过滤、查询、查看其中内容。（需要结合OKF规范）需要注意的是，一般可以从copilot模式切到LLM Wiki模式，但是切回来的时候，需把raw/generated作为wiki迁移到对应的路径下，变成常规的wiki页面。这一种需要明确地提醒用户。同时，wiki模式的选择，也加入setup的步骤中，放在生成示例之前。默认使用Copilot模式。"

**Depends on**: 001-core-wiki-platform (spaces, page tree, revisions, permissions, audit), 007-public-wiki-api (v1 REST API and MCP server), 021-first-run-onboarding (first-run setup flow where mode selection is added), 004-system-ai-support (AI pipeline that consumes raw inputs and produces generated pages), 010-ai-curation-api (AI curation behaviors that write into generated space).

## Summary

next-wiki today has a single collaborative model: one wiki space where humans and AI author side by side. This feature makes that model an explicit, configurable **writing mode** called **Copilot** (the default), and adds a second mode called **LLM Wiki** for owners who want a stricter, provenance-preserving knowledge pipeline.

In LLM Wiki mode the deployment exposes three content spaces:

- **raw** — an append-only, Admin-private evidence store. Original inputs land here: AI chat transcripts (including those arriving through channel integrations), fetched external page originals, and commands plus output from script/program runs. Stored content can never be edited or deleted; new material can only be appended.
- **generated** — an Admin-private working store of AI-produced wiki pages, stored in Google OKF (Open Knowledge Format) so the space is a conformant, exportable knowledge bundle. Audit records distinguish human edits from machine edits, so it is always answerable whether a generated page has been hand-modified.
- **wiki** — the existing public space. It holds two kinds of pages: native pages created directly, and link pages that softlink a chosen wiki path to a generated-space page, publishing that content without copying it.

The writing mode is selected during first-run setup (before example-content generation, defaulting to Copilot) and can later be changed in admin settings. Switching from Copilot to LLM Wiki is non-destructive. Switching back requires migrating all raw and generated content into the wiki space as regular pages, and the system must clearly warn the operator before executing that migration.

## Clarifications

### Session 2026-07-18

- Q: What is a raw entry in the domain model — a page in the raw space's page tree, or a distinct append-only record type? → A: Raw entries are pages in the raw space; append-only is enforced at the write path, and appending to an entry creates a new immutable revision while previously stored revisions remain byte-identical.
- Q: How is "human vs machine" determined for the origin field and audit records? → A: Credential-based heuristic — session-authenticated (web UI) writes classify as human; API key, MCP, and integration-pipeline writes classify as machine/agent. A per-API-key "human-operated" override is deferred to a future phase.
- Q: Can humans create new pages directly in the generated space? → A: Yes — Admins, including the initial owner account, may create pages directly in the generated space; such pages are recorded with actor kind human and content nature original, and the origin field distinguishes them from machine-created pages.

### Session 2026-07-19

- Q: Does the raw space inherit OKF formatting from the generated space? → A: No. OKF conformance is **generated-space only**. Raw entries MUST preserve original source bytes byte-identical and MUST NOT have OKF frontmatter injected, content rewritten, or formats converted. The `inputKind` and `source` metadata live on `page_revisions.source_metadata` (DB side) and are exposed via the revision resource; they are not encoded into the body and the body is not parsed as OKF.
- Q: Where are raw entry bodies stored — database text, external file, or both? → A: **Dual-track**: the extracted plain-text representation used for retrieval, rendering, and AI consumption is stored as `page_revisions.content_source` (DB text, format indicated by `content_type`); the original file bytes (PDF, HTML, JSON export, images, raw logs) are stored through the existing `content_assets` abstraction (Local/S3/DB-blob) and referenced from the revision. Both layers reuse the existing 003 content-store architecture — no new storage subsystem.
- Q: How are raw entries classified/organized for retrieval and AI curation? → A: Raw entries carry a user-configurable category (admin-managed taxonomy in `raw_categories`). Every entry MUST be assigned a category on create; the AI curation pipeline and any future auto-archive jobs use this category to file new source material. The category is independent of the entry's `inputKind` (which captures the *source type*) and of the entry's path (free-form).
- Q: How are raw entries rendered for human readers? → A: The raw reader route selects a renderer by `content_type` and the presence of an original-byte asset (PDF viewer, JSON viewer, monospace log view, image viewer, plain text, markdown). The original bytes are always available for download verbatim; the extracted text is the default retrieval surface for search and AI.
- Q: Does the raw space participate in semantic/vector retrieval? → A: **Yes.** The existing `ai-index` job (`apps/web/src/server/jobs/ai-index.ts`) already indexes every published page across all spaces via `revision.contentSource`; raw entries' extracted-text layer is the surface it consumes, so indexing happens automatically once a raw revision is published — no new index job is needed. The semantic-retrieval permission check (`apps/web/src/server/services/ai-retrieval.ts`) currently gates only on the default space's `anonymousRead`; this MUST be made space-kind-aware so raw/generated chunks are returned only to callers permitted to read those spaces. The earlier draft's "raw is wiki-scoped only" note was based on stale 022 spec text and is incorrect against the current codebase.
- Q: How is `content_type` validated on write? → A: It MUST be a syntactically valid MIME type (RFC 2046 / IANA registry), enforced by parsing with a standard MIME-type library at the service layer and re-checked by a DB-level `CHECK` that the value matches the RFC 2046 grammar (`type "/" subtype ["+" tree] [";" params]` — params stripped before storage). No closed enumeration of allowed values is hardcoded at the DB level; the service layer MAY restrict raw creates to a curated allowlist (markdown, plain, html, json, pdf, log, image/*) while leaving the column open for future formats.

## User Scenarios & Testing *(mandatory)*

### User Story 1 - Select Writing Mode During First-Run Setup (Priority: P1)

As a new operator setting up a fresh deployment, I want the onboarding flow to ask me which writing mode the wiki uses before it offers to generate example pages, so that the deployment starts in the model that matches how I intend to work, with Copilot as the safe default.

**Why this priority**: The mode determines the space topology and where AI-created content lands from the very first page. Choosing it at setup avoids a later migration and makes the two product models explicit from day one.

**Independent Test**: Start a deployment with no users, complete first-run onboarding once choosing Copilot and once choosing LLM Wiki, and verify that (a) the mode step appears before the example-generation step, (b) Copilot is preselected, (c) the Copilot run yields exactly today's single-space behavior, and (d) the LLM Wiki run yields three spaces with example pages in the wiki space.

**Acceptance Scenarios**:

1. **Given** a fresh deployment at the first-run onboarding flow, **When** the operator reaches the setup steps, **Then** a writing-mode step is presented before the example-content step with Copilot preselected as the default.
2. **Given** the operator continues without changing the selection, **When** onboarding completes, **Then** the deployment runs in Copilot mode with the existing single public wiki space and no raw/generated spaces exposed anywhere.
3. **Given** the operator selects LLM Wiki mode and enables example pages, **When** onboarding completes, **Then** raw, generated, and wiki spaces exist and the example pages are created in the wiki space.
4. **Given** onboarding completed in one mode, **When** an Admin later opens admin settings, **Then** the current writing mode is visible and changeable subject to the mode-switch rules.

---

### User Story 2 - Capture Original Inputs into the Append-Only Raw Space (Priority: P1)

As an Admin in LLM Wiki mode, I want original inputs — AI chat transcripts, fetched external page originals, and script commands with their output — captured into a raw space that can only grow and never be rewritten, stored byte-identical with their original format preserved, and organized through a configurable category taxonomy so that both AI curation jobs and human readers can retrieve them, so that every generated page can be traced back to untampered, faithfully preserved source material.

**Why this priority**: The raw space is the evidential foundation of the LLM Wiki model. If stored inputs could be edited, deleted, or silently reformatted/rewritten, provenance claims of the generated space would be meaningless.

**Independent Test**: In LLM Wiki mode, append several raw entries of different kinds and original formats (chat transcript as JSON, external fetch as HTML, script run as plain log, manual note as markdown), each with a chosen category; then attempt to edit and delete stored content as an Admin and API client; verify all modification attempts are rejected, that each entry's original bytes are retrievable verbatim alongside an extracted-text variant, and that each entry records its input kind, source metadata, and category.

**Acceptance Scenarios**:

1. **Given** LLM Wiki mode is active, **When** an authorized source (channel integration, AI pipeline, Admin, or Admin-backed write-scoped API/MCP client) appends a new raw entry, **Then** the entry is stored with its input kind (chat transcript, external page original, script run output, or manual note), source metadata (origin channel, URL, session, timestamps), and an assigned category from the admin-managed raw taxonomy, and the stored body preserves the original source format byte-for-byte (no OKF injection, no markdown conversion, no semantic rewriting).
2. **Given** a raw entry exists with both original bytes and an extracted-text representation, **When** any user or client — including Admins — attempts to modify or delete its stored content (bytes or extracted text), **Then** the operation is rejected and the stored content remains byte-identical.
3. **Given** an ongoing input stream (e.g., a continuing chat session), **When** new material for the same stream arrives, **Then** it is appended as new content (a new revision whose body is the appended chunk in its original format, plus any associated original-byte asset) without altering what was previously stored.
4. **Given** LLM Wiki mode is active, **When** an anonymous visitor or unauthorized client requests raw content directly, **Then** access is denied; raw content is Admin-readable by default.
5. **Given** Copilot mode is active, **When** any caller attempts to append to a raw space, **Then** the operation is rejected because the raw space does not exist in that mode.
6. **Given** the admin has configured a raw category taxonomy, **When** an authorized writer creates a raw entry without specifying a category, **Then** the entry is either rejected with a category-required error or assigned the taxonomy's designated default category (per admin configuration); an entry's category is immutable after creation, consistent with the append-only rule.
7. **Given** a raw entry of a non-markdown original format (e.g., PDF, JSON, HTML, log), **When** an Admin opens the entry in the reader UI, **Then** the UI selects an appropriate renderer for the content type and also offers the original bytes for verbatim download; search and AI retrieval surfaces return the extracted text, not the raw bytes.

---

### User Story 3 - Maintain AI-Generated Pages in OKF Form (Priority: P1)

As an Admin in LLM Wiki mode, I want AI-produced pages stored in the generated space following the Google OKF convention, and I want the audit trail to separate human edits from machine edits, so that the space stays an interoperable knowledge bundle and I can tell exactly which pages a human has touched.

**Why this priority**: The generated space is the working heart of the LLM Wiki model. OKF conformance keeps it portable and agent-consumable, and the human/machine audit distinction is the owner's trust signal for content quality.

**Independent Test**: In LLM Wiki mode, create pages in the generated space via AI flows and via MCP, inspect their stored form for OKF conformance (parseable frontmatter with non-empty `type`), then hand-edit one page as an Admin and verify audit records identify which revisions are human-authored versus machine-authored.

**Acceptance Scenarios**:

1. **Given** LLM Wiki mode is active, **When** a page is created in the generated space by any writer, **Then** it is stored as an OKF-conformant concept document: Markdown with parseable YAML frontmatter containing at least a non-empty `type` field.
2. **Given** pages exist in the generated space, **When** the space is exported, **Then** the export forms a conformant OKF knowledge bundle.
3. **Given** a machine-produced generated page, **When** a human edits it, **Then** the audit record for that revision is marked as a human modification, distinguishable from machine modifications, and it remains answerable for every generated page whether it has ever been human-modified.
4. **Given** LLM Wiki mode is active, **When** a page is created through MCP or a direct API-key request without an explicit space, **Then** the page lands in the generated space (not the wiki space).
5. **Given** the generated space, **When** access is evaluated, **Then** only Admin users can access or edit it by default.
6. **Given** an Admin using a web session in LLM Wiki mode, **When** they create a page directly in the generated space, **Then** the page is stored in OKF-conformant form with its origin recorded as actor kind human and content nature original, distinguishable from machine-created pages.

---

### User Story 4 - Publish Generated Content via Softlink Pages (Priority: P1)

As an Admin in LLM Wiki mode, I want to publish a generated page by linking it to a chosen path in the public wiki space instead of copying it, so that public readers see the content while a single source of truth remains in the generated space.

**Why this priority**: The softlink is how curated AI content reaches the public without divergence. Copying would create two drifting versions; linking keeps one.

**Independent Test**: In LLM Wiki mode, create a wiki link page at a chosen path pointing to a generated page, read it anonymously, republish the generated target with changed content, and verify the wiki path reflects the update with no manual action on the link; then delete the link and verify the target is unaffected.

**Acceptance Scenarios**:

1. **Given** LLM Wiki mode is active and a generated page exists, **When** a user with publish permission creates a wiki link page at a chosen wiki path referencing that generated page, **Then** the wiki space contains a link-type page at that path and no content copy is stored for it.
2. **Given** a published wiki link page, **When** an anonymous visitor opens the wiki path, **Then** they see the target generated page's current published content rendered at that path.
3. **Given** a published wiki link page, **When** the target generated page is republished with new content or unpublished, **Then** the wiki path reflects the change automatically without any edit to the link page.
4. **Given** a wiki link page, **When** the link page is deleted, **Then** the target generated page is unaffected; when a target generated page is deleted or becomes inaccessible, **Then** the wiki link path no longer serves its content and fails gracefully.
5. **Given** the wiki space in LLM Wiki mode, **When** a user authors a page directly in it, **Then** the page is a native page coexisting with link pages, and both kinds are distinguishable in navigation and page metadata.

---

### User Story 5 - Navigate and Work Across the Three Spaces (Priority: P2)

As an Admin in LLM Wiki mode, I want the wiki's left navigation to offer raw, generated, and wiki as switchable areas, so that I can move between evidence, working drafts, and published output without leaving the product.

**Why this priority**: Space switching is the everyday orientation mechanism of the LLM Wiki model, but it delivers no content capability by itself — the spaces (P1 stories) must exist first.

**Independent Test**: In LLM Wiki mode, open the wiki UI and switch between the raw, generated, and wiki areas from the left navigation, verifying each area lists its own page tree and deep-links to a selected space; switch the deployment to Copilot mode and verify the navigation returns to the current single-space form.

**Acceptance Scenarios**:

1. **Given** LLM Wiki mode is active, **When** a permitted user opens the wiki UI, **Then** the left navigation presents raw, generated, and wiki as three switchable areas, and the selected area is reflected in the URL so it can be bookmarked and shared.
2. **Given** the raw or generated area is selected, **When** a non-Admin user opens its URL, **Then** the area's contents are not disclosed.
3. **Given** Copilot mode is active, **When** any user opens the wiki UI, **Then** the navigation shows the existing single wiki space with no raw/generated switcher.
4. **Given** a wiki link page in the tree, **When** it is displayed in navigation or page views, **Then** its linked nature and target are identifiable.

---

### User Story 6 - Query Raw and Generated Spaces via API and MCP (Priority: P2)

As an AI client connected through MCP (or an automation using the REST API), I want to list, filter, search, and read raw and generated space content — including filtering by OKF frontmatter fields and raw input kind — and I want every page to carry an explicit origin field, so that I can ground my work in evidence and distinguish original from generated material.

**Why this priority**: AI-mediated filtering and reading is what makes the raw/generated structure useful to agents, but it depends on the spaces and provenance model delivered by the P1 stories.

**Independent Test**: In LLM Wiki mode, use an MCP client to list generated pages filtered by OKF `type` and `tags`, list raw entries filtered by input kind, read entries from both spaces, and create a page via MCP verifying it lands in generated and carries a machine/origin marker; repeat reads with an unauthorized key and verify denial.

**Acceptance Scenarios**:

1. **Given** LLM Wiki mode is active, **When** an authorized MCP client lists or searches the generated space filtering by OKF frontmatter fields (e.g., `type`, `tags`), **Then** matching generated pages are returned with their frontmatter metadata.
2. **Given** LLM Wiki mode is active, **When** an authorized MCP client lists raw entries filtered by input kind or time range, **Then** matching raw entries are returned with their source metadata.
3. **Given** any page or revision in any space, **When** it is read through the public API or MCP, **Then** the response includes an origin field capturing actor kind (human versus machine/agent) and content nature (original versus AI-generated).
4. **Given** a caller lacking permission for the raw or generated space, **When** it queries either space through API or MCP, **Then** the content and its existence are not disclosed.
5. **Given** Copilot mode is active, **When** a page is created via MCP, **Then** it lands in the wiki space as today, still carrying the origin field.

---

### User Story 7 - Switch Writing Modes Safely (Priority: P2)

As an Admin, I want to switch from Copilot to LLM Wiki without losing anything, and — when switching back — to have all raw and generated content migrated into the wiki space as regular pages, with an unmistakable warning before that migration runs, so that mode changes are deliberate and never silently destructive.

**Why this priority**: Mode switching protects the owner's exit options. The Copilot→LLM Wiki direction is trivial; the return direction is the only destructive-adjacent operation and therefore needs the strongest consent UX.

**Independent Test**: Switch a populated Copilot deployment to LLM Wiki and verify all pages are untouched; then switch back and verify every raw and generated page reappears as a regular wiki page under designated path prefixes, link pages are resolved, and the operation required explicit confirmation after displaying the warning.

**Acceptance Scenarios**:

1. **Given** a Copilot deployment with existing pages, **When** an Admin switches to LLM Wiki mode, **Then** all existing content remains unchanged as the wiki space and the raw/generated spaces start empty.
2. **Given** an LLM Wiki deployment with raw, generated, and wiki content, **When** an Admin initiates switching back to Copilot, **Then** the system first presents a clear warning that all raw and generated content will be migrated into the wiki space as regular pages under designated path prefixes (e.g., `raw/…`, `generated/…`), offers the Admin a per-space choice of the migrated content's visibility (public regular pages, or Admin-only) for raw-origin and generated-origin material independently, and requires explicit confirmation before proceeding.
3. **Given** the Admin confirms the switch-back, **When** migration completes, **Then** every raw and generated page has been moved in place to a regular native wiki page at its corresponding migrated path with its page identifier and revision history preserved, each migrated page carries the visibility chosen for its source space, every live wiki link whose target has published content is converted in place to a native page holding that published content, links without an available published target are soft-deleted, and no active link remains dangling.
4. **Given** the Admin cancels at the warning, **When** the operation aborts, **Then** the deployment stays in LLM Wiki mode with all spaces untouched.
5. **Given** an LLM Wiki deployment whose raw and generated spaces are empty, **When** the Admin confirms switch-back, **Then** the migration completes trivially with zero content changes.
6. **Given** a switch-back job is pending or running, **When** any UI, API, MCP, integration, or AI pipeline caller attempts a content mutation, **Then** the mutation is rejected with a mode-switch-in-progress result while reads remain available; if the job fails terminally, all migration changes are rolled back, LLM Wiki mode remains active, and content writes become available again.

---

### Edge Cases

- Fresh deployment selects LLM Wiki during onboarding with no content at all: all three spaces exist and are empty; example pages, if requested, go to the wiki space.
- Switch-back when raw/generated spaces are empty: migration is a no-op and still requires confirmation.
- Switch-back where the Admin elects Admin-only visibility for raw-origin pages but public visibility for generated-origin pages: migrated raw pages are not anonymously readable, while migrated generated pages are; the choice applies per source space, not per individual page.
- Switch-back where a destination such as `raw/example` already exists in the wiki space: the existing wiki page remains unchanged, the migrated page receives a deterministic conflict-free suffix, and the final job report identifies the resolved path.
- Link page whose target is unpublished, deleted, or permission-restricted: the wiki path must stop serving the content and respond gracefully (not an error page exposing internals); during switch-back such a link is soft-deleted instead of publishing stale or unavailable target content.
- Multiple link pages at different wiki paths referencing the same generated target: allowed; each reflects the same current target content.
- A human edits a machine-produced generated page, then the AI pipeline wants to regenerate it: the human-modified signal is available so regeneration flows can detect and avoid silently overwriting human work.
- The owner edits a page through an MCP client: the revision records machine actor kind even though a human drove the client — an accepted, documented limitation of the credential-based heuristic until per-key overrides arrive in a future phase.
- Owner or Admin attempts to edit or delete stored raw content through UI, API, or MCP: rejected in all cases; the append-only rule has no privileged exception.
- MCP page creation in Copilot mode: lands in the wiki space exactly as today.
- Anonymous request to a raw or generated URL in LLM Wiki mode: denied without disclosing existence.
- Repeated mode toggling (Copilot → LLM Wiki → Copilot → LLM Wiki): each switch-back migrates the then-current raw/generated content into the wiki space; re-entering LLM Wiki starts with empty raw/generated spaces since prior content already lives in the wiki space.
- A long-running input stream becomes unwieldy as one raw page: the source integration may roll over to a new raw entry, linking the entries through source/session metadata; each entry remains independently append-only.
- A raw entry's original bytes are in a format the deployment cannot render (e.g., proprietary binary, unknown content type): the reader UI MUST still offer the bytes for verbatim download, fall back to a plain-text view of the extracted text (or a notice if extraction produced nothing), and never block retrieval, search, or AI consumption of the extracted text.
- Admin removes a category from the raw taxonomy while existing entries are still assigned to it: existing entries keep their category immutably; the category is retired rather than deleted (no longer selectable for new entries), and admins can list retired categories and their remaining entry counts.
- An authorized writer uploads only original bytes (e.g., a PDF) without an extracted text payload: the system derives the extracted text server-side via the existing content pipeline before publishing the revision, so search and AI retrieval have something to index; if server-side extraction is unavailable for that content type, the revision stores the original bytes alone and search indexing records the entry as text-extraction-pending.
- A raw entry is created with a content type that disagrees with the actual bytes (e.g., declared `application/pdf` but bytes are HTML): the system verifies the bytes against the declared type's magic-bytes/content sniffing and rejects with a content-type mismatch error rather than storing a mislabeled revision.
- A content write is already in flight when switch-back is requested: the mode-switch write barrier waits for that operation to finish before marking the switch pending, then rejects all new content writes until the migration completes or rolls back.

## Requirements *(mandatory)*

### Functional Requirements

**Mode configuration**

- **FR-001**: System MUST provide an instance-level writing-mode setting with two values — `copilot` (default) and `llm-wiki` — viewable and changeable by Admin users in admin settings.
- **FR-002**: First-run onboarding MUST include a writing-mode selection step placed before the example-content generation step, with `copilot` preselected as the default.
- **FR-003**: In `copilot` mode the system MUST behave exactly as the current product: a single wiki space where human and AI authors co-write, with no raw/generated spaces exposed in UI, API, or MCP.

**Spaces in LLM Wiki mode**

- **FR-004**: In `llm-wiki` mode the system MUST provide three content spaces: `raw`, `generated`, and the existing public `wiki` space.
- **FR-005**: The `raw` space MUST be append-only: raw entries are pages in the raw space's page tree and follow the normal path, permission, and revision model. New entry pages MAY be created, and new content MAY be appended to an existing entry page as a new revision; any change to previously stored content — editing an entry, or deleting an entry or any of its prior revisions — MUST be rejected for every actor, including owner and Admins.
- **FR-006**: The `raw` space MUST default to Admin-only readability; authorized sources (channel integrations, the AI pipeline, Admin users, and Admin-backed API/MCP clients with write scope) MUST be able to append entries.
- **FR-007**: Each raw entry MUST record an input kind (chat transcript, external page original, script run output, or manual note) and any available source metadata (origin channel, source URL, session reference, timestamps). Supplied initial metadata MUST be recorded on the entry and its first revision, and metadata supplied with each later append MUST be stored immutably on the revision created by that append. This metadata lives only in `page_revisions.source_metadata` (DB side); it MUST NOT be injected into the body, and the body MUST NOT be parsed or constrained as OKF frontmatter.
- **FR-007a**: Raw entry bodies MUST preserve the original source format byte-for-byte: no OKF frontmatter injection, no markdown conversion, no whitespace normalization, no semantic rewriting. The page's `content_type` captures the original format (extending beyond `text/markdown` to include at minimum `text/plain`, `text/html`, `application/json`, `application/pdf`, `text/x-log`, and common image content types). Every raw revision has an immutable content hash over its original bytes; append-only means previously stored bytes are never modified by a later append.
- **FR-007b**: Raw entries MUST be stored in a dual-track form: an **extracted-text representation** suitable for retrieval, rendering, and AI consumption (stored as `page_revisions.content_source`, MIME type indicated by `content_type`), and — when an original byte payload exists (PDF, HTML, JSON export, image, raw log) — the **original bytes** stored through the existing `content_assets` abstraction with an immutable reference from the revision. The extracted text is the default surface for lexical search (tsvector/pg_trgm) **and for semantic search** — the existing AI index job (`apps/web/src/server/jobs/ai-index.ts`) already indexes every published page across all spaces through `revision.contentSource`, so raw entries' extracted text is indexed automatically once written; no new index job is needed. The original bytes are the default surface for human verbatim viewing and download. Both storage layers MUST reuse the existing 003 content-store architecture (Database/Local/S3 backends) without introducing a new storage subsystem.
- **FR-007c**: An Admin-managed raw category taxonomy (`raw_categories`) MUST be available in LLM Wiki mode. Every raw entry MUST be assigned exactly one category at creation; the category is immutable thereafter (consistent with append-only). Authorized writers (channel integrations, AI pipeline, Admin, Admin-backed API/MCP clients) MUST be able to list categories and indicate the chosen one when creating an entry; entries missing a category MUST be rejected unless the admin has designated a default, in which case the default is applied silently. The AI curation pipeline (004/010) and any future auto-archive jobs use this category as the primary filing dimension.
- **FR-008**: Pages in the `generated` space MUST be stored as OKF v0.1-conformant concept documents (Markdown with parseable YAML frontmatter containing at least a non-empty `type` field). Creating or renaming a generated concept page to a path whose normalized final segment is the reserved OKF filename `index` or `log` MUST be rejected, and the generated space MUST have an explicit export that emits the latest revision of every non-deleted page as a conformant OKF knowledge bundle without replacing its OKF frontmatter. **OKF conformance applies to the `generated` space only**: the `wiki` and `raw` spaces MUST NOT be OKF-validated and raw entry bodies MUST NOT have OKF frontmatter injected.
- **FR-009**: The `generated` space MUST default to Admin-only access and editing. Admin users MAY create pages directly in it through the web UI; human-created pages there are recorded with actor kind human and content nature original.
- **FR-010**: Audit records MUST distinguish human modifications from machine (AI/agent) modifications on every revision, such that for every generated-space page it is answerable whether a human has ever manually modified it. Actor kind is determined by credential type: session-authenticated (web UI) writes count as human; API key, MCP, and internal-pipeline writes count as machine/agent.

**Wiki space and link pages**

- **FR-011**: The `wiki` space MUST support two page kinds: native pages authored directly, and link pages referencing a `generated`-space page as their content target.
- **FR-012**: A link page MUST render its target's current published content at its wiki path without storing a content copy; target republish, unpublish, or deletion MUST take effect at the link path without any edit to the link page.
- **FR-013**: Users with publish permission on the wiki space MUST be able to create a link page at a chosen wiki path referencing a chosen generated page, to delete a link page without affecting its target, and to create multiple link pages referencing the same target.
- **FR-014**: Anonymous and public read access MUST remain limited to the `wiki` space; `raw` and `generated` content MUST NOT be publicly reachable except through a published wiki link page. **Semantic retrieval** (`ai-retrieval.ts`) MUST be space-aware: candidates from `raw` and `generated` spaces MUST be returned only to callers who can read those spaces (Admins and Admin-backed write-scoped keys); anonymous and non-Admin callers MUST NOT receive raw/generated chunks even when the chunks exist in the shared `ai_knowledge_chunks` index. The current pre-022 retrieval path gates on the default space's `anonymousRead` — this MUST be replaced with a per-candidate space-kind check so introducing raw/generated spaces does not leak their content through the semantic search surface.

**Navigation and UI**

- **FR-015**: In `llm-wiki` mode the wiki left navigation MUST present `raw`, `generated`, and `wiki` as switchable areas whose selection is reflected in the URL; in `copilot` mode the navigation MUST remain the current single-space form.
- **FR-016**: The UI MUST identify wiki link pages (including their target) distinctly from native pages, and MUST surface the human-modified status of generated-space pages to permitted users. The raw reader UI MUST select a renderer appropriate to the entry's `content_type` (PDF viewer, JSON viewer, monospace log view, image viewer, plain text, markdown) and offer the original bytes for verbatim download when an original-byte asset exists; the renderer selector is driven entirely by stored fields and does not infer format from the body.

**API and MCP**

- **FR-017**: The public REST API and MCP MUST expose an origin field on every page and revision in every space. A page's `origin.actorKind` is the actor kind of its first revision; a revision's `origin.actorKind` is the actor kind of that revision; `origin.nature` is the page's stable content nature on both resources. Raw pages MUST have nature `original`, link pages MUST have nature `generated`, and native wiki/generated pages use the explicit nature supplied by the writer or default to machine=`generated` and human=`original`.
- **FR-018**: In `llm-wiki` mode, pages created via MCP or a direct API-key request without an explicit target space MUST be created in the `generated` space; in `copilot` mode, those calls MUST continue to land in the `wiki` space. An explicit permitted space always takes precedence.
- **FR-019**: MCP MUST provide tools to list, filter, search, and read `raw` and `generated` content — including filtering generated pages by OKF frontmatter fields (`type`, `tags`), filtering raw entries by `inputKind` (independent of any OKF field), by category from the raw taxonomy, and by time range — always subject to the caller's permissions. The `inputKind` and category filters MUST be independent dimensions: `inputKind` MUST NOT be encoded as the OKF `type` field (raw is not OKF-conformant).
- **FR-020**: API and MCP MUST let authorized callers create raw entries and append new content to existing raw entries, and MUST reject any request to modify or delete previously stored raw content. Raw create and append accept a content payload in the entry's declared `content_type` (preserved byte-identical), an optional original-byte asset (PDF, HTML, JSON, image, etc.) referenced through the existing asset abstraction, the entry's `inputKind`, and the entry's assigned category from the admin-managed taxonomy; the AI curation pipeline and future auto-archive jobs use the category as the primary filing dimension.

**Mode switching**

- **FR-021**: Switching from `copilot` to `llm-wiki` MUST preserve all existing content unchanged as the `wiki` space, with `raw` and `generated` starting empty.
- **FR-022**: Switching from `llm-wiki` to `copilot` MUST migrate every raw and generated page in place into the `wiki` space as a regular native page under designated path prefixes (`raw/…` for raw entries, `generated/…` for generated pages), preserving page identifiers, revision identifiers, revision history, and related records. Existing wiki paths MUST remain unchanged; conflicts MUST receive deterministic suffixes recorded in the migration report. Before executing, the system MUST present an explicit warning describing the migration, MUST let the Admin choose the resulting visibility per source space (public regular pages, or Admin-only) independently for raw-origin and generated-origin material, and MUST require Admin confirmation. Once confirmed, the system MUST establish a write barrier that lets in-flight content mutations finish and rejects new content mutations until the entire migration and mode flip complete atomically; a failed migration MUST roll back and leave LLM Wiki mode active.
- **FR-023**: During switch-back migration, each active wiki link page whose target has published content MUST be converted in place to a native page containing that published content; a link whose target has no available published content MUST be soft-deleted. The conversion, all page moves, and the mode flip MUST form one atomic migration so no active dangling links or partial migration state remain.

### Public Content Delivery *(required when a feature changes anonymously readable published content)*

- Wiki link pages are anonymously readable published content: their rendered representation at the wiki path MUST have the same static/ISR cache treatment as native published pages, and personalized controls (edit actions, space switcher, AI pane) MUST remain outside the cached document body.
- Cache invalidation: republishing, unpublishing, deleting, or changing the path/title/metadata of a generated target MUST invalidate every wiki link path referencing it; creating, deleting, or retargeting a link page MUST invalidate its own wiki path and the public navigation; switching writing mode MUST invalidate all affected public paths.
- Public navigation MUST NOT list raw or generated spaces; the space switcher is a personalized control outside the cached public document.

### Key Entities *(include if feature involves data)*

- **Writing Mode**: Instance-level setting (`copilot` | `llm-wiki`); default `copilot`; chosen in onboarding, changeable in admin settings; governs which spaces exist and where agent-created content lands.
- **Space**: A content partition with its own page tree and permission defaults. LLM Wiki mode comprises `raw` (append-only, Admin-private, original-format-preserving evidence store), `generated` (OKF, Admin-private), and `wiki` (public-facing).
- **Raw Entry**: A page in the raw space's page tree holding an original input, with input kind, an assigned category from the admin-managed raw taxonomy, and initial source metadata. The body preserves the original source format byte-identical (no OKF, no markdown conversion); growth is append-only (new entries, or new appended revisions on an existing entry). Each revision carries (a) extracted text in `content_source` (format indicated by `content_type`, used for retrieval, rendering, and AI consumption), (b) an optional original-bytes reference into the existing `content_assets` abstraction (used for verbatim viewing/download), and (c) that chunk's source metadata in immutable `page_revisions.source_metadata`. Stored revisions can never be edited or deleted; the evidential basis for generated pages.
- **Generated Page**: A page in the generated space stored as an OKF concept document (frontmatter `type` required), created by machine writers or directly by permitted humans; carries origin metadata that distinguishes machine-generated from human-created pages, plus a derivable human-modified status.
- **Link Page**: A wiki-space page that references a generated-space target instead of holding content; publishes the target's current content at its own path.
- **Content Origin**: Page/revision provenance comprising actor kind (human | machine, inferred from the credential type of the write — session-authenticated = human; API key, MCP, or pipeline = machine) and stable page content nature (original | generated). Page resources use the creation revision's actor kind; revision resources use that revision's actor kind; both expose the page's nature through API, MCP, and audit views.
- **Raw Category**: An Admin-managed taxonomy entry in `raw_categories` used to file raw entries for retrieval and AI curation. Every raw entry has exactly one category, assigned at creation and immutable thereafter; categories may be retired (no longer selectable for new entries) but not deleted while entries reference them. The AI curation pipeline (004/010) and any future auto-archive jobs use the category as the primary filing dimension. Independent of an entry's `inputKind` (source type) and free-form path.
- **Audit Record**: The mutation trail for every revision, explicitly distinguishing human actors from machine actors.

## Success Criteria *(mandatory)*

### Measurable Outcomes

- **SC-001**: 100% of fresh deployments present the writing-mode choice during first-run setup before example generation, and 100% of setups where the operator makes no explicit choice result in Copilot mode.
- **SC-002**: Switching from Copilot to LLM Wiki preserves 100% of existing pages with zero content migration and zero downtime for readers.
- **SC-003**: In LLM Wiki mode, 100% of attempts to modify or delete stored raw content — by any actor through any surface — are rejected, while 100% of authorized append attempts succeed.
- **SC-004**: 100% of accepted generated-space pages pass OKF v0.1 conformance checks (non-reserved concept path, parseable frontmatter, non-empty `type`), and an OKF export of the space validates as a conformant bundle without rewriting concept frontmatter.
- **SC-005**: After a generated target is republished, every wiki link path referencing it serves the updated content on the next read without any manual action on the link pages, in 100% of cases.
- **SC-006**: For 100% of generated-space pages, an Admin can determine from audit records whether the page has ever been human-modified, and 100% of API/MCP page and revision responses include the origin field.
- **SC-007**: 100% of MCP and direct API-key page-creation calls without an explicit space land in the generated space in LLM Wiki mode and in the wiki space in Copilot mode.
- **SC-008**: 100% of switch-back operations display the mandatory warning and block until explicit confirmation; confirmed migrations reject concurrent content writes, move 100% of raw and generated pages into the wiki space with stable identities and zero content loss, and leave zero active dangling links or partial migration state.
- **SC-009**: Anonymous visitors can read published native and link pages in the wiki space, with 0 unauthorized disclosures of raw or generated content through any surface.

## Assumptions

- The deployment's default is a single-owner personal instance; the owner is the initial Admin account. The current role model has no distinct owner role, so private spaces and `restricted` pages are accessible to Admins rather than to one immutable owner identity.
- The raw space defaults to Admin-only readability, mirroring the generated space; the description specifies append-only writes but not read scope, so the stricter role-based default is chosen.
- Raw entries preserve their original source format byte-identical and are not reformatted; OKF conformance applies to the generated space only. The `inputKind` and `source` metadata live on `page_revisions.source_metadata` and are not encoded into the body.
- Raw entries are stored dual-track: extracted text in `page_revisions.content_source` (retrieval/rendering/AI surface) and original bytes through `content_assets` (verbatim viewing/download). Both layers reuse the existing 003 content-store backends (Database/Local/S3); no new storage subsystem is introduced.
- Raw category taxonomy is admin-managed; every raw entry has exactly one immutable category. Auto-categorization or LLM-suggested categories are deferred to the AI curation feature (010); this feature provides the taxonomy CRUD, the per-entry assignment, and the filter surface.
- API/MCP clients with write scope may append raw entries; the raw space is never anonymously readable regardless of scope.
- OKF `type` values are producer-defined with no central registry, per OKF v0.1; the product does not impose a fixed taxonomy.
- Example and help pages offered during onboarding are generated into the wiki space in both modes.
- The autonomous AI pipeline that analyzes raw inputs and produces generated pages is delivered by other features (004/010); this feature provides the mode, spaces, provenance, and plumbing it writes through.
- Channel integrations that feed chat transcripts into the raw space (e.g., chat bots) are sources delivered elsewhere; this feature defines the raw space contract they write into.
- Re-entering LLM Wiki mode after a switch-back starts with empty raw/generated spaces; previously migrated content remains as native wiki pages and is not moved back.
- On switch-back, link pages with an available published target are converted in place into native pages holding that content; unavailable links are soft-deleted. Migrated pages carry the per-space visibility (public or Admin-only) chosen by the Admin in the confirmation step.
- In Copilot mode the origin field is still recorded and exposed, even though the raw/generated structure is absent.
- A per-API-key override designating a key as "human-operated" is deferred to a future phase; until then every API key and MCP write classifies as machine/agent.
