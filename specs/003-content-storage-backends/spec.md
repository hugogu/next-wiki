# Feature Specification: Pluggable Content Storage & In-Editor Images

**Feature Branch**: `003-content-storage-backends`
**Created**: 2026-06-19
**Status**: Draft
**Input**: User description: "Wiki编辑功能中支持添加图片，剥离 ContentStore，将原始 Markdown 文件、文件中引用的图片的存储剥离出数据库，支持本地存储、S3 存储、Git 仓库（单向）以及数据库四种存储方式。管理员可以通过后台管理面板进行相关配置。默认使用数据库存储，需要有功能帮助，在用户切换当前使用的存储介质时，进行数据的自动安全迁移。API Key 的权限控制需要加上"存储控制"、"偏好管理"的 Scope 来控制这个操作的可执行范围。"

## Clarifications

### Session 2026-06-19

- Q: Git 仓库（单向）的"单向"指哪个方向，Git 在四种后端中扮演什么角色？ → A:
  **导出功能。** Git is a one-way **export/publish target** (e.g. for publishing
  to GitHub Pages), NOT an authoritative read/write backend. The selectable
  authoritative backends are Database (default), Local filesystem, and S3. Git is
  enabled *in addition* to the active authoritative backend; on each save the
  system publishes standard Markdown + frontmatter + image files to the Git repo
  and never reads content back from it. See FR-007, FR-009.
- Q: 切换存储后端、迁移进行中时，写入（保存/发布）如何处理？ → A: **短暂只读窗口。**
  During a migration, reads continue to succeed; writes/publishes are temporarily
  blocked (a brief read-only window) until verification passes and cutover
  completes. Simplest and safest for the small-team scale. See FR-019.

## User Scenarios & Testing *(mandatory)*

### User Story 1 - Add Images While Editing a Page (Priority: P1)

As a wiki author editing a page, I want to insert images directly into the
Markdown content (by uploading a file or pasting from the clipboard), so that my
documentation can include screenshots, diagrams, and photos without hosting them
on a third-party service.

**Why this priority**: Image support is the most immediately visible,
self-contained piece of user value and the concrete reason the storage layer
must be decoupled (images cannot reasonably live as inline columns the way text
does). It is independently shippable on top of the default database backend
before any alternative backend exists.

**Independent Test**: Open the page editor, upload an image (and separately paste
one from the clipboard), confirm a reference appears in the Markdown and the
image renders in the live preview and on the published page after save. Reload
and reopen in a different browser to confirm the image persists.

**Acceptance Scenarios**:

1. **Given** a user editing a page, **When** they upload an image file, **Then**
   an image reference is inserted at the cursor and the image renders in the
   editor preview.
2. **Given** a user editing a page, **When** they paste image data from the
   clipboard, **Then** the image is stored and referenced the same way as an
   uploaded file.
3. **Given** a page that references uploaded images, **When** the page is saved
   and published, **Then** every referenced image renders on the public read
   view for any user permitted to read the page.
4. **Given** an upload that exceeds the allowed size or uses an unsupported file
   type, **When** the user attempts it, **Then** the upload is rejected with a
   clear message and no broken reference is inserted.
5. **Given** a page referencing an image, **When** a user without read
   permission on that page requests the image, **Then** the image is not served
   (image access follows the same permission as the page).

---

### User Story 2 - Admin Configures the Content Storage Backend (Priority: P2)

As an administrator, I want a settings area in the admin panel where I can choose
and configure where raw page content (Markdown source files and their referenced
images) is stored — Database, Local filesystem, S3-compatible object storage, or
a Git repository (one-way) — so that I can match the deployment to my operational
needs (backup strategy, portability, scale) without code changes.

**Why this priority**: The configurable backend is the core of this feature. It
depends on the content layer being decoupled from the database (US1's storage
abstraction) and unlocks US3 (migration). Until an admin can select a backend,
the alternative storage methods deliver no value.

**Independent Test**: Sign in as admin, open Admin → Content Storage, see
"Database" selected as the active backend by default, configure the connection
details for an alternative backend (e.g. an S3 bucket), run the built-in
connection test, and see it report success — all without restarting the
application.

**Acceptance Scenarios**:

1. **Given** a fresh deployment, **When** the admin opens the content storage
   settings, **Then** the active backend is "Database" by default and the wiki
   functions with PostgreSQL as the only required stateful service.
2. **Given** the storage settings page, **When** the admin selects an
   alternative backend and enters its configuration, **Then** the system
   validates the configuration and offers a connection/health test before the
   backend can be activated.
