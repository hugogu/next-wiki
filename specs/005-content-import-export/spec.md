# Feature Specification: Content Import and Export

**Feature Branch**: `005-content-import-export`
**Created**: 2026-06-21
**Status**: Draft
**Input**: User description: "支持导入导出功能（Admin 可用），可将本站内容（包括原始 Markdown 及图片）打包成 ZIP，并通过 ZIP 导入在另一个网站还原内容；还支持通过 Wiki.js URL 和 API Key 批量导入所有 Wiki 页面，并将页面引用的图片本地化迁移。"

## User Scenarios & Testing *(mandatory)*

### User Story 1 - Export a Portable Wiki Archive (Priority: P1)

As an administrator, I want to export the current published wiki as one
downloadable archive, so that I can back it up or move it to another site
without losing original Markdown or referenced images.

**Why this priority**: A complete, portable export is the foundation for both
backup and site-to-site migration. It delivers value even before any import
workflow exists.

**Independent Test**: Create pages with nested paths, metadata, internal links,
duplicate image references, and several image formats; export the site; inspect
the archive and confirm it contains a manifest, one original Markdown source per
published page, each referenced local image exactly once, and enough metadata to
restore page identity and asset references.

**Acceptance Scenarios**:

1. **Given** a site with published pages and referenced images, **When** an
   administrator requests an export, **Then** the system creates a downloadable
   archive containing all current published pages, their original Markdown,
   required page metadata, and all referenced local images.
2. **Given** several pages reference the same image, **When** the archive is
   created, **Then** the image is included once and every page reference remains
   resolvable after restoration.
3. **Given** drafts, deleted pages, users, permissions, comments, historical
   revisions, and system configuration exist, **When** the archive is created,
   **Then** those out-of-scope records are not included.
4. **Given** an export is running, **When** the administrator views its status,
   **Then** they can see progress, totals, completion state, and any page or
   asset that could not be exported.
5. **Given** a non-admin user, **When** they attempt to start or download an
   export, **Then** access is denied.

---

### User Story 2 - Restore a Wiki from a Portable Archive (Priority: P1)

As an administrator, I want to import a previously exported archive, review its
impact, and restore its pages and images, so that I can recreate the wiki on
another site safely.

**Why this priority**: Export alone is not a complete portability solution.
Restoration proves that the archive is usable rather than merely downloadable.

**Independent Test**: Export a source site, import the archive into an empty
target site, and compare every page path, title, locale, property, Markdown
source, internal link, image reference, and image content between the two sites.

**Acceptance Scenarios**:

1. **Given** a valid archive from another site, **When** an administrator
   uploads it, **Then** the system validates its format, declared contents,
   checksums, size, and paths before changing wiki content.
2. **Given** a valid archive passes validation, **When** the administrator
   reviews the import preview, **Then** they see page and asset totals, new
   items, path conflicts, unsupported items, and the effect of the selected
   conflict strategy.
3. **Given** an empty target site, **When** the administrator confirms the
   import, **Then** all supported pages and images are restored and page image
   references resolve to local assets.
4. **Given** a page path already exists, **When** the administrator selects
   "skip existing", **Then** the existing page remains unchanged and the skipped
   page appears in the final report.
5. **Given** a page path already exists, **When** the administrator selects
   "replace existing", **Then** the imported content becomes the new published
   revision while the target site's prior revision remains recoverable.
6. **Given** an import is interrupted, **When** the same archive is retried with
   the same options, **Then** already completed items are not duplicated and the
   remaining items can complete.
7. **Given** an invalid or unsafe archive, **When** validation fails, **Then** no
   wiki content is changed and the administrator receives specific reasons.

---

### User Story 3 - Import All Content from Wiki.js (Priority: P2)

As an administrator, I want to connect to a Wiki.js site with its URL and API
token and import all accessible pages, so that I can migrate away from Wiki.js
without manually copying content.

**Why this priority**: Wiki.js migration is a major onboarding path, but it
depends on the same validation, conflict handling, asset localization, and job
reporting established by archive import.

**Independent Test**: Connect to a Wiki.js test site containing Markdown and
non-Markdown pages, multiple locales, nested paths, tags, internal links, shared
assets, and inaccessible images; run a preview and import; verify all supported
pages and assets are local, conflicts follow the chosen strategy, and failures
are itemized.

