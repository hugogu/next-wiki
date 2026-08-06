# Feature Specification: Page Attachments

**Feature Branch**: `034-page-attachments`

**Created**: 2026-08-06

**Status**: Draft

**Input**: User description: "添加附件的支持，允许在每个页面上附加各种类型的文件。这些文件应该和图片一样允许数据库或第三方存储，使用的上传API应该也可以共享，API/MCP上传时需要独立的权限控制。 用户可以在页面上直接下载这些附件。最大文件大小及支持的文件类型需要有后台配置控制，默认可以把图片、视频、文档都放进来。可以先不做在线的预览功能。"

## Summary

Let a page author attach one or more files from the administrator-configured
image, video, and document categories directly to a wiki page, separate from
images embedded inline in the page body. Readers with access to the page see a
list of its attachments and can retrieve each one directly; no in-browser
preview is required for this feature.

Attachments reuse the same storage foundation already used for embedded
images: bytes are always durably stored, and an administrator may additionally
enable a local-filesystem or third-party (S3-compatible) replica, without the
author or reader needing to know or choose where a file physically lives.
Both uploading and listing/downloading an attachment go through the same
shared content capability used by the web editor, the public content API, and
MCP tooling — but unlike today's image upload, an API key or MCP credential
must be granted a dedicated attachment-upload permission independent of its
page create/edit permissions before it may attach files. Reading (listing or
downloading) an attachment carries no such extra permission: it follows the
same page-read access already required for every other content read,
identically for browsers, the public API, and MCP agents. An administrator
controls, per wiki installation, the maximum attachment size and which file
types are accepted; the default configuration accepts common image, video,
and document formats.

## Clarifications

### Session 2026-08-06

- Q: For attachment downloads, should the system always force a browser "save
  as" prompt, or allow browser-safe types (e.g., PDF, images) to open inline
  while other types force a download? → A: Serve a type-appropriate
  disposition — inline for browser-safe types (e.g., PDF, images), forced
  download for all other types.
- Q: Does the attachment-upload permission alone let an API key/MCP
  credential attach a file to any page, or must the credential also hold at
  least read access to that specific page? → A: Both are required — the
  credential must hold the attachment-upload permission AND already have
  read access to the target page.
- Q: When an author wants to update an already-attached file with a newer
  version, is that a dedicated "replace" operation preserving the same
  attachment's identity/history, or simply remove-old + attach-new as two
  independent operations? → A: Remove-old + attach-new as two independent
  operations; no dedicated replace/versioning operation in this feature.
- Q: What should the default (unless an administrator changes it) maximum
  size of a single attachment be? → A: 100 MB per file.
- Q: Should listing and downloading a page's attachments be exposed through
  the public content API and MCP tooling (not just the on-page web UI), and
  if so does that require its own independent permission like the
  attachment-upload permission does? → A: Yes, expose it through the same
  shared public content API and MCP tooling used for other content reads;
  no new independent permission is required for reading — it follows the
  same page-read permission already used for web downloads, distinct from
  the dedicated permission required for uploading.
- Q: When an uploaded file exceeds the configured maximum size, should the
  system fail the upload outright, or accept and silently truncate it to the
  limit? → A: Fail the upload outright; truncating and storing a partial
  file is never acceptable.

### Session 2026-08-06 (Architecture Review)

- Q: A synchronous 100 MB upload can take well over the project's 500ms
  "heavy operation" threshold for interactive request handling, which would
  require a background-job (staged upload + async finalization) delivery
  model instead of the simple, immediately-visible attach flow the rest of
  this spec assumes. Given that tradeoff, should attaching stay a simple
  synchronous request, or become an asynchronous, job-tracked operation? →
  A: Keep attaching a simple synchronous request; lower the default maximum
  attachment size to 20 MB (superseding the earlier 100 MB answer) so a
  synchronous request comfortably stays fast. An administrator may still
  raise the configured limit, accepting that very large uploads then take
  longer to attach.

## User Scenarios & Testing *(mandatory)*

### User Story 1 - Attach a file to a page (Priority: P1)

A page author writing or editing a page wants to make a supporting file (for
example, a spreadsheet, a PDF, a slide deck, or a short video) available to
anyone reading that page, without embedding it inline in the page body.

