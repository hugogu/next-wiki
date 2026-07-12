# Feature Specification: Page Tags and Metadata

**Feature Branch**: `014-page-tags-metadata`
**Created**: 2026-07-11
**Status**: Draft
**Input**: User description: "支持标签体系及页面级元数据，同时支持通过API及MCP操作。在部分Markdown页面中，会以以下形式管理页面元数据：需要注意与其中的tags同步。同时有summary元数据时，页面列表页优先以summary代替截断的简介。"

## Summary

Give wiki owners and editors a consistent tag system and a small, page-level metadata model. A page can have a title, date, tags, and summary; people can view and maintain these values with the page, manage the available tags, and perform the same work through the public API and MCP. The wiki's page-reading view presents the metadata as structured page information instead of requiring readers to interpret raw source. Page metadata exists independently of Markdown. For pages that use YAML frontmatter, editors can keep the four values synchronized with the corresponding `title`, `date`, `tags`, and `summary` fields in the source.

Page lists use a non-empty `summary` as the page description when it is available. They retain the current generated/truncated description as the fallback when no usable summary exists.

## User Scenarios & Testing *(mandatory)*

### User Story 1 - Classify pages with reusable tags (Priority: P1)

As a wiki editor, I want to assign consistent tags to a page and choose them from a managed tag set, so that related knowledge is easy to group, browse, and find without spelling variants fragmenting the collection.

**Why this priority**: Shared tagging is the central organizational value of the feature and must work before richer metadata or automation is useful.

**Independent Test**: Create two tags, assign both to a page, remove one, and verify the page shows the remaining tag everywhere it is displayed. Rename the remaining tag and verify its label changes on every page that uses it without creating a duplicate assignment.

**Acceptance Scenarios**:

1. **Given** an editor can modify a page, **When** they add one or more existing tags or create a permitted new tag while editing page metadata, **Then** the page displays those tags and the tag system records each tag exactly once for that page.
2. **Given** two pages use the same tag, **When** an authorized tag manager renames that tag, **Then** both pages show the new label and neither keeps the old label as a separate tag.
3. **Given** a tag is no longer needed, **When** an authorized tag manager deletes it, **Then** it is removed from the available tag set and from every page that used it; unrelated page metadata and page content remain unchanged.
4. **Given** an editor enters a tag whose normalized name already exists, **When** they save the page or tag change, **Then** the existing tag is used rather than creating a visually duplicate tag.
5. **Given** a reader may view a page but cannot edit it, **When** they view the page or page list, **Then** they can see its readable tags but cannot alter the tag set or assignments.

---

### User Story 2 - Maintain page metadata and Markdown frontmatter together (Priority: P1)

As a page author, I want page title, date, tags, and summary to remain consistent with the metadata at the beginning of Markdown pages, so that I can use either the wiki editor or Markdown-based workflows without conflicting page information.

**Why this priority**: The requested Markdown form is already a practical authoring convention. Without reliable synchronization, it creates conflicting labels and unreliable lists.

**Independent Test**: Start with a Markdown page containing the supplied frontmatter form. Read its metadata through the page interface, edit its tags and summary there, then inspect the Markdown. Edit the frontmatter again through a supported page-content workflow and confirm the page interface reports the changed values.

**Acceptance Scenarios**:

1. **Given** a Markdown page begins with valid frontmatter containing any of `title`, `date`, `tags`, or `summary`, **When** the page is read or listed, **Then** those values are exposed as the corresponding page metadata.
2. **Given** a page contains valid frontmatter, **When** the properties editor opens, **Then** frontmatter synchronization is enabled by default and saved property changes update the corresponding supported fields.
3. **Given** an editor saves Markdown whose valid frontmatter changes one of the supported metadata values, **When** the save completes, **Then** the page metadata and tag assignments reflect the new frontmatter value.
4. **Given** a page has a title in both its page identity and frontmatter, **When** either supported metadata workflow changes that title, **Then** the two title values converge to the saved title and the page remains reachable at its existing path unless the editor separately changes the path.
5. **Given** a page has a valid `date`, **When** it is displayed to a reader, **Then** it represents a calendar date without an implied time or timezone; an invalid date is rejected with a clear, actionable validation message.
6. **Given** a supported frontmatter field is absent or deliberately cleared, **When** the page is saved, **Then** that metadata value is absent rather than represented as a misleading empty tag, date, or summary.
7. **Given** a page contains frontmatter keys other than the four supported metadata fields, **When** metadata is changed, **Then** those unrelated frontmatter values are retained.
8. **Given** a reader opens a Markdown page with supported metadata, **When** the wiki renders the page for reading, **Then** the page title, date, tags, and summary are presented as labelled, structured page information where present, rather than requiring the reader to inspect raw YAML frontmatter.
9. **Given** a supported metadata value is absent, **When** the page is rendered for reading, **Then** its label and empty placeholder are omitted, while the available metadata remains easy to scan.
10. **Given** the wiki renders supported metadata structurally, **When** it presents the Markdown body, **Then** the frontmatter delimiters and the supported metadata declarations are not repeated as visible body content.
11. **Given** a page has no valid frontmatter, **When** an editor changes Page Properties without enabling frontmatter synchronization, **Then** the metadata is stored on the new revision while the Markdown source remains byte-for-byte unchanged.
12. **Given** the Page Properties editor is open, **When** it displays the frontmatter synchronization checkbox, **Then** its initial state reflects whether the current Markdown contains valid frontmatter, and the editor may explicitly change it for the save.
13. **Given** frontmatter synchronization is enabled for a page without frontmatter, **When** the editor saves, **Then** the supported metadata is written into a new frontmatter block without changing the Markdown body.

