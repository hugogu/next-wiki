# Feature Specification: Core Wiki Platform

**Feature Branch**: `001-core-wiki-platform`
**Created**: 2026-06-14
**Status**: Draft
**Input**: User description: "构建前端风格样式库，注册、登录页面，登陆后进入主页展示Wiki页面列表及相应的添加、编辑页面功能。页面以Markdown编辑，保存时渲染为HTML，以便查看wiki页面尽量减少动态内容，每次编辑形成一个版本。不使用SPA，以便前端路由以及浏览器历史正常运作。后台管理页面提供注册用户的查看、重置、设置角色等功能。内置角色为管理员、编辑、读者。页面有发布和未发布两个状态，发面的都可以访问，未发布的（版本）只有其作者可以访问。一般注册用户只是读者，没有编辑权限。页面样式简洁，明快、专业。单服务基于Node实现，只连接一个PostgreSQL数据库，通过docker-compose一建部署。"

## Clarifications

### Session 2026-06-14

- Q: Spaces & page hierarchy — visible multi-space hierarchy now, or flat single space? → A: Flat single default space for this slice; the space and hierarchical path are kept as hidden schema fields only (not visualized), so hierarchy can be added later without a data migration.
- Q: Publish granularity — version-level drafts or page-level publish? → A: Version-level drafts. Each save creates a draft version; the author publishes a version to make it live; readers see the latest published version; drafts of already-published pages stay hidden until published.
- Q: Multi-language / localization — full i18n now, or single locale? → A: Single locale for content + UI for this slice; `locale` stored as a hidden schema field (default locale) so translations/localization can be added later without migration.
- Q: Scope of delete/restore, search, import/export — in this slice or deferred? → A: Defer all three for this slice. The schema stays soft-delete-ready via a hidden status field, so delete/restore can be added later with no migration. No delete UI, no search, and no import/export in this slice.
- Q: Page URL / path derivation — auto from title, author-specified, or opaque ID? → A: Author specifies the page path manually when creating a page. The path is URL-safe, may contain multiple `/`-separated segments (e.g. `docs/intro/getting-started`), and must be unique within the default space/locale. The path is editable after creation via a dedicated "Page Properties" screen; editing page content does not change the path. Redirects from old paths after a path change are deferred.

## User Scenarios & Testing *(mandatory)*

### User Story 1 - Read Published Wiki Pages (Priority: P1)

As a visitor (anonymous or signed-in reader), I want to browse a list of wiki
pages and read any published page through a normal web URL, so that I can
consume knowledge quickly and share links to specific pages.

**Why this priority**: Reading is the primary purpose of a wiki. The product
delivers value the moment published content is readable and shareable, even
before any account exists.

**Independent Test**: With at least one published page present, open the wiki
home in a fresh browser (no login). The published page appears in the list;
clicking it (or pasting its URL) shows the rendered content. This story can be
validated end-to-end without registration or editing.

**Acceptance Scenarios**:

1. **Given** published pages exist, **When** a visitor opens the wiki home,
   **Then** they see a list of published pages (titles and a way to open each).
2. **Given** a published page, **When** the visitor opens its URL directly via a
   deep link, **Then** the page renders as pre-rendered content with minimal
   dynamic behavior.
3. **Given** any page URL, **When** the visitor uses the browser back, forward,
   or refresh buttons, **Then** the correct page and scroll/input state is
   shown and no error or lost state occurs.

---

### User Story 2 - Register, Log In, and Reach the Wiki Home (Priority: P1)

As a new user, I want to register an account and sign in, so that I am
recognized by the system (as a reader by default) and can reach the wiki home.

**Why this priority**: Authentication is the gateway to every authored and
administrative capability. Together with US1 it forms the smallest useful
product: read public content + recognized identity.

**Independent Test**: Starting logged out, register with a new email and
password, confirm the account is created, then log out and log back in. After
login the user lands on the wiki home showing the page list.

**Acceptance Scenarios**:

1. **Given** the visitor has no account, **When** they submit the registration
   form with valid credentials, **Then** an account is created (the first account
   becomes Admin, later accounts receive the Reader role) and they are signed in.
2. **Given** a registered account, **When** the user signs out and back in with
   correct credentials, **Then** they reach the wiki home.
3. **Given** invalid credentials on login, **When** the user submits the form,
   **Then** they see a clear error and no session is created.

---

### User Story 3 - Author and Edit Pages in Markdown with Versioning (Priority: P2)