**Why this priority**: This is the core capability the feature exists to
deliver. Without it, nothing else in this spec has value.

**Independent Test**: Can be fully tested by opening a page the user has edit
access to, attaching a file of an allowed type and size, and confirming it
appears in the page's attachment list immediately afterward.

**Acceptance Scenarios**:

1. **Given** a page the author can edit, **When** the author attaches a file
   whose type and size are within the configured limits, **Then** the file is
   stored and appears in the page's attachment list with its original file
   name, size, and content type.
2. **Given** a page with an existing attachment, **When** the author attaches
   another allowed file, including one with the same name, **Then** both
   attachments are listed independently.
3. **Given** an author without edit access to a page, **When** they attempt to
   attach a file, **Then** the attempt is refused and no file is stored.

---

### User Story 2 - Download an attachment from a page (Priority: P1)

A reader viewing a page wants to obtain the original file behind one of its
attachments, for example to open a document locally. An API client or MCP
agent reading the same page programmatically wants the same capability: see
what is attached and fetch it, using the credential's existing read access —
no separate download permission to request or grant.

**Why this priority**: Downloading is the entire point of attaching a file in
the first place; read access is as core as upload, for both human readers and
programmatic callers.

**Independent Test**: Can be fully tested by viewing a page that has an
attachment as a user with read access to that page, and confirming the file
downloads with its original name and content intact; and separately by
calling the public content API or an MCP tool with a credential that can read
the page, and confirming it can list and fetch the same attachment.

**Acceptance Scenarios**:

1. **Given** a page with an attachment, **When** a reader with access to the
   page selects the attachment, **Then** the original file is delivered with
   its original file name and unmodified content, using the type-appropriate
   browser disposition.
2. **Given** a page with an attachment, **When** a user without read access to
   the page attempts to download the attachment directly, **Then** the
   download is refused.
3. **Given** a page whose attachment references a file that has since been
   removed, **When** a reader attempts to download it, **Then** the reader
   sees a clear "no longer available" outcome rather than a broken or silent
   failure.
4. **Given** an API key or MCP credential with read access to a page but no
   attachment-upload permission, **When** it lists or downloads the page's
   attachments through the public content API or MCP tooling, **Then** the
   list/download succeeds using its existing read access alone.
5. **Given** an API key or MCP credential without read access to a page,
   **When** it attempts to list or download that page's attachments through
   the public content API or MCP tooling, **Then** the attempt is refused.

---

### User Story 3 - Remove an attachment from a page (Priority: P2)

A page author decides an attached file is outdated or was attached by
mistake and wants to take it off the page.

**Why this priority**: Necessary for the feature to be usable long-term, but
the page remains functional without it in an initial release.

**Independent Test**: Can be fully tested by removing an attachment from a
page the user can edit and confirming it no longer appears in the attachment
list or downloads for new readers.

**Acceptance Scenarios**:

1. **Given** a page with an attachment, **When** the author removes it,
   **Then** it no longer appears in the page's attachment list.
2. **Given** an author without edit access to a page, **When** they attempt to
   remove one of its attachments, **Then** the attempt is refused.

---

### User Story 4 - Administrator configures attachment limits (Priority: P2)

An administrator wants to control how large an attachment may be and which
file types are accepted on their wiki installation, and wants a sensible
default in place before making any changes.

**Why this priority**: Protects storage and abuse exposure from day one via
the default, while giving administrators the control the feature promises;
not required for the first author to successfully attach a file under
defaults.

**Independent Test**: Can be fully tested by having an administrator change
the maximum attachment size or the set of allowed file types, then confirming
uploads that violate the new limits are refused and uploads within them
succeed.

**Acceptance Scenarios**:

1. **Given** no administrator changes, **When** any author attaches an image,
   video, or document file within a reasonable default size, **Then** the
   upload succeeds.
2. **Given** an administrator has lowered the maximum attachment size,
   **When** an author attaches a file larger than the new limit, **Then** the
   upload is refused with a message stating the limit.
3. **Given** an administrator has removed a file-type category from the
   allowed list, **When** an author attaches a file of that type, **Then**
   the upload is refused with a message stating the type is not accepted.