3. **Given** invalid or incomplete backend configuration, **When** the admin
   tries to save or test it, **Then** the system rejects it with a specific
   error and does not change the active backend.
4. **Given** a configured backend that holds credentials (e.g. S3 keys, Git
   token), **When** the admin views the settings later, **Then** secrets are not
   displayed in plaintext and are stored encrypted at rest.
5. **Given** a non-admin user, **When** they attempt to open the content storage
   settings by URL, **Then** they are denied without confirming the page exists
   (consistent with the existing admin not-found/forbidden pattern).

---

### User Story 3 - Safe Automatic Migration When Switching Backends (Priority: P2)

As an administrator changing the active storage backend, I want the system to
automatically and safely migrate all existing content (Markdown sources and
referenced images) from the current backend to the new one, with progress
visibility and protection against data loss, so that switching storage is a
guided, safe operation rather than a manual, error-prone data move.

**Why this priority**: Without safe migration, changing the backend would strand
existing content and make the configurability of US2 unusable in practice. It
depends on US2 (a target backend must be selectable) and on the decoupled
storage layer.

**Independent Test**: With content present on the Database backend, switch the
active backend to an alternative; observe a migration job start, report progress,
and complete; verify every page and image now reads correctly from the new
backend; verify the wiki remained readable throughout and that an induced
failure mid-migration leaves the original backend intact and active.

**Acceptance Scenarios**:

1. **Given** content exists on the current backend, **When** the admin confirms
   a switch to a new backend, **Then** a migration runs as a background job and
   the admin sees its progress and final status without the request blocking.
2. **Given** a migration in progress, **When** the admin views the storage
   settings, **Then** they see the migration is running, what fraction is
   complete, and that the active backend has not yet changed.
3. **Given** a migration that completes successfully, **When** it finishes,
   **Then** the system verifies every migrated item against the source (e.g. by
   content fingerprint and count) before activating the new backend, and only
   then makes the new backend authoritative.
4. **Given** a migration that fails or is aborted, **When** the failure occurs,
   **Then** the active backend remains the original one, no content is lost, and
   the admin sees a clear failure reason and can retry.
5. **Given** a migration in progress, **When** users read existing pages,
   **Then** reads continue to succeed; write/publish behavior during the
   migration window follows the availability rule defined in FR-019.
6. **Given** a completed migration, **When** the admin chooses to, **Then** they
   can verify the previous backend's data is retained (not destroyed) until they
   explicitly clean it up.

---

### User Story 4 - Govern Storage & Preference Operations via API Key Scopes (Priority: P3)

As a user issuing API keys for automation, I want two additional scopes —
"storage control" and "preference management" — so that a key can be limited to
(or excluded from) configuring storage backends/migrations and managing display
preferences, keeping automated agents within a bounded, auditable permission set.

**Why this priority**: It extends the existing API-key permission model (feature
002) to cover the new operations this feature introduces. It depends on US2/US3
(the operations the scopes gate) and on the existing scope-intersection model.

**Independent Test**: Create a key with only the `storage` scope owned by an
admin; use it to read storage configuration and trigger a migration successfully;
use a key without `storage` to attempt the same and receive a 403. Create a key
with `preferences` scope and update the owner's display preferences; without it,
receive a 403.

**Acceptance Scenarios**:

1. **Given** the API key creation UI, **When** a user creates a key, **Then**
   `storage` (存储控制) and `preferences` (偏好管理) appear as selectable scopes
   alongside the existing ones.
2. **Given** a key carrying the `storage` scope owned by an admin, **When** a
   client calls a storage-configuration or migration endpoint, **Then** the
   request is permitted (scope ∩ role allows it).
3. **Given** a key carrying the `storage` scope owned by a **non-admin**, **When**
   a client calls a storage-configuration endpoint, **Then** the request is
   denied because the owner's role does not permit storage administration
   (scope ∩ role = ∅).
4. **Given** a key without the `preferences` scope, **When** a client calls an
   endpoint that changes display preferences, **Then** the request is denied with
   403.
5. **Given** any API call made with these scopes, **When** it executes, **Then**
   it is recorded in the API audit log exactly like other key-authenticated
   calls (feature 002).

---

### Edge Cases

- **Image referenced by multiple pages/revisions**: deleting one page must not
  remove an image still referenced by another page or an older revision. Asset
  lifecycle is reference-aware; orphan cleanup is a separate, conservative
  operation.
- **Image orphaned by edit**: when an author removes an image reference and
  saves, the image becomes unreferenced; it is not hard-deleted immediately
  (consistent with soft-delete / version-everything) and may be garbage-collected
  later by a bounded cleanup.