As an editor, I want to create new pages and edit existing pages using a
Markdown editor, with every save recorded as a version, so that content is easy
to author and its history is always recoverable.

**Why this priority**: Authoring is what makes the wiki grow. It depends on US2
(identity) and produces the published content that US1 reads.

**Independent Test**: Sign in as an editor, create a page, type Markdown, save,
view the rendered page; edit the page again and save; open the page's version
history and see both versions.

**Acceptance Scenarios**:

1. **Given** an editor is signed in, **When** they create a page and save
   Markdown content, **Then** a new page version is stored and the content is
   rendered into viewable form at save time.
2. **Given** a page exists, **When** the editor edits and saves, **Then** a new
   version is created and the previous version is retained unchanged in history.
3. **Given** multiple versions exist, **When** a signed-in user views the page
   history, **Then** they see the list of versions they are allowed to see
   (published versions for readers; all versions for author, editor, or admin).

---

### User Story 4 - Control Publish State (Drafts vs Published) (Priority: P2)

As an author/editor, I want to keep pages as drafts while I work and publish
them when ready, so that unfinished content is hidden from readers but always
accessible to me.

**Why this priority**: The publish/draft distinction is what makes authoring
safe. Without it, every save would be public. It depends on US3 (authoring).

**Independent Test**: As an editor, create a page and leave it as a draft;
confirm a reader cannot find or open it; publish it; confirm the reader can now
see it. Then edit the published page to create a new draft version and confirm
the reader still sees the previously published content, not the draft.

**Acceptance Scenarios**:

1. **Given** a new draft page, **When** a reader or any other user attempts to
   view it (via list or direct URL), **Then** they cannot see it and the system
   does not reveal that the page exists.
2. **Given** a draft page, **When** the author views it, **Then** they can see
   and continue editing it.
3. **Given** a draft page, **When** the author publishes it, **Then** it becomes
   visible to all permitted readers.
4. **Given** a published page, **When** the author starts a new draft version,
   **Then** readers continue to see the previously published content until the
   new version is published.

---

### User Story 5 - Admin Manages Users and Roles (Priority: P3)

As an admin, I want to view registered users, reset their passwords, and assign
roles, so that I can control access and recover users who are locked out.

**Why this priority**: Administration keeps the system operable over time. It
depends on US2 (users exist) and is not required for the read/author loop to
function.

**Independent Test**: Sign in as admin, open the admin user management page,
view the user list, change a user's role from Reader to Editor, and reset
another user's password; confirm both changes take effect.

**Acceptance Scenarios**:

1. **Given** an admin is signed in, **When** they open the admin user
   management page, **Then** they see all registered users with their current
   roles.
2. **Given** a user, **When** the admin changes their role, **Then** the user's
   permissions reflect the new role on their next action.
3. **Given** a user who cannot sign in, **When** the admin resets their
   password, **Then** the user can sign in with the reset credentials and is
   prompted to set a new password of their own.

---

### Edge Cases

- Two editors edit the same page concurrently: the last save becomes the latest
  version; both contributions are preserved in version history (no silent data
  loss; conflict handling is last-write-wins with full history).
- A reader attempts to open the editor, the create-page screen, or the admin
  panel by typing the URL directly: access is denied without leaking any
  protected content.
- An anonymous user opens a draft URL or an unpublished page URL: the response
  does not confirm the page exists (not-found style, no metadata leak).
- A user's role is changed while they are signed in: their next action reflects
  the new role (stale elevated permissions do not persist).
- Registration with an already-used email: rejected with a clear message; no
  duplicate account is created.
- Refreshing the browser on the edit screen or resubmitting a save: no
  duplicate versions and no data loss.
- Rendering a page whose Markdown is malformed: the page still renders with a
  best-effort result and a visible notice rather than crashing the view.

## Requirements *(mandatory)*

### Functional Requirements

- **FR-001**: System MUST provide a registration page where a new user creates
  an account with credentials.
- **FR-002**: System MUST provide a login page that establishes a session; after
  login the user lands on the wiki home.
- **FR-003**: System MUST assign the first registered user the Admin role, and
  every subsequent newly registered user the Reader role by default.
- **FR-004**: System MUST display the wiki home as a list of published pages
  visible to all permitted users (including anonymous visitors by default).
- **FR-005**: System MUST serve each published page at a unique, shareable URL
  as pre-rendered content with minimal dynamic behavior on the reading side.
