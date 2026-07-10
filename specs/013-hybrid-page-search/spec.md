# Feature Specification: Hybrid Page Search

**Feature Branch**: `013-hybrid-page-search`
**Created**: 2026-07-10
**Status**: Draft
**Input**: User description: "基于向量的页面检索的一个主要用途是基于关键字的搜索，需要把一个搜索框居中放header中，替代掉现在放的标题。用户点进搜索框之后，页面添加蒙板，用户输入的每一个字符（第二个字符开始）触发基于向量及关键字的的混合内容搜索，并列出命中的页面及命中的语料内容。用户点击页面直接打开。Ecs退出搜索功能。用户的搜索单独记录一个表，用于后续数据分析。用户对页面的点击及Esc退出需要单独记录在用户行为表中。注意已经有search API了，要扩展现有，不要又加一个新的API。"

## Summary

Replace the centered page title in the application header with a centered search box that lets people find wiki pages as they type. Opening the box enters a focused search mode with a page overlay. From the second entered character onward, each change refreshes a single ranked result list that combines literal keyword matches with meaning-based matches. Each result identifies the page and shows the matching content excerpt; choosing it opens that page immediately.

The feature also creates an analyzable record of each search and a separate record of the user's two explicit search decisions: opening a result and leaving search with Escape. It must extend the current page-search capability and its established contract rather than introduce another search API.

## User Scenarios & Testing *(mandatory)*

### User Story 1 - Find a page from the header (Priority: P1)

As a wiki reader, I want to search from the centered header field while staying on my current page, so that I can quickly navigate to relevant information without first visiting a separate search page.

**Why this priority**: Fast page discovery is the core user value; without it, neither mixed retrieval nor analytics is useful to a reader.

**Independent Test**: Open any readable wiki page, focus the centered header field, enter a two-or-more-character query, and verify that matching readable pages and matching excerpts appear. Select a result and verify that its page opens.

**Acceptance Scenarios**:

1. **Given** a reader is on a normal wiki page, **When** the header is displayed, **Then** a centered search field is shown in place of the centered page title while the site identity and existing navigation controls remain available.
2. **Given** the reader focuses the search field, **When** search mode opens, **Then** a visible overlay separates the search experience from the underlying page and the field receives keyboard input focus.
3. **Given** search mode is open and the query has fewer than two characters, **When** the reader types or deletes a character, **Then** no content search is performed and the result area gives a clear empty-query prompt rather than stale results.
4. **Given** search mode is open and the reader enters, changes, or pastes a query of two or more characters, **When** the input value changes, **Then** the displayed results refresh for the latest value and combine literal keyword relevance with meaning-based relevance.
5. **Given** the latest query matches a readable page by either literal wording or related meaning, **When** results are shown, **Then** each result shows the page title or path and a content excerpt that explains why it matched.
6. **Given** the reader selects a result, **When** the selection is activated, **Then** the selected page opens directly and search mode no longer obstructs it.

---

### User Story 2 - Leave search predictably (Priority: P2)

As a reader, I want Escape to leave the focused search mode, so that I can return to the page I was reading without selecting an unrelated result.

**Why this priority**: The overlay changes the user's immediate interaction context; a familiar keyboard exit makes it safe to explore and prevents the experience from feeling trapping.

**Independent Test**: Focus the header search on a page, enter a query, press Escape, and confirm the overlay and result list close while the original page remains open.

**Acceptance Scenarios**:

1. **Given** search mode is open, **When** the reader presses Escape, **Then** the overlay and results close, the query is cleared, and the reader remains on the page from which search was opened.
2. **Given** search mode is not open, **When** the reader presses Escape, **Then** this feature does not change the page or consume the key for unrelated controls.
3. **Given** a reader exits an active search with Escape, **When** the exit completes, **Then** one behavior record identifies it as an Escape exit and is associated with that search session.

---

### User Story 3 - Analyze search and selection behavior (Priority: P2)

As a product analyst, I want searches and the user's search decisions captured separately, so that I can measure what people seek, which results they choose, and how often they abandon a search without a selection.

**Why this priority**: Search quality cannot be improved responsibly without knowing both demand (queries) and outcome (selection or Escape exit).

**Independent Test**: Perform a search, select one result, then perform another search and press Escape. Verify one search record per submitted query value and one separate behavior record for each of the two explicit outcomes, with enough identifiers to link each outcome to its originating search.

**Acceptance Scenarios**:

1. **Given** a query has at least two characters and triggers a result refresh, **When** its search is accepted for processing, **Then** a search record is retained with the entered query, actor identity when available, timestamp, and summary information sufficient for later analysis.
2. **Given** a reader selects a page result, **When** navigation is initiated, **Then** one behavior record is retained with the action type, selected page, timestamp, and its originating search record.
3. **Given** a reader presses Escape in active search mode, **When** search closes, **Then** one behavior record is retained with the action type, timestamp, and its originating search record; it does not falsely identify a selected page.
4. **Given** the same query is refreshed repeatedly because the input changes, **When** records are inspected, **Then** each recorded search is distinguishable by time and session while its result-selection or Escape behavior remains attributable to the exact search that produced the visible results.

---

### User Story 4 - Keep search safe and compatible (Priority: P3)

As a wiki administrator, I want the new search experience to honor existing page visibility rules and extend the current search surface, so that it does not disclose restricted content or fragment integrations.

**Why this priority**: A more prominent search field makes accidental disclosure and incompatible search clients especially costly.

**Independent Test**: Search as a reader who cannot access a known restricted page, confirm that neither its existence nor excerpt is shown, then verify that a current client of the page-search capability still uses the expanded existing search contract rather than a newly introduced search endpoint.

**Acceptance Scenarios**:

1. **Given** a page is not readable by the current visitor, **When** its title, text, or semantic content would otherwise match, **Then** it is absent from results and no excerpt, score, count, or error reveals its existence.
2. **Given** meaning-based retrieval is available, **When** a query has both literal and related-meaning candidates, **Then** one consolidated result list is presented with duplicate pages merged rather than separate keyword and semantic lists.
3. **Given** the meaning-based index is temporarily unavailable, **When** a reader searches, **Then** the search remains usable through available literal matches and communicates that meaning-based matching is unavailable without exposing configuration details.
4. **Given** this feature is delivered, **When** a client requests page search, **Then** the current page-search API is extended to provide the hybrid result experience; no additional public search API is introduced for this feature.

### Edge Cases

- A query becomes shorter than two characters after results were visible: clear the visible results and do not leave results from the prior value on screen.
- Input changes quickly while earlier searches are still in progress: only results for the current query may be shown or selected.
- A page matches both retrieval methods: show it once and select the most useful available excerpt.
- No readable page matches: show a clear no-results state and retain the search record with a zero-result summary.
- The search field is opened on a page that is subsequently navigated away from by another control: the overlay must not remain stranded over the destination.
- The visitor is anonymous or their identity cannot be resolved: search and behavior records remain analysable without inventing an account identity.
- Recording a search or behavior event fails: page search, Escape exit, and result navigation must still remain usable; the failure must be observable to operators without displaying sensitive internal details to the reader.
- A result becomes unavailable between display and selection: do not open protected content; show the normal unavailable outcome and record no successful page selection.

## Requirements *(mandatory)*

### Functional Requirements

- **FR-001**: The application MUST replace the centered header page title with a centered, keyboard-accessible search field on pages using the standard application header.
- **FR-002**: The search field MUST preserve the existing site identity, menu, page actions, and account controls in the header without allowing the centered field to obscure or overlap them at supported viewport sizes.
- **FR-003**: Focusing the field MUST enter a search mode that presents a visible page overlay, keeps the search control focused, and makes the result area accessible to keyboard and assistive-technology users.
- **FR-004**: Search mode MUST not execute a content search until the query contains at least two characters.
- **FR-005**: Starting with the second character, every distinct input value MUST initiate a search for that current value, including values created by typing, deletion, replacement, or paste.
- **FR-006**: The expanded existing page-search capability MUST combine literal keyword retrieval and meaning-based retrieval into one ranked, de-duplicated result set; it MUST NOT introduce another public search API for this feature.
- **FR-007**: Each result MUST identify one readable page and present a relevant content excerpt. A result matching both retrieval methods MUST appear only once.
- **FR-008**: Only results for the current input value MAY be displayed or acted on; delayed, failed, or superseded searches MUST NOT overwrite newer results.
- **FR-009**: Selecting a displayed result MUST open its target page directly and close the search experience.
- **FR-010**: Pressing Escape while search mode is active MUST close the overlay, clear its active query and results, and leave the reader on the previously open page.
- **FR-011**: The feature MUST retain each processed search in a dedicated search-record data set containing the query text, search-session identifier, timestamp, actor identifier when available, and a non-content summary of the outcome such as result count and retrieval availability.
- **FR-012**: The feature MUST retain result selection and Escape exit in a separate user-behavior data set. Every behavior record MUST contain its action type, timestamp, originating search-record identifier, actor identifier when available, and the selected page identifier only for result-selection actions.
- **FR-013**: Search and behavior records MUST be linkable for analysis while avoiding full result payloads or page-content excerpts in the recorded data unless separately required by a future retention policy.
- **FR-014**: The same user action MUST result in at most one corresponding behavior record; repeated rendering, delayed navigation, and repeated Escape key events MUST NOT create duplicate selection or Escape records.
- **FR-015**: Hybrid search MUST enforce the same read-visibility rules as existing page access before results or excerpts are returned. It MUST not reveal inaccessible page content, metadata, or existence.
- **FR-016**: If meaning-based retrieval is unavailable or fails, the feature MUST return any eligible literal keyword results and clearly indicate reduced search coverage without exposing internal configuration, provider, or index details.
- **FR-017**: Failures to persist analytics records MUST NOT block a reader from seeing results, opening a result, or exiting with Escape; they MUST be captured for operational diagnosis.
- **FR-018**: All new reader-facing search text, status states, instructions, and error states MUST be localizable consistently with the existing application interface.