- **Backend unreachable at read time** (e.g. S3 outage, Git remote down): the
  page text still renders if its source is available; missing images show a
  clear "image unavailable" placeholder rather than a broken layout, and the
  error is logged.
- **Backend unreachable when saving**: the save fails atomically with a clear
  error; no revision is recorded that points at content the backend never
  accepted.
- **Switching to a backend that already contains data** (e.g. a Git repo or S3
  bucket with prior content): the system must detect non-empty targets and
  require explicit admin confirmation, never silently overwrite.
- **Migration interrupted by process restart**: the migration job is resumable
  or safely restartable; a partial migration never becomes the active backend.
- **Two admins trigger migration concurrently**: only one migration may run at a
  time; the second is rejected with a clear "migration already in progress"
  message.
- **Git export failure**: if a push to the Git remote fails (auth, network,
  conflict), the page save against the authoritative backend MUST still succeed;
  the failed export is surfaced/retried separately and never blocks authoring.
- **External commits to the Git repo**: humans pushing edits directly to the
  export repo are ignored (one-way); the system never reads them back and may
  overwrite them on the next export.
- **Large content set migration**: migration of a large corpus runs without
  blocking the UI and without holding a single long database transaction;
  progress is reported incrementally.
- **Secret rotation**: an admin updates S3 keys or a Git token; existing
  references keep working and the new credential takes effect without data loss.
- **Per-page permission on images**: an image's accessibility is tied to its
  owning page's read permission, not to a public asset URL guessable by anyone.

## Requirements *(mandatory)*

### Functional Requirements

#### In-Editor Images

- **FR-001**: The page editor MUST let an author add images to Markdown content
  by (a) uploading a file and (b) pasting image data from the clipboard, with the
  appropriate Markdown image reference inserted automatically.
- **FR-002**: Uploaded images MUST be persisted in the active content storage
  backend (see FR-006) and rendered in both the editor preview and the published
  read view.
- **FR-003**: The system MUST validate image uploads against a configurable
  maximum file size and an allowed set of image types, rejecting violations with
  a clear, localized message and inserting no broken reference.
- **FR-004**: Image references stored inside Markdown MUST be backend-agnostic
  stable identifiers (resolved by the application at render time), NOT raw
  backend-specific paths, so that switching backends does not require rewriting
  page content.
- **FR-005**: Serving an image MUST enforce the same read permission as its
  owning page; an image MUST NOT be retrievable by a user who cannot read the
  page that references it.

#### Content Storage Abstraction (剥离 ContentStore)

- **FR-006**: The system MUST store raw page content — the Markdown source and
  its referenced images ("content assets") — through a single, pluggable content
  storage abstraction, decoupled from the relational database, so that the
  storage medium can change without altering page, revision, or permission
  models.
- **FR-007**: The system MUST support four content storage methods. Three are
  **selectable authoritative backends** (read + write, exactly one active at a
  time): **Database** (default), **Local filesystem**, and **S3-compatible object
  storage**. The fourth, **Git repository**, is a **one-way export/publish
  target** (see FR-009) that is enabled *in addition* to the active authoritative
  backend, not selected in its place.
- **FR-008**: The Database backend MUST keep the deployment's only required
  stateful service as PostgreSQL (constitution P1); selecting Local, S3, or Git
  MUST be an explicit, optional choice and MUST NOT become a baseline
  requirement.
- **FR-009**: The Git target MUST operate **one-way as an export/publish
  function**: the active authoritative backend (Database/Local/S3) remains the
  source of truth, and on each successful save the system publishes standard
  Markdown + frontmatter + image files to the configured Git repository (commit
  and push to a configured remote/branch). The system MUST NOT read content back
  from Git and MUST NOT attempt to reconcile external commits pushed to the repo
  by humans. This supports downstream workflows such as publishing to GitHub
  Pages. Git export is optional and independent of which authoritative backend is
  active.
- **FR-010**: Page revision metadata, rendered HTML, content fingerprints, and
  permissions MUST continue to live in the database regardless of the active
  backend; only the raw Markdown source and image bytes move to the selected
  backend (preserving constitution P3 rendering and P7 versioning).
- **FR-011**: The content storage backends MUST be explicitly registered in a
  single, traceable registry with a typed, testable contract (constitution P9);
  no filesystem/dynamic-discovery loading of backends.
- **FR-012**: Reading or writing content through any backend MUST surface backend
  errors as actionable failures (save fails atomically; read degrades gracefully
  for images per Edge Cases) and MUST never silently corrupt or partially write a
  revision.