---

### User Story 3 - Show authored summaries in page lists (Priority: P1)

As a wiki reader, I want page lists to show an author's summary when one is available, so that I can understand a page's purpose without relying on a mechanically truncated opening passage.

**Why this priority**: A clear authored description improves the primary browsing experience immediately and directly fulfills the requested list behavior.

**Independent Test**: Create one page with a summary and another without one. Open every standard page-list view that shows a description and confirm the first displays the summary exactly while the second retains the existing generated/truncated description behavior.

**Acceptance Scenarios**:

1. **Given** a readable page has a non-empty summary, **When** it appears in a standard page list that displays a description, **Then** the list displays that summary in preference to a description generated from page content.
2. **Given** a readable page has no summary or only whitespace, **When** it appears in the same list, **Then** the list uses the existing generated/truncated description fallback.
3. **Given** a summary contains text that could be interpreted as markup or an instruction, **When** it is displayed in a list, **Then** it is presented safely as page description text and cannot change the surrounding list interface.
4. **Given** a user changes a page summary, **When** a relevant page list is next loaded or refreshed, **Then** it shows the current summary rather than a stale prior value.

---

### User Story 4 - Automate tags and metadata through API and MCP (Priority: P2)

As an automation or MCP client with appropriate permissions, I want to discover, read, assign, and manage tags and page metadata using the same rules as the web interface, so that human and automated curation produce one consistent knowledge base.

**Why this priority**: The product's AI-native workflows depend on parity between the browser, API, and MCP rather than a manual-only organization system.

**Independent Test**: With an editor-authorized API credential, list tags, create one, update a page's metadata and tags, then read the page through MCP. Rename and delete the tag through either supported surface and verify the browser and the other machine-facing surface report the same final state. Repeat a write with a read-only credential and confirm it is denied.

**Acceptance Scenarios**:

1. **Given** an authorized client, **When** it reads a page through the public API or MCP, **Then** it receives the page's supported metadata in a structured form and tags in the same normalized form used by the browser.
2. **Given** an authorized client, **When** it lists or searches pages through the public API or MCP, **Then** it can use tag-based selection and receives the metadata needed to identify and describe each readable page.
3. **Given** an editor-authorized client, **When** it creates, updates, clears, or synchronizes a page's supported metadata and tag assignments, **Then** the result follows the same validation, frontmatter synchronization, revision history, and visibility rules as an equivalent browser action.
4. **Given** a tag-authorized client, **When** it lists, creates, renames, or deletes tags, **Then** the public API and MCP expose the same resulting tag set and page assignments.
5. **Given** a client that lacks page-edit or tag-management permission, **When** it attempts the corresponding mutation through API or MCP, **Then** the operation is denied without revealing tags or pages it is not allowed to view or modify.
6. **Given** an API or MCP client still using an existing page read, list, search, or metadata-update operation, **When** it does not request the new tag-management behavior, **Then** its existing successful request and required response fields remain compatible.

### Edge Cases