- **FR-006**: System MUST ensure every page URL supports the browser's native
  back, forward, refresh, deep-linking, and "open in new tab" without losing
  state. (The product is delivered through server-rendered pages with real URLs,
  not a single-page application.)
- **FR-007**: System MUST provide a Markdown editor (Toast UI Editor) for creating
  and editing pages. The editor MUST serialize to raw Markdown source only; no
  rendered HTML or proprietary AST leaves the browser.
- **FR-008**: System MUST render Markdown content into viewable form at save
  time so that page reads are served from the pre-rendered output.
- **FR-009**: System MUST create a new, immutable version record for every save,
  capturing the author and timestamp.
- **FR-010**: System MUST allow the author to keep a page/version as an
  unpublished draft; unpublished drafts MUST be visible only to their author
  (and to admins).
- **FR-011**: System MUST allow the author to publish a page/version; published
  content MUST become visible to all permitted users.
- **FR-012**: System MUST restrict page creation and editing to users holding
  the Editor role (or Admin).
- **FR-013**: System MUST restrict user management to users holding the Admin
  role.
- **FR-014**: The admin panel MUST list registered users and allow the admin to
  change roles and reset passwords.
- **FR-015**: System MUST provide exactly three built-in roles — Admin, Editor,
  Reader — with the access differences described in this spec.
- **FR-016**: System MUST present a single, consistent, clean, and professional
  visual style across every page, delivered through one shared style/design
  library so no page diverges in look, spacing, or interaction patterns.
- **FR-017**: System MUST run as a single service backed by a single database
  and be deployable through one command via the project's container
  orchestration.
- **FR-018**: System MUST deny access — without confirming the existence of the
  protected resource — whenever a user without rights attempts to view an
  unpublished draft, open the editor, or open the admin panel.
- **FR-019**: System MUST make anonymous read access to published pages
  configurable by an admin (public by default, or require-login).
- **FR-020**: System MUST store each page with a space reference and a
  user-defined `path` field (hierarchical, defaulted to a single built-in
  space) so the data model supports multi-segment page URLs without exposing
  spaces in the UI for this slice.
- **FR-021**: System MUST store a `locale` field on page content (hidden,
  defaulted to a single built-in locale) so the data model is
  translation-ready without exposing multi-language UI for this slice.
- **FR-022**: System MUST persist each page with a soft-delete status field
  (hidden) so delete/restore can be added later without a schema migration. No
  delete, restore, search, or import/export functionality is exposed in this
  slice.
- **FR-023**: System MUST let the author specify the page `path` (URL-safe,
  may contain `/`-separated segments such as `docs/intro/getting-started`) at
  creation. The `path` MUST be validated as lowercase letters, numbers,
  hyphens, and slashes, with no leading, trailing, or consecutive slashes, and
  MUST be unique within the default space/locale. Conflicts MUST be rejected
  with a clear error. The `path` is editable after creation via the Page
  Properties screen; editing page content does not change the `path`.
- **FR-024**: System MUST provide a "Page Properties" screen reachable from the
  page view, where authorized users (author/editor/admin) may change the page
  `path` subject to the same validation and uniqueness rules as creation.
- **FR-025**: System MUST render the wiki navigator as a directory tree based
  on `/` segments of page paths so multi-segment paths are browsable.

### Key Entities *(include if feature involves data)*

- **User**: an account with credentials, a role, and a status (active/disabled).
  Owns the pages and versions they author.
- **Role**: one of three built-in permission groups — Admin, Editor, Reader —
  defining what a user may do across the product.
- **Page**: a wiki page identified by a unique, shareable URL path that may
  contain `/`-separated segments (e.g. `docs/intro/getting-started`); has a set
  of versions and a "live" version (the most recently published one) that
  readers see. The data record also carries a hidden `space` reference and a
  `locale` field, defaulted to a single built-in space; these are not exposed
  in the UI for this slice but keep the model hierarchy-ready. The URL path
  (`path`) is chosen by the author at creation, validated as URL-safe and
  unique, and may be changed later via the Page Properties screen. The leaf
  segment of the path is stored as `slug` for internal display but is not the
  canonical URL key.
- **Page Version**: an immutable snapshot of the Markdown source plus its
  rendered output, created by a single author at a point in time, carrying a
  status of Draft (unpublished) or Published, a sequential version number, and
  a hidden `locale` field (single default locale for this slice).