#### Admin Configuration

- **FR-013**: The system MUST provide an admin-panel area to view the active
  content storage backend and to configure each backend's settings (e.g.
  filesystem path, S3 endpoint/bucket/region/credentials, Git remote/branch/
  credentials).
- **FR-014**: Backend credentials and other secrets MUST be stored encrypted at
  rest and MUST NOT be displayed in plaintext after entry, consistent with the
  existing encrypted-settings approach.
- **FR-015**: Before a backend can be activated, the system MUST validate its
  configuration and provide a connection/health test that reports success or a
  specific failure reason.
- **FR-016**: Access to content storage configuration and migration MUST be
  restricted to administrators and MUST flow through the existing permission
  chokepoint (`can()`); non-admins MUST be denied without confirming the page
  exists.

#### Safe Migration

- **FR-017**: When an admin switches the active backend, the system MUST migrate
  all existing content assets from the current backend to the target backend as
  an asynchronous background job (constitution P6), returning immediately and
  reporting progress and final status.
- **FR-018**: Migration MUST be safe: the system MUST copy and verify all items
  on the target (e.g. by count and content fingerprint) BEFORE making the target
  the active/authoritative backend; on any failure or abort the original backend
  MUST remain active with no data loss, and the admin MUST see a clear reason and
  be able to retry.
- **FR-019**: During a migration, reads of existing content MUST continue to
  succeed. Writes (page saves/publishes and image uploads) MUST be temporarily
  blocked during the migration window — a brief read-only window — until target
  verification passes and cutover completes; the read-only state MUST be clearly
  communicated to users attempting to write, and writes resume automatically once
  the migration finishes (or is aborted, returning to the original backend).
- **FR-020**: The system MUST prevent concurrent migrations (only one at a time)
  and MUST require explicit admin confirmation before overwriting or writing into
  a target backend that already contains data.
- **FR-021**: The previous backend's data MUST be retained after a successful
  migration until the admin explicitly cleans it up (no automatic destructive
  delete of the source).
- **FR-022**: A migration interrupted by a process restart MUST be safely
  resumable or restartable and MUST never leave a partially migrated target as
  the active backend.

#### API Key Scopes (权限控制)

- **FR-023**: The system MUST add two predefined API-key scopes: `storage`
  (存储控制) — governs reading/changing storage configuration and triggering
  migrations; and `preferences` (偏好管理) — governs reading/changing display
  preferences (theme, language). These extend the existing scope enum without a
  breaking change.
- **FR-024**: The effective permission for a key-authenticated request using the
  new scopes MUST remain the intersection of (the key's scopes) and (the owner's
  role permissions); e.g. a non-admin's `storage`-scoped key cannot administer
  storage (consistent with feature 002, FR-013).
- **FR-025**: Every API call exercising the new scopes MUST be recorded in the
  API audit log identically to other key-authenticated calls (feature 002).
- **FR-026**: The new scopes MUST appear in the API-key creation UI and in the
  online API documentation alongside the existing scopes, with localized labels.

#### Cross-Cutting

- **FR-027**: All new UI (editor image controls, admin storage settings,
  migration status) MUST follow the existing unified design system and support
  both English and Chinese via the established i18n framework, with no hardcoded
  user-facing strings.
- **FR-028**: Every new route MUST be a real, bookmarkable URL with working
  browser back/forward/refresh/deep-link behavior (constitution P10), and storage
  administration MUST have exactly one canonical entry point.
- **FR-029**: Content exported to Local, S3, or Git MUST use standard Markdown
  (with frontmatter where applicable) and standard image files, avoiding
  proprietary formats so the stored content remains portable (constitution P8).

### Key Entities *(include if feature involves data)*

- **Content Asset**: a stored unit of raw content — either a Markdown source
  document tied to a page revision, or an image referenced by Markdown. Has a
  stable backend-agnostic identifier, a content type, a size, a content
  fingerprint, and a reference relationship to the page/revision that uses it.
  Lives in the active storage backend; never directly addressed by a backend path
  from inside Markdown.
- **Storage Backend Configuration**: the admin-managed definition of where
  content assets are stored. Authoritative backends have a type (`database`,
  `local`, `s3`), an active/inactive state (exactly one active), type-specific
  settings, and encrypted secrets — only one is authoritative at any time. The
  **Git export target** is a separate, independently enabled configuration
  (remote, branch, credentials) that mirrors content one-way and is never
  authoritative.