---

### User Story 5 - Grant an API key or MCP agent attachment-upload rights (Priority: P2)

A wiki administrator or API key owner wants an automated agent (via the
public content API or an MCP tool) to be able to attach files to pages, and
expects to grant that ability explicitly and separately from the agent's
existing content create/edit rights.

**Why this priority**: Automated/agent uploads are an explicit requirement,
but the feature is usable for human authors via the web UI without it.

**Independent Test**: Can be fully tested by issuing an API key without the
attachment-upload permission and confirming an attach call is refused, then
granting that permission and confirming the same call succeeds.

**Acceptance Scenarios**:

1. **Given** an API key with content create/edit permissions but without the
   attachment-upload permission, **When** it calls the shared upload
   capability to attach a file to a page, **Then** the call is refused.
2. **Given** an API key with the attachment-upload permission explicitly
   granted, **When** it calls the shared upload capability, **Then** the file
   is attached, subject to the same size/type limits as web uploads.
3. **Given** an MCP agent acting through a credential without the
   attachment-upload permission, **When** it attempts to attach a file,
   **Then** the attempt is refused with a message identifying the missing
   permission.
4. **Given** an API key with the attachment-upload permission but no read
   access to a specific page, **When** it attempts to attach a file to that
   page, **Then** the attempt is refused.

---

### Edge Cases

- What happens when an author attaches a file with the same name as an
  existing attachment on the same page? Both are kept as distinct
  attachments; file name alone does not need to be unique on a page.
- What happens when an upload is interrupted partway (network drop, browser
  closed)? No partial or corrupted attachment is left visible on the page.
- What happens when the configured maximum attachment size is changed to a
  value smaller than attachments already stored? Existing attachments remain
  available for download; only new uploads are checked against the current
  limit.
- What happens when an administrator disables a file-type category that
  existing attachments already use? Existing attachments of that type remain
  available for download; only new uploads are checked against the current
  allow-list.
- What happens when a page with attachments is deleted? Its attachments stop
  being reachable through that page, following the same lifecycle as the
  page's other content.
- What happens when an author wants to update an attached file to a newer
  version? There is no dedicated "replace" operation in this feature; the
  author removes the outdated attachment and attaches the new file as an
  unrelated attachment, with no preserved identity or version history
  between the two.
- What happens when the underlying file content is flagged as unsafe by any
  existing content-safety handling the platform already applies to uploads?
  The same handling applies to attachments as to other uploaded content; if
  that handling cannot retain the original bytes safely, the upload is
  refused rather than silently altering the attachment.
- What happens when the authoritative storage is temporarily unavailable?
  The uploader or reader receives a clear retryable failure; no incomplete
  attachment link is made visible on the page.

## Requirements *(mandatory)*

### Functional Requirements

- **FR-001**: The system MUST let a user who can edit a page attach one or
  more files to that page, each retaining its original file name, size, and
  content type.
- **FR-002**: The system MUST let any user who can read a page see the list of
  files attached to it and download each one, receiving the original,
  unmodified file content and original file name.
- **FR-003**: The system MUST refuse a download attempt by a user who cannot
  read the underlying page.
- **FR-003a**: The system MUST let a caller list a page's attachments and
  download each one through the same shared public content API and MCP
  tooling used for other content reads (see FR-006), not only through the
  on-page web UI.
- **FR-003b**: The system MUST evaluate an attachment read (list or
  download) made through the public content API or MCP tooling using the
  same page-read permission derivation already used for web downloads
  (FR-002/FR-003); reading an attachment MUST NOT require the dedicated
  attachment-upload permission (FR-007), which gates writes only.
- **FR-003c**: The system MUST make an attachment that is unreadable to a
  caller indistinguishable from a missing attachment, so a direct list or
  download request does not reveal whether a protected page or attachment
  exists.
- **FR-004**: The system MUST let a user who can edit a page remove an
  attachment from that page, and MUST stop offering that attachment for
  download to readers immediately afterward.
- **FR-005**: The system MUST store attachment content using the same durable,
  administrator-configurable storage foundation used for embedded page
  images (a permanently authoritative store, with optional local-filesystem
  or third-party storage as additional replicas the reader/author experience
  does not need to be aware of).