**Acceptance Scenarios**:

1. **Given** a Wiki.js base URL and API token with sufficient read permissions,
   **When** the administrator tests the connection, **Then** the system reports
   whether authentication and required page access succeed without exposing the
   token.
2. **Given** a successful connection, **When** the administrator requests a
   preview, **Then** the system enumerates all pages visible to the token and
   reports page counts, locales, content types, image counts, conflicts, and
   unsupported items before import.
3. **Given** Wiki.js pages containing Markdown, **When** they are imported,
   **Then** their source content, titles, paths, locales, descriptions, and tags
   are preserved where the target supports those fields.
4. **Given** a source page uses another supported content format, **When** it is
   imported, **Then** the content is converted to Markdown and the conversion is
   identified in the import report.
5. **Given** pages reference Wiki.js-hosted or publicly reachable images,
   **When** the import runs, **Then** each fetchable image is stored as a local
   target asset and page references are rewritten to that local asset.
6. **Given** an image is unavailable, unauthorized, unsafe to fetch, or
   unsupported, **When** its page is imported, **Then** the page import outcome
   and unresolved image reference are clearly reported without silently
   substituting unrelated content.
7. **Given** the token can access only part of the source wiki, **When** preview
   or import runs, **Then** only accessible pages are processed and the report
   states that results are limited by source permissions.

---

### User Story 4 - Audit and Manage Migration Runs (Priority: P2)

As an administrator, I want to review migration history and detailed outcomes,
so that I can verify a backup, diagnose failures, retry incomplete work, and
prove what changed.

**Why this priority**: Large migrations are operational tasks that may outlive a
browser session. Durable status and reports are required for safe administration.

**Independent Test**: Run successful, partially failed, cancelled, and retried
exports/imports; sign out and return; verify each run retains its source,
options, progress, timestamps, totals, per-item failures, and downloadable
report without retaining plaintext credentials.

**Acceptance Scenarios**:

1. **Given** an export or import has started, **When** the administrator leaves
   and returns later, **Then** the latest status and progress are still visible.
2. **Given** a run has warnings or failures, **When** the administrator opens
   its details, **Then** they can identify each affected page or asset and the
   corrective action where one is known.
3. **Given** a run is active, **When** the administrator cancels it, **Then** no
   new items start, completed items remain consistent, and the run is marked
   cancelled with accurate totals.
4. **Given** a completed or failed run used a secret source credential, **When**
   its history is viewed or exported, **Then** the credential is never revealed.

### Edge Cases

- The archive is truncated, has an unsupported format version, has a checksum
  mismatch, contains duplicate manifest entries, or omits a declared file.
- The archive attempts path traversal, absolute paths, symbolic-link escape,
  excessive expansion, an excessive file count, or disallowed file types.
- A page path is invalid in the target, differs only by case from another path,
  or collides after normalization.
- Two source pages or assets map to the same target path.
- Markdown contains relative, root-relative, encoded, query-string, fragment,
  data-URL, or external image references.
- An image is referenced by many pages, has no extension, has misleading
  content type, is too large, redirects repeatedly, or changes while imported.
- A Wiki.js endpoint is unreachable, redirects to an unexpected host, has an
  invalid certificate, times out, rate-limits requests, changes during import,
  or returns malformed/incomplete results.
- The configured source URL or an image URL resolves to a private, loopback, or
  otherwise disallowed network target.
- The source token expires or loses permission midway through discovery or
  import.
- New pages are published or existing pages are changed while an export is
  running.
- Two administrators start conflicting imports, or an import overlaps with
  another content-wide migration.
- The target runs out of storage or restarts after some pages and assets have
  completed.
- A source author does not exist on the target site.
- An imported page references another page that was skipped or failed.

## Requirements *(mandatory)*

### Functional Requirements

- **FR-001**: Only administrators MUST be able to view migration settings,
  create exports, upload archives, configure external imports, start or cancel
  runs, download archives or reports, and retry incomplete runs.
- **FR-002**: The system MUST export the current published state of every
  non-deleted page, including original Markdown, title, path, locale, supported
  page properties, and references required to reconstruct the page.