- A legacy page has frontmatter tags but no prior tag-system assignment: its tags become available as normalized assignments without duplicating an equivalent tag.
- A legacy page's frontmatter has an empty, duplicate, or malformed tag value: invalid entries are rejected or omitted with a clear per-page outcome; valid tags continue to synchronize.
- A frontmatter `tags` value conflicts only in letter case or surrounding whitespace with an existing tag: it resolves to the existing normalized tag.
- A simultaneous page-content save and metadata save would overwrite the same metadata field: one save succeeds and the stale writer receives a conflict outcome; no partial mismatch between tag assignment and frontmatter is exposed.
- Renaming a tag to an already-existing normalized tag is rejected rather than merging its assignments implicitly.
- A tag deletion is requested while pages use the tag: deletion removes the assignment from all affected revisions and synchronizes frontmatter only for pages already using it; the outcome reports how many readable-to-manager pages were affected without exposing inaccessible page details to an unauthorized caller.
- A page has no Markdown frontmatter: saving supported metadata keeps the source unchanged unless the editor explicitly enables frontmatter synchronization.
- A page uses frontmatter that contains only unsupported keys: the page reader does not show an empty metadata section or raw YAML as a substitute for supported metadata.
- A page list does not render a description today: this feature does not add a new description region solely to display summary.
- A readable page becomes unavailable between list retrieval and an API/MCP metadata action: the action follows the normal unavailable/permission result and makes no change.

## Requirements *(mandatory)*

### Functional Requirements

- **FR-001**: The system MUST provide a wiki-wide, reusable tag set and page-to-tag assignments that are visible on readable pages and usable as a page-selection criterion.
- **FR-002**: Authorized users MUST be able to list, create, rename, and delete tags through the browser. Tag names MUST be normalized consistently so that names differing only by surrounding whitespace or letter case cannot coexist as separate tags.
- **FR-003**: Authorized users MUST be able to add and remove tags while maintaining a page. A page MUST not contain the same normalized tag more than once.
- **FR-004**: Renaming a tag MUST preserve its associations with all pages that use it. Deleting a tag MUST remove its associations from all affected pages.
- **FR-005**: Each page MUST support the following metadata values: title, date, tags, and summary. Title remains the page's canonical display title; date is a calendar date; tags are zero or more reusable tags; summary is an optional author-written page description.
- **FR-006**: Page metadata MUST be stored on the revision independently of whether its Markdown source contains YAML frontmatter.
- **FR-007**: Any successful page-metadata or tag-assignment change MUST save a consistent page revision whose visible metadata and tag assignments agree; when frontmatter synchronization is enabled, its supported frontmatter values MUST agree as well.
- **FR-008**: Saving valid Markdown frontmatter that changes one of the supported fields MUST update the corresponding structured page metadata and tag assignments. Saving structured metadata MUST update frontmatter only when synchronization is enabled, without discarding unrelated valid frontmatter fields or Markdown body content.
- **FR-009**: The system MUST reject invalid supported metadata with clear validation feedback, including malformed dates, non-list tag values, duplicate normalized tags, and non-text summaries. It MUST not silently persist an ambiguous value.
- **FR-010**: Every standard page-list view that already displays a page description MUST display a non-empty page summary in preference to its generated/truncated description. When no usable summary exists, it MUST preserve the existing fallback description behavior.
- **FR-011**: Page-list descriptions MUST reflect the current saved summary and safely render it as descriptive text; summaries MUST not alter list layout, execute instructions, or expose restricted page content.
- **FR-012**: Authorized public API clients MUST be able to read the supported metadata, use tag-based page selection, update page metadata and tag assignments, and manage the tag set. Read-only clients MUST be able to read only metadata and tags attached to pages they can read.
- **FR-013**: The MCP server MUST expose equivalent tag discovery, tag lifecycle, page metadata read, and page metadata/tag update capabilities, with structured, LLM-usable inputs and results.
- **FR-014**: API and MCP operations for this feature MUST enforce the same page-read, page-edit, and tag-management permissions as the browser. They MUST never expose a tag assignment, page metadata, page title, summary, or existence that the caller cannot read.
- **FR-015**: Existing public API and MCP page operations MUST remain compatible for clients that do not use the new tag-management capabilities. The feature MUST extend the established page metadata and page-list/search surfaces instead of requiring a separate content model.
- **FR-016**: All metadata and tag changes, including automated changes, MUST remain traceable through the page's established revision history and existing audit behavior.
- **FR-017**: If a multi-page tag rename or deletion cannot be completed consistently, the system MUST report a clear non-success outcome and MUST NOT leave a completed tag-system change with stale supported frontmatter on affected pages.
- **FR-018**: New browser-visible labels, validation messages, empty states, and descriptions for tags and metadata MUST be localizable consistently with the rest of the product.
- **FR-019**: The wiki page-reading view MUST display present supported metadata as structured, labelled information: title through the page heading, and date, tags, and summary in a readable metadata presentation. It MUST omit absent values rather than show empty labels or placeholders.
- **FR-020**: When structured metadata is presented on a Markdown page, the rendered page body MUST NOT repeat the YAML frontmatter delimiters or the supported metadata declarations as visible body text. Unrelated Markdown content and supported frontmatter values MUST remain available through their appropriate page view or source view.
- **FR-021**: Page Properties MUST expose a frontmatter synchronization checkbox whose initial value is derived from the presence of valid frontmatter in the current Markdown source. When disabled, property changes MUST NOT rewrite the Markdown source.