- **Session**: the authenticated session that ties a browser to a user between
  requests.

## Success Criteria *(mandatory)*

### Measurable Outcomes

- **SC-001**: A new operator can deploy the system with a single command and
  have a working, readable wiki within 5 minutes.
- **SC-002**: A visitor can open any published page via a direct URL and read it
  as a fast, static-like page that appears with no perceptible client-side
  rendering delay on repeat views.
- **SC-003**: A new user can register and reach the wiki home in under 1 minute.
- **SC-004**: An editor can create a page and publish it in under 2 minutes, and
  a reader sees the published content immediately afterward.
- **SC-005**: Every save yields a recoverable version; an editor can open the
  full version history of any page they may edit.
- **SC-006**: A reader can never reach an unpublished draft, the editor, or the
  admin panel — verified by attempting direct URLs, which return access-denied
  without confirming the resource exists.
- **SC-007**: Every page (home, reader view, editor, auth pages, admin) shares
  one consistent visual style; no page presents a different design language.
- **SC-008**: Browser back, forward, refresh, deep-linking, and "open in new
  tab" work correctly on 100% of navigable pages.

## Assumptions

These reasonable defaults were inferred from the description; they can be
revised via `/speckit.clarify` before planning.

- **A1 — Publish granularity (version-level drafts)** *(confirmed)*. Each save
  creates a new Draft version. The author publishes a version to make it the
  live content readers see. Editing a published page therefore produces a new
  draft while readers continue seeing the previous published version until the
  new one is published. This matches the description's "未发布的（版本）只有其作者可以访问"
  and supports drafting changes to already-published pages.
- **A2 — Anonymous read is on by default**. Published pages are readable by
  anyone (not signed in), matching "发布的都可以访问". An admin can switch the
  site to require-login for reading (FR-019).
- **A3 — Open self-service registration**. Anyone can register; the first account
  becomes Admin, and subsequent new accounts receive the Reader role automatically.
- **A4 — Admin-initiated password reset without email**. An admin resets a
  user's password to a temporary value (relayed out-of-band by the admin) and
  the user is prompted to set a new password on next sign-in. No email/SMS
  service is required, keeping the single-service/single-database constraint.
- **A5 — "No SPA" expressed as a navigation contract, not a tech mandate**. The
  requirement is realized through server-rendered pages with real, shareable
  URLs and fully working browser history/navigation. The concrete web stack is
  governed by the project constitution, which already mandates a server-rendered,
  URL-first framework that satisfies this contract.
- **A6 — Editors edit any page**. The Editor role grants create/edit permission
  across the wiki (not limited to pages they own). Exclusive author-only access
  applies specifically to unpublished drafts of that author.
- **A7 — Three roles as baseline permission groups**. Admin / Editor / Reader
  are modeled as the built-in permission groups. More granular per-page
  permissions are out of scope for this feature and may be introduced later
  without changing these role definitions.
- **A8 — Specific technologies are constitution-governed**. Node-based single
  service, single PostgreSQL database, and one-command Docker Compose deployment
  are already locked by the project constitution (v1.3.0) and its Technology
  Decisions. They are reflected here as requirements (FR-017) but not
  re-specified at the framework level.
- **A9 — Spaces/hierarchy are hidden for now** (confirmed). The UI for this
  slice is flat (one page list under a single default space). The space and
  hierarchical path are persisted as schema fields only, so adding visible
  spaces/hierarchy later requires no data migration. See FR-020.
- **A10 — Single locale for now** (confirmed). Content and UI ship in a single
  default locale for this slice. A `locale` field is persisted on page content
  so translations and UI localization can be added later without migration. See
  FR-021.
- **A11 — Out of scope for this slice** (confirmed): delete/restore UI, search,
  and import/export are deferred. The schema remains soft-delete-ready via a
  hidden status field (FR-022) so these can be added as fast-follows without
  migration.
- **A12 — Author-specified, multi-segment, editable path** (confirmed). The
  author chooses the page's URL `path` at creation; the system validates
  URL-safety (lowercase letters, numbers, hyphens, slashes; no leading,
  trailing, or consecutive slashes) and uniqueness within the default
  space/locale. The `path` may contain `/`-separated segments such as
  `docs/intro/getting-started`. After creation the `path` may be changed via
  the Page Properties screen. Redirects from old paths after a path change are
  deferred; the unique index simply prevents conflicts. See FR-023, FR-024,
  FR-025.