- **FR-003**: The system MUST include every local image referenced by exported
  pages, preserve its bytes and media type, avoid duplicate copies, and preserve
  the relationship between pages and assets.
- **FR-004**: Each archive MUST contain a self-describing manifest with a format
  version, creation time, source identity, item counts, page metadata, asset
  metadata, relationships, and integrity information for every included file.
- **FR-005**: Export MUST exclude drafts, deleted pages, revision history,
  users, authentication data, permissions, comments, audit records, AI data,
  storage configuration, and other system configuration.
- **FR-006**: An administrator MUST be able to monitor export progress and
  download the archive only after the run completes successfully.
- **FR-007**: Export archives and detailed reports MUST be access-controlled,
  expire after a configurable retention period, and be removable by an
  administrator before expiry.
- **FR-008**: Before applying an uploaded archive, the system MUST validate its
  supported format version, manifest completeness, declared counts, integrity,
  file paths, file types, expansion ratio, total expanded size, and item count.
- **FR-009**: Archive validation MUST reject unsafe paths, link-based escapes,
  undeclared payloads, duplicate normalized paths, and archives that exceed
  configured safety limits without changing wiki content.
- **FR-010**: A valid archive MUST produce a preview showing new pages and
  assets, existing-path conflicts, unsupported items, warnings, and projected
  outcomes before confirmation.
- **FR-011**: The administrator MUST choose a conflict strategy before import:
  skip existing pages or replace existing pages. Skip MUST be the default.
- **FR-012**: Replacing an existing page MUST create a new published revision;
  it MUST NOT erase the target site's prior revision history.
- **FR-013**: Archive import MUST restore supported page metadata, original
  Markdown, and local image references so restored pages do not depend on the
  source site.
- **FR-014**: Import operations MUST be idempotent for the same source item and
  options, allowing interrupted runs to resume or retry without duplicate pages
  or assets.
- **FR-015**: Each page and each asset MUST be applied atomically. A failed item
  MUST NOT leave a partially written page, broken asset record, or published
  reference to an uncommitted asset.
- **FR-016**: The system MUST support configuring a Wiki.js source using a base
  URL and API token, testing access, previewing the migration, and importing all
  pages visible to that token.
- **FR-017**: Wiki.js credentials MUST be encrypted at rest, hidden after entry,
  omitted from logs and reports, and removable independently of migration
  history.
- **FR-018**: Wiki.js discovery MUST collect each accessible page's content,
  title, path, locale, description, tags, content type, and available source
  timestamps where provided.
- **FR-019**: Wiki.js Markdown pages MUST preserve their source Markdown.
  Supported non-Markdown pages MUST be converted to Markdown and identified as
  converted in preview and final reports; unsupported pages MUST be skipped
  with a specific reason.
- **FR-020**: Wiki.js import MUST discover image references in source content,
  download fetchable source-hosted and public images, store them as local
  assets, deduplicate identical content, and rewrite imported page references.
- **FR-021**: Remote content fetching MUST enforce allowed protocols, response
  size and time limits, redirect limits, media validation, and network-address
  restrictions that prevent access to disallowed internal targets.
- **FR-022**: The system MUST preserve links between imported pages where a
  deterministic target path exists and MUST report links whose targets were
  skipped, failed, or cannot be resolved.
- **FR-023**: Preview and execution MUST obey the source token's permissions and
  MUST state when the discovered content set may be incomplete because of
  source access restrictions.
- **FR-024**: Long-running export and import operations MUST continue
  independently of the initiating browser session and expose durable progress,
  totals, current phase, timestamps, cancellation state, and final outcome.
- **FR-025**: The system MUST prevent concurrent operations that could apply
  conflicting content changes and MUST explain why a new run cannot start.
- **FR-026**: Administrators MUST be able to cancel an active run. Cancellation
  MUST stop scheduling new items while leaving already completed items valid and
  accurately reported.
- **FR-027**: Every run MUST produce a durable summary and per-item result
  covering source, options, created/replaced/skipped/converted/failed counts,
  warnings, errors, timestamps, and retry eligibility.
