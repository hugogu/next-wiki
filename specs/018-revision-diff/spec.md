# Feature Specification: Client-Side Revision Diff

**Feature Branch**: `codex/018-revision-diff`
**Created**: 2026-07-14
**Status**: Draft
**Input**: User description: "为版本历史页面添加Diff的能力，用户可以选择历史中的任意两个版本，进行在线的diff，这应该是一个纯客户端的行为，不需要服务器端提供接口。diff的模式与代码diff类似，需要支持行号的显示、空白字符的忽略、差异上下显示行数控制（不需要把整个文件都显示出来，除非用户选择full context），两个diff分栏显示，支持同步 滚动。Diff需要支持原始文档视图及预览视图两种模式。"

## User Scenarios & Testing *(mandatory)*

### User Story 1 - Compare any two page revisions (Priority: P1)

A reader who can view a page's history selects any two distinct visible revisions and opens one side-by-side comparison. The earlier revision appears on the left and the later revision on the right, regardless of the order in which the reader made the selections.

**Why this priority**: Version history is only useful for understanding change when a reader can directly inspect the difference between the exact two revisions that matter.

**Independent Test**: From a page with at least three accessible revisions, select two non-adjacent revisions in either order and open the comparison. Verify that both selected revisions, their version labels, and only their meaningful differences are shown in chronological left-to-right order.

**Acceptance Scenarios**:

1. **Given** a reader can view at least two revisions in a page's history, **When** they select two different revisions from the history list, **Then** the same page displays one canonical side-by-side comparison for that exact pair without a separate Compare action.
2. **Given** a reader selects the newer revision before the older revision, **When** the comparison opens, **Then** the older revision is displayed in the left pane and the newer revision in the right pane.
3. **Given** a reader opens a copied or bookmarked comparison link, **When** the link is loaded or browser navigation is used, **Then** the same revision pair and comparison options are restored.
4. **Given** a reader can browse a page's complete visible history, **When** they choose any two distinct revisions available to them, **Then** their numerical distance and pagination position do not prevent comparison.

---

### User Story 2 - Inspect a focused, code-style source diff (Priority: P1)

A reader views the selected revisions as aligned source text in two panes. They can see line numbers, inserted, removed, and changed lines, and a limited amount of unchanged context around each change instead of having to scan an entire document.

**Why this priority**: A focused, line-oriented comparison makes textual changes quick to review and keeps long documents readable.

**Independent Test**: Compare two multi-section revisions containing additions, removals, replacements, and distant unchanged sections. Verify that the default view shows numbered, aligned change hunks with three unchanged lines before and after each hunk, while unrelated middle content is omitted.

**Acceptance Scenarios**:

1. **Given** the selected revisions contain changed and unchanged source lines, **When** source view is opened, **Then** both panes show line numbers and clearly distinguish added, removed, changed, and unchanged lines.
2. **Given** unchanged content separates two changes, **When** the reader uses the default context setting, **Then** the comparison shows three unchanged lines before and after each changed region and collapses unrelated unchanged content.
3. **Given** a reader changes the context setting, **When** they choose a different number of surrounding lines or Full context, **Then** every changed region updates to show the requested amount of surrounding content, and Full context shows the complete selected revisions.
4. **Given** a reader chooses zero surrounding lines, **When** the comparison updates, **Then** each changed region remains visible without unchanged context lines.

---

### User Story 3 - Filter cosmetic differences and navigate both panes together (Priority: P2)

A reader can ignore whitespace-only edits and scroll either source-diff pane while the other pane follows the same comparison position. They can turn off linked scrolling when they need to inspect one side independently.

**Why this priority**: Formatting-only revisions should not obscure substantive edits, and linked navigation reduces the effort of comparing distant lines.

**Independent Test**: Compare revisions that contain both whitespace-only and substantive changes. Enable whitespace ignoring and scroll each pane through multiple hunks. Verify that whitespace-only changes disappear from the change set, substantive changes remain, and the other pane stays aligned until linked scrolling is disabled.

**Acceptance Scenarios**:

1. **Given** two revisions differ only in whitespace on some lines, **When** the reader enables Ignore whitespace, **Then** those lines are not reported as changes while the displayed source text remains unmodified.
2. **Given** two revisions also contain substantive text changes, **When** Ignore whitespace is enabled, **Then** those substantive changes continue to be shown.
3. **Given** linked scrolling is enabled, **When** the reader vertically scrolls either comparison pane, **Then** the opposite pane follows to the corresponding comparison position without a feedback loop or visible oscillation.
4. **Given** linked scrolling is disabled, **When** the reader scrolls one pane, **Then** the other pane remains at its current position.

---

### User Story 4 - Compare rendered document previews (Priority: P2)

A reader switches the same revision pair from source view to preview view to understand how the changes read as rendered documents. The two previews remain side by side, identify the changed regions, and support the same context and linked-scrolling choices where those choices apply.

**Why this priority**: Source-level changes alone can be difficult to interpret for headings, lists, links, tables, and other document structure.

**Independent Test**: Compare two revisions with changes to headings, paragraphs, lists, and a formatted block. Switch between source and preview views and verify that each mode represents the same selected versions and changed regions without losing the reader's selected options.

**Acceptance Scenarios**:

1. **Given** a comparison is open in source view, **When** the reader selects Preview, **Then** the same older and newer revisions are shown as side-by-side document previews with changed regions identifiable.
2. **Given** a comparison is open in preview view, **When** the reader switches back to Source, **Then** the selected revision pair and the reader's whitespace, context, and linked-scrolling choices are retained.
3. **Given** linked scrolling is enabled in preview view, **When** the reader scrolls either preview, **Then** the other preview follows the corresponding changed or surrounding content position.

---

### Edge Cases

- A reader selects the same revision twice: comparison is unavailable until two distinct revisions are selected, with a clear explanation.
- A page has fewer than two visible revisions: the history page explains that a comparison cannot yet be made and does not show an unusable Compare action.
- A selected revision is no longer visible to the reader when a comparison link is opened: no source, preview, title, metadata, line count, or indication of that revision is revealed; the existing access outcome is shown instead.
- The revisions have no meaningful differences under the active whitespace setting: both versions remain identifiable and the comparison clearly reports that no differences match the current options.
- A document contains very large unchanged regions: they remain collapsed unless Full context is selected.
- The browser cannot finish calculating a comparison: the reader receives a non-technical error and can retry or change selections; no server-side comparison fallback is attempted.
- One selected revision cannot be rendered for preview: source view remains available, and preview reports the rendering issue without exposing unavailable content.

## Requirements *(mandatory)*

### Functional Requirements

- **FR-001**: The version history experience MUST let a reader select any two distinct revisions of the same page that the reader is permitted to view and open their comparison.
- **FR-002**: The comparison MUST have one canonical, navigable address that identifies the page and both selected revision versions. The address MUST restore the selected pair and every user-adjustable comparison option on refresh, browser back/forward, sharing, and direct load.
- **FR-003**: The comparison MUST order selected revisions chronologically, with the lower version on the left and the higher version on the right, and clearly label each selected version in both views.
- **FR-004**: Source view MUST present a side-by-side, line-oriented comparison with original source line numbers and visually distinguish unchanged, added, removed, and changed content.
- **FR-005**: Source view MUST align corresponding change regions across both panes and collapse unchanged material outside the active context. The default context is three unchanged lines before and after each change region.
- **FR-006**: Readers MUST be able to select zero or more surrounding unchanged lines and Full context. Full context MUST reveal the complete source of both selected revisions; any other setting MUST reveal only the requested context around change regions.
- **FR-007**: Readers MUST be able to enable or disable whitespace ignoring. When enabled, differences consisting solely of whitespace are excluded from the comparison result, but neither revision's displayed source is rewritten.
- **FR-008**: The two panes MUST support vertical linked scrolling, enabled by default, so scrolling either pane follows the corresponding comparison position in the other pane. Readers MUST be able to disable linked scrolling.
- **FR-009**: The comparison MUST provide Source and Preview modes. Preview mode MUST render the same two selected revisions side by side, make changed regions identifiable, and preserve the selected comparison options whenever meaningful in preview.
- **FR-010**: Switching between Source and Preview MUST preserve the selected revisions and all applicable reader choices. Switching views or changing options MUST not mutate a revision, create a revision, or change page publication state.
- **FR-011**: The comparison calculation, whitespace filtering, context selection, linked-scrolling coordination, and mode switching MUST run entirely in the reader's browser. The feature MUST NOT add a server-side comparison interface or invoke an existing server-side diff operation.
- **FR-012**: The feature MUST obtain only revision data already available to the authenticated reader through existing revision-reading behavior and MUST preserve existing page and revision visibility rules. It MUST NOT make inaccessible revision existence, content, metadata, or comparison statistics observable.
- **FR-013**: The history page and comparison view MUST provide clear, accessible controls and status messages for selecting revisions, opening a comparison, changing view/options, no-difference results, loading, and recoverable client-side errors without browser alert dialogs.
- **FR-014**: The feature MUST use the existing history page as the sole selection and comparison surface. Its canonical address is `/history/<path>?compare=<a>..<b>`; legacy revision-pair addresses redirect to it while existing single-revision addresses remain valid.