### Key Entities

- **Tag**: A reusable, normalized label available within one wiki. It has a display name and may be assigned to zero or more pages.
- **Page Tag Assignment**: The association between one page and one tag. It is unique for the normalized tag and is synchronized with the page's frontmatter tag list where applicable.
- **Page Metadata**: The supported metadata for a page: title, optional calendar date, zero or more tags, and optional summary. It is represented consistently in page views, machine-facing page responses, and Markdown frontmatter.
- **Page Summary**: Optional author-written text that describes a page for list views. It takes priority over generated/truncated page description text.
- **Structured Metadata Presentation**: The reader-facing, labelled display of the page heading plus any present date, tags, and summary. It makes the supported frontmatter metadata scannable without exposing it as raw YAML in the page body.

## Success Criteria *(mandatory)*

### Measurable Outcomes

- **SC-001**: In acceptance testing, 100% of tag additions, removals, renames, and deletions leave every affected page with matching displayed tags and, for pages using frontmatter synchronization, matching supported Markdown frontmatter.
- **SC-002**: In acceptance testing, 100% of supported metadata changes made from the browser, public API, MCP, or valid Markdown frontmatter are observable through the other three surfaces after the change completes.
- **SC-003**: In a page-list test set containing pages with and without summaries, 100% of list entries with a non-empty summary display that summary rather than a generated/truncated description, while 100% of entries without one retain the fallback description.
- **SC-004**: An authorized editor can create a tag, assign it with a page summary and date, and verify the final page state through API or MCP in no more than three write/read operations.
- **SC-005**: 100% of attempted metadata and tag mutations by read-only or unauthorized credentials are denied without exposing unreadable pages, metadata, or tag assignments.
- **SC-006**: 100% of API and MCP regression tests for existing page reads, lists, searches, and metadata updates pass when clients do not use the new tag-management behavior.
- **SC-007**: In a test collection of at least 100 pages sharing renamed or deleted tags, all affected pages converge to the same tag/frontmatter state within the completion of the requested operation, with no duplicate normalized tags.
- **SC-008**: In acceptance testing of pages with every combination of date, tags, and summary, 100% of reader views display each present value in structured page information, omit each absent value, and do not repeat the supported YAML frontmatter in the rendered body.

## Assumptions

- Tags are wiki-wide rather than private to one user or confined to a particular page tree, because their purpose is shared organization and API/MCP curation.
- Existing page editing permissions govern changing a page's metadata and assignments. The project will use its established elevated authorization model for tag lifecycle operations.
- The supported frontmatter form is YAML at the beginning of a Markdown page. Markdown pages without frontmatter gain it only when the editor enables frontmatter synchronization.
- `date` follows the calendar-date form illustrated by the request (for example, `2026-07-10`) and has no time-of-day semantics.
- A summary is plain descriptive text; formatting, automatic summary generation, and a user-facing summary-length policy are not introduced by this feature.
- The existing page title remains the primary page heading; the structured metadata presentation does not create a second competing title heading.
- The project already provides page revisioning, metadata exposure, tag-based filtering, API authorization, and MCP page tools. This feature makes tag lifecycle and supported metadata behavior consistent across them rather than replacing those foundations.
- Changes that derive tags from valid existing Markdown frontmatter may create reusable tags when no equivalent normalized tag exists.

## Out of Scope

- Hierarchical tags, tag aliases, tag colors, tag descriptions, tag groups, and faceted tag-browsing pages.
- Full-text or semantic search ranking changes beyond using the existing tag-based page-selection capability.
- Metadata fields beyond title, date, tags, and summary, except preserving unrelated frontmatter unchanged.
- Automatic AI-generated summaries, content analysis, or a tag recommendation workflow.
- Changes to page paths, page visibility, sharing permissions, or the broader page-content model.
- A standalone analytics or reporting dashboard for tag use or summary coverage.