- **FR-028**: Failed or cancelled imports MUST be retryable from incomplete
  items after the administrator resolves the cause, without reprocessing
  successfully completed items unnecessarily.
- **FR-029**: Imports and exports MUST preserve normal page authorization:
  imported pages are created by the initiating administrator, and no source
  user or permission assignment is recreated.
- **FR-030**: The system MUST audit who configured a source, tested access,
  started, cancelled, retried, downloaded, or deleted an import/export artifact
  and when those actions occurred.
- **FR-031**: Export MUST use a consistent content snapshot so a page changed
  during the run is either exported wholly from the selected snapshot or
  reported for a subsequent export, never mixed across revisions.
- **FR-032**: The migration interface and all status, preview, warning, error,
  and report text MUST support the project's available locales.

### Key Entities

- **Migration Source**: A reusable external source configuration, such as a
  Wiki.js site, with its display name, endpoint identity, encrypted credential
  state, access-test result, creator, and timestamps.
- **Transfer Run**: One export, archive import, or external import operation,
  including initiator, source, selected options, phase, progress, outcome,
  cancellation state, totals, and retention dates.
- **Transfer Item**: The per-page or per-asset work record within a run,
  including source identity, target identity, checksum, action
  (create/replace/skip/convert), status, warnings, failure reason, and retry
  state.
- **Portable Archive Manifest**: The versioned inventory that describes pages,
  assets, metadata, relationships, integrity values, and archive-wide totals.
- **Imported Page Mapping**: The durable relationship between a source page and
  its target page/path, used for idempotency, link rewriting, reporting, and
  retries.
- **Imported Asset Mapping**: The durable relationship between a source asset or
  URL, its content identity, and the local target asset, used for
  deduplication, reference rewriting, and retries.
- **Transfer Artifact**: A generated archive or report with owner/run
  relationship, size, integrity value, availability, expiry, and deletion
  state.

## Assumptions and Dependencies

- The portable archive represents current published wiki content, not a full
  database backup. Drafts, deleted pages, revision history, users, permissions,
  comments, and system settings are intentionally out of scope.
- The target site already has an administrator account and a default content
  space. Imported pages are attributed to the administrator who starts the
  import; source author names may be retained only as informational metadata.
- The archive format is versioned so future releases can remain backward
  compatible or reject unsupported versions clearly.
- Wiki.js 2.2 or later is the supported external source. Its API token must have
  permission to read every page and asset the administrator expects to migrate.
- Wiki.js exposes its authenticated content interface at the site's GraphQL
  endpoint and accepts its API token as a bearer credential. The actual
  accessible content set is determined by the token's source permissions.
- Public external images referenced by source pages are eligible for
  localization when they pass network and media safety checks. Unfetchable
  images are reported rather than silently discarded.
- Existing content storage remains authoritative; this feature writes through
  the same page and asset rules used by normal publishing.
- Import/export does not replace the existing one-way Git publishing target or
  content-storage backend migration.

## Success Criteria *(mandatory)*

### Measurable Outcomes

- **SC-001**: An administrator can export a site and restore it to an empty
  target with 100% of supported published pages, original Markdown sources, and
  referenced local images matching the source by content integrity check.
- **SC-002**: For a representative migration of 1,000 pages and 5,000 referenced
  images totaling up to 2 GB, export and import each complete within 30 minutes
  under normal operating conditions, while progress remains visible throughout.
- **SC-003**: A malformed or unsafe archive changes zero pages and zero assets,
  and every rejection identifies at least one actionable validation reason.
- **SC-004**: On first attempt, at least 90% of administrators can complete the
  export-download-upload-preview-import workflow without external assistance.
- **SC-005**: For Wiki.js sources where all content and assets are accessible,
  at least 99% of supported pages import successfully in one run; every
  remaining page or asset has a specific item-level outcome.
- **SC-006**: After a successful import, 100% of localized image references on
  imported pages resolve from the target site without contacting the source
  Wiki.js site.
- **SC-007**: Retrying an interrupted import creates no duplicate pages or
  duplicate asset copies for already completed source items.
- **SC-008**: Unauthorized users can neither start transfer operations nor
  access archives, credentials, previews, reports, or migration history in
  100% of authorization tests.