- **Migration Job**: an asynchronous, single-instance operation that copies and
  verifies all content assets from the current backend to a target backend,
  tracking progress, item counts, verification results, status (pending,
  running, verifying, completed, failed, aborted), and the outcome that
  determines whether cutover occurs.
- **API Key Scope (extended)**: the existing immutable per-key permission set,
  now including `storage` and `preferences` in addition to `view`, `create`,
  `edit`, `delete`, `share`, `run`.

## Success Criteria *(mandatory)*

### Measurable Outcomes

- **SC-001**: An author can insert an image (via upload or paste) and see it
  render in preview within a few seconds, and on the published page after save,
  with zero manual file-hosting steps.
- **SC-002**: On a fresh install with no extra configuration, the wiki stores all
  content in PostgreSQL and requires no object storage, filesystem mount, or Git
  remote to be fully functional.
- **SC-003**: An admin can switch the active storage backend and have all
  existing pages and images served correctly from the new backend, with the
  switch performed entirely from the admin panel (no manual data copying, no
  redeploy).
- **SC-004**: A storage migration never loses or corrupts content: after any
  completed, failed, or aborted migration, 100% of pages and images remain
  readable, verified by content-fingerprint equality between source and the
  active backend.
- **SC-005**: The wiki remains readable for end users throughout a storage
  migration (no read downtime for existing content).
- **SC-006**: An admin can determine the progress and outcome of a running
  migration at any time from the admin panel.
- **SC-007**: A key restricted to a given scope can perform only the operations
  that scope (intersected with the owner's role) permits, verified by a denied
  (403) call for out-of-scope operations and a successful call for in-scope ones.
- **SC-008**: Switching the authoritative backend between any pair of Database,
  Local, and S3 is supported and verifiable on a small-team dataset; enabling Git
  export publishes the same content as standard Markdown + assets to the
  configured repository.
- **SC-009**: Every new page and control ships in both English and Chinese with
  no hardcoded user-facing strings.

## Assumptions

These reasonable defaults were inferred from the description, the existing
codebase, and the project constitution; they can be revised via
`/speckit.clarify` before planning.

- **A1 — Database remains the default and only baseline-required backend.**
  Consistent with constitution P1 (PostgreSQL as the only required stateful
  service). Local/S3/Git are explicit opt-in choices. See FR-007, FR-008.
- **A2 — Only raw content moves out of the database.** Revision metadata,
  rendered HTML, content fingerprints, and permissions stay in PostgreSQL so the
  rendering pipeline (P3) and versioning (P7) are unaffected. The non-DB backend
  holds the authoritative raw Markdown + image bytes when active. See FR-010.
- **A3 — Markdown stores stable, backend-agnostic image references**, resolved by
  the app at render time and served through a permission-checked endpoint. This
  keeps page content portable across backends and keeps images private. See
  FR-004, FR-005.
- **A4 — Migration is asynchronous, copy-then-verify-then-cutover, and
  non-destructive to the source.** A background job (P6) copies all assets,
  verifies them, and only then activates the target; the previous backend's data
  is kept until explicit cleanup. See FR-017, FR-018, FR-021.
- **A5 — Image lifecycle follows soft-delete / version-everything.** Unreferenced
  images are not hard-deleted on edit; a conservative, reference-aware cleanup may
  reclaim true orphans later. See Edge Cases, P7.
- **A6 — `preferences` scope governs the calling user's own display
  preferences** (theme, language) introduced in feature 002, not system-wide
  settings. System/storage settings are governed by `storage` + admin role. See
  FR-023.
- **A7 — `storage` scope is only effective for admins** because storage
  administration requires the admin role; scope ∩ role applies. A non-admin's
  `storage`-scoped key cannot administer storage. See FR-024.
- **A8 — Stored content uses standard Markdown + frontmatter and standard image
  files** on Local/S3/Git, avoiding vendor lock-in (P8). See FR-029.
- **A9 — Backend secrets reuse the existing encrypted-settings mechanism** used
  for other admin secrets, rather than introducing a new secret store. See
  FR-014.
- **A10 — One migration at a time, gated against non-empty targets.** Concurrency
  is rejected and non-empty targets require explicit confirmation to avoid
  accidental overwrite. See FR-020.
- **A11 — Git is a one-way export target, not an authoritative backend
  (confirmed).** The active authoritative backend stays Database/Local/S3; Git
  export publishes standard Markdown + assets for downstream use (e.g. GitHub
  Pages) and is never read back. Git export failures never block authoring. See
  FR-007, FR-009.
- **A12 — Migrations use a brief read-only window (confirmed).** Reads stay up;
  writes pause until verification and cutover complete, then resume
  automatically. See FR-019.