### Public Content Delivery

No published reader-page body, public metadata, or public navigation is changed. The comparison is an authenticated, reader-initiated history interaction that uses existing revision-reading behavior; it does not change the static or incrementally generated representation of published pages or its invalidation rules.

### Key Entities

- **Revision Pair**: Two distinct, visible revisions of one page selected for comparison, normalized into earlier and later order.
- **Comparison Options**: Reader-controlled view mode, whitespace treatment, unchanged-context amount, and linked-scrolling state that determine how a revision pair is presented.
- **Change Region**: A contiguous group of source differences with its surrounding unchanged context, represented in corresponding positions in both panes.
- **Comparison View**: The canonical, shareable presentation of one revision pair in Source or Preview mode; it is transient reader-side state and never changes the underlying revisions.

## Success Criteria *(mandatory)*

### Measurable Outcomes

- **SC-001**: In 100% of acceptance tests, a reader can select any two accessible revisions of the same page and restore the exact pair and options by reopening its comparison link.
- **SC-002**: For representative documents of up to 5,000 source lines per revision, 95% of comparisons become interactively usable within 1 second after both selected revisions are available in the browser.
- **SC-003**: In 100% of source-diff regression tests, line numbers, inserted/removed/changed regions, and the configured surrounding-context amount match the two selected revision sources.
- **SC-004**: In 100% of whitespace regression tests, whitespace-only edits are excluded when whitespace ignoring is enabled and substantive edits remain visible.
- **SC-005**: In 100% of linked-scrolling tests across multiple change regions, scrolling either pane moves the other pane to the corresponding location while linked scrolling is enabled; it does not move when disabled.
- **SC-006**: In 100% of Source/Preview switching tests, both modes retain the same revision pair and reader-selected options, and neither mode changes revision content or publication status.
- **SC-007**: In 100% of access-control regression tests, a reader cannot obtain or infer an inaccessible revision through selection, comparison links, source view, preview view, line counts, or comparison status.

## Assumptions

- Page revisions are text-based documents with original source and a reader-visible rendered representation under the existing revision and rendering behavior.
- The existing history and revision-reading experience already supplies the currently authorized reader with the data needed to view individual revisions; this feature reuses that behavior rather than extending the server contract.
- Three surrounding unchanged lines is the expected default. The context selector supports zero or more lines and a Full context option; its exact control presentation is a design decision.
- The canonical address follows the established revision-pair URL contract and encodes reader-adjustable presentation state without persisting personal settings or mutating page data.
- Preview is a comparison aid for the existing document rendering, not a visual-document-diff editor and not an alternative document authoring surface.

## Out of Scope

- Creating, modifying, publishing, restoring, merging, or deleting revisions from the comparison experience.
- Comparing revisions from different pages or different locales.
- Adding, changing, or calling a server-side diff API, background job, or default deployment service.
- Persisting per-user comparison preferences or comparison results.