- **FR-006**: The system MUST expose attaching a file through the same shared
  upload capability already used for embedded images, usable from the web
  editor, the public content API, and MCP tooling, rather than a
  separate/duplicated upload mechanism.
- **FR-007**: The system MUST require an API key or MCP credential to hold a
  dedicated attachment-upload permission — distinct from and not implied by
  that credential's page create/edit permissions — before it may attach a
  file to a page, and MUST refuse the attempt with a clear reason when that
  permission is absent.
- **FR-007a**: The system MUST additionally require the API key or MCP
  credential to already have read access to the specific target page before
  an attach attempt may succeed; holding the attachment-upload permission
  alone MUST NOT let a credential attach files to a page it cannot read.
- **FR-008**: The system MUST let an administrator configure, for the whole
  wiki installation, the maximum size allowed for a single attachment.
- **FR-009**: The system MUST let an administrator configure which file types
  (or categories of file types) are accepted as attachments.
- **FR-010**: The system MUST ship with a default configuration, usable
  without any administrator change, that accepts PNG, JPEG, GIF, and WebP
  images; MP4 and WebM videos; and PDF, plain-text, Markdown, CSV,
  Office Open XML (DOCX, XLSX, PPTX), and OpenDocument (ODT, ODS, ODP) files,
  up to a default maximum size of 20 MB per file. SVG, HTML, and other active
  document formats are not accepted as attachments in this feature.
- **FR-011**: The system MUST refuse an upload that exceeds the currently
  configured maximum size or whose type is not currently accepted, and MUST
  tell the uploader why the specific file was refused.
- **FR-011a**: The system MUST reject an over-size upload as a whole rather
  than silently truncating and storing a partial file; no attachment record
  or partial content is retained when an upload is refused for exceeding the
  size limit.
- **FR-011b**: The system MUST validate an attachment's supplied file name as
  a single non-empty display name and safely encode it wherever it is rendered
  or sent in a download response; a supplied name MUST never be interpreted as
  a storage path, markup, or response-header syntax.
- **FR-012**: The system MUST NOT change the size/type limits or download
  eligibility of attachments already stored when the administrator later
  changes the configured limits; only new uploads are evaluated against the
  current configuration.
- **FR-013**: The system MUST NOT build any dedicated in-app preview
  experience (viewer, embedded renderer) for attachment content in this
  feature; obtaining an attachment's content happens only by downloading it
  or, for a limited set of browser-safe types, opening it via the browser's
  own native handling per FR-014 — neither counts as an in-app preview
  feature.
- **FR-014**: The system MUST serve each attachment download with a
  type-appropriate disposition: browser-safe-to-render types (e.g. PDF,
  images) MAY be served so the browser can open them directly if the reader
  chooses, while every other type — and any type where inline rendering
  could execute code in the wiki's own origin (e.g. HTML, SVG) — MUST be
  served with a forced-download disposition regardless of administrator
  configuration.
- **FR-015**: The system MUST apply the same applicable content-safety
  handling to attachment uploads that it applies to other uploaded content.
  An accepted attachment's bytes MUST remain unmodified; if safety handling
  would require changing those bytes or cannot establish that they are safe,
  the upload MUST be refused with a clear reason.
- **FR-016**: The system MUST retain the uploader and attach time for each
  attachment and the remover and removal time for each removal, so attachment
  lifecycle actions remain auditable without introducing an
  attachment-specific history UI or a dedicated replace operation.

### Public Content Delivery *(required when a feature changes anonymously readable published content)*

- Attachments follow the read/download eligibility of the page they are
  attached to: if a page is anonymously (publicly) readable, its attachments
  are anonymously listable and downloadable through the same public content
  API and MCP tooling used to read the rest of that page's content, in
  addition to the web UI; if the page requires authentication or a specific
  permission to read, so do its attachments, across every one of those
  channels. No attachment introduces a public surface broader than its page
  already has.
- An attachment file itself is binary content served on demand, not part of
  the cached page HTML body; adding or removing an attachment does not by
  itself require invalidating the page's cached document body — only the
  page's attachment list is affected (which is fetched alongside, not
  embedded in, the cached body).