### Key Entities

- **Search Record**: One processed query associated with a search session; captures the query, time, actor when known, outcome summary, and the availability of each retrieval contribution without storing page-content results.
- **User Behavior Record**: One explicit search outcome—either a result selection or Escape exit—linked to its search record, actor when known, time, and selected page when applicable.
- **Hybrid Search Result**: One readable page returned for the active query, with a page identity, display label, relevant excerpt, and combined relevance suitable for a single ordered list.
- **Search Session**: The bounded interaction beginning when a reader enters search mode and ending when they select a result, leave with Escape, or depart the current page; used to associate successive searches and user behaviors.

## Success Criteria *(mandatory)*

### Measurable Outcomes

- **SC-001**: In usability verification, at least 95% of readers can open header search, locate a known relevant page, and open it without visiting a separate search page.
- **SC-002**: For 95% of two-or-more-character queries under normal operating conditions, updated results are visible within 1.5 seconds after the latest input change.
- **SC-003**: In a representative evaluation set containing literal-only, meaning-only, and overlapping matches, at least 90% of queries show a relevant readable page in the first five results whenever one exists.
- **SC-004**: 100% of result selections and Escape exits exercised in automated acceptance tests produce exactly one corresponding behavior record linked to the originating search record.
- **SC-005**: 100% of automated restricted-content test cases return neither the inaccessible page nor a content excerpt or metadata that identifies it.
- **SC-006**: When meaning-based retrieval is unavailable, 100% of tested literal matches continue to be discoverable and readers receive an understandable reduced-coverage state.
- **SC-007**: At least 99% of tested rapid-input sequences display results only for the final query value, with no stale result selectable after a newer value is entered.

## Assumptions

- The centered header title is the existing page or route title; replacing it affects the standard application shell, while the site name and controls at the header edges remain unchanged.
- The two-character threshold counts visible query characters after normal input trimming; whitespace-only input does not qualify as a query.
- Hybrid retrieval uses a single merged ranking. The exact weighting, candidate depth, and visual score display are planning decisions, provided the result quality and de-duplication requirements are met.
- The existing page-search contract is the sole public search surface to expand. Internal persistence for records and behaviors may be introduced as needed, but it does not constitute a second public search API.
- Visitors who are not signed in can use search when they can read public pages. Their records have no fabricated user identity; a privacy-preserving session or anonymous marker may associate their interactions.
- Search records retain the query because the feature explicitly supports later search analysis. Access, retention duration, deletion, and aggregation policies follow the product's established privacy and data-governance rules and are not changed by this feature.
- Result activation is any normal accessible selection method, including pointer and keyboard activation. Escape is tracked only when it closes active search mode.

## Out of Scope

- A standalone search-results page, advanced search filters, saved searches, search suggestions, and search-history UI.
- Changes to page authoring, page permissions, or the existing page visibility model.
- A user-facing analytics dashboard, export, or administrator reporting workflow for the new records.
- Capturing other interactions such as typing cadence, pointer movement, overlay clicks, or result impressions.
- Introducing a new public search API or replacing existing client integrations with a different search endpoint.