- Downstream reader-facing surfaces that already reproduce publicly readable
  pages (e.g. static site publishing) are out of scope for this feature to
  extend; whether and how they surface attachment download links is left to
  those features' own content-selection rules.

### Key Entities *(include if feature involves data)*

- **Attachment**: A file associated with exactly one page, distinct from
  images embedded in the page body. Has an original file name, size, content
  type, uploader, upload time, and current storage location(s). Downloadable
  as-is; never rendered inline in the page body by this feature.
- **Attachment Configuration**: Wiki-wide administrator settings holding the
  maximum allowed attachment size and the set of currently accepted file
  types/categories. Applies only to new uploads.
- **Attachment-Upload Permission**: A permission grant, independent of page
  create/edit permissions, that an API key or MCP credential must hold to
  attach files to pages through the shared upload capability. It only
  supplements — never replaces — the credential's existing read access to
  the specific target page; a credential without read access to a page
  cannot attach to it regardless of this permission. Governs writes only:
  listing or downloading attachments needs no such grant, only the
  credential's existing page-read access. Does not affect web-session
  (browser) authors, whose ability to attach files continues to follow their
  existing page-edit permission.

## Success Criteria *(mandatory)*

### Measurable Outcomes

- **SC-001**: A page author can attach a file and see it available for
  download on the page in under 10 seconds for files up to the 20 MB
  default size limit.
- **SC-002**: 100% of attachment downloads — whether through the web UI, the
  public content API, or MCP tooling — return the exact original file
  content and file name as uploaded.
- **SC-003**: 100% of uploads that violate the currently configured size or
  type limits are refused in full — never silently truncated and stored as
  a partial file — with the reason visible to the uploader.
- **SC-004**: An API key or MCP credential without the attachment-upload
  permission fails 100% of attach attempts, regardless of its other
  permissions, until the permission is explicitly granted.
- **SC-005**: Changing the administrator-configured size or type limits never
  removes access to attachments uploaded before the change.
- **SC-006**: A reader without access to a page cannot download any of its
  attachments in any tested scenario, through any channel (web UI, public
  content API, or MCP tooling).
- **SC-007**: An API key or MCP credential that can already read a page can
  list and download 100% of its attachments without requesting or being
  granted any permission beyond that existing read access.
- **SC-008**: In every tested hostile filename case (path separators, control
  characters, or markup), the request is rejected or every displayed and
  downloaded representation remains a single safe filename; no additional
  path, header, or executable content is created.

## Assumptions

- Attachments are a distinct concept from embedded page images: images
  remain inline content referenced from the page body, while attachments are
  a separate, page-level list of downloadable files. The two may share
  underlying storage and upload mechanics without being the same
  user-visible feature.
- The default accepted file types are the explicit set in FR-010. The
  administrator can enable or disable those supported image, video, and
  document categories, but this feature does not add arbitrary MIME-type or
  extension rules, archive support, or active-content formats such as SVG and
  HTML.
- The default maximum attachment size is 20 MB per file — kept small enough
  that attaching stays a simple synchronous operation (see the Architecture
  Review clarification) while still covering common documents, images, and
  short/low-resolution video clips. An administrator can raise or lower it
  at any time; raising it well beyond the default trades away the "stays
  fast" guarantee this default was chosen to provide.
- For browser/session users, the ability to attach or remove a file on a page
  continues to follow that user's existing permission to edit the page — no
  new permission concept is introduced for human authors, only for
  API-key/MCP credentials as explicitly requested.
- Attachment lifecycle changes are auditable through their attachment
  association (uploader/attach time and remover/removal time). They do not
  create a page-content revision and no attachment-specific history UI is
  required for this feature.
- No dedicated in-app preview experience (a built viewer/renderer inside the
  wiki UI) is built for this feature and may be considered later. Letting the
  browser open a browser-safe file type (e.g. PDF, image) directly via
  download-response disposition, per FR-014, is not such a feature and is in
  scope.
- Malicious or unsafe file content is handled by whatever content-safety
  mechanisms the platform already applies to uploads today. This feature does
  not introduce new content-scanning capability; it rejects, rather than
  silently transforms, an attachment whose existing safety handling cannot
  preserve its original bytes.
